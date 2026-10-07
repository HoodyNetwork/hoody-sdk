> _**HTTP skill · `sqlite` namespace** · ~11,686 tokens · hoody-sdk v1.0.0-beta.16_

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

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### DB + SQL tx

`POST /api/v1/sqlite/db/create?path=<p>&init_kv=true` (`path`: bare name, `./name`, or absolute under `/hoody/databases`; `init_kv` creates the KV table) → `POST /api/v1/sqlite/db?db=<p>` with `{ "transaction": [{ "statement", "values"?|"valuesBatch"? }] }` (add `&create_db_if_missing=true` to make the create step optional) → `GET /api/v1/sqlite/history?db=<p>`.

### KV CRUD + CAS + counters

- `PUT /api/v1/sqlite/kv/{key}` — `ttl`, `if_match` (CAS), `path`, `history`.
- `GET /api/v1/sqlite/kv/{key}` — `path`, `at_timestamp`. `HEAD /api/v1/sqlite/kv/{key}` takes `db`, plus optional `table` and `timeout`; `DELETE /api/v1/sqlite/kv/{key}` takes `db`/`table`/`history` (`history`, default true, records the deleted value; `false` records only that a delete happened) plus `create_db_if_missing` (alias `auto_create`) and `timeout`.
- `POST /api/v1/sqlite/kv/{key}/incr` / `POST /api/v1/sqlite/kv/{key}/decr` / `POST /api/v1/sqlite/kv/{key}/push` / `POST /api/v1/sqlite/kv/{key}/pop` / `POST /api/v1/sqlite/kv/{key}/remove` — atomic, `path`-aware (`path` is a JSON path inside the value, such as `.user.tags`). The push body is any JSON value, appended as one element; the remove body is `{"value": <any>}` (matches by value), or pass the `index` query parameter instead. 

### Time-travel (needs `history: true`)

- `GET /api/v1/sqlite/kv/{key}/history` (default 50, max 1000); `GET /api/v1/sqlite/kv/{key}/snapshot` at `op_number`.
- `GET /api/v1/sqlite/kv/snapshot` / `GET /api/v1/sqlite/kv/diff` — Unix `timestamp` in seconds (milliseconds are rejected as "in the future") / diff.
- `POST /api/v1/sqlite/kv/{key}/rollback` last N; `POST /api/v1/sqlite/kv/rollback`: `dry_run` (query) then `confirm: 'yes'` (query — NOT body field). The body is optional: omit it for a full-table rollback, or send `{"keys":[...]}` / `{"exclude_keys":[...]}` to scope it. 

### Bulk + shareable

- `POST /api/v1/sqlite/kv/batch/set`/`POST /api/v1/sqlite/kv/batch/delete` — one SQLite transaction each. `POST /api/v1/sqlite/kv/batch/get` — one HTTP request that reads every key in one read-only SQLite transaction, with one expiry check time, so the result is one consistent snapshot.
- `GET /api/v1/sqlite/query` — GET, URL-safe base64 `sql`, read-only. `GET /api/v1/sqlite/health`/`GET /api/v1/sqlite/health/cache`.

## Quirks & gotchas

