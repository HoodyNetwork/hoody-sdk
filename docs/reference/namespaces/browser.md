# `browser` — 29 methods

**Version:** 1.0.0-beta.5
**Accessor:** `client.browser`

```typescript
import * as browser from 'hoody-sdk/browser';
```

---

## `client.browser.cookies` (3 methods)

### `clear`

**DELETE** `/cookies`

Clear all cookies

```typescript
client.browser.cookies.clear(options?: { browser_id: string; start?: boolean }): Promise<BrowserCookiesClearResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | Yes | query | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |

**Returns:** `BrowserCookiesClearResponse`

**CLI:** `hoody browser cookies clear`

---

### `get`

**GET** `/cookies`

Get cookies

```typescript
client.browser.cookies.get(options?: { browser_id: string; start?: boolean; url?: string }): Promise<BrowserCookiesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | Yes | query | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |
| `url` | `string` | No | query | Filter cookies by URL |

**Returns:** `BrowserCookiesGetResponse`

**CLI:** `hoody browser cookies get`

---

### `set`

**POST** `/cookies`

Set cookies

```typescript
client.browser.cookies.set(data: BrowserCookiesSetRequest, options?: { browser_id: string; start?: boolean }): Promise<BrowserCookiesSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `BrowserCookiesSetRequest` | Yes | body |  |
| `browser_id` | `string` | Yes | query | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |

**Returns:** `BrowserCookiesSetResponse`

**CLI:** `hoody browser cookies set`

---

## `client.browser.debugging` (2 methods)

### `getConsoleLogs`

**GET** `/console`

Get console logs

```typescript
client.browser.debugging.getConsoleLogs(options?: { browser_id: string; tabId?: number; start?: boolean; type?: string; since?: string; clear?: boolean }): Promise<BrowserDebuggingGetConsoleLogsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | Yes | query | Unique identifier for the browser instance (0-based index) |
| `tabId` | `number` | No | query | The ID of the tab to interact with |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |
| `type` | `string` | No | query | Filter by message type (log, error, warning, info, etc.) |
| `since` | `string` | No | query | Only return logs after this ISO timestamp |
| `clear` | `boolean` | No | query | Clear the buffer after reading |

**Returns:** `BrowserDebuggingGetConsoleLogsResponse`

**CLI:** `hoody browser console`

---

### `getNetworkLogs`

**GET** `/network`

Get network logs

