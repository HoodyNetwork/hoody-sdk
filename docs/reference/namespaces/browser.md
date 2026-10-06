# `browser` — 28 methods

**Version:** 1.0.0-beta.15
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
client.browser.cookies.clear(options?: { browser_id?: string; start?: boolean; cache?: boolean | number }): Promise<BrowserCookiesClearResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Accepted for backwards compatibility; the server does NOT use it to select an instance. Inside a Hoody container an instance is selected by the `browser-{N}` service hostname: the platform derives the instance's port and display from it and overrides any caller-supplied values. Against a bare server, address instances with `browser_host` + `browser_port`. The only endpoint that reads `browser_id` is `/history`, as a filter equal to `N`. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `getDevtoolsUrl` is the exception: it answers 404 when no instance is running and never consults this value. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BrowserCookiesClearResponse`

**CLI:** `hoody browser cookies clear`

---

### `list`

**GET** `/cookies`

Get cookies

```typescript
client.browser.cookies.list(options?: { browser_id?: string; start?: boolean; url?: string; cache?: boolean | number }): Promise<BrowserCookiesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Accepted for backwards compatibility; the server does NOT use it to select an instance. Inside a Hoody container an instance is selected by the `browser-{N}` service hostname: the platform derives the instance's port and display from it and overrides any caller-supplied values. Against a bare server, address instances with `browser_host` + `browser_port`. The only endpoint that reads `browser_id` is `/history`, as a filter equal to `N`. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `getDevtoolsUrl` is the exception: it answers 404 when no instance is running and never consults this value. |
| `url` | `string` | No | query | Filter cookies by URL Repeating this key in the query string is a `400 VALIDATION_ERROR` (`url must not be repeated`): the parent's rule is on the key, not on the operation, so it applies here too even though this parameter is declared inline rather than shared. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BrowserCookiesListResponse`

**CLI:** `hoody browser cookies list`

---

### `setMany`

**POST** `/cookies`

Set cookies

```typescript
client.browser.cookies.setMany(data: BrowserCookiesSetManyRequest, options?: { browser_id?: string; start?: boolean; cache?: boolean | number }): Promise<BrowserCookiesSetManyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `BrowserCookiesSetManyRequest` | Yes | body |  |
| `browser_id` | `string` | No | query | Accepted for backwards compatibility; the server does NOT use it to select an instance. Inside a Hoody container an instance is selected by the `browser-{N}` service hostname: the platform derives the instance's port and display from it and overrides any caller-supplied values. Against a bare server, address instances with `browser_host` + `browser_port`. The only endpoint that reads `browser_id` is `/history`, as a filter equal to `N`. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `getDevtoolsUrl` is the exception: it answers 404 when no instance is running and never consults this value. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BrowserCookiesSetManyResponse`

**CLI:** `hoody browser cookies batch set`

---

## `client.browser.history` (2 methods)

### `clear`

**DELETE** `/history`

Delete browsing history

```typescript
client.browser.history.clear(options?: { before?: string; browser_id?: string; cache?: boolean | number }): Promise<BrowserHistoryClearResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `before` | `string` | No | query | Delete entries before this ISO 8601 timestamp |
| `browser_id` | `string` | No | query | Delete entries for specific browser ID only |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BrowserHistoryClearResponse`

**CLI:** `hoody browser history clear`

---

### `list`

**GET** `/history`

Query browsing history

```typescript
client.browser.history.list(options?: { since?: string; domain?: string; browser_id?: string; limit?: number; offset?: number; cache?: boolean | number }): Promise<BrowserHistoryListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `since` | `string` | No | query | Return entries after this ISO 8601 timestamp |
| `domain` | `string` | No | query | Filter by domain (exact match) |
| `browser_id` | `string` | No | query | Filter by browser ID |
| `limit` | `number` | No | query | Maximum entries to return (1-500) |
| `offset` | `number` | No | query | Number of entries to skip for pagination |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BrowserHistoryListResponse`

**CLI:** `hoody browser history list`

---

## `client.browser.instances` (6 methods)

### `get`

**GET** `/metadata`

Get instance metadata

```typescript
client.browser.instances.get(options?: { browser_id?: string; start?: boolean; cache?: boolean | number }): Promise<BrowserInstancesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Accepted for backwards compatibility; the server does NOT use it to select an instance. Inside a Hoody container an instance is selected by the `browser-{N}` service hostname: the platform derives the instance's port and display from it and overrides any caller-supplied values. Against a bare server, address instances with `browser_host` + `browser_port`. The only endpoint that reads `browser_id` is `/history`, as a filter equal to `N`. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `getDevtoolsUrl` is the exception: it answers 404 when no instance is running and never consults this value. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BrowserInstancesGetResponse`

**CLI:** `hoody browser get`

---

### `getDevtoolsUrls`

**GET** `/devtools-url`

Get DevTools URLs

