# `exec` — 69 methods

**Version:** 1.0.0-beta.9
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

**CLI:** `hoody exec system cache-clear`

---

## `client.exec.dependencies` (3 methods)

### `check`

**POST** `/api/v1/exec/dependencies/check`

Check Dependencies

```typescript
client.exec.dependencies.check(data?: ExecDependenciesCheckRequest): Promise<ExecDependenciesCheckResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecDependenciesCheckRequest` | No | body |  |

**Returns:** `ExecDependenciesCheckResponse`

**CLI:** `hoody exec packages check`

---

### `install`

**POST** `/api/v1/exec/dependencies/install`

Install Dependencies

```typescript
client.exec.dependencies.install(data: ExecDependenciesInstallRequest): Promise<ExecDependenciesInstallResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecDependenciesInstallRequest` | Yes | body |  |

**Returns:** `ExecDependenciesInstallResponse`

**CLI:** `hoody exec packages add-modules`

---

### `listBundled`

**GET** `/api/v1/exec/dependencies/bundled`

List Bundled Dependencies

```typescript
client.exec.dependencies.listBundled(): Promise<ExecDependenciesListBundledResponse>
```

**Returns:** `ExecDependenciesListBundledResponse`

**CLI:** `hoody exec packages list`

---

## `client.exec.execution` (1 method)

### `execute`

**GET** `/{path}`

Execute Script (GET)

```typescript
client.exec.execution.execute(path: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Script path (supports Next.js-style routing) |

**Returns:** `ApiResponse<unknown>`

---

## `client.exec.health` (1 method)

### `check`

**GET** `/api/v1/exec/health`

Health Check

```typescript
client.exec.health.check(): Promise<BrowserHealthCheckResponse>
```

**Returns:** `BrowserHealthCheckResponse`

**CLI:** `hoody exec health`

---

## `client.exec.ids` (1 method)

### `list`

**GET** `/api/v1/exec/list`

List All Exec Ids

```typescript
client.exec.ids.list(): Promise<ExecIdsListResponse>
```

**Returns:** `ExecIdsListResponse`

**CLI:** `hoody exec namespaces list`

---

## `client.exec.logs` (5 methods)

### `clear`

**DELETE** `/api/v1/exec/logs/clear`

Clear Logs

```typescript
client.exec.logs.clear(options?: { file?: string; type?: string; olderThanDays?: string; confirm?: string }): Promise<ExecLogsClearResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `file` | `string` | No | query | File query parameter |
| `type` | `string` | No | query | Type query parameter |
| `olderThanDays` | `string` | No | query | OlderThanDays query parameter |
| `confirm` | `string` | No | query | Confirm query parameter |

**Returns:** `ExecLogsClearResponse`

**CLI:** `hoody exec logs clear`

---

### `list`

**GET** `/api/v1/exec/logs/list`

List Logs

```typescript
client.exec.logs.list(options?: { type?: string; limit?: string }): Promise<ExecLogsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `type` | `string` | No | query | Type query parameter |
| `limit` | `string` | No | query | Limit query parameter |

**Returns:** `ExecLogsListResponse`

**CLI:** `hoody exec logs list`

---

### `read`

**POST** `/api/v1/exec/logs/read`

Read Log

```typescript
client.exec.logs.read(data?: ExecLogsReadRequest): Promise<ExecLogsReadResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecLogsReadRequest` | No | body |  |

**Returns:** `ExecLogsReadResponse`

**CLI:** `hoody exec logs read`

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
client.exec.logs.stream(options?: { file: string; follow?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `file` | `string` | Yes | query | File query parameter |
| `follow` | `string` | No | query | Follow query parameter |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody exec logs stream`

---

## `client.exec.magic` (4 methods)

### `bulkUpdate`

**POST** `/api/v1/exec/magic-comments/bulk-update`

Bulk Update Magic Comments

```typescript
client.exec.magic.bulkUpdate(data?: ExecMagicBulkUpdateRequest): Promise<ExecMagicBulkUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecMagicBulkUpdateRequest` | No | body |  |

