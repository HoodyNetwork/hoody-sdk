# `exec` — 83 methods

**Version:** 1.0.1
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
client.exec.cache.clear(data: ExecCacheClearRequest): Promise<ExecCacheClearResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecCacheClearRequest` | Yes | body |  |

**Returns:** `ExecCacheClearResponse`

**CLI:** `hoody exec cache clear`

---

## `client.exec.env` (2 methods)

### `listKeys`

**GET** `/api/v1/exec/env/keys`

List Env Keys

```typescript
client.exec.env.listKeys(options: { scriptPath: string; execId?: string; subdomain?: string }): Promise<ExecEnvListKeysResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `scriptPath` | `string` | Yes | query | The script whose env chain to list, scoped like scripts/read: under the call's execId / subdomain unless it already starts with that prefix. |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecEnvListKeysResponse`

---

### `updateKeys`

**POST** `/api/v1/exec/env/update`

Update Env Keys

```typescript
client.exec.env.updateKeys(data: ExecEnvUpdateKeysRequest, options?: { execId?: string; subdomain?: string }): Promise<ExecEnvUpdateKeysResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecEnvUpdateKeysRequest` | Yes | body |  |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecEnvUpdateKeysResponse`

---

## `client.exec` (1 method)

### `run`

**GET** `/{path}`

Run a user script with any HTTP method (GET by default), a query, a body and headers

```typescript
client.exec.run<TResponse = unknown>(path: string, options?: ExecScriptCallOptions): Promise<ApiResponse<TResponse>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Script path (supports Next.js-style routing). Each segment is percent-encoded once; a leading / is optional. |
| `method` | `'GET' \| 'HEAD' \| 'POST' \| 'PUT' \| 'PATCH' \| 'DELETE'` | No | option | HTTP method; defaults to GET. Lowercase is accepted. |
| `query` | `Record&lt;string, unknown&gt;` | No | option | Query parameters, sent as a real query string (never folded into the path). |
| `body` | `unknown` | No | option | Request body (ignored for GET and HEAD). Objects are sent as JSON. |
| `headers` | `Record&lt;string, string&gt;` | No | option | Per-request headers. |

**Returns:** `ApiResponse<TResponse>`

---

## `client.exec.kit` (6 methods)

### `getHealth`

**GET** `/api/v1/exec/health`

Health Check

```typescript
client.exec.kit.getHealth(): Promise<ExecKitGetHealthResponse>
```

**Returns:** `ExecKitGetHealthResponse`

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

## `client.exec.logs` (6 methods)

### `clear`

**DELETE** `/api/v1/exec/logs/clear`

Clear Logs