```typescript
client.browser.instances.getDevtoolsUrls(options?: { browser_id?: string; start?: boolean; cache?: boolean | number }): Promise<BrowserInstancesGetDevtoolsUrlsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Accepted for backwards compatibility; the server does NOT use it to select an instance. Inside a Hoody container an instance is selected by the `browser-{N}` service hostname: the platform derives the instance's port and display from it and overrides any caller-supplied values. Against a bare server, address instances with `browser_host` + `browser_port`. The only endpoint that reads `browser_id` is `/history`, as a filter equal to `N`. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `getDevtoolsUrl` is the exception: it answers 404 when no instance is running and never consults this value. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BrowserInstancesGetDevtoolsUrlsResponse`

**CLI:** `hoody browser devtools urls get`

---

### `restart`

**GET** `/restart`

Restart browser instance

```typescript
client.browser.instances.restart(options?: { browser_id?: string; start?: boolean; chromiumVersion?: string; fingerprintId?: string; useRemoteDebuggingPort?: boolean; remoteDebuggingPort?: number; remoteDebuggingAddress?: string; extensions?: string; extensionsDir?: string; extensionsStoreIds?: string; proxyServer?: string; proxyUsername?: string; proxyPassword?: string; proxyBypass?: string; enableQuic?: boolean; enableDnsOverHttps?: boolean; dnsOverHttpsUrl?: string; display?: number | string; showBrowser?: boolean; sessionName?: string; timezoneId?: string; locale?: string; userAgent?: string; viewport?: Viewport; noViewport?: boolean; geolocation?: Geolocation; launchArguments?: string[]; browser?: "chromium" | "firefox"; firefoxVersion?: string; firefoxExecutablePath?: string; showDevtools?: boolean; userProfile?: Record<string, unknown>; stealth?: boolean; iframe?: boolean; iframe_url?: string; maximize_new_windows?: boolean; cache?: boolean | number }): Promise<BrowserInstancesRestartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Accepted for backwards compatibility; the server does NOT use it to select an instance. Inside a Hoody container an instance is selected by the `browser-{N}` service hostname: the platform derives the instance's port and display from it and overrides any caller-supplied values. Against a bare server, address instances with `browser_host` + `browser_port`. The only endpoint that reads `browser_id` is `/history`, as a filter equal to `N`. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `getDevtoolsUrl` is the exception: it answers 404 when no instance is running and never consults this value. |
| `chromiumVersion` | `string` | No | query | Chromium/Chrome version selection for the instance. This option applies only when `browser=chromium`. Supported formats: - Full version: `136.0.7103.113` - Major version: `136` (mapped to a known stable patch for the current OS) - Channel tag: `stable`, `beta`, `dev`, `canary` The request **blocks** until the requested browser build is available on the server. |
| `fingerprintId` | `string` | No | query | Base fingerprint profile id. The server uses the `context` and `launch` defaults of the configured fingerprint profile with this id, then applies any request overrides over them (top-level options and `userProfile` values both win over the profile). An unknown id starts with an empty profile. |
| `useRemoteDebuggingPort` | `boolean` | No | query | If `true`, the child process will launch Chromium with `--remote-debugging-port` and will populate `webSocketDebuggerUrl` in metadata responses. |
| `remoteDebuggingPort` | `number` | No | query | Ignored. The kit always assigns the DevTools port itself (a caller-supplied value is never honoured, for isolation); read the assigned URLs from `/devtools-url` or the instance metadata. Kept only so older clients do not fail validation. |
| `remoteDebuggingAddress` | `string` | No | query | Interface address the DevTools port binds to. Defaults to `0.0.0.0` unless the deployment overrides it; the port is only reachable through the container proxy's `cdp-{N}` relay. |
| `extensions` | `string` | No | query | Comma-separated list (or JSON array string) of absolute extension directory paths to load. Extensions require `showBrowser=true` (headful mode) and will launch a persistent profile. |
| `extensionsDir` | `string` | No | query | Directory containing extension subfolders to load (each subfolder is treated as an extension). Extensions require `showBrowser=true` (headful mode) and will launch a persistent profile. |
| `extensionsStoreIds` | `string` | No | query | Chrome Web Store extension IDs to download and load (Chromium only). Requires `showBrowser=true` and works only with `browser=chromium`. Downloads of the same extension are serialized across instances; an instance that waits more than 5 minutes for another instance's download fails with a "try again later" error. |
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
| `geolocation` | `Geolocation` | No | query | Geolocation configuration as JSON string. Example: {"latitude":40.7128,"longitude":-74.0060,"accuracy":100} Anything other than a JSON object (`null`, an array, a number) is a `400 VALIDATION_ERROR`. |
| `launchArguments` | `string[]` | No | query | Additional Chromium/Firefox command-line arguments. Pass the query key repeatedly (`launchArguments=--a&launchArguments=--b`) or a single JSON array string (`launchArguments=["--a","--b"]`); every value is kept. Entries must be strings (400 otherwise). |
| `browser` | `"chromium" \| "firefox"` | No | query | Browser engine to use (`chromium` or `firefox`). `chrome` is accepted as an alias of `chromium`. Fixed for the life of the instance. |
| `firefoxVersion` | `string` | No | query | Firefox version label (informational only). Playwright-managed Firefox builds are used by default. If omitted, a Playwright Firefox build is downloaded on demand. |
| `firefoxExecutablePath` | `string` | No | query | Absolute path to a custom Firefox executable (overrides download) |
| `showDevtools` | `boolean` | No | query | Whether to open DevTools on launch (Chromium only) |
| `userProfile` | `Record&lt;string, unknown&gt;` | No | query | Optional user profile object (JSON string): `locale`, `timezoneId`, `userAgentString`, `geolocation` and `deviceProfile.viewport`. Precedence for each field: the top-level request option (`locale`, `timezoneId`, `userAgent`, `geolocation`, `viewport`) &gt; `userProfile` &gt; the fingerprint profile (`fingerprintId`, `default` when omitted) &gt; the engine default. A value set here always replaces the fingerprint profile's value. |
| `stealth` | `boolean` | No | query | Launch Chromium in stealth mode using Patchright (anti-detection patches). Only applies to `browser=chromium`. Ignored for Firefox. Defaults to `true`. Bare `?stealth` is treated as `true`. |
| `iframe` | `boolean` | No | query | Enable or disable the full-page display iframe on the root URL. |
| `iframe_url` | `string` | No | query | Explicit URL for the display iframe. |
| `maximize_new_windows` | `boolean` | No | query | Control the `maximize_new_windows` flag stamped onto the generated display URL (always explicit `true`/`false`); when true the hoody-display client opens new top-level app windows maximized. Enabled by default; set to `false` to opt out. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BrowserInstancesRestartResponse`

