# `browser` — 29 methods

**Version:** 1.0.1
**Accessor:** `client.browser`

```typescript
import * as browser from 'hoody-sdk/browser';
```

---

## `client.browser.cookies` (3 methods)

### `clear`

**DELETE** `/api/v1/browser/cookies`

Clear all cookies

```typescript
client.browser.cookies.clear(options?: { browser_id?: string; start?: boolean }): Promise<BrowserCookiesClearResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default: do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `GET /api/v1/browser/devtools-url` is the exception: it answers 404 when no instance is running and never consults this value. |

**Returns:** `BrowserCookiesClearResponse`

**CLI:** `hoody browser cookies clear`

---

### `list`

**GET** `/api/v1/browser/cookies`

Get cookies

```typescript
client.browser.cookies.list(options?: { browser_id?: string; start?: boolean; url?: string }): Promise<BrowserCookiesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default: do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `GET /api/v1/browser/devtools-url` is the exception: it answers 404 when no instance is running and never consults this value. |
| `url` | `string` | No | query | Filter cookies by URL. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`url must not be repeated`): the server's rule is on the key, not on the operation, so it applies here too even though this parameter is declared inline rather than shared. |

**Returns:** `BrowserCookiesListResponse`

**CLI:** `hoody browser cookies list`

---

### `setMany`

**POST** `/api/v1/browser/cookies`

Set cookies

```typescript
client.browser.cookies.setMany(data: BrowserCookiesSetManyRequest, options?: { browser_id?: string; start?: boolean }): Promise<BrowserCookiesSetManyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `BrowserCookiesSetManyRequest` | Yes | body |  |
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default: do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `GET /api/v1/browser/devtools-url` is the exception: it answers 404 when no instance is running and never consults this value. |

**Returns:** `BrowserCookiesSetManyResponse`

**CLI:** `hoody browser cookies batch set`

---

## `client.browser.history` (2 methods)

### `clear`

**DELETE** `/api/v1/browser/history`

Delete browsing history

```typescript
client.browser.history.clear(options?: { before?: string; browser_id?: string }): Promise<BrowserHistoryClearResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `before` | `string` | No | query | Delete entries before this ISO 8601 timestamp |
| `browser_id` | `string` | No | query | Delete entries for specific browser ID only. Through a `browser-{N}` service hostname it may only be `N` (the default there). |

**Returns:** `BrowserHistoryClearResponse`

**CLI:** `hoody browser history clear`

---

### `list`

**GET** `/api/v1/browser/history`

Query browsing history

```typescript
client.browser.history.list(options?: { since?: string; domain?: string; browser_id?: string; limit?: number; offset?: number }): Promise<BrowserHistoryListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `since` | `string` | No | query | Return entries after this ISO 8601 timestamp |
| `domain` | `string` | No | query | Filter by domain (exact match) |
| `browser_id` | `string` | No | query | Filter by browser ID. Through a `browser-{N}` service hostname it may only be `N` (the default there). |
| `limit` | `number` | No | query | Maximum entries to return (1-500) |
| `offset` | `number` | No | query | Number of entries to skip for pagination |

**Returns:** `BrowserHistoryListResponse`

**CLI:** `hoody browser history list`

---

## `client.browser.instances` (6 methods)

### `get`

**GET** `/api/v1/browser/metadata`

Get instance metadata

```typescript
client.browser.instances.get(options?: { browser_id?: string; start?: boolean }): Promise<BrowserInstancesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default: do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `GET /api/v1/browser/devtools-url` is the exception: it answers 404 when no instance is running and never consults this value. |

**Returns:** `BrowserInstancesGetResponse`

**CLI:** `hoody browser get`

---

### `getDevtoolsUrls`

**GET** `/api/v1/browser/devtools-url`

Get DevTools URLs

