# `exec` — 67 methods

**Version:** 1.0.0-beta.16
**Accessor:** `client.exec`

```typescript
import * as exec from 'hoody-sdk/exec';
```

---

## `client.exec.cache` (1 method)

### `clear`

**POST** `/api/v1/exec/cache/clear`

Clear Cache

```typescript
client.exec.cache.clear(data?: ExecCacheClearRequest): Promise<ExecCacheClearResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecCacheClearRequest` | No | body |  |

**Returns:** `ExecCacheClearResponse`

**CLI:** `hoody exec cache clear`

---

## `client.exec` (1 method)

### `run`

**GET** `/{path}`

Run a user script with any HTTP method (GET by default), a query, a body and headers

```typescript
client.exec.run(options: { path: string; method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; query?: Record<string, unknown>; body?: unknown; headers?: Record<string, string> }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Script path (supports Next.js-style routing). Each segment is percent-encoded once; a leading / is optional. |
| `method` | `'GET' \| 'HEAD' \| 'POST' \| 'PUT' \| 'PATCH' \| 'DELETE'` | No | option | HTTP method; defaults to GET. Lowercase is accepted. |
| `query` | `Record&lt;string, unknown&gt;` | No | option | Query parameters, sent as a real query string (never folded into the path). |
| `body` | `unknown` | No | option | Request body (ignored for GET and HEAD). Objects are sent as JSON. |
| `headers` | `Record&lt;string, string&gt;` | No | option | Per-request headers. |

**Returns:** `any`

---

## `client.exec.kit` (6 methods)

### `getHealth`

**GET** `/api/v1/exec/health`

Health Check

```typescript
client.exec.kit.getHealth(): Promise<ExecHealthCheckResponse>
```

**Returns:** `ExecHealthCheckResponse`

**CLI:** `hoody exec health`

---

### `getMetrics`

**GET** `/api/v1/exec/monitor/metrics`

Prometheus Export

```typescript
client.exec.kit.getMetrics(): Promise<ApiResponse<string>>
```

**Returns:** `ApiResponse<string>`

**CLI:** `hoody exec metrics`

---

### `getStats`

**GET** `/api/v1/exec/monitor/stats`

Get Stats

```typescript
client.exec.kit.getStats(): Promise<ExecKitGetStatsResponse>
```

**Returns:** `ExecKitGetStatsResponse`

**CLI:** `hoody exec stats`

---

### `getStatus`

**GET** `/api/v1/exec/system/restart-status`

Get Restart Status

```typescript
client.exec.kit.getStatus(): Promise<ExecKitGetStatusResponse>
```

**Returns:** `ExecKitGetStatusResponse`

**CLI:** `hoody exec status`

---

### `listRequests`

**GET** `/api/v1/exec/monitor/active-requests`

Get Active Requests

```typescript
client.exec.kit.listRequests(): Promise<ExecKitListRequestsResponse>
```

**Returns:** `ExecKitListRequestsResponse`

**CLI:** `hoody exec requests list`

---

### `restart`

**POST** `/api/v1/exec/system/restart`

Restart Server

```typescript
client.exec.kit.restart(data?: ExecKitRestartRequest): Promise<ExecKitRestartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecKitRestartRequest` | No | body |  |

**Returns:** `ExecKitRestartResponse`

**CLI:** `hoody exec restart`

---

## `client.exec.logs` (5 methods)

### `clear`

**DELETE** `/api/v1/exec/logs/clear`

Clear Logs

```typescript
client.exec.logs.clear(options: { confirm: "true"; file?: string; type?: string; olderThanDays?: string; cache?: boolean | number }): Promise<ExecLogsClearResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `confirm` | `"true"` | Yes | query | Safety confirmation; must be the literal `true` or the request is rejected with 400. |
| `file` | `string` | No | query | File query parameter |
| `type` | `string` | No | query | Type query parameter |
| `olderThanDays` | `string` | No | query | OlderThanDays query parameter |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ExecLogsClearResponse`

**CLI:** `hoody exec logs clear`

---

### `get`

**POST** `/api/v1/exec/logs/read`

Read Log

```typescript
client.exec.logs.get(data: ExecLogsGetRequest): Promise<ExecLogsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecLogsGetRequest` | Yes | body |  |

**Returns:** `ExecLogsGetResponse`

**CLI:** `hoody exec logs get`

---

### `list`

**GET** `/api/v1/exec/logs/list`

List Logs

```typescript
client.exec.logs.list(options?: { type?: string; limit?: string; cache?: boolean | number }): Promise<ExecLogsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `type` | `string` | No | query | Type query parameter |
| `limit` | `string` | No | query | Limit query parameter |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ExecLogsListResponse`

**CLI:** `hoody exec logs list`

---

### `search`

**POST** `/api/v1/exec/logs/search`

Search Logs

```typescript
client.exec.logs.search(data?: ExecLogsSearchRequest): Promise<ExecLogsSearchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecLogsSearchRequest` | No | body |  |

**Returns:** `ExecLogsSearchResponse`

**CLI:** `hoody exec logs search`

---

### `stream`

**GET** `/api/v1/exec/logs/stream`

Stream Logs

```typescript
client.exec.logs.stream(options: { file: string; follow?: boolean; cache?: boolean | number }): Promise<IEventStream>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `file` | `string` | Yes | query | File query parameter |
| `follow` | `boolean` | No | query | Keep the stream open and send new lines as they are written. Default `true`. Accepts `true`/`false`/`1`/`0`. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `IEventStream`