**CLI:** `hoody browser restart`

---

### `shutdown`

**GET** `/shutdown`

Shutdown browser instance

```typescript
client.browser.instances.shutdown(options?: { browser_id?: string; cache?: boolean | number }): Promise<BrowserInstancesShutdownResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Accepted for backwards compatibility; the server does NOT use it to select an instance. Inside a Hoody container an instance is selected by the `browser-{N}` service hostname: the platform derives the instance's port and display from it and overrides any caller-supplied values. Against a bare server, address instances with `browser_host` + `browser_port`. The only endpoint that reads `browser_id` is `/history`, as a filter equal to `N`. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BrowserInstancesShutdownResponse`

**CLI:** `hoody browser shutdown`

---

### `start`

**GET** `/start`

Create or retrieve browser instance

```typescript
client.browser.instances.start(options?: { browser_id?: string; chromiumVersion?: string; fingerprintId?: string; useRemoteDebuggingPort?: boolean; remoteDebuggingPort?: number; remoteDebuggingAddress?: string; extensions?: string; extensionsDir?: string; extensionsStoreIds?: string; proxyServer?: string; proxyUsername?: string; proxyPassword?: string; proxyBypass?: string; enableQuic?: boolean; enableDnsOverHttps?: boolean; dnsOverHttpsUrl?: string; display?: number | string; showBrowser?: boolean; sessionName?: string; timezoneId?: string; locale?: string; userAgent?: string; viewport?: string; noViewport?: boolean; geolocation?: string; launchArguments?: string[]; browser?: "chromium" | "firefox"; firefoxVersion?: string; firefoxExecutablePath?: string; showDevtools?: boolean; userProfile?: Record<string, unknown>; stealth?: boolean; iframe?: boolean; iframe_url?: string; maximize_new_windows?: boolean; cache?: boolean | number }): Promise<BrowserInstancesStartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Accepted for backwards compatibility; the server does NOT use it to select an instance. Inside a Hoody container an instance is selected by the `browser-{N}` service hostname: the platform derives the instance's port and display from it and overrides any caller-supplied values. Against a bare server, address instances with `browser_host` + `browser_port`. The only endpoint that reads `browser_id` is `/history`, as a filter equal to `N`. |
| `chromiumVersion` | `string` | No | query | Chromium/Chrome version selection for the instance. This option applies only when `browser=chromium`. Supported formats: - Full version: `136.0.7103.113` - Major version: `136` (mapped to a known stable patch for the current OS) - Channel tag: `stable`, `beta`, `dev`, `canary` The request **blocks** until the requested browser build is available on the server. |
| `fingerprintId` | `string` | No | query | Base fingerprint profile id. The server uses the `context` and `launch` defaults of the configured fingerprint profile with this id, then applies any request overrides over them (top-level options and `userProfile` values both win over the profile). An unknown id starts with an empty profile. |
| `useRemoteDebuggingPort` | `boolean` | No | query | If `true`, the child process will launch Chromium with `--remote-debugging-port` and will populate `webSocketDebuggerUrl` in metadata responses. |
| `remoteDebuggingPort` | `number` | No | query | Ignored. The kit always assigns the DevTools port itself (a caller-supplied value is never honoured, for isolation); read the assigned URLs from `/devtools-url` or the instance metadata. Kept only so older clients do not fail validation. |
| `remoteDebuggingAddress` | `string` | No | query | Interface address the DevTools port binds to. Defaults to `0.0.0.0` unless the deployment overrides it; the port is only reachable through the container proxy's `cdp-{N}` relay. |
| `extensions` | `string` | No | query | Comma-separated list (or JSON array string) of absolute extension directory paths to load. Extensions require `showBrowser=true` (headful mode) and will launch a persistent profile. |
| `extensionsDir` | `string` | No | query | Directory containing extension subfolders to load (each subfolder is treated as an extension). Extensions require `showBrowser=true` (headful mode) and will launch a persistent profile. |
| `extensionsStoreIds` | `string` | No | query | Comma-separated list (or JSON array string) of Chrome Web Store extension IDs to download and load. Requires `showBrowser=true` and works only with `browser=chromium`. Downloads of the same extension are serialized across instances; an instance that waits more than 5 minutes for another instance's download fails with a "try again later" error. |
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
| `geolocation` | `string` | No | query | Geolocation configuration as JSON string. Example: {"latitude":40.7128,"longitude":-74.0060,"accuracy":100} Anything other than a JSON object (`null`, an array, a number) is a `400 VALIDATION_ERROR`. |
| `launchArguments` | `string[]` | No | query | Additional Chromium/Firefox command-line arguments. Pass the query key repeatedly (`launchArguments=--a&launchArguments=--b`) or a single JSON array string (`launchArguments=["--a","--b"]`); every value is kept. Entries must be strings (400 otherwise). |
| `browser` | `"chromium" \| "firefox"` | No | query | Browser engine to use (`chromium` or `firefox`). `chrome` is accepted as an alias of `chromium`. Fixed for the life of the instance. |
| `firefoxVersion` | `string` | No | query | Firefox version label (informational only). Playwright-managed Firefox builds are used by default. If omitted, a Playwright Firefox build is downloaded on demand. |
| `firefoxExecutablePath` | `string` | No | query | Absolute path to a custom Firefox executable (overrides download) |
| `showDevtools` | `boolean` | No | query | Whether to open DevTools on launch (Chromium only) |
| `userProfile` | `Record&lt;string, unknown&gt;` | No | query | Optional user profile object (JSON string): `locale`, `timezoneId`, `userAgentString`, `geolocation` and `deviceProfile.viewport`. Precedence for each field: the top-level request option (`locale`, `timezoneId`, `userAgent`, `geolocation`, `viewport`) &gt; `userProfile` &gt; the fingerprint profile (`fingerprintId`, `default` when omitted) &gt; the engine default. A value set here always replaces the fingerprint profile's value. |
| `stealth` | `boolean` | No | query | Launch Chromium in stealth mode using Patchright (anti-detection patches). Only applies to `browser=chromium`. Ignored for Firefox. Defaults to `true`. Bare `?stealth` is treated as `true`. |
| `iframe` | `boolean` | No | query | Enable or disable the full-page display iframe on the root URL. When enabled (default), navigating to `/` serves an HTML page with an iframe pointing to the Hoody display URL. |
| `iframe_url` | `string` | No | query | Explicit URL for the display iframe. If not provided, the URL is auto-detected from the Host header subdomain pattern. |
| `maximize_new_windows` | `boolean` | No | query | Control the `maximize_new_windows` flag stamped onto generated display URLs (iframe pages, status pages, `iframe_url` metadata). The flag is always explicit (`true` or `false`); when true the hoody-display client opens new top-level app windows maximized. Enabled by default; set to `false` to keep the display client's centered default-size placement (the explicit `false` also overrides a display-side `default-settings.txt` enable). Explicit `iframe_url` values are never modified. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BrowserInstancesStartResponse`

