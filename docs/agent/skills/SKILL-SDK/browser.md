> _**SDK skill · `browser` namespace** · ~12,359 tokens · hoody-sdk v1.0.0-beta.12_

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
- External CDP via `getDevtoolsUrl` (Chromium ships `webSocketDebuggerUrl` ON by default — pass `useRemoteDebuggingPort=false` to disable; Firefox never exposes it).

## When NOT to use

- Plain HTTP, persistence, server scripts, stream UI, shell → `curl`/`sqlite`/`exec`/`display`/`terminal`.

## Prerequisites

- Headful (default `showBrowser=true`) needs X display: `?display=` or `DISPLAY`. Extensions also require `showBrowser=true`.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Start + navigate
1. `instances.start` — `browser_id` + overrides (proxy, stealth, fingerprintId, viewport, locale, timezoneId, userAgent, geolocation).
2. `interaction.browse`/`browsePost` — `tab_id`, `only_if_not_exists=true`.
3. `introspection.getMetadata`.

### 2. Extract content
After browse: `getHtml`/`getText`/`takeScreenshot`/`exportPdf` — params in Reference.

### 3. Authenticated scraping
1. `instances.start` matching `userAgent`/`viewport`/`locale`.
2. `cookies.set` — POST array (Playwright `addCookies` shape).
3. `interaction.browse` to protected URL.
4. `page.getHtml`/`getText`.
5. `cookies.clear`.

### 4. JS eval + logs
1. `instances.start` → `interaction.browse`.
2. `interaction.evalGet` (`?script=`) or `evalPost` (raw JS body).
3. `debugging.getConsoleLogs` (`since`,`type`,`clear=true`).
4. `debugging.getNetworkLogs`.

### 5. History
`history.list` (filters: `since`/`domain`/`browser_id`) and `history.clear` (`before` + `browser_id` AND).

### 6. Dedicated project browser — suggest it to the user
When the work is a website project or business research, **offer** the user a dedicated recorded browser. This is a suggestion to the user only — set it up when they ask, don't spin it up unprompted.
1. Pick a slot number X (e.g. 2) and start headful on the matching display: `instances.start` with a stable `browser_id` (the project slug), `browser_port` (e.g. 30000+X), `display` 500+X, `showBrowser=true` — plus any per-project identity: own egress proxy (`proxyServer`/`proxyUsername`/`proxyPassword`/`proxyBypass`), `stealth`, `userAgent`, `viewport`, `locale`, `geolocation`, extensions.
2. Give the user the direct live-view URL — it's the standard kit URL with the `browser-` slug: `https://{P}-{C}-browser-X.{N}.containers.hoody.com/`. The root page of `browser-X` embeds display 500+X live, so an instance started on display 500+X gets its own stable viewing URL — changing the X in the URL is how you address each browser's live window. `introspection.getDevtoolsUrl` adds a live DevTools inspector as a second link.
3. Everything browsed there — by the user clicking around in the live view or by the agent via the API — lands in persistent per-`browser_id` history (`history.list`): live debugging and business research accumulate into one durable project trail. The instance itself is reaped after ~1h idle (see Quirks) — history survives; re-run `instances.start` with the same options to revive the window.
4. Then offer log capture as a follow-up: console/network buffers hold only the last 500 entries and die with the instance, so a recurring `cron` job (or agent loop) draining `debugging.getConsoleLogs`/`debugging.getNetworkLogs` with `clear=true` into `sqlite`/`files`/agent memory preserves full context for later sessions.

## Quirks & gotchas

