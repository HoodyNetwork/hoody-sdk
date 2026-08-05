# `run` — 35 methods

**Version:** 1.0.0-beta.11
**Accessor:** `client.run`

```typescript
import * as run from 'hoody-sdk/run';
```

---

## `client.run.configuration` (1 method)

### `getConfig`

**GET** `/api/v1/run/config`

Get full runtime configuration

```typescript
client.run.configuration.getConfig(): Promise<RunGetConfigResponse>
```

**Returns:** `RunGetConfigResponse`

---

## `client.run.documentation` (2 methods)

### `getOpenApiJson`

**GET** `/api/v1/run/openapi.json`

OpenAPI specification (JSON)

```typescript
client.run.documentation.getOpenApiJson(): Promise<RunGetOpenApiJsonResponse>
```

**Returns:** `RunGetOpenApiJsonResponse`

---

### `getOpenApiYaml`

**GET** `/api/v1/run/openapi.yaml`

OpenAPI specification (YAML)

```typescript
client.run.documentation.getOpenApiYaml(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

---

## `client.run.jobs` (2 methods)

### `createSearchJob`

**POST** `/api/v1/run/search/jobs`

Start an async search job

```typescript
client.run.jobs.createSearchJob(data: RunCreateSearchJobRequest): Promise<RunCreateSearchJobResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `RunCreateSearchJobRequest` | Yes | body |  |

**Returns:** `RunCreateSearchJobResponse`

---

### `getJobStatus`

**GET** `/api/v1/run/jobs/{job_id}`

Get job status

```typescript
client.run.jobs.getJobStatus(job_id: string, options?: { wait?: string; timeout_ms?: number }): Promise<RunGetJobStatusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `job_id` | `string` | Yes | path | Job identifier (UUID) |
| `wait` | `string` | No | query | Set to 'done' to long-poll until job completes |
| `timeout_ms` | `number` | No | query | Long-poll timeout in milliseconds (default 0, max 120000) |

**Returns:** `RunGetJobStatusResponse`

---

## `client.run.profiles` (5 methods)

### `createProfile`

**POST** `/api/v1/run/profiles`

Create a new profile

```typescript
client.run.profiles.createProfile(data: RunCreateProfileRequest): Promise<RunCreateProfileResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `RunCreateProfileRequest` | Yes | body |  |

**Returns:** `RunCreateProfileResponse`

---

### `deleteProfile`

**DELETE** `/api/v1/run/profiles/{profile}`

Delete a profile

```typescript
client.run.profiles.deleteProfile(profile: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `profile` | `string` | Yes | path | Profile name |

**Returns:** `ApiResponse<unknown>`

---

### `listProfiles`

**GET** `/api/v1/run/profiles`

List all profiles

```typescript
client.run.profiles.listProfiles(): Promise<RunListProfilesResponse>
```

**Returns:** `RunListProfilesResponse`

---

### `selectProfile`

**POST** `/api/v1/run/profiles/{profile}/select`

Select the active profile

```typescript
client.run.profiles.selectProfile(profile: string): Promise<RunSelectProfileResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `profile` | `string` | Yes | path | Profile name to select |

**Returns:** `RunSelectProfileResponse`

---

### `updateProfile`

**PATCH** `/api/v1/run/profiles/{profile}`

Update a profile

```typescript
client.run.profiles.updateProfile(profile: string, data: RunUpdateProfileRequest): Promise<RunUpdateProfileResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `profile` | `string` | Yes | path | Profile name |
| `data` | `RunUpdateProfileRequest` | Yes | body |  |

**Returns:** `RunUpdateProfileResponse`

---

## `client.run.recipes` (7 methods)

### `createRecipe`

**POST** `/api/v1/run/recipes`

Create a saved recipe

```typescript
client.run.recipes.createRecipe(data: RunCreateRecipeRequest): Promise<RunCreateRecipeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `RunCreateRecipeRequest` | Yes | body |  |

**Returns:** `RunCreateRecipeResponse`

---

### `deleteRecipe`

**DELETE** `/api/v1/run/recipes/{name}`

Delete a saved recipe

```typescript
client.run.recipes.deleteRecipe(name: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Recipe name |

**Returns:** `ApiResponse<unknown>`

---

### `getRecipe`

**GET** `/api/v1/run/recipes/{name}`

Get a saved recipe

```typescript
client.run.recipes.getRecipe(name: string): Promise<RunGetRecipeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Recipe name |

**Returns:** `RunGetRecipeResponse`

---

### `listRecipes`

**GET** `/api/v1/run/recipes`

List saved launch recipes

```typescript
client.run.recipes.listRecipes(): Promise<RunListRecipesResponse>
```

