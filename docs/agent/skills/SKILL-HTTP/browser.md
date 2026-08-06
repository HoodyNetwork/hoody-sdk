> _**HTTP skill · `browser` namespace** · ~7,907 tokens · hoody-sdk v1.0.0-beta.12_

# `browser` — Per-container Chromium/Firefox via Playwright/Patchright

## Purpose

- Long-lived browser instances per container, keyed by `browser_id`.
- Playwright default; Patchright on `stealth=true`.
- Surfaces: nav, screenshot, JS eval, PDF, HTML/text, cookies, console+network logs, history, CDP.

## When to use

- JS-heavy pages, screenshots, PDFs.
- Authenticated sessions across navs.
- Anti-fingerprint via `stealth=true`.
- Console/network capture.
- Dedicated recorded "project browser" the user can watch live and you can inspect anytime (workflow 6).
- External CDP via `GET /devtools-url` (Chromium ships `webSocketDebuggerUrl` ON by default — pass `useRemoteDebuggingPort=false` to disable; Firefox never exposes it).

## When NOT to use

- Plain HTTP, persistence, server scripts, stream UI, shell → `curl`/`sqlite`/`exec`/`display`/`terminal`.

## Prerequisites

- Headful (default `showBrowser=true`) needs X display: `?display=` or `DISPLAY`. Extensions also require `showBrowser=true`.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Start + navigate
1. `GET /start` — `browser_id` + overrides (proxy, stealth, fingerprintId, viewport, locale, timezoneId, userAgent, geolocation).
2. `GET /browse`/`POST /browse` — `tab_id`, `only_if_not_exists=true`.
3. `GET /metadata`.

### 2. Extract content
After browse: `GET /html`/`GET /text`/`GET /screenshot`/`GET /pdf` — params in Reference.

### 3. Authenticated scraping
1. `GET /start` matching `userAgent`/`viewport`/`locale`.
2. `POST /cookies` — POST array (Playwright `addCookies` shape).
3. `GET /browse` to protected URL.
4. `GET /html`/`GET /text`.
5. `DELETE /cookies`.

### 4. JS eval + logs
1. `GET /start` → `GET /browse`.
2. `GET /eval` (`?script=`) or `POST /eval` (raw JS body).
3. `GET /console` (`since`,`type`,`clear=true`).
4. `GET /network`.

### 5. History
`GET /history` (filters: `since`/`domain`/`browser_id`) and `DELETE /history` (`before` + `browser_id` AND).

### 6. Dedicated project browser — suggest it to the user
When the work is a website project or business research, **offer** the user a dedicated recorded browser. This is a suggestion to the user only — set it up when they ask, don't spin it up unprompted.
1. Pick a slot number X (e.g. 2) and start headful on the matching display: `GET /start` with a stable `browser_id` (the project slug), `browser_port` (e.g. 30000+X), `display` 500+X, `showBrowser=true` — plus any per-project identity: own egress proxy (`proxyServer`/`proxyUsername`/`proxyPassword`/`proxyBypass`), `stealth`, `userAgent`, `viewport`, `locale`, `geolocation`, extensions.
2. Give the user the direct live-view URL — it's the standard kit URL with the `browser-` slug: `https://{P}-{C}-browser-X.{N}.containers.hoody.com/`. The root page of `browser-X` embeds display 500+X live, so an instance started on display 500+X gets its own stable viewing URL — changing the X in the URL is how you address each browser's live window. `GET /devtools-url` adds a live DevTools inspector as a second link.
3. Everything browsed there — by the user clicking around in the live view or by the agent via the API — lands in persistent per-`browser_id` history (`GET /history`): live debugging and business research accumulate into one durable project trail. The instance itself is reaped after ~1h idle (see Quirks) — history survives; re-run `GET /start` with the same options to revive the window.
4. Then offer log capture as a follow-up: console/network buffers hold only the last 500 entries and die with the instance, so a recurring `cron` job (or agent loop) draining `GET /console`/`GET /network` with `clear=true` into `sqlite`/`files`/agent memory preserves full context for later sessions.

## Quirks & gotchas

