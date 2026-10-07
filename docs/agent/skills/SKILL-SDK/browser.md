> _**SDK skill · `browser` namespace** · ~24,178 tokens · hoody-sdk v1.0.0-beta.16_

# `browser` — Per-container Chromium or Firefox instances, one per slot

## Purpose

- Long-lived browser instances per container, one per `browser-X` hostname slot (the proxy maps slot X to `browser_port` 30000+X and `display` 500+X).
- Chromium runs the stealth engine by default (`stealth` defaults to `true`; metadata reports `engine: patchright`). `stealth=false` selects the standard engine (`engine: playwright`). Firefox always runs the standard engine.
- Surfaces: nav, screenshot, JS eval, PDF, HTML/text, cookies, console+network logs, history, CDP, accessibility snapshot with element refs, element actions, waits, runtime viewport.

## When to use

- JS-heavy pages, screenshots, PDFs.
- Authenticated sessions across navs.
- Anti-fingerprint via `stealth=true`.
- Console/network capture.
- Dedicated recorded "project browser" the user can watch live and you can inspect anytime (workflow 6).
- Clicking, typing and waiting on page elements without writing JS (workflow 7).
- External CDP on Chromium through the URL that `instances.getDevtoolsUrls` returns (on by default; `useRemoteDebuggingPort=false` turns it off; Firefox never exposes it).

## When NOT to use

- Plain HTTP, persistence, server scripts, stream UI, shell → `curl`/`sqlite`/`exec`/`display`/`terminal`.

## Prerequisites

- Headful (default `showBrowser=true`) needs X display: `?display=` or `DISPLAY`. Extensions also require `showBrowser=true`.
- `page.exportPdf` works only on a headless Chromium instance: start it with `showBrowser=false`. Firefox and headful instances return `501 NOT_SUPPORTED`. 

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

## Common workflows

### 1. Start + navigate
1. `instances.start` on the slot's hostname + overrides (proxy, stealth, fingerprintId, viewport, locale, timezoneId, userAgent, geolocation).
2. `page.navigate` — `tabId`, `onlyIfNotExists=true`. 
3. `instances.get`.

### 2. Extract content
After browse: `getHtml`/`getText`/`page.captureScreenshot`/`exportPdf` — params in Reference. `exportPdf` needs a headless Chromium instance (see Prerequisites).

### 3. Authenticated scraping
1. `instances.start` matching `userAgent`/`viewport`/`locale`.
2. `cookies.setMany` with a `cookies` list of `{name, value, url}` entries; each cookie needs `name`, `value` and either an absolute http(s) `url` or both `domain` and `path` (never `url` together with `domain` or `path`). 
3. `page.navigate` to protected URL.
4. `page.getHtml`/`getText`.
5. `cookies.clear`.

### 4. JS eval + logs
1. `instances.start` → `page.navigate`.
2. `page.evaluate` (`{script}` JSON body). On the default stealth engine the script cannot see page JS globals (see Quirks).
3. `logs.listConsole` (`since`,`type`,`clear=true`).
4. `logs.listNetwork`.

### 5. History
`history.list` (filters: `since`/`domain`/`browser_id`) and `history.clear` (`before` + `browser_id` AND). In history, `browser_id` is the slot number X the navigation ran on.

### 6. Dedicated project browser — suggest it to the user
When the work is a website project or business research, **offer** the user a dedicated recorded browser. This is a suggestion to the user only — set it up when they ask, don't spin it up unprompted.
1. Pick a slot number X (e.g. 2) and start headful on that slot: `instances.start` addressed to the `browser-X` hostname (`{ serviceIndex: X }` as the last, template-vars argument) with `showBrowser=true`. The proxy derives `browser_port` 30000+X and `display` 500+X from the hostname and overrides any values you send. Add any per-project identity: own egress proxy (`proxyServer`/`proxyUsername`/`proxyPassword`/`proxyBypass`), `stealth`, `userAgent`, `viewport`, `locale`, `geolocation`, extensions.
2. Give the user the direct live-view URL — the standard kit URL with the `browser-` slug and `?view=display`: `https://{P}-{C}-browser-X.{N}.containers.hoody.com/?view=display`. That page embeds display 500+X live (the bare root URL shows an instance status page with a View Display link instead), so an instance started on display 500+X gets its own stable viewing URL — changing the X in the URL is how you address each browser's live window. `instances.getDevtoolsUrls` adds a live DevTools inspector as a second link; that link gives full control of the browser, so hand it only to someone you would give the browser to.
3. Everything browsed there — by the user clicking around in the live view or by the agent via the API — lands in persistent per-slot history (`history.list` with `browser_id=X`): live debugging and business research accumulate into one durable project trail. The instance itself is reaped once it has been idle past the deployment's max age (see Quirks) — history survives; re-run `instances.start` with the same options to revive the window.
4. Then offer log capture as a follow-up: console/network buffers hold only the last 500 entries and die with the instance, so a recurring `cron` job (or agent loop) draining `logs.listConsole`/`logs.listNetwork` with `clear=true` into `sqlite`/`files`/agent memory preserves full context for later sessions.

### 7. Drive a page: snapshot, act, wait
These three operations never start an instance (404 `NOT_FOUND` on an empty slot), so run `instances.start` and `page.navigate` first.
1. `instances.get` and keep `instanceGeneration`. Passing it back on the calls below turns "the instance was replaced" into a 409 `INSTANCE_CHANGED` instead of acting on a fresh browser.
2. `page.getSnapshot` returns the tab's accessibility tree as YAML with `[ref=eN]` markers, plus a `snapshotId`. Entered form values read as `<value hidden>` unless `includeValues=true`.
3. `page.act` with `action` (one of `click | fill | type | press | select | check | hover`) and a `target`: either `{ref, snapshotId}` from the latest snapshot, or exactly one of `selector`, `role` (+ `name`), `label`, `text`, `placeholder`, `testId`. A 200 means the browser operation completed, not that the site accepted it.
4. `page.wait` with a condition (`kind`: `target`, `text`, `url` or `loadState`) to observe the result. A miss is 504 `TIMEOUT`, never `matched: false`.
5. Take a new snapshot before using refs again: a newer snapshot or a main-frame navigation invalidates the old refs (409 `STALE_SNAPSHOT`).
`viewport.get`/`viewport.set` read and change the viewport of a running instance without a restart.

## Quirks & gotchas

