# `code` — 10 methods

**Version:** 1.0.0-beta.15
**Accessor:** `client.code`

```typescript
import * as code from 'hoody-sdk/code';
```

---

## `client.code.extensions` (2 methods)

### `install`

**POST** `/api/v1/code/extensions/install`

Stage a VS Code extension from a URL

```typescript
client.code.extensions.install(data: CodeExtensionsInstallRequest, options?: { id: number; cache?: boolean | number }): Promise<CodeExtensionsInstallResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `CodeExtensionsInstallRequest` | Yes | body |  |
| `id` | `number` | Yes | query | Which instance this request is about. Required here, unlike on `GET /api/v1/code`. That operation has a discovery branch to fall back to when no selector is given; this one does not, so a request without an `id` has named no instance and is rejected rather than defaulted to a first one. The value is read exactly as strictly as the selector on `GET /api/v1/code`: an unsigned decimal integer, under the literal name `id` only, never given more than once, and at most `65535 - basePort`. See that operation for the full rules. ## Where it comes from On a `code-N` service URL the platform's edge proxy sets it from the hostname, so a caller behind the edge neither sends it nor can override it, and the generated clients leave it out of the query for exactly that reason. Supply it yourself only when addressing the orchestrator directly, which is the case this being required describes: there is no discovery branch here to fall back to, so a request that reaches the orchestrator without an `id` has named no instance and is answered `400`. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `CodeExtensionsInstallResponse`

**CLI:** `hoody code extensions install`

---

### `list`

**GET** `/api/v1/code/extensions/list`

Staged extensions, and what the instance appears to have installed

```typescript
client.code.extensions.list(options?: { id: number; cache?: boolean | number }): Promise<CodeExtensionsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `number` | Yes | query | Which instance this request is about. Required here, unlike on `GET /api/v1/code`. That operation has a discovery branch to fall back to when no selector is given; this one does not, so a request without an `id` has named no instance and is rejected rather than defaulted to a first one. The value is read exactly as strictly as the selector on `GET /api/v1/code`: an unsigned decimal integer, under the literal name `id` only, never given more than once, and at most `65535 - basePort`. See that operation for the full rules. ## Where it comes from On a `code-N` service URL the platform's edge proxy sets it from the hostname, so a caller behind the edge neither sends it nor can override it, and the generated clients leave it out of the query for exactly that reason. Supply it yourself only when addressing the orchestrator directly, which is the case this being required describes: there is no discovery branch here to fall back to, so a request that reaches the orchestrator without an `id` has named no instance and is answered `400`. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `CodeExtensionsListResponse`

**CLI:** `hoody code extensions list`

---

## `client.code.kit` (3 methods)

### `getHealth`

**GET** `/api/v1/code/health`

Service health check

```typescript
client.code.kit.getHealth(): Promise<CodeKitGetHealthResponse>
```

**Returns:** `CodeKitGetHealthResponse`

**CLI:** `hoody code health`

---

### `getStatus`

**GET** `/status`

Get orchestrator and instance status

```typescript
client.code.kit.getStatus(): Promise<CodeKitGetStatusResponse>
```

**Returns:** `CodeKitGetStatusResponse`

**CLI:** `hoody code status`

---

### `getVersion`

**GET** `/api/v1/code/version`

Versions of the running orchestrator and its packaged editor

```typescript
client.code.kit.getVersion(): Promise<CodeKitGetVersionResponse>
```

**Returns:** `CodeKitGetVersionResponse`

**CLI:** `hoody code version`

---

## `client.code.ui` (5 methods)

### `getFavicon`

**GET** `/favicon.ico`

Site icon

```typescript
client.code.ui.getFavicon(): Promise<ApiResponse<ArrayBuffer>>
```

**Returns:** `ApiResponse<ArrayBuffer>`

---

### `getManifest`

**GET** `/api/v1/code/manifest.json`

Web application manifest for installing the editor

