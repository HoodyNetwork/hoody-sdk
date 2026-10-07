> _**HTTP skill · `browser` namespace** · ~15,066 tokens · hoody-sdk v1.0.0-beta.16_

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
- External CDP on Chromium through the URL that `GET /devtools-url` returns (on by default; `useRemoteDebuggingPort=false` turns it off; Firefox never exposes it).

## When NOT to use

- Plain HTTP, persistence, server scripts, stream UI, shell → `curl`/`sqlite`/`exec`/`display`/`terminal`.

## Prerequisites

- Headful (default `showBrowser=true`) needs X display: `?display=` or `DISPLAY`. Extensions also require `showBrowser=true`.
- `GET /pdf` works only on a headless Chromium instance: start it with `showBrowser=false`. Firefox and headful instances return `501 NOT_SUPPORTED`. 

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

## Common workflows

### 1. Start + navigate
1. `GET /start` on the slot's hostname + overrides (proxy, stealth, fingerprintId, viewport, locale, timezoneId, userAgent, geolocation).
2. `POST /browse` — `tabId`, `onlyIfNotExists=true`. 
3. `GET /metadata`.

### 2. Extract content
After browse: `GET /html`/`GET /text`/`GET /screenshot`/`GET /pdf` — params in Reference. `GET /pdf` needs a headless Chromium instance (see Prerequisites).

### 3. Authenticated scraping
1. `GET /start` matching `userAgent`/`viewport`/`locale`.
2. `POST /cookies` with a `cookies` list of `{name, value, url}` entries; each cookie needs `name`, `value` and either an absolute http(s) `url` or both `domain` and `path` (never `url` together with `domain` or `path`). 
3. `POST /browse` to protected URL.
4. `GET /html`/`GET /text`.
5. `DELETE /cookies`.

### 4. JS eval + logs
1. `GET /start` → `POST /browse`.
2. `POST /eval` (`{script}` JSON body; a raw `text/plain` body also works, and `GET /eval?script=` takes the script in the query). On the default stealth engine the script cannot see page JS globals (see Quirks).
3. `GET /console` (`since`,`type`,`clear=true`).
4. `GET /network`.

### 5. History
`GET /history` (filters: `since`/`domain`/`browser_id`) and `DELETE /history` (`before` + `browser_id` AND). In history, `browser_id` is the slot number X the navigation ran on.

### 6. Dedicated project browser — suggest it to the user
When the work is a website project or business research, **offer** the user a dedicated recorded browser. This is a suggestion to the user only — set it up when they ask, don't spin it up unprompted.
1. Pick a slot number X (e.g. 2) and start headful on that slot: `GET /start` addressed to the `browser-X` hostname (the `browser-X` host) with `showBrowser=true`. The proxy derives `browser_port` 30000+X and `display` 500+X from the hostname and overrides any values you send. Add any per-project identity: own egress proxy (`proxyServer`/`proxyUsername`/`proxyPassword`/`proxyBypass`), `stealth`, `userAgent`, `viewport`, `locale`, `geolocation`, extensions.
2. Give the user the direct live-view URL — the standard kit URL with the `browser-` slug and `?view=display`: `https://{P}-{C}-browser-X.{N}.containers.hoody.com/?view=display`. That page embeds display 500+X live (the bare root URL shows an instance status page with a View Display link instead), so an instance started on display 500+X gets its own stable viewing URL — changing the X in the URL is how you address each browser's live window. `GET /devtools-url` adds a live DevTools inspector as a second link; that link gives full control of the browser, so hand it only to someone you would give the browser to.
3. Everything browsed there — by the user clicking around in the live view or by the agent via the API — lands in persistent per-slot history (`GET /history` with `browser_id=X`): live debugging and business research accumulate into one durable project trail. The instance itself is reaped once it has been idle past the deployment's max age (see Quirks) — history survives; re-run `GET /start` with the same options to revive the window.
4. Then offer log capture as a follow-up: console/network buffers hold only the last 500 entries and die with the instance, so a recurring `cron` job (or agent loop) draining `GET /console`/`GET /network` with `clear=true` into `sqlite`/`files`/agent memory preserves full context for later sessions.

### 7. Drive a page: snapshot, act, wait
These three operations never start an instance (404 `NOT_FOUND` on an empty slot), so run `GET /start` and `POST /browse` first.
1. `GET /metadata` and keep `instanceGeneration`. Passing it back on the calls below turns "the instance was replaced" into a 409 `INSTANCE_CHANGED` instead of acting on a fresh browser.
2. `GET /snapshot` returns the tab's accessibility tree as YAML with `[ref=eN]` markers, plus a `snapshotId`. Entered form values read as `<value hidden>` unless `includeValues=true`.
3. `POST /action` with `action` (one of `click | fill | type | press | select | check | hover`) and a `target`: either `{ref, snapshotId}` from the latest snapshot, or exactly one of `selector`, `role` (+ `name`), `label`, `text`, `placeholder`, `testId`. A 200 means the browser operation completed, not that the site accepted it.
4. `POST /wait` with a condition (`kind`: `target`, `text`, `url` or `loadState`) to observe the result. A miss is 504 `TIMEOUT`, never `matched: false`.
5. Take a new snapshot before using refs again: a newer snapshot or a main-frame navigation invalidates the old refs (409 `STALE_SNAPSHOT`).
`GET /viewport`/`POST /viewport` read and change the viewport of a running instance without a restart.

## Quirks & gotchas