```typescript
client.browser.instances.getDevtoolsUrls(options?: { browser_id?: string; start?: boolean }): Promise<BrowserInstancesGetDevtoolsUrlsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default: do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `GET /api/v1/browser/devtools-url` is the exception: it answers 404 when no instance is running and never consults this value. |

**Returns:** `BrowserInstancesGetDevtoolsUrlsResponse`

**CLI:** `hoody browser devtoolsurls get`

---

### `restart`

**GET** `/api/v1/browser/restart`

Restart browser instance

```typescript
client.browser.instances.restart(options?: { browser_id?: string; start?: boolean; chromiumVersion?: string; fingerprintId?: string; useRemoteDebuggingPort?: boolean; remoteDebuggingPort?: number; remoteDebuggingAddress?: string; extensions?: string; extensionsDir?: string; extensionsStoreIds?: string; proxyServer?: string; proxyUsername?: string; proxyPassword?: string; proxyBypass?: string; enableQuic?: boolean; enableDnsOverHttps?: boolean; dnsOverHttpsUrl?: string; display?: number | string; showBrowser?: boolean; sessionName?: string; timezoneId?: string; locale?: string; userAgent?: string; viewport?: string; noViewport?: boolean; geolocation?: string; launchArguments?: string[]; browser?: "chromium" | "firefox"; firefoxVersion?: string; firefoxExecutablePath?: string; showDevtools?: boolean; userProfile?: Record<string, unknown>; stealth?: boolean; iframe?: boolean; iframe_url?: string; maximize_new_windows?: boolean }): Promise<BrowserInstancesRestartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default: do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `GET /api/v1/browser/devtools-url` is the exception: it answers 404 when no instance is running and never consults this value. |
| `chromiumVersion` | `string` | No | query | Chromium/Chrome version selection for the instance. This option applies only when `browser=chromium`. Supported formats: - Full version: `136.0.7103.113` - Major version: `136` (mapped to a known stable patch for the current OS) - Channel tag: `stable`, `beta`, `dev`, `canary` Any other value is a `400 VALIDATION_ERROR` naming `chromiumVersion`. A full version that no download source has is a `400 VALIDATION_ERROR` too, answered once the download is refused. A major version with no known build is treated as if omitted. Omitted, the server uses the Chrome major of a `userAgent` you pass, and otherwise the Chrome build supplied with the computer: the stable build from its last successful update, so it starts without a download. It may lag the newest stable, and `browserFullVersion` in the metadata reports the version that started. If the computer has no supplied build, the server resolves the current `stable` build. Pass `stable` (or a version) to resolve it when the instance starts; a build the computer does not have is downloaded on first use. The request **blocks** until the requested browser build is available on the server. |
| `fingerprintId` | `string` | No | query | Base fingerprint profile id. The server uses the `context` and `launch` defaults of the configured fingerprint profile with this id, then applies any request overrides over them (top-level options and `userProfile` values both win over the profile). An unknown id starts with an empty profile. The id is 1-64 letters, digits, `-` or `_`; any other value is `400 VALIDATION_ERROR`. |
| `useRemoteDebuggingPort` | `boolean` | No | query | If `true`, the instance will launch Chromium with `--remote-debugging-port` and will populate `webSocketDebuggerUrl` in metadata responses. When omitted, the instance keeps its setting. |
| `remoteDebuggingPort` | `number` | No | query | Ignored. The kit always assigns the DevTools port itself (a caller-supplied value is never honoured, for isolation); read the assigned URLs from `/devtools-url` or the instance metadata. Kept only so older clients do not fail validation. |
| `remoteDebuggingAddress` | `string` | No | query | Interface address the DevTools port binds to. Connect through the URLs `/devtools-url` returns. |
| `extensions` | `string` | No | query | Comma-separated list (or JSON array string) of absolute extension directory paths to load. Extensions are Chromium only (`browser=chromium`, the default; with Firefox the start fails) and require `showBrowser=true` (headful mode); they launch a persistent profile. |
| `extensionsDir` | `string` | No | query | Directory containing extension subfolders to load (each subfolder is treated as an extension). Extensions are Chromium only (`browser=chromium`, the default; with Firefox the start fails) and require `showBrowser=true` (headful mode); they launch a persistent profile. |
| `extensionsStoreIds` | `string` | No | query | Chrome Web Store extension IDs to download and load (Chromium only). Requires `showBrowser=true` and works only with `browser=chromium`. Each ID is 32 letters from `a` to `p`; anything else, or an ID the store does not offer, is a `400 VALIDATION_ERROR`. Downloads of the same extension are serialized across instances; an instance that waits more than 5 minutes for another instance's download fails with a "try again later" error. |
| `proxyServer` | `string` | No | query | Proxy server URL (http, https, socks5, socks5h) |
| `proxyUsername` | `string` | No | query | Proxy username (if required). Only with an `http://` or `https://` `proxyServer`: the browser cannot authenticate to a SOCKS proxy, so `proxyUsername` or `proxyPassword` with a `socks4://` or `socks5://` proxy (and `socks5h://` under Firefox) is a `400 VALIDATION_ERROR`. |
| `proxyPassword` | `string` | No | query | Proxy password (if required) |
| `proxyBypass` | `string` | No | query | Comma-separated list of hosts that should bypass the proxy |
| `enableQuic` | `boolean` | No | query | Enable QUIC/HTTP3 transport (`false` blocks QUIC). When omitted, the instance keeps its setting. |
| `enableDnsOverHttps` | `boolean` | No | query | Enable DNS-over-HTTPS for browser DNS resolution. When omitted, the instance keeps its setting. |
| `dnsOverHttpsUrl` | `string` | No | query | DoH resolver URL (HTTPS only). When omitted, the instance keeps its setting. |
| `display` | `number \| string` | No | query | X display number or identifier for headful mode. Required when `showBrowser=true` and no `DISPLAY` environment variable is set on the server. |
| `showBrowser` | `boolean` | No | query | Whether to run the browser headful (visible). When omitted, the instance keeps its setting. |
| `sessionName` | `string` | No | query | Custom session name for identifying this browser instance |
| `timezoneId` | `string` | No | query | IANA timezone identifier for browser geolocation |
| `locale` | `string` | No | query | BCP 47 language tag for browser locale |
| `userAgent` | `string` | No | query | User agent string to apply to the browser context. |
| `viewport` | `string` | No | query | Viewport configuration as JSON string. Example: {"width":1920,"height":1080,"deviceScaleFactor":1} Pass `null` to disable fixed-viewport emulation entirely: the page then follows the real browser window size (responsive; most useful in headful mode). |
| `noViewport` | `boolean` | No | query | Set to `true` to disable fixed-viewport emulation (alias for `viewport=null`). The page then resizes with the browser window instead of being pinned to an emulated resolution. Cannot be combined with a fixed `viewport` object. On a restart, `false` turns off a `noViewport=true` the instance was started with, and the default viewport comes back. When omitted, the instance keeps its setting. |
| `geolocation` | `string` | No | query | Geolocation configuration as JSON string. Example: {"latitude":40.7128,"longitude":-74.0060,"accuracy":100} Anything other than a JSON object (`null`, an array, a number) is a `400 VALIDATION_ERROR`, and so is an object without both `latitude` and `longitude` or with a negative `accuracy` (meters). |
| `launchArguments` | `string[]` | No | query | Additional Chromium/Firefox command-line arguments. Pass the query key repeatedly (`launchArguments=--a&launchArguments=--b`) or a single JSON array string (`launchArguments=["--a","--b"]`); every value is kept. Entries must be strings (400 otherwise). On Chromium, every entry must be a switch (`--name` or `--name=value`) that does not open a page: a positional URL or path and `--app` are refused, because a startup page loads before the browser's local-file block is in place. A kit started with local-file access enabled accepts them. |
| `browser` | `"chromium" \| "firefox"` | No | query | Browser engine (`chromium` or `firefox`). The raw HTTP query also accepts `chrome` as an alias of `chromium`; the SDK and the CLI accept only `chromium` and `firefox`. Fixed for the life of the instance: when omitted, the instance keeps its engine. |
| `firefoxVersion` | `string` | No | query | Firefox version label (informational only). Playwright-managed Firefox builds are used by default. If omitted, a Playwright Firefox build is downloaded on demand. A value that is not a label (letters, digits, `.`, `-` or `_`, at most 64 characters) is ignored. |
| `firefoxExecutablePath` | `string` | No | query | Absolute path to a custom Firefox executable (overrides download) |
| `showDevtools` | `boolean` | No | query | Whether to open DevTools on launch (Chromium only). When omitted, the instance keeps its setting. |
| `userProfile` | `Record&lt;string, unknown&gt;` | No | query | Optional user profile object (JSON string): `locale`, `timezoneId`, `userAgentString`, `geolocation` and `deviceProfile.viewport`. Precedence for each field: the top-level request option (`locale`, `timezoneId`, `userAgent`, `geolocation`, `viewport`) &gt; `userProfile` &gt; the fingerprint profile (`fingerprintId`, `default` when omitted) &gt; the engine default. A value set here always replaces the fingerprint profile's value. `geolocation` and `deviceProfile.viewport` must be objects and get the same checks as the top-level `geolocation` and `viewport`; a bad value is a `400 VALIDATION_ERROR` naming the field. An empty value (`null`, `false`, `0`, `""`) is treated as not set. |
| `stealth` | `boolean` | No | query | Launch Chromium in stealth mode using Patchright (anti-detection patches). Only applies to `browser=chromium`. Ignored for Firefox. When omitted, the instance keeps its setting. Bare `?stealth` is treated as `true`. |
| `iframe` | `boolean` | No | query | The bare `/` URL serves the instance status page. Open `/?view=display` for the full-page display; if no display address can be resolved, the status page is returned. When omitted, the instance keeps its setting. |
| `iframe_url` | `string` | No | query | Explicit URL for the display iframe. |
| `maximize_new_windows` | `boolean` | No | query | Control the `maximize_new_windows` flag stamped onto the generated display URL (always explicit `true`/`false`); when true the hoody-display client opens new top-level app windows maximized. When omitted, the instance keeps its setting. |