**CLI:** `hoody exec logs stream`

---

## `client.exec.magicComments` (5 methods)

### `get`

**GET** `/api/v1/exec/magic-comments/read`

Read Magic Comments

```typescript
client.exec.magicComments.get(options: { path: string; execId?: string; exec_id?: string; subdomain?: string; cache?: boolean | number }): Promise<ExecMagicCommentsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | query | A script path resolved like scripts/read: under the call's scope first (`execId` / `exec_id` / `subdomain`, else the Host's `[&lt;subdomain&gt;.]…-exec-&lt;execId&gt;`), as `&lt;subdomain\|default&gt;/&lt;execId&gt;/&lt;path&gt;` unless it already starts with that prefix; when no file is there, relative to the scripts directory (so `default/1/x.ts` still works from any Host). An absolute path inside the scripts directory is read relative to it. `resolvedPath` in the answer names the file used. |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `exec_id` | `string` | No | query | Alias for execId (snake_case). Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ExecMagicCommentsGetResponse`

**CLI:** `hoody exec magic comments get`

---

### `getSchema`

**GET** `/api/v1/exec/magic-comments/schema`

Get Magic Comments Schema

```typescript
client.exec.magicComments.getSchema(): Promise<ExecMagicCommentsGetSchemaResponse>
```

**Returns:** `ExecMagicCommentsGetSchemaResponse`

**CLI:** `hoody exec magic comments schema get`

---

### `update`

**PUT** `/api/v1/exec/magic-comments/update`

Update Magic Comments Handler

