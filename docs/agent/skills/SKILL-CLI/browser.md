> _**CLI skill · `browser` namespace** · ~5,762 tokens · hoody-sdk v1.0.0-beta.12_

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
- External CDP via `hoody browser devtools` (Chromium ships `webSocketDebuggerUrl` ON by default — pass `useRemoteDebuggingPort=false` to disable; Firefox never exposes it).

## When NOT to use

- Plain HTTP, persistence, server scripts, stream UI, shell → `curl`/`sqlite`/`exec`/`display`/`terminal`.

## Prerequisites

- Headful (default `showBrowser=true`) needs X display: `?display=` or `DISPLAY`. Extensions also require `showBrowser=true`.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Start + navigate
1. `hoody browser start` — `browser_id` + overrides (proxy, stealth, fingerprintId, viewport, locale, timezoneId, userAgent, geolocation).
2. `hoody browser navigate`/`hoody browser navigate-post` — `tab_id`, `only_if_not_exists=true`.
3. `hoody browser info`.

### 2. Extract content
After browse: `hoody browser html`/`hoody browser text`/`hoody browser screenshot`/`hoody browser pdf` — params in Reference.

### 3. Authenticated scraping
1. `hoody browser start` matching `userAgent`/`viewport`/`locale`.
2. `hoody browser cookies set` — POST array (Playwright `addCookies` shape).
3. `hoody browser navigate` to protected URL.
4. `hoody browser html`/`hoody browser text`.
5. `hoody browser cookies clear`.

### 4. JS eval + logs
1. `hoody browser start` → `hoody browser navigate`.
2. `hoody browser eval` (`?script=`) or `hoody browser eval-post` (raw JS body).
3. `hoody browser console` (`since`,`type`,`clear=true`).
4. `hoody browser network`.

### 5. History
`hoody browser history query` (filters: `since`/`domain`/`browser_id`) and `hoody browser history delete` (`before` + `browser_id` AND).

### 6. Dedicated project browser — suggest it to the user
When the work is a website project or business research, **offer** the user a dedicated recorded browser. This is a suggestion to the user only — set it up when they ask, don't spin it up unprompted.
1. Pick a slot number X (e.g. 2) and start headful on the matching display: `hoody browser start` with a stable `browser_id` (the project slug), `browser_port` (e.g. 30000+X), `display` 500+X, `showBrowser=true` — plus any per-project identity: own egress proxy (`proxyServer`/`proxyUsername`/`proxyPassword`/`proxyBypass`), `stealth`, `userAgent`, `viewport`, `locale`, `geolocation`, extensions.
2. Give the user the direct live-view URL — it's the standard kit URL with the `browser-` slug: `https://{P}-{C}-browser-X.{N}.containers.hoody.com/`. The root page of `browser-X` embeds display 500+X live, so an instance started on display 500+X gets its own stable viewing URL — changing the X in the URL is how you address each browser's live window. `hoody browser devtools` adds a live DevTools inspector as a second link.
3. Everything browsed there — by the user clicking around in the live view or by the agent via the API — lands in persistent per-`browser_id` history (`hoody browser history query`): live debugging and business research accumulate into one durable project trail. The instance itself is reaped after ~1h idle (see Quirks) — history survives; re-run `hoody browser start` with the same options to revive the window.
4. Then offer log capture as a follow-up: console/network buffers hold only the last 500 entries and die with the instance, so a recurring `cron` job (or agent loop) draining `hoody browser console`/`hoody browser network` with `clear=true` into `sqlite`/`files`/agent memory preserves full context for later sessions.

## Quirks & gotchas

