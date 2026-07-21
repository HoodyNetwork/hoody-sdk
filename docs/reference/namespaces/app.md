# `app` — 35 methods

**Version:** 1.0.0-beta.2
**Accessor:** `client.app`

```typescript
import * as app from 'hoody-sdk/app';
```

---

## `client.app.configuration` (1 methods)

### `get`

**GET** `/api/v1/run/config`

Get full runtime configuration

```typescript
client.app.configuration.get(): Promise<AppConfigurationGetResponse>
```

**Returns:** `AppConfigurationGetResponse`

---

## `client.app.docs` (2 methods)

### `getJson`

**GET** `/api/v1/run/openapi.json`

OpenAPI specification (JSON)

```typescript
client.app.docs.getJson(): Promise<AppDocsGetJsonResponse>
```

**Returns:** `AppDocsGetJsonResponse`

---

### `getYaml`

**GET** `/api/v1/run/openapi.yaml`

OpenAPI specification (YAML)

```typescript
client.app.docs.getYaml(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse&lt;unknown&gt;`

---

## `client.app.execution` (10 methods)

### `preflight`

**POST** `/api/v1/run/preflight`

Preflight a run request

```typescript
client.app.execution.preflight(data: AppExecutionPreflightRequest): Promise<AppExecutionPreflightResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AppExecutionPreflightRequest` | Yes | body |  |

**Returns:** `AppExecutionPreflightResponse`

---

### `runAppGet`

**GET** `/api/v1/run/run`

Resolve an application and return exact shell command