**Returns:** `ExecMagicBulkUpdateResponse`

**CLI:** `hoody exec magic-comments bulk-update`

---

### `getSchema`

**GET** `/api/v1/exec/magic-comments/schema`

Get Magic Comments Schema

```typescript
client.exec.magic.getSchema(): Promise<ExecMagicGetSchemaResponse>
```

**Returns:** `ExecMagicGetSchemaResponse`

**CLI:** `hoody exec magic-comments schema`

---

### `read`

**GET** `/api/v1/exec/magic-comments/read`

Read Magic Comments

```typescript
client.exec.magic.read(options?: { path: string }): Promise<ExecMagicReadResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | query | Path query parameter |

**Returns:** `ExecMagicReadResponse`

**CLI:** `hoody exec magic-comments read`

---

### `updateHandler`

**PUT** `/api/v1/exec/magic-comments/update`

Update Magic Comments Handler

```typescript
client.exec.magic.updateHandler(data: ExecMagicUpdateHandlerRequest): Promise<ExecMagicUpdateHandlerResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecMagicUpdateHandlerRequest` | Yes | body |  |

**Returns:** `ExecMagicUpdateHandlerResponse`

**CLI:** `hoody exec magic-comments update`

---

## `client.exec.monitor` (5 methods)

### `getActiveRequests`

**GET** `/api/v1/exec/monitor/active-requests`

Get Active Requests

```typescript
client.exec.monitor.getActiveRequests(): Promise<ExecMonitorGetActiveRequestsResponse>
```

**Returns:** `ExecMonitorGetActiveRequestsResponse`

**CLI:** `hoody exec system active-requests`

---

### `getScriptPerformance`

**POST** `/api/v1/exec/monitor/script-performance`

Get Script Performance

```typescript
client.exec.monitor.getScriptPerformance(data?: ExecMonitorGetScriptPerformanceRequest): Promise<ExecMonitorGetScriptPerformanceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecMonitorGetScriptPerformanceRequest` | No | body |  |

**Returns:** `ExecMonitorGetScriptPerformanceResponse`

**CLI:** `hoody exec scripts performance`

---

### `getStats`

**GET** `/api/v1/exec/monitor/stats`

Get Stats

```typescript
client.exec.monitor.getStats(): Promise<ExecMonitorGetStatsResponse>
```

**Returns:** `ExecMonitorGetStatsResponse`

**CLI:** `hoody exec system stats`

---

### `listMonitorScripts`

**GET** `/api/v1/exec/monitor/scripts`

List Monitor Scripts

```typescript
client.exec.monitor.listMonitorScripts(options?: { limit?: number; sort?: "lastActivity" | "requests" | "errors" | "p95" | "ws_active" }): Promise<ListMonitorScriptsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query | Max number of scripts to return. Clamped to [1, 500]. Default 100. |
| `sort` | `"lastActivity" \| "requests" \| "errors" \| "p95" \| "ws_active"` | No | query | Sort key. `lastActivity` (default) sorts by most recent activity; other keys sort descending by the matching metric. |

**Returns:** `ListMonitorScriptsResponse`

---

### `prometheusExport`

**GET** `/api/v1/exec/monitor/metrics`

Prometheus Export

```typescript
client.exec.monitor.prometheusExport(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody exec system prometheus`

---

## `client.exec.openapi` (6 methods)

### `generate`

**POST** `/api/v1/exec/user-openapi/generate`

Generate User OpenAPI

```typescript
client.exec.openapi.generate(data: ExecOpenapiGenerateRequest): Promise<ExecOpenapiGenerateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecOpenapiGenerateRequest` | Yes | body |  |

**Returns:** `ExecOpenapiGenerateResponse`

**CLI:** `hoody exec openapi generate`

---

### `listScripts`

**GET** `/api/v1/exec/user-openapi/list`

List User Scripts