**Returns:** `BrowserInstancesRestartResponse`

**CLI:** `hoody browser restart`

---

### `shutdown`

**GET** `/api/v1/browser/shutdown`

Shutdown browser instance

```typescript
client.browser.instances.shutdown(options?: { browser_id?: string }): Promise<BrowserInstancesShutdownResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |

**Returns:** `BrowserInstancesShutdownResponse`

**CLI:** `hoody browser shutdown`

---

### `start`

**GET** `/api/v1/browser/start`

Create or retrieve browser instance

```typescript
client.browser.instances.start(options?: { browser_id?: string; chromiumVersion?: string; fingerprintId?: string; useRemoteDebuggingPort?: boolean; remoteDebuggingPort?: number; remoteDebuggingAddress?: string; extensions?: string; extensionsDir?: string; extensionsStoreIds?: string; proxyServer?: string; proxyUsername?: string; proxyPassword?: string; proxyBypass?: string; enableQuic?: boolean; enableDnsOverHttps?: boolean; dnsOverHttpsUrl?: string; display?: number | string; showBrowser?: boolean; sessionName?: string; timezoneId?: string; locale?: string; userAgent?: string; viewport?: string; noViewport?: boolean; geolocation?: string; launchArguments?: string[]; browser?: "chromium" | "firefox"; firefoxVersion?: string; firefoxExecutablePath?: string; showDevtools?: boolean; userProfile?: Record<string, unknown>; stealth?: boolean; iframe?: boolean; iframe_url?: string; maximize_new_windows?: boolean }): Promise<BrowserInstancesStartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `chromiumVersion` | `string` | No | query | Chromium/Chrome version selection for the instance. This option applies only when `browser=chromium`. Supported formats: - Full version: `136.0.7103.113` - Major version: `136` (mapped to a known stable patch for the current OS) - Channel tag: `stable`, `beta`, `dev`, `canary` Any other value is a `400 VALIDATION_ERROR` naming `chromiumVersion`. A full version that no download source has is a `400 VALIDATION_ERROR` too, answered once the download is refused. A major version with no known build is treated as if omitted. Omitted, the server uses the Chrome major of a `userAgent` you pass, and otherwise the Chrome build supplied with the computer: the stable build from its last successful update, so it starts without a download. It may lag the newest stable, and `browserFullVersion` in the metadata reports the version that started. If the computer has no supplied build, the server resolves the current `stable` build. Pass `stable` (or a version) to resolve it when the instance starts; a build the computer does not have is downloaded on first use. The request **blocks** until the requested browser build is available on the server. |
| `fingerprintId` | `string` | No | query | Base fingerprint profile id. The server uses the `context` and `launch` defaults of the configured fingerprint profile with this id, then applies any request overrides over them (top-level options and `userProfile` values both win over the profile). An unknown id starts with an empty profile. The id is 1-64 letters, digits, `-` or `_`; any other value is `400 VALIDATION_ERROR`. |
| `useRemoteDebuggingPort` | `boolean` | No | query | If `true`, the instance will launch Chromium with `--remote-debugging-port` and will populate `webSocketDebuggerUrl` in metadata responses. |
| `remoteDebuggingPort` | `number` | No | query | Ignored. The kit always assigns the DevTools port itself (a caller-supplied value is never honoured, for isolation); read the assigned URLs from `/devtools-url` or the instance metadata. Kept only so older clients do not fail validation. |
| `remoteDebuggingAddress` | `string` | No | query | Interface address the DevTools port binds to. Connect through the URLs `/devtools-url` returns. |
| `extensions` | `string` | No | query | Comma-separated list (or JSON array string) of absolute extension directory paths to load. Extensions are Chromium only (`browser=chromium`, the default; with Firefox the start fails) and require `showBrowser=true` (headful mode); they launch a persistent profile. |
| `extensionsDir` | `string` | No | query | Directory containing extension subfolders to load (each subfolder is treated as an extension). Extensions are Chromium only (`browser=chromium`, the default; with Firefox the start fails) and require `showBrowser=true` (headful mode); they launch a persistent profile. |
| `extensionsStoreIds` | `string` | No | query | Comma-separated list (or JSON array string) of Chrome Web Store extension IDs to download and load. Requires `showBrowser=true` and works only with `browser=chromium`. Each ID is 32 letters from `a` to `p`; anything else, or an ID the store does not offer, is a `400 VALIDATION_ERROR`. Downloads of the same extension are serialized across instances; an instance that waits more than 5 minutes for another instance's download fails with a "try again later" error. |
| `proxyServer` | `string` | No | query | Proxy server for browser traffic. Supports `http://`, `https://`, `socks5://`, or `socks5h://`. Example: `socks5://127.0.0.1:9050` |
| `proxyUsername` | `string` | No | query | Proxy username (if required). Only with an `http://` or `https://` `proxyServer`: the browser cannot authenticate to a SOCKS proxy, so `proxyUsername` or `proxyPassword` with a `socks4://` or `socks5://` proxy (and `socks5h://` under Firefox) is a `400 VALIDATION_ERROR`. |
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
| `viewport` | `string` | No | query | Viewport configuration as JSON string. Example: {"width":1920,"height":1080,"deviceScaleFactor":1} Pass `null` to disable fixed-viewport emulation entirely: the page then follows the real browser window size (responsive; most useful in headful mode). |
| `noViewport` | `boolean` | No | query | Set to `true` to disable fixed-viewport emulation (alias for `viewport=null`). The page then resizes with the browser window instead of being pinned to an emulated resolution. Cannot be combined with a fixed `viewport` object. |
| `geolocation` | `string` | No | query | Geolocation configuration as JSON string. Example: {"latitude":40.7128,"longitude":-74.0060,"accuracy":100} Anything other than a JSON object (`null`, an array, a number) is a `400 VALIDATION_ERROR`, and so is an object without both `latitude` and `longitude` or with a negative `accuracy` (meters). |
| `launchArguments` | `string[]` | No | query | Additional Chromium/Firefox command-line arguments. Pass the query key repeatedly (`launchArguments=--a&launchArguments=--b`) or a single JSON array string (`launchArguments=["--a","--b"]`); every value is kept. Entries must be strings (400 otherwise). On Chromium, every entry must be a switch (`--name` or `--name=value`) that does not open a page: a positional URL or path and `--app` are refused, because a startup page loads before the browser's local-file block is in place. A kit started with local-file access enabled accepts them. |
| `browser` | `"chromium" \| "firefox"` | No | query | Browser engine to use (`chromium` or `firefox`). The raw HTTP query also accepts `chrome` as an alias of `chromium`; the SDK and the CLI accept only `chromium` and `firefox`. Fixed for the life of the instance. |
| `firefoxVersion` | `string` | No | query | Firefox version label (informational only). Playwright-managed Firefox builds are used by default. If omitted, a Playwright Firefox build is downloaded on demand. A value that is not a label (letters, digits, `.`, `-` or `_`, at most 64 characters) is ignored. |
| `firefoxExecutablePath` | `string` | No | query | Absolute path to a custom Firefox executable (overrides download) |
| `showDevtools` | `boolean` | No | query | Whether to open DevTools on launch (Chromium only) |
| `userProfile` | `Record&lt;string, unknown&gt;` | No | query | Optional user profile object (JSON string): `locale`, `timezoneId`, `userAgentString`, `geolocation` and `deviceProfile.viewport`. Precedence for each field: the top-level request option (`locale`, `timezoneId`, `userAgent`, `geolocation`, `viewport`) &gt; `userProfile` &gt; the fingerprint profile (`fingerprintId`, `default` when omitted) &gt; the engine default. A value set here always replaces the fingerprint profile's value. `geolocation` and `deviceProfile.viewport` must be objects and get the same checks as the top-level `geolocation` and `viewport`; a bad value is a `400 VALIDATION_ERROR` naming the field. An empty value (`null`, `false`, `0`, `""`) is treated as not set. |
| `stealth` | `boolean` | No | query | Launch Chromium in stealth mode using Patchright (anti-detection patches). Only applies to `browser=chromium`. Ignored for Firefox. Defaults to `true`. Bare `?stealth` is treated as `true`. |
| `iframe` | `boolean` | No | query | The bare `/` URL serves the instance status page. Open `/?view=display` for the full-page display; if no display address can be resolved, the status page is returned. |
| `iframe_url` | `string` | No | query | Explicit URL for the display iframe. If not provided, the URL is auto-detected from the Host header subdomain pattern. |
| `maximize_new_windows` | `boolean` | No | query | Control the `maximize_new_windows` flag stamped onto generated display URLs (iframe pages, status pages, `iframe_url` metadata). The flag is always explicit (`true` or `false`); when true the hoody-display client opens new top-level app windows maximized. Enabled by default; set to `false` to keep the display client's centered default-size placement (the explicit `false` also overrides a display-side `default-settings.txt` enable). Explicit `iframe_url` values are never modified. |

