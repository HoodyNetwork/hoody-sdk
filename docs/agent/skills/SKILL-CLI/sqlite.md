> _**CLI skill · `sqlite` namespace** · ~7,638 tokens · hoody-sdk v1.0.0-beta.16_

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

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### DB + SQL tx

`hoody db create --path <p> --init-kv` (`--path`: bare name, `./name`, or absolute under `/hoody/databases`; `--init-kv` creates the KV table) → `hoody db transactions run --db <p> --transaction '[{"statement":"..."}]'` (add `--create-db-if-missing` to make the create step optional) → `hoody db history list --db <p>`.

### KV CRUD + CAS + counters

- `hoody kv set` — `ttl`, `if_match` (CAS), `path`, `history`.
- `hoody kv get` — `path`, `at_timestamp`. `hoody kv exists` takes `db`, plus optional `table` and `timeout`; `hoody kv delete` takes `db`/`table`/`history` (`history`, default true, records the deleted value; `false` records only that a delete happened) plus `create_db_if_missing` (alias `auto_create`) and `timeout`.
- `hoody kv increment` / `hoody kv decrement` / `hoody kv arrays push` / `hoody kv arrays pop` / `hoody kv arrays remove` — atomic, `path`-aware (`path` is a JSON path inside the value, such as `.user.tags`). The push body is any JSON value, appended as one element; the remove body is `{"value": <any>}` (matches by value), or pass the `index` query parameter instead. 

### Time-travel (needs `history: true`)

- `hoody kv history list` (default 50, max 1000); `hoody kv snapshots get` at `op_number`.
- `hoody kv table snapshots get` / `hoody kv table snapshots compare` — Unix `timestamp` in seconds (milliseconds are rejected as "in the future") / diff.
- `hoody kv rollback` last N; `hoody kv table rollback`: `dry_run` (query) then `confirm: 'yes'` (query — NOT body field). The body is optional: omit it for a full-table rollback, or send `{"keys":[...]}` / `{"exclude_keys":[...]}` to scope it. Add `--keys` / `--exclude-keys` only when scoping.

### Bulk + shareable

- `hoody kv batch set`/`hoody kv batch delete` — one SQLite transaction each. `hoody kv batch get` — one HTTP request that reads every key in one read-only SQLite transaction, with one expiry check time, so the result is one consistent snapshot.
- `hoody db readonly query` — GET, URL-safe base64 `sql`, read-only. `hoody db health`/`hoody db cache stats`.

## Quirks & gotchas