```typescript
client.exec.openapi.listScripts(options?: { directory?: string; dir?: string; subdomain?: string; execId?: string }): Promise<ExecOpenapiListScriptsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `directory` | `string` | No | query | Script directory to list (absolute or relative to scripts-dir). Default: `scripts`. |
| `dir` | `string` | No | query | Alias of `directory`. Ignored when `directory` is provided. |
| `subdomain` | `string` | No | query | Limit scan to scripts under this subdomain. Falls back to the Host header when omitted. |
| `execId` | `string` | No | query | Limit scan to scripts under this execId. Falls back to the Host header when omitted. |

**Returns:** `ExecOpenapiListScriptsResponse`

**CLI:** `hoody exec scripts list-user`

---

### `merge`

**POST** `/api/v1/exec/user-openapi/merge`

Merge OpenAPI Specs

```typescript
client.exec.openapi.merge(data: ExecOpenapiMergeRequest): Promise<ExecOpenapiMergeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecOpenapiMergeRequest` | Yes | body |  |

**Returns:** `ExecOpenapiMergeResponse`

**CLI:** `hoody exec openapi merge`

---

### `serve`

**GET** `/api/v1/exec/user-openapi/spec`

Serve Generated Spec

```typescript
client.exec.openapi.serve(options?: { dir?: string; directory?: string; format?: "json" | "yaml"; subdomain?: string; execId?: string }): Promise<ExecOpenapiServeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `dir` | `string` | No | query | Script directory to scan (absolute or relative to scripts-dir). Default: `scripts`. |
| `directory` | `string` | No | query | Alias of `dir`. Ignored when `dir` is provided. |
| `format` | `"json" \| "yaml"` | No | query | Output format. `json` (default) or `yaml`. |
| `subdomain` | `string` | No | query | Limit scan to scripts under this subdomain. Falls back to the Host header when omitted. |
| `execId` | `string` | No | query | Limit scan to scripts under this execId. Falls back to the Host header when omitted. |

**Returns:** `ExecOpenapiServeResponse`

**CLI:** `hoody exec openapi serve`

---

### `serveSchema`

**GET** `/api/v1/exec/user-openapi/schema`

Serve Schema File