```typescript
client.exec.magicComments.update(data: ExecMagicCommentsUpdateRequest, options?: { execId?: string; exec_id?: string; subdomain?: string; cache?: boolean | number }): Promise<ExecMagicCommentsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecMagicCommentsUpdateRequest` | Yes | body |  |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `exec_id` | `string` | No | query | Alias for execId (snake_case). Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ExecMagicCommentsUpdateResponse`

**CLI:** `hoody exec magic comments update`

---

### `updateMany`

**POST** `/api/v1/exec/magic-comments/bulk-update`

Bulk Update Magic Comments

```typescript
client.exec.magicComments.updateMany(data: ExecMagicCommentsUpdateManyRequest): Promise<ExecMagicCommentsUpdateManyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecMagicCommentsUpdateManyRequest` | Yes | body |  |

**Returns:** `ExecMagicCommentsUpdateManyResponse`

**CLI:** `hoody exec magic comments batch update`

---

### `validate`

**POST** `/api/v1/exec/validate/magic-comments`

Validate Magic Comments

```typescript
client.exec.magicComments.validate(data: ExecMagicCommentsValidateRequest): Promise<ExecMagicCommentsValidateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecMagicCommentsValidateRequest` | Yes | body |  |

**Returns:** `ExecMagicCommentsValidateResponse`

**CLI:** `hoody exec magic comments validate`

---

## `client.exec.modules` (3 methods)

### `install`

**POST** `/api/v1/exec/dependencies/install`

Install Dependencies

```typescript
client.exec.modules.install(data: ExecModulesInstallRequest): Promise<ExecModulesInstallResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecModulesInstallRequest` | Yes | body |  |

**Returns:** `ExecModulesInstallResponse`

**CLI:** `hoody exec modules install`

---

### `listBundled`

**GET** `/api/v1/exec/dependencies/bundled`

List Bundled Dependencies

```typescript
client.exec.modules.listBundled(): Promise<ExecModulesListBundledResponse>
```

**Returns:** `ExecModulesListBundledResponse`

**CLI:** `hoody exec modules list`

---

### `test`

**POST** `/api/v1/exec/dependencies/check`

Check Dependencies

```typescript
client.exec.modules.test(data: ExecModulesTestRequest): Promise<ExecModulesTestResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecModulesTestRequest` | Yes | body |  |

**Returns:** `ExecModulesTestResponse`

**CLI:** `hoody exec modules test`

---

## `client.exec.namespaces` (1 method)

### `list`

**GET** `/api/v1/exec/list`

List All Exec Ids

```typescript
client.exec.namespaces.list(): Promise<ExecNamespacesListResponse>
```

**Returns:** `ExecNamespacesListResponse`

**CLI:** `hoody exec namespaces list`

---

## `client.exec.openapi` (6 methods)

### `generate`

**POST** `/api/v1/exec/user-openapi/generate`

Generate User OpenAPI

```typescript
client.exec.openapi.generate(data?: ExecOpenapiGenerateRequest): Promise<ExecOpenapiGenerateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecOpenapiGenerateRequest` | No | body |  |

**Returns:** `ExecOpenapiGenerateResponse`

**CLI:** `hoody exec openapi generate`

---

### `get`

**GET** `/api/v1/exec/user-openapi/spec`

Serve Generated Spec

```typescript
client.exec.openapi.get(options?: { dir?: string; directory?: string; format?: "json" | "yaml"; subdomain?: string; execId?: string; cache?: boolean | number }): Promise<ExecOpenapiGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `dir` | `string` | No | query | Script directory to scan (absolute or relative to scripts-dir). Default: `scripts`. |
| `directory` | `string` | No | query | Alias of `dir`. Ignored when `dir` is provided. |
| `format` | `"json" \| "yaml"` | No | query | Output format. `json` (default) or `yaml`. |
| `subdomain` | `string` | No | query | Limit scan to scripts under this subdomain. Falls back to the Host header when omitted. |
| `execId` | `string` | No | query | Limit scan to scripts under this execId. Falls back to the Host header when omitted. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ExecOpenapiGetResponse`

**CLI:** `hoody exec openapi get`

---

### `getSchema`

**GET** `/api/v1/exec/user-openapi/schema`

Serve Schema File

```typescript
client.exec.openapi.getSchema(options?: { file?: string; path?: string; subdomain?: string; execId?: string; cache?: boolean | number }): Promise<ExecOpenapiGetSchemaResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `file` | `string` | No | query | Absolute or scripts-dir-relative path to the target script (e.g. `default/api/users/[id].ts`). Either `file` or `path` must be provided. |
| `path` | `string` | No | query | Alias of `file`. Either `file` or `path` must be provided. |
| `subdomain` | `string` | No | query | Resolve `file` under this subdomain. Falls back to the Host header when omitted. |
| `execId` | `string` | No | query | Resolve `file` under this execId. Falls back to the Host header when omitted. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ExecOpenapiGetSchemaResponse`

**CLI:** `hoody exec openapi schema get`

---

### `listScripts`

**GET** `/api/v1/exec/user-openapi/list`

List User Scripts

```typescript
client.exec.openapi.listScripts(options?: { directory?: string; dir?: string; subdomain?: string; execId?: string; cache?: boolean | number }): Promise<ExecOpenapiListScriptsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `directory` | `string` | No | query | Script directory to list (absolute or relative to scripts-dir). Default: `scripts`. |
| `dir` | `string` | No | query | Alias of `directory`. Ignored when `directory` is provided. |
| `subdomain` | `string` | No | query | Limit scan to scripts under this subdomain. Falls back to the Host header when omitted. |
| `execId` | `string` | No | query | Limit scan to scripts under this execId. Falls back to the Host header when omitted. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ExecOpenapiListScriptsResponse`

**CLI:** `hoody exec openapi scripts list`

---

### `merge`

**POST** `/api/v1/exec/user-openapi/merge`

Merge OpenAPI Specs

```typescript
client.exec.openapi.merge(data?: ExecOpenapiMergeRequest): Promise<ExecOpenapiMergeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecOpenapiMergeRequest` | No | body |  |

**Returns:** `ExecOpenapiMergeResponse`

**CLI:** `hoody exec openapi merge`

---

### `validateSchema`

**POST** `/api/v1/exec/user-openapi/validate`

Validate User Schema

```typescript
client.exec.openapi.validateSchema(data: ExecOpenapiValidateSchemaRequest): Promise<ExecOpenapiValidateSchemaResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecOpenapiValidateSchemaRequest` | Yes | body |  |

**Returns:** `ExecOpenapiValidateSchemaResponse`

**CLI:** `hoody exec openapi schema validate`

---

## `client.exec.packages` (6 methods)

### `compare`

**POST** `/api/v1/exec/package/compare`

Compare Packages

```typescript
client.exec.packages.compare(data?: ExecPackagesCompareRequest): Promise<ExecPackagesCompareResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecPackagesCompareRequest` | No | body |  |

**Returns:** `ExecPackagesCompareResponse`

**CLI:** `hoody exec packages compare`

---

### `createManifest`

**POST** `/api/v1/exec/package/init`

Init package.json

```typescript
client.exec.packages.createManifest(data?: ExecPackagesCreateManifestRequest): Promise<ExecPackagesCreateManifestResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecPackagesCreateManifestRequest` | No | body |  |

**Returns:** `ExecPackagesCreateManifestResponse`

**CLI:** `hoody exec packages manifest create`

---

### `getManifest`

**GET** `/api/v1/exec/package/read`

Read package.json

```typescript
client.exec.packages.getManifest(): Promise<ExecPackagesGetManifestResponse>
```

**Returns:** `ExecPackagesGetManifestResponse`

**CLI:** `hoody exec packages manifest get`

---

### `install`

**POST** `/api/v1/exec/package/install`

Install Packages

```typescript
client.exec.packages.install(data?: ExecPackagesInstallRequest): Promise<ExecPackagesInstallResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecPackagesInstallRequest` | No | body |  |

**Returns:** `ExecPackagesInstallResponse`

**CLI:** `hoody exec packages install`

---

### `pin`

**POST** `/api/v1/exec/package/pin`

Pin Versions

```typescript
client.exec.packages.pin(data?: ExecPackagesPinRequest): Promise<ExecPackagesPinResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecPackagesPinRequest` | No | body |  |

**Returns:** `ExecPackagesPinResponse`

**CLI:** `hoody exec packages pin`

---

### `updateManifest`

**POST** `/api/v1/exec/package/update`

Update package.json

```typescript
client.exec.packages.updateManifest(data?: ExecPackagesUpdateManifestRequest): Promise<ExecPackagesUpdateManifestResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecPackagesUpdateManifestRequest` | No | body |  |

**Returns:** `ExecPackagesUpdateManifestResponse`

**CLI:** `hoody exec packages manifest update`

---

## `client.exec.routes` (3 methods)

### `list`

**POST** `/api/v1/exec/route/discover`

Discover Routes

```typescript
client.exec.routes.list(data?: ExecRoutesListRequest): Promise<ExecRoutesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecRoutesListRequest` | No | body |  |

**Returns:** `ExecRoutesListResponse`

**CLI:** `hoody exec routes list`

---

### `resolve`

**POST** `/api/v1/exec/route/resolve`

Resolve Route

```typescript
client.exec.routes.resolve(data: ExecRoutesResolveRequest): Promise<ExecRoutesResolveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecRoutesResolveRequest` | Yes | body |  |

**Returns:** `ExecRoutesResolveResponse`

**CLI:** `hoody exec routes resolve`

---

### `test`

**POST** `/api/v1/exec/route/test`

Test Route

```typescript
client.exec.routes.test(data: ExecRoutesTestRequest): Promise<ExecRoutesTestResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecRoutesTestRequest` | Yes | body |  |

**Returns:** `ExecRoutesTestResponse`

**CLI:** `hoody exec routes test`

---

## `client.exec.schedules` (4 methods)

### `list`

**GET** `/api/v1/exec/schedules/list`

List Schedules

```typescript
client.exec.schedules.list(): Promise<ExecListSchedulesResponse>
```

**Returns:** `ExecListSchedulesResponse`

**CLI:** `hoody exec schedules list`

---

### `listHistory`

**GET** `/api/v1/exec/schedules/history`

Schedule History

```typescript
client.exec.schedules.listHistory(options?: { scriptPath?: string; since?: string; limit?: number; includeRotated?: boolean; cursor?: string; cache?: boolean | number }): Promise<ExecSchedulesListHistoryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `scriptPath` | `string` | No | query | Filter entries to one script. An absolute path must be inside scripts-dir. A relative path is scoped like scripts/read: on a host that names an execId (`-exec-&lt;id&gt;`) or a subdomain, it is read as `&lt;subdomain\|default&gt;/&lt;execId&gt;/&lt;path&gt;` (`&lt;subdomain&gt;/&lt;path&gt;` when there is no execId) unless it already starts with that prefix; a `default.` subdomain counts as none. On any other host it is relative to scripts-dir. A path outside scripts-dir is 400. Optional. |
| `since` | `string` | No | query | ISO 8601 lower bound on `ts`. Optional. |
| `limit` | `number` | No | query | Max entries to return. Default 100, hard max 1000. |
| `includeRotated` | `boolean` | No | query | When true, also scan rotated fires.log.* files (slower). |
| `cursor` | `string` | No | query | Continuation token from a previous truncated response; resumes the backward scan where it stopped. Optional. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ExecSchedulesListHistoryResponse`

**CLI:** `hoody exec schedules history list`

---

### `reload`

**POST** `/api/v1/exec/schedules/reload`

Reload Schedules

```typescript
client.exec.schedules.reload(data?: ExecSchedulesReloadRequest): Promise<ExecSchedulesReloadResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecSchedulesReloadRequest` | No | body |  |

**Returns:** `ExecSchedulesReloadResponse`

**CLI:** `hoody exec schedules reload`

---

### `run`

**POST** `/api/v1/exec/schedules/trigger`

Trigger Schedule

```typescript
client.exec.schedules.run(data: ExecSchedulesRunRequest): Promise<ExecSchedulesRunResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecSchedulesRunRequest` | Yes | body |  |

**Returns:** `ExecSchedulesRunResponse`

**CLI:** `hoody exec schedules run`

---

## `client.exec.scripts` (13 methods)

### `delete`

**DELETE** `/api/v1/exec/scripts/delete`

Delete Script

```typescript
client.exec.scripts.delete(options: { path: string; confirm: "true"; execId?: string; exec_id?: string; subdomain?: string; cache?: boolean | number }): Promise<ExecScriptsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | query | Path query parameter |
| `confirm` | `"true"` | Yes | query | Safety confirmation; must be the literal `true` or the request is rejected with 400. `confirm=false` is refused too: the check is for the literal value, not for truthiness. |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `exec_id` | `string` | No | query | Alias for execId (snake_case). Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ExecScriptsDeleteResponse`

**CLI:** `hoody exec scripts delete`

---

### `getStats`

**POST** `/api/v1/exec/monitor/script-performance`

Get Script Performance

```typescript
client.exec.scripts.getStats(data?: ExecScriptsGetStatsRequest): Promise<ExecScriptsGetStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecScriptsGetStatsRequest` | No | body |  |

**Returns:** `ExecScriptsGetStatsResponse`

**CLI:** `hoody exec scripts stats get`

---

### `getTree`

**POST** `/api/v1/exec/scripts/tree`

Get Script Tree

```typescript
client.exec.scripts.getTree(data?: ExecScriptsGetTreeRequest, options?: { execId?: string; exec_id?: string; subdomain?: string; cache?: boolean | number }): Promise<ExecScriptsGetTreeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecScriptsGetTreeRequest` | No | body |  |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `exec_id` | `string` | No | query | Alias for execId (snake_case). Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ExecScriptsGetTreeResponse`