**Returns:** `BrowserInstancesStartResponse`

**CLI:** `hoody browser start`

---

### `stop`

**GET** `/api/v1/browser/stop`

Stop browser instance

```typescript
client.browser.instances.stop(options?: { browser_id?: string }): Promise<BrowserInstancesStopResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |

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

**GET** `/api/v1/browser/metrics`

Server metrics

```typescript
client.browser.kit.getStats(): Promise<BrowserKitGetStatsResponse>
```

**Returns:** `BrowserKitGetStatsResponse`

**CLI:** `hoody browser stats`

---

## `client.browser.logs` (2 methods)

### `listConsole`

**GET** `/api/v1/browser/console`

Get console logs

```typescript
client.browser.logs.listConsole(options?: { browser_id?: string; tabId?: number; start?: boolean; type?: string; since?: string; clear?: boolean }): Promise<BrowserLogsListConsoleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `tabId` | `number` | No | query | The ID of an open tab, from `/tabs`; tab ids start at 1. Omitted: all tabs for `/console` and `/network`; a new tab for `/browse`, unless `onlyIfNotExists=true` finds a tab already showing the URL; the active tab for other tab operations. Supplied: exactly that tab. An unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default: do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `GET /api/v1/browser/devtools-url` is the exception: it answers 404 when no instance is running and never consults this value. |
| `type` | `string` | No | query | Filter by message type (log, error, warning, info, etc.). Repeating this key in the query string is a `400 VALIDATION_ERROR` (`type must not be repeated`). |
| `since` | `string` | No | query | Only return entries at or after this time: an ISO 8601 date or date-time, like `2026-10-05T12:00:00Z`. Omitted or empty means no time filter. Any other value (an epoch number, a word like `yesterday`) is a `400 VALIDATION_ERROR` naming `since`, never an unfiltered list. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`since must not be repeated`). |
| `clear` | `boolean` | No | query | Clear the buffer after reading. `true` clears it; `false`, an empty value or omitting it leaves it. Any other value is a `400 VALIDATION_ERROR` naming `clear`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`clear must not be repeated`). |

**Returns:** `BrowserLogsListConsoleResponse`

**CLI:** `hoody browser logs console list`

---

### `listNetwork`

**GET** `/api/v1/browser/network`

Get network logs