```typescript
client.exec.openapi.serveSchema(options?: { file?: string; path?: string }): Promise<ExecOpenapiServeSchemaResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `file` | `string` | No | query | Absolute or scripts-dir-relative path to the target script (e.g. `default/api/users/[id].ts`). Either `file` or `path` must be provided. |
| `path` | `string` | No | query | Alias of `file`. Either `file` or `path` must be provided. |

**Returns:** `ExecOpenapiServeSchemaResponse`

**CLI:** `hoody exec openapi serve-schema`

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

**CLI:** `hoody exec validate user-schema`

---

## `client.exec.package` (6 methods)

### `compare`

**POST** `/api/v1/exec/package/compare`

Compare Packages

```typescript
client.exec.package.compare(data: ExecPackageCompareRequest): Promise<ExecPackageCompareResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecPackageCompareRequest` | Yes | body |  |

**Returns:** `ExecPackageCompareResponse`

**CLI:** `hoody exec packages compare`

---

### `initJson`

**POST** `/api/v1/exec/package/init`

Init package.json

```typescript
client.exec.package.initJson(data?: ExecPackageInitJsonRequest): Promise<ExecPackageInitJsonResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecPackageInitJsonRequest` | No | body |  |

**Returns:** `ExecPackageInitJsonResponse`

**CLI:** `hoody exec packages json init`

---

### `install`

**POST** `/api/v1/exec/package/install`

Install Packages

```typescript
client.exec.package.install(data?: ExecPackageInstallRequest): Promise<ExecPackageInstallResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecPackageInstallRequest` | No | body |  |

**Returns:** `ExecPackageInstallResponse`

**CLI:** `hoody exec packages install`

---

### `pinVersions`

**POST** `/api/v1/exec/package/pin`

Pin Versions

```typescript
client.exec.package.pinVersions(data?: ExecPackagePinVersionsRequest): Promise<ExecPackagePinVersionsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecPackagePinVersionsRequest` | No | body |  |

**Returns:** `ExecPackagePinVersionsResponse`

**CLI:** `hoody exec packages pin`

---

### `readJson`

**GET** `/api/v1/exec/package/read`

Read package.json

```typescript
client.exec.package.readJson(): Promise<ExecPackageReadJsonResponse>
```

**Returns:** `ExecPackageReadJsonResponse`

**CLI:** `hoody exec packages json read`

---

### `updateJson`

**POST** `/api/v1/exec/package/update`

Update package.json

```typescript
client.exec.package.updateJson(data?: ExecPackageUpdateJsonRequest): Promise<ExecPackageUpdateJsonResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecPackageUpdateJsonRequest` | No | body |  |

**Returns:** `ExecPackageUpdateJsonResponse`

**CLI:** `hoody exec packages json update`

---

## `client.exec.route` (3 methods)

### `discover`

**POST** `/api/v1/exec/route/discover`

Discover Routes

```typescript
client.exec.route.discover(data?: ExecRouteDiscoverRequest): Promise<ExecRouteDiscoverResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecRouteDiscoverRequest` | No | body |  |

**Returns:** `ExecRouteDiscoverResponse`

**CLI:** `hoody exec routes discover`

---

### `resolve`

**POST** `/api/v1/exec/route/resolve`

Resolve Route

```typescript
client.exec.route.resolve(data: ExecRouteResolveRequest): Promise<ExecRouteResolveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecRouteResolveRequest` | Yes | body |  |

**Returns:** `ExecRouteResolveResponse`

**CLI:** `hoody exec routes resolve`

---

### `test`

**POST** `/api/v1/exec/route/test`

Test Route

```typescript
client.exec.route.test(data: ExecRouteTestRequest): Promise<ExecRouteTestResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecRouteTestRequest` | Yes | body |  |

**Returns:** `ExecRouteTestResponse`

**CLI:** `hoody exec routes test`

---

## `client.exec.schedules` (4 methods)

### `listSchedules`

**GET** `/api/v1/exec/schedules/list`

List Schedules

```typescript
client.exec.schedules.listSchedules(): Promise<CurlSchedulesListResponse>
```

**Returns:** `CurlSchedulesListResponse`

**CLI:** `hoody exec schedules list`

---

### `reloadSchedules`

**POST** `/api/v1/exec/schedules/reload`

Reload Schedules

```typescript
client.exec.schedules.reloadSchedules(data?: ReloadSchedulesRequest): Promise<ReloadSchedulesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ReloadSchedulesRequest` | No | body |  |

**Returns:** `ReloadSchedulesResponse`

**CLI:** `hoody exec schedules reload`

---

### `scheduleHistory`

**GET** `/api/v1/exec/schedules/history`

Schedule History

```typescript
client.exec.schedules.scheduleHistory(options?: { scriptPath?: string; since?: string; limit?: number; includeRotated?: boolean }): Promise<ScheduleHistoryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `scriptPath` | `string` | No | query | Filter entries to a specific script (relative to scripts-dir). Optional. |
| `since` | `string` | No | query | ISO 8601 lower bound on `ts`. Optional. |
| `limit` | `number` | No | query | Max entries to return. Default 100, hard max 1000. |
| `includeRotated` | `boolean` | No | query | When true, also scan rotated fires.log.* files (slower). |

**Returns:** `ScheduleHistoryResponse`

**CLI:** `hoody exec schedules history`

---

### `triggerSchedule`

**POST** `/api/v1/exec/schedules/trigger`

Trigger Schedule