- **Bare-URL auth.** The `sqlite` kit checks no credential of its own; access through the kit URL is governed by the container proxy's permission policy. Under the default policy (no rules configured) the bare kit URL works with no extra headers and is itself the bearer; where the owner has configured auth groups, send the credential the group expects, or the proxy answers 401 or 403. → See `SKILL-HTTP.md § Kit URLs as credentials`.
- **Tx item keys: `"query"` and `statement`.** Each `transaction[i]` MUST carry exactly one of `"query"` or `statement`. A `statement` returns rows (`resultHeaders`/`resultSet`) when its SQL produces columns (a SELECT, or a write with `RETURNING`), and `rowsUpdated` otherwise. Use `"query"` for reads anyway; `valuesBatch` keeps its own restrictions. The `sql` alias maps to `statement`.
- Path resolution: bare names auto-resolve under `/hoody/databases/` (with `.db` appended if no extension). The `./name` shorthand is the same bare name (`./app` → `/hoody/databases/app.db`). Any other relative path containing `/` or `\` (e.g. `data/app.db`, `./dir/app.db`) is **rejected**, NOT auto-absoluted; only literal absolute paths (e.g. `/hoody/databases/app.db`) are treated as absolute. Absolute paths outside `/hoody/databases` are refused unless the deployment allows any absolute database path. A database filename must be a regular file: a symlink at the filename itself is rejected. Symlinked parent directories are resolved to their real path. `:memory:` databases are rejected.
- Directory mode takes an absolute directory path. Any other relative path (`sub/dir`) is refused with `directory-mode: invalid path input: path must be absolute`; a bare database name (`app`) is not treated as a directory and is opened as a database instead.
- Tx items: `statement` or alias `sql`. `POST /api/v1/sqlite/db` caps: 10k items, 100k rows/`valuesBatch`, 1M total rows. `values` and `valuesBatch` are mutually exclusive on a single item; `"query"` items cannot use `valuesBatch`.
- **GET `/query` rejects mutations**: INSERT/UPDATE/DELETE, `RETURNING` on writes, multi-statement (semicolons), any PRAGMA, VACUUM, ATTACH/DETACH — only a single statement leading with SELECT, or a WITH that contains no write keyword, is accepted. Use `POST /api/v1/sqlite/db` with `statement:` items for writes.
- **SELECT result-row cap is 10 000** (responses set `truncated: true` when hit) on both transaction `"query"` items and GET `/query`; further rows silently truncated. Paginate explicitly for larger result sets.
- **`PUT /api/v1/sqlite/kv/{key}` body is any JSON value** (object, array, string, number, boolean, null), stored verbatim. **`POST /api/v1/sqlite/kv/batch/set` differs:** each item's `value` is a string, so JSON-encode objects yourself.
- Time-travel **history is opt-out, not opt-in**: write handlers default `history: true`. Pass `history: false` to record only that the write happened, not what it wrote — but later `GET /api/v1/sqlite/kv/{key}/history` / snapshot / time-travel reads will see gaps (`has_gaps`, `gap_keys`, `candidate_truncated` fields). Per-key history reconstruction is capped at 50 000 ops.
- `create_db_if_missing`/`auto_create` aliases; mismatch → `conflicting flags`.
- `GET /api/v1/sqlite/kv` w/ `at_timestamp` → time-travel handler (different envelope; `offset` and `limit` still apply, ordered by key as in the regular listing). The history `limit`: 0→50, >1000→1000.
- `GET /api/v1/sqlite/query` `sql` accepts URL-safe base64 (`+`→`-`, `/`→`_`); both padded and unpadded forms are accepted. Inputs that do not decode to a SELECT/WITH query are treated as raw SQL. No workspace scoping — under the default proxy policy the kit URL alone is the credential, share carefully.
- `DELETE /api/v1/sqlite/db?db=<path>` removes a database file and its `-wal`, `-shm` and `-journal` companions, companions first. A missing file is `404 DATABASE_NOT_FOUND`; a directory or a non-SQLite file is `400` and stays untouched; a database other requests still hold past the deadline is `503 DATABASE_BUSY` with nothing removed. `500 DELETE_INCOMPLETE` lists `files_removed` and leaves the database file in place, so retrying the delete finishes it. A delete and a create of the same path wait for each other.
- A directory-mode KV store keeps a `.hoody_sqlite/cache.db` in each directory it uses and holds it open, so that file and its `-wal`, `-shm` and `-journal` companions can be neither created nor deleted as a database (`400 INVALID_DB_PATH`). Any other database inside a `.hoody_sqlite` directory is an ordinary database.

## Common errors

- `412 Value mismatch for CAS` (`if_match` mismatch) / `412 Key does not exist for CAS` (both CAS failures are 412).
- `400 directory-mode: invalid path input: path must be absolute` (directory mode given a relative path).
- `400 absolute database paths outside /hoody/databases are disallowed`.
- `400 invalid database name; allowed: letters, numbers, dot, dash, underscore` for `:memory:` (and any other bare name with characters outside that set). An absolute path containing `:memory:` gets `400 in-memory databases are not supported` instead.
- `400 conflicting flags: create_db_if_missing and auto_create must match`.
- `400 GET /query only accepts read-only SELECT/WITH queries; use POST /db for mutating SQL` (returned for non-SELECT input; a non-base64 `sql` value is not an error — it is interpreted as raw SQL).
- `400 Invalid JSON body` on `POST /api/v1/sqlite/kv/batch/set` — wire shape requires each `value` to be a JSON-encoded string, not an object.
- `409` with `"error": "TIME_TRAVEL_CHAIN_GAP"` (message `time-travel: chain gap straddles target timestamp`) when the history needed for the answer has an unrecorded (`history: false`) or pruned gap. Timestamp reads, `GET /api/v1/sqlite/kv/{key}/snapshot` at an `op_number`, and the rollbacks (`POST /api/v1/sqlite/kv/{key}/rollback`, `POST /api/v1/sqlite/kv/rollback`) all return it. Per-key rollback puts the detail in `error` after the code (`"TIME_TRAVEL_CHAIN_GAP: ..."`); table rollback returns `error: "TIME_TRAVEL_CHAIN_GAP"` and puts the detail in `message`.
- A failing transaction item aborts and rolls back the whole transaction by default: the response is that item's HTTP status (4xx or 5xx) with `{ "reqIdx": <index>, "error": "...", "code": "..." }`. A failure of your own SQL is classified: `400 SQL_ERROR` (syntax, unknown table or column) or `400 SQL_BIND_ERROR` (parameters that do not fit the statement), `409 SQL_CONSTRAINT` or `409 DATABASE_READONLY`, which carry SQLite's message, and `503 DATABASE_BUSY` or `503 REQUEST_TIMEOUT`, which carry the generic `internal database error` (no 5xx body carries SQLite's text). Anything else is `500 DATABASE_ERROR` with the same generic message, so do not retry it blindly. Set `"noFail": true` on an item to keep going instead: the call returns `200`, and that item's result is `{ "success": false, "error": "...", "code": "..." }` (no `reqIdx`). A `valuesBatch` item under `noFail` can instead succeed in part: rows with bad parameters are skipped and listed in `rowErrors` while `success` is `true`, so inspect `rowErrors` too. = responseItem{"]

## Related namespaces

`files` `.db` in `/hoody/databases/` · `exec` in-container · `notes` notebooks · `cron` schedule maintenance.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first, then choose a `DB` path. Bare names (`./mydb`) auto-resolve under `/hoody/databases/`; absolute paths outside that tree are refused unless the deployment allows any absolute database path (`/tmp/...` works on dev kits).

**Two SQL field names:** in a transaction item, use the `"query":"..."` key for SELECT (returns `resultSet`/`resultHeaders`) and the `"statement":"..."` key for DDL/DML (returns `rowsUpdated`, or rows when the SQL produces columns, such as a write with `RETURNING`). The `"sql"` alias maps to `"statement"`, not `"query"`.

### 1. Schema setup with idempotent multi-statement transaction

**Goal:** create a fresh database under `/hoody/databases/`, install a 3-statement schema (table + index + seed row) atomically, then read it back. Every statement is `IF NOT EXISTS` / parameterised so the whole step is replay-safe.

**Step 1 — create the db file** with the kv table pre-seeded so KV ops on the same db don't have to bootstrap separately.

```bash
KIT="https://${P}-${C}-sqlite-1.${N}.containers.hoody.com"
DB="/hoody/databases/sqlite-examples-$RANDOM.db"
curl -sf -X POST "$KIT/api/v1/sqlite/db/create?path=$DB&init_kv=true"
```

**Step 2 — install schema** in a single transaction. Returns `{results:[...]}` with one entry per statement; `rowsUpdated:1` on the final INSERT confirms the seed landed.

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/db?db=$DB" \
  -H 'Content-Type: application/json' \
  --data '{"transaction":[
    {"statement":"CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, created_at INTEGER)"},
    {"statement":"CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)"},
    {"statement":"INSERT OR IGNORE INTO users (name, email, created_at) VALUES (?, ?, ?)","values":["Ada","ada@example.com",1778191500]}
  ]}'
```

