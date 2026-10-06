# `cron` — 13 methods

**Version:** 1.0.0-beta.15
**Accessor:** `client.cron`

```typescript
import * as cron from 'hoody-sdk/cron';
```

---

## `client.cron.crontabs` (5 methods)

### `get`

**GET** `/users/{user}/crontab`

Get Crontab

```typescript
client.cron.crontabs.get(user: string): Promise<CronCrontabsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |

**Returns:** `CronCrontabsGetResponse`

**CLI:** `hoody cron crontabs get`

---

### `list`

**GET** `/crontab`

List All Crontabs

```typescript
client.cron.crontabs.list(options?: { page?: number; limit?: number; cache?: boolean | number }): Promise<CronCrontabsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number (1-based) |
| `limit` | `number` | No | query | Items per page (max 200) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `CronCrontabsListResponse`

**CLI:** `hoody cron crontabs list`

---

### `listAll`

**GET** `/crontab`

List All Crontabs (collect all pages)

```typescript
client.cron.crontabs.listAll(options?: { page?: number; limit?: number; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number (1-based) |
| `limit` | `number` | No | query | Items per page (max 200) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/crontab`

List All Crontabs (async iterator)

```typescript
client.cron.crontabs.listIterator(options?: { page?: number; limit?: number; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | Page number (1-based) |
| `limit` | `number` | No | query | Items per page (max 200) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `set`

**PUT** `/users/{user}/crontab`

Put Crontab

```typescript
client.cron.crontabs.set(user: string, data: CronCrontabsSetRequest): Promise<CronCrontabsSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |
| `data` | `CronCrontabsSetRequest` | Yes | body |  |

**Returns:** `CronCrontabsSetResponse`

**CLI:** `hoody cron crontabs set`

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
| `id` | `string` | Yes | path | Managed entry id (UUID) |

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
| `id` | `string` | Yes | path | Managed entry id (UUID) |

**Returns:** `CronEntriesGetResponse`

**CLI:** `hoody cron entries get`

---

### `list`

**GET** `/users/{user}/entries`

List Entries

```typescript
client.cron.entries.list(user: string, options?: { page?: number; limit?: number; cache?: boolean | number }): Promise<CronEntriesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |
| `page` | `number` | No | query | Page number (1-based) |
| `limit` | `number` | No | query | Items per page (max 200) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `CronEntriesListResponse`

**CLI:** `hoody cron entries list`

---

### `listAll`

**GET** `/users/{user}/entries`

List Entries (collect all pages)

```typescript
client.cron.entries.listAll(user: string, options?: { page?: number; limit?: number; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |
| `page` | `number` | No | query | Page number (1-based) |
| `limit` | `number` | No | query | Items per page (max 200) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/users/{user}/entries`

List Entries (async iterator)

```typescript
client.cron.entries.listIterator(user: string, options?: { page?: number; limit?: number; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `user` | `string` | Yes | path | System username |
| `page` | `number` | No | query | Page number (1-based) |
| `limit` | `number` | No | query | Items per page (max 200) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

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
| `id` | `string` | Yes | path | Managed entry id (UUID) |
| `data` | `CronEntriesUpdateRequest` | Yes | body |  |

**Returns:** `CronEntriesUpdateResponse`

**CLI:** `hoody cron entries update`

---

## `client.cron.kit` (1 method)

### `getHealth`

**GET** `/health`

Health Check

```typescript
client.cron.kit.getHealth(): Promise<CronKitGetHealthResponse>
```

**Returns:** `CronKitGetHealthResponse`

**CLI:** `hoody cron health`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