**CLI:** `hoody browser start`

---

### `stop`

**GET** `/stop`

Stop browser instance

```typescript
client.browser.instances.stop(options?: { browser_id?: string; cache?: boolean | number }): Promise<BrowserInstancesStopResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Accepted for backwards compatibility; the server does NOT use it to select an instance. Inside a Hoody container an instance is selected by the `browser-{N}` service hostname: the platform derives the instance's port and display from it and overrides any caller-supplied values. Against a bare server, address instances with `browser_host` + `browser_port`. The only endpoint that reads `browser_id` is `/history`, as a filter equal to `N`. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BrowserInstancesStopResponse`

**CLI:** `hoody browser stop`

---

## `client.browser.kit` (2 methods)

### `getHealth`

**GET** `/api/v1/browser/health`

Health check

```typescript
client.browser.kit.getHealth(): Promise<BrowserKitGetHealthResponse>
```

**Returns:** `BrowserKitGetHealthResponse`

**CLI:** `hoody browser health`

---

### `getStats`

**GET** `/metrics`

Server metrics

```typescript
client.browser.kit.getStats(): Promise<BrowserKitGetStatsResponse>
```

**Returns:** `BrowserKitGetStatsResponse`

**CLI:** `hoody browser stats`

---

## `client.browser.logs` (2 methods)

### `listConsole`

**GET** `/console`

Get console logs