```typescript
client.browser.logs.listNetwork(options?: { browser_id?: string; tabId?: number; start?: boolean; since?: string; clear?: boolean }): Promise<BrowserLogsListNetworkResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `tabId` | `number` | No | query | The ID of an open tab, from `/tabs`; tab ids start at 1. Omitted: all tabs for `/console` and `/network`; a new tab for `/browse`, unless `onlyIfNotExists=true` finds a tab already showing the URL; the active tab for other tab operations. Supplied: exactly that tab. An unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default: do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `GET /api/v1/browser/devtools-url` is the exception: it answers 404 when no instance is running and never consults this value. |
| `since` | `string` | No | query | Only return entries at or after this time: an ISO 8601 date or date-time, like `2026-10-05T12:00:00Z`. Omitted or empty means no time filter. Any other value (an epoch number, a word like `yesterday`) is a `400 VALIDATION_ERROR` naming `since`, never an unfiltered list. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`since must not be repeated`). |
| `clear` | `boolean` | No | query | Clear the buffer after reading. `true` clears it; `false`, an empty value or omitting it leaves it. Any other value is a `400 VALIDATION_ERROR` naming `clear`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`clear must not be repeated`). |

**Returns:** `BrowserLogsListNetworkResponse`

**CLI:** `hoody browser logs network list`

---

## `client.browser.page` (10 methods)

### `act`

**POST** `/api/v1/browser/action`

Perform a native element action

```typescript
client.browser.page.act(data: BrowserPageActRequest, options?: { browser_id?: string }): Promise<BrowserPageActResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `BrowserPageActRequest` | Yes | body |  |
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |

**Returns:** `BrowserPageActResponse`

**CLI:** `hoody browser act`

---

### `captureScreenshot`

**GET** `/api/v1/browser/screenshot`

Capture browser screenshot

```typescript
client.browser.page.captureScreenshot(options?: { browser_id?: string; start?: boolean; url?: string; tabId?: number; format?: "png" | "jpeg" | "base64"; quality?: number; fullPage?: boolean; selector?: string; clip?: string; mask?: string; maskColor?: string; hide?: string; scale?: "device" | "css" }): Promise<ApiResponse<ArrayBuffer> | BrowserPageCaptureScreenshotResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default: do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `GET /api/v1/browser/devtools-url` is the exception: it answers 404 when no instance is running and never consults this value. |
| `url` | `string` | No | query | The URL to navigate to. Repeating this key IN THE QUERY STRING is a `400 VALIDATION_ERROR` (`url must not be repeated`), on GET and on POST alike: a request naming two destinations is answered rather than silently resolved to one of them. The rule is about the query string only: a JSON body property named `url` is governed by the body schema. Only an absolute `http`, `https` or `data` URL, `about:blank`, or (on Chromium engines only) a `chrome:` URL is accepted. Any other scheme (`file:` in any spelling unless the kit was started with local-file access enabled, `view-source:`, `javascript:`, `blob:` and the rest) is a `400 VALIDATION_ERROR` (`url must be an http, https or data URL, about:blank, or a chrome URL on Chromium; file and other local schemes are refused`), and a value that is not an absolute URL (such as `/etc/hostname`) is a `400 VALIDATION_ERROR` (`url must be an absolute URL, like https://example.com/`). Every other `about:` page is refused (Firefox's `about:reader?url=file:…` loads a local file), and `chrome:` is refused on Firefox, where it is the browser's own privileged UI. A value that is not a string is `url must be a string`. The `url` is checked before an instance is started, a tab is looked up, created or reused, or anything is navigated, and before `/pdf`'s `501 NOT_SUPPORTED`. On `/screenshot` and `/pdf` a supplied but empty `url=` is a `400 VALIDATION_ERROR` too (omit `url` to capture the current tab). The browser itself blocks local files as well (see "Local files" in the API overview). |
| `tabId` | `number` | No | query | The ID of an open tab, from `/tabs`; tab ids start at 1. Omitted: all tabs for `/console` and `/network`; a new tab for `/browse`, unless `onlyIfNotExists=true` finds a tab already showing the URL; the active tab for other tab operations. Supplied: exactly that tab. An unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema. |
| `format` | `"png" \| "jpeg" \| "base64"` | No | query | Output format: `png` (default) and `jpeg` answer the image bytes; `base64` answers JSON with the PNG bytes base64-encoded. Any other value is a `400 VALIDATION_ERROR` naming `format`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`format must not be repeated`). |
| `quality` | `number` | No | query | Image quality for JPEG format (0-100); not used for `png` or `base64`. A value that is not an integer from 0 to 100 is a `400 VALIDATION_ERROR` naming `quality`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`quality must not be repeated`). |
| `fullPage` | `boolean` | No | query | Capture the entire scrollable page. `true` or `false`; any other value is a `400 VALIDATION_ERROR` naming `fullPage`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`fullPage must not be repeated`). |
| `selector` | `string` | No | query | Capture only the first element matching this CSS selector, at its own size; the page is scrolled to bring it into view. One CSS selector, at most 4096 characters (a selector list such as `.a, .b` is one). `&gt;&gt;` chaining, braces, comments, Playwright's own pseudo-classes (`:visible`, `:has-text()`, `:text()` and the like, also escaped; the same text inside a quoted value or an escaped name is fine), an empty value (`selector=`; omit the key instead), and a selector that the page's CSS parser or the engine's selector parser does not accept are each a `400 VALIDATION_ERROR` naming `selector`. No match is `404 ELEMENT_NOT_FOUND`, and a match that is not visible (hidden, or with no size) or that `hide` covers (itself or anything it is rendered inside: an ancestor, a slot, a shadow host) is `422 ELEMENT_NOT_VISIBLE`, both at once rather than after the capture timeout. Cannot be combined with `clip` or `fullPage=true` (`400 VALIDATION_ERROR`). Repeating this key in the query string is a `400 VALIDATION_ERROR` (`selector must not be repeated`). |
| `clip` | `string` | No | query | Capture one area: `x,y,width,height` in CSS pixels from the page's top-left corner, for example `0,0,800,600`. `x` and `y` from 0 to 1000000, `width` and `height` above 0 and at most 16384; an empty `clip=` is refused too. With `fullPage=true` the area is measured on the whole page, otherwise on the viewport, and it is cut to what is there; an area entirely outside is a `400 VALIDATION_ERROR` naming `clip`, and so is a malformed value. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`clip must not be repeated`). |
| `mask` | `string` | No | query | Paint over every element matching this CSS selector with an opaque box in `maskColor`: in the top page and its open shadow roots, not inside iframes. A selector list such as `.cookie-banner, .ad` covers several. This is the option for keeping private data out of an image. A selector that matches nothing covers nothing and the capture still succeeds, so check it against the page first (for example with /snapshot) when the cover matters. One CSS selector, at most 4096 characters (a selector list such as `.a, .b` is one). `&gt;&gt;` chaining, braces, comments, Playwright's own pseudo-classes (`:visible`, `:has-text()`, `:text()` and the like, also escaped; the same text inside a quoted value or an escaped name is fine), an empty value (`mask=`; omit the key instead), and a selector that the page's CSS parser or the engine's selector parser does not accept are each a `400 VALIDATION_ERROR` naming `mask`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`mask must not be repeated`). |
| `maskColor` | `string` | No | query | The colour of the `mask` boxes, as an opaque hex colour: `#RGB` or `#RRGGBB` (a colour with alpha, which would let the covered content show through, is refused). Default `#FF00FF` (pink). Any other value, an empty one, or `maskColor` without `mask`, is a `400 VALIDATION_ERROR` naming `maskColor`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`maskColor must not be repeated`). |
| `hide` | `string` | No | query | Leave out every element matching this CSS selector: a style rule (`visibility: hidden; opacity: 0`, both `!important`) is added to the page, every iframe and every open shadow root for the capture only and removed after it, so matches keep their space and are not painted, children included (except a child that sets `visibility: visible` inside a `display: contents` match, which has no box of its own to fade). It is a style rule, not a cover: a declaration the page itself marks `!important` in an element's `style` attribute wins over it, and a selector that matches nothing hides nothing while the capture still succeeds. To keep private data out of an image, use `mask`. One CSS selector, at most 4096 characters (a selector list such as `.a, .b` is one). `&gt;&gt;` chaining, braces, comments, Playwright's own pseudo-classes (`:visible`, `:has-text()`, `:text()` and the like, also escaped; the same text inside a quoted value or an escaped name is fine), an empty value (`hide=`; omit the key instead), and a selector that the page's CSS parser or the engine's selector parser does not accept are each a `400 VALIDATION_ERROR` naming `hide`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`hide must not be repeated`). |
| `scale` | `"device" \| "css"` | No | query | `device` (default, also when `scale` is empty): one image pixel per device pixel, so a page with `devicePixelRatio` 2 gives an image twice its CSS size. `css`: one image pixel per CSS pixel. Any other non-empty value is a `400 VALIDATION_ERROR` naming `scale`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`scale must not be repeated`). |