**CLI:** `hoody exec scripts tree get`

---

### `list`

**GET** `/api/v1/exec/scripts/list`

List Scripts

```typescript
client.exec.scripts.list(options?: { dir?: string; filter?: string; metadata?: string; label?: string; tags?: string; mode?: string; enabled?: string; websocket?: string; remote?: "any" | "none" | "messages" | "call" | "eval"; recursive?: string; include_comments?: string; exhaustive?: boolean; execId?: string; exec_id?: string; subdomain?: string; cache?: boolean | number }): Promise<ExecScriptsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `dir` | `string` | No | query | Dir query parameter |
| `filter` | `string` | No | query | Filter query parameter |
| `metadata` | `string` | No | query | Metadata query parameter |
| `label` | `string` | No | query | Label query parameter |
| `tags` | `string` | No | query | Tags query parameter |
| `mode` | `string` | No | query | Mode query parameter |
| `enabled` | `string` | No | query | Enabled query parameter |
| `websocket` | `string` | No | query | Websocket query parameter |
| `remote` | `"any" \| "none" \| "messages" \| "call" \| "eval"` | No | query | Keep only scripts by their remote operations: `any` (at least one of `@remote-messages`, `@remote-call`, `@remote-eval` is on), `none` (all off), or `messages` / `call` / `eval` (that one is on). Lists recursively and adds each script's `magicComments` and `remote` summary, like the other filters. Any other value is refused with 400. |
| `recursive` | `string` | No | query | Recursive query parameter |
| `include_comments` | `string` | No | query | Include_comments query parameter |
| `exhaustive` | `boolean` | No | query | When true, list every entry below `dir` recursively with its `type` (file, directory, symlink, fifo, socket, block-device, character-device, unknown), in `entries` instead of `scripts`. Nothing is hidden (dot-files, node_modules, .git, .hoody-cache, _sdk, _hoody) and no symlink is followed. Combine only with `dir`, `execId` and `subdomain` (other options are refused with 400). The answer is complete or an error, never partial: more than 10000 entries is 422 with `details.code` `TOO_MANY_ENTRIES`; a name or link target that is not valid UTF-8 is 422 with `details.code` `NAME_NOT_UTF8` (`details.parent`, and the raw name as `details.nameHex`); an entry or directory that disappears or is replaced during the scan, or a directory whose dev, inode, mtime or ctime changed after it was read (checked once the scan is done), restarts it, and a tree still changing after 3 restarts is 409 with `details.code` `TREE_CHANGED`. This is best effort, for a tree nobody mutates concurrently: a change undone within one timestamp tick, or on a filesystem without fine timestamps, can go unseen. |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `exec_id` | `string` | No | query | Alias for execId (snake_case). Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ExecScriptsListResponse`