```typescript
client.exec.schedules.triggerSchedule(data: TriggerScheduleRequest): Promise<TriggerScheduleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `TriggerScheduleRequest` | Yes | body |  |

**Returns:** `TriggerScheduleResponse`

**CLI:** `hoody exec schedules trigger`

---

## `client.exec.scripts` (6 methods)

### `delete`

**DELETE** `/api/v1/exec/scripts/delete`

Delete Script

```typescript
client.exec.scripts.delete(options?: { path: string; confirm?: string; execId?: string; exec_id?: string; subdomain?: string }): Promise<ExecScriptsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | query | Path query parameter |
| `confirm` | `string` | No | query | Confirm query parameter |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. |
| `exec_id` | `string` | No | query | Alias for execId (snake_case). |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecScriptsDeleteResponse`

**CLI:** `hoody exec scripts delete`

---

### `getTree`

**POST** `/api/v1/exec/scripts/tree`

Get Script Tree

```typescript
client.exec.scripts.getTree(data?: ExecScriptsGetTreeRequest, options?: { execId?: string; exec_id?: string; subdomain?: string }): Promise<ExecScriptsGetTreeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecScriptsGetTreeRequest` | No | body |  |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. |
| `exec_id` | `string` | No | query | Alias for execId (snake_case). |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecScriptsGetTreeResponse`

**CLI:** `hoody exec scripts tree`

---

### `list`

**GET** `/api/v1/exec/scripts/list`

List Scripts

```typescript
client.exec.scripts.list(options?: { dir?: string; filter?: string; metadata?: string; label?: string; tags?: string; mode?: string; enabled?: string; websocket?: string; recursive?: string; include_comments?: string; execId?: string; exec_id?: string; subdomain?: string }): Promise<ExecScriptsListResponse>
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
| `recursive` | `string` | No | query | Recursive query parameter |
| `include_comments` | `string` | No | query | Include_comments query parameter |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. |
| `exec_id` | `string` | No | query | Alias for execId (snake_case). |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecScriptsListResponse`

**CLI:** `hoody exec scripts list`

---

### `move`

**POST** `/api/v1/exec/scripts/move`

Move Script

```typescript
client.exec.scripts.move(data: ExecScriptsMoveRequest, options?: { execId?: string; exec_id?: string; subdomain?: string }): Promise<ExecScriptsMoveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecScriptsMoveRequest` | Yes | body |  |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. |
| `exec_id` | `string` | No | query | Alias for execId (snake_case). |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecScriptsMoveResponse`

**CLI:** `hoody exec scripts move`

---

### `read`

**GET** `/api/v1/exec/scripts/read`

Read Script

```typescript
client.exec.scripts.read(options?: { path: string; execId?: string; exec_id?: string; subdomain?: string }): Promise<ExecScriptsReadResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | query | Path query parameter |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. |
| `exec_id` | `string` | No | query | Alias for execId (snake_case). |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecScriptsReadResponse`

**CLI:** `hoody exec scripts read`

---

### `write`

**POST** `/api/v1/exec/scripts/write`

Write Script

```typescript
client.exec.scripts.write(data: ExecScriptsWriteRequest, options?: { execId?: string; exec_id?: string; subdomain?: string }): Promise<ExecScriptsWriteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecScriptsWriteRequest` | Yes | body |  |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. |
| `exec_id` | `string` | No | query | Alias for execId (snake_case). |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecScriptsWriteResponse`

**CLI:** `hoody exec scripts write`

---

## `client.exec.sdk` (4 methods)

### `delete`

**DELETE** `/api/v1/exec/sdk/:id`

Delete SDK

```typescript
client.exec.sdk.delete(id: string): Promise<ExecSdkDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Id parameter |

**Returns:** `ExecSdkDeleteResponse`

**CLI:** `hoody exec sdks delete`

---

### `get`

**GET** `/api/v1/exec/sdk/:id`

Get SDK

```typescript
client.exec.sdk.get(id: string): Promise<ExecSdkGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Id parameter |

**Returns:** `ExecSdkGetResponse`

**CLI:** `hoody exec sdks get`

---

### `importSDK`

**POST** `/api/v1/exec/sdk/import`

Import SDK

```typescript
client.exec.sdk.importSDK(data: ExecSdkImportSDKRequest): Promise<ExecSdkImportSDKResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecSdkImportSDKRequest` | Yes | body |  |

**Returns:** `ExecSdkImportSDKResponse`

