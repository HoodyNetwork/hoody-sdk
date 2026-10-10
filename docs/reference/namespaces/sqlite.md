# `sqlite` — 42 methods

**Version:** 1.0.0-beta.17
**Accessor:** `client.sqlite`

```typescript
import * as sqlite from 'hoody-sdk/sqlite';
```

---

## `client.sqlite.databases` (4 methods)

### `create`

**POST** `/api/v1/sqlite/db/create`

Create new SQLite database

```typescript
client.sqlite.databases.create(options: { path: string; init_kv?: boolean; kv_table?: string; timeout?: number }): Promise<SqliteDatabasesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | query | Database path (absolute path, bare name, or ./name shorthand resolved to /hoody/databases/*.db) |
| `init_kv` | `boolean` | No | query | Initialize KV store tables |
| `kv_table` | `string` | No | query | Custom KV table name |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `SqliteDatabasesCreateResponse`

**CLI:** `hoody db create`

---

### `delete`

**DELETE** `/api/v1/sqlite/db`

Delete SQLite database

```typescript
client.sqlite.databases.delete(options: { db: string; timeout?: number }): Promise<SqliteDatabasesDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database path (absolute path, bare name, or ./name shorthand resolved to /hoody/databases/*.db) |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `SqliteDatabasesDeleteResponse`

**CLI:** `hoody db delete`

---

### `list`

**GET** `/api/v1/sqlite/db/list`

List databases in a directory

```typescript
client.sqlite.databases.list(options?: { dir?: string; timeout?: number }): Promise<SqliteDatabasesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `dir` | `string` | No | query | Absolute path of the directory to list |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `SqliteDatabasesListResponse`

**CLI:** `hoody db list`

---

### `runMaintenance`

**POST** `/api/v1/sqlite/maintenance`

Run a database maintenance operation

```typescript
client.sqlite.databases.runMaintenance(data: SqliteDatabasesRunMaintenanceRequest, options: { db: string; timeout?: number }): Promise<SqliteDatabasesRunMaintenanceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `SqliteDatabasesRunMaintenanceRequest` | Yes | body |  |
| `db` | `string` | Yes | query | Database path (absolute path, bare name, or ./name shorthand resolved to /hoody/databases/*.db) |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `SqliteDatabasesRunMaintenanceResponse`

**CLI:** `hoody db maintenance run`

---

## `client.sqlite.history` (6 methods)

### `clear`

**DELETE** `/api/v1/sqlite/history`

Clear query history

```typescript
client.sqlite.history.clear(options: { db: string; timeout?: number }): Promise<SqliteHistoryClearResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database file path |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `SqliteHistoryClearResponse`

**CLI:** `hoody db history clear`

---

### `delete`

**DELETE** `/api/v1/sqlite/history/{index}`

Delete history entry

```typescript
client.sqlite.history.delete(index: number, options: { db: string; timeout?: number }): Promise<SqliteHistoryDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `index` | `number` | Yes | path | History entry ID |
| `db` | `string` | Yes | query | Database file path |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `SqliteHistoryDeleteResponse`

**CLI:** `hoody db history delete`

---

### `getStats`

**GET** `/api/v1/sqlite/history/stats`

Get history statistics

```typescript
client.sqlite.history.getStats(options: { db: string; timeout?: number }): Promise<SqliteHistoryGetStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database file path |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `SqliteHistoryGetStatsResponse`

**CLI:** `hoody db history stats`

---

### `list`

**GET** `/api/v1/sqlite/history`

Get query history

```typescript
client.sqlite.history.list(options: { db: string; limit?: number; offset?: number; timeout?: number }): Promise<SqliteHistoryListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database file path |
| `limit` | `number` | No | query | Maximum number of entries to return (0 means the default; capped at 1000) |
| `offset` | `number` | No | query | Number of newest entries to skip |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `SqliteHistoryListResponse`

**CLI:** `hoody db history list`

---

### `listAll`

**GET** `/api/v1/sqlite/history`

Get query history (collect all pages)

```typescript
client.sqlite.history.listAll(options: { db: string; limit?: number; offset?: number; timeout?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database file path |
| `limit` | `number` | No | query | Maximum number of entries to return (0 means the default; capped at 1000) |
| `offset` | `number` | No | query | Number of newest entries to skip |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/sqlite/history`

Get query history (async iterator)

```typescript
client.sqlite.history.listIterator(options: { db: string; limit?: number; offset?: number; timeout?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database file path |
| `limit` | `number` | No | query | Maximum number of entries to return (0 means the default; capped at 1000) |
| `offset` | `number` | No | query | Number of newest entries to skip |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `AsyncIterableIterator<unknown>`

---

## `client.sqlite.kit` (2 methods)

### `getCacheStats`

**GET** `/api/v1/sqlite/health/cache`

Cache health snapshot

```typescript
client.sqlite.kit.getCacheStats(): Promise<SqliteKitGetCacheStatsResponse>
```

**Returns:** `SqliteKitGetCacheStatsResponse`

**CLI:** `hoody db cache stats`

---

### `getHealth`

**GET** `/api/v1/sqlite/health`

Health check

```typescript
client.sqlite.kit.getHealth(options?: { verbose?: boolean }): Promise<SqliteKitGetHealthResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `verbose` | `boolean` | No | query | Return the full snapshot. Without it the response carries the status field alone; with it, service identity, the features list, process memory and file-descriptor counters, and the cache and counter snapshots are included |

**Returns:** `SqliteKitGetHealthResponse`

**CLI:** `hoody db health`

---

## `client.sqlite.kv` (28 methods)

### `clearTtl`

**POST** `/api/v1/sqlite/kv/{key}/persist`

Remove a key's TTL

```typescript
client.sqlite.kv.clearTtl(key: string, options: { db: string; table?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; IfMatch?: string; IdempotencyKey?: string }): Promise<SqliteKvClearTtlResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name (supports / for hierarchical keys) |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |
| `history` | `boolean` | No | query | Store this write's value in history; false records only that the write happened, not what it wrote |
| `create_db_if_missing` | `boolean` | No | query | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `IfMatch` | `string` | No | header | Applies the write only if the key's current ETag matches. |
| `IdempotencyKey` | `string` | No | header | Replays the stored response for a repeat of the same key (24 h). |

**Returns:** `SqliteKvClearTtlResponse`

**CLI:** `hoody kv ttl clear`

---

### `compareTableSnapshots`

**GET** `/api/v1/sqlite/kv/diff`

Compare table snapshots

```typescript
client.sqlite.kv.compareTableSnapshots(options: { db: string; from: number; to: number; table?: string; keys?: string; timeout?: number }): Promise<SqliteKvCompareTableSnapshotsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database file path |
| `from` | `number` | Yes | query | Starting timestamp (Unix seconds), at least 1 and earlier than to |
| `to` | `number` | Yes | query | Ending timestamp (Unix seconds), later than from and not in the future |
| `table` | `string` | No | query | Custom table name |
| `keys` | `string` | No | query | Comma-separated list of keys to compare (optional). When given, exactly these keys are reconstructed (duplicates collapsed) |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `SqliteKvCompareTableSnapshotsResponse`

**CLI:** `hoody kv table snapshots compare`

---

### `decrement`

**POST** `/api/v1/sqlite/kv/{key}/decr`

Atomic decrement

```typescript
client.sqlite.kv.decrement(key: string, options: { db: string; table?: string; delta?: number; path?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; IfMatch?: string; IdempotencyKey?: string }): Promise<SqliteKvDecrementResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |
| `delta` | `number` | No | query | Amount to decrement: a positive integer; the operation sets the direction |
| `path` | `string` | No | query | JSON path to nested numeric value |
| `history` | `boolean` | No | query | Store this write's value in history; false records only that the write happened, not what it wrote |
| `create_db_if_missing` | `boolean` | No | query | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `IfMatch` | `string` | No | header | Applies the write only if the key's current ETag matches. |
| `IdempotencyKey` | `string` | No | header | Replays the stored response for a repeat of the same key (24 h). |

**Returns:** `SqliteKvDecrementResponse`

**CLI:** `hoody kv decrement`

---

### `delete`

**DELETE** `/api/v1/sqlite/kv/{key}`

Delete key

```typescript
client.sqlite.kv.delete(key: string, options: { db: string; table?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; IfMatch?: string; IdempotencyKey?: string }): Promise<SqliteKvDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name |
| `db` | `string` | Yes | query | Database file path or directory |
| `table` | `string` | No | query | Custom table name |
| `history` | `boolean` | No | query | Store this write's value in history; false records only that the write happened, not what it wrote |
| `create_db_if_missing` | `boolean` | No | query | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `IfMatch` | `string` | No | header | Applies the write only if the key's current ETag matches. |
| `IdempotencyKey` | `string` | No | header | Replays the stored response for a repeat of the same key (24 h). |

**Returns:** `SqliteKvDeleteResponse`

**CLI:** `hoody kv delete`

---

### `deleteMany`

**POST** `/api/v1/sqlite/kv/batch/delete`

Batch delete multiple keys

```typescript
client.sqlite.kv.deleteMany(data: SqliteKvDeleteManyRequest, options: { db: string; table?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; IdempotencyKey?: string }): Promise<SqliteKvDeleteManyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `SqliteKvDeleteManyRequest` | Yes | body |  |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |
| `history` | `boolean` | No | query | Store this write's value in history; false records only that the write happened, not what it wrote |
| `create_db_if_missing` | `boolean` | No | query | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `IdempotencyKey` | `string` | No | header | Replays the stored response for a repeat of the same key (24 h). |

**Returns:** `SqliteKvDeleteManyResponse`

**CLI:** `hoody kv batch delete`

---

### `exists`

**HEAD** `/api/v1/sqlite/kv/{key}`

Check if key exists

```typescript
client.sqlite.kv.exists(key: string, options: KvExistsOptions, templateVars?: ExistsTarget): Promise<boolean>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name |
| `db` | `string` | Yes | query | Database file path or directory |
| `table` | `string` | No | query | Custom table name |
| `IfNoneMatch` | `string` | No | header | Answers 304 while the key's current ETag matches. |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `boolean`

**CLI:** `hoody kv exists`

---

### `get`

**GET** `/api/v1/sqlite/kv/{key}`

Get value by key

```typescript
client.sqlite.kv.get(key: string, options: { db: string; table?: string; path?: string; at_timestamp?: number; rebuild?: boolean; timeout?: number; IfNoneMatch?: string }): Promise<ApiResponse<ArrayBuffer> | SqliteKvGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name (supports / for hierarchical keys) |
| `db` | `string` | Yes | query | Database file path or directory |
| `table` | `string` | No | query | Custom table name |
| `path` | `string` | No | query | JSON path for nested value extraction. The extracted value is returned as JSON with an X-JSON-Path header; a path that does not exist in the value answers 404. Ignored with at_timestamp. |
| `at_timestamp` | `number` | No | query | Unix timestamp. Returns the value the key held at that moment, in a JSON envelope instead of the current value. The value is reconstructed from the key's recorded history. When no recorded write establishes it, the current value is returned if it was already in place at that moment: with op_number 0 when the key has recorded history, and without op_number or op_timestamp when it has none (for example, a key written through SQL). A write made with history=false that leaves the value at that moment unknown answers 409 TIME_TRAVEL_CHAIN_GAP. 0 or omitted reads the current value; a time in the future is rejected with 400. A directory (directory mode) is rejected with 400 in this mode. |
| `rebuild` | `boolean` | No | query | Directory mode only: clear the directory's cached file information (this directory only, not its subdirectories), then read the key. Ignored with at_timestamp. |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `IfNoneMatch` | `string` | No | header | Answers 304 while the key's current ETag matches. |

**Returns:** `ApiResponse<ArrayBuffer> | SqliteKvGetResponse`

**CLI:** `hoody kv get`

---

### `getEntry`

**GET** `/api/v1/sqlite/kv/{key}/entry`

Get a key's entry

```typescript
client.sqlite.kv.getEntry(key: string, options: { db: string; table?: string; timeout?: number; IfNoneMatch?: string }): Promise<SqliteKvGetEntryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name (supports / for hierarchical keys) |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `IfNoneMatch` | `string` | No | header | Answers 304 while the key's current ETag matches. |

**Returns:** `SqliteKvGetEntryResponse`

**CLI:** `hoody kv entry get`

---

### `getMany`

**POST** `/api/v1/sqlite/kv/batch/get`

Batch get multiple keys

```typescript
client.sqlite.kv.getMany(data: SqliteKvGetManyRequest, options: { db: string; table?: string; timeout?: number }): Promise<SqliteKvGetManyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `SqliteKvGetManyRequest` | Yes | body |  |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `SqliteKvGetManyResponse`

**CLI:** `hoody kv batch get`

---

### `getSnapshot`

**GET** `/api/v1/sqlite/kv/{key}/snapshot`

Get key snapshot at operation

```typescript
client.sqlite.kv.getSnapshot(key: string, options: { db: string; op_number: number; table?: string; timeout?: number }): Promise<SqliteKvGetSnapshotResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name |
| `db` | `string` | Yes | query | Database file path |
| `op_number` | `number` | Yes | query | Operation number to reconstruct from |
| `table` | `string` | No | query | Custom table name |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `SqliteKvGetSnapshotResponse`

**CLI:** `hoody kv snapshots get`

---

### `getTableSnapshot`

**GET** `/api/v1/sqlite/kv/snapshot`

Get table snapshot at timestamp

```typescript
client.sqlite.kv.getTableSnapshot(options: { db: string; timestamp: number; table?: string; limit?: number; prefix?: string; timeout?: number }): Promise<SqliteKvGetTableSnapshotResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database file path |
| `timestamp` | `number` | Yes | query | Unix timestamp (seconds) to reconstruct, at least 1 and not in the future |
| `table` | `string` | No | query | Custom table name |
| `limit` | `number` | No | query | Maximum number of keys to return. Values above 1000 are treated as 1000; 0 returns every key found. Either way key discovery is bounded: when it stops early, candidate_truncated is true and keys may be missing; narrow with prefix |
| `prefix` | `string` | No | query | Filter keys by prefix |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `SqliteKvGetTableSnapshotResponse`

**CLI:** `hoody kv table snapshots get`

---

### `increment`

**POST** `/api/v1/sqlite/kv/{key}/incr`

Atomic increment

```typescript
client.sqlite.kv.increment(key: string, options: { db: string; table?: string; delta?: number; path?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; IfMatch?: string; IdempotencyKey?: string }): Promise<SqliteKvIncrementResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |
| `delta` | `number` | No | query | Amount to increment: a positive integer; the operation sets the direction |
| `path` | `string` | No | query | JSON path to nested numeric value |
| `history` | `boolean` | No | query | Store this write's value in history; false records only that the write happened, not what it wrote |
| `create_db_if_missing` | `boolean` | No | query | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `IfMatch` | `string` | No | header | Applies the write only if the key's current ETag matches. |
| `IdempotencyKey` | `string` | No | header | Replays the stored response for a repeat of the same key (24 h). |

**Returns:** `SqliteKvIncrementResponse`

**CLI:** `hoody kv increment`

---

### `list`

**GET** `/api/v1/sqlite/kv`

List keys

```typescript
client.sqlite.kv.list(options: { db: string; table?: string; prefix?: string; limit?: number; offset?: number; after?: string; at_timestamp?: number; timeout?: number }): Promise<SqliteKvListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database file path or directory |
| `table` | `string` | No | query | Custom table name |
| `prefix` | `string` | No | query | Filter keys by prefix |
| `limit` | `number` | No | query | Maximum number of results. Values above 1000 are treated as 1000; a negative value is rejected with 400. 0 returns an empty page, except with at_timestamp, where it means no limit |
| `offset` | `number` | No | query | Skip N results for pagination. Honoured for both the regular listing and the at_timestamp listing; results are ordered by key in both cases. A negative value is rejected with 400. Keys written or deleted between two requests shift later pages; use after to page without skipping or repeating keys |
| `after` | `string` | No | query | Cursor: list only keys that sort after this one (byte order, exclusive). Pass the previous page's next_after; a key written or deleted elsewhere between two pages never makes another key be skipped or repeated. The value is used as given, so any string works, including a key that no longer exists. Combined with offset greater than 0 or with at_timestamp it is rejected with 400 |
| `at_timestamp` | `number` | No | query | Unix timestamp for time-travel LIST: returns the keys as they stood at that moment, in a different response envelope. 0 or omitted lists the current keys; a time in the future is rejected with 400. A directory (directory mode) is rejected with 400 in this mode |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `SqliteKvListResponse`

**CLI:** `hoody kv list`

---

### `listAll`

**GET** `/api/v1/sqlite/kv`

List keys (collect all pages)

```typescript
client.sqlite.kv.listAll(options: { db: string; table?: string; prefix?: string; limit?: number; offset?: number; after?: string; at_timestamp?: number; timeout?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database file path or directory |
| `table` | `string` | No | query | Custom table name |
| `prefix` | `string` | No | query | Filter keys by prefix |
| `limit` | `number` | No | query | Maximum number of results. Values above 1000 are treated as 1000; a negative value is rejected with 400. 0 returns an empty page, except with at_timestamp, where it means no limit |
| `offset` | `number` | No | query | Skip N results for pagination. Honoured for both the regular listing and the at_timestamp listing; results are ordered by key in both cases. A negative value is rejected with 400. Keys written or deleted between two requests shift later pages; use after to page without skipping or repeating keys |
| `after` | `string` | No | query | Cursor: list only keys that sort after this one (byte order, exclusive). Pass the previous page's next_after; a key written or deleted elsewhere between two pages never makes another key be skipped or repeated. The value is used as given, so any string works, including a key that no longer exists. Combined with offset greater than 0 or with at_timestamp it is rejected with 400 |
| `at_timestamp` | `number` | No | query | Unix timestamp for time-travel LIST: returns the keys as they stood at that moment, in a different response envelope. 0 or omitted lists the current keys; a time in the future is rejected with 400. A directory (directory mode) is rejected with 400 in this mode |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `unknown[]`

---

### `listChanges`

**GET** `/api/v1/sqlite/changes`

List the changes of a KV table

```typescript
client.sqlite.kv.listChanges(options: { db: string; table?: string; since?: string; prefix?: string; limit?: number; wait?: number; include_values?: boolean; timeout?: number }): Promise<SqliteKvListChangesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database path |
| `table` | `string` | No | query | KV table name (default: kv_store) |
| `since` | `string` | No | query | Cursor to continue after (next_cursor of the previous page, or the cursor of an event). Omit to get the current cursor. |
| `prefix` | `string` | No | query | Only keys starting with this prefix |
| `limit` | `number` | No | query | Maximum events in the page (1-1000, default 100) |
| `wait` | `number` | No | query | Seconds to wait for the first event when there is none yet (0-60, default 0) |
| `include_values` | `boolean` | No | query | Attach the value to set/ttl events when it is still current, not expired and at most 256 KiB (otherwise value_omitted says why) |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `SqliteKvListChangesResponse`

**CLI:** `hoody kv changes list`

---

### `listChangesAll`

**GET** `/api/v1/sqlite/changes`

List the changes of a KV table (collect all pages)

```typescript
client.sqlite.kv.listChangesAll(options: { db: string; table?: string; since?: string; prefix?: string; limit?: number; wait?: number; include_values?: boolean; timeout?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database path |
| `table` | `string` | No | query | KV table name (default: kv_store) |
| `since` | `string` | No | query | Cursor to continue after (next_cursor of the previous page, or the cursor of an event). Omit to get the current cursor. |
| `prefix` | `string` | No | query | Only keys starting with this prefix |
| `limit` | `number` | No | query | Maximum events in the page (1-1000, default 100) |
| `wait` | `number` | No | query | Seconds to wait for the first event when there is none yet (0-60, default 0) |
| `include_values` | `boolean` | No | query | Attach the value to set/ttl events when it is still current, not expired and at most 256 KiB (otherwise value_omitted says why) |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `unknown[]`

---

### `listChangesIterator`

**GET** `/api/v1/sqlite/changes`

List the changes of a KV table (async iterator)

```typescript
client.sqlite.kv.listChangesIterator(options: { db: string; table?: string; since?: string; prefix?: string; limit?: number; wait?: number; include_values?: boolean; timeout?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database path |
| `table` | `string` | No | query | KV table name (default: kv_store) |
| `since` | `string` | No | query | Cursor to continue after (next_cursor of the previous page, or the cursor of an event). Omit to get the current cursor. |
| `prefix` | `string` | No | query | Only keys starting with this prefix |
| `limit` | `number` | No | query | Maximum events in the page (1-1000, default 100) |
| `wait` | `number` | No | query | Seconds to wait for the first event when there is none yet (0-60, default 0) |
| `include_values` | `boolean` | No | query | Attach the value to set/ttl events when it is still current, not expired and at most 256 KiB (otherwise value_omitted says why) |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listHistory`

**GET** `/api/v1/sqlite/kv/{key}/history`

Get key operation history

```typescript
client.sqlite.kv.listHistory(key: string, options: { db: string; table?: string; limit?: number; timeout?: number }): Promise<SqliteKvListHistoryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |
| `limit` | `number` | No | query | Maximum number of operations to return (0 → default 50, clamped to maximum 1000) |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `SqliteKvListHistoryResponse`

**CLI:** `hoody kv history list`

---

### `listIterator`

**GET** `/api/v1/sqlite/kv`

List keys (async iterator)

```typescript
client.sqlite.kv.listIterator(options: { db: string; table?: string; prefix?: string; limit?: number; offset?: number; after?: string; at_timestamp?: number; timeout?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database file path or directory |
| `table` | `string` | No | query | Custom table name |
| `prefix` | `string` | No | query | Filter keys by prefix |
| `limit` | `number` | No | query | Maximum number of results. Values above 1000 are treated as 1000; a negative value is rejected with 400. 0 returns an empty page, except with at_timestamp, where it means no limit |
| `offset` | `number` | No | query | Skip N results for pagination. Honoured for both the regular listing and the at_timestamp listing; results are ordered by key in both cases. A negative value is rejected with 400. Keys written or deleted between two requests shift later pages; use after to page without skipping or repeating keys |
| `after` | `string` | No | query | Cursor: list only keys that sort after this one (byte order, exclusive). Pass the previous page's next_after; a key written or deleted elsewhere between two pages never makes another key be skipped or repeated. The value is used as given, so any string works, including a key that no longer exists. Combined with offset greater than 0 or with at_timestamp it is rejected with 400 |
| `at_timestamp` | `number` | No | query | Unix timestamp for time-travel LIST: returns the keys as they stood at that moment, in a different response envelope. 0 or omitted lists the current keys; a time in the future is rejected with 400. A directory (directory mode) is rejected with 400 in this mode |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `pop`

**POST** `/api/v1/sqlite/kv/{key}/pop`

Remove from array end

```typescript
client.sqlite.kv.pop(key: string, options: { db: string; table?: string; path?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; IfMatch?: string; IdempotencyKey?: string }): Promise<SqliteKvPopResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |
| `path` | `string` | No | query | JSON path to nested array |
| `history` | `boolean` | No | query | Store this write's value in history; false records only that the write happened, not what it wrote |
| `create_db_if_missing` | `boolean` | No | query | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `IfMatch` | `string` | No | header | Applies the write only if the key's current ETag matches. |
| `IdempotencyKey` | `string` | No | header | Replays the stored response for a repeat of the same key (24 h). |

**Returns:** `SqliteKvPopResponse`

**CLI:** `hoody kv arrays pop`

---

### `push`

**POST** `/api/v1/sqlite/kv/{key}/push`

Append to array

```typescript
client.sqlite.kv.push(key: string, data: SqliteKvPushRequest, options: { db: string; table?: string; path?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; IfMatch?: string; IdempotencyKey?: string }): Promise<SqliteKvPushResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name |
| `data` | `SqliteKvPushRequest` | Yes | body |  |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |
| `path` | `string` | No | query | JSON path to nested array |
| `history` | `boolean` | No | query | Store this write's value in history; false records only that the write happened, not what it wrote |
| `create_db_if_missing` | `boolean` | No | query | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `IfMatch` | `string` | No | header | Applies the write only if the key's current ETag matches. |
| `IdempotencyKey` | `string` | No | header | Replays the stored response for a repeat of the same key (24 h). |

**Returns:** `SqliteKvPushResponse`

**CLI:** `hoody kv arrays push`

---

### `remove`

**POST** `/api/v1/sqlite/kv/{key}/remove`

Remove array element

```typescript
client.sqlite.kv.remove(key: string, data: SqliteKvRemoveRequest | undefined, options: { db: string; table?: string; path?: string; index?: number; history?: boolean; create_db_if_missing?: boolean; timeout?: number; IfMatch?: string; IdempotencyKey?: string }): Promise<SqliteKvRemoveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name |
| `data` | `SqliteKvRemoveRequest \| undefined` | Yes | body |  |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |
| `path` | `string` | No | query | JSON path to nested array |
| `index` | `number` | No | query | Array index to remove. Send this or a body value; with neither the request is a 400 |
| `history` | `boolean` | No | query | Store this write's value in history; false records only that the write happened, not what it wrote |
| `create_db_if_missing` | `boolean` | No | query | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `IfMatch` | `string` | No | header | Applies the write only if the key's current ETag matches. |
| `IdempotencyKey` | `string` | No | header | Replays the stored response for a repeat of the same key (24 h). |

**Returns:** `SqliteKvRemoveResponse`

**CLI:** `hoody kv arrays remove`

---

### `rollback`

**POST** `/api/v1/sqlite/kv/{key}/rollback`

Rollback key operations

```typescript
client.sqlite.kv.rollback(key: string, options: { db: string; table?: string; steps?: number; create_db_if_missing?: boolean; timeout?: number; IdempotencyKey?: string }): Promise<SqliteKvRollbackResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |
| `steps` | `number` | No | query | Number of operations to undo, 1 to 50000 |
| `create_db_if_missing` | `boolean` | No | query | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `IdempotencyKey` | `string` | No | header | Replays the stored response for a repeat of the same key (24 h). |

**Returns:** `SqliteKvRollbackResponse`

**CLI:** `hoody kv rollback`

---

### `rollbackTable`

**POST** `/api/v1/sqlite/kv/rollback`

Rollback entire table

```typescript
client.sqlite.kv.rollbackTable(data: SqliteKvRollbackTableRequest | undefined, options: { db: string; to_timestamp: number; table?: string; dry_run?: boolean; confirm?: string; create_db_if_missing?: boolean; timeout?: number; IdempotencyKey?: string }): Promise<SqliteKvRollbackTableResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `SqliteKvRollbackTableRequest \| undefined` | Yes | body |  |
| `db` | `string` | Yes | query | Database file path |
| `to_timestamp` | `number` | Yes | query | Target timestamp (Unix seconds), at least 1 and not in the future |
| `table` | `string` | No | query | Custom table name |
| `dry_run` | `boolean` | No | query | Preview changes without applying |
| `confirm` | `string` | No | query | Must be 'yes' to execute actual rollback |
| `create_db_if_missing` | `boolean` | No | query | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `IdempotencyKey` | `string` | No | header | Replays the stored response for a repeat of the same key (24 h). |

**Returns:** `SqliteKvRollbackTableResponse`

**CLI:** `hoody kv table rollback`

---

### `set`

**PUT** `/api/v1/sqlite/kv/{key}`

Set value for key

```typescript
client.sqlite.kv.set(key: string, data: SqliteKvSetRequest, options: { db: string; table?: string; path?: string; ttl?: number; if_match?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; IfMatch?: string; IfNoneMatch?: string; IdempotencyKey?: string; contentType?: 'application/octet-stream' }): Promise<SqliteKvSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name |
| `data` | `SqliteKvSetRequest` | Yes | body |  |
| `db` | `string` | Yes | query | Database file path or directory |
| `table` | `string` | No | query | Custom table name |
| `path` | `string` | No | query | JSON path for nested value update |
| `ttl` | `number` | No | query | Time-to-live in seconds (SQLite mode only; a non-zero ttl against a directory-mode store is rejected with 400) |
| `if_match` | `string` | No | query | Current value for compare-and-swap (SQLite mode only; rejected with 400 against a directory-mode store) |
| `history` | `boolean` | No | query | Store this write's value in history; false records only that the write happened, not what it wrote |
| `create_db_if_missing` | `boolean` | No | query | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `IfMatch` | `string` | No | header | Applies the write only if the key's current ETag matches. |
| `IfNoneMatch` | `string` | No | header | Set to * to write only if the key does not exist yet. |
| `IdempotencyKey` | `string` | No | header | Replays the stored response for a repeat of the same key (24 h). |
| `contentType` | `'application/octet-stream'` | No | query |  |

**Returns:** `SqliteKvSetResponse`

**CLI:** `hoody kv set`

---

### `setMany`

**POST** `/api/v1/sqlite/kv/batch/set`

Batch set multiple keys

```typescript
client.sqlite.kv.setMany(data: SqliteKvSetManyRequest, options: { db: string; table?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; IdempotencyKey?: string }): Promise<SqliteKvSetManyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `SqliteKvSetManyRequest` | Yes | body |  |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |
| `history` | `boolean` | No | query | Store this write's value in history; false records only that the write happened, not what it wrote |
| `create_db_if_missing` | `boolean` | No | query | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `IdempotencyKey` | `string` | No | header | Replays the stored response for a repeat of the same key (24 h). |

**Returns:** `SqliteKvSetManyResponse`

**CLI:** `hoody kv batch set`

---

### `setTtl`

**POST** `/api/v1/sqlite/kv/{key}/expire`

Set a key's TTL

```typescript
client.sqlite.kv.setTtl(key: string, options: { db: string; ttl: number; table?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; IfMatch?: string; IdempotencyKey?: string }): Promise<SqliteKvSetTtlResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name (supports / for hierarchical keys) |
| `db` | `string` | Yes | query | Database file path |
| `ttl` | `number` | Yes | query | Seconds from now until the key expires; at least 1 |
| `table` | `string` | No | query | Custom table name |
| `history` | `boolean` | No | query | Store this write's value in history; false records only that the write happened, not what it wrote |
| `create_db_if_missing` | `boolean` | No | query | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `IfMatch` | `string` | No | header | Applies the write only if the key's current ETag matches. |
| `IdempotencyKey` | `string` | No | header | Replays the stored response for a repeat of the same key (24 h). |

**Returns:** `SqliteKvSetTtlResponse`

**CLI:** `hoody kv ttl set`

---

### `streamChanges`

**GET** `/api/v1/sqlite/changes/stream`

Stream the changes of a KV table

```typescript
client.sqlite.kv.streamChanges(options: { db: string; table?: string; since?: string; prefix?: string; include_values?: boolean; LastEventID?: string }): Promise<IEventStream<Record<never, string>, ITypedStreamEvent<SqliteKvStreamChangesFrames>>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database path |
| `table` | `string` | No | query | KV table name (default: kv_store) |
| `since` | `string` | No | query | Cursor to continue after; Last-Event-ID wins when both are sent |
| `prefix` | `string` | No | query | Only keys starting with this prefix |
| `include_values` | `boolean` | No | query | Attach small current values to set/ttl events (see GET /changes) |
| `LastEventID` | `string` | No | header | Resumes the stream after this event id. |

**Returns:** `IEventStream<Record<never, string>, ITypedStreamEvent<SqliteKvStreamChangesFrames>>`

**CLI:** `hoody kv changes stream`

---

## `client.sqlite.sql` (2 methods)

### `queryReadOnly`

**GET** `/api/v1/sqlite/query`

Execute shareable SQL query

```typescript
client.sqlite.sql.queryReadOnly(options: { db: string; sql: string; timeout?: number }): Promise<SqliteSqlQueryReadOnlyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database file path |
| `sql` | `string` | Yes | query | The SQL query, base64url-encoded (with or without = padding). Plain SQL text is also accepted |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `SqliteSqlQueryReadOnlyResponse`

**CLI:** `hoody db readonly query`

---

### `runTransaction`

**POST** `/api/v1/sqlite/db`

Execute SQL transaction

```typescript
client.sqlite.sql.runTransaction(data: SqliteSqlRunTransactionRequest, options: { db: string; create_db_if_missing?: boolean; timeout?: number }): Promise<SqliteSqlRunTransactionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `SqliteSqlRunTransactionRequest` | Yes | body |  |
| `db` | `string` | Yes | query | Database path (absolute path, bare name, or ./name shorthand resolved to /hoody/databases/*.db) |
| `create_db_if_missing` | `boolean` | No | query | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | No | query | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `SqliteSqlRunTransactionResponse`

**CLI:** `hoody db transactions run`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