**CLI:** `hoody exec scripts list`

---

### `listStats`

**GET** `/api/v1/exec/monitor/scripts`

List Monitor Scripts

```typescript
client.exec.scripts.listStats(options?: { limit?: number; sort?: "lastActivity" | "requests" | "errors" | "p95" | "ws_active"; cache?: boolean | number }): Promise<ExecScriptsListStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query | Max number of scripts to return. Clamped to [1, 500]. Default 100. |
| `sort` | `"lastActivity" \| "requests" \| "errors" \| "p95" \| "ws_active"` | No | query | Sort key. `lastActivity` (default) sorts by most recent activity; other keys sort descending by the matching metric. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ExecScriptsListStatsResponse`

**CLI:** `hoody exec scripts stats list`

---

### `move`

**POST** `/api/v1/exec/scripts/move`

Move Script

```typescript
client.exec.scripts.move(data: ExecScriptsMoveRequest, options?: { execId?: string; exec_id?: string; subdomain?: string; cache?: boolean | number }): Promise<ExecScriptsMoveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecScriptsMoveRequest` | Yes | body |  |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `exec_id` | `string` | No | query | Alias for execId (snake_case). Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ExecScriptsMoveResponse`

**CLI:** `hoody exec scripts move`

---

### `read`

**GET** `/api/v1/exec/scripts/read`

Read Script

```typescript
client.exec.scripts.read(options: { path: string; execId?: string; exec_id?: string; subdomain?: string; cache?: boolean | number }): Promise<ExecScriptsReadResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | query | Path query parameter |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `exec_id` | `string` | No | query | Alias for execId (snake_case). Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ExecScriptsReadResponse`

**CLI:** `hoody exec scripts read`

---

### `validate`

**POST** `/api/v1/exec/validate/script`

Validate Script

```typescript
client.exec.scripts.validate(data: ExecScriptsValidateRequest): Promise<ExecScriptsValidateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecScriptsValidateRequest` | Yes | body |  |

**Returns:** `ExecScriptsValidateResponse`

**CLI:** `hoody exec scripts validate`

---

### `validateDependencies`

**POST** `/api/v1/exec/validate/dependencies`

Validate Dependencies

```typescript
client.exec.scripts.validateDependencies(data: ExecScriptsValidateDependenciesRequest): Promise<ExecScriptsValidateDependenciesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecScriptsValidateDependenciesRequest` | Yes | body |  |

**Returns:** `ExecScriptsValidateDependenciesResponse`

**CLI:** `hoody exec scripts dependencies validate`

---

### `validateReturnType`

**POST** `/api/v1/exec/validate/return-type`

Validate Return Type

```typescript
client.exec.scripts.validateReturnType(data: ExecScriptsValidateReturnTypeRequest): Promise<ExecScriptsValidateReturnTypeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecScriptsValidateReturnTypeRequest` | Yes | body |  |

**Returns:** `ExecScriptsValidateReturnTypeResponse`

**CLI:** `hoody exec scripts returns validate`

---

### `validateSyntax`

**POST** `/api/v1/exec/validate/syntax`

Validate Syntax

```typescript
client.exec.scripts.validateSyntax(data: ExecScriptsValidateSyntaxRequest): Promise<ExecScriptsValidateSyntaxResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecScriptsValidateSyntaxRequest` | Yes | body |  |

**Returns:** `ExecScriptsValidateSyntaxResponse`

**CLI:** `hoody exec scripts syntax validate`

---

### `validateTypes`

**POST** `/api/v1/exec/validate/typescript`

Validate TypeScript

```typescript
client.exec.scripts.validateTypes(data: ExecScriptsValidateTypesRequest): Promise<ExecScriptsValidateTypesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecScriptsValidateTypesRequest` | Yes | body |  |

**Returns:** `ExecScriptsValidateTypesResponse`

**CLI:** `hoody exec scripts types validate`

---

### `write`

**POST** `/api/v1/exec/scripts/write`

Write Script

```typescript
client.exec.scripts.write(data: ExecScriptsWriteRequest, options?: { execId?: string; exec_id?: string; subdomain?: string; cache?: boolean | number }): Promise<ExecScriptsWriteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecScriptsWriteRequest` | Yes | body |  |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `exec_id` | `string` | No | query | Alias for execId (snake_case). Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ExecScriptsWriteResponse`