**Returns:** `RunListRecipesResponse`

---

### `runRecipe`

**POST** `/api/v1/run/recipes/{name}/run`

Run using a saved recipe

```typescript
client.run.recipes.runRecipe(name: string, data: RunRunRecipeRequest): Promise<RunRunRecipeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Recipe name |
| `data` | `RunRunRecipeRequest` | Yes | body |  |

**Returns:** `RunRunRecipeResponse`

---

### `searchRecipe`

**POST** `/api/v1/run/recipes/{name}/search`

Search using a saved recipe

```typescript
client.run.recipes.searchRecipe(name: string, data: RunSearchRecipeRequest): Promise<RunSearchRecipeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Recipe name |
| `data` | `RunSearchRecipeRequest` | Yes | body |  |

**Returns:** `RunSearchRecipeResponse`

---

### `updateRecipe`

**PATCH** `/api/v1/run/recipes/{name}`

Update a saved recipe

```typescript
client.run.recipes.updateRecipe(name: string, data: RunUpdateRecipeRequest): Promise<RunUpdateRecipeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Recipe name |
| `data` | `RunUpdateRecipeRequest` | Yes | body |  |

**Returns:** `RunUpdateRecipeResponse`

---

## `client.run` (11 methods)

### `healthCheck`

**GET** `/api/v1/run/health`

Service health check

```typescript
client.run.healthCheck(): Promise<RunHealthCheckResponse>
```

**Returns:** `RunHealthCheckResponse`

---

### `preflightRun`

**POST** `/api/v1/run/preflight`

Preflight a run request

```typescript
client.run.preflightRun(data: RunPreflightRunRequest): Promise<RunPreflightRunResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `RunPreflightRunRequest` | Yes | body |  |

**Returns:** `RunPreflightRunResponse`

---

### `resolve`

**POST** `/api/v1/run/resolve`

Resolve an application via JSON body

```typescript
client.run.resolve(data: RunResolveRequest): Promise<RunResolveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `RunResolveRequest` | Yes | body |  |

**Returns:** `RunResolveResponse`

---

### `resolveGet`

**GET** `/api/v1/run/resolve`

Resolve an application and return exact shell command

```typescript
client.run.resolveGet(options?: { app: string; os?: Os; source?: SourceKind[]; kind?: AppKind; arch?: Arch; tags?: string[]; profile?: string; channel?: string; version?: string; variant?: string; publisher?: string; repo?: string; release?: string; asset?: string; pick?: PickMode; pick_index?: number; candidate_id?: string; set_id?: string; terminal_id?: number; display?: string; origin?: string; dry_run?: boolean; print_curl?: PrintCurlMode; format?: OutputFormat; limit?: number }): Promise<RunResolveGetResponse>
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
| `dry_run` | `boolean` | No | query | If true, force command-only response (hoody-run never executes) |
| `print_curl` | `PrintCurlMode` | No | query | Generate curl command (hoody-run) |
| `format` | `OutputFormat` | No | query | Output format (json or html) |
| `limit` | `number` | No | query | Max candidates (default 25) |

**Returns:** `RunResolveGetResponse`

---

### `runBatch`

**POST** `/api/v1/run/batch`

Execute a batch of search or run requests

```typescript
client.run.runBatch(data: RunRunBatchRequest): Promise<RunRunBatchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `RunRunBatchRequest` | Yes | body |  |

**Returns:** `RunRunBatchResponse`

---

### `runPathBased`

**GET** `/api/v1/run/go/{rest}`

Path-based resolve (positional or key-value)

```typescript
client.run.runPathBased(rest: string, options?: { os?: Os; source?: SourceKind[]; kind?: AppKind; arch?: Arch; tags?: string[]; profile?: string; channel?: string; version?: string; variant?: string; publisher?: string; repo?: string; release?: string; asset?: string; pick?: PickMode; pick_index?: number; candidate_id?: string; set_id?: string; terminal_id?: number; display?: string; origin?: string; dry_run?: boolean; print_curl?: PrintCurlMode; format?: OutputFormat; limit?: number }): Promise<RunRunPathBasedResponse>
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
| `dry_run` | `boolean` | No | query | If true, force command-only response (hoody-run never executes) |
| `print_curl` | `PrintCurlMode` | No | query | Generate curl command (hoody-run) |
| `format` | `OutputFormat` | No | query | Output format (json or html) |
| `limit` | `number` | No | query | Max candidates (default 25) |

**Returns:** `RunRunPathBasedResponse`

---

### `runTerminalAnchored`

**GET** `/api/v1/run/t/{terminal_id}/go/{rest}`

Terminal-anchored path-based resolve