- The `browser-X` hostname selects the instance: the proxy derives `browser_port` 30000+X and `display` 500+X from it and overrides caller-supplied values. A `browser_id` (or another instance selector in the query or JSON body) that names a different instance is refused with 400 `INSTANCE_SELECTOR_CONFLICT`, `details.field` naming it, and nothing runs: leave it out or call that instance's own host. Choose the slot with the `browser-X` host. On history, `browser_id` also filters, equal to X.
- Endpoints auto-create unless `start=false`. Where a deployment disables auto-start, only an explicit `start=true` creates an instance. `GET /snapshot`, `POST /action` and `POST /wait` never create one.
- `stealth` defaults true; bare `?stealth`=true. Mid-flight change throws `Instance backend mismatch` — `GET /stop` first.
- `stealth=true` is ignored on Firefox: the stealth engine is Chromium-only.
- Extensions need `showBrowser=true` and run on a persistent profile.
- `chromiumVersion`: full / major / channel (`stable|beta|dev|canary`); first new version blocks on download.
- Console/network logs: 500-entry ring buffers — drain or filter `since`.
- **A sweep runs every 5 min and SIGTERMs any instance idle for 1 h (deployment defaults), healthy or not.** The idle clock is restarted by real use: every API request routed to the instance (counted from the END of the request), a top-level page navigation (including a person clicking around in the live view), attaching over CDP, and starting an instance that already exists. An instance with a request in flight or an open CDP connection is never reaped. The instance's own heartbeat is liveness only and does NOT keep it alive, so an instance you want to keep (logged-in cookies, session state) needs a request at least once per idle window. A reaped instance's next call starts a fresh one, with none of the cookies or session state the old one held; recorded history survives.
- Instances do NOT survive kit-process restarts: graceful shutdown (SIGTERM/SIGINT) terminates every child.
- History records ALL navs (incl. headful clicks) at `/hoody/storage/hoody-browser/history`, retained 30 d by default. Where a deployment turns history off, the history endpoints answer `404 HISTORY_DISABLED`.
- **`DELETE /history` is scoped by the host:** through a `browser-N` host it clears only instance N's history (add `before` to keep newer entries); a `browser_id` naming another instance is refused with 400 `INSTANCE_SELECTOR_CONFLICT`. To clear several instances, call it on each instance's host.
- `browser_id` history filter sanitised as path component.
- **On the default stealth engine (`stealth=true`, `engine: patchright`), `eval` runs the script in an isolated JavaScript world.** It sees the DOM, but not the globals the page's own scripts define (`window.__NEXT_DATA__`, SPA stores, config objects): those read as `undefined` and the call still returns 200. On `stealth=false` (`engine: playwright`) the script runs in the page's main world. To read page JS state, start the slot with `stealth=false`, or read what the page wrote into the DOM (for example the text of `<script id="__NEXT_DATA__">`).
- `eval` POST accepts JSON `{"script":"..."}` (what the SDK and CLI send) or a `Content-Type: text/plain` body holding the raw script. The response is `{ "result": ... }`.
- **A ref-addressed `POST /action` that navigates the page itself (a link click, a submit, a `pushState`) can answer `409 STALE_SNAPSHOT` with `details.outcome: "unknown"` after the action already ran.** `outcome` is `not-started` (never dispatched, safe to repeat), `unknown` (dispatched, result not observed) or `completed`. On `unknown`, check the page (`POST /wait`, a new snapshot, the URL) before repeating a click or submit. Selector, role, label, text, placeholder and testId targets are not affected.
- Chromium CDP defaults to `useRemoteDebuggingPort=true`; pass `useRemoteDebuggingPort=false` at start to turn it off. `GET /devtools-url` answers 404 only when the instance is missing; with CDP off it returns 200 with null URLs. Use the URLs `GET /devtools-url` returns rather than building one. By default the returned URLs are on the `cdp-X` relay host paired 1:1 with `browser-X` (`https://{P}-{C}-cdp-X.{N}.containers.hoody.com/`); a deployment that turns the relay URLs off returns the legacy `http-<port>` host instead, where `<port>` is the debugging port. Point a CDP client at the returned URL (for example `connectOverCDP("https://{P}-{C}-cdp-X.{N}.containers.hoody.com/")`). The rest of this bullet describes the `cdp-X` relay. A discovery request (`/`, `/json`, `/json/list`, `/json/version`) may cold-start Chromium instance X when it is not running: only when cold start is enabled (the default; a deployment can turn it off) and the request does not come from a web page, which gets `403 CDP_CSRF_COLD_START` instead. A DevTools WebSocket only attaches to a running instance. Only read-only endpoints (the discovery paths, `/json/protocol`, the `/devtools/` front end) and DevTools WebSocket sessions are relayed; `/json/new`, `/json/activate` and `/json/close` return 404. Treat the `cdp-X` URL like a credential: anyone who can reach it controls the browser (navigate, run script, read cookies and page content), so start with `useRemoteDebuggingPort=false` when the container is shared.
- Launch options: the `viewport` and `geolocation` query parameters are **JSON strings**, not free-form `"WxH"` / `"lat,lng"`; the kit `JSON.parse`s a string value and rejects one that does not parse. In a JSON request body the same fields may also be plain objects. Examples: `viewport='{"width":1280,"height":800}'`, `geolocation='{"latitude":48.8,"longitude":2.3,"accuracy":50}'`. A launch `viewport` of `null` or `none` turns off fixed-viewport emulation. The runtime `POST /viewport` is different: its body is an object, `{"viewport":{"width":1280,"height":800}}` or `{"viewport":null}` (integers 1–8192); a string there is a 400 `VALIDATION_ERROR`.
- `POST /viewport` takes `{viewport:{width, height}}` (1-8192 px) or `{viewport:null}` for responsive. Responsive works only on Chromium (`501 NOT_SUPPORTED`) and only on an instance started responsive (`409 REQUIRES_RESTART`: stop it and start it again with `viewport=null`). `502 VIEWPORT_APPLY_INCOMPLETE` means the policy was kept but some tabs did not apply it (`details.failedTabs`). `GET /viewport` never starts an instance.
- Screenshot `format` enum is `png | jpeg | base64` (NO `json`). Base64 mode returns `{ data: "<b64>" }` only — there is NO `mimeType` or `dataUrl` in the response (the kit's JSON body has `data` only).

## Common errors

- `VALIDATION_ERROR` 400 — malformed `viewport`/`geolocation`, history `limit` not 1–500, `offset`<0.
- `NOT_FOUND` 404 `Instance not found` — `GET /stop`, `GET /shutdown`, `GET /devtools-url`, `start=false` no instance; also `GET /snapshot`/`POST /action`/`POST /wait` on an empty slot, since they never auto-start.
- `HISTORY_DISABLED` 404 `History is disabled` — history endpoints where the deployment turned history off.
- `INSTANCE_BACKEND_MISMATCH` 409 (message starts `Instance backend mismatch`) — `stealth` differs from the running instance's backend; `GET /stop` then `GET /start`.
- `VALIDATION_ERROR` 400 `display is required when showBrowser=true (no DISPLAY detected)` — `showBrowser=true` with no `display` field on `GET /start` and no `$DISPLAY` env.
- `TIMEOUT` 408 / 504 — the request passed the kit's request deadline (600 s by default). While the request is launching or restarting the instance this is a 504 with `details.phase: "launch"` and `details.outcome: "unknown"`: the instance may still come up, so check `GET /metadata` with `start=false` before retrying. After the request was forwarded to a running instance it is a 504 with `details.phase: "proxy"` and `details.outcome: "unknown"`: the call may already have taken effect (a `POST /viewport` included), so inspect the state before repeating a mutation. A request that times out before either is a 408.
- `TIMEOUT` 504 — an automation call (`GET /snapshot`, `POST /action`, `POST /wait`) spent its `timeoutMs` budget (default 10000, max 30000). `details.phase` says where; `details.outcome` `not-started` means the action was never dispatched. For `POST /wait` this is how a condition that never held is reported.
- `STALE_SNAPSHOT` 409 — the ref's snapshot is no longer the tab's latest, or the main frame navigated; take a new snapshot. Read `details.outcome` before repeating an action (see Quirks).
- `INSTANCE_CHANGED` 409 — the `instanceGeneration` sent no longer matches the running instance (`details.expected` is null when no instance exists); re-read `GET /metadata`.
- `TAB_BUSY` 409 — another `POST /action`, `GET /snapshot` or `POST /browse` is in flight on that tab (`details.op` names it); wait for it.
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

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first. ⚠ The `browser-X` hostname selects the instance; a `browser_id` or `browser_port` that names another instance is refused with 400 `INSTANCE_SELECTOR_CONFLICT` (see the Quirks gotcha). Examples 1–5 and 8–9 use slot 1 (`browser-1`); Examples 6 and 7 use slots 2 and 3 so their different launch options do not collide with slot 1's running instance.

### 1. Spin up a headless instance and navigate to a URL

**Goal:** boot a Chromium instance, point it at a page, confirm it's alive. Headless avoids the X-display dependency (`showBrowser=false`).

**Step 1 — start.** Returns the start-response payload (`engine`, `headless`, `chromiumBuildId`, `browser_host`, `browser_port`). `GET /start` is idempotent — calling it again on the same slot returns the existing instance and ignores new options (a different `stealth` value is rejected with `409`).

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
curl -sf "$KIT/start?showBrowser=false&stealth=false" \
  | jq '{engine,headless,chromiumBuildId,browser_port}'
```

**Step 2 — navigate.** `POST /browse` opens or reuses a tab and waits for load.

```bash
curl -sf "$KIT/browse?url=https%3A%2F%2Fhttpbin.org%2Fhtml" | jq '.'
```

### 2. Full-page PNG screenshot

**Goal:** capture the entire scrolled height (not just the viewport). `format=base64` returns `{ data: "<b64>" }`; the default `format=png` returns raw `image/png` bytes.

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
# Raw PNG bytes:
curl -sf "$KIT/screenshot?fullPage=true&url=https%3A%2F%2Fhttpbin.org%2Fhtml" \
  -o /tmp/page.png
file /tmp/page.png
# Or base64-wrapped:
curl -sf "$KIT/screenshot?fullPage=true&format=base64" | jq -r .data | head -c 80
```

### 3. Get the page HTML and the rendered text

**Goal:** read the post-JS DOM (HTML) and the visible text the user would see (`GET /text` returns the `innerText` of `body`).

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
curl -sf "$KIT/html"  | head -c 200
echo
curl -sf "$KIT/text"  | head -c 200
```

### 4. Execute JavaScript in the page and capture the return value

**Goal:** run a script in the page context. Over HTTP, `GET /eval?script=` puts the script in the query (size-bound by URL). `POST /eval` accepts `{ script }` JSON via the SDK / CLI / `Content-Type: application/json`; raw `Content-Type: text/plain` HTTP also works (body = script source). Either shape returns `{ result }`. The script reads the DOM on every engine; page JS globals (`window.__NEXT_DATA__`, app stores) are visible only on a `stealth=false` instance, and read as `undefined` on the default stealth engine (see Quirks).

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
# GET — small expression:
curl -sf "$KIT/eval?script=$(python3 -c 'import urllib.parse; print(urllib.parse.quote("document.title"))')"
echo
# POST — JSON body:
curl -sf -X POST "$KIT/eval" \
  -H 'Content-Type: application/json' \
  -d '{"script":"JSON.stringify({title: document.title, links: document.querySelectorAll(\"a\").length})"}'
```

### 5. Set cookies and read them back

**Goal:** prime the cookie jar, then verify. POST body is a JSON object `{ cookies: [...] }` whose entries need `name`, `value`, and either an absolute http(s) `url` or both `domain` and `path`; do not combine `url` with `domain` or `path` (400 `VALIDATION_ERROR` naming the field). Optional: `httpOnly`, `secure`, `sameSite` (`Strict|Lax|None`), `expires` (Unix seconds, -1 = session).

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
curl -sf -X POST "$KIT/cookies" \
  -H 'Content-Type: application/json' \
  -d '{"cookies":[
        {"name":"session","value":"abc123","url":"https://httpbin.org"},
        {"name":"theme","value":"dark","url":"https://httpbin.org"}
      ]}' | jq .