```typescript
client.browser.logs.listConsole(options?: { browser_id?: string; tabId?: number; start?: boolean; type?: string; since?: string; clear?: boolean; cache?: boolean | number }): Promise<BrowserLogsListConsoleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Accepted for backwards compatibility; the server does NOT use it to select an instance. Inside a Hoody container an instance is selected by the `browser-{N}` service hostname: the platform derives the instance's port and display from it and overrides any caller-supplied values. Against a bare server, address instances with `browser_host` + `browser_port`. The only endpoint that reads `browser_id` is `/history`, as a filter equal to `N`. |
| `tabId` | `number` | No | query | The ID of the tab to interact with (from `/tabs`). Omitted: the active tab. Supplied: exactly that tab — an unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `getDevtoolsUrl` is the exception: it answers 404 when no instance is running and never consults this value. |
| `type` | `string` | No | query | Filter by message type (log, error, warning, info, etc.). Repeating this key in the query string is a `400 VALIDATION_ERROR` (`type must not be repeated`). |
| `since` | `string` | No | query | Only return entries at or after this time: an ISO 8601 date or date-time, like `2026-10-05T12:00:00Z`. Any other value (an epoch number, a word like `yesterday`) is a `400 VALIDATION_ERROR` naming `since`, never an unfiltered list. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`since must not be repeated`). |
| `clear` | `boolean` | No | query | Clear the buffer after reading. `true` or `false`; any other value is a `400 VALIDATION_ERROR` naming `clear`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`clear must not be repeated`). |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BrowserLogsListConsoleResponse`

**CLI:** `hoody browser logs console list`

---

### `listNetwork`

**GET** `/network`

Get network logs

```typescript
client.browser.logs.listNetwork(options?: { browser_id?: string; tabId?: number; start?: boolean; since?: string; clear?: boolean; cache?: boolean | number }): Promise<BrowserLogsListNetworkResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Accepted for backwards compatibility; the server does NOT use it to select an instance. Inside a Hoody container an instance is selected by the `browser-{N}` service hostname: the platform derives the instance's port and display from it and overrides any caller-supplied values. Against a bare server, address instances with `browser_host` + `browser_port`. The only endpoint that reads `browser_id` is `/history`, as a filter equal to `N`. |
| `tabId` | `number` | No | query | The ID of the tab to interact with (from `/tabs`). Omitted: the active tab. Supplied: exactly that tab — an unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `getDevtoolsUrl` is the exception: it answers 404 when no instance is running and never consults this value. |
| `since` | `string` | No | query | Only return entries at or after this time: an ISO 8601 date or date-time, like `2026-10-05T12:00:00Z`. Any other value (an epoch number, a word like `yesterday`) is a `400 VALIDATION_ERROR` naming `since`, never an unfiltered list. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`since must not be repeated`). |
| `clear` | `boolean` | No | query | Clear the buffer after reading. `true` or `false`; any other value is a `400 VALIDATION_ERROR` naming `clear`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`clear must not be repeated`). |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BrowserLogsListNetworkResponse`

**CLI:** `hoody browser logs network list`

---

## `client.browser.page` (9 methods)

### `act`

**POST** `/action`

Perform a native element action

```typescript
client.browser.page.act(data: BrowserPageActRequest, options?: { browser_id?: string; cache?: boolean | number }): Promise<BrowserPageActResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `BrowserPageActRequest` | Yes | body |  |
| `browser_id` | `string` | No | query | Accepted for backwards compatibility; the server does NOT use it to select an instance. Inside a Hoody container an instance is selected by the `browser-{N}` service hostname: the platform derives the instance's port and display from it and overrides any caller-supplied values. Against a bare server, address instances with `browser_host` + `browser_port`. The only endpoint that reads `browser_id` is `/history`, as a filter equal to `N`. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BrowserPageActResponse`

**CLI:** `hoody browser act`

---

### `captureScreenshot`

**GET** `/screenshot`

Capture browser screenshot