- The `browser-X` hostname selects the instance: the proxy derives `browser_port` 30000+X and `display` 500+X from it and overrides caller-supplied values. A `browser_id` (or another instance selector in the query or JSON body) that names a different instance is refused with 400 `INSTANCE_SELECTOR_CONFLICT`, `details.field` naming it, and nothing runs: leave it out or call that instance's own host. In the SDK, a `browser_id` option picks the `browser-X` host itself, unless a `serviceIndex` in the template-vars argument is given, which wins (a `browser_id` that then names another instance is refused as above). Choose the slot by passing `{ serviceIndex: X }` as the last, template-vars argument, e.g. `page.navigate({ url }, {}, { serviceIndex: 2 })` (default 1). On history, `browser_id` also filters, equal to X.
- Endpoints auto-create unless `start=false`. Where a deployment disables auto-start, only an explicit `start=true` creates an instance. `getSnapshot`, `page.act` and `page.wait` never create one.
- `stealth` defaults true; bare `?stealth`=true. Mid-flight change throws `Instance backend mismatch` — `stop` first.
- `stealth=true` is ignored on Firefox: the stealth engine is Chromium-only.
- Extensions need `showBrowser=true` and run on a persistent profile.
- `chromiumVersion`: full / major / channel (`stable|beta|dev|canary`); first new version blocks on download.
- Console/network logs: 500-entry ring buffers — drain or filter `since`.
- **A sweep runs every 5 min and SIGTERMs any instance idle for 1 h (deployment defaults), healthy or not.** The idle clock is restarted by real use: every API request routed to the instance (counted from the END of the request), a top-level page navigation (including a person clicking around in the live view), attaching over CDP, and starting an instance that already exists. An instance with a request in flight or an open CDP connection is never reaped. The instance's own heartbeat is liveness only and does NOT keep it alive, so an instance you want to keep (logged-in cookies, session state) needs a request at least once per idle window. A reaped instance's next call starts a fresh one, with none of the cookies or session state the old one held; recorded history survives.
- Instances do NOT survive kit-process restarts: graceful shutdown (SIGTERM/SIGINT) terminates every child.
- History records ALL navs (incl. headful clicks) at `/hoody/storage/hoody-browser/history`, retained 30 d by default. Where a deployment turns history off, the history endpoints answer `404 HISTORY_DISABLED`.
- **`history.clear` is scoped by the host:** through a `browser-N` host it clears only instance N's history (add `before` to keep newer entries); a `browser_id` naming another instance is refused with 400 `INSTANCE_SELECTOR_CONFLICT`. To clear several instances, call it on each instance's host.
- `browser_id` history filter sanitised as path component.
- **On the default stealth engine (`stealth=true`, `engine: patchright`), `eval` runs the script in an isolated JavaScript world.** It sees the DOM, but not the globals the page's own scripts define (`window.__NEXT_DATA__`, SPA stores, config objects): those read as `undefined` and the call still returns 200. On `stealth=false` (`engine: playwright`) the script runs in the page's main world. To read page JS state, start the slot with `stealth=false`, or read what the page wrote into the DOM (for example the text of `<script id="__NEXT_DATA__">`).
- `eval` POST accepts JSON `{"script":"..."}` (what the SDK and CLI send) or a `Content-Type: text/plain` body holding the raw script. The response is `{ "result": ... }`.
- **A ref-addressed `page.act` that navigates the page itself (a link click, a submit, a `pushState`) can answer `409 STALE_SNAPSHOT` with `details.outcome: "unknown"` after the action already ran.** `outcome` is `not-started` (never dispatched, safe to repeat), `unknown` (dispatched, result not observed) or `completed`. On `unknown`, check the page (`page.wait`, a new snapshot, the URL) before repeating a click or submit. Selector, role, label, text, placeholder and testId targets are not affected.
- Chromium CDP defaults to `useRemoteDebuggingPort=true`; pass `useRemoteDebuggingPort=false` at start to turn it off. `instances.getDevtoolsUrls` answers 404 only when the instance is missing; with CDP off it returns 200 with null URLs. Use the URLs `instances.getDevtoolsUrls` returns rather than building one. By default the returned URLs are on the `cdp-X` relay host paired 1:1 with `browser-X` (`https://{P}-{C}-cdp-X.{N}.containers.hoody.com/`); a deployment that turns the relay URLs off returns the legacy `http-<port>` host instead, where `<port>` is the debugging port. Point a CDP client at the returned URL (for example `connectOverCDP("https://{P}-{C}-cdp-X.{N}.containers.hoody.com/")`). The rest of this bullet describes the `cdp-X` relay. A discovery request (`/`, `/json`, `/json/list`, `/json/version`) may cold-start Chromium instance X when it is not running: only when cold start is enabled (the default; a deployment can turn it off) and the request does not come from a web page, which gets `403 CDP_CSRF_COLD_START` instead. A DevTools WebSocket only attaches to a running instance. Only read-only endpoints (the discovery paths, `/json/protocol`, the `/devtools/` front end) and DevTools WebSocket sessions are relayed; `/json/new`, `/json/activate` and `/json/close` return 404. Treat the `cdp-X` URL like a credential: anyone who can reach it controls the browser (navigate, run script, read cookies and page content), so start with `useRemoteDebuggingPort=false` when the container is shared.
- Launch options: the `viewport` and `geolocation` query parameters are **JSON strings**, not free-form `"WxH"` / `"lat,lng"`; the kit `JSON.parse`s a string value and rejects one that does not parse. In a JSON request body the same fields may also be plain objects. Examples: `viewport='{"width":1280,"height":800}'`, `geolocation='{"latitude":48.8,"longitude":2.3,"accuracy":50}'`. A launch `viewport` of `null` or `none` turns off fixed-viewport emulation. The runtime `viewport.set` is different: its body is an object, `{"viewport":{"width":1280,"height":800}}` or `{"viewport":null}` (integers 1–8192); a string there is a 400 `VALIDATION_ERROR`.
- `viewport.set` takes `{viewport:{width, height}}` (1-8192 px) or `{viewport:null}` for responsive. Responsive works only on Chromium (`501 NOT_SUPPORTED`) and only on an instance started responsive (`409 REQUIRES_RESTART`: stop it and start it again with `viewport=null`). `502 VIEWPORT_APPLY_INCOMPLETE` means the policy was kept but some tabs did not apply it (`details.failedTabs`). `viewport.get` never starts an instance.
- Screenshot `format` enum is `png | jpeg | base64` (NO `json`). Base64 mode returns `{ data: "<b64>" }` only — there is NO `mimeType` or `dataUrl` in the response (the kit's JSON body has `data` only).

## Common errors

- `VALIDATION_ERROR` 400 — malformed `viewport`/`geolocation`, history `limit` not 1–500, `offset`<0.
- `NOT_FOUND` 404 `Instance not found` — `stop`, `shutdown`, `instances.getDevtoolsUrls`, `start=false` no instance; also `getSnapshot`/`page.act`/`page.wait` on an empty slot, since they never auto-start.
- `HISTORY_DISABLED` 404 `History is disabled` — history endpoints where the deployment turned history off.
- `INSTANCE_BACKEND_MISMATCH` 409 (message starts `Instance backend mismatch`) — `stealth` differs from the running instance's backend; `stop` then `start`.
- `VALIDATION_ERROR` 400 `display is required when showBrowser=true (no DISPLAY detected)` — `showBrowser=true` with no `display` field on `instances.start` and no `$DISPLAY` env.
- `TIMEOUT` 408 / 504 — the request passed the kit's request deadline (600 s by default). While the request is launching or restarting the instance this is a 504 with `details.phase: "launch"` and `details.outcome: "unknown"`: the instance may still come up, so check `instances.get` with `start=false` before retrying. After the request was forwarded to a running instance it is a 504 with `details.phase: "proxy"` and `details.outcome: "unknown"`: the call may already have taken effect (a `viewport.set` included), so inspect the state before repeating a mutation. A request that times out before either is a 408.
- `TIMEOUT` 504 — an automation call (`getSnapshot`, `page.act`, `page.wait`) spent its `timeoutMs` budget (default 10000, max 30000). `details.phase` says where; `details.outcome` `not-started` means the action was never dispatched. For `page.wait` this is how a condition that never held is reported.
- `STALE_SNAPSHOT` 409 — the ref's snapshot is no longer the tab's latest, or the main frame navigated; take a new snapshot. Read `details.outcome` before repeating an action (see Quirks).
- `INSTANCE_CHANGED` 409 — the `instanceGeneration` sent no longer matches the running instance (`details.expected` is null when no instance exists); re-read `instances.get`.
- `TAB_BUSY` 409 — another `page.act`, `getSnapshot` or `navigate` is in flight on that tab (`details.op` names it); wait for it.
- `AMBIGUOUS_TARGET` 409 — the target matched more than one element; narrow it or use a ref.
- `TAB_NOT_FOUND` 404 — no tab with that `tabId`; `details.openTabs` lists the open ones.
- `INSTANCE_QUARANTINED` 502 — the slot's previous browser process has not been confirmed exited, so no new instance can start there yet; retry later.
- `SHUTTING_DOWN` 503 — the kit is shutting down.
- `METHOD_NOT_ALLOWED` 405 — only GET/POST/DELETE/PUT/PATCH.

## Related namespaces

- `display` — headful renders into `display-{n}`; the `?view=display` page iframes it.
- `terminal` — helper CLIs.
- `curl` — JS-free HTTP.
- `files` — pull artefacts out.
- `sqlite` — persist scraped data.
- `exec` — server post-processing.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first. ⚠ The `browser-X` hostname selects the instance; a `browser_id` or `browser_port` that names another instance is refused with 400 `INSTANCE_SELECTOR_CONFLICT` (the SDK's `browser_id` option picks the host instead) (see the Quirks gotcha). Examples 1–5 and 8–9 use slot 1 (`browser-1`, the SDK default); Examples 6 and 7 use slots 2 and 3 so their different launch options do not collide with slot 1's running instance.

### 1. Spin up a headless instance and navigate to a URL

**Goal:** boot a Chromium instance, point it at a page, confirm it's alive. Headless avoids the X-display dependency (`showBrowser=false`).

**Step 1 — start.** Returns the start-response payload (`engine`, `headless`, `chromiumBuildId`, `browser_host`, `browser_port`). `instances.start` is idempotent — calling it again on the same slot returns the existing instance and ignores new options (a different `stealth` value is rejected with `409`).

```typescript
const meta = await client.browser.instances.start({
  showBrowser: false,
  stealth: false,
});
console.log(meta.data!.engine, meta.data!.headless, meta.data!.chromiumBuildId);
```

**Step 2 — navigate.** `page.navigate` opens or reuses a tab and waits for load.

```typescript
await client.browser.page.navigate({
  url: 'https://httpbin.org/html',
});
```

### 2. Full-page PNG screenshot

**Goal:** capture the entire scrolled height (not just the viewport). `format=base64` returns `{ data: "<b64>" }`; the default `format=png` returns raw `image/png` bytes.

```typescript
import { writeFileSync } from 'fs';
const r = await client.browser.page.captureScreenshot({
  fullPage: true,
  format: 'base64',
  url: 'https://httpbin.org/html',
});
const b64 = (r.data as any).data as string; // kit returns { data: "<b64>" }; the client wraps it
writeFileSync('/tmp/page.png', Buffer.from(b64, 'base64'));
```

### 3. Get the page HTML and the rendered text

**Goal:** read the post-JS DOM (HTML) and the visible text the user would see (`page.getText` returns the `innerText` of `body`).

```typescript
const html = await client.browser.page.getHtml();
const text = await client.browser.page.getText();
console.log(String(html.data).slice(0, 200), '\n---\n', String(text.data).slice(0, 200));
```

### 4. Execute JavaScript in the page and capture the return value

**Goal:** run a script in the page context. Over HTTP, `GET /eval?script=` puts the script in the query (size-bound by URL). `page.evaluate` accepts `{ script }` JSON via the SDK / CLI / `Content-Type: application/json`; raw `Content-Type: text/plain` HTTP also works (body = script source). Either shape returns `{ result }`. The script reads the DOM on every engine; page JS globals (`window.__NEXT_DATA__`, app stores) are visible only on a `stealth=false` instance, and read as `undefined` on the default stealth engine (see Quirks).

```typescript
const t = await client.browser.page.evaluate({ script: 'document.title' });
const r = await client.browser.page.evaluate(
  { script: 'JSON.stringify({title: document.title, links: document.querySelectorAll("a").length})' },
);
console.log(t.data, r.data);
```

### 5. Set cookies and read them back

**Goal:** prime the cookie jar, then verify. POST body is a JSON object `{ cookies: [...] }` whose entries need `name`, `value`, and either an absolute http(s) `url` or both `domain` and `path`; do not combine `url` with `domain` or `path` (400 `VALIDATION_ERROR` naming the field). Optional: `httpOnly`, `secure`, `sameSite` (`Strict|Lax|None`), `expires` (Unix seconds, -1 = session).

```typescript
await client.browser.cookies.setMany({
  cookies: [
    { name: 'session', value: 'abc123', url: 'https://httpbin.org' },
    { name: 'theme',   value: 'dark',   url: 'https://httpbin.org' },
  ],
});
const jar = await client.browser.cookies.list({ url: 'https://httpbin.org' });
console.log(jar.data!.cookies);
```

### 6. Authenticated scrape — set session cookie, browse, extract, clear

**Goal:** scrape a logged-in page without re-doing OAuth. Pre-load the session cookie a real login would have set, hit the protected URL, read text, then DELETE the jar.

```typescript
const slot = { serviceIndex: 2 }; // _templateVars: routes every call to browser-2
await client.browser.instances.start({ showBrowser: false, stealth: false }, slot);
await client.browser.cookies.setMany(
  { cookies: [{ name: 'sessionid', value: 'REAL_TOKEN', url: 'https://app.example.com' }] },
  undefined, slot,
);
await client.browser.page.navigate({ url: 'https://app.example.com/dashboard' }, undefined, slot);
const t = await client.browser.page.getText(undefined, slot);
await client.browser.cookies.clear(undefined, slot);
```

### 7. `page.navigate` with explicit viewport, locale, and User-Agent

**Goal:** mimic a French mobile Safari to test geo/UA-gated content. Browser-context settings (`viewport`, `locale`, `timezoneId`, `userAgent`) are set at `instances.start`; `page.navigate` carries the navigation body.

`viewport` is a JSON string such as `'{"width":390,"height":844}'`. `geolocation` is a JSON string such as `'{"latitude":48.8566,"longitude":2.3522,"accuracy":20}'`.

```typescript
const slot = { serviceIndex: 3 }; // _templateVars: routes every call to browser-3
await client.browser.instances.start({
  showBrowser: false, stealth: true,
  viewport: '{"width":390,"height":844}', locale: 'fr-FR', timezoneId: 'Europe/Paris',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  geolocation: '{"latitude":48.8566,"longitude":2.3522,"accuracy":20}',
}, slot);
await client.browser.page.navigate(
  { url: 'https://httpbin.org/headers', active: true, onlyIfNotExists: false },
  undefined, slot,
);
const t = await client.browser.page.getText(undefined, slot);
```

### 8. Inspect browsing history (filter by domain, then drop one host)

**Goal:** the kit records every navigation under `/hoody/storage/hoody-browser/history` (30-day retention, 500-entry pagination cap). Query, then selectively delete.

```typescript
const since = new Date(Date.now() - 3600_000).toISOString();
const recent = await client.browser.history.list({ since, limit: 50 });
console.log(recent.data!.total, recent.data!.has_more);
const before = new Date(Date.now() - 7 * 86400_000).toISOString();
await client.browser.history.clear({ before, browser_id: '1' }); // slot 1's entries
```

### 9. Capture instance metadata (engine, viewport, debug URL)

**Goal:** introspect what the kit actually launched — engine (`playwright`/`patchright`), Chromium build, executable path, current display, debug socket. Use `start=false` to query *without* auto-starting (404 if no instance exists).

```typescript
const meta = await client.browser.instances.get({ start: false });
const tabs = await client.browser.tabs.list({ start: false });
console.log(meta.data!.engine, meta.data!.chromiumBuildId, tabs.data);
```

For an external CDP attachment, `instances.getDevtoolsUrls` returns the live `webSocketDebuggerUrl` (CDP is on by default; default `useRemoteDebuggingPort=true`). If you started with `useRemoteDebuggingPort=false`, the call still returns 200 but `webSocketDebuggerUrl` is null. A 404 `Instance not found` means no instance exists at all (e.g. queried with `start=false`).

### 10. Stop and shutdown — the ONLY safe ending

**Goal:** browser instances stay alive across requests until they are stopped or the kit process restarts (graceful kit restart SIGTERMs every child — see Quirks & gotchas). The idle sweep reaps an instance nobody has used for the max age (1 h by default), so a forgotten instance is eventually reclaimed, and one you still need must see a request at least once per idle window. Each slot has a fixed port, so a slot whose previous process has not been confirmed exited answers `502 INSTANCE_QUARANTINED` until it has; retry later rather than restarting the container.

`instances.stop` and `instances.shutdown` both terminate the child and delete its profile dir (the child's SIGTERM handler runs the same cleanup as `/shutdown`). Every Chromium instance runs on a persistent profile of its own, with or without extensions (an extension profile under the kit's browser data dir, otherwise under the temp dir), and every exit removes it, so cookies and logins do not carry over to the next instance. One `instances.stop` per instance is a complete teardown — calling both is redundant.

```typescript
for (const serviceIndex of [1, 2, 3]) {
  try { await client.browser.instances.stop(undefined, { serviceIndex }); } catch {}
}
const m = await client.browser.kit.getStats();
console.log(m.data!.instances);
```

A `404 Instance not found` from `stop` means it was already gone — safe to ignore. Neither `instances.stop` nor `instances.shutdown` creates an instance: on an empty slot both answer `404 Instance not found`. `instances.stop` terminates the child before it answers; `instances.shutdown` answers 200 as soon as shutdown starts and finishes in the background, so poll `instances.get` with `start=false` until it answers 404 to confirm the instance is gone.

## Reference

**Accessor:** `client.browser`  |  **Import:** `import * as browser from 'hoody-sdk/browser'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, containerId?, serviceIndex?, server? }`, which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are refused) and `cache` (a GET's response cache: `true`, a TTL in ms, or `false` to bypass) (no `_realm`: that one is control-plane only). When the signature shows an options object, the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself is complete as written: the object after it takes the transport options too.

### `client.browser.cookies` (3) — Browser State

#### `clear` — Clear all cookies

```typescript
client.browser.cookies.clear(options?: { browser_id?: string; start?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | No | Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `start` | `boolean` | query | No | Controls instance creation behavior. Default mode: instances are created automatically. Set to `false` to prevent creation. When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `browser.instances.getDevtoolsUrls` is the exception: it answers 404 when no instance is running and never consults this value. |

**Returns:** `Promise<BrowserCookiesClearResponse>`  |  **HTTP:** `DELETE /cookies`
**CLI:** `hoody browser cookies clear`

---

#### `list` — Get cookies

```typescript
client.browser.cookies.list(options?: { browser_id?: string; start?: boolean; url?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | No | Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `start` | `boolean` | query | No | Controls instance creation behavior. Default mode: instances are created automatically. Set to `false` to prevent creation. When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `browser.instances.getDevtoolsUrls` is the exception: it answers 404 when no instance is running and never consults this value. |
| `url` | `string` | query | No | Filter cookies by URL Repeating this key in the query string is a `400 VALIDATION_ERROR` (`url must not be repeated`): the parent's rule is on the key, not on the operation, so it applies here too even though this parameter is declared inline rather than shared. |

**Returns:** `Promise<BrowserCookiesListResponse>`  |  **HTTP:** `GET /cookies`
**CLI:** `hoody browser cookies list`

---

#### `setMany` — Set cookies

```typescript
client.browser.cookies.setMany(data: BrowserCookiesSetManyRequest, options?: { browser_id?: string; start?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | No | Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `start` | `boolean` | query | No | Controls instance creation behavior. Default mode: instances are created automatically. Set to `false` to prevent creation. When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `browser.instances.getDevtoolsUrls` is the exception: it answers 404 when no instance is running and never consults this value. |
| `data` | `BrowserCookiesSetManyRequest` | body | Yes |  |

**Body:** `{ cookies*: { name*: string, value*: string, url: string, domain: string, path: string, expires: number, httpOnly: bool, secure: bool, sameSite: "Strict" | "Lax" | "None" }[] }`

**Returns:** `Promise<BrowserCookiesSetManyResponse>`  |  **HTTP:** `POST /cookies`
**CLI:** `hoody browser cookies batch set`

---

### `client.browser.history` (2) — Operations for querying and managing persistent browsing history

#### `clear` — Delete browsing history

```typescript
client.browser.history.clear(options?: { before?: string; browser_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `before` | `string` | query | No | Delete entries before this ISO 8601 timestamp |
| `browser_id` | `string` | query | No | Delete entries for specific browser ID only. Through a `browser-{N}` service hostname it may only be `N` (the default there). |

**Returns:** `Promise<BrowserHistoryClearResponse>`  |  **HTTP:** `DELETE /history`
**CLI:** `hoody browser history clear`

---

#### `list` — Query browsing history

```typescript
client.browser.history.list(options?: { since?: string; domain?: string; browser_id?: string; limit?: number; offset?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `since` | `string` | query | No | Return entries after this ISO 8601 timestamp |
| `domain` | `string` | query | No | Filter by domain (exact match) |
| `browser_id` | `string` | query | No | Filter by browser ID. Through a `browser-{N}` service hostname it may only be `N` (the default there). |
| `limit` | `number` | query | No | Maximum entries to return (1-500) |
| `offset` | `number` | query | No | Number of entries to skip for pagination |

**Returns:** `Promise<BrowserHistoryListResponse>`  |  **HTTP:** `GET /history`
**CLI:** `hoody browser history list`

---

### `client.browser.instances` (6) — Operations for inspecting and controlling browser instances

#### `get` — Get instance metadata

```typescript
client.browser.instances.get(options?: { browser_id?: string; start?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | No | Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `start` | `boolean` | query | No | Controls instance creation behavior. Default mode: instances are created automatically. Set to `false` to prevent creation. When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `browser.instances.getDevtoolsUrls` is the exception: it answers 404 when no instance is running and never consults this value. |

**Returns:** `Promise<BrowserInstancesGetResponse>`  |  **HTTP:** `GET /metadata`
**CLI:** `hoody browser get`

---

#### `getDevtoolsUrls` — Get DevTools URLs

```typescript
client.browser.instances.getDevtoolsUrls(options?: { browser_id?: string; start?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | No | Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `start` | `boolean` | query | No | Controls instance creation behavior. Default mode: instances are created automatically. Set to `false` to prevent creation. When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `browser.instances.getDevtoolsUrls` is the exception: it answers 404 when no instance is running and never consults this value. |

**Returns:** `Promise<BrowserInstancesGetDevtoolsUrlsResponse>`  |  **HTTP:** `GET /devtools-url`
**CLI:** `hoody browser devtools urls get`

---

#### `restart` — Restart browser instance

```typescript
client.browser.instances.restart(options?: { browser_id?: string; start?: boolean; chromiumVersion?: string; fingerprintId?: string; useRemoteDebuggingPort?: boolean; remoteDebuggingPort?: number; remoteDebuggingAddress?: string; extensions?: string; extensionsDir?: string; extensionsStoreIds?: string; proxyServer?: string; proxyUsername?: string; proxyPassword?: string; proxyBypass?: string; enableQuic?: boolean; enableDnsOverHttps?: boolean; dnsOverHttpsUrl?: string; display?: number | string; showBrowser?: boolean; sessionName?: string; timezoneId?: string; locale?: string; userAgent?: string; viewport?: Viewport; noViewport?: boolean; geolocation?: Geolocation; launchArguments?: string[]; browser?: "chromium" | "firefox"; firefoxVersion?: string; firefoxExecutablePath?: string; showDevtools?: boolean; userProfile?: Record<string, unknown>; stealth?: boolean; iframe?: boolean; iframe_url?: string; maximize_new_windows?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | No | Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `start` | `boolean` | query | No | Controls instance creation behavior. Default mode: instances are created automatically. Set to `false` to prevent creation. When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `browser.instances.getDevtoolsUrls` is the exception: it answers 404 when no instance is running and never consults this value. |
| `chromiumVersion` | `string` | query | No | Chromium/Chrome version selection for the instance. This option applies only when `browser=chromium`. Supported formats: Full version: `136.0.7103.113`; Major version: `136` (mapped to a known stable patch for the current OS); Channel tag: `stable`, `beta`, `dev`, `canary` Any other value is a `400 VALIDATION_ERROR` naming `chromiumVersion`. A full version that no download source has is a `400 VALIDATION_ERROR` too, answered once the download is refused. A major version with no known build falls back to `stable`. The request **blocks** until the requested browser build is available on the server. |
| `fingerprintId` | `string` | query | No | Base fingerprint profile id. The server uses the `context` and `launch` defaults of the configured fingerprint profile with this id, then applies any request overrides over them (top-level options and `userProfile` values both win over the profile). An unknown id starts with an empty profile. |
| `useRemoteDebuggingPort` | `boolean` | query | No | If `true`, the child process will launch Chromium with `--remote-debugging-port` and will populate `webSocketDebuggerUrl` in metadata responses. |
| `remoteDebuggingPort` | `number` | query | No | Ignored. The kit always assigns the DevTools port itself (a caller-supplied value is never honoured, for isolation); read the assigned URLs from `/devtools-url` or the instance metadata. Kept only so older clients do not fail validation. |
| `remoteDebuggingAddress` | `string` | query | No | Interface address the DevTools port binds to. Defaults to `0.0.0.0` unless the deployment overrides it; the port is only reachable through the container proxy's `cdp-{N}` relay. |
| `extensions` | `string` | query | No | Comma-separated list (or JSON array string) of absolute extension directory paths to load. Extensions require `showBrowser=true` (headful mode) and will launch a persistent profile. |
| `extensionsDir` | `string` | query | No | Directory containing extension subfolders to load (each subfolder is treated as an extension). Extensions require `showBrowser=true` (headful mode) and will launch a persistent profile. |
| `extensionsStoreIds` | `string` | query | No | Chrome Web Store extension IDs to download and load (Chromium only). Requires `showBrowser=true` and works only with `browser=chromium`. Downloads of the same extension are serialized across instances; an instance that waits more than 5 minutes for another instance's download fails with a "try again later" error. |
| `proxyServer` | `string` | query | No | Proxy server URL (http, https, socks5, socks5h) |
| `proxyUsername` | `string` | query | No | Proxy username (if required) |
| `proxyPassword` | `string` | query | No | Proxy password (if required) |
| `proxyBypass` | `string` | query | No | Comma-separated list of hosts that should bypass the proxy |
| `enableQuic` | `boolean` | query | No | Enable QUIC/HTTP3 transport. Defaults to `false` (QUIC blocked). Use `enableQuic=true` to re-enable QUIC. |
| `enableDnsOverHttps` | `boolean` | query | No | Enable DNS-over-HTTPS for browser DNS resolution. Defaults to `true`. |
| `dnsOverHttpsUrl` | `string` | query | No | DoH resolver URL (HTTPS only). Defaults to Cloudflare: `https://cloudflare-dns.com/dns-query`. |
| `display` | `number \| string` | query | No | X display number or identifier for headful mode. Required when `showBrowser=true` and no `DISPLAY` environment variable is set on the server. |
| `showBrowser` | `boolean` | query | No | Whether to run the browser headful (visible). Defaults to `true`. |
| `sessionName` | `string` | query | No | Custom session name for identifying this browser instance |
| `timezoneId` | `string` | query | No | IANA timezone identifier for browser geolocation |
| `locale` | `string` | query | No | BCP 47 language tag for browser locale |
| `userAgent` | `string` | query | No | User agent string to apply to the browser context. |
| `typeof` | `string` | query `viewport` | No | Viewport configuration as JSON string. Example: {"width":1920,"height":1080,"deviceScaleFactor":1} Pass `null` to disable fixed-viewport emulation entirely — the page then follows the real browser window size (responsive; most useful in headful mode). |
| `noViewport` | `boolean` | query | No | Set to `true` to disable fixed-viewport emulation (alias for `viewport=null`). The page then resizes with the browser window instead of being pinned to an emulated resolution. Cannot be combined with a fixed `viewport` object. |
| `typeof` | `string` | query `geolocation` | No | Geolocation configuration as JSON string. Example: {"latitude":40.7128,"longitude":-74.0060,"accuracy":100} Anything other than a JSON object (`null`, an array, a number) is a `400 VALIDATION_ERROR`. |
| `launchArguments` | `string[]` | query | No | Additional Chromium/Firefox command-line arguments. Pass the query key repeatedly (`launchArguments=--a&launchArguments=--b`) or a single JSON array string (`launchArguments=["--a","--b"]`); every value is kept. Entries must be strings (400 otherwise). |
| `browser` | `"chromium" \| "firefox"` | query | No | Browser engine to use (`chromium` or `firefox`). `chrome` is accepted as an alias of `chromium`. Fixed for the life of the instance. |
| `firefoxVersion` | `string` | query | No | Firefox version label (informational only). Playwright-managed Firefox builds are used by default. If omitted, a Playwright Firefox build is downloaded on demand. |
| `firefoxExecutablePath` | `string` | query | No | Absolute path to a custom Firefox executable (overrides download) |
| `showDevtools` | `boolean` | query | No | Whether to open DevTools on launch (Chromium only) |
| `typeof` | `object` | query `userProfile` | No | Optional user profile object (JSON string): `locale`, `timezoneId`, `userAgentString`, `geolocation` and `deviceProfile.viewport`. Precedence for each field: the top-level request option (`locale`, `timezoneId`, `userAgent`, `geolocation`, `viewport`) > `userProfile` > the fingerprint profile (`fingerprintId`, `default` when omitted) > the engine default. A value set here always replaces the fingerprint profile's value. |
| `stealth` | `boolean` | query | No | Launch Chromium in stealth mode using Patchright (anti-detection patches). Only applies to `browser=chromium`. Ignored for Firefox. Defaults to `true`. Bare `?stealth` is treated as `true`. |
| `iframe` | `boolean` | query | No | Enable or disable the full-page display iframe on the root URL. |
| `iframe_url` | `string` | query | No | Explicit URL for the display iframe. |
| `maximize_new_windows` | `boolean` | query | No | Control the `maximize_new_windows` flag stamped onto the generated display URL (always explicit `true`/`false`); when true the hoody-display client opens new top-level app windows maximized. Enabled by default; set to `false` to opt out. |

**Returns:** `Promise<BrowserInstancesRestartResponse>`  |  **HTTP:** `GET /restart`
**CLI:** `hoody browser restart`

---

#### `shutdown` — Shutdown browser instance

```typescript
client.browser.instances.shutdown(options?: { browser_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | No | Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |

**Returns:** `Promise<BrowserInstancesShutdownResponse>`  |  **HTTP:** `GET /shutdown`
**CLI:** `hoody browser shutdown`

---

#### `start` — Create or retrieve browser instance

```typescript
client.browser.instances.start(options?: { browser_id?: string; chromiumVersion?: string; fingerprintId?: string; useRemoteDebuggingPort?: boolean; remoteDebuggingPort?: number; remoteDebuggingAddress?: string; extensions?: string; extensionsDir?: string; extensionsStoreIds?: string; proxyServer?: string; proxyUsername?: string; proxyPassword?: string; proxyBypass?: string; enableQuic?: boolean; enableDnsOverHttps?: boolean; dnsOverHttpsUrl?: string; display?: number | string; showBrowser?: boolean; sessionName?: string; timezoneId?: string; locale?: string; userAgent?: string; viewport?: string; noViewport?: boolean; geolocation?: string; launchArguments?: string[]; browser?: "chromium" | "firefox"; firefoxVersion?: string; firefoxExecutablePath?: string; showDevtools?: boolean; userProfile?: Record<string, unknown>; stealth?: boolean; iframe?: boolean; iframe_url?: string; maximize_new_windows?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | No | Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `chromiumVersion` | `string` | query | No | Chromium/Chrome version selection for the instance. This option applies only when `browser=chromium`. Supported formats: Full version: `136.0.7103.113`; Major version: `136` (mapped to a known stable patch for the current OS); Channel tag: `stable`, `beta`, `dev`, `canary` Any other value is a `400 VALIDATION_ERROR` naming `chromiumVersion`. A full version that no download source has is a `400 VALIDATION_ERROR` too, answered once the download is refused. A major version with no known build falls back to `stable`. The request **blocks** until the requested browser build is available on the server. |
| `fingerprintId` | `string` | query | No | Base fingerprint profile id. The server uses the `context` and `launch` defaults of the configured fingerprint profile with this id, then applies any request overrides over them (top-level options and `userProfile` values both win over the profile). An unknown id starts with an empty profile. |
| `useRemoteDebuggingPort` | `boolean` | query | No | If `true`, the child process will launch Chromium with `--remote-debugging-port` and will populate `webSocketDebuggerUrl` in metadata responses. |
| `remoteDebuggingPort` | `number` | query | No | Ignored. The kit always assigns the DevTools port itself (a caller-supplied value is never honoured, for isolation); read the assigned URLs from `/devtools-url` or the instance metadata. Kept only so older clients do not fail validation. |
| `remoteDebuggingAddress` | `string` | query | No | Interface address the DevTools port binds to. Defaults to `0.0.0.0` unless the deployment overrides it; the port is only reachable through the container proxy's `cdp-{N}` relay. |
| `extensions` | `string` | query | No | Comma-separated list (or JSON array string) of absolute extension directory paths to load. Extensions require `showBrowser=true` (headful mode) and will launch a persistent profile. |
| `extensionsDir` | `string` | query | No | Directory containing extension subfolders to load (each subfolder is treated as an extension). Extensions require `showBrowser=true` (headful mode) and will launch a persistent profile. |
| `extensionsStoreIds` | `string` | query | No | Comma-separated list (or JSON array string) of Chrome Web Store extension IDs to download and load. Requires `showBrowser=true` and works only with `browser=chromium`. Downloads of the same extension are serialized across instances; an instance that waits more than 5 minutes for another instance's download fails with a "try again later" error. |
| `proxyServer` | `string` | query | No | Proxy server for browser traffic. Supports `http://`, `https://`, `socks5://`, or `socks5h://`. Example: `socks5://127.0.0.1:9050` |
| `proxyUsername` | `string` | query | No | Proxy username (if required) |
| `proxyPassword` | `string` | query | No | Proxy password (if required) |
| `proxyBypass` | `string` | query | No | Comma-separated list of hosts that should bypass the proxy |
| `enableQuic` | `boolean` | query | No | Enable QUIC/HTTP3 transport. Defaults to `false` (QUIC blocked). Use `enableQuic=true` to re-enable QUIC. |
| `enableDnsOverHttps` | `boolean` | query | No | Enable DNS-over-HTTPS for browser DNS resolution. Defaults to `true`. |
| `dnsOverHttpsUrl` | `string` | query | No | DoH resolver URL (HTTPS only). Defaults to Cloudflare: `https://cloudflare-dns.com/dns-query`. |
| `display` | `number \| string` | query | No | X display number or identifier for headful mode. Required when `showBrowser=true` and no `DISPLAY` environment variable is set on the server. |
| `showBrowser` | `boolean` | query | No | Whether to run the browser headful (visible). Defaults to `true`. |
| `sessionName` | `string` | query | No | Custom session name for identifying this browser instance |
| `timezoneId` | `string` | query | No | IANA timezone identifier for browser geolocation |
| `locale` | `string` | query | No | BCP 47 language tag for browser locale |
| `userAgent` | `string` | query | No | User agent string to apply to the browser context. |
| `viewport` | `string` | query | No | Viewport configuration as JSON string. Example: {"width":1920,"height":1080,"deviceScaleFactor":1} Pass `null` to disable fixed-viewport emulation entirely — the page then follows the real browser window size (responsive; most useful in headful mode). |
| `noViewport` | `boolean` | query | No | Set to `true` to disable fixed-viewport emulation (alias for `viewport=null`). The page then resizes with the browser window instead of being pinned to an emulated resolution. Cannot be combined with a fixed `viewport` object. |
| `geolocation` | `string` | query | No | Geolocation configuration as JSON string. Example: {"latitude":40.7128,"longitude":-74.0060,"accuracy":100} Anything other than a JSON object (`null`, an array, a number) is a `400 VALIDATION_ERROR`. |
| `launchArguments` | `string[]` | query | No | Additional Chromium/Firefox command-line arguments. Pass the query key repeatedly (`launchArguments=--a&launchArguments=--b`) or a single JSON array string (`launchArguments=["--a","--b"]`); every value is kept. Entries must be strings (400 otherwise). |
| `browser` | `"chromium" \| "firefox"` | query | No | Browser engine to use (`chromium` or `firefox`). `chrome` is accepted as an alias of `chromium`. Fixed for the life of the instance. |
| `firefoxVersion` | `string` | query | No | Firefox version label (informational only). Playwright-managed Firefox builds are used by default. If omitted, a Playwright Firefox build is downloaded on demand. |
| `firefoxExecutablePath` | `string` | query | No | Absolute path to a custom Firefox executable (overrides download) |
| `showDevtools` | `boolean` | query | No | Whether to open DevTools on launch (Chromium only) |
| `typeof` | `object` | query `userProfile` | No | Optional user profile object (JSON string): `locale`, `timezoneId`, `userAgentString`, `geolocation` and `deviceProfile.viewport`. Precedence for each field: the top-level request option (`locale`, `timezoneId`, `userAgent`, `geolocation`, `viewport`) > `userProfile` > the fingerprint profile (`fingerprintId`, `default` when omitted) > the engine default. A value set here always replaces the fingerprint profile's value. |
| `stealth` | `boolean` | query | No | Launch Chromium in stealth mode using Patchright (anti-detection patches). Only applies to `browser=chromium`. Ignored for Firefox. Defaults to `true`. Bare `?stealth` is treated as `true`. |
| `iframe` | `boolean` | query | No | Enable or disable the full-page display iframe on the root URL. When enabled (default), navigating to `/` serves an HTML page with an iframe pointing to the Hoody display URL. |
| `iframe_url` | `string` | query | No | Explicit URL for the display iframe. If not provided, the URL is auto-detected from the Host header subdomain pattern. |
| `maximize_new_windows` | `boolean` | query | No | Control the `maximize_new_windows` flag stamped onto generated display URLs (iframe pages, status pages, `iframe_url` metadata). The flag is always explicit (`true` or `false`); when true the hoody-display client opens new top-level app windows maximized. Enabled by default; set to `false` to keep the display client's centered default-size placement (the explicit `false` also overrides a display-side `default-settings.txt` enable). Explicit `iframe_url` values are never modified. |

**Returns:** `Promise<BrowserInstancesStartResponse>`  |  **HTTP:** `GET /start`
**CLI:** `hoody browser start`

---

#### `stop` — Stop browser instance

```typescript
client.browser.instances.stop(options?: { browser_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | No | Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |

**Returns:** `Promise<BrowserInstancesStopResponse>`  |  **HTTP:** `GET /stop`
**CLI:** `hoody browser stop`

---

### `client.browser.kit` (2) — Server monitoring and health check operations

#### `getHealth` — Health check

```typescript
client.browser.kit.getHealth()
```

**Returns:** `Promise<BrowserKitGetHealthResponse>`  |  **HTTP:** `GET /api/v1/browser/health`
**CLI:** `hoody browser health`

---

#### `getStats` — Server metrics

```typescript
client.browser.kit.getStats()
```

**Returns:** `Promise<BrowserKitGetStatsResponse>`  |  **HTTP:** `GET /metrics`
**CLI:** `hoody browser stats`

---

### `client.browser.logs` (2) — Debugging

#### `listConsole` — Get console logs

```typescript
client.browser.logs.listConsole(options?: { browser_id?: string; tabId?: number; start?: boolean; type?: string; since?: string; clear?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | No | Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `tabId` | `number` | query | No | The ID of the tab to interact with (from `/tabs`). Omitted: the active tab. Supplied: exactly that tab — an unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema. |
| `start` | `boolean` | query | No | Controls instance creation behavior. Default mode: instances are created automatically. Set to `false` to prevent creation. When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `browser.instances.getDevtoolsUrls` is the exception: it answers 404 when no instance is running and never consults this value. |
| `type` | `string` | query | No | Filter by message type (log, error, warning, info, etc.). Repeating this key in the query string is a `400 VALIDATION_ERROR` (`type must not be repeated`). |
| `since` | `string` | query | No | Only return entries at or after this time: an ISO 8601 date or date-time, like `2026-10-05T12:00:00Z`. Any other value (an epoch number, a word like `yesterday`) is a `400 VALIDATION_ERROR` naming `since`, never an unfiltered list. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`since must not be repeated`). |
| `clear` | `boolean` | query | No | Clear the buffer after reading. `true` or `false`; any other value is a `400 VALIDATION_ERROR` naming `clear`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`clear must not be repeated`). |

**Returns:** `Promise<BrowserLogsListConsoleResponse>`  |  **HTTP:** `GET /console`
**CLI:** `hoody browser logs console list`

---

#### `listNetwork` — Get network logs

```typescript
client.browser.logs.listNetwork(options?: { browser_id?: string; tabId?: number; start?: boolean; since?: string; clear?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | No | Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `tabId` | `number` | query | No | The ID of the tab to interact with (from `/tabs`). Omitted: the active tab. Supplied: exactly that tab — an unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema. |
| `start` | `boolean` | query | No | Controls instance creation behavior. Default mode: instances are created automatically. Set to `false` to prevent creation. When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `browser.instances.getDevtoolsUrls` is the exception: it answers 404 when no instance is running and never consults this value. |
| `since` | `string` | query | No | Only return entries at or after this time: an ISO 8601 date or date-time, like `2026-10-05T12:00:00Z`. Any other value (an epoch number, a word like `yesterday`) is a `400 VALIDATION_ERROR` naming `since`, never an unfiltered list. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`since must not be repeated`). |
| `clear` | `boolean` | query | No | Clear the buffer after reading. `true` or `false`; any other value is a `400 VALIDATION_ERROR` naming `clear`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`clear must not be repeated`). |

**Returns:** `Promise<BrowserLogsListNetworkResponse>`  |  **HTTP:** `GET /network`
**CLI:** `hoody browser logs network list`

---

### `client.browser.page` (9) — Operations for interacting with browser tabs and content

#### `act` — Perform a native element action

```typescript
client.browser.page.act(data: BrowserPageActRequest, options?: { browser_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | No | Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `data` | `BrowserPageActRequest` | body | Yes |  |

**Body:** `{ instanceGeneration: string, tabId: int, timeoutMs: int=10000, action*: "click" | "fill" | "type" | "press" | "select" | "check" | "hover", target*: browser_Target, dialog: browser_DialogPolicy, value: string, delayMs: int=0, key: string, values: string[], checked: bool, button: "left" | "middle" | "right"="left", clickCount: int=1, modifiers: ("Alt" | "Control" | "Meta" | "Shift")[] }`

- `instanceGeneration` — From /metadata; mismatch → 409 INSTANCE_CHANGED.
- `delayMs` — type: delay between keys. Code points × delayMs must be smaller than timeoutMs (400).
- `key` — press: Playwright key syntax (e.g. "Enter", "Control+a"). Unknown → 400.

**Returns:** `Promise<BrowserPageActResponse>`  |  **HTTP:** `POST /action`
**CLI:** `hoody browser act`

---

#### `captureScreenshot` — Capture browser screenshot

```typescript
client.browser.page.captureScreenshot(options?: { browser_id?: string; start?: boolean; url?: string; tabId?: number; format?: "png" | "jpeg" | "base64"; quality?: number; fullPage?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | No | Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `start` | `boolean` | query | No | Controls instance creation behavior. Default mode: instances are created automatically. Set to `false` to prevent creation. When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `browser.instances.getDevtoolsUrls` is the exception: it answers 404 when no instance is running and never consults this value. |
| `url` | `string` | query | No | The URL to navigate to. Repeating this key IN THE QUERY STRING is a `400 VALIDATION_ERROR` (`url must not be repeated`), on GET and on POST alike — a request naming two destinations is answered rather than silently resolved to one of them. The rule is about the query string only — a JSON body property named `url` is governed by the body schema. Only an absolute `http`, `https` or `data` URL, `about:blank`, or (on Chromium engines only) a `chrome:` URL is accepted. Any other scheme (`file:` in any spelling, `view-source:`, `javascript:`, `blob:` and the rest) is a `400 VALIDATION_ERROR` (`url must be an http, https or data URL, about:blank, or a chrome URL on Chromium; file and other local schemes are refused`), and a value that is not an absolute URL (such as `/etc/hostname`) is a `400 VALIDATION_ERROR` (`url must be an absolute URL, like https://example.com/`). Every other `about:` page is refused (Firefox's `about:reader?url=file:…` loads a local file), and `chrome:` is refused on Firefox, where it is the browser's own privileged UI. A value that is not a string is `url must be a string`. The `url` is checked before an instance is started, a tab is looked up, created or reused, or anything is navigated, and before `/pdf`'s `501 NOT_SUPPORTED`. On `/screenshot` and `/pdf` a supplied but empty `url=` is a `400 VALIDATION_ERROR` too (omit `url` to capture the current tab). This checks the request only; it does not stop the browser from opening local files (see "Local files" in the API overview). |
| `tabId` | `number` | query | No | The ID of the tab to interact with (from `/tabs`). Omitted: the active tab. Supplied: exactly that tab — an unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema. |
| `format` | `"png" \| "jpeg" \| "base64"` | query | No | Output format. `base64` answers JSON with the PNG bytes base64-encoded. Any other value is a `400 VALIDATION_ERROR` naming `format`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`format must not be repeated`). |
| `quality` | `number` | query | No | Image quality for JPEG format (0-100); not used for `png` or `base64`. A value that is not an integer from 0 to 100 is a `400 VALIDATION_ERROR` naming `quality`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`quality must not be repeated`). |
| `fullPage` | `boolean` | query | No | Capture the entire scrollable page. `true` or `false`; any other value is a `400 VALIDATION_ERROR` naming `fullPage`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`fullPage must not be repeated`). |

**Returns:** `Promise<ApiResponse<ArrayBuffer> | BrowserPageCaptureScreenshotResponse>` — the response Content-Type picks the branch: JSON gives the payload in `.data`, a binary type gives the bytes  |  **HTTP:** `GET /screenshot`
**CLI:** `hoody browser screenshots capture`

---

#### `evaluate` — Execute JavaScript (POST)

```typescript
client.browser.page.evaluate(data: BrowserPageEvaluateRequest, options?: { browser_id?: string; start?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | No | Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `start` | `boolean` | query | No | Controls instance creation behavior. Default mode: instances are created automatically. Set to `false` to prevent creation. When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `browser.instances.getDevtoolsUrls` is the exception: it answers 404 when no instance is running and never consults this value. |
| `data` | `BrowserPageEvaluateRequest` | body | Yes |  |

**Body:** `{ script: string, tabId: int, scriptBase64: bool, timeoutMs: int=30000 }`

- `tabId` — Tab to evaluate in (from `/tabs`). Omitted: the active tab. Unknown → `404 TAB_NOT_FOUND`, malformed → `400`.
- `timeoutMs` — Time limit for the script, in milliseconds (1 to 30000, default 30000). A script still running when it is spent is stopped and the answer is `504 TIMEOUT` (`details.phase` `evaluate`). Repeating this key in the query string is a `400 VALIDATION_ERROR` (`timeoutMs must not be repeated`).

**Returns:** `Promise<BrowserPageEvaluateResponse>`  |  **HTTP:** `POST /eval`
**CLI:** `hoody browser evaluate`

---

#### `exportPdf` — Export page as PDF

```typescript
client.browser.page.exportPdf(options?: { browser_id?: string; tabId?: number; start?: boolean; url?: string; format?: string; landscape?: boolean; printBackground?: boolean; margin?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | No | Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `tabId` | `number` | query | No | The ID of the tab to interact with (from `/tabs`). Omitted: the active tab. Supplied: exactly that tab — an unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema. |
| `start` | `boolean` | query | No | Controls instance creation behavior. Default mode: instances are created automatically. Set to `false` to prevent creation. When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `browser.instances.getDevtoolsUrls` is the exception: it answers 404 when no instance is running and never consults this value. |
| `url` | `string` | query | No | Optional URL to navigate to before generating the PDF. Only an absolute `http`, `https` or `data` URL, `about:blank`, or (on Chromium engines only) a `chrome:` URL is accepted. Any other scheme (`file:` in any spelling, `view-source:`, `javascript:`, `blob:` and the rest) is a `400 VALIDATION_ERROR` (`url must be an http, https or data URL, about:blank, or a chrome URL on Chromium; file and other local schemes are refused`), and a value that is not an absolute URL (such as `/etc/hostname`) is a `400 VALIDATION_ERROR` (`url must be an absolute URL, like https://example.com/`). Every other `about:` page is refused (Firefox's `about:reader?url=file:…` loads a local file), and `chrome:` is refused on Firefox, where it is the browser's own privileged UI. A value that is not a string is `url must be a string`. The `url` is checked before an instance is started, a tab is looked up, created or reused, or anything is navigated, and before `/pdf`'s `501 NOT_SUPPORTED`. On `/screenshot` and `/pdf` a supplied but empty `url=` is a `400 VALIDATION_ERROR` too (omit `url` to capture the current tab). This checks the request only; it does not stop the browser from opening local files (see "Local files" in the API overview). Repeating this key in the query string is a `400 VALIDATION_ERROR` (`url must not be repeated`): the parent's rule is on the key, not on the operation, so it applies here too even though this parameter is declared inline rather than shared. |
| `format` | `string` | query | No | Paper format: one of Letter, Legal, Tabloid, Ledger, A0, A1, A2, A3, A4, A5 or A6 (any letter case). Any other value is a `400 VALIDATION_ERROR` naming `format`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`format must not be repeated`). |
| `landscape` | `boolean` | query | No | Use landscape orientation. `true` or `false`; any other value is a `400 VALIDATION_ERROR` naming `landscape`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`landscape must not be repeated`). |
| `printBackground` | `boolean` | query | No | Include background graphics. `true` or `false`; any other value is a `400 VALIDATION_ERROR` naming `printBackground`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`printBackground must not be repeated`). |
| `margin` | `string` | query | No | Uniform margin: a non-negative number of pixels, or a number followed by `px`, `in`, `cm` or `mm` (e.g. '1cm', '0.5in'). Any other value is a `400 VALIDATION_ERROR` naming `margin`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`margin must not be repeated`). |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /pdf`
**CLI:** `hoody browser pdf export`

---

#### `getHtml` — Get page HTML

```typescript
client.browser.page.getHtml(options?: { browser_id?: string; tabId?: number; start?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | No | Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `tabId` | `number` | query | No | The ID of the tab to interact with (from `/tabs`). Omitted: the active tab. Supplied: exactly that tab — an unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema. |
| `start` | `boolean` | query | No | Controls instance creation behavior. Default mode: instances are created automatically. Set to `false` to prevent creation. When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `browser.instances.getDevtoolsUrls` is the exception: it answers 404 when no instance is running and never consults this value. |

**Returns:** `Promise<ApiResponse<string>>`  |  **HTTP:** `GET /html`
**CLI:** `hoody browser html get`

---

#### `getSnapshot` — Accessibility snapshot of a tab with element refs

```typescript
client.browser.page.getSnapshot(options?: { browser_id?: string; instanceGeneration?: string; tabId?: number; paramTimeoutMs?: number; maxChars?: number; includeValues?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | No | Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `instanceGeneration` | `string` | query | No | The instance generation from /metadata. If it no longer matches the running instance → 409 INSTANCE_CHANGED (also when no instance exists: details.expected is null). Repeating this key in the query string is a `400 VALIDATION_ERROR` (`instanceGeneration must not be repeated`); a body property of the same name is governed by the body schema. |
| `tabId` | `number` | query | No | The ID of the tab to interact with (from `/tabs`). Omitted: the active tab. Supplied: exactly that tab — an unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema. |
| `paramTimeoutMs` | `number` | query `timeoutMs` | No | Budget for the whole browser operation, starting at handler entry (instance provisioning is never inside it). Repeating this key in the query string is a `400 VALIDATION_ERROR` (`timeoutMs must not be repeated`); a body property of the same name does not suppress that — it is governed by the body schema instead. A body that is not a JSON object at all, or that fails the operation's own validation, is rejected first, with its own message and the same status and code. |
| `maxChars` | `number` | query | No | Hard cut on a line boundary; `truncated` reports it. A truncated excerpt may not parse as standalone YAML. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`maxChars must not be repeated`). |
| `includeValues` | `boolean` | query | No | Include the CONTENTS of form controls in the snapshot. Off by default: the accessibility tree serialises `input.value`, so a snapshot taken after the agent typed a password, card number or token would hand those back on every subsequent loop iteration. With the default, the value of a non-empty textbox, searchbox, spinbutton, slider or editable combobox (an input with a `<datalist>`, or `role=combobox`) renders as `<value hidden>`, whatever its label contains; only a native `<select>` keeps its option names, when it holds nothing but `<option>`, `<optgroup>` and `<hr>` elements and none of them uses `aria-owns` or `aria-labelledby` or is editable (every other node in it keeps its role and ref but not its name or text), and the content of every other combobox, ARIA autocomplete popups and customizable selects with rich option content included, is hidden whole (an empty one renders with no value at all, so the caller can still tell them apart). A `<select>`'s options are page content, not entered text, and are always included. Content inside an editable region (a `contenteditable` element, or a whole page in `designMode`) is hidden too: the region keeps its role and ref, its contents become `<value hidden>`, and its name is shown only when it is authored (`aria-label`, or `aria-labelledby` pointing at non-editable content); text the snapshot folds from an editor into an enclosing element is hidden there too. If the page cannot be asked in time, the text and computed names on such a page are hidden and the refs are kept. Set to `true` only when the values are known not to be sensitive. Anything but `true`/`false` → 400, and repeating this key in the query string is a `400 VALIDATION_ERROR` (`includeValues must not be repeated`). |

**Returns:** `Promise<BrowserPageGetSnapshotResponse>`  |  **HTTP:** `GET /snapshot`
**CLI:** `hoody browser snapshot get`

---

#### `getText` — Get page text

```typescript
client.browser.page.getText(options?: { browser_id?: string; tabId?: number; start?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | No | Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `tabId` | `number` | query | No | The ID of the tab to interact with (from `/tabs`). Omitted: the active tab. Supplied: exactly that tab — an unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema. |
| `start` | `boolean` | query | No | Controls instance creation behavior. Default mode: instances are created automatically. Set to `false` to prevent creation. When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `browser.instances.getDevtoolsUrls` is the exception: it answers 404 when no instance is running and never consults this value. |

**Returns:** `Promise<ApiResponse<string>>`  |  **HTTP:** `GET /text`
**CLI:** `hoody browser text get`

---

#### `navigate` — Navigate to URL (POST)

```typescript
client.browser.page.navigate(data: BrowserPageNavigateRequest, options?: { browser_id?: string; start?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | No | Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `start` | `boolean` | query | No | Controls instance creation behavior. Default mode: instances are created automatically. Set to `false` to prevent creation. When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `browser.instances.getDevtoolsUrls` is the exception: it answers 404 when no instance is running and never consults this value. |
| `data` | `BrowserPageNavigateRequest` | body | Yes |  |

**Body:** `{ url*: string, tabId: int, waitUntil: "commit" | "domcontentloaded" | "load"="load", timeoutMs: int, instanceGeneration: string, active: bool=true, onlyIfNotExists: bool=false, ignoreGetParameters: bool=false }`

- `url` — … Any other scheme (`file:` in any spelling, `view-source:`, `javascript:`, `blob:` and the rest) is a `400 VALIDATION_ERROR` (`url must be an http, https or data URL, about:blank, or a chrome URL on Chromium; file and other local schemes are refused`), and a value that is not an absolute URL (such as `/etc/hostname`) is a `400 VALIDATION_ERROR` (`url must be an absolute URL, like https://example.com/`). Every other `about:` page is refused (Firefox's `about:reader?url=file:…` loads a local file), and `chrome:` is refused on Firefox, where it is the browser's own privileged UI. …
- `timeoutMs` — Omitted: the navigation may take up to 30000 ms. Present: the whole budget. Either way a navigation that runs out of time is a 504 TIMEOUT (phase navigation).
- `active` — Whether the tab becomes the active one. … ANY other value (`0`, `1`, `"yes"`, `"on"`, `""`, `null`, or an array) is rejected with `400 VALIDATION_ERROR` (`details.field` names the property) before a tab is created or reused; it is never coerced. …
- `onlyIfNotExists` — Reuse an existing tab already on this URL instead of opening a new one. Same value rule as `active`: send a JSON boolean (the strings `"true"`/`"false"` are tolerated because one parser reads both the query and the body spelling); anything else is `400 VALIDATION_ERROR`, never coerced.
- `ignoreGetParameters` — Compare URLs for `onlyIfNotExists` with the query string stripped. Same value rule as `active`: send a JSON boolean (the strings `"true"`/`"false"` are tolerated because one parser reads both the query and the body spelling); anything else is `400 VALIDATION_ERROR`, never coerced.

**Returns:** `Promise<BrowserPageNavigateResponse>`  |  **HTTP:** `POST /browse`
**CLI:** `hoody browser navigate`

---

#### `wait` — Wait for a condition in a tab

```typescript
client.browser.page.wait(data: BrowserPageWaitRequest, options?: { browser_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | No | Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `data` | `BrowserPageWaitRequest` | body | Yes |  |

**Body:** `{ instanceGeneration: string, tabId: int, timeoutMs: int=10000, condition*: browser_WaitCondition }`

- `instanceGeneration` — From /metadata; mismatch → 409 INSTANCE_CHANGED.

**Returns:** `Promise<BrowserPageWaitResponse>`  |  **HTTP:** `POST /wait`
**CLI:** `hoody browser wait`

---

#### `saveScreenshot` — Capture a browser screenshot and save it to the container filesystem.

```typescript
client.browser.page.saveScreenshot(path?: string, options?: Omit<SaveScreenshotOptions, 'source' | 'path'>)
```

**Returns:** `Promise<SaveScreenshotResult>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

### `client.browser.tabs` (2) — Operations for inspecting and controlling browser instances

#### `close` — Close a browser tab

```typescript
client.browser.tabs.close(data?: BrowserTabsCloseRequest, options?: { browser_id?: string; start?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | No | Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `start` | `boolean` | query | No | Controls instance creation behavior. Default mode: instances are created automatically. Set to `false` to prevent creation. When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `browser.instances.getDevtoolsUrls` is the exception: it answers 404 when no instance is running and never consults this value. |
| `data` | `BrowserTabsCloseRequest` | body | No |  |

**Body:** `{ tabId: int }`

**Returns:** `Promise<BrowserTabsCloseResponse>`  |  **HTTP:** `POST /tab/close`
**CLI:** `hoody browser tabs close`

---

#### `list` — List browser tabs

```typescript
client.browser.tabs.list(options?: { browser_id?: string; start?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | No | Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `start` | `boolean` | query | No | Controls instance creation behavior. Default mode: instances are created automatically. Set to `false` to prevent creation. When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `browser.instances.getDevtoolsUrls` is the exception: it answers 404 when no instance is running and never consults this value. |

**Returns:** `Promise<BrowserTabsListResponse>`  |  **HTTP:** `GET /tabs`
**CLI:** `hoody browser tabs list`

---

### `client.browser.viewport` (2) — Operations for inspecting and controlling browser instances

#### `get` — Get the current viewport policy

```typescript
client.browser.viewport.get(options?: { browser_host?: string; browser_port?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_host` | `string` | query | No | Instance host. Optional — must be paired with browser_port; when both are omitted the single running instance is selected (400 AMBIGUOUS_INSTANCE with more than one). |
| `browser_port` | `number` | query | No | Instance port. Optional — must be paired with browser_host. |

**Returns:** `Promise<BrowserViewportGetResponse>`  |  **HTTP:** `GET /viewport`
**CLI:** `hoody browser viewport get`

---

#### `set` — Change the viewport at runtime

```typescript
client.browser.viewport.set(data: BrowserViewportSetRequest, options?: { browser_host?: string; browser_port?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_host` | `string` | query | No | Instance host. Optional — must be paired with browser_port; when both are omitted the single running instance is selected (400 AMBIGUOUS_INSTANCE with more than one). |
| `browser_port` | `number` | query | No | Instance port. Optional — must be paired with browser_host. |
| `data` | `BrowserViewportSetRequest` | body | Yes |  |

**Body:** `{ viewport*: { width*: int, height*: int }|null }`

**Returns:** `Promise<BrowserViewportSetResponse>`  |  **HTTP:** `POST /viewport`
**CLI:** `hoody browser viewport set`


### Body schemas

- `browser_Target` — `{ ref: string, snapshotId: string, selector: string, role: string, name: string, label: string, text: string, placeholder: string, testId: string, exact: bool=true }`
  - … Exactly ONE of ref, selector, role, label, text, placeholder, testId must be set (400 otherwise). `name` only with role; `snapshotId` required with ref; `exact` only with role/label/text/placeholder (default true). Every target is strict: more than one match → 409 AMBIGUOUS_TARGET. …
  - `ref` — Element reference from the latest /snapshot of this tab (e.g. "e12"). Requires snapshotId.
  - `snapshotId` — The snapshotId the ref came from. Must be the tab's latest and no main-frame navigation may have happened since (409 STALE_SNAPSHOT otherwise).
  - `selector` — A single CSS selector (forced through Playwright's css engine; ">>" chaining and other engines are rejected with 400).
  - `role` — ARIA role (Playwright's closed role list; unknown → 400). Combine with name.
  - `name` — Accessible name, only with role.
- `browser_DialogPolicy` — `{ type*: "alert" | "confirm" | "prompt" | "beforeunload", response*: "accept" | "dismiss", promptText: string, message: string }`
  - Authorizes handling of ONE dialog raised during this action; it never requires one (no dialog → `dialog: null`). A dialog that does not match, or a second dialog, is dismissed and the action fails with 409 UNEXPECTED_DIALOG (details.outcome says whether the mutation had completed).
  - `message` — If set, the dialog's message must equal this exactly to be handled.
- `browser_WaitCondition` — `{ kind*: "target" | "text" | "url" | "loadState", target: browser_Target, state: "attached" | "detached" | "visible" | "hidden" | "enabled" | "disabled" | "domcontentloaded" | "load", text: string, match: "contains" | "equals"="contains", url: string, urlPrefix: string }`
  - Discriminated by `kind`. target: {target, state}; text: {target, text, match?}; url: exactly one of {url} (absolute, compared as normalized href) or {urlPrefix} (verbatim startsWith on href); loadState: {state}. A miss is 504 TIMEOUT (phase wait), never matched:false.