- **Bare-URL auth.** The `sqlite` kit checks no credential of its own; access through the kit URL is governed by the container proxy's permission policy. Under the default policy (no rules configured) the bare kit URL works with no extra headers and is itself the bearer; where the owner has configured auth groups, send the credential the group expects, or the proxy answers 401 or 403. → See `SKILL-CLI.md § Kit URLs as credentials`.
- **Tx item keys: `"query"` and `statement`.** Each `transaction[i]` MUST carry exactly one of `"query"` or `statement`. A `statement` returns rows (`resultHeaders`/`resultSet`) when its SQL produces columns (a SELECT, or a write with `RETURNING`), and `rowsUpdated` otherwise. Use `"query"` for reads anyway; `valuesBatch` keeps its own restrictions. The `sql` alias maps to `statement`.
- Path resolution: bare names auto-resolve under `/hoody/databases/` (with `.db` appended if no extension). The `./name` shorthand is the same bare name (`./app` → `/hoody/databases/app.db`). Any other relative path containing `/` or `\` (e.g. `data/app.db`, `./dir/app.db`) is **rejected**, NOT auto-absoluted; only literal absolute paths (e.g. `/hoody/databases/app.db`) are treated as absolute. Absolute paths outside `/hoody/databases` are refused unless the deployment allows any absolute database path. A database filename must be a regular file: a symlink at the filename itself is rejected. Symlinked parent directories are resolved to their real path. `:memory:` databases are rejected.
- Directory mode takes an absolute directory path. Any other relative path (`sub/dir`) is refused with `directory-mode: invalid path input: path must be absolute`; a bare database name (`app`) is not treated as a directory and is opened as a database instead.
- Tx items: `statement` or alias `sql`. `hoody db transactions run` caps: 10k items, 100k rows/`valuesBatch`, 1M total rows. `values` and `valuesBatch` are mutually exclusive on a single item; `"query"` items cannot use `valuesBatch`.
- **GET `/query` rejects mutations**: INSERT/UPDATE/DELETE, `RETURNING` on writes, multi-statement (semicolons), any PRAGMA, VACUUM, ATTACH/DETACH — only a single statement leading with SELECT, or a WITH that contains no write keyword, is accepted. Use `hoody db transactions run` with `statement:` items for writes.
- **SELECT result-row cap is 10 000** (responses set `truncated: true` when hit) on both transaction `"query"` items and GET `/query`; further rows silently truncated. Paginate explicitly for larger result sets.
- **`hoody kv set` body is any JSON value** (object, array, string, number, boolean, null), stored verbatim. **`hoody kv batch set` differs:** each item's `value` is a string, so JSON-encode objects yourself.
- Time-travel **history is opt-out, not opt-in**: write handlers default `history: true`. Pass `history: false` to record only that the write happened, not what it wrote — but later `hoody kv history list` / snapshot / time-travel reads will see gaps (`has_gaps`, `gap_keys`, `candidate_truncated` fields). Per-key history reconstruction is capped at 50 000 ops.
- `create_db_if_missing`/`auto_create` aliases; mismatch → `conflicting flags`.
- `hoody kv list` w/ `at_timestamp` → time-travel handler (different envelope; `offset` and `limit` still apply, ordered by key as in the regular listing). The history `limit`: 0→50, >1000→1000.
- `hoody db readonly query` `sql` accepts URL-safe base64 (`+`→`-`, `/`→`_`); both padded and unpadded forms are accepted. Inputs that do not decode to a SELECT/WITH query are treated as raw SQL. No workspace scoping — under the default proxy policy the kit URL alone is the credential, share carefully.
- A directory-mode KV store keeps a `.hoody_sqlite/cache.db` in each directory it uses and holds it open, so that file and its `-wal`, `-shm` and `-journal` companions can be neither created nor deleted as a database (`400 INVALID_DB_PATH`). Any other database inside a `.hoody_sqlite` directory is an ordinary database.
- CLI: `hoody db` (short form `sql`); KV under `hoody kv`.

## Common errors

- `412 Value mismatch for CAS` (`if_match` mismatch) / `412 Key does not exist for CAS` (both CAS failures are 412).
- `400 directory-mode: invalid path input: path must be absolute` (directory mode given a relative path).
- `400 absolute database paths outside /hoody/databases are disallowed`.
- `400 invalid database name; allowed: letters, numbers, dot, dash, underscore` for `:memory:` (and any other bare name with characters outside that set). An absolute path containing `:memory:` gets `400 in-memory databases are not supported` instead.
- `400 conflicting flags: create_db_if_missing and auto_create must match`.
- `400 GET /query only accepts read-only SELECT/WITH queries; use POST /db for mutating SQL` (returned for non-SELECT input; a non-base64 `sql` value is not an error — it is interpreted as raw SQL).
- `400 Invalid JSON body` on `hoody kv batch set` — wire shape requires each `value` to be a JSON-encoded string, not an object.
- `409` with `"error": "TIME_TRAVEL_CHAIN_GAP"` (message `time-travel: chain gap straddles target timestamp`) when the history needed for the answer has an unrecorded (`history: false`) or pruned gap. Timestamp reads, `hoody kv snapshots get` at an `op_number`, and the rollbacks (`hoody kv rollback`, `hoody kv table rollback`) all return it. Per-key rollback puts the detail in `error` after the code (`"TIME_TRAVEL_CHAIN_GAP: ..."`); table rollback returns `error: "TIME_TRAVEL_CHAIN_GAP"` and puts the detail in `message`.
- A failing transaction item aborts and rolls back the whole transaction by default: the response is that item's HTTP status (4xx or 5xx) with `{ "reqIdx": <index>, "error": "...", "code": "..." }`. A failure of your own SQL is classified: `400 SQL_ERROR` (syntax, unknown table or column) or `400 SQL_BIND_ERROR` (parameters that do not fit the statement), `409 SQL_CONSTRAINT` or `409 DATABASE_READONLY`, which carry SQLite's message, and `503 DATABASE_BUSY` or `503 REQUEST_TIMEOUT`, which carry the generic `internal database error` (no 5xx body carries SQLite's text). Anything else is `500 DATABASE_ERROR` with the same generic message, so do not retry it blindly. Set `"noFail": true` on an item to keep going instead: the call returns `200`, and that item's result is `{ "success": false, "error": "...", "code": "..." }` (no `reqIdx`). A `valuesBatch` item under `noFail` can instead succeed in part: rows with bad parameters are skipped and listed in `rowErrors` while `success` is `true`, so inspect `rowErrors` too. = responseItem{"]

## Related namespaces

`files` `.db` in `/hoody/databases/` · `exec` in-container · `notes` notebooks · `cron` schedule maintenance.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first, then choose a `DB` path. Bare names (`./mydb`) auto-resolve under `/hoody/databases/`; absolute paths outside that tree are refused unless the deployment allows any absolute database path (`/tmp/...` works on dev kits).

**Two SQL field names:** in a transaction item, use the `"query":"..."` key for SELECT (returns `resultSet`/`resultHeaders`) and the `"statement":"..."` key for DDL/DML (returns `rowsUpdated`, or rows when the SQL produces columns, such as a write with `RETURNING`). The `"sql"` alias maps to `"statement"`, not `"query"`.

### 1. Schema setup with idempotent multi-statement transaction

**Goal:** create a fresh database under `/hoody/databases/`, install a 3-statement schema (table + index + seed row) atomically, then read it back. Every statement is `IF NOT EXISTS` / parameterised so the whole step is replay-safe.

**Step 1 — create the db file** with the kv table pre-seeded so KV ops on the same db don't have to bootstrap separately.

```bash
DB="/hoody/databases/sqlite-examples-$RANDOM.db"
hoody --container "$C" db create --path "$DB" --init-kv
```

**Step 2 — install schema** in a single transaction. Returns `{results:[...]}` with one entry per statement; `rowsUpdated:1` on the final INSERT confirms the seed landed.

```bash
hoody --container "$C" db transactions run --db "$DB" --transaction '[
  {"statement":"CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, created_at INTEGER)"},
  {"statement":"CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)"},
  {"statement":"INSERT OR IGNORE INTO users (name, email, created_at) VALUES (?, ?, ?)","values":["Ada","ada@example.com",1778191500]}
]'
```

**Step 3 — read back using a SELECT under a transaction item with the `"query":"..."` key (the read key; a `statement` that produces columns also returns them).** The response carries `resultHeaders` + `resultSet` of column→value objects.

```bash
hoody --container "$C" db transactions run --db "$DB" --transaction '[{"query":"SELECT id, name, email FROM users"}]'
```

### 2. KV CRUD with TTL — short-lived session token

**Goal:** store a per-user session blob with a 60-second TTL, prove `hoody kv exists` flips to 404 after expiry, then explicitly delete.

**Step 1 — set with TTL.** The PUT body is the value; the kit records the request's `Content-Type` as the key's `content_type` (default `application/octet-stream`), so send JSON with `Content-Type: application/json`. Query params carry `ttl` in seconds.

```bash
hoody --container "$C" kv set 'session:alex' --db "$DB" --ttl 60 \
  --body '{"user_id":"d6ec...","scopes":["read","write"]}'