**Step 3 — read back using a SELECT under a transaction item with the `"query":"..."` key (the read key; a `statement` that produces columns also returns them).** The response carries `resultHeaders` + `resultSet` of column→value objects.

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/db?db=$DB" \
  -H 'Content-Type: application/json' \
  --data '{"transaction":[{"query":"SELECT id, name, email FROM users"}]}' | jq '.results[0].resultSet'
```

### 2. KV CRUD with TTL — short-lived session token

**Goal:** store a per-user session blob with a 60-second TTL, prove `HEAD /api/v1/sqlite/kv/{key}` flips to 404 after expiry, then explicitly delete.

**Step 1 — set with TTL.** The PUT body is the value; the kit records the request's `Content-Type` as the key's `content_type` (default `application/octet-stream`), so send JSON with `Content-Type: application/json`. Query params carry `ttl` in seconds.

```bash
curl -sf -X PUT "$KIT/api/v1/sqlite/kv/session:alex?db=$DB&ttl=60" \
  -H 'Content-Type: application/json' \
  --data '{"user_id":"d6ec...","scopes":["read","write"]}'
```

**Step 2 — `HEAD` for existence** (zero-body, cheap). Returns `200` while live, `404` once TTL elapses. A HEAD answer has no body, so the 404 names its reason in the `X-Hoody-Error-Code` header: `KEY_NOT_FOUND` or `KEY_EXPIRED`.

```bash
curl -sf -I "$KIT/api/v1/sqlite/kv/session:alex?db=$DB" -o /dev/null -w '%{http_code}\n'
```

**Step 3 — explicit delete** (don't wait for TTL). `DELETE /api/v1/sqlite/kv/{key}` is NOT idempotent: deleting a missing key returns `404 Key not found`; on a hit it returns `{success:true,deleted:true}`. Wrap with try/catch or pre-check via `GET /api/v1/sqlite/kv/{key}`.

```bash
curl -sf -X DELETE "$KIT/api/v1/sqlite/kv/session:alex?db=$DB"
```

### 3. Compare-and-swap on a versioned config blob

**Goal:** roll a config doc forward only when the current value matches what we last read. CAS uses `if_match` carrying the **literal raw value** (URL-encoded), not a hash — wrong value → `412 Value mismatch for CAS`.

**Step 1 — initial set** (no `if_match` needed; CAS only protects subsequent updates).

```bash
curl -sf -X PUT "$KIT/api/v1/sqlite/kv/config?db=$DB" \
  -H 'Content-Type: application/json' \
  --data '{"version":1,"feature_x":false}'
```

**Step 2 — read current**, then send the next version with `if_match` set to the exact JSON bytes you just read. Mismatched expected → `412`, request body is rejected.

```bash
CUR=$(curl -sf "$KIT/api/v1/sqlite/kv/config?db=$DB")
ENC=$(jq -rn --arg s "$CUR" '$s|@uri')
curl -sf -X PUT "$KIT/api/v1/sqlite/kv/config?db=$DB&if_match=$ENC" \
  -H 'Content-Type: application/json' \
  --data '{"version":2,"feature_x":true}'
```

**Step 3 — observe a conflict** by sending stale `if_match`. Expect `HTTP 412 {"error":"Value mismatch for CAS"}` — the write is rejected without modifying the stored value.

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X PUT "$KIT/api/v1/sqlite/kv/config?db=$DB&if_match=stale" \
  -H 'Content-Type: application/json' --data '{"version":99}'
# → 412
```

### 4. Atomic counter for per-user rate limiting

**Goal:** hot-path increment/decrement without a transaction round-trip. `POST /api/v1/sqlite/kv/{key}/incr` / `POST /api/v1/sqlite/kv/{key}/decr` are server-side atomic and create the key on first hit; `delta` must be a POSITIVE integer (`delta <= 0` → `400 delta must be a positive integer`) — use `POST /api/v1/sqlite/kv/{key}/decr` for the negative direction. Useful for request quotas, login-attempt counters, work-queue depth.

