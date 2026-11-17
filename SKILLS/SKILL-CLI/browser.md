> _**CLI skill · `browser` namespace** · ~9,279 tokens · hoody-sdk v1.0.1_

# `browser` — Per-computer Chromium or Firefox instances, one per slot

## Purpose

- Long-lived browser instances per computer, one per `browser-X` hostname slot (by default the proxy maps slot X to `browser_port` 30000+X and `display` 500+X).
- Chromium runs the stealth engine by default (`stealth` defaults to `true`; metadata reports `engine: patchright`; if the stealth engine cannot be loaded the kit falls back to the standard engine and reports `engine: playwright` even with `stealth=true`). `stealth=false` selects the standard engine (`engine: playwright`). Firefox always runs the standard engine.
- Surfaces: nav, screenshot, JS eval, PDF, HTML/text, cookies, console+network logs, history, CDP, accessibility snapshot with element refs, element actions, waits, runtime viewport.

## When to use

- JS-heavy pages, screenshots, PDFs.
- Authenticated sessions across navs.
- Anti-fingerprint via `stealth=true`.
- Console/network capture.
- Dedicated recorded "project browser" the user can watch live and you can inspect anytime (workflow 6).
- Clicking, typing and waiting on page elements without writing JS (workflow 7).
- External CDP on Chromium through the URL that `hoody browser devtoolsurls get` returns (on by default; `useRemoteDebuggingPort=false` turns it off; Firefox never exposes it).

## When NOT to use

- Plain HTTP, persistence, server scripts, stream UI, shell → `curl`/`sqlite`/`exec`/`display`/`terminal`.

## Prerequisites

- Headful (default `showBrowser=true`) needs X display: `?display=` or `DISPLAY`. Extensions also require `showBrowser=true`.
- `hoody browser pdf export` works only on a headless Chromium instance: start it with `showBrowser=false`. Firefox and headful instances return `501 NOT_SUPPORTED`. The CLI flag is `--no-show-browser`.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

## Common workflows

### 1. Start + navigate
1. `hoody browser start` on the slot's hostname + overrides (proxy, stealth, fingerprintId, viewport, locale, timezoneId, userAgent, geolocation).
2. `hoody browser navigate` — `tabId`, `onlyIfNotExists=true`. Flags: `--tab-id`, `--only-if-not-exists`.
3. `hoody browser get`.

### 2. Extract content
After browse: `hoody browser html get`/`hoody browser text get`/`hoody browser screenshots capture`/`hoody browser pdf export` — params in Reference. `hoody browser pdf export` needs a headless Chromium instance (see Prerequisites).

### 3. Authenticated scraping
1. `hoody browser start` matching `userAgent`/`viewport`/`locale`.
2. `hoody browser cookies batch set` with a `cookies` list of `{name, value, url}` entries; each cookie needs `name`, `value` and either an absolute http(s) `url` or both `domain` and `path` (never `url` together with `domain` or `path`). Pass one `--cookies name=…,value=…,url=…` flag per cookie.
3. `hoody browser navigate` to protected URL.
4. `hoody browser html get`/`hoody browser text get`.
5. `hoody browser cookies clear`.

### 4. JS eval + logs
1. `hoody browser start` with `stealth=false` for full console capture (stop a slot that already runs with `stealth=true` first) → `hoody browser navigate`.
2. `hoody browser evaluate` (`{script}` JSON body). On the default stealth engine the script cannot see page JS globals (see Quirks).
3. `hoody browser logs console list` (`since`,`type`,`clear=true`).
4. `hoody browser logs network list`.

