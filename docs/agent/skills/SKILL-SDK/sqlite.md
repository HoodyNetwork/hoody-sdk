> _**SDK skill · `sqlite` namespace** · ~10,148 tokens · hoody-sdk v1.0.0-beta.11_

# `sqlite` — SQLite HTTP API

## Purpose

hoody-sqlite: SQL tx, JSON KV, history, time-travel. Keyed by `db` query param. No workspace scoping.

## When to use

- Durable structured state without Postgres.
- KV: TTL, CAS, atomic incr/decr/push/pop, JSON-path, per-key history.
- Multi-statement SQL tx over HTTP; time-travel rollback by N ops or timestamp.

## When NOT to use

Blobs → `files`, supervisors → `daemon`, notebooks → `notes`, control-plane → `api`.

## Prerequisites

- Outside `/hoody/databases` needs `--allow-any-absolute-db-path`.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### DB + SQL tx

`database.create` `path` (bare/`./name`/abs under `/hoody/databases`), `init_kv: true` for KV table → `database.executeTransaction` `{ transaction: [{ statement, values?|valuesBatch? }] }` (`create_db_if_missing: true` skips create) → `history.list`.

### KV CRUD + CAS + counters

- `kvStore.set` — `ttl`, `if_match` (CAS), `path`, `history`.
- `kvStore.get` — `path`, `at_timestamp`. `exists` takes only `db`/`table`; `delete` takes only `db`/`table`/`history` (`history` keeps the tombstone).
- `kvStore.incr`/`decr`/`push`/`pop`/`removeElement` — atomic, `path`-aware.

### Time-travel (needs `history: true`)

- `kvStore.getHistory` (default 50, max 1000); `kvStore.getSnapshot` at `op_number`.
- `kvStore.getTableSnapshot` / `kvStore.compareSnapshots` — Unix `timestamp` / diff.
- `kvStore.rollback` last N; `kvStore.rollbackTable`: `dry_run` (query) then `confirm: 'yes'` (query — NOT body field). Body is **required** by SDK/CLI; pass `{}` for full-table rollback or `{"keys":[...]}` / `{"exclude_keys":[...]}` to scope.

### Bulk + shareable

- `kvStore.batchSet`/`batchGet`/`batchDelete` — single SQLite tx.
- `query.executeShareable` — GET, URL-safe base64 `sql`, read-only. `health.getHealth`/`getHealthCache`.

## Quirks & gotchas

