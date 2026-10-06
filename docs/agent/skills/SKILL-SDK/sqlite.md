> _**SDK skill · `sqlite` namespace** · ~26,055 tokens · hoody-sdk v1.0.0-beta.15_

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

- Absolute paths outside `/hoody/databases` are refused unless the deployment allows any absolute database path.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### DB + SQL tx

`databases.create({ path, init_kv: true })` (`path`: bare name, `./name`, or absolute under `/hoody/databases`; `init_kv` creates the KV table) → `sql.runTransaction({ transaction: [{ statement, values?|valuesBatch? }] }, { db, create_db_if_missing: true })` (`create_db_if_missing` makes the create step optional) → `history.list({ db })`.

One statement: `sql.query({ db, sql, params? })` resolves to `{ rows, columns, truncated }` (it sends a `query` item, so a write with `RETURNING` answers its rows too) and `sql.run({ db, sql, params? })` to `{ rowsUpdated }` (a `statement` item), both without the envelope. `params` is an array for `?` or an object for `:name`, each value a string, finite number, boolean or null (anything else throws before sending); `create_db_if_missing` and the request options pass through.

### KV CRUD + CAS + counters

- `kv.set` — `ttl`, `if_match` (CAS), `path`, `history`.
- `kv.get` — `path`, `at_timestamp`. `exists` takes `db`, plus optional `table` and `timeout`; `kv.delete` takes `db`/`table`/`history` (`history` keeps the tombstone) plus `create_db_if_missing` (alias `auto_create`) and `timeout`.
- `kv.increment` / `kv.decrement` / `kv.push` / `kv.pop` / `kv.remove` — atomic, `path`-aware (`path` is a JSON path inside the value, such as `.user.tags`). The push body is any JSON value, appended as one element; the remove body is `{"value": <any>}` (matches by value), or pass the `index` query parameter instead. The generated push type is an object, so pushing a string or number needs `as any`.

### Time-travel (needs `history: true`)

- `kv.listHistory` (default 50, max 1000); `kv.getSnapshot` at `op_number`.
- `kv.getTableSnapshot` / `kv.compareTableSnapshots` — Unix `timestamp` in seconds (milliseconds are rejected as "in the future") / diff.
- `kv.rollback` last N; `kv.rollbackTable`: `dry_run` (query) then `confirm: 'yes'` (query — NOT body field). The body is optional: omit it for a full-table rollback, or send `{"keys":[...]}` / `{"exclude_keys":[...]}` to scope it. The body is the first positional argument, so pass `undefined` (`rollbackTable(undefined, { db, to_timestamp, confirm: 'yes' })`) or the filter object.

### Bulk + shareable

- `kv.setMany`/`kv.deleteMany` — one SQLite transaction each. `kv.getMany` — one HTTP request that reads every key in one read-only SQLite transaction, with one expiry check time, so the result is one consistent snapshot.
- `sql.queryReadOnly` — GET, URL-safe base64 `sql`, read-only. `kit.getHealth`/`kit.getCacheStats`.

## Quirks & gotchas

