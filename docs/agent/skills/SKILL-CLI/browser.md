> _**CLI skill · `browser` namespace** · ~7,701 tokens · hoody-sdk v1.0.0-beta.16_

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
- External CDP on Chromium through the URL that `hoody browser devtools urls get` returns (on by default; `useRemoteDebuggingPort=false` turns it off; Firefox never exposes it).

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
1. `hoody browser start` → `hoody browser navigate`.
2. `hoody browser evaluate` (`{script}` JSON body). On the default stealth engine the script cannot see page JS globals (see Quirks).
3. `hoody browser logs console list` (`since`,`type`,`clear=true`).
4. `hoody browser logs network list`.

### 5. History
`hoody browser history list` (filters: `since`/`domain`/`browser_id`) and `hoody browser history clear` (`before` + `browser_id` AND). In history, `browser_id` is the slot number X the navigation ran on.

### 6. Dedicated project browser — suggest it to the user
When the work is a website project or business research, **offer** the user a dedicated recorded browser. This is a suggestion to the user only — set it up when they ask, don't spin it up unprompted.
1. Pick a slot number X (e.g. 2) and start headful on that slot: `hoody browser start` addressed to the `browser-X` hostname (`--browser-id X`) with `showBrowser=true`. The proxy derives `browser_port` 30000+X and `display` 500+X from the hostname and overrides any values you send. Add any per-project identity: own egress proxy (`proxyServer`/`proxyUsername`/`proxyPassword`/`proxyBypass`), `stealth`, `userAgent`, `viewport`, `locale`, `geolocation`, extensions.
2. Give the user the direct live-view URL — the standard kit URL with the `browser-` slug and `?view=display`: `https://{P}-{C}-browser-X.{N}.containers.hoody.com/?view=display`. That page embeds display 500+X live (the bare root URL shows an instance status page with a View Display link instead), so an instance started on display 500+X gets its own stable viewing URL — changing the X in the URL is how you address each browser's live window. `hoody browser devtools urls get` adds a live DevTools inspector as a second link; that link gives full control of the browser, so hand it only to someone you would give the browser to.
3. Everything browsed there — by the user clicking around in the live view or by the agent via the API — lands in persistent per-slot history (`hoody browser history list` with `browser_id=X`): live debugging and business research accumulate into one durable project trail. The instance itself is reaped once it has been idle past the deployment's max age (see Quirks) — history survives; re-run `hoody browser start` with the same options to revive the window.
4. Then offer log capture as a follow-up: console/network buffers hold only the last 500 entries and die with the instance, so a recurring `cron` job (or agent loop) draining `hoody browser logs console list`/`hoody browser logs network list` with `clear=true` into `sqlite`/`files`/agent memory preserves full context for later sessions.

### 7. Drive a page: snapshot, act, wait
These three operations never start an instance (404 `NOT_FOUND` on an empty slot), so run `hoody browser start` and `hoody browser navigate` first.
1. `hoody browser get` and keep `instanceGeneration`. Passing it back on the calls below turns "the instance was replaced" into a 409 `INSTANCE_CHANGED` instead of acting on a fresh browser.
2. `hoody browser snapshot get` returns the tab's accessibility tree as YAML with `[ref=eN]` markers, plus a `snapshotId`. Entered form values read as `<value hidden>` unless `includeValues=true`.
3. `hoody browser act` with `action` (one of `click | fill | type | press | select | check | hover`) and a `target`: either `{ref, snapshotId}` from the latest snapshot, or exactly one of `selector`, `role` (+ `name`), `label`, `text`, `placeholder`, `testId`. A 200 means the browser operation completed, not that the site accepted it.
4. `hoody browser wait` with a condition (`kind`: `target`, `text`, `url` or `loadState`) to observe the result. A miss is 504 `TIMEOUT`, never `matched: false`.
5. Take a new snapshot before using refs again: a newer snapshot or a main-frame navigation invalidates the old refs (409 `STALE_SNAPSHOT`).
`hoody browser viewport get`/`hoody browser viewport set` read and change the viewport of a running instance without a restart.

## Quirks & gotchas