```typescript
client.exec.logs.clear(options: { confirm: "true"; file?: string; type?: "all" | "request" | "access" | "cron" | "other"; olderThanDays?: string }): Promise<ExecLogsClearResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `confirm` | `"true"` | Yes | query | Safety confirmation; must be the literal `true` or the request is rejected with 400. |
| `file` | `string` | No | query | File query parameter |
| `type` | `"all" \| "request" \| "access" \| "cron" \| "other"` | No | query | Which logs to clear: `all`, `request`, `access`, `cron` or `other`. Any other value is refused with 400. |
| `olderThanDays` | `string` | No | query | OlderThanDays query parameter |

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
client.exec.logs.list(options?: { type?: "all" | "request" | "access" | "cron" | "other"; limit?: string }): Promise<ExecLogsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `type` | `"all" \| "request" \| "access" \| "cron" \| "other"` | No | query | Which logs to list: `all`, `request` (execution files under `executions/`), `access`, `cron` or `other`. Any other value is refused with 400. |
| `limit` | `string` | No | query | Maximum number of log files to return, newest first, with no upper bound. Only the leading integer of the value is read, so `25abc` means 25 and `2.5` means 2 (a `0x` prefix is read as hexadecimal). When omitted, or when the value has no leading number, is zero or negative, up to 100 log files are returned. No value is refused. |

**Returns:** `ExecLogsListResponse`

**CLI:** `hoody exec logs list`

---

### `listExecutions`

**GET** `/api/v1/exec/logs/executions`

List Script Executions

```typescript
client.exec.logs.listExecutions(options: { scriptPath: string; status?: "all" | "failed"; since?: string; until?: string; limit?: number; before?: string; execId?: string; subdomain?: string }): Promise<ExecLogsListExecutionsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `scriptPath` | `string` | Yes | query | The script whose calls to list, scoped like scripts/read: under the call's execId / subdomain unless it already starts with that prefix. |
| `status` | `"all" \| "failed"` | No | query | `failed` lists only calls that failed. Default `all`. |
| `since` | `string` | No | query | ISO 8601 lower bound on `receivedAt`. Optional. |
| `until` | `string` | No | query | ISO 8601 upper bound on `receivedAt`. Optional. |
| `limit` | `number` | No | query | Calls per page, 1 to 100. Default 50. |
| `before` | `string` | No | query | The `next` value of the previous page. |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecLogsListExecutionsResponse`

---

### `search`

**POST** `/api/v1/exec/logs/search`

Search Logs

```typescript
client.exec.logs.search(data: ExecLogsSearchRequest): Promise<ExecLogsSearchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecLogsSearchRequest` | Yes | body |  |

**Returns:** `ExecLogsSearchResponse`

**CLI:** `hoody exec logs search`

---

### `stream`

**GET** `/api/v1/exec/logs/stream`

Stream Logs

```typescript
client.exec.logs.stream(options: { file: string; follow?: boolean }): Promise<IEventStream>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `file` | `string` | Yes | query | File query parameter |
| `follow` | `boolean` | No | query | Keep the stream open and send new lines as they are written. Default `true`. Over raw HTTP the query value may also be `1` or `0`. |

**Returns:** `IEventStream`

**CLI:** `hoody exec logs stream`

---

## `client.exec.magicComments` (7 methods)

### `get`

**GET** `/api/v1/exec/magic-comments/read`

Read Magic Comments

```typescript
client.exec.magicComments.get(options: { path: string; execId?: string; subdomain?: string }): Promise<ExecMagicCommentsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | query | A script path resolved like scripts/read: under the call's scope first (`execId` / `exec_id` / `subdomain`, else the Host's `[&lt;subdomain&gt;.]…-exec-&lt;execId&gt;`), as `&lt;subdomain\|default&gt;/&lt;execId&gt;/&lt;path&gt;` unless it already starts with that prefix; when no file is there, relative to the scripts directory (so `default/1/x.ts` still works from any Host). An absolute path inside the scripts directory is read relative to it. `resolvedPath` in the answer names the file used. |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecMagicCommentsGetResponse`

**CLI:** `hoody exec magiccomments get`

---

### `getSchema`

**GET** `/api/v1/exec/magic-comments/schema`

Get Magic Comments Schema

```typescript
client.exec.magicComments.getSchema(): Promise<ExecMagicCommentsGetSchemaResponse>
```

**Returns:** `ExecMagicCommentsGetSchemaResponse`

**CLI:** `hoody exec magiccomments schema get`

---

### `parse`

**POST** `/api/v1/exec/magic-comments/parse`

Parse Magic Comments Text

```typescript
client.exec.magicComments.parse(data: ExecMagicCommentsParseRequest): Promise<ExecMagicCommentsParseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecMagicCommentsParseRequest` | Yes | body |  |

**Returns:** `ExecMagicCommentsParseResponse`

---

### `print`

**POST** `/api/v1/exec/magic-comments/print`

Print Magic Comments Text

```typescript
client.exec.magicComments.print(data: ExecMagicCommentsPrintRequest): Promise<ExecMagicCommentsPrintResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecMagicCommentsPrintRequest` | Yes | body |  |

**Returns:** `ExecMagicCommentsPrintResponse`

---

### `update`

**PUT** `/api/v1/exec/magic-comments/update`

Update Magic Comments Handler