```

**Step 2 — `HEAD` for existence** (zero-body, cheap). Returns `200` while live, `404` once TTL elapses. A HEAD answer has no body, so the 404 names its reason in the `X-Hoody-Error-Code` header: `KEY_NOT_FOUND` or `KEY_EXPIRED`.

```bash
hoody --container "$C" kv exists 'session:alex' --db "$DB"
```

**Step 3 — explicit delete** (don't wait for TTL). `hoody kv delete` is NOT idempotent: deleting a missing key returns `404 Key not found`; on a hit it returns `{success:true,deleted:true}`. Wrap with try/catch or pre-check via `hoody kv get`.

```bash
hoody --container "$C" kv delete 'session:alex' --db "$DB" -y
```

### 3. Compare-and-swap on a versioned config blob

**Goal:** roll a config doc forward only when the current value matches what we last read. CAS uses `if_match` carrying the **literal raw value** (URL-encoded), not a hash — wrong value → `412 Value mismatch for CAS`.

**Step 1 — initial set** (no `if_match` needed; CAS only protects subsequent updates).

```bash
hoody --container "$C" kv set config --db "$DB" --body '{"version":1,"feature_x":false}'
```

**Step 2 — read current**, then send the next version with `if_match` set to the exact JSON bytes you just read. Mismatched expected → `412`, request body is rejected.

```bash
# CAS compares BYTE-EXACT. The CLI parses a JSON value and re-prints it (even with
# -o raw, an object comes back pretty-printed), so reuse the exact bytes you wrote:
CUR='{"version":1,"feature_x":false}'
# (to compare against the stored bytes instead, read them with a raw HTTP GET of the key)
hoody --container "$C" kv set config --db "$DB" --if-match "$CUR" \
  --body '{"version":2,"feature_x":true}'
