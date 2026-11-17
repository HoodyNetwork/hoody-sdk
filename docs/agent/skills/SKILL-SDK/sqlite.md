> _**SDK skill · `sqlite` namespace** · ~18,327 tokens · hoody-sdk v1.0.1_

# `sqlite` — SQLite HTTP API

## Purpose

hoody-sqlite: SQL tx, JSON KV, history, time-travel. Keyed by `db` query param.

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

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### DB + SQL tx

`databases.create({ path, init_kv: true })` (`path`: bare name, `./name`, or absolute under `/hoody/databases`; `init_kv` creates the KV table) → `sql.runTransaction({ transaction: [{ statement, values?|valuesBatch? }] }, { db, create_db_if_missing: true })` (`create_db_if_missing` makes the create step optional) → `history.list({ db })`.

One statement: `sql.query({ db, sql, params? })` resolves to `{ rows, columns, truncated }` (it sends a `query` item, so a write with `RETURNING` answers its rows too) and `sql.run({ db, sql, params? })` to `{ rowsUpdated }` (a `statement` item; for SQL that produces rows, such as a write with `RETURNING`, to `{ rowsUpdated, rows, truncated? }`, where `rowsUpdated` counts the returned rows and `truncated: true` means rows and count stop at the kit's row cap), both without the envelope. `params` is an array for `?` or an object for `:name`, each value a string, finite number, signed 64-bit `bigint`, boolean or null (anything else throws before sending); `create_db_if_missing` and supported request options pass through; `rawResponse`, `responseType` and `cache` are not accepted by these helpers.

### KV CRUD + CAS + counters

- `kv.set` — `ttl`, `if_match` (CAS on the value, the `ifValue` option; `ifMatch` is the ETag header), `path`, `history`.
- `kv.get` — `path`, `at_timestamp`. Its `data` is the kit's answer as sent, so a stored value shaped like `{ statusCode, message, data }` stays whole; `kv.read` returns the value itself. `kv.exists` takes `db`, plus optional `table` and `timeout`; `kv.delete` takes `db`/`table`/`history` (`history`, default true, records the deleted value; `false` records only that a delete happened) plus `create_db_if_missing` (the SDK takes only `create_db_if_missing`) and `timeout`.
- `kv.increment` / `kv.decrement` / `kv.arrays.push` / `kv.arrays.pop` / `kv.arrays.remove` — atomic, `path`-aware (`path` is a JSON path inside the value, such as `.user.tags`). The push body is any JSON value, appended as one element; the remove body is `{"value": <any>}` (matches by value), or pass the `index` query parameter instead. The generated push type accepts any JSON value; pass a string or number directly.

### Time-travel (needs `history: true`)

- `kv.listHistory` (default 50, max 1000); `kv.getSnapshot` at `op_number`.
- `kv.table.getSnapshot` / `kv.table.compareSnapshots` — Unix `timestamp` in seconds (milliseconds are rejected as "in the future") / diff.
- `kv.rollback` last N; `kv.table.rollback`: `dry_run` (query) then `confirm: 'yes'` (query — NOT body field). The body is optional: omit it for a full-table rollback, or send `{"keys":[...]}` / `{"exclude_keys":[...]}` to scope it. The body is the first positional argument, so pass `undefined` (`kv.table.rollback(undefined, { db, to_timestamp, confirm: 'yes' })`) or the filter object.

### Bulk + shareable

- `kv.setMany`/`kv.deleteMany` — one SQLite transaction each. `kv.getMany` — one HTTP request that reads every key in one read-only SQLite transaction, with one expiry check time, so the result is one consistent snapshot.
- `sql.queryReadOnly` — GET, URL-safe base64 `sql`, read-only. `kit.getHealth`/`kit.getCacheStats`.

## Quirks & gotchas

- **Bare-URL auth.** The `sqlite` kit checks no credential of its own; access through the kit URL is governed by the computer proxy's permission policy. Under the default policy (no rules configured) the bare kit URL works with no extra headers and is itself the bearer; where the owner has configured auth groups, send the credential the group expects, or the proxy answers 401 or 403. → See `SKILL-SDK.md § Kit URLs as credentials`.
- **Tx item keys: `"query"` and `statement`.** Each `transaction[i]` MUST carry exactly one of `"query"` or `statement`. A `statement` returns rows (`resultHeaders`/`resultSet`) when its SQL produces columns (a SELECT, or a write with `RETURNING`), and `rowsUpdated` otherwise. Use `"query"` for reads anyway; `valuesBatch` keeps its own restrictions. The `sql` alias maps to `statement`.
- Path resolution: bare names auto-resolve under `/hoody/databases/` (with `.db` appended if no extension). Leading `./` and `.\` prefixes are stripped, so `./app` and `.\app` are the same bare name (`/hoody/databases/app.db`). A leading `~` is expanded to the service user's home directory before the path checks. Any relative path that still contains `/` or `\` after that (e.g. `data/app.db`, `./dir/app.db`) is **rejected**, NOT auto-absoluted; absolute paths (e.g. `/hoody/databases/app.db`, an expanded `~/...` included) are treated as absolute. Absolute paths outside `/hoody/databases` are refused unless the deployment allows any absolute database path. A database filename must be a regular file: a symlink at the filename itself is rejected. Symlinked parent directories are resolved to their real path. `:memory:` databases are rejected.
- Directory mode takes an absolute directory path, a `~/...` path expanded to the service user's home directory included. Any other relative path (`sub/dir`) is refused with `directory-mode: invalid path input: path must be absolute`; a bare database name (`app`) is not treated as a directory and is opened as a database instead.
- Tx items: `statement` or alias `sql`. `sql.runTransaction` caps: 10k items, 100k rows/`valuesBatch`, 1M total rows. `values` and `valuesBatch` are mutually exclusive on a single item; `"query"` items cannot use `valuesBatch`.
- **GET `/query` rejects mutations**: INSERT/UPDATE/DELETE, `RETURNING` on writes, multi-statement (semicolons), any PRAGMA, VACUUM, ATTACH/DETACH — only a single statement leading with SELECT, or a WITH that contains no write keyword, is accepted. Use `sql.runTransaction` with `statement:` items for writes.
- **SELECT result-row cap is 10 000** (responses set `truncated: true` when more than 10 000 rows matched) on both transaction `"query"` items and GET `/query`; further rows silently truncated. Paginate explicitly for larger result sets.
- **`kv.set` body is any JSON value** (object, array, string, number, boolean, null), stored verbatim. The value type is `unknown`. Pass the JavaScript value itself (object, array, number, boolean, null, string): `box.sqlite.kv.set` stores every value as JSON, a string included, so `set(key, 'light', { db })` stores `"light"` under `application/json`, reads back as `light`, can be written at a `path` inside a JSON document, and `'123'` stays a string. Do not `JSON.stringify` first: that stores a JSON string holding escaped JSON text, not the object. For raw text pass `contentType: 'text/plain'` (any media type string; `'application/octet-stream'` for bytes) or a `Content-Type` in `headers`; at a `path` the bytes must parse as JSON (raw `light` is refused with 400 `Invalid JSON value`; raw `123` becomes a JSON number), and an existing non-JSON value under the key is refused first with 400 `Nested SET requires JSON content-type`. This is what `HoodyClient` / `withComputer` give you: the `hoody-sdk` entry point installs this `set` over the generated method. The Reference signature below is the generated one (`contentType?: 'application/octet-stream'`); the raw-text call above, a string value with any `contentType`, is the overload the entry point adds. Only a `KvService` built from the generated sources alone, without the `hoody-sdk` entry point, labels a string body `text/plain`. **`kv.setMany` differs:** each item's `value` is a string, so JSON-encode objects yourself.
- Time-travel **history is opt-out, not opt-in**: write handlers default `history: true`. Pass `history: false` to record only that the write happened, not what it wrote — but later reads show the gap: `kv.listHistory` lists an `UNRECORDED` entry, `kv.getSnapshot` at it and timestamp reads that need it answer `409 TIME_TRAVEL_CHAIN_GAP`, and the table reads (`kv.table.getSnapshot`, `kv.table.compareSnapshots`, `kv.list` with `at_timestamp`) leave such keys out and list them in `gap_keys` (`has_gaps: true`). `candidate_truncated: true` means the key scan stopped at its cap, so keys may be missing without a gap. Per-key history reconstruction is capped at 50 000 ops.
- Over HTTP, `auto_create` is an alias of `create_db_if_missing`; sending both with different values is refused with `conflicting flags`. The CLI has only `--create-db-if-missing`.
- `kv.list` w/ `at_timestamp` → time-travel handler (different envelope; `offset` and `limit` still apply, ordered by key as in the regular listing). The history `limit`: 0→50, >1000→1000 (the SDK itself rejects a limit above 1000 with `ValidationError` before sending). Where a parameter row says the kit ignores or clamps a bad value (a fractional `timeout`, a history `limit` above 1000), the SDK validates first and throws `ValidationError` before sending.
- `sql.queryReadOnly` `sql` accepts URL-safe base64 (`+`→`-`, `/`→`_`); both padded and unpadded forms are accepted. Inputs that do not decode to a SELECT/WITH query are treated as raw SQL. Under the default proxy policy the kit URL alone is the credential, share carefully.
- `databases.delete({ db })` removes a database file and its `-wal`, `-shm` and `-journal` companions, companions first. A missing file is `404 DATABASE_NOT_FOUND`; a directory or a non-SQLite file is `400` and stays untouched; a database other requests still hold past the deadline is `503 DATABASE_BUSY` with nothing removed. `500 DELETE_INCOMPLETE` lists `files_removed` and leaves the database file in place; retrying finishes it once the cause is gone, but a `-wal`, `-shm` or `-journal` companion that is not a regular file (a directory, say) or cannot be examined makes every retry fail the same way until you remove or fix it. A delete and a create of the same path wait for each other.
- A directory-mode KV store keeps a `.hoody_sqlite/cache.db` in each directory it uses and holds it open, so that file and its `-wal`, `-shm` and `-journal` companions can be neither created nor deleted as a database (`400 INVALID_DB_PATH`). Any other database inside a `.hoody_sqlite` directory is an ordinary database.

## Common errors

- `412 Value mismatch for CAS` (`if_match` mismatch) / `412 Key does not exist for CAS` (both CAS failures are 412).
- `400 directory-mode: invalid path input: path must be absolute` (directory mode given a relative path).
- `400 absolute database paths outside /hoody/databases are disallowed`.
- `:memory:` is refused on every route, with a different `400` by route. With otherwise valid request parameters, the KV routes that serve directory-mode stores or check for one first (`kv.get`, `kv.set`, `kv.delete`, `kv.exists`, `kv.list`, `kv.getEntry`, `kv.setTtl`, `kv.clearTtl`, `kv.listChanges`, `kv.streamChanges`) refuse a bare `:memory:` as a relative path, with `400 directory-mode: invalid path input: path must be absolute`. Historical `kv.get` and `kv.list` requests with a valid, nonzero `at_timestamp`, and the other routes, answer a different `400`, usually `invalid database name; allowed: letters, numbers, dot, dash, underscore` (also for any other bare name with characters outside that set). An absolute path containing `:memory:` that passes the earlier path checks gets `400 in-memory databases are not supported` instead.
- `400 conflicting flags: create_db_if_missing and auto_create must match`.
- `400 GET /query only accepts read-only SELECT/WITH queries; use POST /db for mutating SQL` (returned for non-SELECT input; a non-base64 `sql` value is not an error — it is interpreted as raw SQL).
- `400 Invalid JSON body` on `kv.setMany` — wire shape requires each `value` to be a JSON-encoded string, not an object.
- `409` with `"error": "TIME_TRAVEL_CHAIN_GAP"` (message `time-travel: chain gap straddles target timestamp`) when the history needed for the answer has an unrecorded (`history: false`) or pruned gap. Per-key timestamp reads (`kv.get` with `at_timestamp`), `kv.getSnapshot` at an `op_number`, and the rollbacks (`kv.rollback`, `kv.table.rollback`) all return it; the table reads (`kv.table.getSnapshot`, `kv.table.compareSnapshots`, `kv.list` with `at_timestamp`) answer 200 and list the affected keys in `gap_keys`. Per-key rollback puts the detail in `error` after the code (`"TIME_TRAVEL_CHAIN_GAP: ..."`); table rollback returns `error: "TIME_TRAVEL_CHAIN_GAP"` and puts the detail in `message`.
- A failing transaction item aborts and rolls back the whole transaction by default: the response is that item's HTTP status (4xx or 5xx) with `{ "reqIdx": <index>, "error": "...", "code": "..." }`. A failure of your own SQL is classified: `400 SQL_ERROR` (syntax, unknown table or column) or `400 SQL_BIND_ERROR` (parameters that do not fit the statement), `409 SQL_CONSTRAINT` or `409 DATABASE_READONLY`, which carry SQLite's message, and `503 DATABASE_BUSY` or `503 REQUEST_TIMEOUT`, which carry the generic `internal database error` (a deadline that passes before any item runs says `request timeout` with `reqIdx: -1`; no 5xx body carries SQLite's text). A result past the response size limit is `413 RESPONSE_TOO_LARGE` (nothing is committed: narrow the query or page through it with `LIMIT`/`OFFSET`), and a change to the server's own KV bookkeeping tables (history, op counters, change capture, idempotency receipts) is `400 INVALID_PARAMETERS`. A KV change-capture refusal, such as an unsupported table shape or a database using a newer capture format, is `409 CONFLICT`. Anything else is `500 DATABASE_ERROR` with the same generic message, so do not retry it blindly. Set `"noFail": true` on an item to keep going after a failure that leaves the transaction active: the call returns `200`, and that item's result is `{ "success": false, "error": "...", "code": "..." }` (no `reqIdx`). A conflict that rolls back the transaction itself (`INSERT OR ROLLBACK`, or `RAISE(ROLLBACK)` in a trigger) still ends the request with `409 SQL_CONSTRAINT` even under `noFail`, and nothing is committed. A `valuesBatch` item under `noFail` can instead succeed in part: rows with bad parameters are skipped and listed in `rowErrors` while `success` is `true` (`false` when every row is refused), so inspect `rowErrors` too.

## Related namespaces

`files` `.db` in `/hoody/databases/` · `exec` in-computer · `notes` notebooks · `cron` schedule maintenance.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `computers.get` (`client.api.computers.get(computerId)`) first, then choose a `DB` path. Bare names (`./mydb`) auto-resolve under `/hoody/databases/`; absolute paths outside that tree are refused unless the deployment allows any absolute database path.

**Two SQL field names:** in a transaction item, use the `"query":"..."` key for SELECT (returns `resultSet`/`resultHeaders`) and the `"statement":"..."` key for DDL/DML (returns `rowsUpdated`, or rows when the SQL produces columns, such as a write with `RETURNING`). The `"sql"` alias maps to `"statement"`, not `"query"`.

### 1. Schema setup with idempotent multi-statement transaction

**Goal:** create a fresh database under `/hoody/databases/`, install a 3-statement schema (table + index + seed row) atomically, then read it back. Every statement is `IF NOT EXISTS` / parameterised so the whole step is replay-safe.

**Step 1 — create the db file** with the kv table pre-seeded so KV ops on the same db don't have to bootstrap separately.

```typescript
const db = `/hoody/databases/sqlite-examples-${Math.random().toString(36).slice(2)}.db`;
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

**Goal:** store a per-user session blob with a 60-second TTL, check it with `kv.exists` (200 while live; 404 once the TTL has passed), then delete it explicitly before it expires. Deleting an already expired key answers 404 like any missing key.

**Step 1 — set with TTL.** The PUT body is the value; the kit records the request's `Content-Type` as the key's `content_type` (default `application/octet-stream`), so send JSON with `Content-Type: application/json`. Query params carry `ttl` in seconds.

```typescript
await client.sqlite.kv.set('session:alex', { user_id: 'd6ec...', scopes: ['read', 'write'] }, { db, ttl: 60 });
```

**Step 2 — `HEAD` for existence** (zero-body, cheap). Returns `200` while live, `404` once TTL elapses. A HEAD answer has no body, so the 404 names its reason in the `X-Hoody-Error-Code` header: `KEY_NOT_FOUND` or `KEY_EXPIRED`.

```typescript
// exists() resolves to a boolean: true while the key is live, false on any 404 from the kit (missing or
// expired key). Any other failure throws. (The hoody-sdk entry point installs this exists() over the generated
// HEAD call, which on its own resolves false only for a 404 marked KEY_NOT_FOUND / KEY_EXPIRED and throws on any
// other 404.)
const present = await client.sqlite.kv.exists('session:alex', { db });
```

**Step 3 — explicit delete** (don't wait for TTL). `kv.delete` is NOT idempotent: deleting a missing key returns `404 Key not found`; on a hit it returns `{success:true,deleted:true}`. Wrap with try/catch or pre-check via `kv.get`.

```typescript
await client.sqlite.kv.delete('session:alex', { db });
```

### 3. Compare-and-swap on a versioned config blob

**Goal:** roll a config doc forward only when the current value matches what we last read. CAS uses `if_match` carrying the expected value (URL-encoded), not a hash — wrong value → `412 Value mismatch for CAS`.

**Step 1 — initial set** (no `if_match` needed; CAS only protects subsequent updates).

```typescript
await client.sqlite.kv.set('config', { version: 1, feature_x: false }, { db });
```

**Step 2 — read current**, then send the next version with `if_match` set to the value you just read. For a JSON value, `if_match` is compared as a decoded JSON value, ignoring whitespace and object key order; numbers compare as written (`1` and `1.0` differ). Text and binary values compare byte for byte. Mismatched expected → `412`, request body is rejected.

```typescript
// A JSON value is compared as a value (key order and whitespace do not matter), so the
// SDK's parsed `cur.data` re-serialized is a valid ifValue. Numbers compare as written, and
// parsing drops a spelling such as 1.0 (it re-serializes as 1), which is then refused with 412.
const cur = await client.sqlite.kv.get('config', { db });
await client.sqlite.kv.set('config', { version: 2, feature_x: true }, { db, ifValue: JSON.stringify(cur.data) });
```

**Step 3 — observe a conflict** by sending stale `if_match`. Expect `HTTP 412 {"error":"Value mismatch for CAS"}` — the write is rejected without modifying the stored value.

```typescript
try {
  await client.sqlite.kv.set('config', { version: 99 }, { db, ifValue: 'stale' });
} catch (e: any) { if (e?.status !== 412) throw e; /* CAS rejected */ }
```

### 4. Atomic counter for per-user rate limiting

**Goal:** hot-path increment/decrement without a transaction round-trip. `kv.increment` / `kv.decrement` are server-side atomic and create the key on first hit; `delta` must be a POSITIVE integer (`delta <= 0` → `400 delta must be a positive integer`; the SDK throws `ValidationError` (`delta must be >= 1`) before sending) — use `kv.decrement` for the negative direction. Useful for request quotas, login-attempt counters, work-queue depth.

**Step 1 — increment by 1** on each request. First call materialises the key as `text/plain` integer.

```typescript
const { data: r } = await client.sqlite.kv.increment('rate:alex:hour', { db, delta: 1 });
const count = (r as any).value;
```

**Step 2 — bulk-add 10** in one shot (e.g. credit refund). `delta` must be a positive integer; use `kv.decrement` to go the other way — a negative `delta` is rejected with `400` (the SDK throws `ValidationError` before sending).

```typescript
await client.sqlite.kv.increment('rate:alex:hour', { db, delta: 10 });
```

**Step 3 — burn down by 3** (e.g. consume 3 quota units). The HTTP body of the final read is the plain integer. The SDK still wraps it: read it from `.data`, or pass `rawResponse: true` to get the body alone. Either way it is the string `"8"`: use `Number(...)` before doing arithmetic.

```typescript
await client.sqlite.kv.decrement('rate:alex:hour', { db, delta: 3 });
const { data: final } = await client.sqlite.kv.get('rate:alex:hour', { db }); // "8" (a string)
```

### 5. JSON-path read & partial update on a nested doc

**Goal:** stash a user-prefs document, read **one** field with `path=`, then mutate **only** that field by sending just its new value, not the whole document again. The path applies to both reads and writes.

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
await client.sqlite.kv.set('profile', 'light', { db, path: 'prefs.theme', headers: { 'Content-Type': 'application/json' } }); // sent as the JSON string "light"
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

**Goal:** prove what a key looked like right after creation, then summarise keys whose reconstructed states differ at the two timestamps; inspect `gap_keys` and `candidate_truncated` for potentially omitted keys. Uses `kv.getSnapshot` (per-key, by `op_number`) and `kv.table.compareSnapshots` (whole table, by Unix timestamps).

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
const { data: diff } = await client.sqlite.kv.table.compareSnapshots({ db, from, to });
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

**Step 2 — bulk get** (the answer is `{ success, results }`; `results` has an entry for each distinct requested key: `null` for a missing or expired key, otherwise `{content_type, value}` when `content_type` is JSON and the stored bytes parse as JSON, or `{content_type, value_base64}` otherwise. Present entries also include `etag` when the server could verify the table's versions; a key that could not be read is `{error}`). A `kv.setMany` item written without `content_type` is stored as `application/octet-stream` and so comes back base64-encoded; set `content_type: application/json`, as step 1 does, to get parsed JSON back; `kv.setMany` does not check that the bytes are JSON, so an item typed `application/json` whose bytes are not valid JSON still comes back as `value_base64`.

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

**Step 3 — paste-able URL** (e.g. dashboard link). Under the default proxy policy the kit URL itself is the auth grant — guard who you share it with. Where the owner has configured auth groups, the link also needs the credential the proxy expects, and the query URL grants nothing beyond that policy.

```typescript
const kitUrl = `https://${P}-${C}-sqlite-1.${N}.computers.hoody.com`; // P, C, N from computers.get
const url = `${kitUrl}/api/v1/sqlite/query?db=${encodeURIComponent(db)}&sql=${sqlB64}`;
```

### 10. Bulk insert via `valuesBatch` — one statement, many rows

**Goal:** load 3 rows (or 100k) with one transaction item that repeats a single SQL statement once per parameter row, instead of one tx item per row. Without `noFail: true` the rows of an item commit or fail together. With `noFail: true`, a row whose parameters do not parse or do not fit the placeholders is skipped and the valid rows still commit: the item answers `success: true` with a `rowErrors` list, so check it (if every row is refused, the item is `success: false`, `error: "batch parse failed for all N rows"`, with the same `rowErrors`; a row that fails when it runs, such as a constraint, still fails the whole item). `valuesBatch` is an array of parameter sets: use value arrays aligned with positional placeholders, as in this example, or objects keyed by name for named placeholders. Caps: 100k rows per `valuesBatch`, 1M rows per tx.

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

**Step 2 — verify count** by sending a SELECT inside a transaction item with the `"query":"..."` key (a `"statement":"..."` item that produces columns returns rows too).

```typescript
const r = await client.sqlite.sql.runTransaction(
  { transaction: [{ query: 'SELECT COUNT(*) AS n FROM users' }] }, { db });
const n = (r.data as any).results[0].resultSet[0].n;
```

**Step 3 — clean up** (delete the throwaway database through the kit, which also removes its `-wal`, `-shm` and `-journal` files, or leave it in place).

```typescript
await client.sqlite.databases.delete({ db });
```

## Reference

**Accessor:** `client.sqlite`  |  **Import:** `import * as sqlite from 'hoody-sdk/sqlite'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, computerId?, serviceIndex?, serverName? }` (`server` is the older spelling of `serverName`, which wins when both are set), which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are set by the client and are refused with a `TypeError` before the call is sent: configure the token on the client, a kit credential as `kitAuth` on `withComputer()` or the client config (`middlewareContext.kitAuth` replaces the client's `kitAuth` for one call), and use another client for another identity), `cache` (ignored here: only an `api` GET is cached, never a GET to a kit host), `responseIsFinal` (`true`: never sent again once it may have reached the server), `keyedInProgressWait` (`false`: a 409 IDEMPOTENCY_REQUEST_IN_PROGRESS is the answer, not asked again), `redactBodyKeys` (body keys whose values an ApiError shows as [REDACTED]) and `maxResponseBytes` (a response body over this many bytes is refused with code RESPONSE_TOO_LARGE, and reading stops) (no `_realm`: that one is control-plane only). When the signature shows an options object (`options?: object` is one that takes the transport options only), the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself keeps the argument order it displays. A `wsOptions` argument (WebSocket methods only) accepts just `reconnect`, `connectTimeoutMs` and `transport`; the other transport options (`timeoutMs`, `signal`, …) stay in the request options the signature shows, never in `wsOptions`.

**Reading a method.** A method that shows no **Returns:** returns the response type named after it, the words after `client.` joined in PascalCase plus `Response`: `client.sqlite.databases.create()` returns `Promise<SqliteDatabasesCreateResponse>`. `data` is the request body; it has a row only where the row says more than the signature. `Item<R>` in a pagination helper's Returns is shorthand on this page, not an exported type: the element type of the item array the helper reads from response `R`, at the path the same line names. A pagination helper written `xAll(/* the arguments of x */)` takes exactly the arguments of `x`, described under `x`.

**Services** (the ones the notes and examples above call most come first):

- `client.sqlite.kv`: clearTtl, decrement, delete, deleteMany, exists, get, getEntry, getMany, getSnapshot, increment, list, listAll, listChanges, listChangesAll, listChangesIterator, listHistory, listIterator, rollback, set, setMany, setTtl, streamChanges, read
- `client.sqlite.sql`: queryReadOnly, runTransaction, query, run
- `client.sqlite.databases`: create, delete, list, runMaintenance
- `client.sqlite.kv.table`: compareSnapshots, getSnapshot, rollback
- `client.sqlite.history`: clear, delete, getStats, list, listAll, listIterator
- `client.sqlite.kit`: getCacheStats, getHealth
- `client.sqlite.kv.arrays`: pop, push, remove

**Shared parameters.** A parameter row that repeats is printed once. When a signature shows a parameter that the method's own table does not list, its row is in the "Shared parameters" table of the method's service section when the name is there, else in the table below: same type, wire location, required mark and description. A row in a method's own table always describes that method. An SDK helper (marked as one) has no table and takes nothing from these lists.

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path |
| `table` | `string` | query | No | Custom table name |
| `idempotencyKey` | `string` | header `Idempotency-Key` | No | Replays the stored response for a repeat of the same key. By default a receipt is kept for at most 24 h; the oldest are evicted early when the per-database receipt count or size budget is exceeded. The time and both budgets are configurable. After eviction a retry with the same key is applied again. |
| `create_db_if_missing` | `boolean` | query | No | Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent. |
| `timeout` | `number` | query | No | Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it). |

### `client.sqlite.kv` (22) — Key-value store

**Shared parameters of `client.sqlite.kv`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name |
| `history` | `boolean` | query | No | Store this write's value in history; false records only that the write happened, not what it wrote |
| `ifMatch` | `string` | header `If-Match` | No | Applies the write only if the key's current ETag matches. |

#### `clearTtl` — Remove a key's TTL

```typescript
client.sqlite.kv.clearTtl(key: string, options: { db: string; table?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; ifMatch?: string; idempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name (supports / for hierarchical keys) |

**HTTP:** `POST /api/v1/sqlite/kv/{key}/persist`
**CLI:** `hoody kv ttl clear <key> --db <db>`

---

#### `decrement` — Atomic decrement

```typescript
client.sqlite.kv.decrement(key: string, options: { db: string; table?: string; delta?: number; path?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; ifMatch?: string; idempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `delta` | `number` | query | No | Amount to decrement: a positive integer; the operation sets the direction |
| `path` | `string` | query | No | JSON path to nested numeric value |

**HTTP:** `POST /api/v1/sqlite/kv/{key}/decr`
**CLI:** `hoody kv decrement <key> --db <db>`

---

#### `delete` — Delete key

```typescript
client.sqlite.kv.delete(key: string, options: { db: string; table?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; ifMatch?: string; idempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path or directory |

**HTTP:** `DELETE /api/v1/sqlite/kv/{key}`
**CLI:** `hoody kv delete <key> --db <db>`

---

#### `deleteMany` — Batch delete multiple keys

```typescript
client.sqlite.kv.deleteMany(data: SqliteKvDeleteManyRequest, options: { db: string; table?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; idempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `SqliteKvDeleteManyRequest` | body | Yes | Shape: `kvBatchDeleteRequest` under Body schemas. |

**HTTP:** `POST /api/v1/sqlite/kv/batch/delete`
**CLI:** `hoody kv batch delete --db <db>`

---

#### `exists` — Whether `key` exists: true, or false when the kit answers 404.

```typescript
client.sqlite.kv.exists(key: string, options: KvExistsOptions, templateVars?: ExistsTarget)
```

**Returns:** `Promise<boolean>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `get` — Get value by key

```typescript
client.sqlite.kv.get(key: string, options: { db: string; table?: string; path?: string; at_timestamp?: number; rebuild?: boolean; timeout?: number; ifNoneMatch?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name (supports / for hierarchical keys) |
| `db` | `string` | query | Yes | Database file path or directory |
| `path` | `string` | query | No | JSON path for nested value extraction. The extracted value is returned as JSON with an X-JSON-Path header; a path that does not exist in the value answers 404. Ignored with at_timestamp. |
| `at_timestamp` | `number` | query | No | Unix timestamp. Returns the value the key held at that moment, in a JSON envelope instead of the current value. The value is reconstructed from the key's recorded history. When no recorded write establishes it, the current value is returned if it was already in place at that moment: with op_number 0 when the key has recorded history, and without op_number or op_timestamp when it has none (for example, a key written through SQL). A write made with history=false that leaves the value at that moment unknown answers 409 TIME_TRAVEL_CHAIN_GAP. 0 or omitted reads the current value; a time in the future is rejected with 400. A directory (directory mode) is rejected with 400 in this mode. |
| `rebuild` | `boolean` | query | No | Directory mode only: clear the directory's cached file information (this directory only, not its subdirectories), then read the key. Ignored with at_timestamp. |
| `ifNoneMatch` | `string` | header `If-None-Match` | No | Answers 304 while the key's current ETag matches. |

**Returns:** `Promise<ApiResponse<ArrayBuffer> | SqliteKvGetResponse>` — the response Content-Type picks the branch, always under `.data`: JSON gives the parsed value, a binary type (or a non-text body sent as an attachment) an `ArrayBuffer`, and any other type, such as an HTML or plain-text body, a string, which the declared type does not list (narrow it before use)  |  **HTTP:** `GET /api/v1/sqlite/kv/{key}`
**CLI:** `hoody kv get <key> --db <db>`

---

#### `getEntry` — Get a key's entry

```typescript
client.sqlite.kv.getEntry(key: string, options: { db: string; table?: string; timeout?: number; ifNoneMatch?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name (supports / for hierarchical keys) |
| `ifNoneMatch` | `string` | header `If-None-Match` | No | Answers 304 while the key's current ETag matches. |

**HTTP:** `GET /api/v1/sqlite/kv/{key}/entry`
**CLI:** `hoody kv entry get <key> --db <db>`

---

#### `getMany` — Batch get multiple keys

```typescript
client.sqlite.kv.getMany(data: SqliteKvGetManyRequest, options: { db: string; table?: string; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `SqliteKvGetManyRequest` | body | Yes | Shape: `kvBatchGetRequest` under Body schemas. |

**HTTP:** `POST /api/v1/sqlite/kv/batch/get`
**CLI:** `hoody kv batch get --db <db> --keys <keys>`

---

#### `getSnapshot` — Get key snapshot at operation

```typescript
client.sqlite.kv.getSnapshot(key: string, options: { db: string; op_number: number; table?: string; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `op_number` | `number` | query | Yes | Operation number to reconstruct from |

**HTTP:** `GET /api/v1/sqlite/kv/{key}/snapshot`
**CLI:** `hoody kv snapshots get <key> --db <db> --op-number <op-number>`

---

#### `increment` — Atomic increment

```typescript
client.sqlite.kv.increment(key: string, options: { db: string; table?: string; delta?: number; path?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; ifMatch?: string; idempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `delta` | `number` | query | No | Amount to increment: a positive integer; the operation sets the direction |
| `path` | `string` | query | No | JSON path to nested numeric value |

**HTTP:** `POST /api/v1/sqlite/kv/{key}/incr`
**CLI:** `hoody kv increment <key> --db <db>`

---

#### `list` — List keys

```typescript
client.sqlite.kv.list(options: { db: string; table?: string; prefix?: string; limit?: number; offset?: number; after?: string; at_timestamp?: number; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path or directory |
| `prefix` | `string` | query | No | Filter keys by prefix |
| `limit` | `number` | query | No | Maximum number of results. Values above 1000 are treated as 1000; a negative value is rejected with 400. 0 returns an empty page, except with at_timestamp, where it means no limit |
| `offset` | `number` | query | No | Skip N results for pagination. Honoured for both the regular listing and the at_timestamp listing; results are ordered by key in both cases. A negative value is rejected with 400. Keys written or deleted between two requests shift later pages; use after to page without skipping or repeating keys (not available with at_timestamp) |
| `after` | `string` | query | No | Cursor: list only keys that sort after this one (byte order, exclusive). Pass the previous page's next_after; a key written or deleted elsewhere between two pages never makes another key be skipped or repeated. The value is used as given, so any string works, including a key that no longer exists. Combined with offset greater than 0 or with at_timestamp it is rejected with 400 |
| `at_timestamp` | `number` | query | No | Unix timestamp for time-travel LIST: returns the keys as they stood at that moment, in a different response envelope. 0 or omitted lists the current keys; a time in the future is rejected with 400. This listing pages by offset only: after is rejected with 400 and the response carries no next_after or has_more, so request limit and offset until an empty page, and check has_gaps and candidate_truncated. A directory (directory mode) is rejected with 400 in this mode |

**HTTP:** `GET /api/v1/sqlite/kv`
**CLI:** `hoody kv list --db <db>`

---

#### `listAll` — List keys (collect all pages)

```typescript
client.sqlite.kv.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<SqliteKvListResponse>[]>` — every item of `data.items`, pages collected from the cursor you pass, or from where `list()` starts without one (`list()` fetches one page). Each item is `KVListItem`. `listIterator()` streams the same items instead of collecting them. Leave out `at_timestamp` or set it to 0: a non-zero value selects the listing that pages by `offset` only, with no cursor, so the helper would return just the first page; page `list()` with `offset` instead.  |  **HTTP:** `GET /api/v1/sqlite/kv`
**CLI:** `hoody kv list --db <db>`

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

**HTTP:** `GET /api/v1/sqlite/changes`
**CLI:** `hoody kv changes list --db <db>`

---

#### `listChangesAll` — List the changes of a KV table (collect all pages)

```typescript
client.sqlite.kv.listChangesAll(/* the arguments of listChanges */)
```

**Returns:** `Promise<Item<SqliteKvListChangesResponse>[]>` — every item of `data.events`, pages collected from the cursor you pass, or from where `listChanges()` starts without one (`listChanges()` fetches one page). Each item is `KVChangeEvent`. `listChangesIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/sqlite/changes`
**CLI:** `hoody kv changes list --db <db>`

---

#### `listChangesIterator` — List the changes of a KV table (async iterator)

```typescript
client.sqlite.kv.listChangesIterator(/* the arguments of listChanges */)
```

**Returns:** `AsyncGenerator<Item<SqliteKvListChangesResponse>, void, unknown>` — one item of `data.events` per step, the next page fetched on demand from the cursor you pass, or from where `listChanges()` starts without one (`listChanges()` fetches one page). Each item is `KVChangeEvent`.  |  **HTTP:** `GET /api/v1/sqlite/changes`
**CLI:** `hoody kv changes list --db <db>`

---

#### `listHistory` — Get key operation history

```typescript
client.sqlite.kv.listHistory(key: string, options: { db: string; table?: string; limit?: number; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No | Maximum number of operations to return (0 → default 50, clamped to maximum 1000) |

**HTTP:** `GET /api/v1/sqlite/kv/{key}/history`
**CLI:** `hoody kv history list <key> --db <db>`

---

#### `listIterator` — List keys (async iterator)

```typescript
client.sqlite.kv.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<SqliteKvListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the cursor you pass, or from where `list()` starts without one (`list()` fetches one page). Each item is `KVListItem`. Leave out `at_timestamp` or set it to 0: a non-zero value selects the listing that pages by `offset` only, with no cursor, so the helper would return just the first page; page `list()` with `offset` instead.  |  **HTTP:** `GET /api/v1/sqlite/kv`
**CLI:** `hoody kv list --db <db>`

---

#### `rollback` — Rollback key operations

```typescript
client.sqlite.kv.rollback(key: string, options: { db: string; table?: string; steps?: number; create_db_if_missing?: boolean; timeout?: number; idempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `steps` | `number` | query | No | Number of operations to undo, 1 to 50000 |

**HTTP:** `POST /api/v1/sqlite/kv/{key}/rollback`
**CLI:** `hoody kv rollback <key> --db <db>`

---

#### `set` — Set value for key

```typescript
client.sqlite.kv.set(key: string, data: SqliteKvSetRequest, options: { db: string; table?: string; path?: string; ttl?: number; ifValue?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; ifMatch?: string; ifNoneMatch?: string; idempotencyKey?: string; contentType?: 'application/octet-stream' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database file path or directory |
| `path` | `string` | query | No | JSON path for nested value update |
| `ttl` | `number` | query | No | Time-to-live in seconds (SQLite mode only; a non-zero ttl against a directory-mode store is rejected with 400) |
| `ifValue` | `string` | query `if_match` | No | Compare-and-swap: write only if the key's current value equals this. Against a JSON value it is read as one JSON value and compared as a value: any spacing and key order, numbers as written (1 and 1.0 differ). Text that is not valid JSON is the string with that text, so v1 matches the stored string v1; a string whose text is itself JSON (such as 5 or true) is sent JSON-quoted. Against a text or binary value it compares byte for byte. SQLite mode only; rejected with 400 against a directory-mode store. Cannot be combined with an If-Match or If-None-Match header (400) |
| `ifNoneMatch` | `string` | header `If-None-Match` | No | Set to * to write only if the key does not exist yet. |

**Body:** `any`

- … With Content-Type application/json (or any +json type) the body must be one complete JSON document, serialised exactly once: an object, array, number, boolean, null, or a string sent QUOTED ("hello", not hello). A string like "123" must be sent quoted too, or it is stored and read back as the number 123. A body that is not valid JSON is refused with 400 INVALID_JSON_VALUE. …

**HTTP:** `PUT /api/v1/sqlite/kv/{key}`
**CLI:** `hoody kv set <key> --db <db> --body <body>`

---

#### `setMany` — Batch set multiple keys

```typescript
client.sqlite.kv.setMany(data: SqliteKvSetManyRequest, options: { db: string; table?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; idempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `SqliteKvSetManyRequest` | body | Yes | Shape: `kvBatchSetRequest` under Body schemas. |

**HTTP:** `POST /api/v1/sqlite/kv/batch/set`
**CLI:** `hoody kv batch set --db <db> --items <items>`

---

#### `setTtl` — Set a key's TTL

```typescript
client.sqlite.kv.setTtl(key: string, options: { db: string; ttl: number; table?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; ifMatch?: string; idempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | path | Yes | Key name (supports / for hierarchical keys) |
| `ttl` | `number` | query | Yes | Seconds from now until the key expires; at least 1 |

**HTTP:** `POST /api/v1/sqlite/kv/{key}/expire`
**CLI:** `hoody kv ttl set <key> --db <db> --ttl <ttl>`

---

#### `streamChanges` — Stream the changes of a KV table

```typescript
client.sqlite.kv.streamChanges(options: { db: string; table?: string; since?: string; prefix?: string; include_values?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database path |
| `table` | `string` | query | No | KV table name (default: kv_store) |
| `since` | `string` | query | No | Cursor to continue after; Last-Event-ID wins when both are sent |
| `prefix` | `string` | query | No | Only keys starting with this prefix |
| `include_values` | `boolean` | query | No | Attach small current values to set/ttl events (see GET /changes) |

**Returns:** `Promise<IEventStream<Record<never, string>, ITypedStreamEvent<SqliteKvStreamChangesFrames>>>`  |  **HTTP:** `GET /api/v1/sqlite/changes/stream`
**CLI:** `hoody kv changes stream --db <db>`

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
| `sql` | `string` | query | Yes | The SQL query, base64url-encoded (with or without = padding). Plain SQL text is also accepted |

**HTTP:** `GET /api/v1/sqlite/query`
**CLI:** `hoody db readonly query --db <db> --sql <sql>`

---

#### `runTransaction` — Execute SQL transaction

```typescript
client.sqlite.sql.runTransaction(data: SqliteSqlRunTransactionRequest, options: { db: string; create_db_if_missing?: boolean; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database path (absolute path, bare name, or ./name shorthand resolved to /hoody/databases/*.db) |
| `data` | `SqliteSqlRunTransactionRequest` | body | Yes | Shape: `request` under Body schemas. |

**HTTP:** `POST /api/v1/sqlite/db`
**CLI:** `hoody db transactions run --db <db> --transaction <transaction>`

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

---

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

**HTTP:** `POST /api/v1/sqlite/db/create`
**CLI:** `hoody db create --db <db>`

---

#### `delete` — Delete SQLite database

```typescript
client.sqlite.databases.delete(options: { db: string; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database path (absolute path, bare name, or ./name shorthand resolved to /hoody/databases/*.db) |

**HTTP:** `DELETE /api/v1/sqlite/db`
**CLI:** `hoody db delete --db <db>`

---

#### `list` — List databases in a directory

```typescript
client.sqlite.databases.list(options?: { dir?: string; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `dir` | `string` | query | No | Absolute path of the directory to list |

**HTTP:** `GET /api/v1/sqlite/db/list`
**CLI:** `hoody db list`

---

#### `runMaintenance` — Run a database maintenance operation

```typescript
client.sqlite.databases.runMaintenance(data: SqliteDatabasesRunMaintenanceRequest, options: { db: string; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `db` | `string` | query | Yes | Database path (absolute path, bare name, or ./name shorthand resolved to /hoody/databases/*.db) |
| `data` | `SqliteDatabasesRunMaintenanceRequest` | body | Yes | Shape: `maintenanceRequest` under Body schemas. |

**HTTP:** `POST /api/v1/sqlite/maintenance`
**CLI:** `hoody db maintenance run --db <db> --op <op>`

---

### `client.sqlite.kv.table` (3) — Whole-table operations

#### `compareSnapshots` — Compare table snapshots

```typescript
client.sqlite.kv.table.compareSnapshots(options: { db: string; from: number; to: number; table?: string; keys?: string; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `from` | `number` | query | Yes | Starting timestamp (Unix seconds), at least 1 and earlier than to |
| `to` | `number` | query | Yes | Ending timestamp (Unix seconds), later than from and not in the future |
| `keys` | `string` | query | No | Comma-separated list of keys to compare (optional). When given, exactly these keys are reconstructed (duplicates collapsed) |

**HTTP:** `GET /api/v1/sqlite/kv/diff`
**CLI:** `hoody kv table snapshots compare --db <db> --from <from> --to <to>`

---

#### `getSnapshot` — Get table snapshot at timestamp

```typescript
client.sqlite.kv.table.getSnapshot(options: { db: string; timestamp: number; table?: string; limit?: number; prefix?: string; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `timestamp` | `number` | query | Yes | Unix timestamp (seconds) to reconstruct, at least 1 and not in the future |
| `limit` | `number` | query | No | Maximum number of keys to return. Values above 1000 are treated as 1000; 0 returns every key found. Either way key discovery is bounded: when it stops early, candidate_truncated is true and keys may be missing; narrow with prefix |
| `prefix` | `string` | query | No | Filter keys by prefix |

**HTTP:** `GET /api/v1/sqlite/kv/snapshot`
**CLI:** `hoody kv table snapshots get --db <db> --timestamp <timestamp>`

---

#### `rollback` — Rollback entire table

```typescript
client.sqlite.kv.table.rollback(data: SqliteKvTableRollbackRequest | undefined, options: { db: string; to_timestamp: number; table?: string; dry_run?: boolean; confirm?: string; create_db_if_missing?: boolean; timeout?: number; idempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `to_timestamp` | `number` | query | Yes | Target timestamp (Unix seconds), at least 1 and not in the future |
| `dry_run` | `boolean` | query | No | Preview changes without applying |
| `confirm` | `string` | query | No | Must be 'yes' to execute actual rollback |
| `data` | `SqliteKvTableRollbackRequest \| undefined` | body | No | Shape: `kvTableRollbackRequest` under Body schemas. |

**HTTP:** `POST /api/v1/sqlite/kv/rollback`
**CLI:** `hoody kv table rollback --db <db> --to-timestamp <to-timestamp>`

---

### `client.sqlite.history` (6) — Query execution history and statistics

#### `clear` — Clear query history

```typescript
client.sqlite.history.clear(options: { db: string; timeout?: number })
```

**HTTP:** `DELETE /api/v1/sqlite/history`
**CLI:** `hoody db history clear --db <db>`

---

#### `delete` — Delete history entry

```typescript
client.sqlite.history.delete(index: number, options: { db: string; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `index` | `number` | path | Yes | History entry ID |

**HTTP:** `DELETE /api/v1/sqlite/history/{index}`
**CLI:** `hoody db history delete <index> --db <db>`

---

#### `getStats` — Get history statistics

```typescript
client.sqlite.history.getStats(options: { db: string; timeout?: number })
```

**HTTP:** `GET /api/v1/sqlite/history/stats`
**CLI:** `hoody db history stats --db <db>`

---

#### `list` — Get query history

```typescript
client.sqlite.history.list(options: { db: string; limit?: number; offset?: number; timeout?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No | Maximum number of entries to return (0 means the default; capped at 1000) |
| `offset` | `number` | query | No | Number of newest entries to skip |

**HTTP:** `GET /api/v1/sqlite/history`
**CLI:** `hoody db history list --db <db>`

---

#### `listAll` — Get query history (collect all pages)

```typescript
client.sqlite.history.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<SqliteHistoryListResponse>[]>` — every item of `data.history`, pages collected from the offset you pass, 0 by default (`list()` fetches one page). Each item is `QueryHistoryEntry`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/sqlite/history`
**CLI:** `hoody db history list --db <db>`

---

#### `listIterator` — Get query history (async iterator)

```typescript
client.sqlite.history.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<SqliteHistoryListResponse>, void, unknown>` — one item of `data.history` per step, the next page fetched on demand from the offset you pass, 0 by default (`list()` fetches one page). Each item is `QueryHistoryEntry`.  |  **HTTP:** `GET /api/v1/sqlite/history`
**CLI:** `hoody db history list --db <db>`

---

### `client.sqlite.kit` (2) — Liveness and observability snapshots

#### `getCacheStats` — Cache health snapshot

```typescript
client.sqlite.kit.getCacheStats()
```

**HTTP:** `GET /api/v1/sqlite/health/cache`
**CLI:** `hoody db cache stats`

---

#### `getHealth` — Health check

```typescript
client.sqlite.kit.getHealth(options?: { verbose?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `verbose` | `boolean` | query | No | Return the full snapshot. Without it the response carries the status field alone; with it, service identity, the features list, process memory and file-descriptor counters, and the cache and counter snapshots are included |

**HTTP:** `GET /api/v1/sqlite/health`
**CLI:** `hoody db health`

---

### `client.sqlite.kv.arrays` (3) — Array value operations

**Shared parameters of `client.sqlite.kv.arrays`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `history` | `boolean` | query | No | Store this write's value in history; false records only that the write happened, not what it wrote |
| `ifMatch` | `string` | header `If-Match` | No | Applies the write only if the key's current ETag matches. |
| `key` | `string` | path | Yes | Key name |
| `path` | `string` | query | No | JSON path to nested array |

#### `pop` — Remove from array end

```typescript
client.sqlite.kv.arrays.pop(key: string, options: { db: string; table?: string; path?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; ifMatch?: string; idempotencyKey?: string })
```

**HTTP:** `POST /api/v1/sqlite/kv/{key}/pop`
**CLI:** `hoody kv arrays pop <key> --db <db>`

---

#### `push` — Append to array

```typescript
client.sqlite.kv.arrays.push(key: string, data: SqliteKvArraysPushRequest, options: { db: string; table?: string; path?: string; history?: boolean; create_db_if_missing?: boolean; timeout?: number; ifMatch?: string; idempotencyKey?: string })
```

**Body:** `any`

- The value to append: one JSON value of any type (object, array, string, number, boolean or null). An array is appended as a single element, not spread. A body that is not valid JSON is refused with 400.

**HTTP:** `POST /api/v1/sqlite/kv/{key}/push`
**CLI:** `hoody kv arrays push <key> --db <db> --body <body>`

---

#### `remove` — Remove array element

```typescript
client.sqlite.kv.arrays.remove(key: string, data: SqliteKvArraysRemoveRequest | undefined, options: { db: string; table?: string; path?: string; index?: number; history?: boolean; create_db_if_missing?: boolean; timeout?: number; ifMatch?: string; idempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `index` | `number` | query | No | Array index to remove. Send this or a body value; with neither the request is a 400 |
| `data` | `SqliteKvArraysRemoveRequest \| undefined` | body | No | Shape: `kvRemoveRequest` under Body schemas. |

**HTTP:** `POST /api/v1/sqlite/kv/{key}/remove`
**CLI:** `hoody kv arrays remove <key> --db <db>`


### Body schemas

- `kvBatchDeleteRequest` — `{ items: kvBatchDeleteItem[], keys: string[] }`
  - `items` — Keys to delete, each with an optional if_match condition. 1-100 entries. Send keys or items, not both.
  - `keys` — Keys to delete. 1-100 entries; no entry may be empty or whitespace-only. Send keys or items, not both.
- `kvBatchGetRequest` — `{ keys*: string[] }`
- `kvBatchSetRequest` — `{ items*: kvBatchSetItem[] }`
- `request` — `{ resultFormat: string, transaction*: requestItem[] }`
- `maintenanceRequest` — `{ dest_path: string, op*: "wal_checkpoint_truncate" | "vacuum_into" | "quick_check" | "reset_changes" | "restore", src_path: string }`
  - `dest_path` — Destination file for vacuum_into. Required for that operation and ignored by the others. Jailed like the db parameter, and it must not already exist.
  - `src_path` — Source file for restore: an existing SQLite database, such as a vacuum_into copy. Required for that operation and ignored by the others. Jailed like the db parameter, and it must not be the database itself. It is only read.
- `kvRemoveRequest` — `{ value: any }`
  - `value` — Remove the first element equal to this value. Any JSON value; an explicit null removes the first null element, which is not the same as leaving value out. Ignored when the index parameter is set. Without index, value is required.
- `kvTableRollbackRequest` — `{ exclude_keys: string[], keys: string[] }`
  - `exclude_keys` — Keys to leave untouched. Applied after keys. At most 10000 entries; more is rejected with 413.
  - `keys` — Keys to roll back. Omit or leave empty to roll back the whole table. At most 10000 entries; more is rejected with 413.
- `kvBatchDeleteItem` — `{ if_match: string, key*: string }`
  - `if_match` — Delete this key only if its current ETag is one of these (a comma-separated list of strong entity-tags, as in the If-Match header), or "*" for "the key exists". Checked for every item before any key is deleted; one failure fails the whole batch with 412.
  - `key` — Key to delete. Must not be empty or whitespace-only.
- `kvBatchSetItem` — `{ content_type: string, if_match: string, if_none_match: string, key*: string, ttl: int, value: string }`
  - `if_match` — Write this item only if the key exists and its current ETag is one of these (a comma-separated list of strong entity-tags, as in the If-Match header), or "*" for "the key exists". Checked for every item before any is written; one failure fails the whole batch with 412.
  - `if_none_match` — "*" to write this item only if the key does not exist (or has expired). Any other value is rejected with 400. Checked for every item before any is written; one failure fails the whole batch with 412.
  - `key` — Key to write. Must not be empty or whitespace-only.
  - `ttl` — Lifetime in seconds from now. 0 or omitted stores without expiry; negative is rejected.
- `requestItem` — `{ noFail: bool, query: string, statement: string, values: (string|null | number | bool)[]|null | object, valuesBatch: ((string|null | number | bool)[]|null | object)[]|null, sql: string, params: (string|null | number | bool)[]|null | object }`
  - One transaction item: SQL in `query` or `statement` (alias `sql`), exactly one of them; bind values in `values` (alias `params`) or `valuesBatch`; and `noFail`. Any other key is refused with 400 UNKNOWN_FIELD.
  - `values` — … Elements must be JSON scalars (string, number, boolean, null); numbers must fit int64/float64 (else 400). A nested array or object cannot be bound: the request fails with 400 SQL_BIND_ERROR, or, for an item with noFail, that item reports the error and the rest of the request goes on. The values must fit the statement: an array holds one entry per positional slot (each ? takes the next slot, ?NNN and $NNN name slot NNN), an object one key per distinct name. …
  - `params` — Alias for `values`. Sending both is accepted when they hold the same value; different contents are refused with 400 VALUES_CONFLICT, and an explicit null counts as a value.