### 5. History
`hoody browser history list` (filters: `since`/`domain`; scoped to the slot's host) and `hoody browser history clear` (`before` + `browser_id` AND). In history, `browser_id` is the slot number X the navigation ran on.

### 6. Dedicated project browser — suggest it to the user
When the work is a website project or business research, **offer** the user a dedicated recorded browser. This is a suggestion to the user only — set it up when they ask, don't spin it up unprompted.
1. Pick a slot number X (e.g. 2) and start headful on that slot: `hoody browser start` addressed to the `browser-X` hostname (`--browser-id X`) with `showBrowser=true`. The proxy derives `browser_port` (30000+X by default) and `display` (500+X by default) from the hostname and overrides any values you send. Add any per-project identity: own egress proxy (`proxyServer`/`proxyUsername`/`proxyPassword`/`proxyBypass`), `stealth`, `userAgent`, `viewport`, `locale`, `geolocation`, extensions.
2. Give the user the direct live-view URL — the standard kit URL with the `browser-` slug and `?view=display`: `https://{P}-{C}-browser-X.{N}.computers.hoody.com/?view=display`. That page embeds display 500+X live (the bare root URL shows an instance status page with an Open display button instead), so an instance started on display 500+X gets its own stable viewing URL — changing the X in the URL is how you address each browser's live window. `hoody browser devtoolsurls get` adds a live DevTools inspector as a second link; that link gives full control of the browser, so hand it only to someone you would give the browser to.
3. What is browsed there — by the user clicking around in the live view or by the agent via the API — is recorded in per-slot history when history is enabled (top-level navigations, kept 30 days by default; recording is best effort, so a burst of page-driven changes can be merged or dropped; see Quirks; `hoody browser history list` through the `browser-X` host): live debugging and business research accumulate into one project trail. The instance itself is reaped once it has been idle past the deployment's max age (see Quirks) — history survives; re-run `hoody browser start` with the same options to revive the window. When auto-start is enabled, opening the live-view link on an empty slot can start an instance with default options rather than the project options; a later `hoody browser start` returns that instance without applying the new options, or answers 409 `INSTANCE_BACKEND_MISMATCH` if `stealth` differs. After a reap, run `hoody browser start` with the project options before the user reopens the link. If the link already started a default instance, run `hoody browser stop` first and then `hoody browser start` again.
4. Then offer log capture as a follow-up: console/network buffers hold only the last 500 entries and die with the instance, so a recurring `cron` job (or agent loop) draining `hoody browser logs console list`/`hoody browser logs network list` with `clear=true` into `sqlite`/`files`/agent memory preserves the captured entries for later sessions. For full console capture start the slot with `stealth=false`: the default stealth engine omits the page's console calls and errors.

### 7. Drive a page: snapshot, act, wait
These three operations never start an instance (without `instanceGeneration`, they return 404 `NOT_FOUND` on an empty slot; with it, they return 409 `INSTANCE_CHANGED`), so run `hoody browser start` and `hoody browser navigate` first.
1. `hoody browser get` and keep `instanceGeneration`. Passing it back on the calls below turns "the instance was replaced" into a 409 `INSTANCE_CHANGED` instead of acting on a fresh browser.
2. `hoody browser snapshot get` returns the tab's accessibility tree as YAML with `[ref=eN]` markers, plus a `snapshotId`. Entered form values read as `<value hidden>` unless `includeValues=true`.
3. `hoody browser act` with `action` (one of `click | fill | type | press | select | check | hover`) and a `target`: either `{ref, snapshotId}` from the latest snapshot, or exactly one of `selector`, `role` (+ `name`), `label`, `text`, `placeholder`, `testId`. A 200 means the browser operation completed, not that the site accepted it.
4. `hoody browser wait` with a condition (`kind`: `target`, `text`, `url` or `loadState`) to observe the result. A miss is 504 `TIMEOUT`, never `matched: false`.
5. Take a new snapshot before using refs again: a newer snapshot or a main-frame navigation invalidates the old refs (409 `STALE_SNAPSHOT`).
`hoody browser viewport get`/`hoody browser viewport set` read and change the viewport of a running instance without a restart.

## Quirks & gotchas

- The `browser-X` hostname selects the instance: the proxy derives `browser_port` (30000+X by default) and `display` (500+X by default) from it and overrides caller-supplied values. A `browser_id` (or another instance selector in the query or JSON body) that names a different instance is refused with 400 `INSTANCE_SELECTOR_CONFLICT`, `details.field` naming it, and nothing runs: leave it out or call that instance's own host. Choose the slot with `--browser-id X`, a whole number (0, 1, 2, ...). The CLI puts it in the hostname, and any other value is refused with an error before any request is sent. On history, `browser_id` also filters, equal to X.
- Many instance-dependent endpoints auto-create an absent instance unless `start=false`. Where a deployment disables auto-start, those endpoints create one only with explicit `start=true`. `hoody browser snapshot get`, `hoody browser act`, `hoody browser wait`, `hoody browser stop`, `hoody browser shutdown`, `hoody browser devtoolsurls get` and `hoody browser viewport get`/`hoody browser viewport set` never create one. `hoody browser history *` and `hoody browser stats`/`hoody browser health` are server-wide and do not create an instance. `hoody browser start` explicitly starts an instance.
- `stealth` defaults true; bare `?stealth`=true. Mid-flight change throws `Instance backend mismatch` — `hoody browser stop` first.
- `stealth=true` is ignored on Firefox: the stealth engine is Chromium-only.
- Extensions need `showBrowser=true` and run on a persistent profile.
- `chromiumVersion`: full / major / channel (`stable|beta|dev|canary`); first new version blocks on download.
- Console/network logs: 500-entry ring buffers — drain or filter `since`. On the default `stealth=true` engine (when the metadata reports `engine: patchright`; after a fallback to the standard engine capture is full), console capture leaves out what the page writes with its console API, uncaught errors and unhandled rejections; the response reports `capture: "partial"` with a `reason`. Start with `stealth=false` for full console capture.
- **A sweep runs every 5 min and SIGTERMs any instance idle for 1 h (deployment defaults), healthy or not.** The idle clock is restarted by real use: every API request routed to the instance (counted from the END of the request), a top-level page navigation (including a person clicking around in the live view), attaching through the `cdp-X` relay, and starting an instance that already exists. An instance with a request in flight or an open `cdp-X` relay connection is never reaped; a connection on a legacy `http-<port>` URL does not count, so keep making API requests. The instance's own heartbeat is liveness only and does NOT keep it alive, so an instance you want to keep (logged-in cookies, session state) needs a request at least once per idle window. A later call that is allowed to auto-start creates a fresh instance, with none of the cookies or session state the old one held; recorded history survives.
- Instances do NOT survive kit-process restarts: graceful shutdown (SIGTERM/SIGINT) terminates every child.
- When history is enabled, it records navigations including headful clicks; the page-navigation listener skips empty URLs and `about:blank`. It is stored at `/hoody/storage/hoody-browser/history`, retained 30 d by default. Where a deployment turns history off, the history endpoints answer `404 HISTORY_DISABLED`.
- **History is scoped by the host:** through a `browser-N` host, `hoody browser history list` returns and `hoody browser history clear` clears only instance N's history (add `before` to keep newer entries); leaving `browser_id` out does not widen it, and a `browser_id` naming another instance is refused with 400 `INSTANCE_SELECTOR_CONFLICT`. To read or clear several instances, call each instance's host.
- `browser_id` history filter sanitised as path component.
- **On the default stealth engine (`stealth=true` with metadata `engine: patchright`; check the reported engine, since a fallback reports `engine: playwright`), `eval` runs the script in an isolated JavaScript world.** It sees the DOM, but not the globals the page's own scripts define (`window.__NEXT_DATA__`, SPA stores, config objects): those read as `undefined` and the call still returns 200. On `stealth=false` (`engine: playwright`) the script runs in the page's main world. To read page JS state, start the slot with `stealth=false`, or read what the page wrote into the DOM (for example the text of `<script id="__NEXT_DATA__">`).
- `eval` POST accepts JSON `{"script":"..."}` (what the SDK and CLI send) or a `Content-Type: text/plain` body holding the raw script. The response is `{ "result": ... }`; a script that returns nothing gives `{}`.
- **A ref-addressed `hoody browser act` that navigates the page itself (a link click, a submit, a `pushState`) answers 200; the NEXT use of that snapshot's refs is stale.** A 200 means the browser operation completed, not that the site's transaction succeeded: observe the result with `hoody browser wait` and a new snapshot. A ref that is already stale, or becomes stale during target resolution or the pre-dispatch check, answers `409 STALE_SNAPSHOT` without `details.outcome`; no input was dispatched. Take a new snapshot. If staleness is detected during the final action call, the 409 carries `details.outcome`: `not-started` means input was withheld; `unknown` means the action may have been dispatched. For `unknown`, check the page (`hoody browser wait`, a new snapshot, the URL) before repeating a click or submit. Selector, role, label, text, placeholder and testId targets are not affected.
- Chromium CDP defaults to `useRemoteDebuggingPort=true`; pass `useRemoteDebuggingPort=false` at start to turn it off. `hoody browser start` sends `useRemoteDebuggingPort=true` unless told otherwise; `hoody browser restart` sends nothing for it unless you pass `--use-remote-debugging-port true|false`, so the instance keeps the setting it was started with. Firefox refuses it (`400 VALIDATION_ERROR`), so start Firefox with `--browser firefox --no-use-remote-debugging-port`. `hoody browser devtoolsurls get` answers 404 only when the instance is missing; with CDP off it returns 200 with null URLs. Use the URLs `hoody browser devtoolsurls get` returns rather than building one. By default the returned URLs are on the `cdp-X` relay host paired 1:1 with `browser-X` (`https://{P}-{C}-cdp-X.{N}.computers.hoody.com/`); a deployment that turns the relay URLs off returns the legacy `http-<port>` host instead, where `<port>` is the debugging port. Point a CDP client at the returned URL (for example `connectOverCDP("https://{P}-{C}-cdp-X.{N}.computers.hoody.com/")`). The rest of this bullet describes the `cdp-X` relay. A discovery request (`/`, `/json`, `/json/list`, `/json/version`) may cold-start Chromium instance X when it is not running: only when cold start is enabled (the default; a deployment can turn it off) and the request does not come from a web page, which gets `403 CDP_CSRF_COLD_START` instead. A DevTools WebSocket only attaches to a running instance. Only read-only endpoints (the discovery paths, `/json/protocol`, the `/devtools/` front end) and DevTools WebSocket sessions are relayed; `/json/new`, `/json/activate` and `/json/close` return 404. Treat the `cdp-X` URL like a credential: anyone who can reach it controls the browser (navigate, run script, read cookies and page content), so start with `useRemoteDebuggingPort=false` when the computer is shared.
- Launch options: the `viewport` and `geolocation` query parameters are **JSON strings**, not free-form `"WxH"` / `"lat,lng"`; the kit `JSON.parse`s a string value and rejects one that does not parse. In a JSON request body the same fields may also be plain objects. Examples: `viewport='{"width":1280,"height":800}'`, `geolocation='{"latitude":48.8,"longitude":2.3,"accuracy":50}'`. A launch `viewport` of `null` or `none` turns off fixed-viewport emulation. The runtime `hoody browser viewport set` is different: its body is an object, `{"viewport":{"width":1280,"height":800}}` or `{"viewport":null}` (integers 1–8192); a string there is a 400 `VALIDATION_ERROR`.
- `hoody browser viewport set` takes `{viewport:{width, height}}` (1-8192 px) or `{viewport:null}` for responsive. `hoody browser viewport set` sends a fixed size with `--viewport-width` and `--viewport-height`, or responsive mode with `--viewport null`. Responsive works only on Chromium (`501 NOT_SUPPORTED`) and only on an instance started responsive (`409 REQUIRES_RESTART`: stop it and start it again with `--viewport null` (`hoody browser restart --viewport null` does both steps)). `502 VIEWPORT_APPLY_INCOMPLETE` means the policy was kept but some tabs did not apply it (`details.failedTabs`). `hoody browser viewport get` never starts an instance.
- Screenshot `format` enum is `png | jpeg | base64` (NO `json`). Base64 mode returns `{ data: "<b64>" }` only — there is NO `mimeType` or `dataUrl` in the response (the kit's JSON body has `data` only).

## Common errors

- `VALIDATION_ERROR` 400 — malformed `viewport`/`geolocation`, history `limit` not 1–500, `offset`<0.
- `NOT_FOUND` 404 — no instance on the slot: `hoody browser stop` and `hoody browser shutdown` return `Instance not found`; `hoody browser devtoolsurls get` returns a longer message. Instance-dependent calls that do not start an absent instance, including `hoody browser snapshot get`/`hoody browser act`/`hoody browser wait` (they never auto-start) and applicable calls with `start=false`, can return different messages (`Not found: No active browser instance …`). Branch on the code, not the message.
- `HISTORY_DISABLED` 404 `History is disabled` — history endpoints where the deployment turned history off.
- `INSTANCE_BACKEND_MISMATCH` 409 (message starts `Instance backend mismatch`) — `stealth` differs from the running instance's backend; `hoody browser stop` then `hoody browser start`.
- `VALIDATION_ERROR` 400 `display is required when showBrowser=true (no DISPLAY detected)` — `showBrowser=true` with no `display` field on `hoody browser start` and no `$DISPLAY` env.
- `TIMEOUT` 408 / 504 — the request passed the kit's request deadline (600 s by default). While the request is launching or restarting the instance this is a 504 with `details.phase: "launch"` and `details.outcome: "unknown"`: the instance may still come up, so check `hoody browser get` with `start=false` before retrying. After the request was forwarded to a running instance it is a 504 with `details.phase: "proxy"` and `details.outcome: "unknown"`: the call may already have taken effect (a `hoody browser viewport set` included), so inspect the state before repeating a mutation. A request that times out while its body is still arriving is a 408. Any other work the kit does itself (a long `hoody browser history list` query, an `hoody browser stop` waiting for the start of the same instance) is a 504 with `details.phase: "server"` and `details.outcome: "unknown"`: the work is not cancelled and may still complete, so inspect the state before repeating a mutation.
- `TIMEOUT` 504 — an automation call (`hoody browser snapshot get`, `hoody browser act`, `hoody browser wait`) spent its `timeoutMs` budget (default 10000, max 30000). `details.phase` says where; `details.outcome` `not-started` means the action was never dispatched. For `hoody browser wait` this is how a condition that never held is reported.
- `STALE_SNAPSHOT` 409 — the ref's snapshot is no longer the tab's latest, or the main frame navigated; take a new snapshot. When `details.outcome` is present, read it before repeating an action (see Quirks).
- `INSTANCE_CHANGED` 409 — the `instanceGeneration` sent no longer matches the running instance (`details.expected` is null when no instance exists); re-read `hoody browser get`.
- `TAB_BUSY` 409 — another gated operation is in flight on that tab (`hoody browser act`, `hoody browser snapshot get`, `hoody browser navigate`, `hoody browser tabs close`, or a screenshot, PDF or markdown call that carries a `url`); `details.op` names it; wait for it. `hoody browser wait` never takes the gate.
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

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `hoody computers get` first. Warning: The `browser-X` hostname selects the instance; the proxy overwrites a `browser_port` or `display` in the query, and a `browser_id` (or a `browser_port`/`display` in a JSON body) that names another instance is refused with 400 `INSTANCE_SELECTOR_CONFLICT` (see the Quirks gotcha). Examples 1–5 and 8–9 use slot 1 (`browser-1`, `--browser-id 1`); Examples 6 and 7 use slots 2 and 3 so their different launch options do not collide with slot 1's running instance.

### 1. Spin up a headless instance and navigate to a URL

**Goal:** boot a Chromium instance, point it at a page, confirm it's alive. Headless avoids the X-display dependency (`showBrowser=false`).

**Step 1 — start.** Returns the start-response payload (`engine`, `headless`, `chromiumBuildId`, `browser_host`, `browser_port`). `hoody browser start` is idempotent — calling it again on the same slot returns the existing instance and ignores new options (a different `stealth` value is rejected with `409`).

```bash
hoody --computer "$C" browser start --browser-id 1 \
  --no-show-browser --no-stealth -o json \
  | jq '{engine,headless,chromiumBuildId,browser_port}'
```

**Step 2 — navigate.** `hoody browser navigate` opens or reuses a tab and waits for load.

```bash
hoody --computer "$C" browser navigate --browser-id 1 \
  --url https://httpbin.org/html
```

### 2. Full-page PNG screenshot

**Goal:** capture the entire scrolled height (not just the viewport). `format=base64` returns `{ data: "<b64>" }`; the default `format=png` returns raw `image/png` bytes.

```bash
hoody --computer "$C" browser screenshots capture --browser-id 1 \
  --full-page --url https://httpbin.org/html --format base64 -o raw \
  | base64 -d > /tmp/page.png   # -o raw prints the `data` string itself
```

### 3. Get the page HTML and the rendered text

**Goal:** read the post-JS DOM (HTML) and the page text. `hoody browser text get` returns `body.innerText` when the document has a body. Without one, such as in an XML or SVG document, it returns the root element's text content, or an empty string if there is no root element.

```bash
hoody --computer "$C" browser html get --browser-id 1 | head -c 200
hoody --computer "$C" browser text get --browser-id 1 | head -c 200
```

### 4. Execute JavaScript in the page and capture the return value

**Goal:** run a script in the page context. Over HTTP, `GET /api/v1/browser/eval?script=` puts the script in the query (size-bound by URL). `hoody browser evaluate` accepts `{ script }` JSON via the SDK / CLI / `Content-Type: application/json`; raw `Content-Type: text/plain` HTTP also works (body = script source). Either shape returns `{ result }` (`{}` when the script returns nothing). The script reads the DOM on every engine; page JS globals (`window.__NEXT_DATA__`, app stores) are visible when the reported engine is `playwright` (including after a fallback), and read as `undefined` when it is `patchright` (see Quirks).

```bash
hoody --computer "$C" browser evaluate --browser-id 1 \
  --script 'document.title'
hoody --computer "$C" browser evaluate --browser-id 1 \
  --script 'JSON.stringify({title: document.title, links: document.querySelectorAll("a").length})'
```

### 5. Set cookies and read them back

**Goal:** prime the cookie jar, then verify. POST body is a JSON object `{ cookies: [...] }` whose entries need `name`, `value`, and either an absolute http(s) `url` or both `domain` and `path`; do not combine `url` with `domain` or `path` (400 `VALIDATION_ERROR` naming the field). Optional: `httpOnly`, `secure`, `sameSite` (`Strict|Lax|None`), `expires` (Unix seconds, -1 = session).

```bash
# One --cookies per cookie: comma-separated key=value pairs; url, or domain + path.
hoody --computer "$C" browser cookies batch set --browser-id 1 \
  --cookies name=session,value=abc123,url=https://httpbin.org \
  --cookies name=theme,value=dark,url=https://httpbin.org
hoody --computer "$C" browser cookies list --browser-id 1 \
  --url https://httpbin.org
```

### 6. Authenticated scrape — set session cookie, browse, extract, clear

**Goal:** scrape a logged-in page without re-doing OAuth. Pre-load the session cookie a real login would have set, hit the protected URL, read text, then DELETE the jar.

```bash
hoody --computer "$C" browser start --browser-id 2 \
  --no-show-browser --no-stealth
hoody --computer "$C" browser cookies batch set --browser-id 2 \
  --cookies name=sessionid,value=REAL_TOKEN,url=https://app.example.com
hoody --computer "$C" browser navigate --browser-id 2 \
  --url https://app.example.com/dashboard
hoody --computer "$C" browser text get --browser-id 2 | head -c 400
hoody --computer "$C" browser cookies clear --browser-id 2
```

### 7. `hoody browser navigate` with explicit viewport, locale, and User-Agent

**Goal:** mimic a French mobile Safari to test geo/UA-gated content. Browser-context settings (`viewport`, `locale`, `timezoneId`, `userAgent`) apply when `hoody browser start` creates a new instance: on a slot that already has one, `start` returns that instance with its existing settings (or answers 409 `INSTANCE_BACKEND_MISMATCH` when `stealth` or `browser` differs), so stop it first to relaunch with these. `hoody browser navigate` carries the navigation body.

Set the size with the typed flags of `hoody browser viewport set` (`--viewport-width`, `--viewport-height`) once the instance runs. `browser start` takes `--geolocation` only as a JSON string such as `'{"latitude":48.8566,"longitude":2.3522,"accuracy":20}'`.

```bash
hoody --computer "$C" browser start --browser-id 3 \
  --no-show-browser --stealth \
  --locale fr-FR --timezone-id Europe/Paris \
  --user-agent 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' \
  --geolocation '{"latitude":48.8566,"longitude":2.3522,"accuracy":20}'
hoody --computer "$C" browser viewport set --browser-id 3 \
  --viewport-width 390 --viewport-height 844
hoody --computer "$C" browser navigate --browser-id 3 \
  --url https://httpbin.org/headers
hoody --computer "$C" browser text get --browser-id 3 | head -c 500
```

### 8. Inspect browsing history (filter by domain, then delete older entries)

**Goal:** When history is enabled, the kit records browser navigations under `/hoody/storage/hoody-browser/history` by default, but recording is not guaranteed. The page-navigation listener skips `about:blank`; API-triggered navigations are recorded through a separate path. Retention defaults to 30 days and is configurable, as is the directory. A query returns at most 500 entries per page. The delete step has no domain filter: it removes every entry older than the cutoff on the selected slot, for all domains. Query (through a `browser-N` host, slot N's entries only), then selectively delete.

```bash
hoody --computer "$C" browser history list \
  --since "$(date -u -d '1 hour ago' +%FT%TZ)" --limit 50 -o json \
  | jq '{total, has_more}'
hoody --computer "$C" browser history list --domain httpbin.org --limit 20 -o json \
  | jq '.entries | length'
# `history clear` asks for confirmation; pass -y/--yes to run it non-interactively.
hoody --computer "$C" browser history clear --yes \
  --before "$(date -u -d '7 days ago' +%FT%TZ)" \
  --browser-id 1
```

### 9. Capture instance metadata (engine, viewport, debug URL)

**Goal:** introspect what the kit actually launched — engine (`playwright`/`patchright`), Chromium build, executable path, current display, debug socket. Use `start=false` to query *without* auto-starting (404 if no instance exists).

```bash
hoody --computer "$C" browser get --browser-id 1 --no-start \
  | jq '{engine, headless, chromiumBuildId, browser_port}'
hoody --computer "$C" browser tabs list --browser-id 1 --no-start
```

For an external CDP attachment, `hoody browser devtoolsurls get` returns the live `webSocketDebuggerUrl` (CDP is on by default; default `useRemoteDebuggingPort=true`). If you started with `useRemoteDebuggingPort=false`, the call still returns 200 but `webSocketDebuggerUrl` is null. A 404 `Instance not found` means no instance exists at all (this route never starts an instance and ignores `start`).

### 10. Stop and shutdown — the ONLY safe ending

**Goal:** browser instances stay alive across requests until they are stopped or the kit process restarts (graceful kit restart SIGTERMs every child — see Quirks & gotchas). The idle sweep reaps an instance nobody has used for the max age (1 h by default), so a forgotten instance is eventually reclaimed, and one you still need must see a request at least once per idle window. Each slot has a fixed port, so a slot whose previous process has not been confirmed exited answers `502 INSTANCE_QUARANTINED` until it has; retry later rather than restarting the computer.

`hoody browser stop` and `hoody browser shutdown` both end the child, and its SIGTERM handler deletes its profile dir (the same cleanup as `/shutdown`). Every Chromium instance runs on a persistent profile of its own, with or without extensions (an extension profile under the kit's browser data dir, otherwise under the temp dir), and a new instance never reuses one, so cookies and logins do not carry over to the next instance. Profile cleanup is best-effort: a child killed before it cleans up (SIGKILL, OOM) leaves its profile until the stale-profile sweep that runs when a later instance starts; that sweep removes only profiles provably stale (a profile with no owner record, or an unreadable one, is kept), so a killed child that wrote its record is normally swept on a later start. One `hoody browser stop` per instance is a complete teardown — calling both is redundant.

```bash
for X in 1 2 3; do
  hoody --computer "$C" browser stop --browser-id "$X" || true
done
hoody --computer "$C" browser stats -o json | jq '.instances.total'
```

A `404 Instance not found` from `hoody browser stop` means no instance is registered on that slot: it is gone, or it is quarantined after an exit that was not confirmed. Neither `hoody browser stop` nor `hoody browser shutdown` creates an instance: on an empty slot both answer `404 Instance not found`. `hoody browser stop` waits a bounded time for the child to exit before it answers, and answers 200 even when that exit is not confirmed: the slot is then quarantined and answers `502 INSTANCE_QUARANTINED` until the process exits; `hoody browser shutdown` answers 200 as soon as shutdown starts and finishes in the background. The instance leaves routing before the reply, so `hoody browser get` with `start=false` answers 404 at once and does not show that the process exited. To wait for the teardown, call `hoody browser stop` on the same slot: it waits for the shutdown in flight to settle, then answers `404 Instance not found`. A later `hoody browser start` answers `502 INSTANCE_QUARANTINED` if the exit was not confirmed. Use `hoody browser stop` alone when you need the bounded wait.

## Reference

### `hoody browser` (30) — Browser automation and control

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody browser act` |  | action | Perform a native element action (click, fill, type, press, select, check, hover) | `browser.page.act` | `hoody browser act --browser-id 1 --tab-id 10 --action click --target-selector '#submit'` |
| `hoody browser cookies batch set` |  | write | Set cookies | `browser.cookies.setMany` | `hoody browser cookies batch set --browser-id 1 --start --cookies name=session,value=example,url=https://example.com` |
| `hoody browser cookies clear` |  | destructive | Clear all cookies | `browser.cookies.clear` | `hoody browser cookies clear --browser-id 1 --start` |
| `hoody browser cookies list` |  | read | Get cookies | `browser.cookies.list` | `hoody browser cookies list --browser-id 1 --start` |
| `hoody browser devtoolsurls get` |  | read | Get DevTools URLs | `browser.instances.getDevtoolsUrls` | `hoody browser devtoolsurls get --browser-id 1 --start` |
| `hoody browser evaluate` |  | action | Execute JavaScript (POST) | `browser.page.evaluate` | `hoody browser evaluate --browser-id 1 --start --script document.title` |
| `hoody browser get` |  | read | Get instance metadata | `browser.instances.get` | `hoody browser get --browser-id 1 --start` |
| `hoody browser health` |  | read | Health check | `browser.kit.getHealth` | `hoody browser health` |
| `hoody browser history clear` |  | destructive | Delete browsing history | `browser.history.clear` | `hoody browser history clear --before 2026-01-01T00:00:00Z --browser-id 1 -y` |
| `hoody browser history list` |  | read | Query browsing history | `browser.history.list` | `hoody browser history list --since 2026-01-01T00:00:00Z --domain example.com` |
| `hoody browser html get` |  | read | Get page HTML | `browser.page.getHtml` | `hoody browser html get --browser-id 1 --tab-id 1` |
| `hoody browser logs console list` |  | read | Get console logs (use `--clear` to also clear) | `browser.logs.listConsole` | `hoody browser logs console list --browser-id 1 --tab-id 1` |
| `hoody browser logs network list` |  | read | Get network logs (use `--clear` to also clear) | `browser.logs.listNetwork` | `hoody browser logs network list --browser-id 1 --tab-id 1` |
| `hoody browser markdown get` |  | read | Get page as Markdown | `browser.page.getMarkdown` | `hoody browser markdown get --browser-id 1 --tab-id 1` |
| `hoody browser navigate` |  | action | Navigate to URL (POST) | `browser.page.navigate` | `hoody browser navigate --browser-id 1 --start --url https://example.com` |
| `hoody browser open` |  | action | Open the Browser kit service (browser automation UI) in your browser |  | `hoody browser open` |
| `hoody browser pdf export` |  | read | Export page as PDF | `browser.page.exportPdf` | `hoody browser pdf export --browser-id 1 --tab-id 1` |
| `hoody browser restart` |  | action | Restart browser instance | `browser.instances.restart` | `hoody browser restart --browser-id 1 --start` |
| `hoody browser screenshots capture` |  | read | Capture browser screenshot | `browser.page.captureScreenshot` | `hoody browser screenshots capture --browser-id 1 --start` |
| `hoody browser shutdown` |  | destructive | Shutdown browser instance | `browser.instances.shutdown` | `hoody browser shutdown --browser-id 1` |
| `hoody browser snapshot get` |  | read | Accessibility snapshot of a tab with element refs | `browser.page.getSnapshot` | `hoody browser snapshot get --browser-id 1 --tab-id 1` |
| `hoody browser start` |  | action | Create or retrieve browser instance | `browser.instances.start` | `hoody browser start --browser-id 1 --fingerprint-id default` |
| `hoody browser stats` |  | read | Server metrics | `browser.kit.getStats` | `hoody browser stats` |
| `hoody browser stop` |  | action | Stop browser instance | `browser.instances.stop` | `hoody browser stop --browser-id 1` |
| `hoody browser tabs close` |  | write | Close a browser tab | `browser.tabs.close` | `hoody browser tabs close --browser-id 1 --start` |
| `hoody browser tabs list` |  | read | List browser tabs | `browser.tabs.list` | `hoody browser tabs list --browser-id 1 --start` |
| `hoody browser text get` |  | read | Get page text | `browser.page.getText` | `hoody browser text get --browser-id 1 --tab-id 1` |
| `hoody browser viewport get` |  | read | Show the instance's current viewport policy | `browser.viewport.get` | `hoody browser viewport get --browser-id 1` |
| `hoody browser viewport set` |  | write | Change the viewport of a running instance | `browser.viewport.set` | `hoody browser viewport set --viewport-width 10 --viewport-height 10 --browser-id 1` |
| `hoody browser wait` |  | action | Wait for a condition in a tab | `browser.page.wait` | `hoody browser wait --browser-id 1 --tab-id 10 --condition-kind target --condition-target-selector '#submit' --condition-state attached` |

