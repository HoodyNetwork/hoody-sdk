# `code` — 19 methods

**Version:** 1.0.0-beta.10
**Accessor:** `client.code`

```typescript
import * as code from 'hoody-sdk/code';
```

---

## `client.code.auth` (3 methods)

### `getLoginPage`

**GET** `/api/v1/code/login`

Get login page

```typescript
client.code.auth.getLoginPage(options?: { to?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `to` | `string` | No | query | URL to redirect to after successful login |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody code auth login`

---

### `login`

**POST** `/api/v1/code/login`

Submit login credentials

```typescript
client.code.auth.login(data: object, options?: { to?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `object` | Yes | body |  |
| `to` | `string` | No | query | URL to redirect to after successful login |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody code auth submit`

---

### `logout`

**GET** `/api/v1/code/logout`

Logout

```typescript
client.code.auth.logout(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody code auth logout`

---

## `client.code.extensions` (4 methods)

### `install`

**POST** `/api/v1/code/extensions/install`

Install VS Code extension from URL

```typescript
client.code.extensions.install(data: CodeExtensionsInstallRequest): Promise<CodeExtensionsInstallResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `CodeExtensionsInstallRequest` | Yes | body |  |

**Returns:** `CodeExtensionsInstallResponse`

**CLI:** `hoody code extensions install`

---

### `list`

**GET** `/api/v1/code/extensions/list`

List installed extensions

```typescript
client.code.extensions.list(): Promise<CodeExtensionsListResponse>
```

**Returns:** `CodeExtensionsListResponse`

**CLI:** `hoody code extensions list`

---

### `listAll`

**GET** `/api/v1/code/extensions/list`

List installed extensions (collect all pages)

```typescript
client.code.extensions.listAll(): Promise<unknown[]>
```

**Returns:** `unknown[]`

**CLI:** `hoody code extensions list`

---

### `listIterator`

**GET** `/api/v1/code/extensions/list`

List installed extensions (async iterator)

```typescript
client.code.extensions.listIterator(): AsyncIterableIterator<unknown>
```

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody code extensions list`

---

## `client.code.health` (2 methods)

### `check`

**GET** `/api/v1/code/health`

Service health check

```typescript
client.code.health.check(): Promise<CodeHealthCheckResponse>
```

**Returns:** `CodeHealthCheckResponse`

**CLI:** `hoody code health`

---

### `checkUpdate`

**GET** `/api/v1/code/update/check`

Check for updates

```typescript
client.code.health.checkUpdate(): Promise<CodeHealthCheckUpdateResponse>
```

**Returns:** `CodeHealthCheckUpdateResponse`

**CLI:** `hoody code check-update`

---

## `client.code.proxy` (2 methods)

### `resolve`

**GET** `/api/v1/code/proxy/{port}/{path}`

Proxy to local port (path-based)

```typescript
client.code.proxy.resolve(port: number, path?: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `port` | `number` | Yes | path | Local port to proxy to |
| `path` | `string` | No | path | Path to append to the proxied request |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody code proxy-path`

---

### `resolveAbsolute`

**GET** `/api/v1/code/absproxy/{port}/{path}`

Proxy to local port (absolute path)

```typescript
client.code.proxy.resolveAbsolute(port: number, path?: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `port` | `number` | Yes | path | Local port to proxy to |
| `path` | `string` | No | path | Path (preserved in forwarded request) |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody code proxy`

---

## `client.code.static` (5 methods)

### `get`

**GET** `/_static/{path}`

Get static asset

```typescript
client.code.static.get(path: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Path to static file |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody code assets static`

---

### `getInjectedScript`

**GET** `/hoody-code/injected/{script}`

Get Hoody Code injected script

```typescript
client.code.static.getInjectedScript(script: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `script` | `string` | Yes | path | Script filename |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody code assets injected-script`

---

### `getOpenAPI`

**GET** `/openapi.yaml`

Get OpenAPI specification

```typescript
client.code.static.getOpenAPI(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

---

### `getRobots`

**GET** `/robots.txt`

Get robots.txt

```typescript
client.code.static.getRobots(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody code assets robots`

---

### `getSecurityPolicy`

**GET** `/security.txt`

Get security policy

```typescript
client.code.static.getSecurityPolicy(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody code assets security-policy`

---

## `client.code.vscode` (3 methods)

### `getManifest`

**GET** `/api/v1/code/manifest.json`

Get PWA manifest

```typescript
client.code.vscode.getManifest(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody code assets manifest`

---

### `getVSCode`

**GET** `/api/v1/code`

Get VS Code web interface

```typescript
client.code.vscode.getVSCode(options?: { folder?: string; workspace?: string; extension?: string; ew?: boolean; locale?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `folder` | `string` | No | query | Absolute path to folder to open in VS Code. - Takes precedence over `workspace` parameter - Can be a local filesystem path - Stored in settings for next session |
| `workspace` | `string` | No | query | Absolute path to VS Code workspace file (.code-workspace). - Used when `folder` is not provided - Workspace files can contain multiple folders and settings - Stored in settings for next session |
| `extension` | `string` | No | query | Extension identifier to open in extension-only mode. **Format**: `PUBLISHER.NAME` **Behavior when set**: - File explorer is hidden - Extension's views and UI are prominently displayed - Perfect for creating extension-powered web apps **Use cases**: - Custom web-based tools built on VS Code extensions - Specialized editors (Jupyter notebooks, database tools, etc.) - Kiosk mode for specific workflows **Examples**: - `ms-python.python` - Python development - `ms-toolsai.jupyter` - Jupyter notebooks - `ms-azuretools.vscode-docker` - Docker management - `redhat.vscode-yaml` - YAML editing |
| `ew` | `boolean` | No | query | "Empty Window" flag - indicates workspace was closed. When present, clears the last opened folder/workspace from settings. |
| `locale` | `string` | No | query | Display language for VS Code UI. Format: IETF language tag (e.g., en, fr, de, ja, zh-CN) See: https://en.wikipedia.org/wiki/IETF_language_tag |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody code vs`

---

### `mintKey`

**POST** `/api/v1/code/mint-key`

Generate server web key

```typescript
client.code.vscode.mintKey(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody code auth mint-key`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