**Returns:** `ApiResponse<ArrayBuffer> | BrowserPageCaptureScreenshotResponse`

**CLI:** `hoody browser screenshots capture`

---

### `evaluate`

**POST** `/api/v1/browser/eval`

Execute JavaScript (POST)

```typescript
client.browser.page.evaluate(data: BrowserPageEvaluateRequest, options?: { browser_id?: string; start?: boolean }): Promise<BrowserPageEvaluateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `BrowserPageEvaluateRequest` | Yes | body |  |
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default: do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `GET /api/v1/browser/devtools-url` is the exception: it answers 404 when no instance is running and never consults this value. |

**Returns:** `BrowserPageEvaluateResponse`

**CLI:** `hoody browser evaluate`

---

### `exportPdf`

**GET** `/api/v1/browser/pdf`

Export page as PDF

```typescript
client.browser.page.exportPdf(options?: { browser_id?: string; tabId?: number; start?: boolean; url?: string; format?: string; landscape?: boolean; printBackground?: boolean; margin?: string }): Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `tabId` | `number` | No | query | The ID of an open tab, from `/tabs`; tab ids start at 1. Omitted: all tabs for `/console` and `/network`; a new tab for `/browse`, unless `onlyIfNotExists=true` finds a tab already showing the URL; the active tab for other tab operations. Supplied: exactly that tab. An unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default: do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `GET /api/v1/browser/devtools-url` is the exception: it answers 404 when no instance is running and never consults this value. |
| `url` | `string` | No | query | Optional URL to navigate to before generating the PDF. Only an absolute `http`, `https` or `data` URL, `about:blank`, or (on Chromium engines only) a `chrome:` URL is accepted. Any other scheme (`file:` in any spelling unless the kit was started with local-file access enabled, `view-source:`, `javascript:`, `blob:` and the rest) is a `400 VALIDATION_ERROR` (`url must be an http, https or data URL, about:blank, or a chrome URL on Chromium; file and other local schemes are refused`), and a value that is not an absolute URL (such as `/etc/hostname`) is a `400 VALIDATION_ERROR` (`url must be an absolute URL, like https://example.com/`). Every other `about:` page is refused (Firefox's `about:reader?url=file:…` loads a local file), and `chrome:` is refused on Firefox, where it is the browser's own privileged UI. A value that is not a string is `url must be a string`. The `url` is checked before an instance is started, a tab is looked up, created or reused, or anything is navigated, and before `/pdf`'s `501 NOT_SUPPORTED`. On `/screenshot` and `/pdf` a supplied but empty `url=` is a `400 VALIDATION_ERROR` too (omit `url` to capture the current tab). The browser itself blocks local files as well (see "Local files" in the API overview). Repeating this key in the query string is a `400 VALIDATION_ERROR` (`url must not be repeated`): the server's rule is on the key, not on the operation, so it applies here too even though this parameter is declared inline rather than shared. |
| `format` | `string` | No | query | Paper format: one of Letter, Legal, Tabloid, Ledger, A0, A1, A2, A3, A4, A5 or A6 (any letter case). Any other value is a `400 VALIDATION_ERROR` naming `format`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`format must not be repeated`). |
| `landscape` | `boolean` | No | query | Use landscape orientation. `true` or `false`; any other value is a `400 VALIDATION_ERROR` naming `landscape`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`landscape must not be repeated`). |
| `printBackground` | `boolean` | No | query | Include background graphics. `true` or `false`; any other value is a `400 VALIDATION_ERROR` naming `printBackground`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`printBackground must not be repeated`). |
| `margin` | `string` | No | query | Uniform margin: a non-negative number of pixels, or a number followed by `px`, `in`, `cm` or `mm` (e.g. '1cm', '0.5in'). Any other value is a `400 VALIDATION_ERROR` naming `margin`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`margin must not be repeated`). |