```typescript
client.exec.magicComments.update(data: ExecMagicCommentsUpdateRequest, options?: { execId?: string; subdomain?: string }): Promise<ExecMagicCommentsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecMagicCommentsUpdateRequest` | Yes | body |  |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecMagicCommentsUpdateResponse`

**CLI:** `hoody exec magiccomments update`

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

**CLI:** `hoody exec magiccomments batch update`

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

**CLI:** `hoody exec magiccomments validate`

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

**CLI:** `hoody exec modules bundled list`

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
client.exec.openapi.get(options?: { dir?: string; directory?: string; format?: "json" | "yaml"; subdomain?: string; execId?: string }): Promise<ExecOpenapiGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `dir` | `string` | No | query | Directory relative to the selected execution namespace, or already prefixed with that namespace. Default `scripts` selects the namespace root, or the scripts root when no namespace applies. Leading slashes are dropped, so an absolute filesystem path is not supported. |
| `directory` | `string` | No | query | Alias of `dir`. Ignored when `dir` is provided. |
| `format` | `"json" \| "yaml"` | No | query | Output format. `json` (default) or `yaml`. |
| `subdomain` | `string` | No | query | Limit scan to scripts under this subdomain. Falls back to the Host header when omitted. |
| `execId` | `string` | No | query | Limit scan to scripts under this execId. Falls back to the Host header when omitted. |

**Returns:** `ExecOpenapiGetResponse`

**CLI:** `hoody exec openapi get`

---

### `getSchema`

**GET** `/api/v1/exec/user-openapi/schema`

Serve Schema File

```typescript
client.exec.openapi.getSchema(options?: { file?: string; path?: string; subdomain?: string; execId?: string }): Promise<ExecOpenapiGetSchemaResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `file` | `string` | No | query | Script path relative to the selected execution namespace (the scripts root when none applies), or already prefixed with that namespace, for example `default/1/api/users.ts`. Either `file` or `path` is required. Leading slashes are dropped, so an absolute filesystem path is not supported. |
| `path` | `string` | No | query | Alias of `file`. Either `file` or `path` must be provided. |
| `subdomain` | `string` | No | query | Resolve `file` under this subdomain. Falls back to the Host header when omitted. |
| `execId` | `string` | No | query | Resolve `file` under this execId. Falls back to the Host header when omitted. |

**Returns:** `ExecOpenapiGetSchemaResponse`

**CLI:** `hoody exec openapi schema get`

---

### `listScripts`

**GET** `/api/v1/exec/user-openapi/list`

List User Scripts

```typescript
client.exec.openapi.listScripts(options?: { directory?: string; dir?: string; subdomain?: string; execId?: string }): Promise<ExecOpenapiListScriptsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `directory` | `string` | No | query | Directory relative to the selected execution namespace, or already prefixed with that namespace. Default `scripts` selects the namespace root, or the scripts root when no namespace applies. Leading slashes are dropped, so an absolute filesystem path is not supported. |
| `dir` | `string` | No | query | Alias of `directory`. Ignored when `directory` is provided. |
| `subdomain` | `string` | No | query | Limit scan to scripts under this subdomain. Falls back to the Host header when omitted. |
| `execId` | `string` | No | query | Limit scan to scripts under this execId. Falls back to the Host header when omitted. |

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

## `client.exec.ops` (1 method)

### `settle`

**POST** `/api/v1/exec/ops/settle`

Settle Op

```typescript
client.exec.ops.settle(data: ExecOpsSettleRequest): Promise<ExecOpsSettleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecOpsSettleRequest` | Yes | body |  |

**Returns:** `ExecOpsSettleResponse`

---

## `client.exec.packages` (3 methods)

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

## `client.exec.packages.manifest` (3 methods)

### `create`

**POST** `/api/v1/exec/package/init`

Init package.json

```typescript
client.exec.packages.manifest.create(data?: ExecPackagesManifestCreateRequest): Promise<ExecPackagesManifestCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecPackagesManifestCreateRequest` | No | body |  |

**Returns:** `ExecPackagesManifestCreateResponse`

**CLI:** `hoody exec packages manifest create`

---

### `get`

**GET** `/api/v1/exec/package/read`

Read package.json

```typescript
client.exec.packages.manifest.get(): Promise<ExecPackagesManifestGetResponse>
```

**Returns:** `ExecPackagesManifestGetResponse`

**CLI:** `hoody exec packages manifest get`

---

### `update`

**POST** `/api/v1/exec/package/update`

Update package.json

```typescript
client.exec.packages.manifest.update(data?: ExecPackagesManifestUpdateRequest): Promise<ExecPackagesManifestUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecPackagesManifestUpdateRequest` | No | body |  |

**Returns:** `ExecPackagesManifestUpdateResponse`

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
client.exec.schedules.list(): Promise<ExecSchedulesListResponse>
```