**CLI:** `hoody exec sdks import`

---

### `list`

**GET** `/api/v1/exec/sdk/list`

List SDKs

```typescript
client.exec.sdk.list(): Promise<ExecSdkListResponse>
```

**Returns:** `ExecSdkListResponse`

**CLI:** `hoody exec sdks list`

---

## `client.exec.state` (3 methods)

### `clear`

**POST** `/api/v1/exec/shared-state/clear`

Clear Shared State

```typescript
client.exec.state.clear(data: ExecStateClearRequest): Promise<ExecStateClearResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecStateClearRequest` | Yes | body |  |

**Returns:** `ExecStateClearResponse`

**CLI:** `hoody exec state clear`

---

### `get`

**POST** `/api/v1/exec/shared-state/get`

Get Shared State

```typescript
client.exec.state.get(data: ExecStateGetRequest): Promise<ExecStateGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecStateGetRequest` | Yes | body |  |

**Returns:** `ExecStateGetResponse`

**CLI:** `hoody exec state get`

---

### `set`

**POST** `/api/v1/exec/shared-state/set`

Set Shared State

```typescript
client.exec.state.set(data: ExecStateSetRequest): Promise<ExecStateSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecStateSetRequest` | Yes | body |  |

**Returns:** `ExecStateSetResponse`

**CLI:** `hoody exec state set`

---

## `client.exec.system` (4 methods)

### `getOpenApiJson`

**GET** `/openapi.json`

Get OpenAPI Specification (JSON)

```typescript
client.exec.system.getOpenApiJson(): Promise<BrowserHealthGetOpenApiJsonResponse>
```

**Returns:** `BrowserHealthGetOpenApiJsonResponse`

---

### `getOpenApiYaml`

**GET** `/openapi.yaml`

Get OpenAPI Specification (YAML)

```typescript
client.exec.system.getOpenApiYaml(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

---

### `getRestartStatus`

**GET** `/api/v1/exec/system/restart-status`

Get Restart Status

```typescript
client.exec.system.getRestartStatus(): Promise<ExecSystemGetRestartStatusResponse>
```

**Returns:** `ExecSystemGetRestartStatusResponse`

**CLI:** `hoody exec system restart-status`

---

### `restartServer`

**POST** `/api/v1/exec/system/restart`

Restart Server

```typescript
client.exec.system.restartServer(data?: ExecSystemRestartServerRequest): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecSystemRestartServerRequest` | No | body |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody exec system restart`

---

## `client.exec.templates` (6 methods)

### `createCustom`

**POST** `/api/v1/exec/templates/create-custom`

Create Custom Template

```typescript
client.exec.templates.createCustom(data: ExecTemplatesCreateCustomRequest): Promise<ExecTemplatesCreateCustomResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecTemplatesCreateCustomRequest` | Yes | body |  |

**Returns:** `ExecTemplatesCreateCustomResponse`

**CLI:** `hoody exec templates create`

---

### `deleteCustom`

**DELETE** `/api/v1/exec/templates/delete-custom/:name`

Delete Custom Template

```typescript
client.exec.templates.deleteCustom(name: string): Promise<ExecTemplatesDeleteCustomResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Name parameter |

**Returns:** `ExecTemplatesDeleteCustomResponse`

**CLI:** `hoody exec templates delete`

---

### `generate`

**POST** `/api/v1/exec/templates/generate`

Generate From Template

```typescript
client.exec.templates.generate(data: ExecTemplatesGenerateRequest): Promise<ExecTemplatesGenerateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecTemplatesGenerateRequest` | Yes | body |  |

**Returns:** `ExecTemplatesGenerateResponse`

**CLI:** `hoody exec templates generate`

---

### `list`

**GET** `/api/v1/exec/templates/list`

List Templates

```typescript
client.exec.templates.list(options?: { category?: string; includeBuiltin?: boolean; includeCustom?: boolean }): Promise<ExecTemplatesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `category` | `string` | No | query | Filter templates to a single metadata category (e.g. `api`, `utility`). Omit to list all categories. |
| `includeBuiltin` | `boolean` | No | query | Include built-in templates in the result set. Default `true`. Accepts `true`/`false`/`1`/`0`. |
| `includeCustom` | `boolean` | No | query | Include user-supplied templates (from `_hoody/templates/`) in the result set. Default `true`. |

