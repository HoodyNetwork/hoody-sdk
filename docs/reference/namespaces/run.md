# `run` — 30 methods

**Version:** 1.0.0-beta.15
**Accessor:** `client.run`

```typescript
import * as run from 'hoody-sdk/run';
```

---

## `client.run.config` (1 method)

### `get`

**GET** `/api/v1/run/config`

Get full runtime configuration

```typescript
client.run.config.get(): Promise<RunConfigGetResponse>
```

**Returns:** `RunConfigGetResponse`

**CLI:** `hoody run config get`

---

## `client.run.jobs` (4 methods)

### `cancel`

**POST** `/api/v1/run/jobs/{job_id}/cancel`

Cancel a search job

```typescript
client.run.jobs.cancel(job_id: string): Promise<RunJobsCancelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `job_id` | `string` | Yes | path | Job identifier (UUID) |

**Returns:** `RunJobsCancelResponse`

**CLI:** `hoody run jobs cancel`

---

### `createSearch`

**POST** `/api/v1/run/search/jobs`

Start an async search job

```typescript
client.run.jobs.createSearch(data: RunJobsCreateSearchRequest): Promise<RunJobsCreateSearchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `RunJobsCreateSearchRequest` | Yes | body |  |

**Returns:** `RunJobsCreateSearchResponse`

**CLI:** `hoody run jobs search create`

---

### `get`

**GET** `/api/v1/run/jobs/{job_id}`

Get job status

```typescript
client.run.jobs.get(job_id: string, options?: { wait?: string; timeout_ms?: number; cache?: boolean | number }): Promise<RunJobsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `job_id` | `string` | Yes | path | Job identifier (UUID) |
| `wait` | `string` | No | query | Set to 'done' to long-poll until the job completes, fails or is cancelled |
| `timeout_ms` | `number` | No | query | Long-poll timeout in milliseconds (default 0, max 120000) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `RunJobsGetResponse`

**CLI:** `hoody run jobs get`

---

### `list`

**GET** `/api/v1/run/jobs`

List background jobs

```typescript
client.run.jobs.list(options?: { kind?: "search-resolve" | "source-sync"; status?: "queued" | "running" | "done" | "error" | "cancelled"; cache?: boolean | number }): Promise<RunJobsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `kind` | `"search-resolve" \| "source-sync"` | No | query | Only jobs of this kind |
| `status` | `"queued" \| "running" \| "done" \| "error" \| "cancelled"` | No | query | Only jobs in this status |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `RunJobsListResponse`

**CLI:** `hoody run jobs list`

---

## `client.run.profiles` (5 methods)

### `create`

**POST** `/api/v1/run/profiles`

Create a new profile