**Returns:** `ExecSchedulesListResponse`

**CLI:** `hoody exec schedules list`

---

### `listHistory`

**GET** `/api/v1/exec/schedules/history`

Schedule History

```typescript
client.exec.schedules.listHistory(options?: { scriptPath?: string; since?: string; limit?: number; includeRotated?: boolean; cursor?: string }): Promise<ExecSchedulesListHistoryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `scriptPath` | `string` | No | query | Filter entries to one script. An absolute path must be inside scripts-dir. A relative path is scoped like scripts/read: on a host that names an execId (`-exec-&lt;id&gt;`) or a subdomain, it is read as `&lt;subdomain\|default&gt;/&lt;execId&gt;/&lt;path&gt;` (`&lt;subdomain&gt;/&lt;path&gt;` when there is no execId) unless it already starts with that prefix; a `default.` subdomain counts as none. On any other host it is relative to scripts-dir. A path outside scripts-dir is 400. Optional. |
| `since` | `string` | No | query | ISO 8601 lower bound on `ts`. Optional. |
| `limit` | `number` | No | query | Max entries to return. Default 100, hard max 1000. |
| `includeRotated` | `boolean` | No | query | When true, also scan rotated fires.log.* files (slower). |
| `cursor` | `string` | No | query | Continuation token from a previous truncated response; resumes the backward scan where it stopped. Optional. |

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

## `client.exec.scripts` (19 methods)

### `delete`

**DELETE** `/api/v1/exec/scripts/delete`

Delete Script

```typescript
client.exec.scripts.delete(options: { path: string; confirm: "true"; keepCopy?: boolean; ifRevision?: string; opId?: string; expectRoute?: string; note?: string; execId?: string; subdomain?: string }): Promise<ExecScriptsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | query | Script path relative to the scripts directory, for example `api/users.js`. Under the call's scope (`execId` / `exec_id` / `subdomain`, else the Host's `[&lt;subdomain&gt;.]…-exec-&lt;execId&gt;`) it is read as `&lt;subdomain\|default&gt;/&lt;execId&gt;/&lt;path&gt;` unless it already starts with that prefix. Leading slashes are dropped (a path inside the scripts directory is made relative to it), so an absolute computer path such as `/home/user/file.txt` names a file under the scripts directory, not on the computer. |
| `confirm` | `"true"` | Yes | query | Safety confirmation; must be the literal `true` or the request is rejected with 400. `confirm=false` is refused too: the check is for the literal value, not for truthiness. |
| `keepCopy` | `boolean` | No | query | When true, keep a copy in Recently deleted (scripts/history/deleted) that scripts/restore can put back. Needs a regular file. |
| `ifRevision` | `string` | No | query | Delete only this revision (from scripts/read). A different current revision is 409 `REVISION_MISMATCH`, nothing deleted. |
| `opId` | `string` | No | query | Journals the change under this id (16-64 letters, digits, `_` or `-`). Resending the identical request with the same id after it finished answers the stored outcome without changing anything again. Reusing the id for a different request is 409 `OP_ID_REUSED`; an operation not yet finished answers 409 `OP_IN_PROGRESS` or `OP_OUTCOME_UNKNOWN`, and one ops/settle settled as never received answers 409 `OP_FENCED`. ops/settle tells what became of it when the answer was lost. |
| `expectRoute` | `string` | No | query | JSON text of `{"route": "/path", "answeredBy": "&lt;script path relative to the scripts root&gt;" \| null}`: refuse the delete (409 `ROUTE_EFFECT_CHANGED`, nothing done) unless, after it, the route is answered by `answeredBy`. route/resolve with `omit` previews it. |
| `note` | `string` | No | query | A short note (one line, at most 120 printable characters). It is validated but not saved with the retained copy. |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

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

### `getSummary`

**GET** `/api/v1/exec/monitor/scripts-summary`