# → {"added": 2}
curl -sf "$KIT/cookies?url=https%3A%2F%2Fhttpbin.org" | jq .
```

### 6. Authenticated scrape — set session cookie, browse, extract, clear

**Goal:** scrape a logged-in page without re-doing OAuth. Pre-load the session cookie a real login would have set, hit the protected URL, read text, then DELETE the jar.

```bash
KIT="https://${P}-${C}-browser-2.${N}.containers.hoody.com"   # slot 2
curl -sf "$KIT/start?showBrowser=false&stealth=false" >/dev/null
curl -sf -X POST "$KIT/cookies" \
  -H 'Content-Type: application/json' \
  -d '{"cookies":[{"name":"sessionid","value":"REAL_TOKEN","url":"https://app.example.com"}]}'
curl -sf "$KIT/browse?url=https%3A%2F%2Fapp.example.com%2Fdashboard"
curl -sf "$KIT/text"   | head -c 400
curl -sX DELETE "$KIT/cookies"   # → {"cleared": true}
```

### 7. `POST /browse` with explicit viewport, locale, and User-Agent

**Goal:** mimic a French mobile Safari to test geo/UA-gated content. Browser-context settings (`viewport`, `locale`, `timezoneId`, `userAgent`) are set at `GET /start`; `POST /browse` carries the navigation body.

`viewport` is a JSON string such as `'{"width":390,"height":844}'`. `geolocation` is a JSON string such as `'{"latitude":48.8566,"longitude":2.3522,"accuracy":20}'`.

```bash
KIT="https://${P}-${C}-browser-3.${N}.containers.hoody.com"   # slot 3
curl -sf "$KIT/start?showBrowser=false&stealth=true\
&viewport=%7B%22width%22%3A390%2C%22height%22%3A844%7D\
&locale=fr-FR\
&timezoneId=Europe%2FParis\
&userAgent=Mozilla%2F5.0%20(iPhone%3B%20CPU%20iPhone%20OS%2017_4%20like%20Mac%20OS%20X)%20AppleWebKit%2F605.1.15%20(KHTML%2C%20like%20Gecko)%20Version%2F17.4%20Mobile%2F15E148%20Safari%2F604.1\
&geolocation=%7B%22latitude%22%3A48.8566%2C%22longitude%22%3A2.3522%2C%22accuracy%22%3A20%7D" >/dev/null
curl -sf -X POST "$KIT/browse" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://httpbin.org/headers","active":true,"onlyIfNotExists":false}'
curl -sf "$KIT/text" | head -c 500
```

### 8. Inspect browsing history (filter by domain, then drop one host)

**Goal:** the kit records every navigation under `/hoody/storage/hoody-browser/history` (30-day retention, 500-entry pagination cap). Query, then selectively delete.

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
# All navs in the last hour, max 50:
SINCE=$(date -u -d '1 hour ago' +%FT%TZ)
curl -sf "$KIT/history?since=$SINCE&limit=50" | jq '{total, has_more, sample: .entries[0]}'
# Just one domain:
curl -sf "$KIT/history?domain=httpbin.org&limit=20" | jq '.entries | length'
# Drop entries older than 7 days recorded on slot 1:
BEFORE=$(date -u -d '7 days ago' +%FT%TZ)
curl -sX DELETE "$KIT/history?before=$BEFORE&browser_id=1" | jq .
# → {"deleted": <n>}
```