**Step 1 — increment by 1** on each request. First call materialises the key as `text/plain` integer.

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/kv/rate:alex:hour/incr?db=$DB&delta=1"
```

**Step 2 — bulk-add 10** in one shot (e.g. credit refund). `delta` must be a positive integer; use `POST /api/v1/sqlite/kv/{key}/decr` to go the other way — a negative `delta` is rejected with `400`.

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/kv/rate:alex:hour/incr?db=$DB&delta=10"
```

**Step 3 — burn down by 3** (e.g. consume 3 quota units). The HTTP body of the final read is the plain integer. 

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/kv/rate:alex:hour/decr?db=$DB&delta=3"
curl -sf "$KIT/api/v1/sqlite/kv/rate:alex:hour?db=$DB"   # → 8
```

### 5. JSON-path read & partial update on a nested doc

**Goal:** stash a user-prefs document, read **one** field with `path=`, then mutate **only** that field without rewriting the whole blob. The path applies to both reads and writes.

**Step 1 — seed full document.**

```bash
curl -sf -X PUT "$KIT/api/v1/sqlite/kv/profile?db=$DB" \
  -H 'Content-Type: application/json' \
  --data '{"name":"Ada","prefs":{"theme":"dark","lang":"en"}}'
```

**Step 2 — read just `prefs.theme`**: returns the leaf value (`"dark"`), not the parent object.

```bash
curl -sf "$KIT/api/v1/sqlite/kv/profile?db=$DB&path=prefs.theme"
# → "dark"
```

**Step 3 — patch one leaf**. The PUT body is the **new leaf value** (here `"light"`), not the full document. `lang` and `name` are untouched.

```bash
curl -sf -X PUT "$KIT/api/v1/sqlite/kv/profile?db=$DB&path=prefs.theme" \
  -H 'Content-Type: application/json' --data '"light"'
curl -sf "$KIT/api/v1/sqlite/kv/profile?db=$DB"
# → {"name":"Ada","prefs":{"lang":"en","theme":"light"}}
```

### 6. Time-travel — record three states of a feature flag, roll back two

**Goal:** undo the last two writes on a key without losing earlier history. Requires `history=true` on every write you want to be reversible.

**Step 1 — three sequential states** with history recording.

```bash
for v in '{"chat":false,"voice":false}' '{"chat":true,"voice":false}' '{"chat":true,"voice":true}'; do
  curl -sf -X PUT "$KIT/api/v1/sqlite/kv/feature-flags?db=$DB&history=true" \
    -H 'Content-Type: application/json' --data "$v"
done
```

**Step 2 — inspect history** (`GET /api/v1/sqlite/kv/{key}/history` returns newest first; each entry has `op_number` and `operation` — `operation.raw_old_value` / `operation.raw_new_value` carry the value bytes in base64 for every content type, JSON included).

```bash
curl -sf "$KIT/api/v1/sqlite/kv/feature-flags/history?db=$DB&limit=10" | jq '.operations | map({op_number, op: .operation.op})'
```

**Step 3 — roll back the last two ops** so `feature-flags` returns to `{chat:false,voice:false}`. Only the chosen key is affected.

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/kv/feature-flags/rollback?db=$DB&steps=2"
curl -sf "$KIT/api/v1/sqlite/kv/feature-flags?db=$DB"
# → {"chat":false,"voice":false}
```

### 7. Snapshot at op-number, then diff against current

**Goal:** prove what a key looked like right after creation, then summarise every key that changed in a window. Uses `GET /api/v1/sqlite/kv/{key}/snapshot` (per-key, by `op_number`) and `GET /api/v1/sqlite/kv/diff` (whole table, by Unix timestamps).

**Step 1 — fetch the per-key snapshot at `op_number=1`** (= the first state).

```bash
curl -sf "$KIT/api/v1/sqlite/kv/feature-flags/snapshot?db=$DB&op_number=1"
# → {"value":{"chat":false,"voice":false},"op_number":1,"content_type":"application/json","success":true}
```

**Step 2 — record `from` and `to` timestamps** around a write window, then mutate so there is something to diff.

```bash
FROM=$(date +%s); sleep 1
curl -sf -X PUT "$KIT/api/v1/sqlite/kv/cmp-test?db=$DB&history=true" \
  -H 'Content-Type: application/json' --data '{"v":1}'
sleep 1; TO=$(date +%s)
```

**Step 3 — diff the table** between the two timestamps. `stats.created/modified/deleted` summarises; `changes[]` enumerates per-key.

```bash
curl -sf "$KIT/api/v1/sqlite/kv/diff?db=$DB&from=$FROM&to=$TO" | jq '.stats, .changes'
```

### 8. Bulk batch — set / get / delete in single round-trips

**Goal:** seed three KV pairs, fetch them in one request (with one missing key to see the null payload), then drop them all. `POST /api/v1/sqlite/kv/batch/set` and `POST /api/v1/sqlite/kv/batch/delete` each run in one SQLite transaction; `POST /api/v1/sqlite/kv/batch/get` reads every key in one read transaction, so the result is one consistent snapshot. Cap is 100 items per batch.

**Important wire-format detail:** in `POST /api/v1/sqlite/kv/batch/set`, every `value` must be a **string** (a JSON-encoded scalar/object). Sending a raw object → `400 Invalid JSON body`.