- **Bare-URL auth (no claim/token headers).** Like every kit (including `agent`), the `sqlite` kit accepts the bare per-container kit URL — no `X-Hoody-Container-Claim` or `X-Hoody-Token` headers required. The capability URL itself is the bearer.
- **Tx item key matters: `"query"` vs `statement` are NOT interchangeable.** Each `transaction[i]` MUST carry exactly one of `"query"` (returns rows) or `statement` (rows-affected only). If you put a SELECT under `statement`, you silently get back `rowsUpdated: 0` and no data. The `sql` alias maps to `statement`.
- Path resolution: bare names auto-resolve under `/hoody/databases/` (with `.db` appended if no extension). Relative paths containing `/` or `\` are **rejected**, NOT auto-absoluted; only literal absolute paths (e.g. `/hoody/databases/app.db`) are treated as absolute. Outside `/hoody/databases` needs `--allow-any-absolute-db-path`. Symlinks followed; outward targets rejected. `:memory:` databases are rejected.
- Directory mode requires absolute db (`directory-mode: invalid path input: path must be absolute`).
- Tx items: `statement` or alias `sql`. `executeTransaction` caps: 10k items, 100k rows/`valuesBatch`, 1M total rows. `values` and `valuesBatch` are mutually exclusive on a single item; `"query"` items cannot use `valuesBatch`.
- **GET `/query` rejects mutations**: INSERT/UPDATE/DELETE, `RETURNING` on writes, multi-statement (semicolons), PRAGMA writes, VACUUM, ATTACH/DETACH. Use `executeTransaction` with `statement:` items for writes.
- **SELECT result-row cap is 10 000** (responses set `truncated: true` when hit) on both transaction `"query"` items and GET `/query`; further rows silently truncated. Paginate explicitly for larger result sets.
- **`kvStore.set` body is a JSON-encoded STRING**, not an object. Generated SDK type is `string`; encode objects yourself before sending (e.g. JSON-stringify the value). Same for the `batchSet` per-item `value`.
- Time-travel **history is opt-out, not opt-in**: write handlers default `history: true`. Pass `history: false` to skip recording — but later `kvStore.getHistory` / snapshot / time-travel reads will see gaps (`has_gaps`, `gap_keys`, `candidate_truncated` fields). Per-key history reconstruction is capped at 50 000 ops.
- `create_db_if_missing`/`auto_create` aliases; mismatch → `conflicting flags`.
- `kvStore.list` w/ `at_timestamp` → time-travel handler (different envelope, ignores `offset`). `getHistory.limit`: 0→50, >1000→1000.
- `query.executeShareable` `sql` accepts URL-safe base64 (`+`→`-`, `/`→`_`); both padded and unpadded forms are accepted. Inputs that do not decode to a SELECT/WITH query are treated as raw SQL. No workspace scoping — the kit URL alone is the credential, share carefully.
- CLI: `hoody db` (aliases `sql`, `sqlite`); KV under `hoody kv`.

## Common errors

- `412 Value mismatch for CAS` (`if_match` mismatch) / `412 Key does not exist for CAS` (both CAS failures are 412).
- `400 directory-mode: invalid path input: path must be absolute`.
- `400 absolute database paths outside /hoody/databases are disallowed`.
- `400 in-memory databases are not supported`.
- `400 conflicting flags: create_db_if_missing and auto_create must match`.
- `400 GET /query only accepts read-only SELECT/WITH queries; use POST /db for mutating SQL` (returned for non-SELECT input; a non-base64 `sql` value is not an error — it is interpreted as raw SQL).
- `400 Invalid JSON body` on `batchSet` — wire shape requires each `value` to be a JSON-encoded string, not an object.
- `409 time-travel chain gap` when the requested timestamp falls inside a `history: false` window.
- Per-statement tx errors → `{ reqIdx, error }`; HTTP 200 if tx parsed.

## Related namespaces

`files` `.db` in `/hoody/databases/` · `exec` in-container · `notes` notebooks · `cron` schedule maintenance.

## Examples

Every step in every example was live-tested against a real `sqlite-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first, then choose a `DB` path. Bare names (`./mydb`) auto-resolve under `/hoody/databases/`; absolute paths outside that tree need the kit's `--allow-any-absolute-db-path` flag (`/tmp/...` works on dev kits).

**Two SQL field names that are NOT interchangeable:** in a transaction item, the `"query":"..."` key is for SELECT (returns `resultSet`/`resultHeaders`) and the `"statement":"..."` key is for DDL/DML (returns `rowsUpdated` only). Putting a SELECT under `"statement"` runs it but throws away rows — `rowsUpdated:0` even when matches exist. The `"sql"` alias maps to `"statement"`, not `"query"`.

### 1. Schema setup with idempotent multi-statement transaction

**Goal:** create a fresh database under `/tmp/`, install a 3-statement schema (table + index + seed row) atomically, then read it back. Every statement is `IF NOT EXISTS` / parameterised so the whole step is replay-safe.

**Step 1 — create the db file** with the kv table pre-seeded so KV ops on the same db don't have to bootstrap separately.

```typescript
const db = `/tmp/sqlite-examples-${Math.random().toString(36).slice(2)}.db`;
await client.sqlite.database.create({ path: db, init_kv: true });
```
**Step 2 — install schema** in a single transaction. Returns `{results:[...]}` with one entry per statement; `rowsUpdated:1` on the final INSERT confirms the seed landed.

```typescript
await client.sqlite.database.executeTransaction(
  { transaction: [
    { statement: 'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, created_at INTEGER)' },
    { statement: 'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)' },
    { statement: 'INSERT OR IGNORE INTO users (name, email, created_at) VALUES (?, ?, ?)', values: ['Ada', 'ada@example.com', 1778191500] },
  ]},
  { db },
);
```
**Step 3 — read back using a SELECT under a transaction item with the `"query":"..."` key (NOT the `"statement":"..."` key — `statement` returns `rowsUpdated` only and silently drops rows).** The response carries `resultHeaders` + `resultSet` of column→value objects.

```typescript
const r = await client.sqlite.database.executeTransaction(
  { transaction: [{ query: 'SELECT id, name, email FROM users' }] },
  { db },
);
const rows = (r.data as any).results[0].resultSet;
```
### 2. KV CRUD with TTL — short-lived session token