**Returns:** `ApiResponse<ArrayBuffer>`

**CLI:** `hoody browser pdf export`

---

### `getHtml`

**GET** `/api/v1/browser/html`

Get page HTML

```typescript
client.browser.page.getHtml(options?: { browser_id?: string; tabId?: number; start?: boolean }): Promise<ApiResponse<string>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `tabId` | `number` | No | query | The ID of an open tab, from `/tabs`; tab ids start at 1. Omitted: all tabs for `/console` and `/network`; a new tab for `/browse`, unless `onlyIfNotExists=true` finds a tab already showing the URL; the active tab for other tab operations. Supplied: exactly that tab. An unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default: do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `GET /api/v1/browser/devtools-url` is the exception: it answers 404 when no instance is running and never consults this value. |

**Returns:** `ApiResponse<string>`

**CLI:** `hoody browser html get`

---

### `getMarkdown`

**GET** `/api/v1/browser/markdown`

Get page as Markdown

```typescript
client.browser.page.getMarkdown(options?: { browser_id?: string; tabId?: number; start?: boolean; url?: string; onlyMainContent?: boolean; includeImages?: boolean; includeLinks?: boolean; frontmatter?: boolean; maxChars?: number }): Promise<BrowserPageGetMarkdownResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `tabId` | `number` | No | query | The ID of an open tab, from `/tabs`; tab ids start at 1. Omitted: all tabs for `/console` and `/network`; a new tab for `/browse`, unless `onlyIfNotExists=true` finds a tab already showing the URL; the active tab for other tab operations. Supplied: exactly that tab. An unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default: do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `GET /api/v1/browser/devtools-url` is the exception: it answers 404 when no instance is running and never consults this value. |
| `url` | `string` | No | query | Optional URL to navigate the tab to before reading it. Only an absolute `http`, `https` or `data` URL, `about:blank`, or (on Chromium engines only) a `chrome:` URL is accepted. Any other scheme (`file:` in any spelling unless the kit was started with local-file access enabled, `view-source:`, `javascript:`, `blob:` and the rest) is a `400 VALIDATION_ERROR`, and so is a value that is not an absolute URL or an empty `url=` (omit `url` to read the current page). The `url` is checked before an instance is started, a tab is looked up, or anything is navigated. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`url must not be repeated`). |
| `onlyMainContent` | `boolean` | No | query | `true`: only the main content (Defuddle's extraction). `false`: the whole page body, after the same cleanup. `true` or `false`; omitted or empty uses the default. Any other value is a `400 VALIDATION_ERROR` naming `onlyMainContent`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`onlyMainContent must not be repeated`). |
| `includeImages` | `boolean` | No | query | `false` removes images from the Markdown (embeds such as YouTube videos stay). `true` or `false`; omitted or empty uses the default. Any other value is a `400 VALIDATION_ERROR` naming `includeImages`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`includeImages must not be repeated`). |
| `includeLinks` | `boolean` | No | query | `true` adds `links`: every `http`/`https` link on the page, resolved, without fragments, published like the Markdown's links, sorted and deduplicated, at most 10 000. `true` or `false`; omitted or empty uses the default. Any other value is a `400 VALIDATION_ERROR` naming `includeLinks`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`includeLinks must not be repeated`). |
| `frontmatter` | `boolean` | No | query | `true` puts a YAML frontmatter block (`title`, `author`, `site`, `published`, `language`, `description`, `source`; empty keys left out) on top of the Markdown. The block is not counted against `maxChars`. `true` or `false`; omitted or empty uses the default. Any other value is a `400 VALIDATION_ERROR` naming `frontmatter`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`frontmatter must not be repeated`). |
| `maxChars` | `number` | No | query | Longest Markdown body returned, in characters. A longer one is cut at the last line break within the limit when there is one after the first character, otherwise at the limit without splitting a surrogate pair; `truncated` is then true. Any value outside 1 to 2000000 is a `400 VALIDATION_ERROR` naming `maxChars`. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`maxChars must not be repeated`). |

**Returns:** `BrowserPageGetMarkdownResponse`

**CLI:** `hoody browser markdown get`

---

### `getSnapshot`

**GET** `/api/v1/browser/snapshot`

Accessibility snapshot of a tab with element refs