Get Scripts Summary

```typescript
client.exec.scripts.getSummary(options?: { execId?: string; subdomain?: string }): Promise<ExecScriptsGetSummaryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecScriptsGetSummaryResponse`

---

### `getTree`

**POST** `/api/v1/exec/scripts/tree`

Get Script Tree

```typescript
client.exec.scripts.getTree(data?: ExecScriptsGetTreeRequest, options?: { execId?: string; subdomain?: string }): Promise<ExecScriptsGetTreeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecScriptsGetTreeRequest` | No | body |  |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecScriptsGetTreeResponse`

**CLI:** `hoody exec scripts tree get`

---

### `getUsage`

**GET** `/api/v1/exec/monitor/script-usage`

Get Script Usage

```typescript
client.exec.scripts.getUsage(options: { scriptPath: string; execId?: string; subdomain?: string }): Promise<ExecScriptsGetUsageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `scriptPath` | `string` | Yes | query | The script to report on, scoped like scripts/read: under the call's execId / subdomain unless it already starts with that prefix. |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecScriptsGetUsageResponse`

---

### `list`

**GET** `/api/v1/exec/scripts/list`

List Scripts

```typescript
client.exec.scripts.list(options?: { dir?: string; filter?: string; metadata?: string; label?: string; tags?: string; mode?: string; enabled?: string; websocket?: string; remote?: "any" | "none" | "messages" | "call" | "eval"; recursive?: string; include_comments?: string; exhaustive?: boolean; execId?: string; subdomain?: string }): Promise<ExecScriptsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `dir` | `string` | No | query | Dir query parameter |
| `filter` | `string` | No | query | Filter query parameter |
| `metadata` | `string` | No | query | Set `true` to include each entry's size, creation time and modification time (as `metadata`). Any non-empty value turns it on, `false` included. |
| `label` | `string` | No | query | Label query parameter |
| `tags` | `string` | No | query | Tags query parameter |
| `mode` | `string` | No | query | Mode query parameter |
| `enabled` | `string` | No | query | Enabled query parameter |
| `websocket` | `string` | No | query | Websocket query parameter |
| `remote` | `"any" \| "none" \| "messages" \| "call" \| "eval"` | No | query | Keep only scripts by their remote operations: `any` (at least one of `@remote-messages`, `@remote-call`, `@remote-eval` is on), `none` (all off), or `messages` / `call` / `eval` (that one is on). Lists recursively and adds each script's `magicComments` and `remote` summary, like the other filters. Any other value is refused with 400. |
| `recursive` | `string` | No | query | Recursive query parameter |
| `include_comments` | `string` | No | query | Include_comments query parameter |
| `exhaustive` | `boolean` | No | query | When true, list every entry below `dir` recursively with its `type` (file, directory, symlink, fifo, socket, block-device, character-device, unknown), in `entries` instead of `scripts`. Nothing is hidden (dot-files, node_modules, .git, .hoody-cache, _sdk, _hoody) and no symlink is followed. Combine only with `dir`, `execId`, `exec_id` and `subdomain` (other options are refused with 400). The answer is complete or an error, never partial: more than 10000 entries is 422 with `details.code` `TOO_MANY_ENTRIES`; a name or link target that is not valid UTF-8 is 422 with `details.code` `NAME_NOT_UTF8` (`details.parent`, and the raw name as `details.nameHex`); an entry or directory that disappears or is replaced during the scan, or a directory whose dev, inode, mtime or ctime changed after it was read (checked once the scan is done), restarts it, and a tree still changing after 3 restarts is 409 with `details.code` `TREE_CHANGED`. This is best effort, for a tree nobody mutates concurrently: a change undone within one timestamp tick, or on a filesystem without fine timestamps, can go unseen. |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecScriptsListResponse`

**CLI:** `hoody exec scripts list`

---

### `listDeleted`

**GET** `/api/v1/exec/scripts/history/deleted`

Deleted Scripts

```typescript
client.exec.scripts.listDeleted(options?: { execId?: string; subdomain?: string }): Promise<ExecScriptsListDeletedResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecScriptsListDeletedResponse`

---

### `listHistory`

**GET** `/api/v1/exec/scripts/history`