```

**Step 3 — observe a conflict** by sending stale `if_match`. Expect `HTTP 412 {"error":"Value mismatch for CAS"}` — the write is rejected without modifying the stored value.

```bash
hoody --container "$C" kv set config --db "$DB" --if-match 'stale' --body '{"version":99}' || echo 'CAS rejected as expected'
```

### 4. Atomic counter for per-user rate limiting

**Goal:** hot-path increment/decrement without a transaction round-trip. `hoody kv increment` / `hoody kv decrement` are server-side atomic and create the key on first hit; `delta` must be a POSITIVE integer (`delta <= 0` → `400 delta must be a positive integer`) — use `hoody kv decrement` for the negative direction. Useful for request quotas, login-attempt counters, work-queue depth.

**Step 1 — increment by 1** on each request. First call materialises the key as `text/plain` integer.

```bash
hoody --container "$C" kv increment 'rate:alex:hour' --db "$DB" --delta 1
```

**Step 2 — bulk-add 10** in one shot (e.g. credit refund). `delta` must be a positive integer; use `hoody kv decrement` to go the other way — a negative `delta` is rejected with `400`.

```bash
hoody --container "$C" kv increment 'rate:alex:hour' --db "$DB" --delta 10
```

**Step 3 — burn down by 3** (e.g. consume 3 quota units). The HTTP body of the final read is the plain integer. 

```bash
hoody --container "$C" kv decrement 'rate:alex:hour' --db "$DB" --delta 3
hoody --container "$C" kv get  'rate:alex:hour' --db "$DB"
```

### 5. JSON-path read & partial update on a nested doc

**Goal:** stash a user-prefs document, read **one** field with `path=`, then mutate **only** that field without rewriting the whole blob. The path applies to both reads and writes.

**Step 1 — seed full document.**

```bash
hoody --container "$C" kv set profile --db "$DB" --body '{"name":"Ada","prefs":{"theme":"dark","lang":"en"}}'
```

**Step 2 — read just `prefs.theme`**: returns the leaf value (`"dark"`), not the parent object.

```bash
hoody --container "$C" kv get profile --db "$DB" --path prefs.theme
```

**Step 3 — patch one leaf**. The PUT body is the **new leaf value** (here `"light"`), not the full document. `lang` and `name` are untouched.

```bash
hoody --container "$C" kv set profile --db "$DB" --path prefs.theme --body '"light"'
```

### 6. Time-travel — record three states of a feature flag, roll back two

**Goal:** undo the last two writes on a key without losing earlier history. Requires `history=true` on every write you want to be reversible.

**Step 1 — three sequential states** with history recording.

```bash
for v in '{"chat":false,"voice":false}' '{"chat":true,"voice":false}' '{"chat":true,"voice":true}'; do
  hoody --container "$C" kv set feature-flags --db "$DB" --history --body "$v"