```typescript
client.app.execution.runAppGet(options?: { app: string; os?: Os; source?: SourceKind[]; kind?: AppKind; arch?: Arch; tags?: string[]; profile?: string; channel?: string; version?: string; variant?: string; publisher?: string; repo?: string; release?: string; asset?: string; pick?: PickMode; pick_index?: number; candidate_id?: string; set_id?: string; terminal_id?: number; display?: string; origin?: string; defer_pid?: number; defer_start_time_ticks?: string; defer_timeout_ms?: number; defer_poll_ms?: number; dry_run?: boolean; print_curl?: PrintCurlMode; format?: OutputFormat; redirect?: boolean; redirect_to?: string; limit?: number }): Promise<AppRunAppGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `app` | `string` | Yes | query | Primary name query |
| `os` | `Os` | No | query | Target OS filter |
| `source` | `SourceKind[]` | No | query | Source kind filter (repeatable) |
| `kind` | `AppKind` | No | query | App kind filter |
| `arch` | `Arch` | No | query | Target CPU architecture filter |
| `tags` | `string[]` | No | query | Free-form tags for filtering and ranking (repeatable) |
| `profile` | `string` | No | query | Named profile for default preferences |
| `channel` | `string` | No | query | Release channel hint |
| `version` | `string` | No | query | Exact version or provider-defined version constraint |
| `variant` | `string` | No | query | Provider-specific variant hint |
| `publisher` | `string` | No | query | Publisher hint for curated registries |
| `repo` | `string` | No | query | Repository hint such as owner/name |
| `release` | `string` | No | query | Release hint such as a tag name |
| `asset` | `string` | No | query | Desired asset name or pattern |
| `pick` | `PickMode` | No | query | Candidate selection mode (ask, first, index, id) |
| `pick_index` | `number` | No | query | Candidate index (required when pick=index) |
| `candidate_id` | `string` | No | query | Specific candidate ID (required when pick=id) |
| `set_id` | `string` | No | query | Bind pick to a specific candidate set |
| `terminal_id` | `number` | No | query | Terminal session ID (default 1) |
| `display` | `string` | No | query | X11 DISPLAY number |
| `origin` | `string` | No | query | Origin identifier for observability propagation |
| `defer_pid` | `number` | No | query | Defer command injection until this PID exits |
| `defer_start_time_ticks` | `string` | No | query | Start-time ticks used to avoid PID reuse bugs |
| `defer_timeout_ms` | `number` | No | query | Maximum defer wait time in milliseconds |
| `defer_poll_ms` | `number` | No | query | Defer polling interval in milliseconds |
| `dry_run` | `boolean` | No | query | If true, force command-only response (no delegation) |
| `print_curl` | `PrintCurlMode` | No | query | Generate curl command (hoody-run or hoody-terminal) |
| `format` | `OutputFormat` | No | query | Output format (json or html) |
| `redirect` | `boolean` | No | query | Redirect to display page after scheduling |
| `redirect_to` | `string` | No | query | Override redirect target URL |
| `limit` | `number` | No | query | Max candidates (default 25) |

**Returns:** `AppRunAppGetResponse`

---

### `runAppPost`

**POST** `/api/v1/run/run`

Resolve an application via JSON body

```typescript
client.app.execution.runAppPost(data: AppRunAppPostRequest): Promise<AppRunAppPostResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AppRunAppPostRequest` | Yes | body |  |

**Returns:** `AppRunAppPostResponse`

---

### `runBatch`

**POST** `/api/v1/run/batch`

Execute a batch of search or run requests

```typescript
client.app.execution.runBatch(data: AppExecutionRunBatchRequest): Promise<AppExecutionRunBatchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AppExecutionRunBatchRequest` | Yes | body |  |

**Returns:** `AppExecutionRunBatchResponse`

---

### `runPathBased`

**GET** `/api/v1/run/go/{rest}`

Path-based resolve (positional or key-value)

```typescript
client.app.execution.runPathBased(rest: string, options?: { os?: Os; source?: SourceKind[]; kind?: AppKind; arch?: Arch; tags?: string[]; profile?: string; channel?: string; version?: string; variant?: string; publisher?: string; repo?: string; release?: string; asset?: string; pick?: PickMode; pick_index?: number; candidate_id?: string; set_id?: string; terminal_id?: number; display?: string; origin?: string; defer_pid?: number; defer_start_time_ticks?: string; defer_timeout_ms?: number; defer_poll_ms?: number; dry_run?: boolean; print_curl?: PrintCurlMode; format?: OutputFormat; redirect?: boolean; redirect_to?: string; limit?: number }): Promise<AppExecutionRunPathBasedResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `rest` | `string` | Yes | path | Path segments for positional or key-value app specification |
| `os` | `Os` | No | query | Target OS filter when not supplied in the path |
| `source` | `SourceKind[]` | No | query | Source kind filter (repeatable) |
| `kind` | `AppKind` | No | query | App kind filter when not supplied in the path |
| `arch` | `Arch` | No | query | Target CPU architecture filter |
| `tags` | `string[]` | No | query | Free-form tags for filtering and ranking (repeatable) |
| `profile` | `string` | No | query | Named profile for default preferences |
| `channel` | `string` | No | query | Release channel hint |
| `version` | `string` | No | query | Exact version or provider-defined version constraint |
| `variant` | `string` | No | query | Provider-specific variant hint |
| `publisher` | `string` | No | query | Publisher hint for curated registries |
| `repo` | `string` | No | query | Repository hint such as owner/name |
| `release` | `string` | No | query | Release hint such as a tag name |
| `asset` | `string` | No | query | Desired asset name or pattern |
| `pick` | `PickMode` | No | query | Candidate selection mode (ask, first, index, id) |
| `pick_index` | `number` | No | query | Candidate index (required when pick=index) |
| `candidate_id` | `string` | No | query | Specific candidate ID (required when pick=id) |
| `set_id` | `string` | No | query | Bind pick to a specific candidate set |
| `terminal_id` | `number` | No | query | Terminal session ID when not supplied in the path |
| `display` | `string` | No | query | X11 DISPLAY number |
| `origin` | `string` | No | query | Origin identifier for observability propagation |
| `defer_pid` | `number` | No | query | Defer command injection until this PID exits |
| `defer_start_time_ticks` | `string` | No | query | Start-time ticks used to avoid PID reuse bugs |
| `defer_timeout_ms` | `number` | No | query | Maximum defer wait time in milliseconds |
| `defer_poll_ms` | `number` | No | query | Defer polling interval in milliseconds |
| `dry_run` | `boolean` | No | query | If true, force command-only response (no delegation) |
| `print_curl` | `PrintCurlMode` | No | query | Generate curl command (hoody-run or hoody-terminal) |
| `format` | `OutputFormat` | No | query | Output format (json or html) |
| `redirect` | `boolean` | No | query | Redirect to display page after scheduling |
| `redirect_to` | `string` | No | query | Override redirect target URL |
| `limit` | `number` | No | query | Max candidates (default 25) |

**Returns:** `AppExecutionRunPathBasedResponse`

---

### `runTerminalAnchored`

**GET** `/api/v1/run/t/{terminal_id}/go/{rest}`