- **Bare-URL auth (no claim/token headers).** Like every kit (including `agent`), the `sqlite` kit accepts the bare per-container kit URL — no `X-Hoody-Container-Claim` or `X-Hoody-Token` headers required. The capability URL itself is the bearer.
- **Tx item keys: `"query"` and `statement`.** Each `transaction[i]` MUST carry exactly one of `"query"` or `statement`. A `statement` returns rows (`resultHeaders`/`resultSet`) when its SQL produces columns (a SELECT, or a write with `RETURNING`), and `rowsUpdated` otherwise. Use `"query"` for reads anyway; `valuesBatch` keeps its own restrictions. The `sql` alias maps to `statement`.
- Path resolution: bare names auto-resolve under `/hoody/databases/` (with `.db` appended if no extension). The `./name` shorthand is the same bare name (`./app` → `/hoody/databases/app.db`). Any other relative path containing `/` or `\` (e.g. `data/app.db`, `./dir/app.db`) is **rejected**, NOT auto-absoluted; only literal absolute paths (e.g. `/hoody/databases/app.db`) are treated as absolute. Absolute paths outside `/hoody/databases` are refused unless the deployment allows any absolute database path. A database filename must be a regular file: a symlink at the filename itself is rejected. Symlinked parent directories are resolved to their real path. `:memory:` databases are rejected.
- Directory mode takes an absolute directory path. Any other relative path (`sub/dir`) is refused with `directory-mode: invalid path input: path must be absolute`; a bare database name (`app`) is not treated as a directory and is opened as a database instead.
- Tx items: `statement` or alias `sql`. `sql.runTransaction` caps: 10k items, 100k rows/`valuesBatch`, 1M total rows. `values` and `valuesBatch` are mutually exclusive on a single item; `"query"` items cannot use `valuesBatch`.
- **GET `/query` rejects mutations**: INSERT/UPDATE/DELETE, `RETURNING` on writes, multi-statement (semicolons), PRAGMA writes, VACUUM, ATTACH/DETACH. Use `sql.runTransaction` with `statement:` items for writes.
- **SELECT result-row cap is 10 000** (responses set `truncated: true` when hit) on both transaction `"query"` items and GET `/query`; further rows silently truncated. Paginate explicitly for larger result sets.
- **`kv.set` body is any JSON value** (object, array, string, number, boolean, null), stored verbatim. The generated SDK type is `unknown`. Pass the JavaScript value itself: the SDK JSON-encodes every body sent as JSON, strings included, so `set(key, 'light')` stores the JSON string `"light"` and `set(key, JSON.stringify(obj))` stores a quoted string, not the object. **`kv.setMany` differs:** each item's `value` is a string, so JSON-encode objects yourself.
- Time-travel **history is opt-out, not opt-in**: write handlers default `history: true`. Pass `history: false` to skip recording — but later `kv.listHistory` / snapshot / time-travel reads will see gaps (`has_gaps`, `gap_keys`, `candidate_truncated` fields). Per-key history reconstruction is capped at 50 000 ops.
- `create_db_if_missing`/`auto_create` aliases; mismatch → `conflicting flags`.
- `kv.list` w/ `at_timestamp` → time-travel handler (different envelope; `offset` and `limit` still apply, ordered by key as in the regular listing). The history `limit`: 0→50, >1000→1000.
- `sql.queryReadOnly` `sql` accepts URL-safe base64 (`+`→`-`, `/`→`_`); both padded and unpadded forms are accepted. Inputs that do not decode to a SELECT/WITH query are treated as raw SQL. No workspace scoping — the kit URL alone is the credential, share carefully.
- `databases.delete({ db })` removes a database file and its `-wal`, `-shm` and `-journal` companions, companions first. A missing file is `404 DATABASE_NOT_FOUND`; a directory or a non-SQLite file is `400` and stays untouched; a database other requests still hold past the deadline is `503 DATABASE_BUSY` with nothing removed. `500 DELETE_INCOMPLETE` lists `files_removed` and leaves the database file in place, so retrying the delete finishes it. A delete and a create of the same path wait for each other.
- A directory-mode KV store keeps a `.hoody_sqlite/cache.db` in each directory it uses and holds it open, so that file and its `-wal`, `-shm` and `-journal` companions can be neither created nor deleted as a database (`400 INVALID_DB_PATH`). Any other database inside a `.hoody_sqlite` directory is an ordinary database.

## Common errors

- `412 Value mismatch for CAS` (`if_match` mismatch) / `412 Key does not exist for CAS` (both CAS failures are 412).
- `400 directory-mode: invalid path input: path must be absolute` (directory mode given a relative path).
- `400 absolute database paths outside /hoody/databases are disallowed`.
- `400 invalid database name; allowed: letters, numbers, dot, dash, underscore` for `:memory:` (and any other bare name with characters outside that set). An absolute path containing `:memory:` gets `400 in-memory databases are not supported` instead.
- `400 conflicting flags: create_db_if_missing and auto_create must match`.
- `400 GET /query only accepts read-only SELECT/WITH queries; use POST /db for mutating SQL` (returned for non-SELECT input; a non-base64 `sql` value is not an error — it is interpreted as raw SQL).
- `400 Invalid JSON body` on `kv.setMany` — wire shape requires each `value` to be a JSON-encoded string, not an object.
- `409` with `"error": "TIME_TRAVEL_CHAIN_GAP"` (message `time-travel: chain gap straddles target timestamp`) when the history needed for the answer has an unrecorded (`history: false`) or pruned gap. Timestamp reads, `kv.getSnapshot` at an `op_number`, and the rollbacks (`kv.rollback`, `kv.rollbackTable`) all return it. Per-key rollback puts the detail in `error` after the code (`"TIME_TRAVEL_CHAIN_GAP: ..."`); table rollback returns `error: "TIME_TRAVEL_CHAIN_GAP"` and puts the detail in `message`.
- A failing transaction item aborts and rolls back the whole transaction by default: the response is that item's HTTP status (4xx or 5xx) with `{ "reqIdx": <index>, "error": "...", "code": "..." }`. A failure of your own SQL is classified: `400 SQL_ERROR` (syntax, unknown table or column) or `400 SQL_BIND_ERROR` (parameters that do not fit the statement), `409 SQL_CONSTRAINT` or `409 DATABASE_READONLY`, which carry SQLite's message, and `503 DATABASE_BUSY` or `503 REQUEST_TIMEOUT`, which carry the generic `internal database error` (no 5xx body carries SQLite's text). Anything else is `500 DATABASE_ERROR` with the same generic message, so do not retry it blindly. Set `"noFail": true` on an item to keep going instead: the call returns `200`, and that item's result is `{ "success": false, "error": "...", "code": "..." }` (no `reqIdx`).

## Related namespaces

`files` `.db` in `/hoody/databases/` · `exec` in-container · `notes` notebooks · `cron` schedule maintenance.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first, then choose a `DB` path. Bare names (`./mydb`) auto-resolve under `/hoody/databases/`; absolute paths outside that tree are refused unless the deployment allows any absolute database path (`/tmp/...` works on dev kits).

**Two SQL field names:** in a transaction item, use the `"query":"..."` key for SELECT (returns `resultSet`/`resultHeaders`) and the `"statement":"..."` key for DDL/DML (returns `rowsUpdated`, or rows when the SQL produces columns, such as a write with `RETURNING`). The `"sql"` alias maps to `"statement"`, not `"query"`.

### 1. Schema setup with idempotent multi-statement transaction

**Goal:** create a fresh database under `/tmp/`, install a 3-statement schema (table + index + seed row) atomically, then read it back. Every statement is `IF NOT EXISTS` / parameterised so the whole step is replay-safe.

**Step 1 — create the db file** with the kv table pre-seeded so KV ops on the same db don't have to bootstrap separately.

```typescript
const db = `/tmp/sqlite-examples-${Math.random().toString(36).slice(2)}.db`;
await client.sqlite.databases.create({ path: db, init_kv: true });
```

**Step 2 — install schema** in a single transaction. Returns `{results:[...]}` with one entry per statement; `rowsUpdated:1` on the final INSERT confirms the seed landed.

```typescript
await client.sqlite.sql.runTransaction(
  { transaction: [
    { statement: 'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, created_at INTEGER)' },
    { statement: 'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)' },
    { statement: 'INSERT OR IGNORE INTO users (name, email, created_at) VALUES (?, ?, ?)', values: ['Ada', 'ada@example.com', 1778191500] },
  ]},
  { db },
);
```

**Step 3 — read back using a SELECT under a transaction item with the `"query":"..."` key (the read key; a `statement` that produces columns also returns them).** The response carries `resultHeaders` + `resultSet` of column→value objects.

```typescript
const r = await client.sqlite.sql.runTransaction(
  { transaction: [{ query: 'SELECT id, name, email FROM users' }] },
  { db },
);
const rows = (r.data as any).results[0].resultSet;
// One statement, no envelope:
const { rows: same } = await client.sqlite.sql.query({ db, sql: 'SELECT id, name, email FROM users' });
```

### 2. KV CRUD with TTL — short-lived session token

**Goal:** store a per-user session blob with a 60-second TTL, prove `exists` flips to 404 after expiry, then explicitly delete.

**Step 1 — set with TTL.** The PUT body is the value; the kit records the request's `Content-Type` as the key's `content_type` (default `application/octet-stream`), so send JSON with `Content-Type: application/json`. Query params carry `ttl` in seconds.

```typescript
await client.sqlite.kv.set('session:alex', { user_id: 'd6ec...', scopes: ['read', 'write'] }, { db, ttl: 60 });
```

**Step 2 — `HEAD` for existence** (zero-body, cheap). Returns `200` while live, `404` once TTL elapses. A HEAD answer has no body, so the 404 names its reason in the `X-Hoody-Error-Code` header: `KEY_NOT_FOUND` or `KEY_EXPIRED`.

```typescript
// exists() resolves to a boolean: true while live, false for a 404 whose
// X-Hoody-Error-Code is KEY_NOT_FOUND or KEY_EXPIRED. It throws on anything else,
// including a 404 without that header (an unknown route or a proxy, not this key).
const present = await client.sqlite.kv.exists('session:alex', { db });
```

**Step 3 — explicit delete** (don't wait for TTL). `kv.delete` is NOT idempotent: deleting a missing key returns `404 Key not found`; on a hit it returns `{success:true,deleted:true}`. Wrap with try/catch or pre-check via `kv.get`.

```typescript
await client.sqlite.kv.delete('session:alex', { db });
```

### 3. Compare-and-swap on a versioned config blob

**Goal:** roll a config doc forward only when the current value matches what we last read. CAS uses `if_match` carrying the **literal raw value** (URL-encoded), not a hash — wrong value → `412 Value mismatch for CAS`.

**Step 1 — initial set** (no `if_match` needed; CAS only protects subsequent updates).

```typescript
await client.sqlite.kv.set('config', { version: 1, feature_x: false }, { db });
```

**Step 2 — read current**, then send the next version with `if_match` set to the exact JSON bytes you just read. Mismatched expected → `412`, request body is rejected.

```typescript
// CAS compares byte-exact against the stored bytes. SDK auto-parses the GET body
// into `cur.data` (an object), so `JSON.stringify(cur.data)` may diverge from
// what was stored (key order, whitespace). Use `rawResponse:true` to capture
// the exact stored bytes, OR remember the bytes you wrote and reuse them.
const curRaw = await client.sqlite.kv.get('config', { db, rawResponse: true, responseType: 'text' });
const ifMatch = curRaw as unknown as string;
await client.sqlite.kv.set('config', { version: 2, feature_x: true }, { db, if_match: ifMatch });
```

**Step 3 — observe a conflict** by sending stale `if_match`. Expect `HTTP 412 {"error":"Value mismatch for CAS"}` — the write is rejected without modifying the stored value.

```typescript
try {
  await client.sqlite.kv.set('config', { version: 99 }, { db, if_match: 'stale' });
} catch (e: any) { if (e?.status !== 412) throw e; /* CAS rejected */ }
```

### 4. Atomic counter for per-user rate limiting

**Goal:** hot-path increment/decrement without a transaction round-trip. `kv.increment` / `kv.decrement` are server-side atomic and create the key on first hit; `delta` must be a POSITIVE integer (`delta <= 0` → `400 delta must be a positive integer`) — use `kv.decrement` for the negative direction. Useful for request quotas, login-attempt counters, work-queue depth.

**Step 1 — increment by 1** on each request. First call materialises the key as `text/plain` integer.

```typescript
const { data: r } = await client.sqlite.kv.increment('rate:alex:hour', { db, delta: 1 });
const count = (r as any).value;
```

**Step 2 — bulk-add 10** in one shot (e.g. credit refund). `delta` must be a positive integer; use `kv.decrement` to go the other way — a negative `delta` is rejected with `400`.

```typescript
await client.sqlite.kv.increment('rate:alex:hour', { db, delta: 10 });
```

**Step 3 — burn down by 3** (e.g. consume 3 quota units). The HTTP body of the final read is the plain integer. The SDK still wraps it: read it from `.data`, or pass `rawResponse: true` to get the body alone.

```typescript
await client.sqlite.kv.decrement('rate:alex:hour', { db, delta: 3 });
const { data: final } = await client.sqlite.kv.get('rate:alex:hour', { db }); // 8
```

### 5. JSON-path read & partial update on a nested doc

**Goal:** stash a user-prefs document, read **one** field with `path=`, then mutate **only** that field without rewriting the whole blob. The path applies to both reads and writes.

**Step 1 — seed full document.**

```typescript
await client.sqlite.kv.set('profile', { name: 'Ada', prefs: { theme: 'dark', lang: 'en' } }, { db });
```

**Step 2 — read just `prefs.theme`**: returns the leaf value (`"dark"`), not the parent object.

```typescript
const { data: theme } = await client.sqlite.kv.get('profile', { db, path: 'prefs.theme' });
```

**Step 3 — patch one leaf**. The PUT body is the **new leaf value** (here `"light"`), not the full document. `lang` and `name` are untouched.

```typescript
await client.sqlite.kv.set('profile', 'light', { db, path: 'prefs.theme' }) // sent as the JSON string "light";
```

### 6. Time-travel — record three states of a feature flag, roll back two

**Goal:** undo the last two writes on a key without losing earlier history. Requires `history=true` on every write you want to be reversible.

**Step 1 — three sequential states** with history recording.

```typescript
for (const v of [{chat:false,voice:false},{chat:true,voice:false},{chat:true,voice:true}]) {
  await client.sqlite.kv.set('feature-flags', v, { db, history: true });
}
```

**Step 2 — inspect history** (`kv.listHistory` returns newest first; each entry has `op_number` and `operation` — `operation.raw_old_value` / `operation.raw_new_value` carry the value bytes in base64 for every content type, JSON included).

```typescript
const { data: h } = await client.sqlite.kv.listHistory('feature-flags', { db, limit: 10 });
```

**Step 3 — roll back the last two ops** so `feature-flags` returns to `{chat:false,voice:false}`. Only the chosen key is affected.

```typescript
await client.sqlite.kv.rollback('feature-flags', { db, steps: 2 });
const { data: now } = await client.sqlite.kv.get('feature-flags', { db });
```

### 7. Snapshot at op-number, then diff against current

**Goal:** prove what a key looked like right after creation, then summarise every key that changed in a window. Uses `getSnapshot` (per-key, by `op_number`) and `kv.compareTableSnapshots` (whole table, by Unix timestamps).

**Step 1 — fetch the per-key snapshot at `op_number=1`** (= the first state).

```typescript
const { data: s1 } = await client.sqlite.kv.getSnapshot('feature-flags', { db, op_number: 1 });
```

**Step 2 — record `from` and `to` timestamps** around a write window, then mutate so there is something to diff.

```typescript
const from = Math.floor(Date.now() / 1000); await new Promise(r => setTimeout(r, 1000));
await client.sqlite.kv.set('cmp-test', { v: 1 }, { db, history: true });
await new Promise(r => setTimeout(r, 1000));
const to = Math.floor(Date.now() / 1000);
```

**Step 3 — diff the table** between the two timestamps. `stats.created/modified/deleted` summarises; `changes[]` enumerates per-key.

```typescript
const { data: diff } = await client.sqlite.kv.compareTableSnapshots({ db, from, to });
```

### 8. Bulk batch — set / get / delete in single round-trips

**Goal:** seed three KV pairs, fetch them in one request (with one missing key to see the null payload), then drop them all. `kv.setMany` and `kv.deleteMany` each run in one SQLite transaction; `kv.getMany` reads every key in one read transaction, so the result is one consistent snapshot. Cap is 100 items per batch.

**Important wire-format detail:** in `kv.setMany`, every `value` must be a **string** (a JSON-encoded scalar/object). Sending a raw object → `400 Invalid JSON body`.

**Step 1 — bulk set with TTL on one item.**

```typescript
await client.sqlite.kv.setMany({ items: [
  { key: 'u:1', value: JSON.stringify({ name: 'alice' }), content_type: 'application/json' },
  { key: 'u:2', value: JSON.stringify({ name: 'bob' }),   content_type: 'application/json' },
  { key: 'u:3', value: JSON.stringify({ name: 'carol' }), content_type: 'application/json', ttl: 3600 },
] } as any, { db });
```

**Step 2 — bulk get** (missing keys come back as `null`; present ones as `{content_type, value}` when `content_type` is JSON, otherwise as `{content_type, value_base64}`). A `kv.setMany` item written without `content_type` is stored as `application/octet-stream` and so comes back base64-encoded; set `content_type: application/json`, as step 1 does, to get parsed JSON back.

```typescript
const { data: got } = await client.sqlite.kv.getMany({ keys: ['u:1','u:2','u:3','u:404'] } as any, { db });
```

**Step 3 — bulk delete.** Returns `{deleted: <count>, success: true}`. Missing keys silently no-op.

```typescript
await client.sqlite.kv.deleteMany({ keys: ['u:1','u:2','u:3'] } as any, { db });
```

### 9. Shareable read-only SQL via base64-encoded GET

**Goal:** build a reusable GET URL that runs a SELECT. The `/query` route itself rejects writes, but the URL is not a restricted credential: it carries the kit URL, which also reaches every other route of this kit (including mutating `POST /db`) and has no expiry of its own. Share it only where you would share the kit URL itself. `sql` is **URL-safe base64** (`+`→`-`, `/`→`_`); padding is optional — both padded and unpadded forms are accepted.

**Step 1 — encode** the query.

```typescript
const sql = 'SELECT id, name, email FROM users LIMIT 10';
// Kit accepts URL-safe base64, padded or unpadded. Node's 'base64url' works as-is.
const sqlB64 = Buffer.from(sql).toString('base64url');
```

**Step 2 — issue the GET.** Response includes `columns`, `resultSet`, `rowCount`, `truncated`. A non-base64 `sql` value is not an error — it is interpreted as raw SQL; a non-SELECT query → `400 GET /query only accepts read-only SELECT/WITH queries; use POST /db for mutating SQL`.

```typescript
const { data: r } = await client.sqlite.sql.queryReadOnly({ db, sql: sqlB64 });
```

**Step 3 — paste-able URL** (e.g. dashboard link). The kit URL itself is the auth grant — guard who you share it with.

```typescript
const url = `${kitUrl}/api/v1/sqlite/query?db=${encodeURIComponent(db)}&sql=${sqlB64}`;
```

### 10. Bulk insert via `valuesBatch` — one statement, many rows

**Goal:** load 3 rows (or 100k) with one transaction item that repeats a single SQL statement once per parameter row, instead of one tx item per row. The rows of an item commit or fail together. `valuesBatch` is an array of value-arrays positionally aligned with the `?` placeholders. Caps: 100k rows per `valuesBatch`, 1M rows per tx.

**Step 1 — bulk insert.** Response carries `rowsUpdatedBatch:[1,1,1]` — one entry per row.

```typescript
await client.sqlite.sql.runTransaction({ transaction: [{
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
const r = await client.sqlite.sql.runTransaction(
  { transaction: [{ query: 'SELECT COUNT(*) AS n FROM users' }] }, { db });
const n = (r.data as any).results[0].resultSet[0].n;
```

**Step 3 — clean up** (delete the throwaway database through the kit, which also removes its `-wal`, `-shm` and `-journal` files, or leave it under `/tmp/` for the next reboot to reclaim).

```typescript
await client.sqlite.databases.delete({ db });
```

## Reference

**Accessor:** `client.sqlite`  |  **Import:** `import * as sqlite from 'hoody-sdk/sqlite'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, containerId?, serviceIndex?, server? }`, which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are refused) and `cache` (a GET's response cache: `true`, a TTL in ms, or `false` to bypass) (no `_realm`: that one is control-plane only). When the signature shows an options object, the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`.

### `client.sqlite.databases` (4) — Database file lifecycle: create a database, list the databases in a directory, run maintenance

#### `create` — Create new SQLite database

```typescript
client.sqlite.databases.create(options: { path: string; init_kv?: boolean; kv_table?: string; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | query | Yes | Database path (absolute path, bare name, or ./name shorthand resolved to /hoody/databases/*.db) |
| `init_kv` | `boolean` | query | No | Initialize KV store tables |
| `kv_table` | `string` | query | No | Custom KV table name |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<SqliteDatabasesCreateResponse>`  |  **HTTP:** `POST /api/v1/sqlite/db/create`
**CLI:** `hoody db create`

---

#### `delete` — Delete SQLite database

```typescript
client.sqlite.databases.delete(options: { db: string; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database path (absolute path, bare name, or ./name shorthand resolved to /hoody/databases/*.db) |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<SqliteDatabasesDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/sqlite/db`
**CLI:** `hoody db delete`

---

#### `list` — List databases in a directory

```typescript
client.sqlite.databases.list(options?: { dir?: string; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `dir` | `string` | query | No | Absolute path of the directory to list |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<SqliteDatabasesListResponse>`  |  **HTTP:** `GET /api/v1/sqlite/db/list`
**CLI:** `hoody db list`

---

#### `runMaintenance` — Run a database maintenance operation

```typescript
client.sqlite.databases.runMaintenance(data: SqliteDatabasesRunMaintenanceRequest, options: { db: string; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database path (absolute path, bare name, or ./name shorthand resolved to /hoody/databases/*.db) |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `data` | `SqliteDatabasesRunMaintenanceRequest` | body | Yes | Shape: `sqlite_main.maintenanceRequest` under Body schemas. |

**Returns:** `Promise<SqliteDatabasesRunMaintenanceResponse>`  |  **HTTP:** `POST /api/v1/sqlite/maintenance`
**CLI:** `hoody db maintenance run`

---

### `client.sqlite.history` (6) — Query execution history and statistics

#### `clear` — Clear query history

```typescript
client.sqlite.history.clear(options: { db: string; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<SqliteHistoryClearResponse>`  |  **HTTP:** `DELETE /api/v1/sqlite/history`
**CLI:** `hoody db history clear`

---

#### `delete` — Delete history entry

```typescript
client.sqlite.history.delete(index: number, options: { db: string; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `index` | `number` | path | Yes | History entry ID |
| `db` | `string` | query | Yes | Database file path |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<SqliteHistoryDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/sqlite/history/{index}`
**CLI:** `hoody db history delete`

---

#### `getStats` — Get history statistics

```typescript
client.sqlite.history.getStats(options: { db: string; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<SqliteHistoryGetStatsResponse>`  |  **HTTP:** `GET /api/v1/sqlite/history/stats`
**CLI:** `hoody db history stats`

---

#### `list` — Get query history

```typescript
client.sqlite.history.list(options: { db: string; limit?: number; offset?: number; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |
| `limit` | `number` | query | No | Maximum number of entries to return (0 means the default; capped at 1000) |
| `offset` | `number` | query | No | Number of newest entries to skip |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<SqliteHistoryListResponse>`  |  **HTTP:** `GET /api/v1/sqlite/history`
**CLI:** `hoody db history list`

---

#### `listAll` — Get query history (collect all pages)

```typescript
client.sqlite.history.listAll(options: { db: string; limit?: number; offset?: number; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |
| `limit` | `number` | query | No | Maximum number of entries to return (0 means the default; capped at 1000) |
| `offset` | `number` | query | No | Number of newest entries to skip |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<(NonNullable<SqliteHistoryListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { history?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.history`, all pages collected (`list()` fetches one page). Each item is `sqlite_main.QueryHistoryEntry`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/sqlite/history`
**CLI:** `hoody db history list`

---

#### `listIterator` — Get query history (async iterator)

```typescript
client.sqlite.history.listIterator(options: { db: string; limit?: number; offset?: number; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |
| `limit` | `number` | query | No | Maximum number of entries to return (0 means the default; capped at 1000) |
| `offset` | `number` | query | No | Number of newest entries to skip |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `AsyncGenerator<(NonNullable<SqliteHistoryListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { history?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.history` per step, next page fetched on demand (`list()` fetches one page). Each item is `sqlite_main.QueryHistoryEntry`.  |  **HTTP:** `GET /api/v1/sqlite/history`
**CLI:** `hoody db history list`

---

### `client.sqlite.kit` (2) — Liveness and observability snapshots

#### `getCacheStats` — Cache health snapshot

```typescript
client.sqlite.kit.getCacheStats()
```

**Returns:** `Promise<SqliteKitGetCacheStatsResponse>`  |  **HTTP:** `GET /api/v1/sqlite/health/cache`
**CLI:** `hoody db cache stats`

---

#### `getHealth` — Health check

```typescript
client.sqlite.kit.getHealth(options?: { verbose?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `verbose` | `boolean` | query | No | Return the full snapshot. Without it the response carries the status field alone; with it, service identity, the features list, process memory and file-descriptor counters, and the cache and counter snapshots are included |

**Returns:** `Promise<SqliteKitGetHealthResponse>`  |  **HTTP:** `GET /api/v1/sqlite/health`
**CLI:** `hoody db health`

---

### `client.sqlite.kv` (28) — Key-Value store operations with TTL and namespaces

#### `clearTtl` — Remove a key's TTL

```typescript
client.sqlite.kv.clearTtl(key: string, options: { db: string; table?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; IfMatch?: string; IdempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name (supports / for hierarchical keys) |
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `history` | `boolean` | query | No | Store this write's value in history; false records only that the write happened, not what it wrote |
| `IfMatch` | `string` | header `If-Match` | No | Applies the write only if the key's current ETag matches. |
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Replays the stored response for a repeat of the same key (24 h). |
| `create_db_if_missing` | `boolean` | query | No | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<SqliteKvClearTtlResponse>`  |  **HTTP:** `POST /api/v1/sqlite/kv/{key}/persist`
**CLI:** `hoody kv ttl clear`

---

#### `compareTableSnapshots` — Compare table snapshots

```typescript
client.sqlite.kv.compareTableSnapshots(options: { db: string; from: number; to: number; table?: string; keys?: string; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `from` | `number` | query | Yes | Starting timestamp (Unix seconds), at least 1 and earlier than to |
| `to` | `number` | query | Yes | Ending timestamp (Unix seconds), later than from and not in the future |
| `keys` | `string` | query | No | Comma-separated list of keys to compare (optional). When given, exactly these keys are reconstructed (duplicates collapsed) |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<SqliteKvCompareTableSnapshotsResponse>`  |  **HTTP:** `GET /api/v1/sqlite/kv/diff`
**CLI:** `hoody kv table snapshots compare`

---

#### `decrement` — Atomic decrement

```typescript
client.sqlite.kv.decrement(key: string, options: { db: string; table?: string; delta?: number; path?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; IfMatch?: string; IdempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `delta` | `number` | query | No | Amount to decrement: a positive integer; the operation sets the direction |
| `path` | `string` | query | No | JSON path to nested numeric value |
| `history` | `boolean` | query | No | Store this write's value in history; false records only that the write happened, not what it wrote |
| `IfMatch` | `string` | header `If-Match` | No | Applies the write only if the key's current ETag matches. |
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Replays the stored response for a repeat of the same key (24 h). |
| `create_db_if_missing` | `boolean` | query | No | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<SqliteKvDecrementResponse>`  |  **HTTP:** `POST /api/v1/sqlite/kv/{key}/decr`
**CLI:** `hoody kv decrement`

---

#### `delete` — Delete key

```typescript
client.sqlite.kv.delete(key: string, options: { db: string; table?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; IfMatch?: string; IdempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `db` | `string` | query | Yes | Database file path or directory |
| `table` | `string` | query | No | Custom table name |
| `history` | `boolean` | query | No | Store this write's value in history; false records only that the write happened, not what it wrote |
| `IfMatch` | `string` | header `If-Match` | No | Applies the write only if the key's current ETag matches. |
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Replays the stored response for a repeat of the same key (24 h). |
| `create_db_if_missing` | `boolean` | query | No | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<SqliteKvDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/sqlite/kv/{key}`
**CLI:** `hoody kv delete`

---

#### `deleteMany` — Batch delete multiple keys

```typescript
client.sqlite.kv.deleteMany(data: SqliteKvDeleteManyRequest, options: { db: string; table?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; IdempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `history` | `boolean` | query | No | Store this write's value in history; false records only that the write happened, not what it wrote |
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Replays the stored response for a repeat of the same key (24 h). |
| `create_db_if_missing` | `boolean` | query | No | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `data` | `SqliteKvDeleteManyRequest` | body | Yes | Shape: `sqlite_main.kvBatchDeleteRequest` under Body schemas. |

**Returns:** `Promise<SqliteKvDeleteManyResponse>`  |  **HTTP:** `POST /api/v1/sqlite/kv/batch/delete`
**CLI:** `hoody kv batch delete`

---

#### `exists` — Check if key exists

```typescript
client.sqlite.kv.exists(key: string, options: { db: string; table?: string; timeout?: number; IfNoneMatch?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `db` | `string` | query | Yes | Database file path or directory |
| `table` | `string` | query | No | Custom table name |
| `IfNoneMatch` | `string` | header `If-None-Match` | No | Answers 304 while the key's current ETag matches. |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<boolean>`  |  **HTTP:** `HEAD /api/v1/sqlite/kv/{key}`
**CLI:** `hoody kv exists`

---

#### `get` — Get value by key

```typescript
client.sqlite.kv.get(key: string, options: { db: string; table?: string; path?: string; at_timestamp?: number; rebuild?: boolean; timeout?: number; IfNoneMatch?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name (supports / for hierarchical keys) |
| `db` | `string` | query | Yes | Database file path or directory |
| `table` | `string` | query | No | Custom table name |
| `path` | `string` | query | No | JSON path for nested value extraction. The extracted value is returned as JSON with an X-JSON-Path header; a path that does not exist in the value answers 404. Ignored with at_timestamp. |
| `at_timestamp` | `number` | query | No | Unix timestamp. Returns the value the key held at that moment, in a JSON envelope instead of the current value. The value is reconstructed from the key's recorded history. When no recorded write establishes it, the current value is returned if it was already in place at that moment: with op_number 0 when the key has recorded history, and without op_number or op_timestamp when it has none (for example, a key written through SQL). A write made with history=false that leaves the value at that moment unknown answers 409 TIME_TRAVEL_CHAIN_GAP. 0 or omitted reads the current value; a time in the future is rejected with 400. A directory (directory mode) is rejected with 400 in this mode. |
| `rebuild` | `boolean` | query | No | Directory mode only: clear the directory's cached file information (this directory only, not its subdirectories), then read the key. Ignored with at_timestamp. |
| `IfNoneMatch` | `string` | header `If-None-Match` | No | Answers 304 while the key's current ETag matches. |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<ApiResponse<ArrayBuffer> | SqliteKvGetResponse>` — the response Content-Type picks the branch: JSON gives the payload in `.data`, a binary type gives the bytes  |  **HTTP:** `GET /api/v1/sqlite/kv/{key}`
**CLI:** `hoody kv get`

---

#### `getEntry` — Get a key's entry

```typescript
client.sqlite.kv.getEntry(key: string, options: { db: string; table?: string; timeout?: number; IfNoneMatch?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name (supports / for hierarchical keys) |
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `IfNoneMatch` | `string` | header `If-None-Match` | No | Answers 304 while the key's current ETag matches. |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<SqliteKvGetEntryResponse>`  |  **HTTP:** `GET /api/v1/sqlite/kv/{key}/entry`
**CLI:** `hoody kv entry get`

---

#### `getMany` — Batch get multiple keys

```typescript
client.sqlite.kv.getMany(data: SqliteKvGetManyRequest, options: { db: string; table?: string; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `data` | `SqliteKvGetManyRequest` | body | Yes | Shape: `sqlite_main.kvBatchGetRequest` under Body schemas. |

**Returns:** `Promise<SqliteKvGetManyResponse>`  |  **HTTP:** `POST /api/v1/sqlite/kv/batch/get`
**CLI:** `hoody kv batch get`

---

#### `getSnapshot` — Get key snapshot at operation

```typescript
client.sqlite.kv.getSnapshot(key: string, options: { db: string; op_number: number; table?: string; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `op_number` | `number` | query | Yes | Operation number to reconstruct from |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<SqliteKvGetSnapshotResponse>`  |  **HTTP:** `GET /api/v1/sqlite/kv/{key}/snapshot`
**CLI:** `hoody kv snapshots get`

---

#### `getTableSnapshot` — Get table snapshot at timestamp

```typescript
client.sqlite.kv.getTableSnapshot(options: { db: string; timestamp: number; table?: string; limit?: number; prefix?: string; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `timestamp` | `number` | query | Yes | Unix timestamp (seconds) to reconstruct, at least 1 and not in the future |
| `limit` | `number` | query | No | Maximum number of keys to return. Values above 1000 are treated as 1000; 0 returns every key found. Either way key discovery is bounded: when it stops early, candidate_truncated is true and keys may be missing; narrow with prefix |
| `prefix` | `string` | query | No | Filter keys by prefix |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<SqliteKvGetTableSnapshotResponse>`  |  **HTTP:** `GET /api/v1/sqlite/kv/snapshot`
**CLI:** `hoody kv table snapshots get`

---

#### `increment` — Atomic increment

```typescript
client.sqlite.kv.increment(key: string, options: { db: string; table?: string; delta?: number; path?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; IfMatch?: string; IdempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `delta` | `number` | query | No | Amount to increment: a positive integer; the operation sets the direction |
| `path` | `string` | query | No | JSON path to nested numeric value |
| `history` | `boolean` | query | No | Store this write's value in history; false records only that the write happened, not what it wrote |
| `IfMatch` | `string` | header `If-Match` | No | Applies the write only if the key's current ETag matches. |
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Replays the stored response for a repeat of the same key (24 h). |
| `create_db_if_missing` | `boolean` | query | No | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<SqliteKvIncrementResponse>`  |  **HTTP:** `POST /api/v1/sqlite/kv/{key}/incr`
**CLI:** `hoody kv increment`

---

#### `list` — List keys

```typescript
client.sqlite.kv.list(options: { db: string; table?: string; prefix?: string; limit?: number; offset?: number; after?: string; at_timestamp?: number; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path or directory |
| `table` | `string` | query | No | Custom table name |
| `prefix` | `string` | query | No | Filter keys by prefix |
| `limit` | `number` | query | No | Maximum number of results. Values above 1000 are treated as 1000; a negative value is rejected with 400. 0 returns an empty page, except with at_timestamp, where it means no limit |
| `offset` | `number` | query | No | Skip N results for pagination. Honoured for both the regular listing and the at_timestamp listing; results are ordered by key in both cases. A negative value is rejected with 400. Keys written or deleted between two requests shift later pages; use after to page without skipping or repeating keys |
| `after` | `string` | query | No | Cursor: list only keys that sort after this one (byte order, exclusive). Pass the previous page's next_after; a key written or deleted elsewhere between two pages never makes another key be skipped or repeated. The value is used as given, so any string works, including a key that no longer exists. Combined with offset greater than 0 or with at_timestamp it is rejected with 400 |
| `at_timestamp` | `number` | query | No | Unix timestamp for time-travel LIST: returns the keys as they stood at that moment, in a different response envelope. 0 or omitted lists the current keys; a time in the future is rejected with 400. A directory (directory mode) is rejected with 400 in this mode |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<SqliteKvListResponse>`  |  **HTTP:** `GET /api/v1/sqlite/kv`
**CLI:** `hoody kv list`

---

#### `listAll` — List keys (collect all pages)

```typescript
client.sqlite.kv.listAll(options: { db: string; table?: string; prefix?: string; limit?: number; offset?: number; after?: string; at_timestamp?: number; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path or directory |
| `table` | `string` | query | No | Custom table name |
| `prefix` | `string` | query | No | Filter keys by prefix |
| `limit` | `number` | query | No | Maximum number of results. Values above 1000 are treated as 1000; a negative value is rejected with 400. 0 returns an empty page, except with at_timestamp, where it means no limit |
| `offset` | `number` | query | No | Skip N results for pagination. Honoured for both the regular listing and the at_timestamp listing; results are ordered by key in both cases. A negative value is rejected with 400. Keys written or deleted between two requests shift later pages; use after to page without skipping or repeating keys |
| `after` | `string` | query | No | Cursor: list only keys that sort after this one (byte order, exclusive). Pass the previous page's next_after; a key written or deleted elsewhere between two pages never makes another key be skipped or repeated. The value is used as given, so any string works, including a key that no longer exists. Combined with offset greater than 0 or with at_timestamp it is rejected with 400 |
| `at_timestamp` | `number` | query | No | Unix timestamp for time-travel LIST: returns the keys as they stood at that moment, in a different response envelope. 0 or omitted lists the current keys; a time in the future is rejected with 400. A directory (directory mode) is rejected with 400 in this mode |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<(NonNullable<SqliteKvListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). Each item is `sqlite_main.KVListItem`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/sqlite/kv`
**CLI:** `hoody kv list`

---

#### `listChanges` — List the changes of a KV table

```typescript
client.sqlite.kv.listChanges(options: { db: string; table?: string; since?: string; prefix?: string; limit?: number; wait?: number; include_values?: boolean; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database path |
| `table` | `string` | query | No | KV table name (default: kv_store) |
| `since` | `string` | query | No | Cursor to continue after (next_cursor of the previous page, or the cursor of an event). Omit to get the current cursor. |
| `prefix` | `string` | query | No | Only keys starting with this prefix |
| `limit` | `number` | query | No | Maximum events in the page (1-1000, default 100) |
| `wait` | `number` | query | No | Seconds to wait for the first event when there is none yet (0-60, default 0) |
| `include_values` | `boolean` | query | No | Attach the value to set/ttl events when it is still current, not expired and at most 256 KiB (otherwise value_omitted says why) |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<SqliteKvListChangesResponse>`  |  **HTTP:** `GET /api/v1/sqlite/changes`
**CLI:** `hoody kv changes list`

---

#### `listChangesAll` — List the changes of a KV table (collect all pages)

```typescript
client.sqlite.kv.listChangesAll(options: { db: string; table?: string; since?: string; prefix?: string; limit?: number; wait?: number; include_values?: boolean; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database path |
| `table` | `string` | query | No | KV table name (default: kv_store) |
| `since` | `string` | query | No | Cursor to continue after (next_cursor of the previous page, or the cursor of an event). Omit to get the current cursor. |
| `prefix` | `string` | query | No | Only keys starting with this prefix |
| `limit` | `number` | query | No | Maximum events in the page (1-1000, default 100) |
| `wait` | `number` | query | No | Seconds to wait for the first event when there is none yet (0-60, default 0) |
| `include_values` | `boolean` | query | No | Attach the value to set/ttl events when it is still current, not expired and at most 256 KiB (otherwise value_omitted says why) |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<(NonNullable<SqliteKvListChangesResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { events?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.events`, all pages collected (`listChanges()` fetches one page). Each item is `sqlite_main.KVChangeEvent`. `listChangesIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/sqlite/changes`
**CLI:** `hoody kv changes list`

---

#### `listChangesIterator` — List the changes of a KV table (async iterator)

```typescript
client.sqlite.kv.listChangesIterator(options: { db: string; table?: string; since?: string; prefix?: string; limit?: number; wait?: number; include_values?: boolean; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database path |
| `table` | `string` | query | No | KV table name (default: kv_store) |
| `since` | `string` | query | No | Cursor to continue after (next_cursor of the previous page, or the cursor of an event). Omit to get the current cursor. |
| `prefix` | `string` | query | No | Only keys starting with this prefix |
| `limit` | `number` | query | No | Maximum events in the page (1-1000, default 100) |
| `wait` | `number` | query | No | Seconds to wait for the first event when there is none yet (0-60, default 0) |
| `include_values` | `boolean` | query | No | Attach the value to set/ttl events when it is still current, not expired and at most 256 KiB (otherwise value_omitted says why) |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `AsyncGenerator<(NonNullable<SqliteKvListChangesResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { events?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.events` per step, next page fetched on demand (`listChanges()` fetches one page). Each item is `sqlite_main.KVChangeEvent`.  |  **HTTP:** `GET /api/v1/sqlite/changes`
**CLI:** `hoody kv changes list`

---

#### `listHistory` — Get key operation history

```typescript
client.sqlite.kv.listHistory(key: string, options: { db: string; table?: string; limit?: number; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `limit` | `number` | query | No | Maximum number of operations to return (0 → default 50, clamped to maximum 1000) |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<SqliteKvListHistoryResponse>`  |  **HTTP:** `GET /api/v1/sqlite/kv/{key}/history`
**CLI:** `hoody kv history list`

---

#### `listIterator` — List keys (async iterator)

```typescript
client.sqlite.kv.listIterator(options: { db: string; table?: string; prefix?: string; limit?: number; offset?: number; after?: string; at_timestamp?: number; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path or directory |
| `table` | `string` | query | No | Custom table name |
| `prefix` | `string` | query | No | Filter keys by prefix |
| `limit` | `number` | query | No | Maximum number of results. Values above 1000 are treated as 1000; a negative value is rejected with 400. 0 returns an empty page, except with at_timestamp, where it means no limit |
| `offset` | `number` | query | No | Skip N results for pagination. Honoured for both the regular listing and the at_timestamp listing; results are ordered by key in both cases. A negative value is rejected with 400. Keys written or deleted between two requests shift later pages; use after to page without skipping or repeating keys |
| `after` | `string` | query | No | Cursor: list only keys that sort after this one (byte order, exclusive). Pass the previous page's next_after; a key written or deleted elsewhere between two pages never makes another key be skipped or repeated. The value is used as given, so any string works, including a key that no longer exists. Combined with offset greater than 0 or with at_timestamp it is rejected with 400 |
| `at_timestamp` | `number` | query | No | Unix timestamp for time-travel LIST: returns the keys as they stood at that moment, in a different response envelope. 0 or omitted lists the current keys; a time in the future is rejected with 400. A directory (directory mode) is rejected with 400 in this mode |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `AsyncGenerator<(NonNullable<SqliteKvListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page). Each item is `sqlite_main.KVListItem`.  |  **HTTP:** `GET /api/v1/sqlite/kv`
**CLI:** `hoody kv list`

---

#### `pop` — Remove from array end

```typescript
client.sqlite.kv.pop(key: string, options: { db: string; table?: string; path?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; IfMatch?: string; IdempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `path` | `string` | query | No | JSON path to nested array |
| `history` | `boolean` | query | No | Store this write's value in history; false records only that the write happened, not what it wrote |
| `IfMatch` | `string` | header `If-Match` | No | Applies the write only if the key's current ETag matches. |
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Replays the stored response for a repeat of the same key (24 h). |
| `create_db_if_missing` | `boolean` | query | No | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<SqliteKvPopResponse>`  |  **HTTP:** `POST /api/v1/sqlite/kv/{key}/pop`
**CLI:** `hoody kv arrays pop`

---

#### `push` — Append to array

```typescript
client.sqlite.kv.push(key: string, data: SqliteKvPushRequest, options: { db: string; table?: string; path?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; IfMatch?: string; IdempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `path` | `string` | query | No | JSON path to nested array |
| `history` | `boolean` | query | No | Store this write's value in history; false records only that the write happened, not what it wrote |
| `IfMatch` | `string` | header `If-Match` | No | Applies the write only if the key's current ETag matches. |
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Replays the stored response for a repeat of the same key (24 h). |
| `create_db_if_missing` | `boolean` | query | No | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `data` | `SqliteKvPushRequest` | body | Yes |  |

**Body:** `any|null`

- The value to append: one JSON value of any type (object, array, string, number, boolean or null). An array is appended as a single element, not spread. A body that is not valid JSON is refused with 400.

**Returns:** `Promise<SqliteKvPushResponse>`  |  **HTTP:** `POST /api/v1/sqlite/kv/{key}/push`
**CLI:** `hoody kv arrays push`

---

#### `remove` — Remove array element

```typescript
client.sqlite.kv.remove(key: string, data: SqliteKvRemoveRequest | undefined, options: { db: string; table?: string; path?: string; index?: number; history?: boolean; create_db_if_missing?: boolean; timeout?: number; IfMatch?: string; IdempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `path` | `string` | query | No | JSON path to nested array |
| `index` | `number` | query | No | Array index to remove. Send this or a body value; with neither the request is a 400 |
| `history` | `boolean` | query | No | Store this write's value in history; false records only that the write happened, not what it wrote |
| `IfMatch` | `string` | header `If-Match` | No | Applies the write only if the key's current ETag matches. |
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Replays the stored response for a repeat of the same key (24 h). |
| `create_db_if_missing` | `boolean` | query | No | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `data` | `SqliteKvRemoveRequest \| undefined` | body | Yes | Shape: `sqlite_main.kvRemoveRequest` under Body schemas. |

**Returns:** `Promise<SqliteKvRemoveResponse>`  |  **HTTP:** `POST /api/v1/sqlite/kv/{key}/remove`
**CLI:** `hoody kv arrays remove`

---

#### `rollback` — Rollback key operations

```typescript
client.sqlite.kv.rollback(key: string, options: { db: string; table?: string; steps?: number; create_db_if_missing?: boolean; timeout?: number; IdempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `steps` | `number` | query | No | Number of operations to undo, 1 to 50000 |
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Replays the stored response for a repeat of the same key (24 h). |
| `create_db_if_missing` | `boolean` | query | No | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<SqliteKvRollbackResponse>`  |  **HTTP:** `POST /api/v1/sqlite/kv/{key}/rollback`
**CLI:** `hoody kv rollback`

---

#### `rollbackTable` — Rollback entire table

```typescript
client.sqlite.kv.rollbackTable(data: SqliteKvRollbackTableRequest | undefined, options: { db: string; to_timestamp: number; table?: string; dry_run?: boolean; confirm?: string; create_db_if_missing?: boolean; timeout?: number; IdempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `to_timestamp` | `number` | query | Yes | Target timestamp (Unix seconds), at least 1 and not in the future |
| `dry_run` | `boolean` | query | No | Preview changes without applying |
| `confirm` | `string` | query | No | Must be 'yes' to execute actual rollback |
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Replays the stored response for a repeat of the same key (24 h). |
| `create_db_if_missing` | `boolean` | query | No | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `data` | `SqliteKvRollbackTableRequest \| undefined` | body | Yes | Shape: `sqlite_main.kvTableRollbackRequest` under Body schemas. |

**Returns:** `Promise<SqliteKvRollbackTableResponse>`  |  **HTTP:** `POST /api/v1/sqlite/kv/rollback`
**CLI:** `hoody kv table rollback`

---

#### `set` — Set value for key

```typescript
client.sqlite.kv.set(key: string, data: SqliteKvSetRequest, options: { db: string; table?: string; path?: string; ttl?: number; if_match?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; IfMatch?: string; IfNoneMatch?: string; IdempotencyKey?: string; contentType?: 'application/octet-stream' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `db` | `string` | query | Yes | Database file path or directory |
| `table` | `string` | query | No | Custom table name |
| `path` | `string` | query | No | JSON path for nested value update |
| `ttl` | `number` | query | No | Time-to-live in seconds (SQLite mode only; a non-zero ttl against a directory-mode store is rejected with 400) |
| `if_match` | `string` | query | No | Current value for compare-and-swap (SQLite mode only; rejected with 400 against a directory-mode store) |
| `history` | `boolean` | query | No | Store this write's value in history; false records only that the write happened, not what it wrote |
| `create_db_if_missing` | `boolean` | query | No | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `IfMatch` | `string` | header `If-Match` | No | Applies the write only if the key's current ETag matches. |
| `IfNoneMatch` | `string` | header `If-None-Match` | No | Set to * to write only if the key does not exist yet. |
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Replays the stored response for a repeat of the same key (24 h). |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `data` | `SqliteKvSetRequest` | body | Yes |  |

**Body:** `any|null`

- … With Content-Type application/json (or any +json type) the body must be one complete JSON document, serialised exactly once: an object, array, number, boolean, null, or a string sent QUOTED ("hello", not hello). A string like "123" must be sent quoted too, or it is stored and read back as the number 123. A body that is not valid JSON is refused with 400 INVALID_JSON_VALUE. …

**Returns:** `Promise<SqliteKvSetResponse>`  |  **HTTP:** `PUT /api/v1/sqlite/kv/{key}`
**CLI:** `hoody kv set`

---

#### `setMany` — Batch set multiple keys

```typescript
client.sqlite.kv.setMany(data: SqliteKvSetManyRequest, options: { db: string; table?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; IdempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `history` | `boolean` | query | No | Store this write's value in history; false records only that the write happened, not what it wrote |
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Replays the stored response for a repeat of the same key (24 h). |
| `create_db_if_missing` | `boolean` | query | No | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `data` | `SqliteKvSetManyRequest` | body | Yes | Shape: `sqlite_main.kvBatchSetRequest` under Body schemas. |

**Returns:** `Promise<SqliteKvSetManyResponse>`  |  **HTTP:** `POST /api/v1/sqlite/kv/batch/set`
**CLI:** `hoody kv batch set`

---

#### `setTtl` — Set a key's TTL

```typescript
client.sqlite.kv.setTtl(key: string, options: { db: string; ttl: number; table?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; IfMatch?: string; IdempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name (supports / for hierarchical keys) |
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `ttl` | `number` | query | Yes | Seconds from now until the key expires; at least 1 |
| `history` | `boolean` | query | No | Store this write's value in history; false records only that the write happened, not what it wrote |
| `IfMatch` | `string` | header `If-Match` | No | Applies the write only if the key's current ETag matches. |
| `IdempotencyKey` | `string` | header `Idempotency-Key` | No | Replays the stored response for a repeat of the same key (24 h). |
| `create_db_if_missing` | `boolean` | query | No | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<SqliteKvSetTtlResponse>`  |  **HTTP:** `POST /api/v1/sqlite/kv/{key}/expire`
**CLI:** `hoody kv ttl set`

---

#### `streamChanges` — Stream the changes of a KV table

```typescript
client.sqlite.kv.streamChanges(options: { db: string; table?: string; since?: string; prefix?: string; include_values?: boolean; LastEventID?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database path |
| `table` | `string` | query | No | KV table name (default: kv_store) |
| `since` | `string` | query | No | Cursor to continue after; Last-Event-ID wins when both are sent |
| `prefix` | `string` | query | No | Only keys starting with this prefix |
| `include_values` | `boolean` | query | No | Attach small current values to set/ttl events (see GET /changes) |
| `LastEventID` | `string` | header `Last-Event-ID` | No | Resumes the stream after this event id. |

**Returns:** `Promise<IEventStream>`  |  **HTTP:** `GET /api/v1/sqlite/changes/stream`
**CLI:** `hoody kv changes stream`

---

#### `read` — The value stored under `key`, as stored: parsed JSON, a string, or an ArrayBuffer for bytes.

```typescript
client.sqlite.kv.read<T = unknown>(key: string, options: KvReadOptions, templateVars?: GetTarget)
```

**Returns:** `Promise<T>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `read` — `read({ db, key, ...options })`: the object form of `read(key, { db, ...options })`.

```typescript
client.sqlite.kv.read<T = unknown>(args: KvReadArgs, templateVars?: GetTarget)
```

**Returns:** `Promise<T>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

### `client.sqlite.sql` (2) — Shareable read-only queries executed from a GET URL

#### `queryReadOnly` — Execute shareable SQL query

```typescript
client.sqlite.sql.queryReadOnly(options: { db: string; sql: string; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |
| `sql` | `string` | query | Yes | The SQL query, base64url-encoded (with or without = padding). Plain SQL text is also accepted |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

**Returns:** `Promise<SqliteSqlQueryReadOnlyResponse>`  |  **HTTP:** `GET /api/v1/sqlite/query`
**CLI:** `hoody db readonly query`

---

#### `runTransaction` — Execute SQL transaction

```typescript
client.sqlite.sql.runTransaction(data: SqliteSqlRunTransactionRequest, options: { db: string; create_db_if_missing?: boolean; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database path (absolute path, bare name, or ./name shorthand resolved to /hoody/databases/*.db) |
| `create_db_if_missing` | `boolean` | query | No | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |
| `data` | `SqliteSqlRunTransactionRequest` | body | Yes | Shape: `sqlite_main.request` under Body schemas. |

**Returns:** `Promise<SqliteSqlRunTransactionResponse>`  |  **HTTP:** `POST /api/v1/sqlite/db`
**CLI:** `hoody db transactions run`

---

#### `query` — Run one SQL statement that answers rows (a SELECT, or a write with RETURNING) and resolve to `{ rows, columns, truncated }`, no envelope.

```typescript
client.sqlite.sql.query<Row = Record<string, unknown>>(request: SqliteSqlRequest, templateVars?: TemplateVars)
```

**Returns:** `Promise<SqliteQueryResult<Row>>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `run` — Run one SQL statement for its effect (CREATE, INSERT, UPDATE, DELETE) and resolve to `{ rowsUpdated }`, no envelope.

```typescript
client.sqlite.sql.run<Row = Record<string, unknown>>(request: SqliteSqlRequest, templateVars?: TemplateVars)
```

**Returns:** `Promise<SqliteRunResult<Row>>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.


### Body schemas

- `sqlite_main.kvRemoveRequest` — `{ value: any|null }`
  - `value` — Remove the first element equal to this value. Any JSON value; an explicit null removes the first null element, which is not the same as leaving value out. Ignored when the index parameter is set. Without index, value is required.
- `sqlite_main.kvBatchDeleteRequest` — `{ items: sqlite_main.kvBatchDeleteItem[], keys: string[] }`
  - `items` — Keys to delete, each with an optional if_match condition. 1-100 entries. Send keys or items, not both.
  - `keys` — Keys to delete. 1-100 entries; no entry may be empty or whitespace-only. Send keys or items, not both.
- `sqlite_main.kvBatchGetRequest` — `{ keys*: string[] }`
- `sqlite_main.kvBatchSetRequest` — `{ items*: sqlite_main.kvBatchSetItem[] }`
- `sqlite_main.kvTableRollbackRequest` — `{ exclude_keys: string[], keys: string[] }`
  - `exclude_keys` — Keys to leave untouched. Applied after keys. At most 10000 entries; more is rejected with 413.
  - `keys` — Keys to roll back. Omit or leave empty to roll back the whole table. At most 10000 entries; more is rejected with 413.
- `sqlite_main.request` — `{ resultFormat: string, transaction: sqlite_main.requestItem[] }`
- `sqlite_main.maintenanceRequest` — `{ dest_path: string, op*: "wal_checkpoint_truncate" | "vacuum_into" | "quick_check" | "reset_changes" }`
  - `dest_path` — Destination file for vacuum_into. Required for that operation and ignored by the others. Jailed like the db parameter, and it must not already exist.
- `sqlite_main.kvBatchDeleteItem` — `{ if_match: string, key*: string }`
  - `if_match` — Delete this key only if its current ETag is one of these (a comma-separated list of strong entity-tags, as in the If-Match header), or "*" for "the key exists". Checked for every item before any key is deleted; one failure fails the whole batch with 412.
  - `key` — Key to delete. Must not be empty or whitespace-only.
- `sqlite_main.kvBatchSetItem` — `{ content_type: string, if_match: string, if_none_match: string, key*: string, ttl: int, value: string }`
  - `if_match` — Write this item only if the key exists and its current ETag is one of these (a comma-separated list of strong entity-tags, as in the If-Match header), or "*" for "the key exists". Checked for every item before any is written; one failure fails the whole batch with 412.
  - `if_none_match` — "*" to write this item only if the key does not exist (or has expired). Any other value is rejected with 400. Checked for every item before any is written; one failure fails the whole batch with 412.
  - `key` — Key to write. Must not be empty or whitespace-only.
  - `ttl` — Lifetime in seconds from now. 0 or omitted stores without expiry; negative is rejected.
- `sqlite_main.requestItem` — `{ noFail: bool, query: string, statement: string, values: (string|null | number | bool)[]|null | object, valuesBatch: ((string|null | number | bool)[]|null | object)[]|null, sql: string, params: (string|null | number | bool)[]|null | object }`
  - One transaction item: SQL in `query` or `statement` (alias `sql`), exactly one of them; bind values in `values` (alias `params`) or `valuesBatch`; and `noFail`. Any other key is refused with 400 UNKNOWN_FIELD.
  - `values` — … Elements must be JSON scalars (string, number, boolean, null); numbers must fit int64/float64 (else 400). A nested array or object cannot be bound: the request fails with 400 SQL_BIND_ERROR, or, for an item with noFail, that item reports the error and the rest of the request goes on.
  - `params` — Alias for `values`. Sending both is accepted when they hold the same value; different contents are refused with 400 VALUES_CONFLICT, and an explicit null counts as a value.