```typescript
client.browser.page.captureScreenshot(options?: { browser_id?: string; start?: boolean; url?: string; tabId?: number; format?: "png" | "jpeg" | "base64"; quality?: number; fullPage?: boolean; cache?: boolean | number }): Promise<ApiResponse<ArrayBuffer> | BrowserPageCaptureScreenshotResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Accepted for backwards compatibility; the server does NOT use it to select an instance. Inside a Hoody container an instance is selected by the `browser-{N}` service hostname: the platform derives the instance's port and display from it and overrides any caller-supplied values. Against a bare server, address instances with `browser_host` + `browser_port`. The only endpoint that reads `browser_id` is `/history`, as a filter equal to `N`. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `getDevtoolsUrl` is the exception: it answers 404 when no instance is running and never consults this value. |
| `url` | `string` | No | query | The URL to navigate to. Repeating this key IN THE QUERY STRING is a `400 VALIDATION_ERROR` (`url must not be repeated`), on GET and on POST alike — a request naming two destinations is answered rather than silently resolved to one of them. The rule is about the query string only — a JSON body property named `url` is governed by the body schema. Only an absolute `http`, `https` or `data` URL, `about:blank`, or (on Chromium engines only) a `chrome:` URL is accepted. Any other scheme (`file:` in any spelling, `view-source:`, `javascript:`, `blob:` and the rest) is a `400 VALIDATION_ERROR` (`url must be an http, https or data URL, about:blank, or a chrome URL on Chromium; file and other local schemes are refused`), and a value that is not an absolute URL (such as `/etc/hostname`) is a `400 VALIDATION_ERROR` (`url must be an absolute URL, like https://example.com/`). Every other `about:` page is refused (Firefox's `about:reader?url=file:…` loads a local file), and `chrome:` is refused on Firefox, where it is the browser's own privileged UI. A value that is not a string is `url must be a string`. The `url` is checked before an instance is started, a tab is looked up, created or reused, or anything is navigated, and before `/pdf`'s `501 NOT_SUPPORTED`. On `/screenshot` and `/pdf` a supplied but empty `url=` is a `400 VALIDATION_ERROR` too (omit `url` to capture the current tab). This checks the request only; it does not stop the browser from opening local files (see "Local files" in the API overview). |
| `tabId` | `number` | No | query | The ID of the tab to interact with (from `/tabs`). Omitted: the active tab. Supplied: exactly that tab — an unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema. |
| `format` | `"png" \| "jpeg" \| "base64"` | No | query | Output format. `base64` answers JSON with the PNG bytes base64-encoded. Any other value is a `400 VALIDATION_ERROR` naming `format`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`format must not be repeated`). |
| `quality` | `number` | No | query | Image quality for JPEG format (0-100); not used for `png` or `base64`. A value that is not an integer from 0 to 100 is a `400 VALIDATION_ERROR` naming `quality`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`quality must not be repeated`). |
| `fullPage` | `boolean` | No | query | Capture the entire scrollable page. `true` or `false`; any other value is a `400 VALIDATION_ERROR` naming `fullPage`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`fullPage must not be repeated`). |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<ArrayBuffer> | BrowserPageCaptureScreenshotResponse`

**CLI:** `hoody browser screenshots capture`

---

### `evaluate`

**POST** `/eval`

Execute JavaScript (POST)

```typescript
client.browser.page.evaluate(data: BrowserPageEvaluateRequest, options?: { browser_id?: string; start?: boolean; cache?: boolean | number }): Promise<BrowserPageEvaluateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `BrowserPageEvaluateRequest` | Yes | body |  |
| `browser_id` | `string` | No | query | Accepted for backwards compatibility; the server does NOT use it to select an instance. Inside a Hoody container an instance is selected by the `browser-{N}` service hostname: the platform derives the instance's port and display from it and overrides any caller-supplied values. Against a bare server, address instances with `browser_host` + `browser_port`. The only endpoint that reads `browser_id` is `/history`, as a filter equal to `N`. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `getDevtoolsUrl` is the exception: it answers 404 when no instance is running and never consults this value. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BrowserPageEvaluateResponse`

**CLI:** `hoody browser evaluate`

---

### `exportPdf`

**GET** `/pdf`

Export page as PDF