Terminal-anchored path-based resolve

```typescript
client.app.execution.runTerminalAnchored(terminal_id: number, rest: string, options?: { os?: Os; source?: SourceKind[]; kind?: AppKind; arch?: Arch; tags?: string[]; profile?: string; channel?: string; version?: string; variant?: string; publisher?: string; repo?: string; release?: string; asset?: string; pick?: PickMode; pick_index?: number; candidate_id?: string; set_id?: string; display?: string; origin?: string; defer_pid?: number; defer_start_time_ticks?: string; defer_timeout_ms?: number; defer_poll_ms?: number; dry_run?: boolean; print_curl?: PrintCurlMode; format?: OutputFormat; redirect?: boolean; redirect_to?: string; limit?: number }): Promise<AppExecutionRunTerminalAnchoredResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `terminal_id` | `number` | Yes | path | Terminal session ID (1-65535) |
| `rest` | `string` | Yes | path | Path segments for app specification |
| `os` | `Os` | No | query | Target OS filter when not supplied in the path |
| `source` | `SourceKind[]` | No | query | Source kind filter (repeatable) |
| `kind` | `AppKind` | No | query | App kind filter when not supplied in the path |
| `arch` | `Arch` | No | query | Target CPU architecture filter |
| `tags` | `string[]` | No | query | Free-form tags for filtering and ranking (repeatable) |
| `profile` | `string` | No | query | Named profile for default preferences |
| `channel` | `string` | No | query | Release channel hint |
| `version` | `string` | No | query | Exact version or provider-defined version constraint |
| `variant` | `string` | No | query | Provider-specific variant hint |
| `publisher` | `string` | No | query | Publisher hint for curated registries |
| `repo` | `string` | No | query | Repository hint such as owner/name |
| `release` | `string` | No | query | Release hint such as a tag name |
| `asset` | `string` | No | query | Desired asset name or pattern |
| `pick` | `PickMode` | No | query | Candidate selection mode (ask, first, index, id) |
| `pick_index` | `number` | No | query | Candidate index (required when pick=index) |
| `candidate_id` | `string` | No | query | Specific candidate ID (required when pick=id) |
| `set_id` | `string` | No | query | Bind pick to a specific candidate set |
| `display` | `string` | No | query | X11 DISPLAY number |
| `origin` | `string` | No | query | Origin identifier for observability propagation |
| `defer_pid` | `number` | No | query | Defer command injection until this PID exits |
| `defer_start_time_ticks` | `string` | No | query | Start-time ticks used to avoid PID reuse bugs |
| `defer_timeout_ms` | `number` | No | query | Maximum defer wait time in milliseconds |
| `defer_poll_ms` | `number` | No | query | Defer polling interval in milliseconds |
| `dry_run` | `boolean` | No | query | If true, force command-only response (no delegation) |
| `print_curl` | `PrintCurlMode` | No | query | Generate curl command (hoody-run or hoody-terminal) |
| `format` | `OutputFormat` | No | query | Output format (json or html) |
| `redirect` | `boolean` | No | query | Redirect to display page after scheduling |
| `redirect_to` | `string` | No | query | Override redirect target URL |
| `limit` | `number` | No | query | Max candidates (default 25) |

**Returns:** `AppExecutionRunTerminalAnchoredResponse`

---

### `searchCandidates`

**GET** `/api/v1/run/search`

Search for app candidates

```typescript
client.app.execution.searchCandidates(options?: { app: string; os?: Os; source?: SourceKind[]; kind?: AppKind; arch?: Arch; tags?: string[]; profile?: string; channel?: string; version?: string; variant?: string; publisher?: string; repo?: string; release?: string; asset?: string; limit?: number }): Promise<AppExecutionSearchCandidatesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `app` | `string` | Yes | query | Primary name query (aliases q, name) |
| `os` | `Os` | No | query | Target OS filter |
| `source` | `SourceKind[]` | No | query | Source kind filter (repeatable) |
| `kind` | `AppKind` | No | query | App kind filter (gui, cli, any) |
| `arch` | `Arch` | No | query | Target CPU architecture filter |
| `tags` | `string[]` | No | query | Free-form tags for filtering and ranking (repeatable) |
| `profile` | `string` | No | query | Named profile for default preferences |
| `channel` | `string` | No | query | Release channel hint (for example stable or beta) |
| `version` | `string` | No | query | Exact version or provider-defined version constraint |
| `variant` | `string` | No | query | Provider-specific variant hint (for example portable or headless) |
| `publisher` | `string` | No | query | Publisher hint for curated registries |
| `repo` | `string` | No | query | Repository hint such as owner/name |
| `release` | `string` | No | query | Release hint such as a tag name |
| `asset` | `string` | No | query | Desired asset name or pattern |
| `limit` | `number` | No | query | Max candidates to return (default 25) |