**CLI:** `hoody exec scripts write`

---

## `client.exec.sdks` (4 methods)

### `delete`

**DELETE** `/api/v1/exec/sdk/{id}`

Delete SDK

```typescript
client.exec.sdks.delete(id: string): Promise<ExecSdksDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Id parameter |

**Returns:** `ExecSdksDeleteResponse`

**CLI:** `hoody exec sdks delete`

---

### `get`

**GET** `/api/v1/exec/sdk/{id}`

Get SDK

```typescript
client.exec.sdks.get(id: string): Promise<ExecSdksGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Id parameter |

**Returns:** `ExecSdksGetResponse`

**CLI:** `hoody exec sdks get`

---

### `import`

**POST** `/api/v1/exec/sdk/import`

Import SDK

```typescript
client.exec.sdks.import(data: ExecSdksImportRequest): Promise<ExecSdksImportResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecSdksImportRequest` | Yes | body |  |

**Returns:** `ExecSdksImportResponse`

**CLI:** `hoody exec sdks import`

---

### `list`

**GET** `/api/v1/exec/sdk/list`

List SDKs

```typescript
client.exec.sdks.list(): Promise<ExecSdksListResponse>
```

**Returns:** `ExecSdksListResponse`

**CLI:** `hoody exec sdks list`