### 9. Capture instance metadata (engine, viewport, debug URL)

**Goal:** introspect what the kit actually launched — engine (`playwright`/`patchright`), Chromium build, executable path, current display, debug socket. Use `start=false` to query *without* auto-starting (404 if no instance exists).

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
curl -sf "$KIT/metadata?start=false" \
  | jq '{engine, stealth, headless, chromiumBuildId, browser_host, browser_port, fingerprintId, display, iframe_url}'
# Live tabs in the instance:
curl -sf "$KIT/tabs?start=false" | jq '.'
```

For an external CDP attachment, `GET /devtools-url` returns the live `webSocketDebuggerUrl` (CDP is on by default; default `useRemoteDebuggingPort=true`). If you started with `useRemoteDebuggingPort=false`, the call still returns 200 but `webSocketDebuggerUrl` is null. A 404 `Instance not found` means no instance exists at all (e.g. queried with `start=false`).

### 10. Stop and shutdown — the ONLY safe ending

**Goal:** browser instances stay alive across requests until they are stopped or the kit process restarts (graceful kit restart SIGTERMs every child — see Quirks & gotchas). The idle sweep reaps an instance nobody has used for the max age (1 h by default), so a forgotten instance is eventually reclaimed, and one you still need must see a request at least once per idle window. Each slot has a fixed port, so a slot whose previous process has not been confirmed exited answers `502 INSTANCE_QUARANTINED` until it has; retry later rather than restarting the container.

`GET /stop` and `GET /shutdown` both terminate the child and delete its profile dir (the child's SIGTERM handler runs the same cleanup as `/shutdown`). Every Chromium instance runs on a persistent profile of its own, with or without extensions (an extension profile under the kit's browser data dir, otherwise under the temp dir), and every exit removes it, so cookies and logins do not carry over to the next instance. One `GET /stop` per instance is a complete teardown — calling both is redundant.

```bash
for X in 1 2 3; do
  curl -sX GET "https://${P}-${C}-browser-${X}.${N}.containers.hoody.com/stop" | jq .
done
# /shutdown never creates an instance either (404 on an empty slot); start=false is unnecessary.
# Confirm nothing's left:
curl -sf "https://${P}-${C}-browser-1.${N}.containers.hoody.com/metrics" | jq '.instances'
```

A `404 Instance not found` from `GET /stop` means it was already gone — safe to ignore. Neither `GET /stop` nor `GET /shutdown` creates an instance: on an empty slot both answer `404 Instance not found`. `GET /stop` terminates the child before it answers; `GET /shutdown` answers 200 as soon as shutdown starts and finishes in the background, so poll `GET /metadata` with `start=false` until it answers 404 to confirm the instance is gone.

## Reference

### `cookies` (3) — Browser State

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /cookies` | Clear all cookies | `?browser_id` `?start` |
| `GET /cookies` | Get cookies | `?browser_id` `?start` `?url` |
| `POST /cookies` | Set cookies | `?browser_id` `?start` `body*` |

**Param notes:**

- `browser_id` — Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`.
- `start` — Controls instance creation behavior. Default mode: instances are created automatically. Set to `false` to prevent creation. When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `GET /devtools-url` is the exception: it answers 404 when no instance is running and never consults this value.
- `url` — Filter cookies by URL Repeating this key in the query string is a `400 VALIDATION_ERROR` (`url must not be repeated`): the parent's rule is on the key, not on the operation, so it applies here too even though this parameter is declared inline rather than shared.

**Body shapes:**

- `POST /cookies` body — `{ cookies*: { name*: string, value*: string, url: string, domain: string, path: string, expires: number, httpOnly: bool, secure: bool, sameSite: "Strict" | "Lax" | "None" }[] }`

### `history` (2) — Operations for querying and managing persistent browsing history

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /history` | Delete browsing history | `?before` `?browser_id` |
| `GET /history` | Query browsing history | `?since` `?domain` `?browser_id` `?limit` `?offset` |

**Param notes:**