Script History

```typescript
client.exec.scripts.listHistory(options: { path: string; limit?: number; cursor?: string; execId?: string; subdomain?: string }): Promise<ExecScriptsListHistoryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | query | Path query parameter |
| `limit` | `number` | No | query | Versions per page, 1 to 50. Default 20. |
| `cursor` | `string` | No | query | The `next` value of the previous page. |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecScriptsListHistoryResponse`

---

### `listStats`

**GET** `/api/v1/exec/monitor/scripts`

List Monitor Scripts

```typescript
client.exec.scripts.listStats(options?: { limit?: number; sort?: string }): Promise<ExecScriptsListStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query | Maximum number of scripts to return. Default 100. A value below 1 is raised to 1 and a value above 500 is lowered to 500. Over raw HTTP a value with no leading number means 100 and nothing is refused. |
| `sort` | `string` | No | query | Sort key: `lastActivity` (default), `requests`, `errors`, `p95` or `ws_active`. `lastActivity` puts the most recent activity first; each other key sorts descending by the matching metric. Any other value is not refused: it sorts by last activity, like `lastActivity`. |

**Returns:** `ExecScriptsListStatsResponse`

**CLI:** `hoody exec scripts stats list`

---

### `move`

**POST** `/api/v1/exec/scripts/move`

Move Script

```typescript
client.exec.scripts.move(data: ExecScriptsMoveRequest, options?: { execId?: string; subdomain?: string }): Promise<ExecScriptsMoveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecScriptsMoveRequest` | Yes | body |  |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecScriptsMoveResponse`

**CLI:** `hoody exec scripts move`

---

### `read`

**GET** `/api/v1/exec/scripts/read`

Read Script

```typescript
client.exec.scripts.read(options: { path: string; execId?: string; subdomain?: string }): Promise<ExecScriptsReadResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | query | Script path relative to the scripts directory, for example `api/users.js`. Under the call's scope (`execId` / `exec_id` / `subdomain`, else the Host's `[&lt;subdomain&gt;.]…-exec-&lt;execId&gt;`) it is read as `&lt;subdomain\|default&gt;/&lt;execId&gt;/&lt;path&gt;` unless it already starts with that prefix. Leading slashes are dropped (a path inside the scripts directory is made relative to it), so an absolute computer path such as `/home/user/file.txt` names a file under the scripts directory, not on the computer. |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecScriptsReadResponse`

**CLI:** `hoody exec scripts read`

---

### `readVersion`

**GET** `/api/v1/exec/scripts/history/read`

Read Script Version

```typescript
client.exec.scripts.readVersion(options: { path: string; version: string; execId?: string; subdomain?: string }): Promise<ExecScriptsReadVersionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | query | Path query parameter |
| `version` | `string` | Yes | query | The version to read, from scripts/history or scripts/history/deleted. A version ID: `h-` (history) or `d-` (deleted copy), 1 to 12 lowercase letters or digits, `-`, then 8 hexadecimal digits, for example `h-mjuohs00-8d7c6b5a`. Use the ID the service returned. Unknown: 404 `VERSION_NOT_FOUND`. |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecScriptsReadVersionResponse`

---

### `restore`

**POST** `/api/v1/exec/scripts/restore`

Restore Script

```typescript
client.exec.scripts.restore(data: ExecScriptsRestoreRequest, options?: { execId?: string; subdomain?: string }): Promise<ExecScriptsRestoreResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecScriptsRestoreRequest` | Yes | body |  |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecScriptsRestoreResponse`

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

**CLI:** `hoody exec scripts returntype validate`

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
client.exec.scripts.write(data: ExecScriptsWriteRequest, options?: { execId?: string; subdomain?: string }): Promise<ExecScriptsWriteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecScriptsWriteRequest` | Yes | body |  |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecScriptsWriteResponse`

**CLI:** `hoody exec scripts write`

---

## `client.exec.sdkTypes` (1 method)

### `list`

**GET** `/api/v1/exec/sdk-types`

Get Sdk Types

```typescript
client.exec.sdkTypes.list(options?: { kit?: string; q?: string; limit?: number; raw?: "true" | "false" | "1" | "0" }): Promise<ExecSdkTypesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `kit` | `string` | No | query | Kit to list: a client property (`files`, `api`, `exec`, `sqlite`, …), or `client` for the client's own methods (`withComputer`, `login`, …). Any letter case. An unknown kit is a 404 with `details.kits`. |
| `q` | `string` | No | query | Words, all of which must appear in the method's path, name or summary (any letter case). |
| `limit` | `number` | No | query | Most methods to return, 1 to 100 (default 20). `total` counts every match. |
| `raw` | `"true" \| "false" \| "1" \| "0"` | No | query | When true, also return the `.d.ts` text of the files declaring the returned methods (`dts`, at most 256 KB). Needs `kit` or `q`. |