done
```

**Step 2 — inspect history** (`hoody kv history list` returns newest first; each entry has `op_number` and `operation` — `operation.raw_old_value` / `operation.raw_new_value` carry the value bytes in base64 for every content type, JSON included).

```bash
hoody --container "$C" kv history list feature-flags --db "$DB" --limit 10
```

**Step 3 — roll back the last two ops** so `feature-flags` returns to `{chat:false,voice:false}`. Only the chosen key is affected.

```bash
hoody --container "$C" kv rollback feature-flags --db "$DB" --steps 2
hoody --container "$C" kv get      feature-flags --db "$DB"
```

### 7. Snapshot at op-number, then diff against current

**Goal:** prove what a key looked like right after creation, then summarise every key that changed in a window. Uses `hoody kv snapshots get` (per-key, by `op_number`) and `hoody kv table snapshots compare` (whole table, by Unix timestamps).

**Step 1 — fetch the per-key snapshot at `op_number=1`** (= the first state).

```bash
hoody --container "$C" kv snapshots get feature-flags --db "$DB" --op-number 1
```

**Step 2 — record `from` and `to` timestamps** around a write window, then mutate so there is something to diff.

```bash
FROM=$(date +%s); sleep 1
hoody --container "$C" kv set cmp-test --db "$DB" --history --body '{"v":1}'
sleep 1; TO=$(date +%s)
```

**Step 3 — diff the table** between the two timestamps. `stats.created/modified/deleted` summarises; `changes[]` enumerates per-key.

```bash
hoody --container "$C" kv table snapshots compare --db "$DB" --from "$FROM" --to "$TO"
```

### 8. Bulk batch — set / get / delete in single round-trips

**Goal:** seed three KV pairs, fetch them in one request (with one missing key to see the null payload), then drop them all. `hoody kv batch set` and `hoody kv batch delete` each run in one SQLite transaction; `hoody kv batch get` reads every key in one read transaction, so the result is one consistent snapshot. Cap is 100 items per batch.

**Important wire-format detail:** in `hoody kv batch set`, every `value` must be a **string** (a JSON-encoded scalar/object). Sending a raw object → `400 Invalid JSON body`.

**Step 1 — bulk set with TTL on one item.**

```bash
hoody --container "$C" kv batch set --db "$DB" --items '[
  {"key":"u:1","value":"{\"name\":\"alice\"}","content_type":"application/json"},
  {"key":"u:2","value":"{\"name\":\"bob\"}","content_type":"application/json"},
  {"key":"u:3","value":"{\"name\":\"carol\"}","content_type":"application/json","ttl":3600}
]'
```

**Step 2 — bulk get** (missing keys come back as `null`; present ones as `{content_type, value}` when `content_type` is JSON, otherwise as `{content_type, value_base64}`). A `hoody kv batch set` item written without `content_type` is stored as `application/octet-stream` and so comes back base64-encoded; set `content_type: application/json`, as step 1 does, to get parsed JSON back.

```bash
hoody --container "$C" kv batch get --db "$DB" --keys u:1,u:2,u:3,u:404
```

**Step 3 — bulk delete.** Returns `{deleted: <count>, success: true}`. Missing keys silently no-op.

```bash
hoody --container "$C" kv batch delete --db "$DB" --keys u:1,u:2,u:3
```

### 9. Shareable read-only SQL via base64-encoded GET

**Goal:** build a reusable GET URL that runs a SELECT. The `/query` route itself rejects writes, but the URL is not a restricted credential: it carries the kit URL, which also reaches every other route of this kit (including mutating `POST /db`) and has no expiry of its own. Share it only where you would share the kit URL itself. `sql` is **URL-safe base64** (`+`→`-`, `/`→`_`); padding is optional — both padded and unpadded forms are accepted.

**Step 1 — encode** the query.

```bash
SQL='SELECT id, name, email FROM users LIMIT 10'
# `db readonly query` does NOT auto-encode the SQL; pre-encode to URL-safe
# base64 (padding optional) the same way the HTTP example does:
SQL_B64=$(printf '%s' "$SQL" | base64 -w0 | tr '+/' '-_')
hoody --container "$C" db readonly query --db "$DB" --sql "$SQL_B64"
```

**Step 2 — issue the GET.** Response includes `columns`, `resultSet`, `rowCount`, `truncated`. A non-base64 `sql` value is not an error — it is interpreted as raw SQL; a non-SELECT query → `400 GET /query only accepts read-only SELECT/WITH queries; use POST /db for mutating SQL`.

```bash
# Step 1 already executed it
:
```

**Step 3 — paste-able URL** (e.g. dashboard link). Under the default proxy policy the kit URL itself is the auth grant — guard who you share it with. Where the owner has configured auth groups, the link also needs the credential the proxy expects, and the query URL grants nothing beyond that policy.

```bash
# `--url` is NOT a flag on `db readonly query` (it belongs to `db open`);
# compose a pasteable URL by hand if you want one:
echo "https://${P}-${C}-sqlite-1.${N}.containers.hoody.com/api/v1/sqlite/query?db=${DB}&sql=${SQL_B64}"
```

### 10. Bulk insert via `valuesBatch` — one statement, many rows

**Goal:** load 3 rows (or 100k) with one transaction item that repeats a single SQL statement once per parameter row, instead of one tx item per row. Without `noFail: true` the rows of an item commit or fail together. With `noFail: true`, a row whose parameters do not parse or do not fit the placeholders is skipped and the valid rows still commit: the item answers `success: true` with a `rowErrors` list, so check it. `valuesBatch` is an array of value-arrays positionally aligned with the `?` placeholders. Caps: 100k rows per `valuesBatch`, 1M rows per tx.

**Step 1 — bulk insert.** Response carries `rowsUpdatedBatch:[1,1,1]` — one entry per row.

```bash
hoody --container "$C" db transactions run --db "$DB" --transaction '[{
  "statement":"INSERT INTO users (name, email, created_at) VALUES (?, ?, ?)",
  "valuesBatch":[["Bob","bob@example.com",1778000000],["Carol","carol@example.com",1778000100],["Dan","dan@example.com",1778000200]]
}]'
```

**Step 2 — verify count** by sending a SELECT inside a transaction item with the `"query":"..."` key (NOT the `"statement":"..."` key).

```bash
hoody --container "$C" db transactions run --db "$DB" --transaction '[{"query":"SELECT COUNT(*) AS n FROM users"}]'
```

**Step 3 — clean up** (delete the throwaway database through the kit, which also removes its `-wal`, `-shm` and `-journal` files, or leave it in place).

```bash
hoody --container "$C" db delete --db "$DB" -y
```

## Reference

### `hoody db` (13) — SQLite database operations

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody db cache stats` |  | read | Database connection cache snapshot | `sqlite.kit.getCacheStats` | `hoody db cache stats` |
| `hoody db create` |  | write | Create new SQLite database | `sqlite.databases.create` | `hoody db create --path /hoody/databases/app.db --init-kv --kv-table kv_store` |
| `hoody db delete` |  | destructive | Permanently delete a SQLite database and its -wal, -shm and -journal files | `sqlite.databases.delete` | `hoody db delete --db /hoody/databases/app.db --timeout 30 -y` |
| `hoody db health` |  | read | Service health check | `sqlite.kit.getHealth` | `hoody db health --verbose` |
| `hoody db history clear` |  | destructive | Clear query history | `sqlite.history.clear` | `hoody db history clear --db <db> --timeout 30` |
| `hoody db history delete` |  | destructive | Delete history entry | `sqlite.history.delete` | `hoody db history delete 10 --db <db> --timeout 30 -y` |
| `hoody db history list` |  | read | Get query history | `sqlite.history.list` | `hoody db history list --db <db> --limit 100 --offset 0` |
| `hoody db history stats` |  | read | Get history statistics | `sqlite.history.getStats` | `hoody db history stats --db <db> --timeout 30` |
| `hoody db list` |  | read | List the databases in a directory | `sqlite.databases.list` | `hoody db list --dir /hoody/databases --timeout 30` |
| `hoody db maintenance run` |  | write | Run a maintenance operation on a database | `sqlite.databases.runMaintenance` | `hoody db maintenance run --db /hoody/databases/app.db --timeout 30 --dest-path /hoody/databases/backup.db --op wal_checkpoint_truncate` |
| `hoody db open` |  | action | Open the SQLite kit studio in your browser |  | `hoody db open` |
| `hoody db readonly query` |  | action | Execute shareable SQL query | `sqlite.sql.queryReadOnly` | `hoody db readonly query --db <db> --sql 'SELECT 1' --timeout 30` |
| `hoody db transactions run` |  | action | Execute SQL transaction | `sqlite.sql.runTransaction` | `hoody db transactions run --db /hoody/databases/app.db --create-db-if-missing --timeout 30 --transaction '[{"statement":"CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY)"}]'` |