- `before` — Delete entries before this ISO 8601 timestamp
- `browser_id` — Delete entries for specific browser ID only. Through a `browser-{N}` service hostname it may only be `N` (the default there). _(on `DELETE /history`)_
- `since` — Return entries after this ISO 8601 timestamp
- `domain` — Filter by domain (exact match)
- `browser_id` — Filter by browser ID. Through a `browser-{N}` service hostname it may only be `N` (the default there). _(on `GET /history`)_
- `limit` — Maximum entries to return (1-500)
- `offset` — Number of entries to skip for pagination

### `instances` (6) — Operations for inspecting and controlling browser instances

| Method | Summary | Params |
|--------|---------|--------|
| `GET /metadata` | Get instance metadata | `?browser_id` `?start` |
| `GET /devtools-url` | Get DevTools URLs | `?browser_id` `?start` |
| `GET /restart` | Restart browser instance | `?browser_id` `?start` `?chromiumVersion` `?fingerprintId` `?useRemoteDebuggingPort` `?remoteDebuggingPort` `?remoteDebuggingAddress` `?extensions` `?extensionsDir` `?extensionsStoreIds` `?proxyServer` `?proxyUsername` `?proxyPassword` `?proxyBypass` `?enableQuic` `?enableDnsOverHttps` `?dnsOverHttpsUrl` `?display` `?showBrowser` `?sessionName` `?timezoneId` `?locale` `?userAgent` `?viewport` `?noViewport` `?geolocation` `?launchArguments` `?browser` `?firefoxVersion` `?firefoxExecutablePath` `?showDevtools` `?userProfile` `?stealth` `?iframe` `?iframe_url` `?maximize_new_windows` |
| `GET /shutdown` | Shutdown browser instance | `?browser_id` |
| `GET /start` | Create or retrieve browser instance | `?browser_id` `?chromiumVersion` `?fingerprintId` `?useRemoteDebuggingPort` `?remoteDebuggingPort` `?remoteDebuggingAddress` `?extensions` `?extensionsDir` `?extensionsStoreIds` `?proxyServer` `?proxyUsername` `?proxyPassword` `?proxyBypass` `?enableQuic` `?enableDnsOverHttps` `?dnsOverHttpsUrl` `?display` `?showBrowser` `?sessionName` `?timezoneId` `?locale` `?userAgent` `?viewport` `?noViewport` `?geolocation` `?launchArguments` `?browser` `?firefoxVersion` `?firefoxExecutablePath` `?showDevtools` `?userProfile` `?stealth` `?iframe` `?iframe_url` `?maximize_new_windows` |
| `GET /stop` | Stop browser instance | `?browser_id` |

**Param notes:**