**Returns:** `AppExecutionSearchCandidatesResponse`

---

### `searchCandidatesPaged`

**POST** `/api/v1/run/search/paged`

Search for app candidates with cursor pagination

```typescript
client.app.execution.searchCandidatesPaged(data: AppExecutionSearchCandidatesPagedRequest): Promise<AppExecutionSearchCandidatesPagedResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AppExecutionSearchCandidatesPagedRequest` | Yes | body |  |

**Returns:** `AppExecutionSearchCandidatesPagedResponse`

---

### `searchCandidatesPagedAll`

**POST** `/api/v1/run/search/paged`

Search for app candidates with cursor pagination (collect all pages)

```typescript
client.app.execution.searchCandidatesPagedAll(data: AppExecutionSearchCandidatesPagedRequest): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AppExecutionSearchCandidatesPagedRequest` | Yes | body |  |

**Returns:** `unknown[]`

---

### `searchCandidatesPagedIterator`

**POST** `/api/v1/run/search/paged`

Search for app candidates with cursor pagination (async iterator)

```typescript
client.app.execution.searchCandidatesPagedIterator(data: AppExecutionSearchCandidatesPagedRequest): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AppExecutionSearchCandidatesPagedRequest` | Yes | body |  |

**Returns:** `AsyncIterableIterator&lt;unknown&gt;`

---

## `client.app.health` (1 methods)

### `check`

**GET** `/api/v1/run/health`

Service health check

```typescript
client.app.health.check(): Promise<AppHealthCheckResponse>
```

**Returns:** `AppHealthCheckResponse`

---

## `client.app.jobs` (2 methods)

### `createSearch`

**POST** `/api/v1/run/search/jobs`

Start an async search job

```typescript
client.app.jobs.createSearch(data: AppJobsCreateSearchRequest): Promise<AppJobsCreateSearchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AppJobsCreateSearchRequest` | Yes | body |  |

**Returns:** `AppJobsCreateSearchResponse`

---

### `getStatus`

**GET** `/api/v1/run/jobs/{job_id}`

Get job status