- `browser_id` is an opaque, 0-based string. The kit's request handler reads `browser_port || port` from query/body (NOT `browser_id`); the generated SDK sends `browser_id` as a query param; the URL serviceIndex slot (e.g. `-browser-1.`) is a separate proxy routing variable set via `_templateVars`, defaulting to 1. Drive via the SDK and prefer `browser_id`; raw `curl` against the kit must send `browser_port=<num>`.
- Endpoints auto-create unless `start=false` or `--disable-auto-start`.
- `stealth` defaults true; bare `?stealth`=true. Mid-flight change throws `Instance backend mismatch` — `stop` first.
- `stealth=true` ignored on Firefox (Patchright is Chromium-only).
- Extensions need `showBrowser=true`; force persistent profile.
- `chromiumVersion`: full / major / channel (`stable|beta|dev|canary`); first new version blocks on download.
- Console/network logs: 500-entry ring buffers — drain or filter `since`.
- **Idle instances are killed after `HOODY_INSTANCE_MAX_AGE` ms (default 3 600 000 = 1 h).** Cleanup runs every `HOODY_CLEANUP_INTERVAL` ms (default 300000 = 5 min) and SIGTERMs anything past max-age. Heartbeat any active instance with a request to refresh `lastAccessed`. Long-running scrape loops or warm cookies WILL silently lose state across hours of idle.
- Instances do NOT survive kit-process restarts: graceful shutdown (SIGTERM/SIGINT) terminates every child.
- History records ALL navs (incl. headful clicks) at `/hoody/storage/hoody-browser/history`, retention 30 d (`HOODY_HISTORY_RETENTION_DAYS`). Disable: `--history-disable` / `HOODY_HISTORY_DISABLE=true`.
- **`history.clear` with no filters wipes all history** — pair `before` + `browser_id` (or both).
- `browser_id` history filter sanitised as path component.
- `eval` POST accepts BOTH `Content-Type: application/json` with `{"script":"..."}` (what the SDK and CLI send) and `Content-Type: text/plain` with the raw JS body — the kit tries JSON parse first, falls back to storing the body as `__raw`.
- Chromium CDP defaults to `useRemoteDebuggingPort=true`; `getDevtoolsUrl` only 404s when the instance itself is missing (NOT when CDP is "off"). To disable CDP exposure, pass `useRemoteDebuggingPort=false` at start. CDP listener binds to `0.0.0.0` by default — treat it as a security-relevant default and either keep CDP off in shared environments or front it with the kit URL's capability gate.
- `viewport` and `geolocation` query/body values are **JSON strings**, not free-form `"WxH"` / `"lat,lng"` — the kit `JSON.parse`s and rejects anything else. Examples: `viewport='{"width":1280,"height":800}'`, `geolocation='{"latitude":48.8,"longitude":2.3,"accuracy":50}'`.
- Screenshot `format` enum is `png | jpeg | base64` (NO `json`). Base64 mode returns `{ data: "<b64>" }` only — there is NO `mimeType` or `dataUrl` in the response (the kit's JSON body has `data` only).

## Common errors

- `VALIDATION_ERROR` 400 — bad `browser_id`, malformed `viewport`/`geolocation`, history `limit` not 1–500, `offset`<0.
- `NOT_FOUND` 404 `Instance not found` — `stop`, `getDevtoolsUrl`, `start=false` no instance.
- `HISTORY_DISABLED` 404 `History is disabled` — history endpoints with `--history-disable`.
- `INSTANCE_BACKEND_MISMATCH` 409 (message starts `Instance backend mismatch`) — `stealth` differs from the running instance's backend; `stop` then `start`.
- `VALIDATION_ERROR` 400 `display is required when showBrowser=true (no DISPLAY detected)` — `showBrowser=true` with no `display` field on `instances.start` and no `$DISPLAY` env.
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

Every step in every example was live-tested against a real `browser-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first. ⚠ The kit keys instances on **`browser_port`**, not `browser_id` — on instance endpoints `browser_id` is ignored (it only namespaces history), so calls that differ only in `browser_id` all resolve to the same default instance. The examples run sequentially against that single default instance; for genuinely concurrent flows add a unique `browser_port=$((30000+i))` to every call, as Example 2 does (see the Quirks gotcha).

### 1. Spin up a headless instance and navigate to a URL

**Goal:** boot a Chromium instance, point it at a page, confirm it's alive. Headless avoids the X-display dependency (`showBrowser=false`).

**Step 1 — start.** Returns the start-response payload (`engine`, `headless`, `chromiumBuildId`, `browser_host`, `browser_port`). `instances.start` is idempotent — calling again with the same `browser_id` returns the existing instance.

```typescript
const meta = await client.browser.instances.start({
  browser_id: '0',
  showBrowser: false,
  stealth: false,
});
console.log(meta.data!.engine, meta.data!.headless, meta.data!.chromiumBuildId);
```
**Step 2 — navigate.** `interaction.browse` opens or reuses a tab and waits for load.

```typescript
await client.browser.interaction.browse({
  browser_id: '0',
  url: 'https://httpbin.org/html',
});
```
### 2. Full-page PNG screenshot

**Goal:** capture the entire scrolled height (not just the viewport). `format=base64` returns `{ data: "<b64>" }`; the default `format=png` returns raw `image/png` bytes.

```typescript
import { writeFileSync } from 'fs';
const r = await client.browser.interaction.takeScreenshot({
  browser_id: '0',
  fullPage: true,
  format: 'base64',
  url: 'https://httpbin.org/html',
});
const b64 = (r.data as any).data as string; // kit returns { data: "<b64>" }; the client wraps it
writeFileSync('/tmp/page.png', Buffer.from(b64, 'base64'));
```
### 3. Get the page HTML and the rendered text

**Goal:** read the post-JS DOM (HTML) and the visible text the user would see (`page.getText` calls Playwright `innerText` on `body`).

```typescript
const html = await client.browser.page.getHtml({ browser_id: '0' });
const text = await client.browser.page.getText({ browser_id: '0' });
console.log(html.data!.slice(0, 200), '\n---\n', text.data!.slice(0, 200));
```
### 4. Execute JavaScript in the page and capture the return value

**Goal:** run a script in the page context. `evalGet` puts the script in `?script=` (size-bound by URL). `evalPost` accepts `{ script }` JSON via the SDK / CLI / `Content-Type: application/json`; raw `Content-Type: text/plain` HTTP also works (body = script source). Either shape returns the result.

```typescript
const t = await client.browser.interaction.evalGet({
  browser_id: '0', script: 'document.title',
});
const r = await client.browser.interaction.evalPost(
  { script: 'JSON.stringify({title: document.title, links: document.querySelectorAll("a").length})' },
  { browser_id: '0' },
);
console.log(t.data, r.data);
```
### 5. Set cookies and read them back

**Goal:** prime the cookie jar, then verify. POST body is the Playwright `addCookies` shape: an array of `{ name, value, url }` (or `{ name, value, domain, path }`). Each cookie REQUIRES either `url` OR `domain+path`.

```typescript
await client.browser.cookies.set({
  cookies: [
    { name: 'session', value: 'abc123', url: 'https://httpbin.org' },
    { name: 'theme',   value: 'dark',   url: 'https://httpbin.org' },
  ],
}, { browser_id: '0' });
const jar = await client.browser.cookies.get({
  browser_id: '0', url: 'https://httpbin.org',
});
console.log(jar.data!.cookies);
```
### 6. Authenticated scrape — set session cookie, browse, extract, clear

**Goal:** scrape a logged-in page without re-doing OAuth. Pre-load the session cookie a real login would have set, hit the protected URL, read text, then DELETE the jar.

```typescript
const BID = 'examples-auth-9c';
await client.browser.instances.start({ browser_id: BID, showBrowser: false, stealth: false });
await client.browser.cookies.set(
  { cookies: [{ name: 'sessionid', value: 'REAL_TOKEN', url: 'https://app.example.com' }] },
  { browser_id: BID },
);
await client.browser.interaction.browse({ browser_id: BID, url: 'https://app.example.com/dashboard' });
const t = await client.browser.page.getText({ browser_id: BID });
await client.browser.cookies.clear({ browser_id: BID });
```
### 7. `browsePost` with explicit viewport, locale, and User-Agent

**Goal:** mimic a French mobile Safari to test geo/UA-gated content. Browser-context settings (`viewport`, `locale`, `timezoneId`, `userAgent`) are set at `instances.start`; `interaction.browsePost` carries the navigation body.

`viewport` is a JSON string such as `'{"width":390,"height":844}'`. `geolocation` is a JSON string such as `'{"latitude":48.8566,"longitude":2.3522,"accuracy":20}'`.

```typescript
const BID = 'examples-mobile-fr';
await client.browser.instances.start({
  browser_id: BID, showBrowser: false, stealth: true,
  viewport: '{"width":390,"height":844}', locale: 'fr-FR', timezoneId: 'Europe/Paris',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  geolocation: '{"latitude":48.8566,"longitude":2.3522,"accuracy":20}',
});
await client.browser.interaction.browsePost(
  { url: 'https://httpbin.org/headers', active: true, onlyIfNotExists: false },
  { browser_id: BID },
);
const t = await client.browser.page.getText({ browser_id: BID });
```
### 8. Inspect browsing history (filter by domain, then drop one host)

**Goal:** the kit records every navigation under `/hoody/storage/hoody-browser/history` (30-day retention, 500-entry pagination cap). Query, then selectively delete.

```typescript
const since = new Date(Date.now() - 3600_000).toISOString();
const recent = await client.browser.history.list({ since, limit: 50 });
console.log(recent.data!.total, recent.data!.has_more);
const before = new Date(Date.now() - 7 * 86400_000).toISOString();
await client.browser.history.clear({ before, browser_id: '0' });
```
### 9. Capture instance metadata (engine, viewport, debug URL)

**Goal:** introspect what the kit actually launched — engine (`playwright`/`patchright`), Chromium build, executable path, current display, debug socket. Use `start=false` to query *without* auto-starting (404 if no instance exists).

```typescript
const meta = await client.browser.introspection.getMetadata({
  browser_id: '0', start: false,
});
const tabs = await client.browser.introspection.listTabs({
  browser_id: '0', start: false,
});
console.log(meta.data!.engine, meta.data!.chromiumBuildId, tabs.data);
```
For an external CDP attachment, `introspection.getDevtoolsUrl` returns the live `webSocketDebuggerUrl` (CDP is on by default; default `useRemoteDebuggingPort=true`). If you started with `useRemoteDebuggingPort=false`, the call still returns 200 but `webSocketDebuggerUrl` is null. A 404 `Instance not found` means no instance exists at all (e.g. queried with `start=false`).

### 10. Stop and shutdown — the ONLY safe ending

**Goal:** browser instances stay alive across requests within a kit-process lifetime (graceful kit restart SIGTERMs every child — see Quirks & gotchas); if you forget to shut down you'll exhaust the per-container port pool and the next `instances.start` will fail with `Failed to start server. Is port 30001 in use?` (live-verified — orphaned chromium on the starting port permanently jams the kit until the container is restarted).

`instances.stop` and `introspection.shutdown` both terminate the child and delete any extension profile dir (the child's SIGTERM handler runs the same cleanup as `/shutdown`); persistent profile dirs only exist when extensions were loaded. One `instances.stop` per instance is a complete teardown — calling both is redundant.

```typescript
for (const BID of ['0', 'examples-auth-9c', 'examples-mobile-fr']) {
  try { await client.browser.instances.stop({ browser_id: BID }); } catch {}
}
const m = await client.browser.health.getMetrics();
console.log(m.data!.instances);
```
A `404 Instance not found` from `stop` means it was already gone — safe to ignore. `shutdown` auto-creates a missing instance unless you pass `start=false`; always include `start=false` in teardown calls.

## Reference

**Accessor:** `client.browser`  |  **Import:** `import * as browser from 'hoody-sdk/browser'`

### `client.browser.cookies` (3) — Browser State

#### `clear` — Clear all cookies

```typescript
client.browser.cookies.clear(browser_id: string, start?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | Yes | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | query | No | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |

**Returns:** `any`  |  **HTTP:** `DELETE /cookies`
**CLI:** `hoody browser cookies clear`

---

#### `get` — Get cookies

```typescript
client.browser.cookies.get(browser_id: string, start?: boolean, url?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | Yes | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | query | No | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |
| `url` | `string` | query | No | Filter cookies by URL |

**Returns:** `any`  |  **HTTP:** `GET /cookies`
**CLI:** `hoody browser cookies get`

---

#### `set` — Set cookies

```typescript
client.browser.cookies.set(browser_id: string, start?: boolean, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | Yes | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | query | No | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |
| `data` | `object` | body | Yes |  |

**Body:** `{ cookies*: { name*: string, value*: string, url*: string, domain: string, path: string, httpOnly: bool, secure: bool }[] }`

**Returns:** `any`  |  **HTTP:** `POST /cookies`
**CLI:** `hoody browser cookies set`

---

### `client.browser.debugging` (2) — Debugging

#### `getConsoleLogs` — Get console logs

```typescript
client.browser.debugging.getConsoleLogs(browser_id: string, tabId?: integer, start?: boolean, type?: string, since?: string, clear?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | Yes | Unique identifier for the browser instance (0-based index) |
| `tabId` | `integer` | query | No | The ID of the tab to interact with |
| `start` | `boolean` | query | No | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |
| `type` | `string` | query | No | Filter by message type (log, error, warning, info, etc.) |
| `since` | `string` | query | No | Only return logs after this ISO timestamp |
| `clear` | `boolean` | query | No | Clear the buffer after reading |

**Returns:** `any`  |  **HTTP:** `GET /console`
**CLI:** `hoody browser console`

---

#### `getNetworkLogs` — Get network logs

```typescript
client.browser.debugging.getNetworkLogs(browser_id: string, tabId?: integer, start?: boolean, since?: string, clear?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | Yes | Unique identifier for the browser instance (0-based index) |
| `tabId` | `integer` | query | No | The ID of the tab to interact with |
| `start` | `boolean` | query | No | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |
| `since` | `string` | query | No | Only return logs after this ISO timestamp |
| `clear` | `boolean` | query | No | Clear the buffer after reading |

**Returns:** `any`  |  **HTTP:** `GET /network`
**CLI:** `hoody browser network`

---

### `client.browser.health` (4) — Server monitoring and health check operations

#### `check` — Health check

```typescript
client.browser.health.check()
```

**Returns:** `browser_HealthCheck`  |  **HTTP:** `GET /api/v1/browser/health`
**CLI:** `hoody browser health`

---

#### `getMetrics` — Server metrics

```typescript
client.browser.health.getMetrics()
```

**Returns:** `browser_Metrics`  |  **HTTP:** `GET /metrics`
**CLI:** `hoody browser metrics`

---

#### `getOpenApiJson` — Get OpenAPI specification (JSON)

```typescript
client.browser.health.getOpenApiJson()
```

**Returns:** `any`  |  **HTTP:** `GET /openapi.json`

---

#### `getOpenApiYaml` — Get OpenAPI specification (YAML)

```typescript
client.browser.health.getOpenApiYaml()
```

**Returns:** `any`  |  **HTTP:** `GET /openapi.yaml`

---

### `client.browser.history` (2) — Operations for querying and managing persistent browsing history

#### `clear` — Delete browsing history

```typescript
client.browser.history.clear(before?: string, browser_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `before` | `string` | query | No | Delete entries before this ISO 8601 timestamp |
| `browser_id` | `string` | query | No | Delete entries for specific browser ID only |

**Returns:** `any`  |  **HTTP:** `DELETE /history`
**CLI:** `hoody browser history delete`

---

#### `list` — Query browsing history

```typescript
client.browser.history.list(since?: string, domain?: string, browser_id?: string, limit?: integer, offset?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `since` | `string` | query | No | Return entries after this ISO 8601 timestamp |
| `domain` | `string` | query | No | Filter by domain (exact match) |
| `browser_id` | `string` | query | No | Filter by browser ID |
| `limit` | `integer` | query | No | Maximum entries to return (1-500) |
| `offset` | `integer` | query | No | Number of entries to skip for pagination |

**Returns:** `any`  |  **HTTP:** `GET /history`
**CLI:** `hoody browser history query`

---

### `client.browser.instances` (3) — Operations for creating and managing browser instances

#### `restart` — Restart browser instance

```typescript
client.browser.instances.restart(browser_id: string, chromiumVersion?: string, fingerprintId?: string, useRemoteDebuggingPort?: boolean, remoteDebuggingPort?: integer, remoteDebuggingAddress?: string, extensions?: string, extensionsDir?: string, extensionsStoreIds?: string, proxyServer?: string, proxyUsername?: string, proxyPassword?: string, proxyBypass?: string, enableQuic?: boolean, enableDnsOverHttps?: boolean, dnsOverHttpsUrl?: string, display?: string, showBrowser?: boolean, sessionName?: string, timezoneId?: string, locale?: string, userAgent?: string, viewport?: string, noViewport?: boolean, geolocation?: string, launchArguments?: array, browser?: string, firefoxVersion?: string, firefoxExecutablePath?: string, showDevtools?: boolean, userProfile?: object, stealth?: boolean, iframe?: boolean, iframe_url?: string, maximize_new_windows?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | Yes | Unique identifier for the browser instance (0-based index) |
| `chromiumVersion` | `string` | query | No | Chromium/Chrome version selection for the instance. This option applies only when `browser=chromium`.  Supported formats: - Full version: `136.0.7103.113` - Major version: `136` (mapped to a known stable patch for the current OS) - Channel tag: `stable`, `beta`, `dev`, `canary`  The server will **block** until the required browser is downloaded into `BROWSERS_DIR`. |
| `fingerprintId` | `string` | query | No | Base fingerprint profile id. The server will load `storage/config/fingerprints/<fingerprintId>.json` and use its `context` and `launch` defaults, then apply any request overrides. |
| `useRemoteDebuggingPort` | `boolean` | query | No | If `true`, the child process will launch Chromium with `--remote-debugging-port` and will populate `webSocketDebuggerUrl` in metadata responses. |
| `remoteDebuggingPort` | `integer` | query | No | Optional fixed DevTools port (only used when `useRemoteDebuggingPort=true`). If omitted, a free port is chosen. |
| `remoteDebuggingAddress` | `string` | query | No | Interface address for DevTools. Defaults to `127.0.0.1`. Use `0.0.0.0` only in trusted environments. |
| `extensions` | `string` | query | No | Comma-separated list (or JSON array string) of absolute extension directory paths to load. Extensions require `showBrowser=true` (headful mode) and will launch a persistent profile. |
| `extensionsDir` | `string` | query | No | Directory containing extension subfolders to load (each subfolder is treated as an extension). Extensions require `showBrowser=true` (headful mode) and will launch a persistent profile. |
| `extensionsStoreIds` | `string` | query | No | Chrome Web Store extension IDs to download and load (Chromium only). Requires `showBrowser=true` and works only with `browser=chromium`. |
| `proxyServer` | `string` | query | No | Proxy server URL (http, https, socks5, socks5h) |
| `proxyUsername` | `string` | query | No | Proxy username (if required) |
| `proxyPassword` | `string` | query | No | Proxy password (if required) |
| `proxyBypass` | `string` | query | No | Comma-separated list of hosts that should bypass the proxy |
| `enableQuic` | `boolean` | query | No | Enable QUIC/HTTP3 transport. Defaults to `false` (QUIC blocked). Use `enableQuic=true` to re-enable QUIC. |
| `enableDnsOverHttps` | `boolean` | query | No | Enable DNS-over-HTTPS for browser DNS resolution. Defaults to `true`. |
| `dnsOverHttpsUrl` | `string` | query | No | DoH resolver URL (HTTPS only). Defaults to Cloudflare: `https://cloudflare-dns.com/dns-query`. |
| `display` | `string` | query | No | X display number or identifier for headful mode. Required when `showBrowser=true` and no `DISPLAY` environment variable is set on the server. |
| `showBrowser` | `boolean` | query | No | Whether to run the browser headful (visible). Defaults to `true`. |
| `sessionName` | `string` | query | No | Custom session name for identifying this browser instance |
| `timezoneId` | `string` | query | No | IANA timezone identifier for browser geolocation |
| `locale` | `string` | query | No | BCP 47 language tag for browser locale |
| `userAgent` | `string` | query | No | User agent string to apply to the browser context. |
| `viewport` | `string` | query | No | Viewport configuration as JSON string. Example: {"width":1920,"height":1080,"deviceScaleFactor":1} Pass `null` to disable fixed-viewport emulation entirely — the page then follows the real browser window size (responsive; most useful in headful mode). |
| `noViewport` | `boolean` | query | No | Set to `true` to disable fixed-viewport emulation (alias for `viewport=null`). The page then resizes with the browser window instead of being pinned to an emulated resolution. Cannot be combined with a fixed `viewport` object. |
| `geolocation` | `string` | query | No | Geolocation configuration as JSON string. Example: {"latitude":40.7128,"longitude":-74.0060,"accuracy":100} |
| `launchArguments` | `array` | query | No | Additional browser launch arguments (repeatable or JSON array) |
| `browser` | `string` | query | No | Browser engine to use (`chromium` or `firefox`) |
| `firefoxVersion` | `string` | query | No | Firefox version label (informational only). Playwright-managed Firefox builds are used by default. If omitted, a Playwright Firefox build is downloaded on demand. |
| `firefoxExecutablePath` | `string` | query | No | Absolute path to a custom Firefox executable (overrides download) |
| `showDevtools` | `boolean` | query | No | Whether to open DevTools on launch (Chromium only) |
| `userProfile` | `object` | query | No | Optional user profile object (JSON string) for fingerprinting defaults |
| `stealth` | `boolean` | query | No | Launch Chromium in stealth mode using Patchright (anti-detection patches). Only applies to `browser=chromium`. Ignored for Firefox. Defaults to `true`. Bare `?stealth` is treated as `true`. |
| `iframe` | `boolean` | query | No | Enable or disable the full-page display iframe on the root URL. |
| `iframe_url` | `string` | query | No | Explicit URL for the display iframe. |
| `maximize_new_windows` | `boolean` | query | No | Control the `maximize_new_windows` flag stamped onto the generated display URL (always explicit `true`/`false`); when true the hoody-display client opens new top-level app windows maximized. Enabled by default; set to `false` to opt out. |

**Returns:** `any`  |  **HTTP:** `GET /restart`
**CLI:** `hoody browser restart`

---

#### `start` — Create or retrieve browser instance

```typescript
client.browser.instances.start(browser_id: string, chromiumVersion?: string, fingerprintId?: string, useRemoteDebuggingPort?: boolean, remoteDebuggingPort?: integer, remoteDebuggingAddress?: string, extensions?: string, extensionsDir?: string, extensionsStoreIds?: string, proxyServer?: string, proxyUsername?: string, proxyPassword?: string, proxyBypass?: string, enableQuic?: boolean, enableDnsOverHttps?: boolean, dnsOverHttpsUrl?: string, display?: string, showBrowser?: boolean, sessionName?: string, timezoneId?: string, locale?: string, userAgent?: string, viewport?: string, noViewport?: boolean, geolocation?: string, stealth?: boolean, iframe?: boolean, iframe_url?: string, maximize_new_windows?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | Yes | Unique identifier for the browser instance (0-based index) |
| `chromiumVersion` | `string` | query | No | Chromium/Chrome version selection for the instance. This option applies only when `browser=chromium`.  Supported formats: - Full version: `136.0.7103.113` - Major version: `136` (mapped to a known stable patch for the current OS) - Channel tag: `stable`, `beta`, `dev`, `canary`  The server will **block** until the required browser is downloaded into `BROWSERS_DIR`. |
| `fingerprintId` | `string` | query | No | Base fingerprint profile id. The server will load `storage/config/fingerprints/<fingerprintId>.json` and use its `context` and `launch` defaults, then apply any request overrides. |
| `useRemoteDebuggingPort` | `boolean` | query | No | If `true`, the child process will launch Chromium with `--remote-debugging-port` and will populate `webSocketDebuggerUrl` in metadata responses. |
| `remoteDebuggingPort` | `integer` | query | No | Optional fixed DevTools port (only used when `useRemoteDebuggingPort=true`). If omitted, a free port is chosen. |
| `remoteDebuggingAddress` | `string` | query | No | Interface address for DevTools. Defaults to `127.0.0.1`. Use `0.0.0.0` only in trusted environments. |
| `extensions` | `string` | query | No | Comma-separated list (or JSON array string) of absolute extension directory paths to load. Extensions require `showBrowser=true` (headful mode) and will launch a persistent profile. |
| `extensionsDir` | `string` | query | No | Directory containing extension subfolders to load (each subfolder is treated as an extension). Extensions require `showBrowser=true` (headful mode) and will launch a persistent profile. |
| `extensionsStoreIds` | `string` | query | No | Comma-separated list (or JSON array string) of Chrome Web Store extension IDs to download and load. Requires `showBrowser=true` and works only with `browser=chromium`. |
| `proxyServer` | `string` | query | No | Proxy server for browser traffic. Supports `http://`, `https://`, `socks5://`, or `socks5h://`. Example: `socks5://127.0.0.1:9050` |
| `proxyUsername` | `string` | query | No | Proxy username (if required) |
| `proxyPassword` | `string` | query | No | Proxy password (if required) |
| `proxyBypass` | `string` | query | No | Comma-separated list of hosts that should bypass the proxy |
| `enableQuic` | `boolean` | query | No | Enable QUIC/HTTP3 transport. Defaults to `false` (QUIC blocked). Use `enableQuic=true` to re-enable QUIC. |
| `enableDnsOverHttps` | `boolean` | query | No | Enable DNS-over-HTTPS for browser DNS resolution. Defaults to `true`. |
| `dnsOverHttpsUrl` | `string` | query | No | DoH resolver URL (HTTPS only). Defaults to Cloudflare: `https://cloudflare-dns.com/dns-query`. |
| `display` | `string` | query | No | X display number or identifier for headful mode. Required when `showBrowser=true` and no `DISPLAY` environment variable is set on the server. |
| `showBrowser` | `boolean` | query | No | Whether to run the browser headful (visible). Defaults to `true`. |
| `sessionName` | `string` | query | No | Custom session name for identifying this browser instance |
| `timezoneId` | `string` | query | No | IANA timezone identifier for browser geolocation |
| `locale` | `string` | query | No | BCP 47 language tag for browser locale |
| `userAgent` | `string` | query | No | User agent string to apply to the browser context. |
| `viewport` | `string` | query | No | Viewport configuration as JSON string. Example: {"width":1920,"height":1080,"deviceScaleFactor":1} Pass `null` to disable fixed-viewport emulation entirely — the page then follows the real browser window size (responsive; most useful in headful mode). |
| `noViewport` | `boolean` | query | No | Set to `true` to disable fixed-viewport emulation (alias for `viewport=null`). The page then resizes with the browser window instead of being pinned to an emulated resolution. Cannot be combined with a fixed `viewport` object. |
| `geolocation` | `string` | query | No | Geolocation configuration as JSON string. Example: {"latitude":40.7128,"longitude":-74.0060,"accuracy":100} |
| `stealth` | `boolean` | query | No | Launch Chromium in stealth mode using Patchright (anti-detection patches). Only applies to `browser=chromium`. Ignored for Firefox. Defaults to `true`. Bare `?stealth` is treated as `true`. |
| `iframe` | `boolean` | query | No | Enable or disable the full-page display iframe on the root URL. When enabled (default), navigating to `/` serves an HTML page with an iframe pointing to the Hoody display URL. |
| `iframe_url` | `string` | query | No | Explicit URL for the display iframe. If not provided, the URL is auto-detected from the Host header subdomain pattern. |
| `maximize_new_windows` | `boolean` | query | No | Control the `maximize_new_windows` flag stamped onto generated display URLs (iframe pages, status pages, `iframe_url` metadata). The flag is always explicit (`true` or `false`); when true the hoody-display client opens new top-level app windows maximized. Enabled by default; set to `false` to keep the display client's centered default-size placement (the explicit `false` also overrides a display-side `default-settings.txt` enable). Explicit `iframe_url` values are never modified. |

**Returns:** `browser_BrowserMetadata`  |  **HTTP:** `GET /start`
**CLI:** `hoody browser start`

---

#### `stop` — Stop browser instance

```typescript
client.browser.instances.stop(browser_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | Yes | Unique identifier for the browser instance (0-based index) |

**Returns:** `any`  |  **HTTP:** `GET /stop`
**CLI:** `hoody browser stop`

---

### `client.browser.interaction` (5) — Operations for interacting with browser tabs and content

#### `browse` — Navigate to URL

```typescript
client.browser.interaction.browse(browser_id: string, start?: boolean, url?: string, tabId?: integer, active?: boolean, onlyIfNotExists?: boolean, ignoreGetParameters?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | Yes | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | query | No | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |
| `url` | `string` | query | No | The URL to navigate to |
| `tabId` | `integer` | query | No | The ID of the tab to interact with |
| `active` | `boolean` | query | No | Make the tab active (focused) after navigation |
| `onlyIfNotExists` | `boolean` | query | No | Only create a new tab if no tab with the same URL exists |
| `ignoreGetParameters` | `boolean` | query | No | Ignore query parameters when checking for existing URL |

**Returns:** `browser_BrowseResult`  |  **HTTP:** `GET /browse`
**CLI:** `hoody browser navigate`

---

#### `browsePost` — Navigate to URL (POST)

```typescript
client.browser.interaction.browsePost(browser_id: string, start?: boolean, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | Yes | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | query | No | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |
| `data` | `object` | body | Yes |  |

**Body:** `{ url*: string, tabId: int, active: bool=true, onlyIfNotExists: bool=false, ignoreGetParameters: bool=false }`

**Returns:** `browser_BrowseResult`  |  **HTTP:** `POST /browse`
**CLI:** `hoody browser navigate-post`

---

#### `evalGet` — Execute JavaScript

```typescript
client.browser.interaction.evalGet(browser_id: string, start?: boolean, script: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | Yes | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | query | No | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |
| `script` | `string` | query | Yes | JavaScript code to execute (can be base64 encoded) |

**Returns:** `any`  |  **HTTP:** `GET /eval`
**CLI:** `hoody browser eval`

---

#### `evalPost` — Execute JavaScript (POST)

```typescript
client.browser.interaction.evalPost(browser_id: string, start?: boolean, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | Yes | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | query | No | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |
| `data` | `object` | body | Yes |  |

**Body:** `{ script: string }`

**Returns:** `any`  |  **HTTP:** `POST /eval`
**CLI:** `hoody browser eval-post`

---

#### `takeScreenshot` — Capture browser screenshot

```typescript
client.browser.interaction.takeScreenshot(browser_id: string, start?: boolean, url?: string, tabId?: integer, onlyIfNotExists?: boolean, ignoreGetParameters?: boolean, format?: string, quality?: integer, fullPage?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | Yes | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | query | No | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |
| `url` | `string` | query | No | The URL to navigate to |
| `tabId` | `integer` | query | No | The ID of the tab to interact with |
| `onlyIfNotExists` | `boolean` | query | No | Only create a new tab if no tab with the same URL exists |
| `ignoreGetParameters` | `boolean` | query | No | Ignore query strings when checking for existing URL |
| `format` | `string` | query | No | Output format |
| `quality` | `integer` | query | No | Image quality for JPEG format (0-100) |
| `fullPage` | `boolean` | query | No | Capture the entire scrollable page |

**Returns:** `any`  |  **HTTP:** `GET /screenshot`
**CLI:** `hoody browser screenshot`

---

### `client.browser.introspection` (7) — Operations for inspecting and controlling browser instances

#### `closeTab` — Close a browser tab

```typescript
client.browser.introspection.closeTab(browser_id: string, start?: boolean, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | Yes | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | query | No | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |
| `data` | `object` | body | No |  |

**Body:** `{ tabId: int }`

**Returns:** `any`  |  **HTTP:** `POST /tab/close`
**CLI:** `hoody browser tabs close`

---

#### `getDevtoolsUrl` — Get DevTools URLs

```typescript
client.browser.introspection.getDevtoolsUrl(browser_id: string, start?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | Yes | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | query | No | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |

**Returns:** `any`  |  **HTTP:** `GET /devtools-url`
**CLI:** `hoody browser devtools`

---

#### `getMetadata` — Get instance metadata

```typescript
client.browser.introspection.getMetadata(browser_id: string, start?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | Yes | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | query | No | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |

**Returns:** `browser_BrowserMetadata`  |  **HTTP:** `GET /metadata`
**CLI:** `hoody browser info`

---

#### `getViewport` — Get the current viewport policy

```typescript
client.browser.introspection.getViewport(browser_host?: string, browser_port?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_host` | `string` | query | No | Instance host. Optional — must be paired with browser_port; when both are omitted the single running instance is selected (400 AMBIGUOUS_INSTANCE with more than one). |
| `browser_port` | `integer` | query | No | Instance port. Optional — must be paired with browser_host. |

**Returns:** `browser_ViewportStatus`  |  **HTTP:** `GET /viewport`

---

#### `listTabs` — List browser tabs

```typescript
client.browser.introspection.listTabs(browser_id: string, start?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | Yes | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | query | No | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |

**Returns:** `any`  |  **HTTP:** `GET /tabs`
**CLI:** `hoody browser tabs list`

---

#### `setViewport` — Change the viewport at runtime

```typescript
client.browser.introspection.setViewport(browser_host?: string, browser_port?: integer, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_host` | `string` | query | No | Instance host. Optional — must be paired with browser_port; when both are omitted the single running instance is selected (400 AMBIGUOUS_INSTANCE with more than one). |
| `browser_port` | `integer` | query | No | Instance port. Optional — must be paired with browser_host. |
| `data` | `object` | body | Yes |  |

**Body:** `{ viewport*: { width*: int, height*: int }|null }`

**Returns:** `browser_ViewportStatus`  |  **HTTP:** `POST /viewport`

---

#### `shutdown` — Shutdown browser instance

```typescript
client.browser.introspection.shutdown(browser_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | Yes | Unique identifier for the browser instance (0-based index) |

**Returns:** `any`  |  **HTTP:** `GET /shutdown`
**CLI:** `hoody browser shutdown`

---

### `client.browser.page` (3) — Page Content

#### `exportPdf` — Export page as PDF

```typescript
client.browser.page.exportPdf(browser_id: string, tabId?: integer, start?: boolean, url?: string, format?: string, landscape?: boolean, printBackground?: boolean, margin?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | Yes | Unique identifier for the browser instance (0-based index) |
| `tabId` | `integer` | query | No | The ID of the tab to interact with |
| `start` | `boolean` | query | No | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |
| `url` | `string` | query | No | Optional URL to navigate to before generating the PDF |
| `format` | `string` | query | No | Paper format (e.g. A4, Letter) |
| `landscape` | `boolean` | query | No | Use landscape orientation |
| `printBackground` | `boolean` | query | No | Include background graphics |
| `margin` | `string` | query | No | Uniform margin (e.g. '1cm', '0.5in') |

**Returns:** `any`  |  **HTTP:** `GET /pdf`
**CLI:** `hoody browser pdf`

---

#### `getHtml` — Get page HTML

```typescript
client.browser.page.getHtml(browser_id: string, tabId?: integer, start?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | Yes | Unique identifier for the browser instance (0-based index) |
| `tabId` | `integer` | query | No | The ID of the tab to interact with |
| `start` | `boolean` | query | No | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |

**Returns:** `any`  |  **HTTP:** `GET /html`
**CLI:** `hoody browser html`

---

#### `getText` — Get page text

```typescript
client.browser.page.getText(browser_id: string, tabId?: integer, start?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `browser_id` | `string` | query | Yes | Unique identifier for the browser instance (0-based index) |
| `tabId` | `integer` | query | No | The ID of the tab to interact with |
| `start` | `boolean` | query | No | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |

**Returns:** `any`  |  **HTTP:** `GET /text`
**CLI:** `hoody browser text`

