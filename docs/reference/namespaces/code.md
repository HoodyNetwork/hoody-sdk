# `code` — 10 methods

**Version:** 1.0.0-beta.16
**Accessor:** `client.code`

```typescript
import * as code from 'hoody-sdk/code';
```

---

## `client.code` (1 method)

### `stop`

**DELETE** `/api/v1/code`

Stop an editor instance

```typescript
client.code.stop(options?: { id: number; cache?: boolean | number }): Promise<CodeStopResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `number` | Yes | query | Which instance to stop. On a `code-{N}` service URL the edge proxy sets it from the hostname and overrides any value sent, so a caller there neither needs to send it nor can change it. It is required: there is no default instance to stop, so a request without it is answered `400`. Read exactly as strictly as the selector on `GET /api/v1/code`: an unsigned decimal integer, under the literal name `id` only, never given more than once, and at most `65535 - basePort`. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `CodeStopResponse`

**CLI:** `hoody code stop`

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
| `id` | `number` | Yes | query | Which instance this request is about. Required here, unlike on `GET /api/v1/code`. That operation has a discovery branch to fall back to when no selector is given; this one does not, so a request without an `id` has named no instance and is rejected rather than defaulted to a first one. The value is read exactly as strictly as the selector on `GET /api/v1/code`: an unsigned decimal integer, under the literal name `id` only, never given more than once, and at most `65535 - basePort`. See that operation for the full rules. ## Where it comes from On a `code-N` service URL the platform's edge proxy sets it from the hostname, so a caller behind the edge neither sends it nor can override it, and the generated clients leave it out of the query for exactly that reason. It is required because there is no discovery branch here to fall back to: a request without an `id` has named no instance and is answered `400`. |
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
| `id` | `number` | Yes | query | Which instance this request is about. Required here, unlike on `GET /api/v1/code`. That operation has a discovery branch to fall back to when no selector is given; this one does not, so a request without an `id` has named no instance and is rejected rather than defaulted to a first one. The value is read exactly as strictly as the selector on `GET /api/v1/code`: an unsigned decimal integer, under the literal name `id` only, never given more than once, and at most `65535 - basePort`. See that operation for the full rules. ## Where it comes from On a `code-N` service URL the platform's edge proxy sets it from the hostname, so a caller behind the edge neither sends it nor can override it, and the generated clients leave it out of the query for exactly that reason. It is required because there is no discovery branch here to fall back to: a request without an `id` has named no instance and is answered `400`. |
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

## `client.code.ui` (4 methods)

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