```typescript
client.browser.page.exportPdf(options?: { browser_id?: string; tabId?: number; start?: boolean; url?: string; format?: string; landscape?: boolean; printBackground?: boolean; margin?: string; cache?: boolean | number }): Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Accepted for backwards compatibility; the server does NOT use it to select an instance. Inside a Hoody container an instance is selected by the `browser-{N}` service hostname: the platform derives the instance's port and display from it and overrides any caller-supplied values. Against a bare server, address instances with `browser_host` + `browser_port`. The only endpoint that reads `browser_id` is `/history`, as a filter equal to `N`. |
| `tabId` | `number` | No | query | The ID of the tab to interact with (from `/tabs`). Omitted: the active tab. Supplied: exactly that tab — an unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `getDevtoolsUrl` is the exception: it answers 404 when no instance is running and never consults this value. |
| `url` | `string` | No | query | Optional URL to navigate to before generating the PDF. Only an absolute `http`, `https` or `data` URL, `about:blank`, or (on Chromium engines only) a `chrome:` URL is accepted. Any other scheme (`file:` in any spelling, `view-source:`, `javascript:`, `blob:` and the rest) is a `400 VALIDATION_ERROR` (`url must be an http, https or data URL, about:blank, or a chrome URL on Chromium; file and other local schemes are refused`), and a value that is not an absolute URL (such as `/etc/hostname`) is a `400 VALIDATION_ERROR` (`url must be an absolute URL, like https://example.com/`). Every other `about:` page is refused (Firefox's `about:reader?url=file:…` loads a local file), and `chrome:` is refused on Firefox, where it is the browser's own privileged UI. A value that is not a string is `url must be a string`. The `url` is checked before an instance is started, a tab is looked up, created or reused, or anything is navigated, and before `/pdf`'s `501 NOT_SUPPORTED`. On `/screenshot` and `/pdf` a supplied but empty `url=` is a `400 VALIDATION_ERROR` too (omit `url` to capture the current tab). This checks the request only; it does not stop the browser from opening local files (see "Local files" in the API overview). Repeating this key in the query string is a `400 VALIDATION_ERROR` (`url must not be repeated`): the parent's rule is on the key, not on the operation, so it applies here too even though this parameter is declared inline rather than shared. |
| `format` | `string` | No | query | Paper format: one of Letter, Legal, Tabloid, Ledger, A0, A1, A2, A3, A4, A5 or A6 (any letter case). Any other value is a `400 VALIDATION_ERROR` naming `format`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`format must not be repeated`). |
| `landscape` | `boolean` | No | query | Use landscape orientation. `true` or `false`; any other value is a `400 VALIDATION_ERROR` naming `landscape`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`landscape must not be repeated`). |
| `printBackground` | `boolean` | No | query | Include background graphics. `true` or `false`; any other value is a `400 VALIDATION_ERROR` naming `printBackground`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`printBackground must not be repeated`). |
| `margin` | `string` | No | query | Uniform margin: a non-negative number of pixels, or a number followed by `px`, `in`, `cm` or `mm` (e.g. '1cm', '0.5in'). Any other value is a `400 VALIDATION_ERROR` naming `margin`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`margin must not be repeated`). |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<ArrayBuffer>`

**CLI:** `hoody browser pdf export`

---

### `getHtml`

**GET** `/html`

Get page HTML

```typescript
client.browser.page.getHtml(options?: { browser_id?: string; tabId?: number; start?: boolean; cache?: boolean | number }): Promise<ApiResponse<string>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Accepted for backwards compatibility; the server does NOT use it to select an instance. Inside a Hoody container an instance is selected by the `browser-{N}` service hostname: the platform derives the instance's port and display from it and overrides any caller-supplied values. Against a bare server, address instances with `browser_host` + `browser_port`. The only endpoint that reads `browser_id` is `/history`, as a filter equal to `N`. |
| `tabId` | `number` | No | query | The ID of the tab to interact with (from `/tabs`). Omitted: the active tab. Supplied: exactly that tab — an unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `getDevtoolsUrl` is the exception: it answers 404 when no instance is running and never consults this value. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<string>`

**CLI:** `hoody browser html get`

---

### `getSnapshot`

**GET** `/snapshot`

Accessibility snapshot of a tab with element refs

```typescript
client.browser.page.getSnapshot(options?: { browser_id?: string; instanceGeneration?: string; tabId?: number; paramTimeoutMs?: number; maxChars?: number; includeValues?: boolean; cache?: boolean | number }): Promise<BrowserPageGetSnapshotResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Accepted for backwards compatibility; the server does NOT use it to select an instance. Inside a Hoody container an instance is selected by the `browser-{N}` service hostname: the platform derives the instance's port and display from it and overrides any caller-supplied values. Against a bare server, address instances with `browser_host` + `browser_port`. The only endpoint that reads `browser_id` is `/history`, as a filter equal to `N`. |
| `instanceGeneration` | `string` | No | query | The instance generation from /metadata. If it no longer matches the running instance → 409 INSTANCE_CHANGED (also when no instance exists: details.expected is null). Repeating this key in the query string is a `400 VALIDATION_ERROR` (`instanceGeneration must not be repeated`); a body property of the same name is governed by the body schema. |
| `tabId` | `number` | No | query | The ID of the tab to interact with (from `/tabs`). Omitted: the active tab. Supplied: exactly that tab — an unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema. |
| `paramTimeoutMs` | `number` | No | query |  |
| `maxChars` | `number` | No | query | Hard cut on a line boundary; `truncated` reports it. A truncated excerpt may not parse as standalone YAML. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`maxChars must not be repeated`). |
| `includeValues` | `boolean` | No | query | Include the CONTENTS of form controls in the snapshot. Off by default: the accessibility tree serialises `input.value`, so a snapshot taken after the agent typed a password, card number or token would hand those back on every subsequent loop iteration. With the default, the value of a non-empty textbox, searchbox, spinbutton, slider or editable combobox (an input with a `&lt;datalist&gt;`, or `role=combobox`) renders as `&lt;value hidden&gt;`, whatever its label contains; only a native `&lt;select&gt;` keeps its option names, when it holds nothing but `&lt;option&gt;`, `&lt;optgroup&gt;` and `&lt;hr&gt;` elements and none of them uses `aria-owns` or `aria-labelledby` or is editable (every other node in it keeps its role and ref but not its name or text), and the content of every other combobox, ARIA autocomplete popups and customizable selects with rich option content included, is hidden whole (an empty one renders with no value at all, so the caller can still tell them apart). A `&lt;select&gt;`'s options are page content, not entered text, and are always included. Content inside an editable region (a `contenteditable` element, or a whole page in `designMode`) is hidden too: the region keeps its role and ref, its contents become `&lt;value hidden&gt;`, and its name is shown only when it is authored (`aria-label`, or `aria-labelledby` pointing at non-editable content); text the snapshot folds from an editor into an enclosing element is hidden there too. If the page cannot be asked in time, the text and computed names on such a page are hidden and the refs are kept. Set to `true` only when the values are known not to be sensitive. Anything but `true`/`false` → 400, and repeating this key in the query string is a `400 VALIDATION_ERROR` (`includeValues must not be repeated`). |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BrowserPageGetSnapshotResponse`

**CLI:** `hoody browser snapshot get`

---

### `getText`

**GET** `/text`

Get page text