```typescript
client.app.jobs.getStatus(job_id: string, options?: { wait?: string; timeout_ms?: number }): Promise<AppJobsGetStatusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `job_id` | `string` | Yes | path | Job identifier (UUID) |
| `wait` | `string` | No | query | Set to 'done' to long-poll until job completes |
| `timeout_ms` | `number` | No | query | Long-poll timeout in milliseconds (default 0, max 120000) |

**Returns:** `AppJobsGetStatusResponse`

---

## `client.app.profiles` (5 methods)

### `create`

**POST** `/api/v1/run/profiles`

Create a new profile

```typescript
client.app.profiles.create(data: AppProfilesCreateRequest): Promise<AppProfilesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AppProfilesCreateRequest` | Yes | body |  |

**Returns:** `AppProfilesCreateResponse`

---

### `delete`

**DELETE** `/api/v1/run/profiles/{profile}`

Delete a profile

```typescript
client.app.profiles.delete(profile: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `profile` | `string` | Yes | path | Profile name |

**Returns:** `ApiResponse&lt;unknown&gt;`

---

### `list`

**GET** `/api/v1/run/profiles`

List all profiles

```typescript
client.app.profiles.list(): Promise<AppProfilesListResponse>
```

**Returns:** `AppProfilesListResponse`

---

### `select`

**POST** `/api/v1/run/profiles/{profile}/select`

Select the active profile

```typescript
client.app.profiles.select(profile: string): Promise<AppProfilesSelectResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `profile` | `string` | Yes | path | Profile name to select |

**Returns:** `AppProfilesSelectResponse`

---

### `update`

**PATCH** `/api/v1/run/profiles/{profile}`

Update a profile

```typescript
client.app.profiles.update(profile: string, data: AppProfilesUpdateRequest): Promise<AppProfilesUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `profile` | `string` | Yes | path | Profile name |
| `data` | `AppProfilesUpdateRequest` | Yes | body |  |

**Returns:** `AppProfilesUpdateResponse`

---

## `client.app.recipes` (7 methods)

### `create`

**POST** `/api/v1/run/recipes`

Create a saved recipe

```typescript
client.app.recipes.create(data: AppRecipesCreateRequest): Promise<AppRecipesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AppRecipesCreateRequest` | Yes | body |  |

**Returns:** `AppRecipesCreateResponse`

---

### `delete`

**DELETE** `/api/v1/run/recipes/{name}`

Delete a saved recipe

```typescript
client.app.recipes.delete(name: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Recipe name |

**Returns:** `ApiResponse&lt;unknown&gt;`

---

### `get`

**GET** `/api/v1/run/recipes/{name}`

Get a saved recipe

```typescript
client.app.recipes.get(name: string): Promise<AppRecipesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Recipe name |

**Returns:** `AppRecipesGetResponse`

---

### `list`

**GET** `/api/v1/run/recipes`

List saved launch recipes

```typescript
client.app.recipes.list(): Promise<AppRecipesListResponse>
```

**Returns:** `AppRecipesListResponse`

---

### `run`

**POST** `/api/v1/run/recipes/{name}/run`

Run using a saved recipe

```typescript
client.app.recipes.run(name: string, data: AppRecipesRunRequest): Promise<AppRecipesRunResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Recipe name |
| `data` | `AppRecipesRunRequest` | Yes | body |  |

**Returns:** `AppRecipesRunResponse`

---

### `search`

**POST** `/api/v1/run/recipes/{name}/search`

Search using a saved recipe

```typescript
client.app.recipes.search(name: string, data: AppRecipesSearchRequest): Promise<AppRecipesSearchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Recipe name |
| `data` | `AppRecipesSearchRequest` | Yes | body |  |

**Returns:** `AppRecipesSearchResponse`

---

### `update`

**PATCH** `/api/v1/run/recipes/{name}`

Update a saved recipe

```typescript
client.app.recipes.update(name: string, data: AppRecipesUpdateRequest): Promise<AppRecipesUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Recipe name |
| `data` | `AppRecipesUpdateRequest` | Yes | body |  |

**Returns:** `AppRecipesUpdateResponse`

---

## `client.app.sources` (7 methods)

### `create`

**POST** `/api/v1/run/sources`

Create a new package source

```typescript
client.app.sources.create(data: AppSourcesCreateRequest): Promise<AppSourcesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `AppSourcesCreateRequest` | Yes | body |  |

**Returns:** `AppSourcesCreateResponse`

---

### `delete`

**DELETE** `/api/v1/run/sources/{source_id}`

Delete a package source

```typescript
client.app.sources.delete(source_id: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source_id` | `string` | Yes | path | Source identifier |

**Returns:** `ApiResponse&lt;unknown&gt;`

---

### `getDiagnostics`

**GET** `/api/v1/run/sources/{source_id}/diagnostics`

Get runtime diagnostics for a source

```typescript
client.app.sources.getDiagnostics(source_id: string): Promise<AppSourcesGetDiagnosticsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source_id` | `string` | Yes | path | Source identifier |

**Returns:** `AppSourcesGetDiagnosticsResponse`

---

### `list`

**GET** `/api/v1/run/sources`

List all package sources

```typescript
client.app.sources.list(): Promise<AppSourcesListResponse>
```

**Returns:** `AppSourcesListResponse`

---

### `sync`

**POST** `/api/v1/run/sources/{source_id}/sync`

Sync a single source

```typescript
client.app.sources.sync(source_id: string): Promise<AppSourcesSyncResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source_id` | `string` | Yes | path | Source identifier |

**Returns:** `AppSourcesSyncResponse`

---

### `syncAll`

**POST** `/api/v1/run/sources/sync`

Sync all sources

```typescript
client.app.sources.syncAll(): Promise<AppSourcesSyncAllResponse>
```

**Returns:** `AppSourcesSyncAllResponse`

---

### `update`

**PATCH** `/api/v1/run/sources/{source_id}`

Update a package source

```typescript
client.app.sources.update(source_id: string, data: AppSourcesUpdateRequest): Promise<AppSourcesUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source_id` | `string` | Yes | path | Source identifier |
| `data` | `AppSourcesUpdateRequest` | Yes | body |  |

**Returns:** `AppSourcesUpdateResponse`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