- The `browser-X` hostname selects the instance: the proxy derives `browser_port` 30000+X and `display` 500+X from it and overrides caller-supplied values. A `browser_id` (or another instance selector in the query or JSON body) that names a different instance is refused with 400 `INSTANCE_SELECTOR_CONFLICT`, `details.field` naming it, and nothing runs: leave it out or call that instance's own host. Choose the slot with `--browser-id X` as a number (the CLI puts it in the hostname; a value that is not a whole number such as 0, 1, 2 is refused with an error before any request is sent). On history, `browser_id` also filters, equal to X.
- Endpoints auto-create unless `start=false`. Where a deployment disables auto-start, only an explicit `start=true` creates an instance. `hoody browser snapshot get`, `hoody browser act` and `hoody browser wait` never create one.
- `stealth` defaults true; bare `?stealth`=true. Mid-flight change throws `Instance backend mismatch` — `hoody browser stop` first.
- `stealth=true` is ignored on Firefox: the stealth engine is Chromium-only.
- Extensions need `showBrowser=true` and run on a persistent profile.
- `chromiumVersion`: full / major / channel (`stable|beta|dev|canary`); first new version blocks on download.
- Console/network logs: 500-entry ring buffers — drain or filter `since`.
- **A sweep runs every 5 min and SIGTERMs any instance idle for 1 h (deployment defaults), healthy or not.** The idle clock is restarted by real use: every API request routed to the instance (counted from the END of the request), a top-level page navigation (including a person clicking around in the live view), attaching over CDP, and starting an instance that already exists. An instance with a request in flight or an open CDP connection is never reaped. The instance's own heartbeat is liveness only and does NOT keep it alive, so an instance you want to keep (logged-in cookies, session state) needs a request at least once per idle window. A reaped instance's next call starts a fresh one, with none of the cookies or session state the old one held; recorded history survives.
- Instances do NOT survive kit-process restarts: graceful shutdown (SIGTERM/SIGINT) terminates every child.
- History records ALL navs (incl. headful clicks) at `/hoody/storage/hoody-browser/history`, retained 30 d by default. Where a deployment turns history off, the history endpoints answer `404 HISTORY_DISABLED`.
- **`hoody browser history clear` is scoped by the host:** through a `browser-N` host it clears only instance N's history (add `before` to keep newer entries); a `browser_id` naming another instance is refused with 400 `INSTANCE_SELECTOR_CONFLICT`. To clear several instances, call it on each instance's host.
- `browser_id` history filter sanitised as path component.
- **On the default stealth engine (`stealth=true`, `engine: patchright`), `eval` runs the script in an isolated JavaScript world.** It sees the DOM, but not the globals the page's own scripts define (`window.__NEXT_DATA__`, SPA stores, config objects): those read as `undefined` and the call still returns 200. On `stealth=false` (`engine: playwright`) the script runs in the page's main world. To read page JS state, start the slot with `stealth=false`, or read what the page wrote into the DOM (for example the text of `<script id="__NEXT_DATA__">`).
- `eval` POST accepts JSON `{"script":"..."}` (what the SDK and CLI send) or a `Content-Type: text/plain` body holding the raw script. The response is `{ "result": ... }`.
- **A ref-addressed `hoody browser act` that navigates the page itself (a link click, a submit, a `pushState`) can answer `409 STALE_SNAPSHOT` with `details.outcome: "unknown"` after the action already ran.** `outcome` is `not-started` (never dispatched, safe to repeat), `unknown` (dispatched, result not observed) or `completed`. On `unknown`, check the page (`hoody browser wait`, a new snapshot, the URL) before repeating a click or submit. Selector, role, label, text, placeholder and testId targets are not affected.
- Chromium CDP defaults to `useRemoteDebuggingPort=true`; pass `useRemoteDebuggingPort=false` at start to turn it off. `hoody browser devtools urls get` answers 404 only when the instance is missing; with CDP off it returns 200 with null URLs. Use the URLs `hoody browser devtools urls get` returns rather than building one. By default the returned URLs are on the `cdp-X` relay host paired 1:1 with `browser-X` (`https://{P}-{C}-cdp-X.{N}.containers.hoody.com/`); a deployment that turns the relay URLs off returns the legacy `http-<port>` host instead, where `<port>` is the debugging port. Point a CDP client at the returned URL (for example `connectOverCDP("https://{P}-{C}-cdp-X.{N}.containers.hoody.com/")`). The rest of this bullet describes the `cdp-X` relay. A discovery request (`/`, `/json`, `/json/list`, `/json/version`) may cold-start Chromium instance X when it is not running: only when cold start is enabled (the default; a deployment can turn it off) and the request does not come from a web page, which gets `403 CDP_CSRF_COLD_START` instead. A DevTools WebSocket only attaches to a running instance. Only read-only endpoints (the discovery paths, `/json/protocol`, the `/devtools/` front end) and DevTools WebSocket sessions are relayed; `/json/new`, `/json/activate` and `/json/close` return 404. Treat the `cdp-X` URL like a credential: anyone who can reach it controls the browser (navigate, run script, read cookies and page content), so start with `useRemoteDebuggingPort=false` when the container is shared.
- Launch options: the `viewport` and `geolocation` query parameters are **JSON strings**, not free-form `"WxH"` / `"lat,lng"`; the kit `JSON.parse`s a string value and rejects one that does not parse. In a JSON request body the same fields may also be plain objects. Examples: `viewport='{"width":1280,"height":800}'`, `geolocation='{"latitude":48.8,"longitude":2.3,"accuracy":50}'`. A launch `viewport` of `null` or `none` turns off fixed-viewport emulation. The runtime `hoody browser viewport set` is different: its body is an object, `{"viewport":{"width":1280,"height":800}}` or `{"viewport":null}` (integers 1–8192); a string there is a 400 `VALIDATION_ERROR`.
- `hoody browser viewport set` takes `{viewport:{width, height}}` (1-8192 px) or `{viewport:null}` for responsive. `hoody browser viewport set` sends only a fixed size. Responsive works only on Chromium (`501 NOT_SUPPORTED`) and only on an instance started responsive (`409 REQUIRES_RESTART`: stop it and start it again with `viewport=null`). `502 VIEWPORT_APPLY_INCOMPLETE` means the policy was kept but some tabs did not apply it (`details.failedTabs`). `hoody browser viewport get` never starts an instance.
- Screenshot `format` enum is `png | jpeg | base64` (NO `json`). Base64 mode returns `{ data: "<b64>" }` only — there is NO `mimeType` or `dataUrl` in the response (the kit's JSON body has `data` only).

## Common errors

- `VALIDATION_ERROR` 400 — malformed `viewport`/`geolocation`, history `limit` not 1–500, `offset`<0.
- `NOT_FOUND` 404 `Instance not found` — `hoody browser stop`, `hoody browser shutdown`, `hoody browser devtools urls get`, `start=false` no instance; also `hoody browser snapshot get`/`hoody browser act`/`hoody browser wait` on an empty slot, since they never auto-start.
- `HISTORY_DISABLED` 404 `History is disabled` — history endpoints where the deployment turned history off.
- `INSTANCE_BACKEND_MISMATCH` 409 (message starts `Instance backend mismatch`) — `stealth` differs from the running instance's backend; `hoody browser stop` then `hoody browser start`.
- `VALIDATION_ERROR` 400 `display is required when showBrowser=true (no DISPLAY detected)` — `showBrowser=true` with no `display` field on `hoody browser start` and no `$DISPLAY` env.
- `TIMEOUT` 408 / 504 — the request passed the kit's request deadline (600 s by default). While the request is launching or restarting the instance this is a 504 with `details.phase: "launch"` and `details.outcome: "unknown"`: the instance may still come up, so check `hoody browser get` with `start=false` before retrying. After the request was forwarded to a running instance it is a 504 with `details.phase: "proxy"` and `details.outcome: "unknown"`: the call may already have taken effect (a `hoody browser viewport set` included), so inspect the state before repeating a mutation. A request that times out before either is a 408.
- `TIMEOUT` 504 — an automation call (`hoody browser snapshot get`, `hoody browser act`, `hoody browser wait`) spent its `timeoutMs` budget (default 10000, max 30000). `details.phase` says where; `details.outcome` `not-started` means the action was never dispatched. For `hoody browser wait` this is how a condition that never held is reported.
- `STALE_SNAPSHOT` 409 — the ref's snapshot is no longer the tab's latest, or the main frame navigated; take a new snapshot. Read `details.outcome` before repeating an action (see Quirks).
- `INSTANCE_CHANGED` 409 — the `instanceGeneration` sent no longer matches the running instance (`details.expected` is null when no instance exists); re-read `hoody browser get`.
- `TAB_BUSY` 409 — another `hoody browser act`, `hoody browser snapshot get` or `hoody browser navigate` is in flight on that tab (`details.op` names it); wait for it.
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

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. ⚠ The `browser-X` hostname selects the instance; a `browser_id` or `browser_port` that names another instance is refused with 400 `INSTANCE_SELECTOR_CONFLICT` (see the Quirks gotcha). Examples 1–5 and 8–9 use slot 1 (`browser-1`, `--browser-id 1`); Examples 6 and 7 use slots 2 and 3 so their different launch options do not collide with slot 1's running instance.

### 1. Spin up a headless instance and navigate to a URL

**Goal:** boot a Chromium instance, point it at a page, confirm it's alive. Headless avoids the X-display dependency (`showBrowser=false`).

**Step 1 — start.** Returns the start-response payload (`engine`, `headless`, `chromiumBuildId`, `browser_host`, `browser_port`). `hoody browser start` is idempotent — calling it again on the same slot returns the existing instance and ignores new options (a different `stealth` value is rejected with `409`).

```bash
hoody --container "$C" browser start --browser-id 1 \
  --no-show-browser --no-stealth -o json \
  | jq '{engine,headless,chromiumBuildId,browser_port}'
```

**Step 2 — navigate.** `hoody browser navigate` opens or reuses a tab and waits for load.

```bash
hoody --container "$C" browser navigate --browser-id 1 \
  --url https://httpbin.org/html
```

### 2. Full-page PNG screenshot

**Goal:** capture the entire scrolled height (not just the viewport). `format=base64` returns `{ data: "<b64>" }`; the default `format=png` returns raw `image/png` bytes.

```bash
hoody --container "$C" browser screenshots capture --browser-id 1 \
  --full-page --url https://httpbin.org/html --format base64 -o raw \
  | base64 -d > /tmp/page.png   # -o raw prints the `data` string itself
```

### 3. Get the page HTML and the rendered text

**Goal:** read the post-JS DOM (HTML) and the visible text the user would see (`hoody browser text get` returns the `innerText` of `body`).

```bash
hoody --container "$C" browser html get --browser-id 1 | head -c 200
hoody --container "$C" browser text get --browser-id 1 | head -c 200
```

### 4. Execute JavaScript in the page and capture the return value

**Goal:** run a script in the page context. Over HTTP, `GET /eval?script=` puts the script in the query (size-bound by URL). `hoody browser evaluate` accepts `{ script }` JSON via the SDK / CLI / `Content-Type: application/json`; raw `Content-Type: text/plain` HTTP also works (body = script source). Either shape returns `{ result }`. The script reads the DOM on every engine; page JS globals (`window.__NEXT_DATA__`, app stores) are visible only on a `stealth=false` instance, and read as `undefined` on the default stealth engine (see Quirks).

```bash
hoody --container "$C" browser evaluate --browser-id 1 \
  --script 'document.title'
hoody --container "$C" browser evaluate --browser-id 1 \
  --script 'JSON.stringify({title: document.title, links: document.querySelectorAll("a").length})'
```

### 5. Set cookies and read them back

**Goal:** prime the cookie jar, then verify. POST body is a JSON object `{ cookies: [...] }` whose entries need `name`, `value`, and either an absolute http(s) `url` or both `domain` and `path`; do not combine `url` with `domain` or `path` (400 `VALIDATION_ERROR` naming the field). Optional: `httpOnly`, `secure`, `sameSite` (`Strict|Lax|None`), `expires` (Unix seconds, -1 = session).

```bash
# One --cookies per cookie: comma-separated key=value pairs; url, or domain + path.
hoody --container "$C" browser cookies batch set --browser-id 1 \
  --cookies name=session,value=abc123,url=https://httpbin.org \
  --cookies name=theme,value=dark,url=https://httpbin.org
hoody --container "$C" browser cookies list --browser-id 1 \
  --url https://httpbin.org
```

### 6. Authenticated scrape — set session cookie, browse, extract, clear

**Goal:** scrape a logged-in page without re-doing OAuth. Pre-load the session cookie a real login would have set, hit the protected URL, read text, then DELETE the jar.

```bash
hoody --container "$C" browser start --browser-id 2 \
  --no-show-browser --no-stealth
hoody --container "$C" browser cookies batch set --browser-id 2 \
  --cookies name=sessionid,value=REAL_TOKEN,url=https://app.example.com
hoody --container "$C" browser navigate --browser-id 2 \
  --url https://app.example.com/dashboard
hoody --container "$C" browser text get --browser-id 2 | head -c 400
hoody --container "$C" browser cookies clear --browser-id 2
```

### 7. `hoody browser navigate` with explicit viewport, locale, and User-Agent

**Goal:** mimic a French mobile Safari to test geo/UA-gated content. Browser-context settings (`viewport`, `locale`, `timezoneId`, `userAgent`) are set at `hoody browser start`; `hoody browser navigate` carries the navigation body.

`viewport` is a JSON string such as `'{"width":390,"height":844}'`. `geolocation` is a JSON string such as `'{"latitude":48.8566,"longitude":2.3522,"accuracy":20}'`.

```bash
hoody --container "$C" browser start --browser-id 3 \
  --no-show-browser --stealth \
  --viewport '{"width":390,"height":844}' --locale fr-FR --timezone-id Europe/Paris \
  --user-agent 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' \
  --geolocation '{"latitude":48.8566,"longitude":2.3522,"accuracy":20}'
hoody --container "$C" browser navigate --browser-id 3 \
  --url https://httpbin.org/headers
hoody --container "$C" browser text get --browser-id 3 | head -c 500
```

### 8. Inspect browsing history (filter by domain, then drop one host)

**Goal:** the kit records every navigation under `/hoody/storage/hoody-browser/history` (30-day retention, 500-entry pagination cap). Query, then selectively delete.

```bash
hoody --container "$C" browser history list \
  --since "$(date -u -d '1 hour ago' +%FT%TZ)" --limit 50 -o json \
  | jq '{total, has_more}'
hoody --container "$C" browser history list --domain httpbin.org --limit 20 -o json \
  | jq '.entries | length'
# `history clear` asks for confirmation; pass -y/--yes to run it non-interactively.
hoody --container "$C" browser history clear --yes \
  --before "$(date -u -d '7 days ago' +%FT%TZ)" \
  --browser-id 1
```

### 9. Capture instance metadata (engine, viewport, debug URL)

**Goal:** introspect what the kit actually launched — engine (`playwright`/`patchright`), Chromium build, executable path, current display, debug socket. Use `start=false` to query *without* auto-starting (404 if no instance exists).

```bash
hoody --container "$C" browser get --browser-id 1 --no-start \
  | jq '{engine, headless, chromiumBuildId, browser_port}'
hoody --container "$C" browser tabs list --browser-id 1 --no-start
```

For an external CDP attachment, `hoody browser devtools urls get` returns the live `webSocketDebuggerUrl` (CDP is on by default; default `useRemoteDebuggingPort=true`). If you started with `useRemoteDebuggingPort=false`, the call still returns 200 but `webSocketDebuggerUrl` is null. A 404 `Instance not found` means no instance exists at all (e.g. queried with `start=false`).

### 10. Stop and shutdown — the ONLY safe ending

**Goal:** browser instances stay alive across requests until they are stopped or the kit process restarts (graceful kit restart SIGTERMs every child — see Quirks & gotchas). The idle sweep reaps an instance nobody has used for the max age (1 h by default), so a forgotten instance is eventually reclaimed, and one you still need must see a request at least once per idle window. Each slot has a fixed port, so a slot whose previous process has not been confirmed exited answers `502 INSTANCE_QUARANTINED` until it has; retry later rather than restarting the container.

`hoody browser stop` and `hoody browser shutdown` both terminate the child and delete its profile dir (the child's SIGTERM handler runs the same cleanup as `/shutdown`). Every Chromium instance runs on a persistent profile of its own, with or without extensions (an extension profile under the kit's browser data dir, otherwise under the temp dir), and every exit removes it, so cookies and logins do not carry over to the next instance. One `hoody browser stop` per instance is a complete teardown — calling both is redundant.

```bash
for X in 1 2 3; do
  hoody --container "$C" browser stop --browser-id "$X" || true
done
hoody --container "$C" browser stats -o json | jq '.instances'
```

A `404 Instance not found` from `hoody browser stop` means it was already gone — safe to ignore. Neither `hoody browser stop` nor `hoody browser shutdown` creates an instance: on an empty slot both answer `404 Instance not found`. `hoody browser stop` terminates the child before it answers; `hoody browser shutdown` answers 200 as soon as shutdown starts and finishes in the background, so poll `hoody browser get` with `start=false` until it answers 404 to confirm the instance is gone.

## Reference

### `hoody browser` (29) — Browser automation and control

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody browser act` |  | action | Perform a native element action (click, fill, type, press, select, check, hover) | `browser.page.act` | `hoody browser act --browser-id 1 --tab-id 10 --action click --target-selector '#submit'` |
| `hoody browser cookies batch set` |  | write | Set cookies | `browser.cookies.setMany` | `hoody browser cookies batch set --browser-id 1 --start --cookies name=my-resource,value=hello` |
| `hoody browser cookies clear` |  | destructive | Clear all cookies | `browser.cookies.clear` | `hoody browser cookies clear --browser-id 1 --start` |
| `hoody browser cookies list` |  | read | Get cookies | `browser.cookies.list` | `hoody browser cookies list --browser-id 1 --start` |
| `hoody browser devtools urls get` |  | read | Get DevTools URLs | `browser.instances.getDevtoolsUrls` | `hoody browser devtools urls get --browser-id 1 --start` |
| `hoody browser evaluate` |  | action | Execute JavaScript (POST) | `browser.page.evaluate` | `hoody browser evaluate --browser-id 1 --start --script document.title` |
| `hoody browser get` |  | read | Get instance metadata | `browser.instances.get` | `hoody browser get --browser-id 1 --start` |
| `hoody browser health` |  | read | Health check | `browser.kit.getHealth` | `hoody browser health` |
| `hoody browser history clear` |  | destructive | Delete browsing history | `browser.history.clear` | `hoody browser history clear --before 2026-01-01T00:00:00Z --browser-id 1 -y` |
| `hoody browser history list` |  | read | Query browsing history | `browser.history.list` | `hoody browser history list --since 2026-01-01T00:00:00Z --domain example.com` |
| `hoody browser html get` |  | read | Get page HTML | `browser.page.getHtml` | `hoody browser html get --browser-id 1 --tab-id 10` |
| `hoody browser logs console list` |  | read | Get console logs (use `--clear` to also clear) | `browser.logs.listConsole` | `hoody browser logs console list --browser-id 1 --tab-id 10` |
| `hoody browser logs network list` |  | read | Get network logs (use `--clear` to also clear) | `browser.logs.listNetwork` | `hoody browser logs network list --browser-id 1 --tab-id 10` |
| `hoody browser navigate` |  | action | Navigate to URL (POST) | `browser.page.navigate` | `hoody browser navigate --browser-id 1 --start --url https://example.com` |
| `hoody browser open` |  | action | Open the Browser kit service (browser automation UI) in your browser |  | `hoody browser open` |
| `hoody browser pdf export` |  | read | Export page as PDF | `browser.page.exportPdf` | `hoody browser pdf export --browser-id 1 --tab-id 10` |
| `hoody browser restart` |  | action | Restart browser instance | `browser.instances.restart` | `hoody browser restart --browser-id 1 --start` |
| `hoody browser screenshots capture` |  | read | Capture browser screenshot | `browser.page.captureScreenshot` | `hoody browser screenshots capture --browser-id 1 --start` |
| `hoody browser shutdown` |  | destructive | Shutdown browser instance | `browser.instances.shutdown` | `hoody browser shutdown --browser-id 1` |
| `hoody browser snapshot get` |  | read | Accessibility snapshot of a tab with element refs | `browser.page.getSnapshot` | `hoody browser snapshot get --browser-id 1 --tab-id 10` |
| `hoody browser start` |  | action | Create or retrieve browser instance | `browser.instances.start` | `hoody browser start --browser-id 1 --fingerprint-id default` |
| `hoody browser stats` |  | read | Server metrics | `browser.kit.getStats` | `hoody browser stats` |
| `hoody browser stop` |  | action | Stop browser instance | `browser.instances.stop` | `hoody browser stop --browser-id 1` |
| `hoody browser tabs close` |  | write | Close a browser tab | `browser.tabs.close` | `hoody browser tabs close --browser-id 1 --start` |
| `hoody browser tabs list` |  | read | List browser tabs | `browser.tabs.list` | `hoody browser tabs list --browser-id 1 --start` |
| `hoody browser text get` |  | read | Get page text | `browser.page.getText` | `hoody browser text get --browser-id 1 --tab-id 10` |
| `hoody browser viewport get` |  | read | Show the instance's current viewport policy | `browser.viewport.get` | `hoody browser viewport get --browser-id 1` |
| `hoody browser viewport set` |  | write | Change the viewport of a running instance | `browser.viewport.set` | `hoody browser viewport set --viewport-width 10 --viewport-height 10 --browser-id 1` |
| `hoody browser wait` |  | action | Wait for a condition in a tab | `browser.page.wait` | `hoody browser wait --browser-id 1 --tab-id 10 --condition-kind target --condition-target-selector '#submit' --condition-state attached` |

