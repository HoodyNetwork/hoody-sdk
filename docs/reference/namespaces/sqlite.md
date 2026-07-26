# `sqlite` — 33 methods

**Version:** 1.0.0-beta.6
**Accessor:** `client.sqlite`

```typescript
import * as sqlite from 'hoody-sdk/sqlite';
```

---

## `client.sqlite.database` (2 methods)

### `create`

**POST** `/api/v1/sqlite/db/create`

Create new SQLite database

```typescript
client.sqlite.database.create(options?: { path: string; init_kv?: boolean; kv_table?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | query | Database path (absolute path, bare name, or./name shorthand resolved to /hoody/databases/*.db) |
| `init_kv` | `boolean` | No | query | Initialize KV store tables |
| `kv_table` | `string` | No | query | Custom KV table name |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody db create`

---

### `executeTransaction`

**POST** `/api/v1/sqlite/db`

Execute SQL transaction

```typescript
client.sqlite.database.executeTransaction(data: SqliteDatabaseExecuteTransactionRequest, options?: { db: string; create_db_if_missing?: boolean }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `SqliteDatabaseExecuteTransactionRequest` | Yes | body |  |
| `db` | `string` | Yes | query | Database path (absolute path, bare name, or./name shorthand resolved to /hoody/databases/*.db) |
| `create_db_if_missing` | `boolean` | No | query | Create database file if it is missing |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody db exec-transaction`

---

## `client.sqlite.docs` (2 methods)

### `getJson`

**GET** `/api/v1/sqlite/openapi.json`

Get OpenAPI specification (JSON redirect)