**Step 1 — bulk set with TTL on one item.**

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/kv/batch/set?db=$DB" \
  -H 'Content-Type: application/json' \
  --data '{"items":[
    {"key":"u:1","value":"{\"name\":\"alice\"}","content_type":"application/json"},
    {"key":"u:2","value":"{\"name\":\"bob\"}","content_type":"application/json"},
    {"key":"u:3","value":"{\"name\":\"carol\"}","content_type":"application/json","ttl":3600}
  ]}'
```

**Step 2 — bulk get** (missing keys come back as `null`; present ones as `{content_type, value}` when `content_type` is JSON, otherwise as `{content_type, value_base64}`). A `POST /api/v1/sqlite/kv/batch/set` item written without `content_type` is stored as `application/octet-stream` and so comes back base64-encoded; set `content_type: application/json`, as step 1 does, to get parsed JSON back.

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/kv/batch/get?db=$DB" \
  -H 'Content-Type: application/json' \
  --data '{"keys":["u:1","u:2","u:3","u:404"]}'
```

**Step 3 — bulk delete.** Returns `{deleted: <count>, success: true}`. Missing keys silently no-op.

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/kv/batch/delete?db=$DB" \
  -H 'Content-Type: application/json' --data '{"keys":["u:1","u:2","u:3"]}'
```

### 9. Shareable read-only SQL via base64-encoded GET

**Goal:** build a reusable GET URL that runs a SELECT. The `/query` route itself rejects writes, but the URL is not a restricted credential: it carries the kit URL, which also reaches every other route of this kit (including mutating `POST /db`) and has no expiry of its own. Share it only where you would share the kit URL itself. `sql` is **URL-safe base64** (`+`→`-`, `/`→`_`); padding is optional — both padded and unpadded forms are accepted.

**Step 1 — encode** the query.

```bash
SQL='SELECT id, name, email FROM users LIMIT 10'
SQL_B64=$(printf '%s' "$SQL" | base64 -w0 | tr '+/' '-_')   # URL-safe base64; padding optional
echo "$SQL_B64"
```

**Step 2 — issue the GET.** Response includes `columns`, `resultSet`, `rowCount`, `truncated`. A non-base64 `sql` value is not an error — it is interpreted as raw SQL; a non-SELECT query → `400 GET /query only accepts read-only SELECT/WITH queries; use POST /db for mutating SQL`.

```bash
curl -sfG "$KIT/api/v1/sqlite/query" \
  --data-urlencode "db=$DB" \
  --data-urlencode "sql=$SQL_B64"
```

**Step 3 — paste-able URL** (e.g. dashboard link). Under the default proxy policy the kit URL itself is the auth grant — guard who you share it with. Where the owner has configured auth groups, the link also needs the credential the proxy expects, and the query URL grants nothing beyond that policy.

```bash
echo "$KIT/api/v1/sqlite/query?db=$(printf '%s' "$DB" | jq -sRr @uri)&sql=$SQL_B64"
```

### 10. Bulk insert via `valuesBatch` — one statement, many rows

**Goal:** load 3 rows (or 100k) with one transaction item that repeats a single SQL statement once per parameter row, instead of one tx item per row. Without `noFail: true` the rows of an item commit or fail together. With `noFail: true`, a row whose parameters do not parse or do not fit the placeholders is skipped and the valid rows still commit: the item answers `success: true` with a `rowErrors` list, so check it. `valuesBatch` is an array of value-arrays positionally aligned with the `?` placeholders. Caps: 100k rows per `valuesBatch`, 1M rows per tx.

**Step 1 — bulk insert.** Response carries `rowsUpdatedBatch:[1,1,1]` — one entry per row.

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/db?db=$DB" \
  -H 'Content-Type: application/json' \
  --data '{"transaction":[{
    "statement":"INSERT INTO users (name, email, created_at) VALUES (?, ?, ?)",
    "valuesBatch":[
      ["Bob","bob@example.com",1778000000],
      ["Carol","carol@example.com",1778000100],
      ["Dan","dan@example.com",1778000200]
    ]
  }]}'
```

**Step 2 — verify count** by sending a SELECT inside a transaction item with the `"query":"..."` key (NOT the `"statement":"..."` key).

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/db?db=$DB" \
  -H 'Content-Type: application/json' \
  --data '{"transaction":[{"query":"SELECT COUNT(*) AS n FROM users"}]}' | jq '.results[0].resultSet'
```

**Step 3 — clean up** (delete the throwaway database through the kit, which also removes its `-wal`, `-shm` and `-journal` files, or leave it in place).

```bash
curl -sf -X DELETE "$KIT/api/v1/sqlite/db?db=$(jq -rn --arg s "$DB" '$s|@uri')"
```

## Reference

### `databases` (4) — Database file lifecycle: create a database, list the databases in a directory, run maintenance

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/sqlite/db/create` | Create new SQLite database | `?path*` `?init_kv` `?kv_table` `?timeout` |
| `DELETE /api/v1/sqlite/db` | Delete SQLite database | `?db*` `?timeout` |
| `GET /api/v1/sqlite/db/list` | List databases in a directory | `?dir` `?timeout` |
| `POST /api/v1/sqlite/maintenance` | Run a database maintenance operation | `?db*` `?timeout` `body*:sqlite_main.maintenanceRequest` |

**Param notes:**