**Goal:** store a per-user session blob with a 60-second TTL, prove `exists` flips to 404 after expiry, then explicitly delete.

**Step 1 — set with TTL.** The PUT body is the raw JSON value (string, object, array — kit infers `content_type`); query params carry `ttl` in seconds.

```typescript
await client.sqlite.kvStore.set('session:alex', JSON.stringify({ user_id: 'd6ec...', scopes: ['read', 'write'] }), { db, ttl: 60 });
```
**Step 2 — `HEAD` for existence** (zero-body, cheap). Returns `200` while live, `404` once TTL elapses.

```typescript
// The SDK THROWS on any non-2xx — a 404 never returns an inspectable object.
let present = true;
try { await client.sqlite.kvStore.exists('session:alex', { db }); }
catch (e: any) { if (e?.status !== 404) throw e; present = false; }
```
**Step 3 — explicit delete** (don't wait for TTL). `kvStore.delete` is NOT idempotent: deleting a missing key returns `404 Key not found`; on a hit it returns `{success:true,deleted:true}`. Wrap with try/catch or pre-check via `kvStore.get`.

```typescript
await client.sqlite.kvStore.delete('session:alex', { db });
```
### 3. Compare-and-swap on a versioned config blob

**Goal:** roll a config doc forward only when the current value matches what we last read. CAS uses `if_match` carrying the **literal raw value** (URL-encoded), not a hash — wrong value → `412 Value mismatch for CAS`.

**Step 1 — initial set** (no `if_match` needed; CAS only protects subsequent updates).

```typescript
await client.sqlite.kvStore.set('config', JSON.stringify({ version: 1, feature_x: false }), { db });
```
**Step 2 — read current**, then send the next version with `if_match` set to the exact JSON bytes you just read. Mismatched expected → `412`, request body is rejected.

```typescript
// CAS compares byte-exact against the stored bytes. SDK auto-parses the GET body
// into `cur.data` (an object), so `JSON.stringify(cur.data)` may diverge from
// what was stored (key order, whitespace). Use `rawResponse:true` to capture
// the exact stored bytes, OR remember the bytes you wrote and reuse them.
const curRaw = await client.sqlite.kvStore.get('config', { db, rawResponse: true, responseType: 'text' });
const ifMatch = curRaw as unknown as string;
await client.sqlite.kvStore.set('config', JSON.stringify({ version: 2, feature_x: true }), { db, if_match: ifMatch });
```
**Step 3 — observe a conflict** by sending stale `if_match`. Expect `HTTP 412 {"error":"Value mismatch for CAS"}` — the write is rejected without modifying the stored value.

```typescript
try {
  await client.sqlite.kvStore.set('config', JSON.stringify({ version: 99 }), { db, if_match: 'stale' });
} catch (e: any) { if (e?.status !== 412) throw e; /* CAS rejected */ }
```
### 4. Atomic counter for per-user rate limiting

**Goal:** hot-path increment/decrement without a transaction round-trip. `incr`/`decr` are server-side atomic and create the key on first hit; `delta` must be a POSITIVE integer (`delta <= 0` → `400 delta must be a positive integer`) — use `decr` for the negative direction. Useful for request quotas, login-attempt counters, work-queue depth.

**Step 1 — increment by 1** on each request. First call materialises the key as `text/plain` integer.

```typescript
const { data: r } = await client.sqlite.kvStore.incr('rate:alex:hour', { db, delta: 1 });
const count = (r as any).value;
```
**Step 2 — bulk-add 10** in one shot (e.g. credit refund). `delta` must be a positive integer; use `decr` to go the other way — a negative `delta` is rejected with `400`.

```typescript
await client.sqlite.kvStore.incr('rate:alex:hour', { db, delta: 10 });
```
**Step 3 — burn down by 3** (e.g. consume 3 quota units). Final value is plain text — `kvStore.get` returns the integer body directly, not wrapped.

```typescript
await client.sqlite.kvStore.decr('rate:alex:hour', { db, delta: 3 });
const final = await client.sqlite.kvStore.get('rate:alex:hour', { db }); // body = "8"
```
### 5. JSON-path read & partial update on a nested doc

**Goal:** stash a user-prefs document, read **one** field with `path=`, then mutate **only** that field without rewriting the whole blob. The path applies to both reads and writes.

**Step 1 — seed full document.**

```typescript
await client.sqlite.kvStore.set('profile', JSON.stringify({ name: 'Ada', prefs: { theme: 'dark', lang: 'en' } }), { db });
```
**Step 2 — read just `prefs.theme`**: returns the leaf value (`"dark"`), not the parent object.

```typescript
const { data: theme } = await client.sqlite.kvStore.get('profile', { db, path: 'prefs.theme' });
```
**Step 3 — patch one leaf**. The PUT body is the **new leaf value** (here `"light"`), not the full document. `lang` and `name` are untouched.

```typescript
await client.sqlite.kvStore.set('profile', '"light"', { db, path: 'prefs.theme' });
```
### 6. Time-travel — record three states of a feature flag, roll back two

**Goal:** undo the last two writes on a key without losing earlier history. Requires `history=true` on every write you want to be reversible.

**Step 1 — three sequential states** with history recording.

```typescript
for (const v of [{chat:false,voice:false},{chat:true,voice:false},{chat:true,voice:true}]) {
  await client.sqlite.kvStore.set('feature-flags', JSON.stringify(v), { db, history: true });
}
```
**Step 2 — inspect history** (`getHistory` returns newest first; each entry has `op_number` and `operation` — `operation.raw_old_value` / `operation.raw_new_value` are base64 and appear only for non-JSON content types).

```typescript
const { data: h } = await client.sqlite.kvStore.getHistory('feature-flags', { db, limit: 10 });
```
**Step 3 — roll back the last two ops** so `feature-flags` returns to `{chat:false,voice:false}`. Only the chosen key is affected.

```typescript
await client.sqlite.kvStore.rollback('feature-flags', { db, steps: 2 });
const { data: now } = await client.sqlite.kvStore.get('feature-flags', { db });
```
### 7. Snapshot at op-number, then diff against current

**Goal:** prove what a key looked like right after creation, then summarise every key that changed in a window. Uses `getSnapshot` (per-key, by `op_number`) and `compareSnapshots` (whole table, by Unix timestamps).

**Step 1 — fetch the per-key snapshot at `op_number=1`** (= the first state).

```typescript
const { data: s1 } = await client.sqlite.kvStore.getSnapshot('feature-flags', { db, op_number: 1 });
```
**Step 2 — record `from` and `to` timestamps** around a write window, then mutate so there is something to diff.

```typescript
const from = Math.floor(Date.now() / 1000); await new Promise(r => setTimeout(r, 1000));
await client.sqlite.kvStore.set('cmp-test', JSON.stringify({ v: 1 }), { db, history: true });
await new Promise(r => setTimeout(r, 1000));
const to = Math.floor(Date.now() / 1000);
```
**Step 3 — diff the table** between the two timestamps. `stats.created/modified/deleted` summarises; `changes[]` enumerates per-key.

```typescript
const { data: diff } = await client.sqlite.kvStore.compareSnapshots({ db, from, to });
```
### 8. Bulk batch — set / get / delete in single round-trips

**Goal:** seed three KV pairs, fetch them in one request (with one missing key to see the null payload), then drop them all. Each call wraps in a single SQLite tx; cap is 100 items per batch.

**Important wire-format detail:** in `batchSet`, every `value` must be a **string** (a JSON-encoded scalar/object). Sending a raw object → `400 Invalid JSON body`.

**Step 1 — bulk set with TTL on one item.**

```typescript
await client.sqlite.kvStore.batchSet({ items: [
  { key: 'u:1', value: JSON.stringify({ name: 'alice' }), content_type: 'application/json' },
  { key: 'u:2', value: JSON.stringify({ name: 'bob' }),   content_type: 'application/json' },
  { key: 'u:3', value: JSON.stringify({ name: 'carol' }), content_type: 'application/json', ttl: 3600 },
] } as any, { db });
```
**Step 2 — bulk get** (missing keys come back as `null`, present ones as `{value, content_type}`).

```typescript
const { data: got } = await client.sqlite.kvStore.batchGet({ keys: ['u:1','u:2','u:3','u:404'] } as any, { db });
```
**Step 3 — bulk delete.** Returns `{deleted: <count>, success: true}`. Missing keys silently no-op.

```typescript
await client.sqlite.kvStore.batchDelete({ keys: ['u:1','u:2','u:3'] } as any, { db });
```
### 9. Shareable read-only SQL via base64-encoded GET

**Goal:** mint a one-shot URL that runs a SELECT — safe to embed in dashboards / logs because the kit enforces read-only. `sql` is **URL-safe base64** (`+`→`-`, `/`→`_`); padding is optional — both padded and unpadded forms are accepted (the kit falls back to `base64.RawURLEncoding`).

**Step 1 — encode** the query.

```typescript
const sql = 'SELECT id, name, email FROM users LIMIT 10';
// Kit accepts URL-safe base64, padded or unpadded (falls back to
// base64.RawURLEncoding). Node's 'base64url' (unpadded) works as-is.
const sqlB64 = Buffer.from(sql).toString('base64url');
```
**Step 2 — issue the GET.** Response includes `columns`, `resultSet`, `rowCount`, `truncated`. A non-base64 `sql` value is not an error — it is interpreted as raw SQL; a non-SELECT query → `400 GET /query only accepts read-only SELECT/WITH queries; use POST /db for mutating SQL`.

```typescript
const { data: r } = await client.sqlite.query.executeShareable({ db, sql: sqlB64 });
```
**Step 3 — paste-able URL** (e.g. dashboard link). The kit URL itself is the auth grant — guard who you share it with.

```typescript
const url = `${kitUrl}/api/v1/sqlite/query?db=${encodeURIComponent(db)}&sql=${sqlB64}`;
```
### 10. Bulk insert via `valuesBatch` — one statement, many rows

**Goal:** load 3 rows (or 100k) through one prepared statement instead of one tx item per row. `valuesBatch` is an array of value-arrays positionally aligned with the `?` placeholders. Caps: 100k rows per `valuesBatch`, 1M rows per tx.

**Step 1 — bulk insert.** Response carries `rowsUpdatedBatch:[1,1,1]` — one entry per row.

```typescript
await client.sqlite.database.executeTransaction({ transaction: [{
  statement: 'INSERT INTO users (name, email, created_at) VALUES (?, ?, ?)',
  valuesBatch: [
    ['Bob','bob@example.com',1778000000],
    ['Carol','carol@example.com',1778000100],
    ['Dan','dan@example.com',1778000200],
  ],
}] }, { db });
```
**Step 2 — verify count** by sending a SELECT inside a transaction item with the `"query":"..."` key (NOT the `"statement":"..."` key).

```typescript
const r = await client.sqlite.database.executeTransaction(
  { transaction: [{ query: 'SELECT COUNT(*) AS n FROM users' }] }, { db });
const n = (r.data as any).results[0].resultSet[0].n;
```
**Step 3 — clean up** (drop the throwaway db file via `files`, or just leave under `/tmp/` for the next reboot to reclaim).

```typescript
await client.files.delete(db);
```

## Reference

**Accessor:** `client.sqlite`  |  **Import:** `import * as sqlite from 'hoody-sdk/sqlite'`

### `client.sqlite.database` (2) — Database

#### `create` — Create new SQLite database

```typescript
client.sqlite.database.create(path: string, init_kv?: boolean, kv_table?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | query | Yes | Database path (absolute path, bare name, or./name shorthand resolved to /hoody/databases/*.db) |
| `init_kv` | `boolean` | query | No | Initialize KV store tables |
| `kv_table` | `string` | query | No | Custom KV table name |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/sqlite/db/create`
**CLI:** `hoody db create`

---

#### `executeTransaction` — Execute SQL transaction

```typescript
client.sqlite.database.executeTransaction(db: string, create_db_if_missing?: boolean, data: sqlite_main.request)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database path (absolute path, bare name, or./name shorthand resolved to /hoody/databases/*.db) |
| `create_db_if_missing` | `boolean` | query | No | Create database file if it is missing |
| `data` | `sqlite_main.request` | body | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/sqlite/db`
**CLI:** `hoody db exec-transaction`

---

### `client.sqlite.docs` (2) — API documentation

#### `getJson` — Get OpenAPI specification (JSON redirect)

```typescript
client.sqlite.docs.getJson()
```

**Returns:** `void`  |  **HTTP:** `GET /api/v1/sqlite/openapi.json`

---

#### `getYaml` — Get OpenAPI specification (YAML)

```typescript
client.sqlite.docs.getYaml()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/sqlite/openapi.yaml`

---

### `client.sqlite.health` (2) — Health

#### `getHealth` — Health check

```typescript
client.sqlite.health.getHealth()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/sqlite/health`

---

#### `getHealthCache` — Cache health snapshot

```typescript
client.sqlite.health.getHealthCache()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/sqlite/health/cache`

---

### `client.sqlite.history` (4) — Query execution history and statistics

#### `clear` — Clear query history

```typescript
client.sqlite.history.clear(db: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/sqlite/history`
**CLI:** `hoody db history clear`

---

#### `deleteEntry` — Delete history entry

```typescript
client.sqlite.history.deleteEntry(index: integer, db: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `index` | `integer` | path | Yes | History entry ID |
| `db` | `string` | query | Yes | Database file path |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/sqlite/history/{index}`
**CLI:** `hoody db history delete`

---

#### `getStats` — Get history statistics

```typescript
client.sqlite.history.getStats(db: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/sqlite/history/stats`
**CLI:** `hoody db history stats`

---

#### `list` — Get query history

```typescript
client.sqlite.history.list(db: string, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |
| `limit` | `integer` | query | No | Maximum number of entries to return |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/sqlite/history`
**CLI:** `hoody db history list`

---

### `client.sqlite.kvStore` (21) — Key-Value store operations with TTL and namespaces

#### `batchDelete` — Batch delete multiple keys

```typescript
client.sqlite.kvStore.batchDelete(db: string, table?: string, data: sqlite_main.kvBatchDeleteRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `data` | `sqlite_main.kvBatchDeleteRequest` | body | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/sqlite/kv/batch/delete`
**CLI:** `hoody kv batch delete`

---

#### `batchGet` — Batch get multiple keys

```typescript
client.sqlite.kvStore.batchGet(db: string, table?: string, data: sqlite_main.kvBatchGetRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `data` | `sqlite_main.kvBatchGetRequest` | body | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/sqlite/kv/batch/get`
**CLI:** `hoody kv batch get`

---

#### `batchSet` — Batch set multiple keys

```typescript
client.sqlite.kvStore.batchSet(db: string, table?: string, data: sqlite_main.kvBatchSetRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `data` | `sqlite_main.kvBatchSetRequest` | body | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/sqlite/kv/batch/set`
**CLI:** `hoody kv batch set`

---

#### `compareSnapshots` — Compare table snapshots

```typescript
client.sqlite.kvStore.compareSnapshots(db: string, table?: string, from: integer, to: integer, keys?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `from` | `integer` | query | Yes | Starting timestamp (Unix) |
| `to` | `integer` | query | Yes | Ending timestamp (Unix) |
| `keys` | `string` | query | No | Comma-separated list of keys to compare (optional) |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/sqlite/kv/diff`
**CLI:** `hoody kv snapshots compare-table`

---

#### `decr` — Atomic decrement

```typescript
client.sqlite.kvStore.decr(key: string, db: string, table?: string, delta?: integer, path?: string, history?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `delta` | `integer` | query | No | Amount to decrement |
| `path` | `string` | query | No | JSON path to nested numeric value |
| `history` | `boolean` | query | No | Enable history tracking |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/sqlite/kv/{key}/decr`
**CLI:** `hoody kv decr`

---

#### `delete` — Delete key

```typescript
client.sqlite.kvStore.delete(key: string, db: string, table?: string, history?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `db` | `string` | query | Yes | Database file path or directory |
| `table` | `string` | query | No | Custom table name |
| `history` | `boolean` | query | No | Enable history tracking |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/sqlite/kv/{key}`
**CLI:** `hoody kv delete`

---

#### `exists` — Check if key exists

```typescript
client.sqlite.kvStore.exists(key: string, db: string, table?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `db` | `string` | query | Yes | Database file path or directory |
| `table` | `string` | query | No | Custom table name |

**Returns:** `any`  |  **HTTP:** `HEAD /api/v1/sqlite/kv/{key}`
**CLI:** `hoody kv exists`

---

#### `get` — Get value by key

```typescript
client.sqlite.kvStore.get(key: string, db: string, table?: string, path?: string, at_timestamp?: integer, rebuild?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name (supports / for hierarchical keys) |
| `db` | `string` | query | Yes | Database file path or directory |
| `table` | `string` | query | No | Custom table name |
| `path` | `string` | query | No | JSON path for nested value extraction |
| `at_timestamp` | `integer` | query | No | Unix timestamp for time-travel query (selects handleKVAtTimestamp) |
| `rebuild` | `boolean` | query | No | Rebuild cache (directory mode only) |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/sqlite/kv/{key}`
**CLI:** `hoody kv get`

---

#### `getHistory` — Get key operation history

```typescript
client.sqlite.kvStore.getHistory(key: string, db: string, table?: string, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `limit` | `integer` | query | No | Maximum number of operations to return (0 → default 50, clamped to maximum 1000) |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/sqlite/kv/{key}/history`
**CLI:** `hoody kv history`

---

#### `getSnapshot` — Get key snapshot at operation

```typescript
client.sqlite.kvStore.getSnapshot(key: string, db: string, table?: string, op_number: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `op_number` | `integer` | query | Yes | Operation number to reconstruct from |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/sqlite/kv/{key}/snapshot`
**CLI:** `hoody kv snapshots get-key`

---

#### `getTableSnapshot` — Get table snapshot at timestamp

```typescript
client.sqlite.kvStore.getTableSnapshot(db: string, table?: string, timestamp: integer, limit?: integer, prefix?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `timestamp` | `integer` | query | Yes | Unix timestamp to reconstruct from |
| `limit` | `integer` | query | No | Maximum number of keys to return |
| `prefix` | `string` | query | No | Filter keys by prefix |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/sqlite/kv/snapshot`
**CLI:** `hoody kv snapshots get-table`

---

#### `incr` — Atomic increment

```typescript
client.sqlite.kvStore.incr(key: string, db: string, table?: string, delta?: integer, path?: string, history?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `delta` | `integer` | query | No | Amount to increment |
| `path` | `string` | query | No | JSON path to nested numeric value |
| `history` | `boolean` | query | No | Enable history tracking |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/sqlite/kv/{key}/incr`
**CLI:** `hoody kv incr`

---

#### `list` — List keys

```typescript
client.sqlite.kvStore.list(db: string, table?: string, prefix?: string, limit?: integer, offset?: integer, at_timestamp?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path or directory |
| `table` | `string` | query | No | Custom table name |
| `prefix` | `string` | query | No | Filter keys by prefix |
| `limit` | `integer` | query | No | Maximum number of results |
| `offset` | `integer` | query | No | Skip N results for pagination (regular LIST only; ignored when at_timestamp is set) |
| `at_timestamp` | `integer` | query | No | Unix timestamp for time-travel LIST (selects handleKVListAtTimestamp; returns a different envelope and ignores offset) |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/sqlite/kv`
**CLI:** `hoody kv list`

---

#### `listAll` — List keys (collect all pages)

```typescript
client.sqlite.kvStore.listAll(db: string, table?: string, prefix?: string, limit?: integer, offset?: integer, at_timestamp?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path or directory |
| `table` | `string` | query | No | Custom table name |
| `prefix` | `string` | query | No | Filter keys by prefix |
| `limit` | `integer` | query | No | Maximum number of results |
| `offset` | `integer` | query | No | Skip N results for pagination (regular LIST only; ignored when at_timestamp is set) |
| `at_timestamp` | `integer` | query | No | Unix timestamp for time-travel LIST (selects handleKVListAtTimestamp; returns a different envelope and ignores offset) |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/sqlite/kv`
**CLI:** `hoody kv list`

---

#### `listIterator` — List keys (async iterator)

```typescript
client.sqlite.kvStore.listIterator(db: string, table?: string, prefix?: string, limit?: integer, offset?: integer, at_timestamp?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path or directory |
| `table` | `string` | query | No | Custom table name |
| `prefix` | `string` | query | No | Filter keys by prefix |
| `limit` | `integer` | query | No | Maximum number of results |
| `offset` | `integer` | query | No | Skip N results for pagination (regular LIST only; ignored when at_timestamp is set) |
| `at_timestamp` | `integer` | query | No | Unix timestamp for time-travel LIST (selects handleKVListAtTimestamp; returns a different envelope and ignores offset) |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/sqlite/kv`
**CLI:** `hoody kv list`

---

#### `pop` — Remove from array end

```typescript
client.sqlite.kvStore.pop(key: string, db: string, table?: string, path?: string, history?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `path` | `string` | query | No | JSON path to nested array |
| `history` | `boolean` | query | No | Enable history tracking |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/sqlite/kv/{key}/pop`
**CLI:** `hoody kv arrays pop`

---

#### `push` — Append to array

```typescript
client.sqlite.kvStore.push(key: string, db: string, table?: string, path?: string, history?: boolean, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `path` | `string` | query | No | JSON path to nested array |
| `history` | `boolean` | query | No | Enable history tracking |
| `data` | `object` | body | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/sqlite/kv/{key}/push`
**CLI:** `hoody kv arrays push`

---

#### `removeElement` — Remove array element

```typescript
client.sqlite.kvStore.removeElement(key: string, db: string, table?: string, path?: string, index?: integer, history?: boolean, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `path` | `string` | query | No | JSON path to nested array |
| `index` | `integer` | query | No | Array index to remove |
| `history` | `boolean` | query | No | Enable history tracking |
| `data` | `object` | body | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/sqlite/kv/{key}/remove`
**CLI:** `hoody kv arrays delete`

---

#### `rollback` — Rollback key operations

```typescript
client.sqlite.kvStore.rollback(key: string, db: string, table?: string, steps?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `steps` | `integer` | query | No | Number of operations to rollback |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/sqlite/kv/{key}/rollback`
**CLI:** `hoody kv rollback`

---

#### `rollbackTable` — Rollback entire table

```typescript
client.sqlite.kvStore.rollbackTable(db: string, table?: string, to_timestamp: integer, dry_run?: boolean, confirm?: string, data: sqlite_main.kvTableRollbackRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `to_timestamp` | `integer` | query | Yes | Target timestamp to rollback to (Unix) |
| `dry_run` | `boolean` | query | No | Preview changes without applying |
| `confirm` | `string` | query | No | Must be 'yes' to execute actual rollback |
| `data` | `sqlite_main.kvTableRollbackRequest` | body | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/sqlite/kv/rollback`
**CLI:** `hoody kv rollback-table`

---

#### `set` — Set value for key

```typescript
client.sqlite.kvStore.set(key: string, db: string, table?: string, path?: string, ttl?: integer, if_match?: string, history?: boolean, create_db_if_missing?: boolean, data: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `path` | `string` | query | No | JSON path for nested value update |
| `ttl` | `integer` | query | No | Time-to-live in seconds |
| `if_match` | `string` | query | No | Current value for compare-and-swap |
| `history` | `boolean` | query | No | Enable history tracking |
| `create_db_if_missing` | `boolean` | query | No | Create database file if it is missing |
| `data` | `string` | body | Yes |  |

**Body:** `string`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/sqlite/kv/{key}`
**CLI:** `hoody kv set`

---

### `client.sqlite.query` (1) — Query

#### `executeShareable` — Execute shareable SQL query

```typescript
client.sqlite.query.executeShareable(db: string, sql: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |
| `sql` | `string` | query | Yes | Base64-encoded SQL query |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/sqlite/query`
**CLI:** `hoody db exec-shareable`

---

### `client.sqlite.sql` (1) — SQL database operations

#### `runMaintenance` — Run a database maintenance operation

```typescript
client.sqlite.sql.runMaintenance(db: string, timeout?: integer, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database path (absolute path, bare name, or./name shorthand resolved to /hoody/databases/*.db) |
| `timeout` | `integer` | query | No | Request deadline in seconds (clamped to [1, 300]) |
| `data` | `object` | body | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/sqlite/maintenance`


### Body schemas

- `sqlite_main.request` — `{ resultFormat: string, transaction: sqlite_main.requestItem[] }`
- `sqlite_main.kvBatchDeleteRequest` — `{ keys*: string[] }`
- `sqlite_main.kvBatchGetRequest` — `{ keys*: string[] }`
- `sqlite_main.kvBatchSetRequest` — `{ items*: sqlite_main.kvBatchSetItem[] }`
- `sqlite_main.kvTableRollbackRequest` — `{ exclude_keys: string[], keys: string[] }`
- `sqlite_main.requestItem` — `{ noFail: bool, query: string, statement: string, values: int[], valuesBatch: int[][], sql: string }`
- `sqlite_main.kvBatchSetItem` — `{ content_type: string, key*: string, ttl: int, value: string }`