---

## `client.exec.store` (3 methods)

### `clear`

**POST** `/api/v1/exec/shared-state/clear`

Clear Shared State

```typescript
client.exec.store.clear(data?: ExecStoreClearRequest): Promise<ExecStoreClearResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecStoreClearRequest` | No | body |  |

**Returns:** `ExecStoreClearResponse`

**CLI:** `hoody exec store clear`

---

### `get`

**POST** `/api/v1/exec/shared-state/get`

Get Shared State

```typescript
client.exec.store.get(data: ExecStoreGetRequest): Promise<ExecStoreGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecStoreGetRequest` | Yes | body |  |

**Returns:** `ExecStoreGetResponse`

**CLI:** `hoody exec store get`

---

### `set`

**POST** `/api/v1/exec/shared-state/set`

Set Shared State

```typescript
client.exec.store.set(data: ExecStoreSetRequest): Promise<ExecStoreSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecStoreSetRequest` | Yes | body |  |

**Returns:** `ExecStoreSetResponse`

**CLI:** `hoody exec store set`

---

## `client.exec.templates` (6 methods)

### `create`

**POST** `/api/v1/exec/templates/create-custom`

Create Custom Template

```typescript
client.exec.templates.create(data: ExecTemplatesCreateRequest): Promise<ExecTemplatesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecTemplatesCreateRequest` | Yes | body |  |