```typescript
client.sqlite.docs.getJson(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

---

### `getYaml`

**GET** `/api/v1/sqlite/openapi.yaml`

Get OpenAPI specification (YAML)

```typescript
client.sqlite.docs.getYaml(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

---

## `client.sqlite.health` (2 methods)

### `getHealth`

**GET** `/api/v1/sqlite/health`

Health check

```typescript
client.sqlite.health.getHealth(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

---

### `getHealthCache`

**GET** `/api/v1/sqlite/health/cache`

Cache health snapshot

```typescript
client.sqlite.health.getHealthCache(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

---

## `client.sqlite.history` (4 methods)

### `clear`

**DELETE** `/api/v1/sqlite/history`

Clear query history

```typescript
client.sqlite.history.clear(options?: { db: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database file path |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody db history clear`

---

### `deleteEntry`

**DELETE** `/api/v1/sqlite/history/{index}`

Delete history entry

```typescript
client.sqlite.history.deleteEntry(index: number, options?: { db: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `index` | `number` | Yes | path | History entry ID |
| `db` | `string` | Yes | query | Database file path |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody db history delete`

---

### `getStats`

**GET** `/api/v1/sqlite/history/stats`

Get history statistics

```typescript
client.sqlite.history.getStats(options?: { db: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database file path |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody db history stats`

---

### `list`

**GET** `/api/v1/sqlite/history`

Get query history

```typescript
client.sqlite.history.list(options?: { db: string; limit?: number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database file path |
| `limit` | `number` | No | query | Maximum number of entries to return |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody db history list`

---

## `client.sqlite.kvStore` (21 methods)

### `batchDelete`

**POST** `/api/v1/sqlite/kv/batch/delete`

Batch delete multiple keys

```typescript
client.sqlite.kvStore.batchDelete(data: SqliteKvStoreBatchDeleteRequest, options?: { db: string; table?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `SqliteKvStoreBatchDeleteRequest` | Yes | body |  |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody kv batch delete`

---

### `batchGet`

**POST** `/api/v1/sqlite/kv/batch/get`

Batch get multiple keys

```typescript
client.sqlite.kvStore.batchGet(data: SqliteKvStoreBatchGetRequest, options?: { db: string; table?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `SqliteKvStoreBatchGetRequest` | Yes | body |  |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody kv batch get`

---

### `batchSet`

**POST** `/api/v1/sqlite/kv/batch/set`

Batch set multiple keys

```typescript
client.sqlite.kvStore.batchSet(data: SqliteKvStoreBatchSetRequest, options?: { db: string; table?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `SqliteKvStoreBatchSetRequest` | Yes | body |  |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody kv batch set`

---

### `compareSnapshots`

**GET** `/api/v1/sqlite/kv/diff`

Compare table snapshots

```typescript
client.sqlite.kvStore.compareSnapshots(options?: { db: string; from: number; to: number; table?: string; keys?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database file path |
| `from` | `number` | Yes | query | Starting timestamp (Unix) |
| `to` | `number` | Yes | query | Ending timestamp (Unix) |
| `table` | `string` | No | query | Custom table name |
| `keys` | `string` | No | query | Comma-separated list of keys to compare (optional) |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody kv snapshots compare-table`

---

### `decr`

**POST** `/api/v1/sqlite/kv/{key}/decr`

Atomic decrement

```typescript
client.sqlite.kvStore.decr(key: string, options?: { db: string; table?: string; delta?: number; path?: string; history?: boolean }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |
| `delta` | `number` | No | query | Amount to decrement |
| `path` | `string` | No | query | JSON path to nested numeric value |
| `history` | `boolean` | No | query | Enable history tracking |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody kv decr`

---

### `delete`

**DELETE** `/api/v1/sqlite/kv/{key}`

Delete key

```typescript
client.sqlite.kvStore.delete(key: string, options?: { db: string; table?: string; history?: boolean }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name |
| `db` | `string` | Yes | query | Database file path or directory |
| `table` | `string` | No | query | Custom table name |
| `history` | `boolean` | No | query | Enable history tracking |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody kv delete`

---

### `exists`

**HEAD** `/api/v1/sqlite/kv/{key}`

Check if key exists

```typescript
client.sqlite.kvStore.exists(key: string, options?: { db: string; table?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name |
| `db` | `string` | Yes | query | Database file path or directory |
| `table` | `string` | No | query | Custom table name |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody kv exists`

---

### `get`

**GET** `/api/v1/sqlite/kv/{key}`

Get value by key

```typescript
client.sqlite.kvStore.get(key: string, options?: { db: string; table?: string; path?: string; at_timestamp?: number; rebuild?: boolean }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name (supports / for hierarchical keys) |
| `db` | `string` | Yes | query | Database file path or directory |
| `table` | `string` | No | query | Custom table name |
| `path` | `string` | No | query | JSON path for nested value extraction |
| `at_timestamp` | `number` | No | query | Unix timestamp for time-travel query (selects handleKVAtTimestamp) |
| `rebuild` | `boolean` | No | query | Rebuild cache (directory mode only) |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody kv get`

---

### `getHistory`

**GET** `/api/v1/sqlite/kv/{key}/history`

Get key operation history

```typescript
client.sqlite.kvStore.getHistory(key: string, options?: { db: string; table?: string; limit?: number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |
| `limit` | `number` | No | query | Maximum number of operations to return (0 → default 50, clamped to maximum 1000) |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody kv history`

---

### `getSnapshot`

**GET** `/api/v1/sqlite/kv/{key}/snapshot`

Get key snapshot at operation

```typescript
client.sqlite.kvStore.getSnapshot(key: string, options?: { db: string; op_number: number; table?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name |
| `db` | `string` | Yes | query | Database file path |
| `op_number` | `number` | Yes | query | Operation number to reconstruct from |
| `table` | `string` | No | query | Custom table name |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody kv snapshots get-key`

---

### `getTableSnapshot`

**GET** `/api/v1/sqlite/kv/snapshot`

Get table snapshot at timestamp

```typescript
client.sqlite.kvStore.getTableSnapshot(options?: { db: string; timestamp: number; table?: string; limit?: number; prefix?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database file path |
| `timestamp` | `number` | Yes | query | Unix timestamp to reconstruct from |
| `table` | `string` | No | query | Custom table name |
| `limit` | `number` | No | query | Maximum number of keys to return |
| `prefix` | `string` | No | query | Filter keys by prefix |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody kv snapshots get-table`

---

### `incr`

**POST** `/api/v1/sqlite/kv/{key}/incr`

Atomic increment

```typescript
client.sqlite.kvStore.incr(key: string, options?: { db: string; table?: string; delta?: number; path?: string; history?: boolean }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |
| `delta` | `number` | No | query | Amount to increment |
| `path` | `string` | No | query | JSON path to nested numeric value |
| `history` | `boolean` | No | query | Enable history tracking |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody kv incr`

---

### `list`

**GET** `/api/v1/sqlite/kv`

List keys

```typescript
client.sqlite.kvStore.list(options?: { db: string; table?: string; prefix?: string; limit?: number; offset?: number; at_timestamp?: number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database file path or directory |
| `table` | `string` | No | query | Custom table name |
| `prefix` | `string` | No | query | Filter keys by prefix |
| `limit` | `number` | No | query | Maximum number of results |
| `offset` | `number` | No | query | Skip N results for pagination (regular LIST only; ignored when at_timestamp is set) |
| `at_timestamp` | `number` | No | query | Unix timestamp for time-travel LIST (selects handleKVListAtTimestamp; returns a different envelope and ignores offset) |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody kv list`

---

### `listAll`

**GET** `/api/v1/sqlite/kv`

List keys (collect all pages)

```typescript
client.sqlite.kvStore.listAll(options?: { db: string; table?: string; prefix?: string; limit?: number; offset?: number; at_timestamp?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database file path or directory |
| `table` | `string` | No | query | Custom table name |
| `prefix` | `string` | No | query | Filter keys by prefix |
| `limit` | `number` | No | query | Maximum number of results |
| `offset` | `number` | No | query | Skip N results for pagination (regular LIST only; ignored when at_timestamp is set) |
| `at_timestamp` | `number` | No | query | Unix timestamp for time-travel LIST (selects handleKVListAtTimestamp; returns a different envelope and ignores offset) |

**Returns:** `unknown[]`

**CLI:** `hoody kv list`

---

### `listIterator`

**GET** `/api/v1/sqlite/kv`

List keys (async iterator)

```typescript
client.sqlite.kvStore.listIterator(options?: { db: string; table?: string; prefix?: string; limit?: number; offset?: number; at_timestamp?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database file path or directory |
| `table` | `string` | No | query | Custom table name |
| `prefix` | `string` | No | query | Filter keys by prefix |
| `limit` | `number` | No | query | Maximum number of results |
| `offset` | `number` | No | query | Skip N results for pagination (regular LIST only; ignored when at_timestamp is set) |
| `at_timestamp` | `number` | No | query | Unix timestamp for time-travel LIST (selects handleKVListAtTimestamp; returns a different envelope and ignores offset) |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody kv list`

---

### `pop`

**POST** `/api/v1/sqlite/kv/{key}/pop`

Remove from array end

```typescript
client.sqlite.kvStore.pop(key: string, options?: { db: string; table?: string; path?: string; history?: boolean }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |
| `path` | `string` | No | query | JSON path to nested array |
| `history` | `boolean` | No | query | Enable history tracking |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody kv arrays pop`

---

### `push`

**POST** `/api/v1/sqlite/kv/{key}/push`

Append to array

```typescript
client.sqlite.kvStore.push(key: string, data: SqliteKvStorePushRequest, options?: { db: string; table?: string; path?: string; history?: boolean }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name |
| `data` | `SqliteKvStorePushRequest` | Yes | body |  |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |
| `path` | `string` | No | query | JSON path to nested array |
| `history` | `boolean` | No | query | Enable history tracking |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody kv arrays push`

---

### `removeElement`

**POST** `/api/v1/sqlite/kv/{key}/remove`

Remove array element

```typescript
client.sqlite.kvStore.removeElement(key: string, data: SqliteKvStoreRemoveElementRequest, options?: { db: string; table?: string; path?: string; index?: number; history?: boolean }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name |
| `data` | `SqliteKvStoreRemoveElementRequest` | Yes | body |  |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |
| `path` | `string` | No | query | JSON path to nested array |
| `index` | `number` | No | query | Array index to remove |
| `history` | `boolean` | No | query | Enable history tracking |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody kv arrays delete`

---

### `rollback`

**POST** `/api/v1/sqlite/kv/{key}/rollback`

Rollback key operations

```typescript
client.sqlite.kvStore.rollback(key: string, options?: { db: string; table?: string; steps?: number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |
| `steps` | `number` | No | query | Number of operations to rollback |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody kv rollback`

---

### `rollbackTable`

**POST** `/api/v1/sqlite/kv/rollback`

Rollback entire table

```typescript
client.sqlite.kvStore.rollbackTable(data: SqliteKvStoreRollbackTableRequest, options?: { db: string; to_timestamp: number; table?: string; dry_run?: boolean; confirm?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `SqliteKvStoreRollbackTableRequest` | Yes | body |  |
| `db` | `string` | Yes | query | Database file path |
| `to_timestamp` | `number` | Yes | query | Target timestamp to rollback to (Unix) |
| `table` | `string` | No | query | Custom table name |
| `dry_run` | `boolean` | No | query | Preview changes without applying |
| `confirm` | `string` | No | query | Must be 'yes' to execute actual rollback |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody kv rollback-table`

---

### `set`

**PUT** `/api/v1/sqlite/kv/{key}`

Set value for key

```typescript
client.sqlite.kvStore.set(key: string, data: SqliteKvStoreSetRequest, options?: { db: string; table?: string; path?: string; ttl?: number; if_match?: string; history?: boolean; create_db_if_missing?: boolean }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `key` | `string` | Yes | path | Key name |
| `data` | `SqliteKvStoreSetRequest` | Yes | body |  |
| `db` | `string` | Yes | query | Database file path |
| `table` | `string` | No | query | Custom table name |
| `path` | `string` | No | query | JSON path for nested value update |
| `ttl` | `number` | No | query | Time-to-live in seconds |
| `if_match` | `string` | No | query | Current value for compare-and-swap |
| `history` | `boolean` | No | query | Enable history tracking |
| `create_db_if_missing` | `boolean` | No | query | Create database file if it is missing |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody kv set`

---

## `client.sqlite.query` (1 method)

### `executeShareable`

**GET** `/api/v1/sqlite/query`

Execute shareable SQL query

```typescript
client.sqlite.query.executeShareable(options?: { db: string; sql: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `db` | `string` | Yes | query | Database file path |
| `sql` | `string` | Yes | query | Base64-encoded SQL query |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody db exec-shareable`

---

## `client.sqlite.sql` (1 method)

### `runMaintenance`

**POST** `/api/v1/sqlite/maintenance`

Run a database maintenance operation

```typescript
client.sqlite.sql.runMaintenance(data: RunMaintenanceRequest, options?: { db: string; timeout?: number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `RunMaintenanceRequest` | Yes | body |  |
| `db` | `string` | Yes | query | Database path (absolute path, bare name, or./name shorthand resolved to /hoody/databases/*.db) |
| `timeout` | `number` | No | query | Request deadline in seconds (clamped to [1, 300]) |

**Returns:** `ApiResponse<unknown>`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