```typescript
client.run.runTerminalAnchored(terminal_id: number, rest: string, options?: { os?: Os; source?: SourceKind[]; kind?: AppKind; arch?: Arch; tags?: string[]; profile?: string; channel?: string; version?: string; variant?: string; publisher?: string; repo?: string; release?: string; asset?: string; pick?: PickMode; pick_index?: number; candidate_id?: string; set_id?: string; display?: string; origin?: string; dry_run?: boolean; print_curl?: PrintCurlMode; format?: OutputFormat; limit?: number }): Promise<RunRunTerminalAnchoredResponse>
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
| `dry_run` | `boolean` | No | query | If true, force command-only response (hoody-run never executes) |
| `print_curl` | `PrintCurlMode` | No | query | Generate curl command (hoody-run) |
| `format` | `OutputFormat` | No | query | Output format (json or html) |
| `limit` | `number` | No | query | Max candidates (default 25) |

**Returns:** `RunRunTerminalAnchoredResponse`

---

### `searchCandidates`

**GET** `/api/v1/run/search`

Search for app candidates

```typescript
client.run.searchCandidates(options?: { app: string; os?: Os; source?: SourceKind[]; kind?: AppKind; arch?: Arch; tags?: string[]; profile?: string; channel?: string; version?: string; variant?: string; publisher?: string; repo?: string; release?: string; asset?: string; limit?: number }): Promise<RunSearchCandidatesResponse>
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

**Returns:** `RunSearchCandidatesResponse`

---

### `searchCandidatesPaged`

**POST** `/api/v1/run/search/paged`

Search for app candidates with cursor pagination

```typescript
client.run.searchCandidatesPaged(data: RunSearchCandidatesPagedRequest): Promise<RunSearchCandidatesPagedResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `RunSearchCandidatesPagedRequest` | Yes | body |  |

**Returns:** `RunSearchCandidatesPagedResponse`

---

### `searchCandidatesPagedAll`

**POST** `/api/v1/run/search/paged`

Search for app candidates with cursor pagination (collect all pages)

```typescript
client.run.searchCandidatesPagedAll(data: RunSearchCandidatesPagedRequest): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `RunSearchCandidatesPagedRequest` | Yes | body |  |

**Returns:** `unknown[]`

---

### `searchCandidatesPagedIterator`

**POST** `/api/v1/run/search/paged`

Search for app candidates with cursor pagination (async iterator)

```typescript
client.run.searchCandidatesPagedIterator(data: RunSearchCandidatesPagedRequest): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `RunSearchCandidatesPagedRequest` | Yes | body |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

## `client.run.sources` (7 methods)

### `createSource`

**POST** `/api/v1/run/sources`

Create a new package source

```typescript
client.run.sources.createSource(data: RunCreateSourceRequest): Promise<RunCreateSourceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `RunCreateSourceRequest` | Yes | body |  |

**Returns:** `RunCreateSourceResponse`

---

### `deleteSource`

**DELETE** `/api/v1/run/sources/{source_id}`

Delete a package source

```typescript
client.run.sources.deleteSource(source_id: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source_id` | `string` | Yes | path | Source identifier |

**Returns:** `ApiResponse<unknown>`

---

### `getSourceDiagnostics`

**GET** `/api/v1/run/sources/{source_id}/diagnostics`

Get runtime diagnostics for a source

```typescript
client.run.sources.getSourceDiagnostics(source_id: string): Promise<RunGetSourceDiagnosticsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source_id` | `string` | Yes | path | Source identifier |

**Returns:** `RunGetSourceDiagnosticsResponse`

---

### `listSources`

**GET** `/api/v1/run/sources`

List all package sources

```typescript
client.run.sources.listSources(): Promise<RunListSourcesResponse>
```

**Returns:** `RunListSourcesResponse`

---

### `syncAllSources`

**POST** `/api/v1/run/sources/sync`

Sync all sources

```typescript
client.run.sources.syncAllSources(): Promise<RunSyncAllSourcesResponse>
```

**Returns:** `RunSyncAllSourcesResponse`

---

### `syncSource`

**POST** `/api/v1/run/sources/{source_id}/sync`

Sync a single source

```typescript
client.run.sources.syncSource(source_id: string): Promise<RunSyncSourceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source_id` | `string` | Yes | path | Source identifier |

**Returns:** `RunSyncSourceResponse`

---

### `updateSource`

**PATCH** `/api/v1/run/sources/{source_id}`

Update a package source

```typescript
client.run.sources.updateSource(source_id: string, data: RunUpdateSourceRequest): Promise<RunUpdateSourceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source_id` | `string` | Yes | path | Source identifier |
| `data` | `RunUpdateSourceRequest` | Yes | body |  |

**Returns:** `RunUpdateSourceResponse`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