- `browser_id` — Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`.
- `start` — Controls instance creation behavior. Default mode: instances are created automatically. Set to `false` to prevent creation. When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `GET /devtools-url` is the exception: it answers 404 when no instance is running and never consults this value.
- `chromiumVersion` — Chromium/Chrome version selection for the instance. This option applies only when `browser=chromium`. Supported formats: Full version: `136.0.7103.113`; Major version: `136` (mapped to a known stable patch for the current OS); Channel tag: `stable`, `beta`, `dev`, `canary` Any other value is a `400 VALIDATION_ERROR` naming `chromiumVersion`. A full version that no download source has is a `400 VALIDATION_ERROR` too, answered once the download is refused. A major version with no known build falls back to `stable`. The request **blocks** until the requested browser build is available on the server.
- `fingerprintId` — Base fingerprint profile id. The server uses the `context` and `launch` defaults of the configured fingerprint profile with this id, then applies any request overrides over them (top-level options and `userProfile` values both win over the profile). An unknown id starts with an empty profile.
- `useRemoteDebuggingPort` — If `true`, the child process will launch Chromium with `--remote-debugging-port` and will populate `webSocketDebuggerUrl` in metadata responses.
- `remoteDebuggingPort` — Ignored. The kit always assigns the DevTools port itself (a caller-supplied value is never honoured, for isolation); read the assigned URLs from `/devtools-url` or the instance metadata. Kept only so older clients do not fail validation.
- `remoteDebuggingAddress` — Interface address the DevTools port binds to. Defaults to `0.0.0.0` unless the deployment overrides it; the port is only reachable through the container proxy's `cdp-{N}` relay.
- `extensions` — Comma-separated list (or JSON array string) of absolute extension directory paths to load. Extensions require `showBrowser=true` (headful mode) and will launch a persistent profile.
- `extensionsDir` — Directory containing extension subfolders to load (each subfolder is treated as an extension). Extensions require `showBrowser=true` (headful mode) and will launch a persistent profile.
- `extensionsStoreIds` — Chrome Web Store extension IDs to download and load (Chromium only). Requires `showBrowser=true` and works only with `browser=chromium`. Downloads of the same extension are serialized across instances; an instance that waits more than 5 minutes for another instance's download fails with a "try again later" error. _(on `GET /restart`)_
- `proxyServer` — Proxy server URL (http, https, socks5, socks5h) _(on `GET /restart`)_
- `proxyUsername` — Proxy username (if required)
- `proxyPassword` — Proxy password (if required)
- `proxyBypass` — Comma-separated list of hosts that should bypass the proxy
- `enableQuic` — Enable QUIC/HTTP3 transport. Defaults to `false` (QUIC blocked). Use `enableQuic=true` to re-enable QUIC.
- `enableDnsOverHttps` — Enable DNS-over-HTTPS for browser DNS resolution. Defaults to `true`.
- `dnsOverHttpsUrl` — DoH resolver URL (HTTPS only). Defaults to Cloudflare: `https://cloudflare-dns.com/dns-query`.
- `display` — X display number or identifier for headful mode. Required when `showBrowser=true` and no `DISPLAY` environment variable is set on the server.
- `showBrowser` — Whether to run the browser headful (visible). Defaults to `true`.
- `sessionName` — Custom session name for identifying this browser instance
- `timezoneId` — IANA timezone identifier for browser geolocation
- `locale` — BCP 47 language tag for browser locale
- `userAgent` — User agent string to apply to the browser context.
- `viewport` — Viewport configuration as JSON string. Example: {"width":1920,"height":1080,"deviceScaleFactor":1} Pass `null` to disable fixed-viewport emulation entirely — the page then follows the real browser window size (responsive; most useful in headful mode).
- `noViewport` — Set to `true` to disable fixed-viewport emulation (alias for `viewport=null`). The page then resizes with the browser window instead of being pinned to an emulated resolution. Cannot be combined with a fixed `viewport` object.
- `geolocation` — Geolocation configuration as JSON string. Example: {"latitude":40.7128,"longitude":-74.0060,"accuracy":100} Anything other than a JSON object (`null`, an array, a number) is a `400 VALIDATION_ERROR`.
- `launchArguments` — Additional Chromium/Firefox command-line arguments. Pass the query key repeatedly (`launchArguments=--a&launchArguments=--b`) or a single JSON array string (`launchArguments=["--a","--b"]`); every value is kept. Entries must be strings (400 otherwise).
- `browser` — Browser engine to use (`chromium` or `firefox`). `chrome` is accepted as an alias of `chromium`. Fixed for the life of the instance.
- `firefoxVersion` — Firefox version label (informational only). Playwright-managed Firefox builds are used by default. If omitted, a Playwright Firefox build is downloaded on demand.
- `firefoxExecutablePath` — Absolute path to a custom Firefox executable (overrides download)
- `showDevtools` — Whether to open DevTools on launch (Chromium only)
- `userProfile` — Optional user profile object (JSON string): `locale`, `timezoneId`, `userAgentString`, `geolocation` and `deviceProfile.viewport`. Precedence for each field: the top-level request option (`locale`, `timezoneId`, `userAgent`, `geolocation`, `viewport`) > `userProfile` > the fingerprint profile (`fingerprintId`, `default` when omitted) > the engine default. A value set here always replaces the fingerprint profile's value.
- `stealth` — Launch Chromium in stealth mode using Patchright (anti-detection patches). Only applies to `browser=chromium`. Ignored for Firefox. Defaults to `true`. Bare `?stealth` is treated as `true`.
- `iframe` — Enable or disable the full-page display iframe on the root URL. _(on `GET /restart`)_
- `iframe_url` — Explicit URL for the display iframe. _(on `GET /restart`)_
- `maximize_new_windows` — Control the `maximize_new_windows` flag stamped onto the generated display URL (always explicit `true`/`false`); when true the hoody-display client opens new top-level app windows maximized. Enabled by default; set to `false` to opt out. _(on `GET /restart`)_
- `extensionsStoreIds` — Comma-separated list (or JSON array string) of Chrome Web Store extension IDs to download and load. Requires `showBrowser=true` and works only with `browser=chromium`. Downloads of the same extension are serialized across instances; an instance that waits more than 5 minutes for another instance's download fails with a "try again later" error. _(on `GET /start`)_
- `proxyServer` — Proxy server for browser traffic. Supports `http://`, `https://`, `socks5://`, or `socks5h://`. Example: `socks5://127.0.0.1:9050` _(on `GET /start`)_
- `iframe` — Enable or disable the full-page display iframe on the root URL. When enabled (default), navigating to `/` serves an HTML page with an iframe pointing to the Hoody display URL. _(on `GET /start`)_
- `iframe_url` — Explicit URL for the display iframe. If not provided, the URL is auto-detected from the Host header subdomain pattern. _(on `GET /start`)_
- `maximize_new_windows` — Control the `maximize_new_windows` flag stamped onto generated display URLs (iframe pages, status pages, `iframe_url` metadata). The flag is always explicit (`true` or `false`); when true the hoody-display client opens new top-level app windows maximized. Enabled by default; set to `false` to keep the display client's centered default-size placement (the explicit `false` also overrides a display-side `default-settings.txt` enable). Explicit `iframe_url` values are never modified. _(on `GET /start`)_

### `kit` (2) — Server monitoring and health check operations

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/browser/health` | Health check |  |
| `GET /metrics` | Server metrics |  |

### `logs` (2) — Debugging

| Method | Summary | Params |
|--------|---------|--------|
| `GET /console` | Get console logs | `?browser_id` `?tabId` `?start` `?type` `?since` `?clear` |
| `GET /network` | Get network logs | `?browser_id` `?tabId` `?start` `?since` `?clear` |

**Param notes:**

- `browser_id` — Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`.
- `tabId` — The ID of the tab to interact with (from `/tabs`). Omitted: the active tab. Supplied: exactly that tab — an unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema.
- `start` — Controls instance creation behavior. Default mode: instances are created automatically. Set to `false` to prevent creation. When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `GET /devtools-url` is the exception: it answers 404 when no instance is running and never consults this value.
- `type` — Filter by message type (log, error, warning, info, etc.). Repeating this key in the query string is a `400 VALIDATION_ERROR` (`type must not be repeated`).
- `since` — Only return entries at or after this time: an ISO 8601 date or date-time, like `2026-10-05T12:00:00Z`. Any other value (an epoch number, a word like `yesterday`) is a `400 VALIDATION_ERROR` naming `since`, never an unfiltered list. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`since must not be repeated`).
- `clear` — Clear the buffer after reading. `true` or `false`; any other value is a `400 VALIDATION_ERROR` naming `clear`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`clear must not be repeated`).

### `page` (9) — Operations for interacting with browser tabs and content

| Method | Summary | Params |
|--------|---------|--------|
| `POST /action` | Perform a native element action | `?browser_id` `body*` |
| `GET /screenshot` | Capture browser screenshot | `?browser_id` `?start` `?url` `?tabId` `?format` `?quality` `?fullPage` |
| `POST /eval` | Execute JavaScript (POST) | `?browser_id` `?start` `body*:application/json,text/plain` |
| `GET /pdf` | Export page as PDF | `?browser_id` `?tabId` `?start` `?url` `?format` `?landscape` `?printBackground` `?margin` |
| `GET /html` | Get page HTML | `?browser_id` `?tabId` `?start` |
| `GET /snapshot` | Accessibility snapshot of a tab with element refs | `?browser_id` `?instanceGeneration` `?tabId` `?timeoutMs` `?maxChars` `?includeValues` |
| `GET /text` | Get page text | `?browser_id` `?tabId` `?start` |
| `POST /browse` | Navigate to URL (POST) | `?browser_id` `?start` `body*` |
| `POST /wait` | Wait for a condition in a tab | `?browser_id` `body*` |

**Param notes:**