- `browser_id` is an opaque, 0-based string. The kit's request handler reads `browser_port || port` from query/body (NOT `browser_id`); the generated SDK sends `browser_id` as a query param; the URL serviceIndex slot (e.g. `-browser-1.`) is a separate proxy routing variable set via `_templateVars`, defaulting to 1. Drive via the SDK and prefer `browser_id`; raw `curl` against the kit must send `browser_port=<num>`.
- Endpoints auto-create unless `start=false` or `--disable-auto-start`.
- `stealth` defaults true; bare `?stealth`=true. Mid-flight change throws `Instance backend mismatch` — `GET /stop` first.
- `stealth=true` ignored on Firefox (Patchright is Chromium-only).
- Extensions need `showBrowser=true`; force persistent profile.
- `chromiumVersion`: full / major / channel (`stable|beta|dev|canary`); first new version blocks on download.
- Console/network logs: 500-entry ring buffers — drain or filter `since`.
- **Idle instances are killed after `HOODY_INSTANCE_MAX_AGE` ms (default 3 600 000 = 1 h).** Cleanup runs every `HOODY_CLEANUP_INTERVAL` ms (default 300000 = 5 min) and SIGTERMs anything past max-age. Heartbeat any active instance with a request to refresh `lastAccessed`. Long-running scrape loops or warm cookies WILL silently lose state across hours of idle.
- Instances do NOT survive kit-process restarts: graceful shutdown (SIGTERM/SIGINT) terminates every child.
- History records ALL navs (incl. headful clicks) at `/hoody/storage/hoody-browser/history`, retention 30 d (`HOODY_HISTORY_RETENTION_DAYS`). Disable: `--history-disable` / `HOODY_HISTORY_DISABLE=true`.
- **`DELETE /history` with no filters wipes all history** — pair `before` + `browser_id` (or both).
- `browser_id` history filter sanitised as path component.
- `eval` POST accepts BOTH `Content-Type: application/json` with `{"script":"..."}` (what the SDK and CLI send) and `Content-Type: text/plain` with the raw JS body — the kit tries JSON parse first, falls back to storing the body as `__raw`.
- Chromium CDP defaults to `useRemoteDebuggingPort=true`; `GET /devtools-url` only 404s when the instance itself is missing (NOT when CDP is "off"). To disable CDP exposure, pass `useRemoteDebuggingPort=false` at start. CDP listener binds to `0.0.0.0` by default — treat it as a security-relevant default and either keep CDP off in shared environments or front it with the kit URL's capability gate.
- `viewport` and `geolocation` query/body values are **JSON strings**, not free-form `"WxH"` / `"lat,lng"` — the kit `JSON.parse`s and rejects anything else. Examples: `viewport='{"width":1280,"height":800}'`, `geolocation='{"latitude":48.8,"longitude":2.3,"accuracy":50}'`.
- Screenshot `format` enum is `png | jpeg | base64` (NO `json`). Base64 mode returns `{ data: "<b64>" }` only — there is NO `mimeType` or `dataUrl` in the response (the kit's JSON body has `data` only).

## Common errors

- `VALIDATION_ERROR` 400 — bad `browser_id`, malformed `viewport`/`geolocation`, history `limit` not 1–500, `offset`<0.
- `NOT_FOUND` 404 `Instance not found` — `GET /stop`, `GET /devtools-url`, `start=false` no instance.
- `HISTORY_DISABLED` 404 `History is disabled` — history endpoints with `--history-disable`.
- `INSTANCE_BACKEND_MISMATCH` 409 (message starts `Instance backend mismatch`) — `stealth` differs from the running instance's backend; `GET /stop` then `GET /start`.
- `VALIDATION_ERROR` 400 `display is required when showBrowser=true (no DISPLAY detected)` — `showBrowser=true` with no `display` field on `GET /start` and no `$DISPLAY` env.
- `TIMEOUT` 408 — exceeds `HOODY_REQUEST_TIMEOUT` (600000ms).
- `METHOD_NOT_ALLOWED` 405 — only GET/POST/DELETE/PUT/PATCH.

## Related namespaces

- `display` — headful renders into `display-{n}`; root URL iframes it.
- `terminal` — helper CLIs.
- `curl` — JS-free HTTP.
- `files` — pull artefacts out.
- `sqlite` — persist scraped data.
- `exec` — server post-processing.

## Examples

Every step in every example was live-tested against a real `browser-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first. ⚠ The kit keys instances on **`browser_port`**, not `browser_id` — on instance endpoints `browser_id` is ignored (it only namespaces history), so calls that differ only in `browser_id` all resolve to the same default instance. The examples run sequentially against that single default instance; for genuinely concurrent flows add a unique `browser_port=$((30000+i))` to every call, as Example 2 does (see the Quirks gotcha).

### 1. Spin up a headless instance and navigate to a URL

**Goal:** boot a Chromium instance, point it at a page, confirm it's alive. Headless avoids the X-display dependency (`showBrowser=false`).

**Step 1 — start.** Returns the start-response payload (`engine`, `headless`, `chromiumBuildId`, `browser_host`, `browser_port`). `GET /start` is idempotent — calling again with the same `browser_id` returns the existing instance.

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
BID="0"
curl -sf "$KIT/start?browser_id=$BID&showBrowser=false&stealth=false" \
  | jq '{browser_id,engine,headless,chromiumBuildId,browser_port}'
```
**Step 2 — navigate.** `GET /browse` opens or reuses a tab and waits for load.

```bash
curl -sf "$KIT/browse?browser_id=$BID&url=https%3A%2F%2Fhttpbin.org%2Fhtml" | jq '.'
```
### 2. Full-page PNG screenshot

**Goal:** capture the entire scrolled height (not just the viewport). `format=base64` returns `{ data: "<b64>" }`; the default `format=png` returns raw `image/png` bytes.

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
BID="0"
# Raw PNG bytes:
curl -sf "$KIT/screenshot?browser_port=$((30000+BID))&fullPage=true&url=https%3A%2F%2Fhttpbin.org%2Fhtml" \
  -o /tmp/page.png
file /tmp/page.png
# Or base64-wrapped:
curl -sf "$KIT/screenshot?browser_port=$((30000+BID))&fullPage=true&format=base64" | jq -r .data | head -c 80
```
### 3. Get the page HTML and the rendered text

**Goal:** read the post-JS DOM (HTML) and the visible text the user would see (`GET /text` calls Playwright `innerText` on `body`).

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
BID="0"
curl -sf "$KIT/html?browser_id=$BID"  | head -c 200
echo
curl -sf "$KIT/text?browser_id=$BID"  | head -c 200
```
### 4. Execute JavaScript in the page and capture the return value

**Goal:** run a script in the page context. `GET /eval` puts the script in `?script=` (size-bound by URL). `POST /eval` accepts `{ script }` JSON via the SDK / CLI / `Content-Type: application/json`; raw `Content-Type: text/plain` HTTP also works (body = script source). Either shape returns the result.

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
BID="0"
# GET — small expression:
curl -sf "$KIT/eval?browser_id=$BID&script=$(python3 -c 'import urllib.parse; print(urllib.parse.quote("document.title"))')"
echo
# POST — JSON body:
curl -sf -X POST "$KIT/eval?browser_id=$BID" \
  -H 'Content-Type: application/json' \
  -d '{"script":"JSON.stringify({title: document.title, links: document.querySelectorAll(\"a\").length})"}'
```
### 5. Set cookies and read them back

**Goal:** prime the cookie jar, then verify. POST body is the Playwright `addCookies` shape: an array of `{ name, value, url }` (or `{ name, value, domain, path }`). Each cookie REQUIRES either `url` OR `domain+path`.

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
BID="0"
curl -sf -X POST "$KIT/cookies?browser_id=$BID" \
  -H 'Content-Type: application/json' \
  -d '{"cookies":[
        {"name":"session","value":"abc123","url":"https://httpbin.org"},
        {"name":"theme","value":"dark","url":"https://httpbin.org"}
      ]}' | jq .
# → {"added": 2}
curl -sf "$KIT/cookies?browser_id=$BID&url=https%3A%2F%2Fhttpbin.org" | jq .
```
### 6. Authenticated scrape — set session cookie, browse, extract, clear

**Goal:** scrape a logged-in page without re-doing OAuth. Pre-load the session cookie a real login would have set, hit the protected URL, read text, then DELETE the jar.

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
BID="examples-auth-9c"
curl -sf "$KIT/start?browser_id=$BID&showBrowser=false&stealth=false" >/dev/null
curl -sf -X POST "$KIT/cookies?browser_id=$BID" \
  -H 'Content-Type: application/json' \
  -d '{"cookies":[{"name":"sessionid","value":"REAL_TOKEN","url":"https://app.example.com"}]}'
curl -sf "$KIT/browse?browser_id=$BID&url=https%3A%2F%2Fapp.example.com%2Fdashboard"
curl -sf "$KIT/text?browser_id=$BID"   | head -c 400
curl -sX DELETE "$KIT/cookies?browser_id=$BID"   # → {"cleared": true}
```
### 7. `POST /browse` with explicit viewport, locale, and User-Agent

**Goal:** mimic a French mobile Safari to test geo/UA-gated content. Browser-context settings (`viewport`, `locale`, `timezoneId`, `userAgent`) are set at `GET /start`; `POST /browse` carries the navigation body.

`viewport` is a JSON string such as `'{"width":390,"height":844}'`. `geolocation` is a JSON string such as `'{"latitude":48.8566,"longitude":2.3522,"accuracy":20}'`.

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
BID="examples-mobile-fr"
curl -sf "$KIT/start?browser_id=$BID&showBrowser=false&stealth=true\
&viewport=%7B%22width%22%3A390%2C%22height%22%3A844%7D\
&locale=fr-FR\
&timezoneId=Europe%2FParis\
&userAgent=Mozilla%2F5.0%20(iPhone%3B%20CPU%20iPhone%20OS%2017_4%20like%20Mac%20OS%20X)%20AppleWebKit%2F605.1.15%20(KHTML%2C%20like%20Gecko)%20Version%2F17.4%20Mobile%2F15E148%20Safari%2F604.1\
&geolocation=%7B%22latitude%22%3A48.8566%2C%22longitude%22%3A2.3522%2C%22accuracy%22%3A20%7D" >/dev/null
curl -sf -X POST "$KIT/browse?browser_id=$BID" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://httpbin.org/headers","active":true,"onlyIfNotExists":false}'
curl -sf "$KIT/text?browser_id=$BID" | head -c 500
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
# Drop entries older than 7 days for one browser_id:
BEFORE=$(date -u -d '7 days ago' +%FT%TZ)
curl -sX DELETE "$KIT/history?before=$BEFORE&browser_id=0" | jq .
# → {"deleted": <n>}
```
### 9. Capture instance metadata (engine, viewport, debug URL)

**Goal:** introspect what the kit actually launched — engine (`playwright`/`patchright`), Chromium build, executable path, current display, debug socket. Use `start=false` to query *without* auto-starting (404 if no instance exists).

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
BID="0"
curl -sf "$KIT/metadata?browser_id=$BID&start=false" \
  | jq '{engine, stealth, headless, chromiumBuildId, browser_host, browser_port, fingerprintId, display, iframe_url}'
# Live tabs in the instance:
curl -sf "$KIT/tabs?browser_id=$BID&start=false" | jq '.'
```
For an external CDP attachment, `GET /devtools-url` returns the live `webSocketDebuggerUrl` (CDP is on by default; default `useRemoteDebuggingPort=true`). If you started with `useRemoteDebuggingPort=false`, the call still returns 200 but `webSocketDebuggerUrl` is null. A 404 `Instance not found` means no instance exists at all (e.g. queried with `start=false`).

### 10. Stop and shutdown — the ONLY safe ending

**Goal:** browser instances stay alive across requests within a kit-process lifetime (graceful kit restart SIGTERMs every child — see Quirks & gotchas); if you forget to shut down you'll exhaust the per-container port pool and the next `GET /start` will fail with `Failed to start server. Is port 30001 in use?` (live-verified — orphaned chromium on the starting port permanently jams the kit until the container is restarted).

`GET /stop` and `GET /shutdown` both terminate the child and delete any extension profile dir (the child's SIGTERM handler runs the same cleanup as `/shutdown`); persistent profile dirs only exist when extensions were loaded. One `GET /stop` per instance is a complete teardown — calling both is redundant.

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
for BID in 0 examples-auth-9c examples-mobile-fr; do
  curl -sX GET "$KIT/stop?browser_id=$BID" | jq .
done
# If you use /shutdown in teardown, ALWAYS pass start=false — without it the endpoint
# auto-creates a missing instance instead of tearing down:
#   curl -sX GET "$KIT/shutdown?browser_id=$BID&start=false"
# Confirm nothing's left:
curl -sf "$KIT/metrics" | jq '.instances'
```
A `404 Instance not found` from `GET /stop` means it was already gone — safe to ignore. `GET /shutdown` auto-creates a missing instance unless you pass `start=false`; always include `start=false` in teardown calls.

## Reference

### `cookies` (3) — Browser State

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /cookies` | Clear all cookies | `?browser_id*` `?start` |
| `GET /cookies` | Get cookies | `?browser_id*` `?start` `?url` |
| `POST /cookies` | Set cookies | `?browser_id*` `?start` `body*` |

**Param notes:**

- `browser_id` — Unique identifier for the browser instance (0-based index)
- `start` — Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance.
- `url` — Filter cookies by URL

**Body shapes:**

- `POST /cookies` body — `{ cookies*: { name*: string, value*: string, url*: string, domain: string, path: string, httpOnly: bool, secure: bool }[] }`

### `debugging` (2) — Debugging

| Method | Summary | Params |
|--------|---------|--------|
| `GET /console` | Get console logs | `?browser_id*` `?tabId` `?start` `?type` `?since` `?clear` |
| `GET /network` | Get network logs | `?browser_id*` `?tabId` `?start` `?since` `?clear` |

**Param notes:**

- `browser_id` — Unique identifier for the browser instance (0-based index)
- `tabId` — The ID of the tab to interact with
- `start` — Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance.
- `type` — Filter by message type (log, error, warning, info, etc.)
- `since` — Only return logs after this ISO timestamp
- `clear` — Clear the buffer after reading

### `health` (4) — Server monitoring and health check operations

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/browser/health` | Health check |  |
| `GET /metrics` | Server metrics |  |
| `GET /openapi.json` | Get OpenAPI specification (JSON) |  |
| `GET /openapi.yaml` | Get OpenAPI specification (YAML) |  |

### `history` (2) — Operations for querying and managing persistent browsing history

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /history` | Delete browsing history | `?before` `?browser_id` |
| `GET /history` | Query browsing history | `?since` `?domain` `?browser_id` `?limit` `?offset` |

**Param notes:**

- `before` — Delete entries before this ISO 8601 timestamp
- `browser_id` — Delete entries for specific browser ID only
- `since` — Return entries after this ISO 8601 timestamp
- `domain` — Filter by domain (exact match)
- `browser_id` — Filter by browser ID
- `limit` — Maximum entries to return (1-500)
- `offset` — Number of entries to skip for pagination

### `instances` (3) — Operations for creating and managing browser instances

| Method | Summary | Params |
|--------|---------|--------|
| `GET /restart` | Restart browser instance | `?browser_id*` `?chromiumVersion` `?fingerprintId` `?useRemoteDebuggingPort` `?remoteDebuggingPort` `?remoteDebuggingAddress` `?extensions` `?extensionsDir` `?extensionsStoreIds` `?proxyServer` `?proxyUsername` `?proxyPassword` `?proxyBypass` `?enableQuic` `?enableDnsOverHttps` `?dnsOverHttpsUrl` `?display` `?showBrowser` `?sessionName` `?timezoneId` `?locale` `?userAgent` `?viewport` `?noViewport` `?geolocation` `?launchArguments` `?browser` `?firefoxVersion` `?firefoxExecutablePath` `?showDevtools` `?userProfile` `?stealth` `?iframe` `?iframe_url` `?maximize_new_windows` |
| `GET /start` | Create or retrieve browser instance | `?browser_id*` `?chromiumVersion` `?fingerprintId` `?useRemoteDebuggingPort` `?remoteDebuggingPort` `?remoteDebuggingAddress` `?extensions` `?extensionsDir` `?extensionsStoreIds` `?proxyServer` `?proxyUsername` `?proxyPassword` `?proxyBypass` `?enableQuic` `?enableDnsOverHttps` `?dnsOverHttpsUrl` `?display` `?showBrowser` `?sessionName` `?timezoneId` `?locale` `?userAgent` `?viewport` `?noViewport` `?geolocation` `?stealth` `?iframe` `?iframe_url` `?maximize_new_windows` |
| `GET /stop` | Stop browser instance | `?browser_id*` |

**Param notes:**

- `browser_id` — Unique identifier for the browser instance (0-based index)
- `chromiumVersion` — Chromium/Chrome version selection for the instance. This option applies only when `browser=chromium`.  Supported formats: - Full version: `136.0.7103.113` - Major version: `136` (mapped to a known stable patch for the current OS) - Channel tag: `stable`, `beta`, `dev`, `canary`  The server will **block** until the required browser is downloaded into `BROWSERS_DIR`.
- `fingerprintId` — Base fingerprint profile id. The server will load `storage/config/fingerprints/<fingerprintId>.json` and use its `context` and `launch` defaults, then apply any request overrides.
- `useRemoteDebuggingPort` — If `true`, the child process will launch Chromium with `--remote-debugging-port` and will populate `webSocketDebuggerUrl` in metadata responses.
- `remoteDebuggingPort` — Optional fixed DevTools port (only used when `useRemoteDebuggingPort=true`). If omitted, a free port is chosen.
- `remoteDebuggingAddress` — Interface address for DevTools. Defaults to `127.0.0.1`. Use `0.0.0.0` only in trusted environments.
- `extensions` — Comma-separated list (or JSON array string) of absolute extension directory paths to load. Extensions require `showBrowser=true` (headful mode) and will launch a persistent profile.
- `extensionsDir` — Directory containing extension subfolders to load (each subfolder is treated as an extension). Extensions require `showBrowser=true` (headful mode) and will launch a persistent profile.
- `extensionsStoreIds` — Chrome Web Store extension IDs to download and load (Chromium only). Requires `showBrowser=true` and works only with `browser=chromium`.
- `proxyServer` — Proxy server URL (http, https, socks5, socks5h)
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
- `geolocation` — Geolocation configuration as JSON string. Example: {"latitude":40.7128,"longitude":-74.0060,"accuracy":100}
- `launchArguments` — Additional browser launch arguments (repeatable or JSON array)
- `browser` — Browser engine to use (`chromium` or `firefox`)
- `firefoxVersion` — Firefox version label (informational only). Playwright-managed Firefox builds are used by default. If omitted, a Playwright Firefox build is downloaded on demand.
- `firefoxExecutablePath` — Absolute path to a custom Firefox executable (overrides download)
- `showDevtools` — Whether to open DevTools on launch (Chromium only)
- `userProfile` — Optional user profile object (JSON string) for fingerprinting defaults
- `stealth` — Launch Chromium in stealth mode using Patchright (anti-detection patches). Only applies to `browser=chromium`. Ignored for Firefox. Defaults to `true`. Bare `?stealth` is treated as `true`.
- `iframe` — Enable or disable the full-page display iframe on the root URL.
- `iframe_url` — Explicit URL for the display iframe.
- `maximize_new_windows` — Control the `maximize_new_windows` flag stamped onto the generated display URL (always explicit `true`/`false`); when true the hoody-display client opens new top-level app windows maximized. Enabled by default; set to `false` to opt out.
- `extensionsStoreIds` — Comma-separated list (or JSON array string) of Chrome Web Store extension IDs to download and load. Requires `showBrowser=true` and works only with `browser=chromium`.
- `proxyServer` — Proxy server for browser traffic. Supports `http://`, `https://`, `socks5://`, or `socks5h://`. Example: `socks5://127.0.0.1:9050`
- `iframe` — Enable or disable the full-page display iframe on the root URL. When enabled (default), navigating to `/` serves an HTML page with an iframe pointing to the Hoody display URL.
- `iframe_url` — Explicit URL for the display iframe. If not provided, the URL is auto-detected from the Host header subdomain pattern.
- `maximize_new_windows` — Control the `maximize_new_windows` flag stamped onto generated display URLs (iframe pages, status pages, `iframe_url` metadata). The flag is always explicit (`true` or `false`); when true the hoody-display client opens new top-level app windows maximized. Enabled by default; set to `false` to keep the display client's centered default-size placement (the explicit `false` also overrides a display-side `default-settings.txt` enable). Explicit `iframe_url` values are never modified.

### `interaction` (5) — Operations for interacting with browser tabs and content

| Method | Summary | Params |
|--------|---------|--------|
| `GET /browse` | Navigate to URL | `?browser_id*` `?start` `?url` `?tabId` `?active` `?onlyIfNotExists` `?ignoreGetParameters` |
| `POST /browse` | Navigate to URL (POST) | `?browser_id*` `?start` `body*` |
| `GET /eval` | Execute JavaScript | `?browser_id*` `?start` `?script*` |
| `POST /eval` | Execute JavaScript (POST) | `?browser_id*` `?start` `body*` |
| `GET /screenshot` | Capture browser screenshot | `?browser_id*` `?start` `?url` `?tabId` `?onlyIfNotExists` `?ignoreGetParameters` `?format` `?quality` `?fullPage` |

**Param notes:**

- `browser_id` — Unique identifier for the browser instance (0-based index)
- `start` — Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance.
- `url` — The URL to navigate to
- `tabId` — The ID of the tab to interact with
- `active` — Make the tab active (focused) after navigation
- `onlyIfNotExists` — Only create a new tab if no tab with the same URL exists
- `ignoreGetParameters` — Ignore query parameters when checking for existing URL
- `script` — JavaScript code to execute (can be base64 encoded)
- `ignoreGetParameters` — Ignore query strings when checking for existing URL
- `format` — Output format
- `quality` — Image quality for JPEG format (0-100)
- `fullPage` — Capture the entire scrollable page

**Body shapes:**

- `POST /browse` body — `{ url*: string, tabId: int, active: bool=true, onlyIfNotExists: bool=false, ignoreGetParameters: bool=false }`
- `POST /eval` body — `{ script: string }` — Executes a JavaScript snippet provided in the request body
  - `script` — JavaScript code to execute

### `introspection` (7) — Operations for inspecting and controlling browser instances

| Method | Summary | Params |
|--------|---------|--------|
| `POST /tab/close` | Close a browser tab | `?browser_id*` `?start` `body` |
| `GET /devtools-url` | Get DevTools URLs | `?browser_id*` `?start` |
| `GET /metadata` | Get instance metadata | `?browser_id*` `?start` |
| `GET /viewport` | Get the current viewport policy | `?browser_host` `?browser_port` |
| `GET /tabs` | List browser tabs | `?browser_id*` `?start` |
| `POST /viewport` | Change the viewport at runtime | `?browser_host` `?browser_port` `body*` |
| `GET /shutdown` | Shutdown browser instance | `?browser_id*` |

**Param notes:**

- `browser_id` — Unique identifier for the browser instance (0-based index)
- `start` — Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance.
- `browser_host` — Instance host. Optional — must be paired with browser_port; when both are omitted the single running instance is selected (400 AMBIGUOUS_INSTANCE with more than one).
- `browser_port` — Instance port. Optional — must be paired with browser_host.

**Body shapes:**

- `POST /tab/close` body — `{ tabId: int }`
  - `tabId` — The ID of the tab to close
- `POST /viewport` body — `{ viewport*: { width*: int, height*: int }|null }`
  - `viewport` — Fixed size {width,height} (integers 1..8192, no other keys), or null for responsive.

### `page` (3) — Page Content

| Method | Summary | Params |
|--------|---------|--------|
| `GET /pdf` | Export page as PDF | `?browser_id*` `?tabId` `?start` `?url` `?format` `?landscape` `?printBackground` `?margin` |
| `GET /html` | Get page HTML | `?browser_id*` `?tabId` `?start` |
| `GET /text` | Get page text | `?browser_id*` `?tabId` `?start` |

**Param notes:**

- `browser_id` — Unique identifier for the browser instance (0-based index)
- `tabId` — The ID of the tab to interact with
- `start` — Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance.
- `url` — Optional URL to navigate to before generating the PDF
- `format` — Paper format (e.g. A4, Letter)
- `landscape` — Use landscape orientation
- `printBackground` — Include background graphics
- `margin` — Uniform margin (e.g. '1cm', '0.5in')

