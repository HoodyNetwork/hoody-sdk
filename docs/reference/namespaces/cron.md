# `cron` — 15 methods

**Version:** 1.0.0-beta.3
**Accessor:** `client.cron`

```typescript
import * as cron from 'hoody-sdk/cron';
```

---

## `client.cron.crontab` (5 methods)

### `get`

**GET** `/users/{user}/crontab`

Get Crontab

```typescript
client.cron.crontab.get(user: string): Promise<CronCrontabGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |

**Returns:** `CronCrontabGetResponse`

**CLI:** `hoody cron crontabs get`

---

### `listGlobal`

**GET** `/crontab`

List All Crontabs

```typescript
client.cron.crontab.listGlobal(options?: { page?: number; limit?: number }): Promise<CronCrontabListGlobalResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number (1-based) |
| `limit` | `number` | No | query | Items per page (max 200) |

**Returns:** `CronCrontabListGlobalResponse`

**CLI:** `hoody cron crontabs list`

---

### `listGlobalAll`

**GET** `/crontab`

List All Crontabs (collect all pages)

```typescript
client.cron.crontab.listGlobalAll(options?: { page?: number; limit?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number (1-based) |
| `limit` | `number` | No | query | Items per page (max 200) |

**Returns:** `unknown[]`

**CLI:** `hoody cron crontabs list`

---

### `listGlobalIterator`

**GET** `/crontab`

List All Crontabs (async iterator)

```typescript
client.cron.crontab.listGlobalIterator(options?: { page?: number; limit?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number (1-based) |
| `limit` | `number` | No | query | Items per page (max 200) |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody cron crontabs list`

---

### `put`

**PUT** `/users/{user}/crontab`

Put Crontab

```typescript
client.cron.crontab.put(user: string, data: CronCrontabPutRequest): Promise<CronCrontabPutResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |
| `data` | `CronCrontabPutRequest` | Yes | body |  |

**Returns:** `CronCrontabPutResponse`

**CLI:** `hoody cron crontabs replace`

---

## `client.cron.entries` (7 methods)

### `create`

**POST** `/users/{user}/entries`

Create Entry

```typescript
client.cron.entries.create(user: string, data: CronEntriesCreateRequest): Promise<CronEntriesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |
| `data` | `CronEntriesCreateRequest` | Yes | body |  |

**Returns:** `CronEntriesCreateResponse`

**CLI:** `hoody cron entries create`

---

### `delete`

**DELETE** `/users/{user}/entries/{id}`

Delete Entry

```typescript
client.cron.entries.delete(user: string, id: string): Promise<CronEntriesDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |
| `id` | `string` | Yes | path | Managed entry id |

**Returns:** `CronEntriesDeleteResponse`

**CLI:** `hoody cron entries delete`

---

### `get`

**GET** `/users/{user}/entries/{id}`

Get Entry

```typescript
client.cron.entries.get(user: string, id: string): Promise<CronEntriesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |
| `id` | `string` | Yes | path | Managed entry id |

**Returns:** `CronEntriesGetResponse`

**CLI:** `hoody cron entries get`

---

### `list`

**GET** `/users/{user}/entries`

List Entries

```typescript
client.cron.entries.list(user: string, options?: { page?: number; limit?: number }): Promise<CronEntriesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |
| `page` | `number` | No | query | Page number (1-based) |
| `limit` | `number` | No | query | Items per page (max 200) |

**Returns:** `CronEntriesListResponse`

**CLI:** `hoody cron entries list`

---

### `listAll`

**GET** `/users/{user}/entries`

List Entries (collect all pages)

```typescript
client.cron.entries.listAll(user: string, options?: { page?: number; limit?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |
| `page` | `number` | No | query | Page number (1-based) |
| `limit` | `number` | No | query | Items per page (max 200) |

**Returns:** `unknown[]`

**CLI:** `hoody cron entries list`

---

### `listIterator`

**GET** `/users/{user}/entries`

List Entries (async iterator)

```typescript
client.cron.entries.listIterator(user: string, options?: { page?: number; limit?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |
| `page` | `number` | No | query | Page number (1-based) |
| `limit` | `number` | No | query | Items per page (max 200) |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody cron entries list`

---

### `update`

**PATCH** `/users/{user}/entries/{id}`

Update Entry

```typescript
client.cron.entries.update(user: string, id: string, data: CronEntriesUpdateRequest): Promise<CronEntriesUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |
| `id` | `string` | Yes | path | Managed entry id |
| `data` | `CronEntriesUpdateRequest` | Yes | body |  |

**Returns:** `CronEntriesUpdateResponse`

**CLI:** `hoody cron entries update`

---

## `client.cron.health` (1 method)

### `check`

**GET** `/health`

Health Check

```typescript
client.cron.health.check(): Promise<CronHealthCheckResponse>
```

**Returns:** `CronHealthCheckResponse`

**CLI:** `hoody cron health`

---

## `client.cron.system` (2 methods)

### `getOpenApiJson`

**GET** `/openapi.json`

Get Open Api Json

```typescript
client.cron.system.getOpenApiJson(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

---

### `getOpenApiYaml`

**GET** `/openapi.yaml`

Get Open Api Yaml

```typescript
client.cron.system.getOpenApiYaml(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