- `browser_id` — Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`.
- `start` — Controls instance creation behavior. Default mode: instances are created automatically. Set to `false` to prevent creation. When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `GET /devtools-url` is the exception: it answers 404 when no instance is running and never consults this value.
- `url` — The URL to navigate to. Repeating this key IN THE QUERY STRING is a `400 VALIDATION_ERROR` (`url must not be repeated`), on GET and on POST alike — a request naming two destinations is answered rather than silently resolved to one of them. The rule is about the query string only — a JSON body property named `url` is governed by the body schema. Only an absolute `http`, `https` or `data` URL, `about:blank`, or (on Chromium engines only) a `chrome:` URL is accepted. Any other scheme (`file:` in any spelling, `view-source:`, `javascript:`, `blob:` and the rest) is a `400 VALIDATION_ERROR` (`url must be an http, https or data URL, about:blank, or a chrome URL on Chromium; file and other local schemes are refused`), and a value that is not an absolute URL (such as `/etc/hostname`) is a `400 VALIDATION_ERROR` (`url must be an absolute URL, like https://example.com/`). Every other `about:` page is refused (Firefox's `about:reader?url=file:…` loads a local file), and `chrome:` is refused on Firefox, where it is the browser's own privileged UI. A value that is not a string is `url must be a string`. The `url` is checked before an instance is started, a tab is looked up, created or reused, or anything is navigated, and before `/pdf`'s `501 NOT_SUPPORTED`. On `/screenshot` and `/pdf` a supplied but empty `url=` is a `400 VALIDATION_ERROR` too (omit `url` to capture the current tab). This checks the request only; it does not stop the browser from opening local files (see "Local files" in the API overview). _(on `GET /screenshot`)_
- `tabId` — The ID of the tab to interact with (from `/tabs`). Omitted: the active tab. Supplied: exactly that tab — an unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema.
- `format` — Output format. `base64` answers JSON with the PNG bytes base64-encoded. Any other value is a `400 VALIDATION_ERROR` naming `format`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`format must not be repeated`). _(on `GET /screenshot`)_
- `quality` — Image quality for JPEG format (0-100); not used for `png` or `base64`. A value that is not an integer from 0 to 100 is a `400 VALIDATION_ERROR` naming `quality`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`quality must not be repeated`).
- `fullPage` — Capture the entire scrollable page. `true` or `false`; any other value is a `400 VALIDATION_ERROR` naming `fullPage`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`fullPage must not be repeated`).
- `url` — Optional URL to navigate to before generating the PDF. Only an absolute `http`, `https` or `data` URL, `about:blank`, or (on Chromium engines only) a `chrome:` URL is accepted. Any other scheme (`file:` in any spelling, `view-source:`, `javascript:`, `blob:` and the rest) is a `400 VALIDATION_ERROR` (`url must be an http, https or data URL, about:blank, or a chrome URL on Chromium; file and other local schemes are refused`), and a value that is not an absolute URL (such as `/etc/hostname`) is a `400 VALIDATION_ERROR` (`url must be an absolute URL, like https://example.com/`). Every other `about:` page is refused (Firefox's `about:reader?url=file:…` loads a local file), and `chrome:` is refused on Firefox, where it is the browser's own privileged UI. A value that is not a string is `url must be a string`. The `url` is checked before an instance is started, a tab is looked up, created or reused, or anything is navigated, and before `/pdf`'s `501 NOT_SUPPORTED`. On `/screenshot` and `/pdf` a supplied but empty `url=` is a `400 VALIDATION_ERROR` too (omit `url` to capture the current tab). This checks the request only; it does not stop the browser from opening local files (see "Local files" in the API overview). Repeating this key in the query string is a `400 VALIDATION_ERROR` (`url must not be repeated`): the parent's rule is on the key, not on the operation, so it applies here too even though this parameter is declared inline rather than shared. _(on `GET /pdf`)_
- `format` — Paper format: one of Letter, Legal, Tabloid, Ledger, A0, A1, A2, A3, A4, A5 or A6 (any letter case). Any other value is a `400 VALIDATION_ERROR` naming `format`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`format must not be repeated`). _(on `GET /pdf`)_
- `landscape` — Use landscape orientation. `true` or `false`; any other value is a `400 VALIDATION_ERROR` naming `landscape`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`landscape must not be repeated`).
- `printBackground` — Include background graphics. `true` or `false`; any other value is a `400 VALIDATION_ERROR` naming `printBackground`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`printBackground must not be repeated`).
- `margin` — Uniform margin: a non-negative number of pixels, or a number followed by `px`, `in`, `cm` or `mm` (e.g. '1cm', '0.5in'). Any other value is a `400 VALIDATION_ERROR` naming `margin`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`margin must not be repeated`).
- `instanceGeneration` — The instance generation from /metadata. If it no longer matches the running instance → 409 INSTANCE_CHANGED (also when no instance exists: details.expected is null). Repeating this key in the query string is a `400 VALIDATION_ERROR` (`instanceGeneration must not be repeated`); a body property of the same name is governed by the body schema.
- `timeoutMs` — Budget for the whole browser operation, starting at handler entry (instance provisioning is never inside it). Repeating this key in the query string is a `400 VALIDATION_ERROR` (`timeoutMs must not be repeated`); a body property of the same name does not suppress that — it is governed by the body schema instead. A body that is not a JSON object at all, or that fails the operation's own validation, is rejected first, with its own message and the same status and code.
- `maxChars` — Hard cut on a line boundary; `truncated` reports it. A truncated excerpt may not parse as standalone YAML. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`maxChars must not be repeated`).
- `includeValues` — Include the CONTENTS of form controls in the snapshot. Off by default: the accessibility tree serialises `input.value`, so a snapshot taken after the agent typed a password, card number or token would hand those back on every subsequent loop iteration. With the default, the value of a non-empty textbox, searchbox, spinbutton, slider or editable combobox (an input with a `<datalist>`, or `role=combobox`) renders as `<value hidden>`, whatever its label contains; only a native `<select>` keeps its option names, when it holds nothing but `<option>`, `<optgroup>` and `<hr>` elements and none of them uses `aria-owns` or `aria-labelledby` or is editable (every other node in it keeps its role and ref but not its name or text), and the content of every other combobox, ARIA autocomplete popups and customizable selects with rich option content included, is hidden whole (an empty one renders with no value at all, so the caller can still tell them apart). A `<select>`'s options are page content, not entered text, and are always included. Content inside an editable region (a `contenteditable` element, or a whole page in `designMode`) is hidden too: the region keeps its role and ref, its contents become `<value hidden>`, and its name is shown only when it is authored (`aria-label`, or `aria-labelledby` pointing at non-editable content); text the snapshot folds from an editor into an enclosing element is hidden there too. If the page cannot be asked in time, the text and computed names on such a page are hidden and the refs are kept. Set to `true` only when the values are known not to be sensitive. Anything but `true`/`false` → 400, and repeating this key in the query string is a `400 VALIDATION_ERROR` (`includeValues must not be repeated`).