```typescript
client.run.profiles.create(data: RunProfilesCreateRequest): Promise<RunProfilesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `RunProfilesCreateRequest` | Yes | body |  |

**Returns:** `RunProfilesCreateResponse`

**CLI:** `hoody run profiles create`

---

### `delete`

**DELETE** `/api/v1/run/profiles/{profile}`

Delete a profile

```typescript
client.run.profiles.delete(profile: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `profile` | `string` | Yes | path | Profile name |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody run profiles delete`

---

### `list`

**GET** `/api/v1/run/profiles`

List all profiles

```typescript
client.run.profiles.list(): Promise<RunProfilesListResponse>
```

**Returns:** `RunProfilesListResponse`

**CLI:** `hoody run profiles list`

---

### `update`

**PATCH** `/api/v1/run/profiles/{profile}`

Update a profile

```typescript
client.run.profiles.update(profile: string, data: RunProfilesUpdateRequest): Promise<RunProfilesUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `profile` | `string` | Yes | path | Profile name |
| `data` | `RunProfilesUpdateRequest` | Yes | body |  |

**Returns:** `RunProfilesUpdateResponse`

**CLI:** `hoody run profiles update`

---

### `use`

**POST** `/api/v1/run/profiles/{profile}/select`

Select the active profile

```typescript
client.run.profiles.use(profile: string): Promise<RunProfilesUseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `profile` | `string` | Yes | path | Profile name to select |

**Returns:** `RunProfilesUseResponse`

**CLI:** `hoody run profiles use`

---

## `client.run.recipes` (7 methods)

### `create`

**POST** `/api/v1/run/recipes`

Create a saved recipe

```typescript
client.run.recipes.create(data: RunRecipesCreateRequest): Promise<RunRecipesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `RunRecipesCreateRequest` | Yes | body |  |

**Returns:** `RunRecipesCreateResponse`

**CLI:** `hoody run recipes create`

---

### `delete`

**DELETE** `/api/v1/run/recipes/{name}`

Delete a saved recipe

```typescript
client.run.recipes.delete(name: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Recipe name |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody run recipes delete`

---

### `get`

**GET** `/api/v1/run/recipes/{name}`

Get a saved recipe

```typescript
client.run.recipes.get(name: string): Promise<RunRecipesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Recipe name |

**Returns:** `RunRecipesGetResponse`

**CLI:** `hoody run recipes get`

---

### `list`

**GET** `/api/v1/run/recipes`

List saved launch recipes

```typescript
client.run.recipes.list(): Promise<RunRecipesListResponse>
```

**Returns:** `RunRecipesListResponse`

**CLI:** `hoody run recipes list`

---

### `resolve`

**POST** `/api/v1/run/recipes/{name}/run`

Run using a saved recipe

```typescript
client.run.recipes.resolve(name: string, data: RunRecipesResolveRequest): Promise<RunRecipesResolveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Recipe name |
| `data` | `RunRecipesResolveRequest` | Yes | body |  |

**Returns:** `RunRecipesResolveResponse`

**CLI:** `hoody run recipes resolve`

---

### `search`

**POST** `/api/v1/run/recipes/{name}/search`

Search using a saved recipe

```typescript
client.run.recipes.search(name: string, data: RunRecipesSearchRequest): Promise<RunRecipesSearchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Recipe name |
| `data` | `RunRecipesSearchRequest` | Yes | body |  |

**Returns:** `RunRecipesSearchResponse`

**CLI:** `hoody run recipes search`

---

### `update`

**PATCH** `/api/v1/run/recipes/{name}`

Update a saved recipe

```typescript
client.run.recipes.update(name: string, data: RunRecipesUpdateRequest): Promise<RunRecipesUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | Recipe name |
| `data` | `RunRecipesUpdateRequest` | Yes | body |  |

**Returns:** `RunRecipesUpdateResponse`

**CLI:** `hoody run recipes update`

---

## `client.run` (6 methods)

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

**CLI:** `hoody run resolve`

---

### `resolveMany`

**POST** `/api/v1/run/batch`

Execute a batch of search or run requests

```typescript
client.run.resolveMany(data: RunResolveManyRequest): Promise<RunResolveManyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `RunResolveManyRequest` | Yes | body |  |

**Returns:** `RunResolveManyResponse`

---

### `search`

**POST** `/api/v1/run/search/paged`

Search for app candidates with cursor pagination

```typescript
client.run.search(data: RunSearchRequest): Promise<RunSearchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `RunSearchRequest` | Yes | body |  |

**Returns:** `RunSearchResponse`

**CLI:** `hoody run search`

---

### `searchAll`

**POST** `/api/v1/run/search/paged`

Search for app candidates with cursor pagination (collect all pages)

```typescript
client.run.searchAll(data: RunSearchRequest): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `RunSearchRequest` | Yes | body |  |

**Returns:** `unknown[]`

---

### `searchIterator`

**POST** `/api/v1/run/search/paged`

Search for app candidates with cursor pagination (async iterator)

```typescript
client.run.searchIterator(data: RunSearchRequest): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `RunSearchRequest` | Yes | body |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `test`

**POST** `/api/v1/run/preflight`

Preflight a run request

```typescript
client.run.test(data: RunTestRequest): Promise<RunTestResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `RunTestRequest` | Yes | body |  |

**Returns:** `RunTestResponse`

**CLI:** `hoody run test`

---

## `client.run.sources` (7 methods)

### `create`

**POST** `/api/v1/run/sources`

Create a new package source

```typescript
client.run.sources.create(data: RunSourcesCreateRequest): Promise<RunSourcesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `RunSourcesCreateRequest` | Yes | body |  |

**Returns:** `RunSourcesCreateResponse`

**CLI:** `hoody run sources create`

---

### `delete`

**DELETE** `/api/v1/run/sources/{source_id}`

Delete a package source

```typescript
client.run.sources.delete(source_id: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source_id` | `string` | Yes | path | Source identifier |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody run sources delete`

---

### `getDiagnostics`

**GET** `/api/v1/run/sources/{source_id}/diagnostics`

Get runtime diagnostics for a source

```typescript
client.run.sources.getDiagnostics(source_id: string): Promise<RunSourcesGetDiagnosticsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source_id` | `string` | Yes | path | Source identifier |

**Returns:** `RunSourcesGetDiagnosticsResponse`

**CLI:** `hoody run sources diagnostics get`

---

### `list`

**GET** `/api/v1/run/sources`

List all package sources

```typescript
client.run.sources.list(): Promise<RunSourcesListResponse>
```

**Returns:** `RunSourcesListResponse`

**CLI:** `hoody run sources list`

---

### `sync`

**POST** `/api/v1/run/sources/{source_id}/sync`

Sync a single source

```typescript
client.run.sources.sync(source_id: string): Promise<RunSourcesSyncResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source_id` | `string` | Yes | path | Source identifier |

**Returns:** `RunSourcesSyncResponse`

**CLI:** `hoody run sources sync`

---

### `syncAll`

**POST** `/api/v1/run/sources/sync`

Sync all sources

```typescript
client.run.sources.syncAll(): Promise<RunSourcesSyncAllResponse>
```

**Returns:** `RunSourcesSyncAllResponse`

**CLI:** `hoody run sources sync`

---

### `update`

**PATCH** `/api/v1/run/sources/{source_id}`

Update a package source

```typescript
client.run.sources.update(source_id: string, data: RunSourcesUpdateRequest): Promise<RunSourcesUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `source_id` | `string` | Yes | path | Source identifier |
| `data` | `RunSourcesUpdateRequest` | Yes | body |  |

**Returns:** `RunSourcesUpdateResponse`

**CLI:** `hoody run sources update`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