```typescript
client.browser.page.getText(options?: { browser_id?: string; tabId?: number; start?: boolean; cache?: boolean | number }): Promise<ApiResponse<string>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Accepted for backwards compatibility; the server does NOT use it to select an instance. Inside a Hoody container an instance is selected by the `browser-{N}` service hostname: the platform derives the instance's port and display from it and overrides any caller-supplied values. Against a bare server, address instances with `browser_host` + `browser_port`. The only endpoint that reads `browser_id` is `/history`, as a filter equal to `N`. |
| `tabId` | `number` | No | query | The ID of the tab to interact with (from `/tabs`). Omitted: the active tab. Supplied: exactly that tab — an unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `getDevtoolsUrl` is the exception: it answers 404 when no instance is running and never consults this value. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<string>`

**CLI:** `hoody browser text get`

---

### `navigate`

**POST** `/browse`

Navigate to URL (POST)

```typescript
client.browser.page.navigate(data: BrowserPageNavigateRequest, options?: { browser_id?: string; start?: boolean; cache?: boolean | number }): Promise<BrowserPageNavigateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `BrowserPageNavigateRequest` | Yes | body |  |
| `browser_id` | `string` | No | query | Accepted for backwards compatibility; the server does NOT use it to select an instance. Inside a Hoody container an instance is selected by the `browser-{N}` service hostname: the platform derives the instance's port and display from it and overrides any caller-supplied values. Against a bare server, address instances with `browser_host` + `browser_port`. The only endpoint that reads `browser_id` is `/history`, as a filter equal to `N`. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `getDevtoolsUrl` is the exception: it answers 404 when no instance is running and never consults this value. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BrowserPageNavigateResponse`

**CLI:** `hoody browser navigate`

---

### `wait`

**POST** `/wait`

Wait for a condition in a tab

```typescript
client.browser.page.wait(data: BrowserPageWaitRequest, options?: { browser_id?: string; cache?: boolean | number }): Promise<BrowserPageWaitResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `BrowserPageWaitRequest` | Yes | body |  |
| `browser_id` | `string` | No | query | Accepted for backwards compatibility; the server does NOT use it to select an instance. Inside a Hoody container an instance is selected by the `browser-{N}` service hostname: the platform derives the instance's port and display from it and overrides any caller-supplied values. Against a bare server, address instances with `browser_host` + `browser_port`. The only endpoint that reads `browser_id` is `/history`, as a filter equal to `N`. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BrowserPageWaitResponse`

**CLI:** `hoody browser wait`

---

## `client.browser.tabs` (2 methods)

### `close`

**POST** `/tab/close`

Close a browser tab

```typescript
client.browser.tabs.close(data?: BrowserTabsCloseRequest, options?: { browser_id?: string; start?: boolean; cache?: boolean | number }): Promise<BrowserTabsCloseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `BrowserTabsCloseRequest` | No | body |  |
| `browser_id` | `string` | No | query | Accepted for backwards compatibility; the server does NOT use it to select an instance. Inside a Hoody container an instance is selected by the `browser-{N}` service hostname: the platform derives the instance's port and display from it and overrides any caller-supplied values. Against a bare server, address instances with `browser_host` + `browser_port`. The only endpoint that reads `browser_id` is `/history`, as a filter equal to `N`. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `getDevtoolsUrl` is the exception: it answers 404 when no instance is running and never consults this value. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BrowserTabsCloseResponse`

**CLI:** `hoody browser tabs close`

---

### `list`

**GET** `/tabs`

List browser tabs

```typescript
client.browser.tabs.list(options?: { browser_id?: string; start?: boolean; cache?: boolean | number }): Promise<BrowserTabsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Accepted for backwards compatibility; the server does NOT use it to select an instance. Inside a Hoody container an instance is selected by the `browser-{N}` service hostname: the platform derives the instance's port and display from it and overrides any caller-supplied values. Against a bare server, address instances with `browser_host` + `browser_port`. The only endpoint that reads `browser_id` is `/history`, as a filter equal to `N`. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default — do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `getDevtoolsUrl` is the exception: it answers 404 when no instance is running and never consults this value. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BrowserTabsListResponse`

**CLI:** `hoody browser tabs list`

---

## `client.browser.viewport` (2 methods)

### `get`

**GET** `/viewport`

Get the current viewport policy

```typescript
client.browser.viewport.get(options?: { browser_host?: string; browser_port?: number; cache?: boolean | number }): Promise<BrowserViewportGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_host` | `string` | No | query | Instance host. Optional — must be paired with browser_port; when both are omitted the single running instance is selected (400 AMBIGUOUS_INSTANCE with more than one). |
| `browser_port` | `number` | No | query | Instance port. Optional — must be paired with browser_host. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BrowserViewportGetResponse`

**CLI:** `hoody browser viewport get`

---

### `set`

**POST** `/viewport`

Change the viewport at runtime

```typescript
client.browser.viewport.set(data: BrowserViewportSetRequest, options?: { browser_host?: string; browser_port?: number; cache?: boolean | number }): Promise<BrowserViewportSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `BrowserViewportSetRequest` | Yes | body |  |
| `browser_host` | `string` | No | query | Instance host. Optional — must be paired with browser_port; when both are omitted the single running instance is selected (400 AMBIGUOUS_INSTANCE with more than one). |
| `browser_port` | `number` | No | query | Instance port. Optional — must be paired with browser_host. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `BrowserViewportSetResponse`

**CLI:** `hoody browser viewport set`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