**Body shapes:**

- `POST /action` body — `{ instanceGeneration: string, tabId: int, timeoutMs: int=10000, action*: "click" | "fill" | "type" | "press" | "select" | "check" | "hover", target*: browser_Target, dialog: browser_DialogPolicy, value: string, delayMs: int=0, key: string, values: string[], checked: bool, button: "left" | "middle" | "right"="left", clickCount: int=1, modifiers: ("Alt" | "Control" | "Meta" | "Shift")[] }`
  - `instanceGeneration` — From /metadata; mismatch → 409 INSTANCE_CHANGED.
  - `tabId` — Tab to act on (from /tabs); omitted → active tab; unknown → 404 TAB_NOT_FOUND.
  - `timeoutMs` — Budget for the whole browser operation (body overrides query).
  - `value` — fill / type: the text. Never echoed.
  - `delayMs` — type: delay between keys. Code points × delayMs must be smaller than timeoutMs (400).
  - `key` — press: Playwright key syntax (e.g. "Enter", "Control+a"). Unknown → 400.
  - `values` — select: option values or labels (first match wins). No match → 504 with details.availableOptions.
  - `checked` — check: desired state (idempotent).
- `POST /eval` body — `{ script: string, tabId: int, scriptBase64: bool, timeoutMs: int=30000 }` — Executes a JavaScript snippet provided in the request body. …
  - `script` — JavaScript code to execute
  - `tabId` — Tab to evaluate in (from `/tabs`). Omitted: the active tab. Unknown → `404 TAB_NOT_FOUND`, malformed → `400`.
  - `scriptBase64` — Set to `true` when `script` is base64-encoded.
  - `timeoutMs` — Time limit for the script, in milliseconds (1 to 30000, default 30000). A script still running when it is spent is stopped and the answer is `504 TIMEOUT` (`details.phase` `evaluate`). Repeating this key in the query string is a `400 VALIDATION_ERROR` (`timeoutMs must not be repeated`).
- `POST /browse` body — `{ url*: string, tabId: int, waitUntil: "commit" | "domcontentloaded" | "load"="load", timeoutMs: int, instanceGeneration: string, active: bool=true, onlyIfNotExists: bool=false, ignoreGetParameters: bool=false }`
  - `url` — … Any other scheme (`file:` in any spelling, `view-source:`, `javascript:`, `blob:` and the rest) is a `400 VALIDATION_ERROR` (`url must be an http, https or data URL, about:blank, or a chrome URL on Chromium; file and other local schemes are refused`), and a value that is not an absolute URL (such as `/etc/hostname`) is a `400 VALIDATION_ERROR` (`url must be an absolute URL, like https://example.com/`). Every other `about:` page is refused (Firefox's `about:reader?url=file:…` loads a local file), and `chrome:` is refused on Firefox, where it is the browser's own privileged UI. …
  - `timeoutMs` — Omitted: the navigation may take up to 30000 ms. Present: the whole budget. Either way a navigation that runs out of time is a 504 TIMEOUT (phase navigation).
  - `active` — Whether the tab becomes the active one. … ANY other value (`0`, `1`, `"yes"`, `"on"`, `""`, `null`, or an array) is rejected with `400 VALIDATION_ERROR` (`details.field` names the property) before a tab is created or reused; it is never coerced. …
  - `onlyIfNotExists` — Reuse an existing tab already on this URL instead of opening a new one. Same value rule as `active`: send a JSON boolean (the strings `"true"`/`"false"` are tolerated because one parser reads both the query and the body spelling); anything else is `400 VALIDATION_ERROR`, never coerced.
  - `ignoreGetParameters` — Compare URLs for `onlyIfNotExists` with the query string stripped. Same value rule as `active`: send a JSON boolean (the strings `"true"`/`"false"` are tolerated because one parser reads both the query and the body spelling); anything else is `400 VALIDATION_ERROR`, never coerced.
- `POST /wait` body — `{ instanceGeneration: string, tabId: int, timeoutMs: int=10000, condition*: browser_WaitCondition }`

### `tabs` (2) — Operations for inspecting and controlling browser instances

| Method | Summary | Params |
|--------|---------|--------|
| `POST /tab/close` | Close a browser tab | `?browser_id` `?start` `body` |
| `GET /tabs` | List browser tabs | `?browser_id` `?start` |

**Param notes:**

- `browser_id` — Selects the instance: SDK and CLI clients send the request to the `browser-<N>` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`.
- `start` — Controls instance creation behavior. Default mode: instances are created automatically. Set to `false` to prevent creation. When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `GET /devtools-url` is the exception: it answers 404 when no instance is running and never consults this value.

**Body shapes:**

- `POST /tab/close` body — `{ tabId: int }`
  - `tabId` — The ID of the tab to close

### `viewport` (2) — Operations for inspecting and controlling browser instances

| Method | Summary | Params |
|--------|---------|--------|
| `GET /viewport` | Get the current viewport policy | `?browser_host` `?browser_port` |
| `POST /viewport` | Change the viewport at runtime | `?browser_host` `?browser_port` `body*` |

**Param notes:**

- `browser_host` — Instance host. Optional — must be paired with browser_port; when both are omitted the single running instance is selected (400 AMBIGUOUS_INSTANCE with more than one).
- `browser_port` — Instance port. Optional — must be paired with browser_host.

**Body shapes:**

- `POST /viewport` body — `{ viewport*: { width*: int, height*: int }|null }`
  - `viewport` — Fixed size {width,height} (integers 1..8192, no other keys), or null for responsive.


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