```typescript
client.browser.debugging.getNetworkLogs(options?: { browser_id: string; tabId?: number; start?: boolean; since?: string; clear?: boolean }): Promise<BrowserDebuggingGetNetworkLogsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | Yes | query | Unique identifier for the browser instance (0-based index) |
| `tabId` | `number` | No | query | The ID of the tab to interact with |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |
| `since` | `string` | No | query | Only return logs after this ISO timestamp |
| `clear` | `boolean` | No | query | Clear the buffer after reading |

**Returns:** `BrowserDebuggingGetNetworkLogsResponse`

**CLI:** `hoody browser network`

---

## `client.browser.health` (4 methods)

### `check`

**GET** `/api/v1/browser/health`

Health check

```typescript
client.browser.health.check(): Promise<BrowserHealthCheckResponse>
```

**Returns:** `BrowserHealthCheckResponse`

**CLI:** `hoody browser health`

---

### `getMetrics`

**GET** `/metrics`

Server metrics

```typescript
client.browser.health.getMetrics(): Promise<BrowserHealthGetMetricsResponse>
```

**Returns:** `BrowserHealthGetMetricsResponse`

**CLI:** `hoody browser metrics`

---

### `getOpenApiJson`

**GET** `/openapi.json`

Get OpenAPI specification (JSON)

```typescript
client.browser.health.getOpenApiJson(): Promise<BrowserHealthGetOpenApiJsonResponse>
```

**Returns:** `BrowserHealthGetOpenApiJsonResponse`

---

### `getOpenApiYaml`

**GET** `/openapi.yaml`

Get OpenAPI specification (YAML)

```typescript
client.browser.health.getOpenApiYaml(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

---

## `client.browser.history` (2 methods)

### `clear`

**DELETE** `/history`

Delete browsing history

```typescript
client.browser.history.clear(options?: { before?: string; browser_id?: string }): Promise<BrowserHistoryClearResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `before` | `string` | No | query | Delete entries before this ISO 8601 timestamp |
| `browser_id` | `string` | No | query | Delete entries for specific browser ID only |

**Returns:** `BrowserHistoryClearResponse`

**CLI:** `hoody browser history delete`

---

### `list`

**GET** `/history`

Query browsing history

```typescript
client.browser.history.list(options?: { since?: string; domain?: string; browser_id?: string; limit?: number; offset?: number }): Promise<BrowserHistoryListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `since` | `string` | No | query | Return entries after this ISO 8601 timestamp |
| `domain` | `string` | No | query | Filter by domain (exact match) |
| `browser_id` | `string` | No | query | Filter by browser ID |
| `limit` | `number` | No | query | Maximum entries to return (1-500) |
| `offset` | `number` | No | query | Number of entries to skip for pagination |

**Returns:** `BrowserHistoryListResponse`

**CLI:** `hoody browser history query`

---

## `client.browser.instances` (3 methods)

### `restart`

**GET** `/restart`

Restart browser instance

```typescript
client.browser.instances.restart(options?: { browser_id: string; chromiumVersion?: string; fingerprintId?: string; useRemoteDebuggingPort?: boolean; remoteDebuggingPort?: number; remoteDebuggingAddress?: string; extensions?: string; extensionsDir?: string; extensionsStoreIds?: string; proxyServer?: string; proxyUsername?: string; proxyPassword?: string; proxyBypass?: string; enableQuic?: boolean; enableDnsOverHttps?: boolean; dnsOverHttpsUrl?: string; display?: number | string; showBrowser?: boolean; sessionName?: string; timezoneId?: string; locale?: string; userAgent?: string; viewport?: Viewport; noViewport?: boolean; geolocation?: Geolocation; launchArguments?: string[]; browser?: "chromium" | "firefox"; firefoxVersion?: string; firefoxExecutablePath?: string; showDevtools?: boolean; userProfile?: Record<string, unknown>; stealth?: boolean; iframe?: boolean; iframe_url?: string; maximize_new_windows?: boolean }): Promise<BrowserInstancesRestartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | Yes | query | Unique identifier for the browser instance (0-based index) |
| `chromiumVersion` | `string` | No | query | Chromium/Chrome version selection for the instance. This option applies only when `browser=chromium`. Supported formats: - Full version: `136.0.7103.113` - Major version: `136` (mapped to a known stable patch for the current OS) - Channel tag: `stable`, `beta`, `dev`, `canary` The server will **block** until the required browser is downloaded into `BROWSERS_DIR`. |
| `fingerprintId` | `string` | No | query | Base fingerprint profile id. The server will load `storage/config/fingerprints/&lt;fingerprintId&gt;.json` and use its `context` and `launch` defaults, then apply any request overrides. |
| `useRemoteDebuggingPort` | `boolean` | No | query | If `true`, the child process will launch Chromium with `--remote-debugging-port` and will populate `webSocketDebuggerUrl` in metadata responses. |
| `remoteDebuggingPort` | `number` | No | query | Optional fixed DevTools port (only used when `useRemoteDebuggingPort=true`). If omitted, a free port is chosen. |
| `remoteDebuggingAddress` | `string` | No | query | Interface address for DevTools. Defaults to `127.0.0.1`. Use `0.0.0.0` only in trusted environments. |
| `extensions` | `string` | No | query | Comma-separated list (or JSON array string) of absolute extension directory paths to load. Extensions require `showBrowser=true` (headful mode) and will launch a persistent profile. |
| `extensionsDir` | `string` | No | query | Directory containing extension subfolders to load (each subfolder is treated as an extension). Extensions require `showBrowser=true` (headful mode) and will launch a persistent profile. |
| `extensionsStoreIds` | `string` | No | query | Chrome Web Store extension IDs to download and load (Chromium only). Requires `showBrowser=true` and works only with `browser=chromium`. |
| `proxyServer` | `string` | No | query | Proxy server URL (http, https, socks5, socks5h) |
| `proxyUsername` | `string` | No | query | Proxy username (if required) |
| `proxyPassword` | `string` | No | query | Proxy password (if required) |
| `proxyBypass` | `string` | No | query | Comma-separated list of hosts that should bypass the proxy |
| `enableQuic` | `boolean` | No | query | Enable QUIC/HTTP3 transport. Defaults to `false` (QUIC blocked). Use `enableQuic=true` to re-enable QUIC. |
| `enableDnsOverHttps` | `boolean` | No | query | Enable DNS-over-HTTPS for browser DNS resolution. Defaults to `true`. |
| `dnsOverHttpsUrl` | `string` | No | query | DoH resolver URL (HTTPS only). Defaults to Cloudflare: `https://cloudflare-dns.com/dns-query`. |
| `display` | `number \| string` | No | query | X display number or identifier for headful mode. Required when `showBrowser=true` and no `DISPLAY` environment variable is set on the server. |
| `showBrowser` | `boolean` | No | query | Whether to run the browser headful (visible). Defaults to `true`. |
| `sessionName` | `string` | No | query | Custom session name for identifying this browser instance |
| `timezoneId` | `string` | No | query | IANA timezone identifier for browser geolocation |
| `locale` | `string` | No | query | BCP 47 language tag for browser locale |
| `userAgent` | `string` | No | query | User agent string to apply to the browser context. |
| `viewport` | `Viewport` | No | query | Viewport configuration as JSON string. Example: {"width":1920,"height":1080,"deviceScaleFactor":1} Pass `null` to disable fixed-viewport emulation entirely — the page then follows the real browser window size (responsive; most useful in headful mode). |
| `noViewport` | `boolean` | No | query | Set to `true` to disable fixed-viewport emulation (alias for `viewport=null`). The page then resizes with the browser window instead of being pinned to an emulated resolution. Cannot be combined with a fixed `viewport` object. |
| `geolocation` | `Geolocation` | No | query | Geolocation configuration as JSON string. Example: {"latitude":40.7128,"longitude":-74.0060,"accuracy":100} |
| `launchArguments` | `string[]` | No | query | Additional browser launch arguments (repeatable or JSON array) |
| `browser` | `"chromium" \| "firefox"` | No | query | Browser engine to use (`chromium` or `firefox`) |
| `firefoxVersion` | `string` | No | query | Firefox version label (informational only). Playwright-managed Firefox builds are used by default. If omitted, a Playwright Firefox build is downloaded on demand. |
| `firefoxExecutablePath` | `string` | No | query | Absolute path to a custom Firefox executable (overrides download) |
| `showDevtools` | `boolean` | No | query | Whether to open DevTools on launch (Chromium only) |
| `userProfile` | `Record&lt;string, unknown&gt;` | No | query | Optional user profile object (JSON string) for fingerprinting defaults |
| `stealth` | `boolean` | No | query | Launch Chromium in stealth mode using Patchright (anti-detection patches). Only applies to `browser=chromium`. Ignored for Firefox. Defaults to `true`. Bare `?stealth` is treated as `true`. |
| `iframe` | `boolean` | No | query | Enable or disable the full-page display iframe on the root URL. |
| `iframe_url` | `string` | No | query | Explicit URL for the display iframe. |
| `maximize_new_windows` | `boolean` | No | query | Control the `maximize_new_windows` flag stamped onto the generated display URL (always explicit `true`/`false`); when true the hoody-display client opens new top-level app windows maximized. Enabled by default; set to `false` to opt out. |

**Returns:** `BrowserInstancesRestartResponse`

**CLI:** `hoody browser restart`

---

### `start`

**GET** `/start`

Create or retrieve browser instance

```typescript
client.browser.instances.start(options?: { browser_id: string; chromiumVersion?: string; fingerprintId?: string; useRemoteDebuggingPort?: boolean; remoteDebuggingPort?: number; remoteDebuggingAddress?: string; extensions?: string; extensionsDir?: string; extensionsStoreIds?: string; proxyServer?: string; proxyUsername?: string; proxyPassword?: string; proxyBypass?: string; enableQuic?: boolean; enableDnsOverHttps?: boolean; dnsOverHttpsUrl?: string; display?: number | string; showBrowser?: boolean; sessionName?: string; timezoneId?: string; locale?: string; userAgent?: string; viewport?: string; noViewport?: boolean; geolocation?: string; stealth?: boolean; iframe?: boolean; iframe_url?: string; maximize_new_windows?: boolean }): Promise<BrowserInstancesStartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | Yes | query | Unique identifier for the browser instance (0-based index) |
| `chromiumVersion` | `string` | No | query | Chromium/Chrome version selection for the instance. This option applies only when `browser=chromium`. Supported formats: - Full version: `136.0.7103.113` - Major version: `136` (mapped to a known stable patch for the current OS) - Channel tag: `stable`, `beta`, `dev`, `canary` The server will **block** until the required browser is downloaded into `BROWSERS_DIR`. |
| `fingerprintId` | `string` | No | query | Base fingerprint profile id. The server will load `storage/config/fingerprints/&lt;fingerprintId&gt;.json` and use its `context` and `launch` defaults, then apply any request overrides. |
| `useRemoteDebuggingPort` | `boolean` | No | query | If `true`, the child process will launch Chromium with `--remote-debugging-port` and will populate `webSocketDebuggerUrl` in metadata responses. |
| `remoteDebuggingPort` | `number` | No | query | Optional fixed DevTools port (only used when `useRemoteDebuggingPort=true`). If omitted, a free port is chosen. |
| `remoteDebuggingAddress` | `string` | No | query | Interface address for DevTools. Defaults to `127.0.0.1`. Use `0.0.0.0` only in trusted environments. |
| `extensions` | `string` | No | query | Comma-separated list (or JSON array string) of absolute extension directory paths to load. Extensions require `showBrowser=true` (headful mode) and will launch a persistent profile. |
| `extensionsDir` | `string` | No | query | Directory containing extension subfolders to load (each subfolder is treated as an extension). Extensions require `showBrowser=true` (headful mode) and will launch a persistent profile. |
| `extensionsStoreIds` | `string` | No | query | Comma-separated list (or JSON array string) of Chrome Web Store extension IDs to download and load. Requires `showBrowser=true` and works only with `browser=chromium`. |
| `proxyServer` | `string` | No | query | Proxy server for browser traffic. Supports `http://`, `https://`, `socks5://`, or `socks5h://`. Example: `socks5://127.0.0.1:9050` |
| `proxyUsername` | `string` | No | query | Proxy username (if required) |
| `proxyPassword` | `string` | No | query | Proxy password (if required) |
| `proxyBypass` | `string` | No | query | Comma-separated list of hosts that should bypass the proxy |
| `enableQuic` | `boolean` | No | query | Enable QUIC/HTTP3 transport. Defaults to `false` (QUIC blocked). Use `enableQuic=true` to re-enable QUIC. |
| `enableDnsOverHttps` | `boolean` | No | query | Enable DNS-over-HTTPS for browser DNS resolution. Defaults to `true`. |
| `dnsOverHttpsUrl` | `string` | No | query | DoH resolver URL (HTTPS only). Defaults to Cloudflare: `https://cloudflare-dns.com/dns-query`. |
| `display` | `number \| string` | No | query | X display number or identifier for headful mode. Required when `showBrowser=true` and no `DISPLAY` environment variable is set on the server. |
| `showBrowser` | `boolean` | No | query | Whether to run the browser headful (visible). Defaults to `true`. |
| `sessionName` | `string` | No | query | Custom session name for identifying this browser instance |
| `timezoneId` | `string` | No | query | IANA timezone identifier for browser geolocation |
| `locale` | `string` | No | query | BCP 47 language tag for browser locale |
| `userAgent` | `string` | No | query | User agent string to apply to the browser context. |
| `viewport` | `string` | No | query | Viewport configuration as JSON string. Example: {"width":1920,"height":1080,"deviceScaleFactor":1} Pass `null` to disable fixed-viewport emulation entirely — the page then follows the real browser window size (responsive; most useful in headful mode). |
| `noViewport` | `boolean` | No | query | Set to `true` to disable fixed-viewport emulation (alias for `viewport=null`). The page then resizes with the browser window instead of being pinned to an emulated resolution. Cannot be combined with a fixed `viewport` object. |
| `geolocation` | `string` | No | query | Geolocation configuration as JSON string. Example: {"latitude":40.7128,"longitude":-74.0060,"accuracy":100} |
| `stealth` | `boolean` | No | query | Launch Chromium in stealth mode using Patchright (anti-detection patches). Only applies to `browser=chromium`. Ignored for Firefox. Defaults to `true`. Bare `?stealth` is treated as `true`. |
| `iframe` | `boolean` | No | query | Enable or disable the full-page display iframe on the root URL. When enabled (default), navigating to `/` serves an HTML page with an iframe pointing to the Hoody display URL. |
| `iframe_url` | `string` | No | query | Explicit URL for the display iframe. If not provided, the URL is auto-detected from the Host header subdomain pattern. |
| `maximize_new_windows` | `boolean` | No | query | Control the `maximize_new_windows` flag stamped onto generated display URLs (iframe pages, status pages, `iframe_url` metadata). The flag is always explicit (`true` or `false`); when true the hoody-display client opens new top-level app windows maximized. Enabled by default; set to `false` to keep the display client's centered default-size placement (the explicit `false` also overrides a display-side `default-settings.txt` enable). Explicit `iframe_url` values are never modified. |

**Returns:** `BrowserInstancesStartResponse`

**CLI:** `hoody browser start`

---

### `stop`

**GET** `/stop`

Stop browser instance

```typescript
client.browser.instances.stop(options?: { browser_id: string }): Promise<BrowserInstancesStopResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | Yes | query | Unique identifier for the browser instance (0-based index) |

**Returns:** `BrowserInstancesStopResponse`

**CLI:** `hoody browser stop`

---

## `client.browser.interaction` (5 methods)

### `browse`

**GET** `/browse`

Navigate to URL

```typescript
client.browser.interaction.browse(options?: { browser_id: string; start?: boolean; url?: string; tabId?: number; active?: boolean; onlyIfNotExists?: boolean; ignoreGetParameters?: boolean }): Promise<BrowserInteractionBrowseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | Yes | query | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |
| `url` | `string` | No | query | The URL to navigate to |
| `tabId` | `number` | No | query | The ID of the tab to interact with |
| `active` | `boolean` | No | query | Make the tab active (focused) after navigation |
| `onlyIfNotExists` | `boolean` | No | query | Only create a new tab if no tab with the same URL exists |
| `ignoreGetParameters` | `boolean` | No | query | Ignore query parameters when checking for existing URL |

**Returns:** `BrowserInteractionBrowseResponse`

**CLI:** `hoody browser navigate`

---

### `browsePost`

**POST** `/browse`

Navigate to URL (POST)

```typescript
client.browser.interaction.browsePost(data: BrowsePostRequest, options?: { browser_id: string; start?: boolean }): Promise<BrowsePostResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `BrowsePostRequest` | Yes | body |  |
| `browser_id` | `string` | Yes | query | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |

**Returns:** `BrowsePostResponse`

**CLI:** `hoody browser navigate-post`

---

### `evalGet`

**GET** `/eval`

Execute JavaScript

```typescript
client.browser.interaction.evalGet(options?: { script: string; browser_id: string; start?: boolean }): Promise<EvalGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `script` | `string` | Yes | query | JavaScript code to execute (can be base64 encoded) |
| `browser_id` | `string` | Yes | query | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |

**Returns:** `EvalGetResponse`

**CLI:** `hoody browser eval`

---

### `evalPost`

**POST** `/eval`

Execute JavaScript (POST)

```typescript
client.browser.interaction.evalPost(data: EvalPostRequest, options?: { browser_id: string; start?: boolean }): Promise<EvalPostResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `EvalPostRequest` | Yes | body |  |
| `browser_id` | `string` | Yes | query | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |

**Returns:** `EvalPostResponse`

**CLI:** `hoody browser eval-post`

---

### `takeScreenshot`

**GET** `/screenshot`

Capture browser screenshot

```typescript
client.browser.interaction.takeScreenshot(options?: { browser_id: string; start?: boolean; url?: string; tabId?: number; onlyIfNotExists?: boolean; ignoreGetParameters?: boolean; format?: "png" | "jpeg" | "base64"; quality?: number; fullPage?: boolean }): Promise<BrowserInteractionTakeScreenshotResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | Yes | query | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |
| `url` | `string` | No | query | The URL to navigate to |
| `tabId` | `number` | No | query | The ID of the tab to interact with |
| `onlyIfNotExists` | `boolean` | No | query | Only create a new tab if no tab with the same URL exists |
| `ignoreGetParameters` | `boolean` | No | query | Ignore query strings when checking for existing URL |
| `format` | `"png" \| "jpeg" \| "base64"` | No | query | Output format |
| `quality` | `number` | No | query | Image quality for JPEG format (0-100) |
| `fullPage` | `boolean` | No | query | Capture the entire scrollable page |

**Returns:** `BrowserInteractionTakeScreenshotResponse`

**CLI:** `hoody browser screenshot`

---

## `client.browser.introspection` (7 methods)

### `closeTab`

**POST** `/tab/close`

Close a browser tab

```typescript
client.browser.introspection.closeTab(data?: BrowserIntrospectionCloseTabRequest, options?: { browser_id: string; start?: boolean }): Promise<BrowserIntrospectionCloseTabResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `BrowserIntrospectionCloseTabRequest` | No | body |  |
| `browser_id` | `string` | Yes | query | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |

**Returns:** `BrowserIntrospectionCloseTabResponse`

**CLI:** `hoody browser tabs close`

---

### `getDevtoolsUrl`

**GET** `/devtools-url`

Get DevTools URLs

```typescript
client.browser.introspection.getDevtoolsUrl(options?: { browser_id: string; start?: boolean }): Promise<BrowserIntrospectionGetDevtoolsUrlResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | Yes | query | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |

**Returns:** `BrowserIntrospectionGetDevtoolsUrlResponse`

**CLI:** `hoody browser devtools`

---

### `getMetadata`

**GET** `/metadata`

Get instance metadata

```typescript
client.browser.introspection.getMetadata(options?: { browser_id: string; start?: boolean }): Promise<BrowserIntrospectionGetMetadataResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | Yes | query | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |

**Returns:** `BrowserIntrospectionGetMetadataResponse`

**CLI:** `hoody browser info`

---

### `getViewport`

**GET** `/viewport`

Get the current viewport policy

```typescript
client.browser.introspection.getViewport(options?: { browser_host?: string; browser_port?: number }): Promise<GetViewportResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_host` | `string` | No | query | Instance host. Optional — must be paired with browser_port; when both are omitted the single running instance is selected (400 AMBIGUOUS_INSTANCE with more than one). |
| `browser_port` | `number` | No | query | Instance port. Optional — must be paired with browser_host. |

**Returns:** `GetViewportResponse`

---

### `listTabs`

**GET** `/tabs`

List browser tabs

```typescript
client.browser.introspection.listTabs(options?: { browser_id: string; start?: boolean }): Promise<BrowserIntrospectionListTabsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | Yes | query | Unique identifier for the browser instance (0-based index) |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |

**Returns:** `BrowserIntrospectionListTabsResponse`

**CLI:** `hoody browser tabs list`

---

### `setViewport`

**POST** `/viewport`

Change the viewport at runtime

```typescript
client.browser.introspection.setViewport(data: SetViewportRequest, options?: { browser_host?: string; browser_port?: number }): Promise<SetViewportResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `SetViewportRequest` | Yes | body |  |
| `browser_host` | `string` | No | query | Instance host. Optional — must be paired with browser_port; when both are omitted the single running instance is selected (400 AMBIGUOUS_INSTANCE with more than one). |
| `browser_port` | `number` | No | query | Instance port. Optional — must be paired with browser_host. |

**Returns:** `SetViewportResponse`

---

### `shutdown`

**GET** `/shutdown`

Shutdown browser instance

```typescript
client.browser.introspection.shutdown(options?: { browser_id: string }): Promise<BrowserIntrospectionShutdownResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | Yes | query | Unique identifier for the browser instance (0-based index) |

**Returns:** `BrowserIntrospectionShutdownResponse`

**CLI:** `hoody browser shutdown`

---

## `client.browser.page` (3 methods)

### `exportPdf`

**GET** `/pdf`

Export page as PDF

```typescript
client.browser.page.exportPdf(options?: { browser_id: string; tabId?: number; start?: boolean; url?: string; format?: string; landscape?: boolean; printBackground?: boolean; margin?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | Yes | query | Unique identifier for the browser instance (0-based index) |
| `tabId` | `number` | No | query | The ID of the tab to interact with |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |
| `url` | `string` | No | query | Optional URL to navigate to before generating the PDF |
| `format` | `string` | No | query | Paper format (e.g. A4, Letter) |
| `landscape` | `boolean` | No | query | Use landscape orientation |
| `printBackground` | `boolean` | No | query | Include background graphics |
| `margin` | `string` | No | query | Uniform margin (e.g. '1cm', '0.5in') |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody browser pdf`

---

### `getHtml`

**GET** `/html`

Get page HTML

```typescript
client.browser.page.getHtml(options?: { browser_id: string; tabId?: number; start?: boolean }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | Yes | query | Unique identifier for the browser instance (0-based index) |
| `tabId` | `number` | No | query | The ID of the tab to interact with |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody browser html`

---

### `getText`

**GET** `/text`

Get page text

```typescript
client.browser.page.getText(options?: { browser_id: string; tabId?: number; start?: boolean }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | Yes | query | Unique identifier for the browser instance (0-based index) |
| `tabId` | `number` | No | query | The ID of the tab to interact with |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody browser text`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