```typescript
client.code.ui.getManifest(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

---

### `getPage`

**GET** `/api/v1/code`

Open the editor (canonical kit path)

```typescript
client.code.ui.getPage(options?: { folder?: string; id?: number; extension?: string; restart?: boolean; pageLoader?: boolean; disableWalkthroughs?: boolean; hoodyCode?: boolean; welcomeIframeUrl?: string; pageLoaderPath?: string; proxyDomain?: string; locale?: string; appName?: string; cache?: boolean | number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `folder` | `string` | No | query | Absolute path to the folder to open in the instance. Supply it together with `id` to open an editor. Omit both, or send both with empty values, to retrieve this specification. The path is normalised before use. A `..` segment is resolved away rather than rejected, and a relative path is resolved against the orchestrator's own working directory, so the folder that opens may differ from the string sent. Send an absolute, already normalised path. An empty value counts as not sent. On its own it produces the discovery response rather than an error; alongside a non-empty `id` it is rejected with `400`. ## Switching folders reuses the running instance A later request naming the same `id` and a different `folder` is answered from the running instance, and the page it returns loads the editor on the folder this request names. No restart is needed. The instance keeps the folder it was started with as its own: that is the folder the status endpoint reports. `restart` is optional here. It kills and respawns the instance, ending its running sessions, and applies the parameters of the request that carries it. |
| `id` | `number` | No | query | Instance selector. Supply it together with `folder` to open an editor. Omit both, or send both with empty values, to retrieve this specification. It determines: - TCP port: `basePort + id` - Data directory: `dataDir/instances/{id}/` - Unique isolation per ID ## Upper bound The instance binds `basePort + id`, so the largest accepted value is `65535 - basePort`, not a fixed number. `basePort` is part of this deployment's configuration and is reported as `orchestrator.basePort` by `/status`. With a base port of 7000, for example, ids above 58535 are rejected. A rejection names the limit and the base port in use. ## How the value is read The selector decides which instance a request reaches, so it is read strictly rather than leniently. - The value must be an unsigned decimal integer. A sign, a decimal point, surrounding whitespace, hexadecimal notation or any trailing character is rejected, so `+2`, `2.0`, ` 2`, `0x2` and `2abc` are not accepted as `2`. - Only the exact name `id` is read. Bracket spellings such as `id[]` and `id[0]` are different names: they are ignored rather than merged into this parameter, and a request carrying only those has supplied no selector. - Sending `id` more than once is rejected outright rather than resolved to one of the values. A percent-encoded spelling of the same name counts as a repeat. Repeats whose values are all empty are the exception: with no non-empty `folder` alongside them they count as no selector at all and the request takes the discovery branch. Alongside a non-empty `folder` they are still a repeat and are rejected. - The query string carrying the selector is limited in size. See "Query size limit" in this operation's description. |
| `extension` | `string` | No | query | Extension identifier to open in extension-only mode (embedded extension) Format: `PUBLISHER.NAME` (e.g., `ms-python.python`) This parameter is: - **Preserved** in the iframe URL for VS Code to consume - **NOT forwarded** to the child CLI arguments When present, VS Code will: - Hide the file explorer - Focus on the extension's UI - Display only that extension's views and commands |
| `restart` | `boolean` | No | query | Force restart the instance before rendering. Accepted truthy values: `true`, `1`, `yes`, `on` If the instance is running and restart is explicitly true: 1. The instance is killed 2. A new instance is spawned 3. The iframe is rendered with the new instance Note: Missing or empty parameter does NOT trigger restart. |
| `pageLoader` | `boolean` | No | query | Enable/disable the page loader overlay in the child instance. Boolean flag (passed to child without value): - Truthy: `true`, `1`, `yes`, `on`, or empty string - Falsy: `false`, `0`, `no`, `off`, or omitted When enabled, child shows loading overlay during initialization. |
| `disableWalkthroughs` | `boolean` | No | query | Disable VS Code walkthrough functionality in the child instance. Boolean flag (passed to child without value). Default in orchestrator: true (walkthroughs disabled by default) |
| `hoodyCode` | `boolean` | No | query | Enable/disable loading of Hoody Code injected scripts (extra/injected/*.js). Boolean flag (passed to child without value). When enabled, all .js files in extra/injected/ are loaded after page load. |
| `welcomeIframeUrl` | `string` | No | query | URL for custom welcome page iframe. Passed to child as `--welcome-iframe-url &lt;url&gt;`. Replaces the default Welcome (Getting Started) page with a fullscreen iframe. |
| `pageLoaderPath` | `string` | No | query | Path to the loading page the instance serves while it starts. Passed to child as `--page-loader-path &lt;path&gt;`. It is read by the instance, so the path is resolved on the container's filesystem and not on the caller's. It has no effect unless `page-loader` is also enabled. |
| `proxyDomain` | `string` | No | query | Domain pattern for port proxying. Automatically computed from request Host header: - `&lt;proj&gt;-&lt;cont&gt;-ui.&lt;domain&gt;` → `&lt;proj&gt;-&lt;cont&gt;-http-{{port}}.&lt;domain&gt;` - Passed to child as `--proxy-domain &lt;pattern&gt;` Manual override: `--proxy-domain custom-{{port}}.example.com` |
| `locale` | `string` | No | query | Display language for VS Code UI. Format: IETF language tag (e.g., en, fr, de, ja, zh-CN). Passed to child as `--locale &lt;tag&gt;`. |
| `appName` | `string` | No | query | Custom application name displayed in the VS Code title bar and branding. Passed to child as `--app-name &lt;name&gt;`. Replaces `{{app}}` placeholders in templates. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<unknown>`

---

### `getRobots`

**GET** `/robots.txt`

Crawler policy

```typescript
client.code.ui.getRobots(): Promise<ApiResponse<string>>
```

**Returns:** `ApiResponse<string>`

---

### `getSecurityPolicy`

**GET** `/security.txt`

Security contact information

```typescript
client.code.ui.getSecurityPolicy(): Promise<ApiResponse<string>>
```

**Returns:** `ApiResponse<string>`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