- `browser_id` is an opaque, 0-based string. The kit's request handler reads `browser_port || port` from query/body (NOT `browser_id`); the generated SDK sends `browser_id` as a query param; the URL serviceIndex slot (e.g. `-browser-1.`) is a separate proxy routing variable set via `_templateVars`, defaulting to 1. Drive via the SDK and prefer `browser_id`; raw `curl` against the kit must send `browser_port=<num>`.
- Endpoints auto-create unless `start=false` or `--disable-auto-start`.
- `stealth` defaults true; bare `?stealth`=true. Mid-flight change throws `Instance backend mismatch` — `hoody browser stop` first.
- `stealth=true` ignored on Firefox (Patchright is Chromium-only).
- Extensions need `showBrowser=true`; force persistent profile.
- `chromiumVersion`: full / major / channel (`stable|beta|dev|canary`); first new version blocks on download.
- Console/network logs: 500-entry ring buffers — drain or filter `since`.
- **Idle instances are killed after `HOODY_INSTANCE_MAX_AGE` ms (default 3 600 000 = 1 h).** Cleanup runs every `HOODY_CLEANUP_INTERVAL` ms (default 300000 = 5 min) and SIGTERMs anything past max-age. Heartbeat any active instance with a request to refresh `lastAccessed`. Long-running scrape loops or warm cookies WILL silently lose state across hours of idle.
- Instances do NOT survive kit-process restarts: graceful shutdown (SIGTERM/SIGINT) terminates every child.
- History records ALL navs (incl. headful clicks) at `/hoody/storage/hoody-browser/history`, retention 30 d (`HOODY_HISTORY_RETENTION_DAYS`). Disable: `--history-disable` / `HOODY_HISTORY_DISABLE=true`.
- **`hoody browser history delete` with no filters wipes all history** — pair `before` + `browser_id` (or both).
- `browser_id` history filter sanitised as path component.
- `eval` POST accepts BOTH `Content-Type: application/json` with `{"script":"..."}` (what the SDK and CLI send) and `Content-Type: text/plain` with the raw JS body — the kit tries JSON parse first, falls back to storing the body as `__raw`.
- Chromium CDP defaults to `useRemoteDebuggingPort=true`; `hoody browser devtools` only 404s when the instance itself is missing (NOT when CDP is "off"). To disable CDP exposure, pass `useRemoteDebuggingPort=false` at start. CDP listener binds to `0.0.0.0` by default — treat it as a security-relevant default and either keep CDP off in shared environments or front it with the kit URL's capability gate.
- `viewport` and `geolocation` query/body values are **JSON strings**, not free-form `"WxH"` / `"lat,lng"` — the kit `JSON.parse`s and rejects anything else. Examples: `viewport='{"width":1280,"height":800}'`, `geolocation='{"latitude":48.8,"longitude":2.3,"accuracy":50}'`.
- Screenshot `format` enum is `png | jpeg | base64` (NO `json`). Base64 mode returns `{ data: "<b64>" }` only — there is NO `mimeType` or `dataUrl` in the response (the kit's JSON body has `data` only).

## Common errors

- `VALIDATION_ERROR` 400 — bad `browser_id`, malformed `viewport`/`geolocation`, history `limit` not 1–500, `offset`<0.
- `NOT_FOUND` 404 `Instance not found` — `hoody browser stop`, `hoody browser devtools`, `start=false` no instance.
- `HISTORY_DISABLED` 404 `History is disabled` — history endpoints with `--history-disable`.
- `INSTANCE_BACKEND_MISMATCH` 409 (message starts `Instance backend mismatch`) — `stealth` differs from the running instance's backend; `hoody browser stop` then `hoody browser start`.
- `VALIDATION_ERROR` 400 `display is required when showBrowser=true (no DISPLAY detected)` — `showBrowser=true` with no `display` field on `hoody browser start` and no `$DISPLAY` env.
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

Every step in every example was live-tested against a real `browser-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. ⚠ The kit keys instances on **`browser_port`**, not `browser_id` — on instance endpoints `browser_id` is ignored (it only namespaces history), so calls that differ only in `browser_id` all resolve to the same default instance. The examples run sequentially against that single default instance; for genuinely concurrent flows add a unique `browser_port=$((30000+i))` to every call, as Example 2 does (see the Quirks gotcha).

### 1. Spin up a headless instance and navigate to a URL

**Goal:** boot a Chromium instance, point it at a page, confirm it's alive. Headless avoids the X-display dependency (`showBrowser=false`).

**Step 1 — start.** Returns the start-response payload (`engine`, `headless`, `chromiumBuildId`, `browser_host`, `browser_port`). `hoody browser start` is idempotent — calling again with the same `browser_id` returns the existing instance.

```bash
hoody --container "$C" browser start --browser-id 0 \
  --no-show-browser --no-stealth -o json \
  | jq '{browser_id,engine,headless,chromiumBuildId,browser_port}'
```
**Step 2 — navigate.** `hoody browser navigate` opens or reuses a tab and waits for load.

```bash
hoody --container "$C" browser navigate --browser-id 0 \
  --url https://httpbin.org/html
```
### 2. Full-page PNG screenshot

**Goal:** capture the entire scrolled height (not just the viewport). `format=base64` returns `{ data: "<b64>" }`; the default `format=png` returns raw `image/png` bytes.

```bash
hoody --container "$C" browser screenshot --browser-id 0 \
  --full-page --url https://httpbin.org/html --format base64 -o raw \
  | jq -r .data | base64 -d > /tmp/page.png
```
### 3. Get the page HTML and the rendered text

**Goal:** read the post-JS DOM (HTML) and the visible text the user would see (`hoody browser text` calls Playwright `innerText` on `body`).

```bash
hoody --container "$C" browser html --browser-id 0 | head -c 200
hoody --container "$C" browser text --browser-id 0 | head -c 200
```
### 4. Execute JavaScript in the page and capture the return value

**Goal:** run a script in the page context. `hoody browser eval` puts the script in `?script=` (size-bound by URL). `hoody browser eval-post` accepts `{ script }` JSON via the SDK / CLI / `Content-Type: application/json`; raw `Content-Type: text/plain` HTTP also works (body = script source). Either shape returns the result.

```bash
hoody --container "$C" browser eval --browser-id 0 \
  --script 'document.title'
hoody --container "$C" browser eval-post --browser-id 0 \
  --script 'JSON.stringify({title: document.title, links: document.querySelectorAll("a").length})'
```
### 5. Set cookies and read them back

**Goal:** prime the cookie jar, then verify. POST body is the Playwright `addCookies` shape: an array of `{ name, value, url }` (or `{ name, value, domain, path }`). Each cookie REQUIRES either `url` OR `domain+path`.

```bash
# _(no native `hoody browser` shape)_ — the generated CLI registers NO flag for the
# `cookies` JSON body param, so cookie WRITES are HTTP/SDK-only. Reads work:
hoody --container "$C" browser cookies get --browser-id 0 \
  --url https://httpbin.org
```
### 6. Authenticated scrape — set session cookie, browse, extract, clear

**Goal:** scrape a logged-in page without re-doing OAuth. Pre-load the session cookie a real login would have set, hit the protected URL, read text, then DELETE the jar.

```bash
hoody --container "$C" browser start --browser-id examples-auth-9c \
  --no-show-browser --no-stealth
# _(no native `hoody browser` shape for the cookie WRITE)_ — the generated CLI
# registers no flag for the `cookies` JSON body param; use the HTTP or SDK form
# for this step, then continue with the CLI below.
hoody --container "$C" browser navigate --browser-id examples-auth-9c \
  --url https://app.example.com/dashboard
hoody --container "$C" browser text --browser-id examples-auth-9c | head -c 400
hoody --container "$C" browser cookies clear --browser-id examples-auth-9c
```
### 7. `hoody browser navigate-post` with explicit viewport, locale, and User-Agent

**Goal:** mimic a French mobile Safari to test geo/UA-gated content. Browser-context settings (`viewport`, `locale`, `timezoneId`, `userAgent`) are set at `hoody browser start`; `hoody browser navigate-post` carries the navigation body.

`viewport` is a JSON string such as `'{"width":390,"height":844}'`. `geolocation` is a JSON string such as `'{"latitude":48.8566,"longitude":2.3522,"accuracy":20}'`.

```bash
hoody --container "$C" browser start --browser-id examples-mobile-fr \
  --no-show-browser --stealth \
  --viewport '{"width":390,"height":844}' --locale fr-FR --timezone-id Europe/Paris \
  --user-agent 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' \
  --geolocation '{"latitude":48.8566,"longitude":2.3522,"accuracy":20}'
hoody --container "$C" browser navigate-post --browser-id examples-mobile-fr \
  --url https://httpbin.org/headers
hoody --container "$C" browser text --browser-id examples-mobile-fr | head -c 500
```
### 8. Inspect browsing history (filter by domain, then drop one host)

**Goal:** the kit records every navigation under `/hoody/storage/hoody-browser/history` (30-day retention, 500-entry pagination cap). Query, then selectively delete.

```bash
hoody --container "$C" browser history query \
  --since "$(date -u -d '1 hour ago' +%FT%TZ)" --limit 50 -o json \
  | jq '{total, has_more}'
# NOTE: CLI `history query` does NOT expose --domain (only --since / --browser-id / --limit / --offset registered as Commander options); use SDK or HTTP for domain filter.
# `history delete` is interactive (requiresConfirmation: true); pass --yes or use SDK for non-interactive.
hoody --container "$C" browser history delete \
  --before "$(date -u -d '7 days ago' +%FT%TZ)" \
  --browser-id 0 --yes
```
### 9. Capture instance metadata (engine, viewport, debug URL)

**Goal:** introspect what the kit actually launched — engine (`playwright`/`patchright`), Chromium build, executable path, current display, debug socket. Use `start=false` to query *without* auto-starting (404 if no instance exists).

```bash
hoody --container "$C" browser info --browser-id 0 \
  | jq '{engine, headless, chromiumBuildId, browser_port}'
hoody --container "$C" browser tabs list --browser-id 0
```
For an external CDP attachment, `hoody browser devtools` returns the live `webSocketDebuggerUrl` (CDP is on by default; default `useRemoteDebuggingPort=true`). If you started with `useRemoteDebuggingPort=false`, the call still returns 200 but `webSocketDebuggerUrl` is null. A 404 `Instance not found` means no instance exists at all (e.g. queried with `start=false`).

### 10. Stop and shutdown — the ONLY safe ending

**Goal:** browser instances stay alive across requests within a kit-process lifetime (graceful kit restart SIGTERMs every child — see Quirks & gotchas); if you forget to shut down you'll exhaust the per-container port pool and the next `hoody browser start` will fail with `Failed to start server. Is port 30001 in use?` (live-verified — orphaned chromium on the starting port permanently jams the kit until the container is restarted).

`hoody browser stop` and `hoody browser shutdown` both terminate the child and delete any extension profile dir (the child's SIGTERM handler runs the same cleanup as `/shutdown`); persistent profile dirs only exist when extensions were loaded. One `hoody browser stop` per instance is a complete teardown — calling both is redundant.

```bash
for BID in 0 examples-auth-9c examples-mobile-fr; do
  hoody --container "$C" browser stop --browser-id "$BID" || true
done
hoody --container "$C" browser metrics -o json | jq '.instances'
```
A `404 Instance not found` from `hoody browser stop` means it was already gone — safe to ignore. `hoody browser shutdown` auto-creates a missing instance unless you pass `start=false`; always include `start=false` in teardown calls.

## Reference

### `hoody browser` (26) — Browser automation and control

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody browser console` |  | read | Get console logs (use `--clear` to also clear) | `browser.debugging.getConsoleLogs` | `hoody browser console --browser-id 1 --tab-id 10 --start --type default --since 2026-01-01T00:00:00Z --clear` |
| `hoody browser cookies clear` |  | destructive | Clear all cookies | `browser.cookies.clear` | `hoody browser cookies clear --browser-id 1 --start` |
| `hoody browser cookies get` |  | read | Get cookies | `browser.cookies.get` | `hoody browser cookies get --browser-id 1 --start --url https://example.com` |
| `hoody browser cookies set` |  | write | Set cookies | `browser.cookies.set` | `hoody browser cookies set --browser-id 1 --start` |
| `hoody browser devtools` |  | read | Get DevTools URLs | `browser.introspection.getDevtoolsUrl` | `hoody browser devtools --browser-id 1 --start` |
| `hoody browser eval` |  | action | Execute JavaScript | `browser.interaction.evalGet` | `hoody browser eval --browser-id 1 --start --script <script>` |
| `hoody browser eval-post` |  | action | Execute JavaScript (POST) | `browser.interaction.evalPost` | `hoody browser eval-post --browser-id 1 --start --script <script>` |
| `hoody browser health` |  | read | Health check | `browser.health.check` | `hoody browser health` |
| `hoody browser history delete` | rm, remove | destructive | Delete browsing history | `browser.history.clear` | `hoody browser history delete --before <before> --browser-id 1` |
| `hoody browser history query` |  | read | Query browsing history | `browser.history.list` | `hoody browser history query --since 2026-01-01T00:00:00Z --browser-id 1 --limit 50 --offset 0` |
| `hoody browser html` |  | read | Get page HTML | `browser.page.getHtml` | `hoody browser html --browser-id 1 --tab-id 10 --start` |
| `hoody browser info` | metadata | read | Get instance metadata | `browser.introspection.getMetadata` | `hoody browser info --browser-id 1 --start` |
| `hoody browser metrics` |  | read | Server metrics | `browser.health.getMetrics` | `hoody browser metrics` |
| `hoody browser navigate` |  | action | Navigate to URL | `browser.interaction.browse` | `hoody browser navigate --browser-id 1 --start --url https://example.com --tab-id 10 --active --only-if-not-exists --ignore-get-parameters` |
| `hoody browser navigate-post` |  | action | Navigate to URL (POST) | `browser.interaction.browsePost` | `hoody browser navigate-post --browser-id 1 --start --url https://example.com --tab-id 10 --active --only-if-not-exists --ignore-get-parameters` |
| `hoody browser network` |  | read | Get network logs (use `--clear` to also clear) | `browser.debugging.getNetworkLogs` | `hoody browser network --browser-id 1 --tab-id 10 --start --since 2026-01-01T00:00:00Z --clear` |
| `hoody browser open` |  | action | Open the Browser kit service (browser automation UI) in your browser |  | `hoody browser open [index] [--url]` |
| `hoody browser pdf` |  | read | Export page as PDF | `browser.page.exportPdf` | `hoody browser pdf --browser-id 1 --tab-id 10 --start --url https://example.com --format Letter --landscape --print-background --margin <margin>` |
| `hoody browser restart` |  | action | Restart browser instance | `browser.instances.restart` | `hoody browser restart --browser-id 1 --chromium-version <chromium_version> --fingerprint-id abc-123 --use-remote-debugging-port --remote-debugging-port 10 --remote-debugging-address <remote_debugging_address> --extensions <extensions> --extensions-dir <extensions_dir> --extensions-store-ids <extensions_store_ids> --proxy-server <proxy_server> --proxy-username <proxy_username> --proxy-password <proxy_password> --proxy-bypass <proxy_bypass> --enable-quic --enable-dns-over-https --dns-over-https-url https://cloudflare-dns.com/dns-query --display 10 --show-browser --session-name <session_name> --timezone-id abc-123 --locale <locale> --user-agent "Mozilla/5.0" --viewport <viewport> --geolocation <geolocation> --launch-arguments <launch_arguments> --browser chromium --firefox-version <firefox_version> --firefox-executable-path /home/user/file.txt --show-devtools --stealth --iframe --iframe-url https://example.com --maximize-new-windows` |
| `hoody browser screenshot` | shot | read | Capture browser screenshot | `browser.interaction.takeScreenshot` | `hoody browser screenshot --browser-id 1 --start --url https://example.com --tab-id 10 --only-if-not-exists --ignore-get-parameters --format png --quality 10 --full-page` |
| `hoody browser shutdown` |  | destructive | Shutdown browser instance | `browser.introspection.shutdown` | `hoody browser shutdown --browser-id 1` |
| `hoody browser start` | up | action | Create or retrieve browser instance | `browser.instances.start` | `hoody browser start --browser-id 1 --chromium-version <chromium_version> --fingerprint-id abc-123 --use-remote-debugging-port --remote-debugging-port 10 --remote-debugging-address <remote_debugging_address> --extensions <extensions> --extensions-dir <extensions_dir> --extensions-store-ids <extensions_store_ids> --proxy-server <proxy_server> --proxy-username <proxy_username> --proxy-password <proxy_password> --proxy-bypass <proxy_bypass> --enable-quic --enable-dns-over-https --dns-over-https-url https://cloudflare-dns.com/dns-query --display 10 --show-browser --session-name <session_name> --timezone-id abc-123 --locale <locale> --user-agent "Mozilla/5.0" --viewport <viewport> --geolocation <geolocation> --stealth --iframe --iframe-url https://example.com --maximize-new-windows` |
| `hoody browser stop` | kill, down | action | Stop browser instance | `browser.instances.stop` | `hoody browser stop --browser-id 1` |
| `hoody browser tabs close` |  | write | Close a browser tab | `browser.introspection.closeTab` | `hoody browser tabs close --browser-id 1 --start --tab-id 10` |
| `hoody browser tabs list` |  | read | List browser tabs | `browser.introspection.listTabs` | `hoody browser tabs list --browser-id 1 --start` |
| `hoody browser text` |  | read | Get page text | `browser.page.getText` | `hoody browser text --browser-id 1 --tab-id 10 --start` |