```typescript
client.browser.page.getSnapshot(options?: { browser_id?: string; instanceGeneration?: string; tabId?: number; operationTimeoutMs?: number; maxChars?: number; includeValues?: boolean }): Promise<BrowserPageGetSnapshotResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `instanceGeneration` | `string` | No | query | The instance generation from /metadata. If it no longer matches the running instance → 409 INSTANCE_CHANGED (also when no instance exists: details.expected is null). Repeating this key in the query string is a `400 VALIDATION_ERROR` (`instanceGeneration must not be repeated`); a body property of the same name is governed by the body schema. |
| `tabId` | `number` | No | query | The ID of an open tab, from `/tabs`; tab ids start at 1. Omitted: all tabs for `/console` and `/network`; a new tab for `/browse`, unless `onlyIfNotExists=true` finds a tab already showing the URL; the active tab for other tab operations. Supplied: exactly that tab. An unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema. |
| `operationTimeoutMs` | `number` | No | query | Budget for the whole browser operation, starting at handler entry (instance provisioning is never inside it). Repeating this key in the query string is a `400 VALIDATION_ERROR` (`timeoutMs must not be repeated`); a body property of the same name does not suppress that: it is governed by the body schema instead. A body that is not a JSON object at all, or that fails the operation's own validation, is rejected first, with its own message and the same status and code. |
| `maxChars` | `number` | No | query | Hard cut on a line boundary; `truncated` reports it. A truncated excerpt may not parse as standalone YAML. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`maxChars must not be repeated`). |
| `includeValues` | `boolean` | No | query | Include the CONTENTS of form controls in the snapshot. Off by default: the accessibility tree serialises `input.value`, so a snapshot taken after the agent typed a password, card number or token would hand those back on every subsequent loop iteration. With the default, the value of a non-empty textbox, searchbox, spinbutton, slider or editable combobox (an input with a `&lt;datalist&gt;`, or `role=combobox`) renders as `&lt;value hidden&gt;`, whatever its label contains; only a native `&lt;select&gt;` keeps its option names, when it holds nothing but `&lt;option&gt;`, `&lt;optgroup&gt;` and `&lt;hr&gt;` elements and none of them uses `aria-owns` or `aria-labelledby` or is editable (every other node in it keeps its role and ref but not its name or text), and the content of every other combobox, ARIA autocomplete popups and customizable selects with rich option content included, is hidden whole (an empty one renders with no value at all, so the caller can still tell them apart). Content inside an editable region (a `contenteditable` element, or a whole page in `designMode`) is hidden too: the region keeps its role and ref, its contents become `&lt;value hidden&gt;`, and its name is shown only when it is authored (`aria-label`, or `aria-labelledby` pointing at non-editable content); text the snapshot folds from an editor into an enclosing element is hidden there too. If the page cannot be asked in time, the text and computed names on such a page are hidden and the refs are kept. Set to `true` only when the values are known not to be sensitive. Omitted or empty uses the default (false); any other value than `true` or `false` is a `400 VALIDATION_ERROR`, and repeating this key in the query string is a `400 VALIDATION_ERROR` (`includeValues must not be repeated`). |

**Returns:** `BrowserPageGetSnapshotResponse`

**CLI:** `hoody browser snapshot get`

---

### `getText`

**GET** `/api/v1/browser/text`

Get page text

```typescript
client.browser.page.getText(options?: { browser_id?: string; tabId?: number; start?: boolean }): Promise<ApiResponse<string>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `tabId` | `number` | No | query | The ID of an open tab, from `/tabs`; tab ids start at 1. Omitted: all tabs for `/console` and `/network`; a new tab for `/browse`, unless `onlyIfNotExists=true` finds a tab already showing the URL; the active tab for other tab operations. Supplied: exactly that tab. An unknown id returns `404 TAB_NOT_FOUND` (with `details.openTabs`) and a malformed id `400 VALIDATION_ERROR`; the request never falls back to another tab. Repeating this key in the query string is a `400 VALIDATION_ERROR` (`tabId must not be repeated`); a body property of the same name is governed by the body schema. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default: do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `GET /api/v1/browser/devtools-url` is the exception: it answers 404 when no instance is running and never consults this value. |

**Returns:** `ApiResponse<string>`

**CLI:** `hoody browser text get`

---

### `navigate`

**POST** `/api/v1/browser/browse`

Navigate to URL (POST)

```typescript
client.browser.page.navigate(data: BrowserPageNavigateRequest, options?: { browser_id?: string; start?: boolean }): Promise<BrowserPageNavigateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `BrowserPageNavigateRequest` | Yes | body |  |
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default: do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `GET /api/v1/browser/devtools-url` is the exception: it answers 404 when no instance is running and never consults this value. |

**Returns:** `BrowserPageNavigateResponse`

**CLI:** `hoody browser navigate`

---

### `wait`

**POST** `/api/v1/browser/wait`

Wait for a condition in a tab

```typescript
client.browser.page.wait(data: BrowserPageWaitRequest, options?: { browser_id?: string }): Promise<BrowserPageWaitResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `BrowserPageWaitRequest` | Yes | body |  |
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |

**Returns:** `BrowserPageWaitResponse`

**CLI:** `hoody browser wait`

---

## `client.browser.tabs` (2 methods)

### `close`

**POST** `/api/v1/browser/tab/close`

Close a browser tab

```typescript
client.browser.tabs.close(data?: BrowserTabsCloseRequest, options?: { browser_id?: string; start?: boolean }): Promise<BrowserTabsCloseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `BrowserTabsCloseRequest` | No | body |  |
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default: do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `GET /api/v1/browser/devtools-url` is the exception: it answers 404 when no instance is running and never consults this value. |

**Returns:** `BrowserTabsCloseResponse`

**CLI:** `hoody browser tabs close`

---

### `list`

**GET** `/api/v1/browser/tabs`

List browser tabs

```typescript
client.browser.tabs.list(options?: { browser_id?: string; start?: boolean }): Promise<BrowserTabsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_id` | `string` | No | query | Selects the instance: SDK and CLI clients send the request to the `browser-&lt;N&gt;` service host. A value that conflicts with the host's instance is refused with 400 INSTANCE_SELECTOR_CONFLICT. On `/history` it also filters. Against a bare server it selects nothing; address instances there with `browser_host` + `browser_port`. |
| `start` | `boolean` | No | query | Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance. Three states, all distinct: omitted means "create one if this deployment creates instances automatically", `false` means "never create one", and `true` means "create one even where automatic creation is turned off". Because omitting it is NOT equivalent to sending `true`, this parameter deliberately declares no schema default: do not add one, and do not let a client materialise schema defaults into the request, or every call silently becomes an explicit `true`. `GET /api/v1/browser/devtools-url` is the exception: it answers 404 when no instance is running and never consults this value. |

**Returns:** `BrowserTabsListResponse`

**CLI:** `hoody browser tabs list`

---

## `client.browser.viewport` (2 methods)

### `get`

**GET** `/api/v1/browser/viewport`

Get the current viewport policy

```typescript
client.browser.viewport.get(options?: { browser_host?: string; browser_port?: number }): Promise<BrowserViewportGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `browser_host` | `string` | No | query | Instance host. Optional. Must be paired with browser_port; when both are omitted the single running instance is selected (400 AMBIGUOUS_INSTANCE with more than one). |
| `browser_port` | `number` | No | query | Instance port. Optional. Must be paired with browser_host. |

**Returns:** `BrowserViewportGetResponse`

**CLI:** `hoody browser viewport get`

---

### `set`

**POST** `/api/v1/browser/viewport`

Change the viewport at runtime

```typescript
client.browser.viewport.set(data: BrowserViewportSetRequest, options?: { browser_host?: string; browser_port?: number }): Promise<BrowserViewportSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `BrowserViewportSetRequest` | Yes | body |  |
| `browser_host` | `string` | No | query | Instance host. Optional. Must be paired with browser_port; when both are omitted the single running instance is selected (400 AMBIGUOUS_INSTANCE with more than one). |
| `browser_port` | `number` | No | query | Instance port. Optional. Must be paired with browser_host. |

**Returns:** `BrowserViewportSetResponse`

**CLI:** `hoody browser viewport set`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