### `hoody kv` (25) — Key-value store

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody kv arrays pop` |  | write | Remove from array end | `sqlite.kv.pop` | `hoody kv arrays pop <key> --db <db> --table kv_store --path .items` |
| `hoody kv arrays push` |  | write | Append to array | `sqlite.kv.push` | `hoody kv arrays push tags --db /hoody/databases/app.db --table kv_store --path .user.achievements --body '{}'` |
| `hoody kv arrays remove` |  | destructive | Remove array element | `sqlite.kv.remove` | `hoody kv arrays remove <key> --db <db> --table kv_store --path .items -y` |
| `hoody kv batch delete` |  | write | Batch delete multiple keys | `sqlite.kv.deleteMany` | `hoody kv batch delete --db <db> --table kv_store --history --keys <keys>` |
| `hoody kv batch get` |  | read | Batch get multiple keys | `sqlite.kv.getMany` | `hoody kv batch get --db /hoody/databases/app.db --table kv_store --timeout 30 --keys <keys>` |
| `hoody kv batch set` |  | write | Batch set multiple keys | `sqlite.kv.setMany` | `hoody kv batch set --db <db> --table kv_store --history --items '[{"key":"<key>"}]'` |
| `hoody kv changes list` |  | read | List the changes made to a KV table | `sqlite.kv.listChanges` | `hoody kv changes list --db <db> --table kv_store --since <cursor>` |
| `hoody kv changes stream` |  | read | Stream the changes made to a KV table live | `sqlite.kv.streamChanges` | `hoody kv changes stream --db <db> --table kv_store --since <cursor>` |
| `hoody kv decrement` |  | write | Atomic decrement | `sqlite.kv.decrement` | `hoody kv decrement <key> --db <db> --table kv_store --delta 1` |
| `hoody kv delete` |  | destructive | Delete key | `sqlite.kv.delete` | `hoody kv delete <key> --db <db> --table kv_store --history -y` |
| `hoody kv entry get` |  | read | Show a key's value with its metadata (content type, ETag, timestamps, expiry) | `sqlite.kv.getEntry` | `hoody kv entry get user:123 --db /hoody/databases/app.db --table kv_store --timeout 30` |
| `hoody kv exists` |  | read | Check if key exists | `sqlite.kv.exists` | `hoody kv exists <key> --db <db> --table kv_store --timeout 30` |
| `hoody kv get` |  | read | Get value by key | `sqlite.kv.get` | `hoody kv get user:123 --db /hoody/databases/app.db --table kv_store --at-timestamp 1698765432` |
| `hoody kv history list` |  | read | Get key operation history | `sqlite.kv.listHistory` | `hoody kv history list <key> --db <db> --table kv_store --limit 50` |
| `hoody kv increment` |  | write | Atomic increment | `sqlite.kv.increment` | `hoody kv increment counter --db /hoody/databases/app.db --table kv_store --delta 1` |
| `hoody kv list` |  | read | List keys | `sqlite.kv.list` | `hoody kv list --db /hoody/databases/app.db --table kv_store --prefix user:` |
| `hoody kv open` |  | action | Open the SQLite kit studio in your browser (key-value store: --view kvStore) |  | `hoody kv open` |
| `hoody kv rollback` |  | write | Rollback key operations | `sqlite.kv.rollback` | `hoody kv rollback <key> --db <db> --table kv_store --steps 1` |
| `hoody kv set` |  | write | Set value for key | `sqlite.kv.set` | `hoody kv set user:123 --db /hoody/databases/app.db --table kv_store --path .profile.theme --body '{}'` |
| `hoody kv snapshots get` |  | read | Get key snapshot at operation | `sqlite.kv.getSnapshot` | `hoody kv snapshots get <key> --db <db> --table kv_store --op-number 10 --timeout 30` |
| `hoody kv table rollback` |  | write | Rollback entire table | `sqlite.kv.rollbackTable` | `hoody kv table rollback --db <db> --table kv_store --to-timestamp 1750000000 --dry-run` |
| `hoody kv table snapshots compare` |  | read | Compare table snapshots | `sqlite.kv.compareTableSnapshots` | `hoody kv table snapshots compare --db <db> --table kv_store --from 1749996400 --to 1750000000 --timeout 30` |
| `hoody kv table snapshots get` |  | read | Get table snapshot at timestamp | `sqlite.kv.getTableSnapshot` | `hoody kv table snapshots get --db <db> --table kv_store --timestamp 1750000000 --limit 100` |
| `hoody kv ttl clear` |  | write | Remove a key's time to live so it never expires | `sqlite.kv.clearTtl` | `hoody kv ttl clear session:abc --db /hoody/databases/app.db --table kv_store --history` |
| `hoody kv ttl set` |  | write | Set a key's time to live | `sqlite.kv.setTtl` | `hoody kv ttl set session:abc --db /hoody/databases/app.db --table kv_store --ttl 3600 --history` |