- `path` / `db` — Database path (absolute path, bare name, or ./name shorthand resolved to /hoody/databases/*.db)
- `init_kv` — Initialize KV store tables
- `kv_table` — Custom KV table name
- `timeout` — Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it).
- `dir` — Absolute path of the directory to list

### `history` (4) — Query execution history and statistics

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/sqlite/history` | Clear query history | `?db*` `?timeout` |
| `DELETE /api/v1/sqlite/history/{index}` | Delete history entry | `?db*` `?timeout` |
| `GET /api/v1/sqlite/history/stats` | Get history statistics | `?db*` `?timeout` |
| `GET /api/v1/sqlite/history` | Get query history | `?db*` `?limit` `?offset` `?timeout` |

**Param notes:**

- `db` — Database file path
- `timeout` — Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it).
- `limit` — Maximum number of entries to return (0 means the default; capped at 1000)
- `offset` — Number of newest entries to skip

### `kit` (2) — Liveness and observability snapshots

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/sqlite/health/cache` | Cache health snapshot |  |
| `GET /api/v1/sqlite/health` | Health check | `?verbose` |

**Param notes:**

- `verbose` — Return the full snapshot. Without it the response carries the status field alone; with it, service identity, the features list, process memory and file-descriptor counters, and the cache and counter snapshots are included

### `kv` (24) — Key-Value store operations with TTL and namespaces

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/sqlite/kv/{key}/persist` | Remove a key's TTL | `?db*` `?table` `?history` `H:If-Match` `H:Idempotency-Key` `?create_db_if_missing` `?timeout` |
| `GET /api/v1/sqlite/kv/diff` | Compare table snapshots | `?db*` `?table` `?from*` `?to*` `?keys` `?timeout` |
| `POST /api/v1/sqlite/kv/{key}/decr` | Atomic decrement | `?db*` `?table` `?delta` `?path` `?history` `H:If-Match` `H:Idempotency-Key` `?create_db_if_missing` `?timeout` |
| `DELETE /api/v1/sqlite/kv/{key}` | Delete key | `?db*` `?table` `?history` `H:If-Match` `H:Idempotency-Key` `?create_db_if_missing` `?timeout` |
| `POST /api/v1/sqlite/kv/batch/delete` | Batch delete multiple keys | `?db*` `?table` `?history` `H:Idempotency-Key` `?create_db_if_missing` `?timeout` `body*:sqlite_main.kvBatchDeleteRequest` |
| `HEAD /api/v1/sqlite/kv/{key}` | Check if key exists | `?db*` `?table` `H:If-None-Match` `?timeout` |
| `GET /api/v1/sqlite/kv/{key}` | Get value by key | `?db*` `?table` `?path` `?at_timestamp` `?rebuild` `H:If-None-Match` `?timeout` |
| `GET /api/v1/sqlite/kv/{key}/entry` | Get a key's entry | `?db*` `?table` `H:If-None-Match` `?timeout` |
| `POST /api/v1/sqlite/kv/batch/get` | Batch get multiple keys | `?db*` `?table` `?timeout` `body*:sqlite_main.kvBatchGetRequest` |
| `GET /api/v1/sqlite/kv/{key}/snapshot` | Get key snapshot at operation | `?db*` `?table` `?op_number*` `?timeout` |
| `GET /api/v1/sqlite/kv/snapshot` | Get table snapshot at timestamp | `?db*` `?table` `?timestamp*` `?limit` `?prefix` `?timeout` |
| `POST /api/v1/sqlite/kv/{key}/incr` | Atomic increment | `?db*` `?table` `?delta` `?path` `?history` `H:If-Match` `H:Idempotency-Key` `?create_db_if_missing` `?timeout` |
| `GET /api/v1/sqlite/kv` | List keys | `?db*` `?table` `?prefix` `?limit` `?offset` `?after` `?at_timestamp` `?timeout` |
| `GET /api/v1/sqlite/changes` | List the changes of a KV table | `?db*` `?table` `?since` `?prefix` `?limit` `?wait` `?include_values` `?timeout` |
| `GET /api/v1/sqlite/kv/{key}/history` | Get key operation history | `?db*` `?table` `?limit` `?timeout` |
| `POST /api/v1/sqlite/kv/{key}/pop` | Remove from array end | `?db*` `?table` `?path` `?history` `H:If-Match` `H:Idempotency-Key` `?create_db_if_missing` `?timeout` |
| `POST /api/v1/sqlite/kv/{key}/push` | Append to array | `?db*` `?table` `?path` `?history` `H:If-Match` `H:Idempotency-Key` `?create_db_if_missing` `?timeout` `body*` |
| `POST /api/v1/sqlite/kv/{key}/remove` | Remove array element | `?db*` `?table` `?path` `?index` `?history` `H:If-Match` `H:Idempotency-Key` `?create_db_if_missing` `?timeout` `body:sqlite_main.kvRemoveRequest` |
| `POST /api/v1/sqlite/kv/{key}/rollback` | Rollback key operations | `?db*` `?table` `?steps` `H:Idempotency-Key` `?create_db_if_missing` `?timeout` |
| `POST /api/v1/sqlite/kv/rollback` | Rollback entire table | `?db*` `?table` `?to_timestamp*` `?dry_run` `?confirm` `H:Idempotency-Key` `?create_db_if_missing` `?timeout` `body:sqlite_main.kvTableRollbackRequest` |
| `PUT /api/v1/sqlite/kv/{key}` | Set value for key | `?db*` `?table` `?path` `?ttl` `?if_match` `?history` `?create_db_if_missing` `H:If-Match` `H:If-None-Match` `H:Idempotency-Key` `?timeout` `body*:application/json,application/octet-stream,text/plain` |
| `POST /api/v1/sqlite/kv/batch/set` | Batch set multiple keys | `?db*` `?table` `?history` `H:Idempotency-Key` `?create_db_if_missing` `?timeout` `body*:sqlite_main.kvBatchSetRequest` |
| `POST /api/v1/sqlite/kv/{key}/expire` | Set a key's TTL | `?db*` `?table` `?ttl*` `?history` `H:If-Match` `H:Idempotency-Key` `?create_db_if_missing` `?timeout` |
| `GET /api/v1/sqlite/changes/stream` | Stream the changes of a KV table | `?db*` `?table` `?since` `?prefix` `?include_values` `H:Last-Event-ID` |

**Param notes:**

- `key` — Key name (supports / for hierarchical keys) _(on `POST /api/v1/sqlite/kv/{key}/persist`, `GET /api/v1/sqlite/kv/{key}`, `GET /api/v1/sqlite/kv/{key}/entry` +1 more)_
- `db` — Database file path _(on `POST /api/v1/sqlite/kv/{key}/persist`, `GET /api/v1/sqlite/kv/diff`, `POST /api/v1/sqlite/kv/{key}/decr` +14 more)_
- `table` — Custom table name _(on `POST /api/v1/sqlite/kv/{key}/persist`, `GET /api/v1/sqlite/kv/diff`, `POST /api/v1/sqlite/kv/{key}/decr` +19 more)_
- `history` — Store this write's value in history; false records only that the write happened, not what it wrote
- `If-Match` — Applies the write only if the key's current ETag matches.
- `Idempotency-Key` — Replays the stored response for a repeat of the same key (24 h).
- `create_db_if_missing` — Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent.
- `timeout` — Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it).
- `from` — Starting timestamp (Unix seconds), at least 1 and earlier than to
- `to` — Ending timestamp (Unix seconds), later than from and not in the future
- `keys` — Comma-separated list of keys to compare (optional). When given, exactly these keys are reconstructed (duplicates collapsed)
- `key` — Key name _(on `POST /api/v1/sqlite/kv/{key}/decr`, `DELETE /api/v1/sqlite/kv/{key}`, `HEAD /api/v1/sqlite/kv/{key}` +8 more)_
- `delta` — Amount to decrement: a positive integer; the operation sets the direction _(on `POST /api/v1/sqlite/kv/{key}/decr`)_
- `path` — JSON path to nested numeric value _(on `POST /api/v1/sqlite/kv/{key}/decr`, `POST /api/v1/sqlite/kv/{key}/incr`)_
- `db` — Database file path or directory _(on `DELETE /api/v1/sqlite/kv/{key}`, `HEAD /api/v1/sqlite/kv/{key}`, `GET /api/v1/sqlite/kv/{key}` +2 more)_
- `If-None-Match` — Answers 304 while the key's current ETag matches. _(on `HEAD /api/v1/sqlite/kv/{key}`, `GET /api/v1/sqlite/kv/{key}`, `GET /api/v1/sqlite/kv/{key}/entry`)_
- `path` — JSON path for nested value extraction. The extracted value is returned as JSON with an X-JSON-Path header; a path that does not exist in the value answers 404. Ignored with at_timestamp. _(on `GET /api/v1/sqlite/kv/{key}`)_
- `at_timestamp` — Unix timestamp. Returns the value the key held at that moment, in a JSON envelope instead of the current value. The value is reconstructed from the key's recorded history. When no recorded write establishes it, the current value is returned if it was already in place at that moment: with op_number 0 when the key has recorded history, and without op_number or op_timestamp when it has none (for example, a key written through SQL). A write made with history=false that leaves the value at that moment unknown answers 409 TIME_TRAVEL_CHAIN_GAP. 0 or omitted reads the current value; a time in the future is rejected with 400. A directory (directory mode) is rejected with 400 in this mode. _(on `GET /api/v1/sqlite/kv/{key}`)_
- `rebuild` — Directory mode only: clear the directory's cached file information (this directory only, not its subdirectories), then read the key. Ignored with at_timestamp.
- `op_number` — Operation number to reconstruct from
- `timestamp` — Unix timestamp (seconds) to reconstruct, at least 1 and not in the future
- `limit` — Maximum number of keys to return. Values above 1000 are treated as 1000; 0 returns every key found. Either way key discovery is bounded: when it stops early, candidate_truncated is true and keys may be missing; narrow with prefix _(on `GET /api/v1/sqlite/kv/snapshot`)_
- `prefix` — Filter keys by prefix _(on `GET /api/v1/sqlite/kv/snapshot`, `GET /api/v1/sqlite/kv`)_
- `delta` — Amount to increment: a positive integer; the operation sets the direction _(on `POST /api/v1/sqlite/kv/{key}/incr`)_
- `limit` — Maximum number of results. Values above 1000 are treated as 1000; a negative value is rejected with 400. 0 returns an empty page, except with at_timestamp, where it means no limit _(on `GET /api/v1/sqlite/kv`)_
- `offset` — Skip N results for pagination. Honoured for both the regular listing and the at_timestamp listing; results are ordered by key in both cases. A negative value is rejected with 400. Keys written or deleted between two requests shift later pages; use after to page without skipping or repeating keys
- `after` — Cursor: list only keys that sort after this one (byte order, exclusive). Pass the previous page's next_after; a key written or deleted elsewhere between two pages never makes another key be skipped or repeated. The value is used as given, so any string works, including a key that no longer exists. Combined with offset greater than 0 or with at_timestamp it is rejected with 400
- `at_timestamp` — Unix timestamp for time-travel LIST: returns the keys as they stood at that moment, in a different response envelope. 0 or omitted lists the current keys; a time in the future is rejected with 400. A directory (directory mode) is rejected with 400 in this mode _(on `GET /api/v1/sqlite/kv`)_
- `db` — Database path _(on `GET /api/v1/sqlite/changes`, `GET /api/v1/sqlite/changes/stream`)_
- `table` — KV table name (default: kv_store) _(on `GET /api/v1/sqlite/changes`, `GET /api/v1/sqlite/changes/stream`)_
- `since` — Cursor to continue after (next_cursor of the previous page, or the cursor of an event). Omit to get the current cursor. _(on `GET /api/v1/sqlite/changes`)_
- `prefix` — Only keys starting with this prefix _(on `GET /api/v1/sqlite/changes`, `GET /api/v1/sqlite/changes/stream`)_
- `limit` — Maximum events in the page (1-1000, default 100) _(on `GET /api/v1/sqlite/changes`)_
- `wait` — Seconds to wait for the first event when there is none yet (0-60, default 0)
- `include_values` — Attach the value to set/ttl events when it is still current, not expired and at most 256 KiB (otherwise value_omitted says why) _(on `GET /api/v1/sqlite/changes`)_
- `limit` — Maximum number of operations to return (0 → default 50, clamped to maximum 1000) _(on `GET /api/v1/sqlite/kv/{key}/history`)_
- `path` — JSON path to nested array _(on `POST /api/v1/sqlite/kv/{key}/pop`, `POST /api/v1/sqlite/kv/{key}/push`, `POST /api/v1/sqlite/kv/{key}/remove`)_
- `index` — Array index to remove. Send this or a body value; with neither the request is a 400
- `steps` — Number of operations to undo, 1 to 50000
- `to_timestamp` — Target timestamp (Unix seconds), at least 1 and not in the future
- `dry_run` — Preview changes without applying
- `confirm` — Must be 'yes' to execute actual rollback
- `path` — JSON path for nested value update _(on `PUT /api/v1/sqlite/kv/{key}`)_
- `ttl` — Time-to-live in seconds (SQLite mode only; a non-zero ttl against a directory-mode store is rejected with 400) _(on `PUT /api/v1/sqlite/kv/{key}`)_
- `if_match` — Current value for compare-and-swap (SQLite mode only; rejected with 400 against a directory-mode store)
- `If-None-Match` — Set to * to write only if the key does not exist yet. _(on `PUT /api/v1/sqlite/kv/{key}`)_
- `ttl` — Seconds from now until the key expires; at least 1 _(on `POST /api/v1/sqlite/kv/{key}/expire`)_
- `since` — Cursor to continue after; Last-Event-ID wins when both are sent _(on `GET /api/v1/sqlite/changes/stream`)_
- `include_values` — Attach small current values to set/ttl events (see GET /changes) _(on `GET /api/v1/sqlite/changes/stream`)_
- `Last-Event-ID` — Resumes the stream after this event id.

**Body shapes:**

- `POST /api/v1/sqlite/kv/{key}/push` body — `any|null` — The value to append: one JSON value of any type (object, array, string, number, boolean or null). An array is appended as a single element, not spread. A body that is not valid JSON is refused with 400.
- `PUT /api/v1/sqlite/kv/{key}` body — `any|null` — … With Content-Type application/json (or any +json type) the body must be one complete JSON document, serialised exactly once: an object, array, number, boolean, null, or a string sent QUOTED ("hello", not hello). A string like "123" must be sent quoted too, or it is stored and read back as the number 123. A body that is not valid JSON is refused with 400 INVALID_JSON_VALUE. …

### `sql` (2) — Shareable read-only queries executed from a GET URL

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/sqlite/query` | Execute shareable SQL query | `?db*` `?sql*` `?timeout` |
| `POST /api/v1/sqlite/db` | Execute SQL transaction | `?db*` `?create_db_if_missing` `?timeout` `body*:sqlite_main.request` |

**Param notes:**

- `db` — Database file path _(on `GET /api/v1/sqlite/query`)_
- `sql` — The SQL query, base64url-encoded (with or without = padding). Plain SQL text is also accepted
- `timeout` — Deadline for this request, in whole seconds, clamped to [1, 300]. Once it passes, a long operation stops at its next checkpoint rather than being cut off mid-step; a step already running, such as a filesystem scan or a wait for another writer, finishes first. A request that has not finished by then answers 503 REQUEST_TIMEOUT, except that a write which has already committed still returns its success. A value that is not a whole number is ignored and the default applies. This is a server-side deadline, not a client transport timeout. Omitted, the server default applies (30 seconds unless the deployment overrides it).
- `db` — Database path (absolute path, bare name, or ./name shorthand resolved to /hoody/databases/*.db) _(on `POST /api/v1/sqlite/db`)_
- `create_db_if_missing` — Create database file if it is missing. The legacy alias `auto_create` is still accepted and means the same thing; the two must agree when both are sent.


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