**Returns:** `ExecSdkTypesListResponse`

**CLI:** `hoody exec sdktypes list`

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
| `id` | `string` | Yes | path | The SDK ID: the exec ID it was imported under, for example `1`. Its directory is `default/&lt;id&gt;`. |

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
| `id` | `string` | Yes | path | The SDK ID: the exec ID it was imported under, for example `1`. Its directory is `default/&lt;id&gt;`. |

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
client.exec.store.clear(data: ExecStoreClearRequest): Promise<ExecStoreClearResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecStoreClearRequest` | Yes | body |  |

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
client.exec.templates.generate(data: ExecTemplatesGenerateRequest, options?: { execId?: string; subdomain?: string }): Promise<ExecTemplatesGenerateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecTemplatesGenerateRequest` | Yes | body |  |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

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
| `includeBuiltin` | `boolean` | No | query | Include built-in templates in the result set. Default `true`. Over raw HTTP the query value may also be `1` or `0`. |
| `includeCustom` | `boolean` | No | query | Include user-supplied templates (from `_hoody/templates/`) in the result set. Default `true`. |

**Returns:** `ExecTemplatesListResponse`

**CLI:** `hoody exec templates list`

---

### `preview`

**GET** `/api/v1/exec/templates/preview`

Preview Template

```typescript
client.exec.templates.preview(options: { name: string; variables?: string }): Promise<ExecTemplatesPreviewResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | query | Name query parameter |
| `variables` | `string` | No | query | Variables query parameter |

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

## `client.exec.tests` (3 methods)

### `delete`

**DELETE** `/api/v1/exec/tests/delete`

Delete Script Tests

```typescript
client.exec.tests.delete(options: { scriptPath: string; ifRevision: string; opId?: string; execId?: string; subdomain?: string }): Promise<ExecTestsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `scriptPath` | `string` | Yes | query | The script whose saved cases to remove, scoped like scripts/read: under the call's execId / subdomain unless it already starts with that prefix. |
| `ifRevision` | `string` | Yes | query | The saved set's revision from tests/list. A different current revision is 409 `REVISION_MISMATCH`, nothing removed. |
| `opId` | `string` | No | query | Journals the change under this id (16-64 letters, digits, `_` or `-`). Resending the identical request with the same id after it finished answers the stored outcome without changing anything again. Reusing the id for a different request is 409 `OP_ID_REUSED`; an operation not yet finished answers 409 `OP_IN_PROGRESS` or `OP_OUTCOME_UNKNOWN`, and one ops/settle settled as never received answers 409 `OP_FENCED`. ops/settle tells what became of it when the answer was lost. |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecTestsDeleteResponse`

---

### `list`

**GET** `/api/v1/exec/tests/list`

List Script Tests

```typescript
client.exec.tests.list(options: { scriptPath: string; execId?: string; subdomain?: string }): Promise<ExecTestsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `scriptPath` | `string` | Yes | query | The script whose saved cases to list, scoped like scripts/read: under the call's execId / subdomain unless it already starts with that prefix. |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecTestsListResponse`

---

### `set`

**PUT** `/api/v1/exec/tests/put`

Put Script Tests

```typescript
client.exec.tests.set(data: ExecTestsSetRequest, options?: { execId?: string; subdomain?: string }): Promise<ExecTestsSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `ExecTestsSetRequest` | Yes | body |  |
| `execId` | `string` | No | query | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | No | query | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `ExecTestsSetResponse`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