**Returns:** `ExecTemplatesCreateResponse`

**CLI:** `hoody exec templates create`

---

### `delete`

**DELETE** `/api/v1/exec/templates/delete-custom/{name}`

Delete Custom Template

```typescript
client.exec.templates.delete(name: string): Promise<ExecTemplatesDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Name parameter |

**Returns:** `ExecTemplatesDeleteResponse`

**CLI:** `hoody exec templates delete`

---

### `generate`

**POST** `/api/v1/exec/templates/generate`

Generate From Template

```typescript
client.exec.templates.generate(data: ExecTemplatesGenerateRequest, options?: { execId?: string; exec_id?: string; subdomain?: string; cache?: boolean | number }): Promise<ExecTemplatesGenerateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecTemplatesGenerateRequest` | Yes | body |  |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `exec_id` | `string` | No | query | Alias for execId (snake_case). Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ExecTemplatesGenerateResponse`

**CLI:** `hoody exec templates generate`

---

### `list`

**GET** `/api/v1/exec/templates/list`

List Templates

```typescript
client.exec.templates.list(options?: { category?: string; includeBuiltin?: boolean; includeCustom?: boolean; cache?: boolean | number }): Promise<ExecTemplatesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `category` | `string` | No | query | Filter templates to a single metadata category (e.g. `api`, `utility`). Omit to list all categories. |
| `includeBuiltin` | `boolean` | No | query | Include built-in templates in the result set. Default `true`. Accepts `true`/`false`/`1`/`0`. |
| `includeCustom` | `boolean` | No | query | Include user-supplied templates (from `_hoody/templates/`) in the result set. Default `true`. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ExecTemplatesListResponse`

**CLI:** `hoody exec templates list`

---

### `preview`

**GET** `/api/v1/exec/templates/preview`

Preview Template

```typescript
client.exec.templates.preview(options: { name: string; variables?: string; cache?: boolean | number }): Promise<ExecTemplatesPreviewResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | query | Name query parameter |
| `variables` | `string` | No | query | Variables query parameter |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ExecTemplatesPreviewResponse`

**CLI:** `hoody exec templates preview`

---

### `update`

**PUT** `/api/v1/exec/templates/update-custom/{name}`

Update Custom Template

```typescript
client.exec.templates.update(name: string, data?: ExecTemplatesUpdateRequest): Promise<ExecTemplatesUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Name parameter |
| `data` | `ExecTemplatesUpdateRequest` | No | body |  |

**Returns:** `ExecTemplatesUpdateResponse`

**CLI:** `hoody exec templates update`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