**Returns:** `ExecTemplatesListResponse`

**CLI:** `hoody exec templates list`

---

### `preview`

**GET** `/api/v1/exec/templates/preview`

Preview Template

```typescript
client.exec.templates.preview(options?: { name: string; variables?: string }): Promise<ExecTemplatesPreviewResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | query | Name query parameter |
| `variables` | `string` | No | query | Variables query parameter |

**Returns:** `ExecTemplatesPreviewResponse`

**CLI:** `hoody exec templates preview`

---

### `updateCustom`

**PUT** `/api/v1/exec/templates/update-custom/:name`

Update Custom Template

```typescript
client.exec.templates.updateCustom(name: string, data?: ExecTemplatesUpdateCustomRequest): Promise<ExecTemplatesUpdateCustomResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Name parameter |
| `data` | `ExecTemplatesUpdateCustomRequest` | No | body |  |

**Returns:** `ExecTemplatesUpdateCustomResponse`

**CLI:** `hoody exec templates update`

---

## `client.exec.validate` (6 methods)

### `validateDependencies`

**POST** `/api/v1/exec/validate/dependencies`

Validate Dependencies

```typescript
client.exec.validate.validateDependencies(data: ExecValidateValidateDependenciesRequest): Promise<ExecValidateValidateDependenciesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecValidateValidateDependenciesRequest` | Yes | body |  |

**Returns:** `ExecValidateValidateDependenciesResponse`

**CLI:** `hoody exec validate dependencies`

---

### `validateMagicComments`

**POST** `/api/v1/exec/validate/magic-comments`

Validate Magic Comments

```typescript
client.exec.validate.validateMagicComments(data: ExecValidateValidateMagicCommentsRequest): Promise<ExecValidateValidateMagicCommentsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecValidateValidateMagicCommentsRequest` | Yes | body |  |

**Returns:** `ExecValidateValidateMagicCommentsResponse`

**CLI:** `hoody exec validate magic-comments`

---

### `validateReturnType`

**POST** `/api/v1/exec/validate/return-type`

Validate Return Type

```typescript
client.exec.validate.validateReturnType(data: ExecValidateValidateReturnTypeRequest): Promise<ExecValidateValidateReturnTypeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecValidateValidateReturnTypeRequest` | Yes | body |  |

**Returns:** `ExecValidateValidateReturnTypeResponse`

**CLI:** `hoody exec validate return-type`

---

### `validateScript`

**POST** `/api/v1/exec/validate/script`

Validate Script

```typescript
client.exec.validate.validateScript(data: ExecValidateValidateScriptRequest): Promise<ExecValidateValidateScriptResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecValidateValidateScriptRequest` | Yes | body |  |

**Returns:** `ExecValidateValidateScriptResponse`

**CLI:** `hoody exec validate script`

---

### `validateSyntax`

**POST** `/api/v1/exec/validate/syntax`

Validate Syntax

```typescript
client.exec.validate.validateSyntax(data: ExecValidateValidateSyntaxRequest): Promise<ExecValidateValidateSyntaxResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecValidateValidateSyntaxRequest` | Yes | body |  |

**Returns:** `ExecValidateValidateSyntaxResponse`

**CLI:** `hoody exec validate syntax`

---

### `validateTypeScript`

**POST** `/api/v1/exec/validate/typescript`

Validate TypeScript

```typescript
client.exec.validate.validateTypeScript(data: ExecValidateValidateTypeScriptRequest): Promise<ExecValidateValidateTypeScriptResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecValidateValidateTypeScriptRequest` | Yes | body |  |

**Returns:** `ExecValidateValidateTypeScriptResponse`

**CLI:** `hoody exec validate types`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
