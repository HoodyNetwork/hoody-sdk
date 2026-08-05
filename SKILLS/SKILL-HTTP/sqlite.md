> _**HTTP skill · `sqlite` namespace** · ~6,866 tokens · hoody-sdk v1.0.0-beta.11_

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

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### DB + SQL tx

`POST /api/v1/sqlite/db/create` `path` (bare/`./name`/abs under `/hoody/databases`), `init_kv: true` for KV table → `POST /api/v1/sqlite/db` `{ transaction: [{ statement, values?|valuesBatch? }] }` (`create_db_if_missing: true` skips create) → `GET /api/v1/sqlite/history`.

### KV CRUD + CAS + counters

- `PUT /api/v1/sqlite/kv/{key}` — `ttl`, `if_match` (CAS), `path`, `history`.
- `GET /api/v1/sqlite/kv/{key}` — `path`, `at_timestamp`. `HEAD /api/v1/sqlite/kv/{key}` takes only `db`/`table`; `DELETE /api/v1/sqlite/kv/{key}` takes only `db`/`table`/`history` (`history` keeps the tombstone).
- `POST /api/v1/sqlite/kv/{key}/incr`/`POST /api/v1/sqlite/kv/{key}/decr`/`POST /api/v1/sqlite/kv/{key}/push`/`pop`/`POST /api/v1/sqlite/kv/{key}/remove` — atomic, `path`-aware.

### Time-travel (needs `history: true`)

- `GET /api/v1/sqlite/kv/{key}/history` (default 50, max 1000); `GET /api/v1/sqlite/kv/{key}/snapshot` at `op_number`.
- `GET /api/v1/sqlite/kv/snapshot` / `GET /api/v1/sqlite/kv/diff` — Unix `timestamp` / diff.
- `POST /api/v1/sqlite/kv/{key}/rollback` last N; `POST /api/v1/sqlite/kv/rollback`: `dry_run` (query) then `confirm: 'yes'` (query — NOT body field). Body is **required** by SDK/CLI; pass `{}` for full-table rollback or `{"keys":[...]}` / `{"exclude_keys":[...]}` to scope.

### Bulk + shareable

- `POST /api/v1/sqlite/kv/batch/set`/`POST /api/v1/sqlite/kv/batch/get`/`POST /api/v1/sqlite/kv/batch/delete` — single SQLite tx.
- `GET /api/v1/sqlite/query` — GET, URL-safe base64 `sql`, read-only. `GET /api/v1/sqlite/health`/`GET /api/v1/sqlite/health/cache`.

## Quirks & gotchas

- **Bare-URL auth (no claim/token headers).** Like every kit (including `agent`), the `sqlite` kit accepts the bare per-container kit URL — no `X-Hoody-Container-Claim` or `X-Hoody-Token` headers required. The capability URL itself is the bearer.
- **Tx item key matters: `"query"` vs `statement` are NOT interchangeable.** Each `transaction[i]` MUST carry exactly one of `"query"` (returns rows) or `statement` (rows-affected only). If you put a SELECT under `statement`, you silently get back `rowsUpdated: 0` and no data. The `sql` alias maps to `statement`.
- Path resolution: bare names auto-resolve under `/hoody/databases/` (with `.db` appended if no extension). Relative paths containing `/` or `\` are **rejected**, NOT auto-absoluted; only literal absolute paths (e.g. `/hoody/databases/app.db`) are treated as absolute. Outside `/hoody/databases` needs `--allow-any-absolute-db-path`. Symlinks followed; outward targets rejected. `:memory:` databases are rejected.
- Directory mode requires absolute db (`directory-mode: invalid path input: path must be absolute`).
- Tx items: `statement` or alias `sql`. `POST /api/v1/sqlite/db` caps: 10k items, 100k rows/`valuesBatch`, 1M total rows. `values` and `valuesBatch` are mutually exclusive on a single item; `"query"` items cannot use `valuesBatch`.
- **GET `/query` rejects mutations**: INSERT/UPDATE/DELETE, `RETURNING` on writes, multi-statement (semicolons), PRAGMA writes, VACUUM, ATTACH/DETACH. Use `POST /api/v1/sqlite/db` with `statement:` items for writes.
- **SELECT result-row cap is 10 000** (responses set `truncated: true` when hit) on both transaction `"query"` items and GET `/query`; further rows silently truncated. Paginate explicitly for larger result sets.
- **`PUT /api/v1/sqlite/kv/{key}` body is a JSON-encoded STRING**, not an object. Generated SDK type is `string`; encode objects yourself before sending (e.g. JSON-stringify the value). Same for the `POST /api/v1/sqlite/kv/batch/set` per-item `value`.
- Time-travel **history is opt-out, not opt-in**: write handlers default `history: true`. Pass `history: false` to skip recording — but later `GET /api/v1/sqlite/kv/{key}/history` / snapshot / time-travel reads will see gaps (`has_gaps`, `gap_keys`, `candidate_truncated` fields). Per-key history reconstruction is capped at 50 000 ops.
- `create_db_if_missing`/`auto_create` aliases; mismatch → `conflicting flags`.
- `GET /api/v1/sqlite/kv` w/ `at_timestamp` → time-travel handler (different envelope, ignores `offset`). `getHistory.limit`: 0→50, >1000→1000.
- `GET /api/v1/sqlite/query` `sql` accepts URL-safe base64 (`+`→`-`, `/`→`_`); both padded and unpadded forms are accepted. Inputs that do not decode to a SELECT/WITH query are treated as raw SQL. No workspace scoping — the kit URL alone is the credential, share carefully.
- CLI: `hoody db` (aliases `sql`, `sqlite`); KV under `hoody kv`.

## Common errors

- `412 Value mismatch for CAS` (`if_match` mismatch) / `412 Key does not exist for CAS` (both CAS failures are 412).
- `400 directory-mode: invalid path input: path must be absolute`.
- `400 absolute database paths outside /hoody/databases are disallowed`.
- `400 in-memory databases are not supported`.
- `400 conflicting flags: create_db_if_missing and auto_create must match`.
- `400 GET /query only accepts read-only SELECT/WITH queries; use POST /db for mutating SQL` (returned for non-SELECT input; a non-base64 `sql` value is not an error — it is interpreted as raw SQL).
- `400 Invalid JSON body` on `POST /api/v1/sqlite/kv/batch/set` — wire shape requires each `value` to be a JSON-encoded string, not an object.
- `409 time-travel chain gap` when the requested timestamp falls inside a `history: false` window.
- Per-statement tx errors → `{ reqIdx, error }`; HTTP 200 if tx parsed.

## Related namespaces

`files` `.db` in `/hoody/databases/` · `exec` in-container · `notes` notebooks · `cron` schedule maintenance.

## Examples

Every step in every example was live-tested against a real `sqlite-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first, then choose a `DB` path. Bare names (`./mydb`) auto-resolve under `/hoody/databases/`; absolute paths outside that tree need the kit's `--allow-any-absolute-db-path` flag (`/tmp/...` works on dev kits).

**Two SQL field names that are NOT interchangeable:** in a transaction item, the `"query":"..."` key is for SELECT (returns `resultSet`/`resultHeaders`) and the `"statement":"..."` key is for DDL/DML (returns `rowsUpdated` only). Putting a SELECT under `"statement"` runs it but throws away rows — `rowsUpdated:0` even when matches exist. The `"sql"` alias maps to `"statement"`, not `"query"`.

### 1. Schema setup with idempotent multi-statement transaction

**Goal:** create a fresh database under `/tmp/`, install a 3-statement schema (table + index + seed row) atomically, then read it back. Every statement is `IF NOT EXISTS` / parameterised so the whole step is replay-safe.

**Step 1 — create the db file** with the kv table pre-seeded so KV ops on the same db don't have to bootstrap separately.

```bash
KIT="https://${P}-${C}-sqlite-1.${N}.containers.hoody.com"
DB="/tmp/sqlite-examples-$RANDOM.db"
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
**Step 3 — read back using a SELECT under a transaction item with the `"query":"..."` key (NOT the `"statement":"..."` key — `statement` returns `rowsUpdated` only and silently drops rows).** The response carries `resultHeaders` + `resultSet` of column→value objects.

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/db?db=$DB" \
  -H 'Content-Type: application/json' \
  --data '{"transaction":[{"query":"SELECT id, name, email FROM users"}]}' | jq '.results[0].resultSet'
```
### 2. KV CRUD with TTL — short-lived session token

**Goal:** store a per-user session blob with a 60-second TTL, prove `HEAD /api/v1/sqlite/kv/{key}` flips to 404 after expiry, then explicitly delete.

**Step 1 — set with TTL.** The PUT body is the raw JSON value (string, object, array — kit infers `content_type`); query params carry `ttl` in seconds.

```bash
curl -sf -X PUT "$KIT/api/v1/sqlite/kv/session:alex?db=$DB&ttl=60" \
  -H 'Content-Type: application/json' \
  --data '{"user_id":"d6ec...","scopes":["read","write"]}'
```
**Step 2 — `HEAD` for existence** (zero-body, cheap). Returns `200` while live, `404` once TTL elapses.

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

**Goal:** hot-path increment/decrement without a transaction round-trip. `POST /api/v1/sqlite/kv/{key}/incr`/`POST /api/v1/sqlite/kv/{key}/decr` are server-side atomic and create the key on first hit; `delta` must be a POSITIVE integer (`delta <= 0` → `400 delta must be a positive integer`) — use `POST /api/v1/sqlite/kv/{key}/decr` for the negative direction. Useful for request quotas, login-attempt counters, work-queue depth.

**Step 1 — increment by 1** on each request. First call materialises the key as `text/plain` integer.

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/kv/rate:alex:hour/incr?db=$DB&delta=1"
```
**Step 2 — bulk-add 10** in one shot (e.g. credit refund). `delta` must be a positive integer; use `POST /api/v1/sqlite/kv/{key}/decr` to go the other way — a negative `delta` is rejected with `400`.

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/kv/rate:alex:hour/incr?db=$DB&delta=10"
```
**Step 3 — burn down by 3** (e.g. consume 3 quota units). Final value is plain text — `GET /api/v1/sqlite/kv/{key}` returns the integer body directly, not wrapped.

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
**Step 2 — inspect history** (`GET /api/v1/sqlite/kv/{key}/history` returns newest first; each entry has `op_number` and `operation` — `operation.raw_old_value` / `operation.raw_new_value` are base64 and appear only for non-JSON content types).

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

**Goal:** seed three KV pairs, fetch them in one request (with one missing key to see the null payload), then drop them all. Each call wraps in a single SQLite tx; cap is 100 items per batch.

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
**Step 2 — bulk get** (missing keys come back as `null`, present ones as `{value, content_type}`).

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

**Goal:** mint a one-shot URL that runs a SELECT — safe to embed in dashboards / logs because the kit enforces read-only. `sql` is **URL-safe base64** (`+`→`-`, `/`→`_`); padding is optional — both padded and unpadded forms are accepted (the kit falls back to `base64.RawURLEncoding`).

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
**Step 3 — paste-able URL** (e.g. dashboard link). The kit URL itself is the auth grant — guard who you share it with.

```bash
echo "$KIT/api/v1/sqlite/query?db=$(printf '%s' "$DB" | jq -sRr @uri)&sql=$SQL_B64"
```
### 10. Bulk insert via `valuesBatch` — one statement, many rows

**Goal:** load 3 rows (or 100k) through one prepared statement instead of one tx item per row. `valuesBatch` is an array of value-arrays positionally aligned with the `?` placeholders. Caps: 100k rows per `valuesBatch`, 1M rows per tx.

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
**Step 3 — clean up** (drop the throwaway db file via `files`, or just leave under `/tmp/` for the next reboot to reclaim).

```bash
# Via files kit:
FKIT="https://${P}-${C}-files-1.${N}.containers.hoody.com"
curl -sf -X DELETE "$FKIT/api/v1/files/${DB#/}"   # strip leading / for route param
```

## Reference

### `database` (2) — Database

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/sqlite/db/create` | Create new SQLite database | `?path*` `?init_kv` `?kv_table` |
| `POST /api/v1/sqlite/db` | Execute SQL transaction | `?db*` `?create_db_if_missing` `body*:sqlite_main.request` |

**Param notes:**

- `path` / `db` — Database path (absolute path, bare name, or./name shorthand resolved to /hoody/databases/*.db)
- `init_kv` — Initialize KV store tables
- `kv_table` — Custom KV table name
- `create_db_if_missing` — Create database file if it is missing

### `docs` (2) — API documentation

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/sqlite/openapi.json` | Get OpenAPI specification (JSON redirect) |  |
| `GET /api/v1/sqlite/openapi.yaml` | Get OpenAPI specification (YAML) |  |

### `health` (2) — Health

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/sqlite/health` | Health check |  |
| `GET /api/v1/sqlite/health/cache` | Cache health snapshot |  |

### `history` (4) — Query execution history and statistics

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/sqlite/history` | Clear query history | `?db*` |
| `DELETE /api/v1/sqlite/history/{index}` | Delete history entry | `?db*` |
| `GET /api/v1/sqlite/history/stats` | Get history statistics | `?db*` |
| `GET /api/v1/sqlite/history` | Get query history | `?db*` `?limit` |

**Param notes:**

- `db` — Database file path
- `limit` — Maximum number of entries to return

### `kvStore` (19) — Key-Value store operations with TTL and namespaces

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/sqlite/kv/batch/delete` | Batch delete multiple keys | `?db*` `?table` `body*:sqlite_main.kvBatchDeleteRequest` |
| `POST /api/v1/sqlite/kv/batch/get` | Batch get multiple keys | `?db*` `?table` `body*:sqlite_main.kvBatchGetRequest` |
| `POST /api/v1/sqlite/kv/batch/set` | Batch set multiple keys | `?db*` `?table` `body*:sqlite_main.kvBatchSetRequest` |
| `GET /api/v1/sqlite/kv/diff` | Compare table snapshots | `?db*` `?table` `?from*` `?to*` `?keys` |
| `POST /api/v1/sqlite/kv/{key}/decr` | Atomic decrement | `?db*` `?table` `?delta` `?path` `?history` |
| `DELETE /api/v1/sqlite/kv/{key}` | Delete key | `?db*` `?table` `?history` |
| `HEAD /api/v1/sqlite/kv/{key}` | Check if key exists | `?db*` `?table` |
| `GET /api/v1/sqlite/kv/{key}` | Get value by key | `?db*` `?table` `?path` `?at_timestamp` `?rebuild` |
| `GET /api/v1/sqlite/kv/{key}/history` | Get key operation history | `?db*` `?table` `?limit` |
| `GET /api/v1/sqlite/kv/{key}/snapshot` | Get key snapshot at operation | `?db*` `?table` `?op_number*` |
| `GET /api/v1/sqlite/kv/snapshot` | Get table snapshot at timestamp | `?db*` `?table` `?timestamp*` `?limit` `?prefix` |
| `POST /api/v1/sqlite/kv/{key}/incr` | Atomic increment | `?db*` `?table` `?delta` `?path` `?history` |
| `GET /api/v1/sqlite/kv` | List keys | `?db*` `?table` `?prefix` `?limit` `?offset` `?at_timestamp` |
| `POST /api/v1/sqlite/kv/{key}/pop` | Remove from array end | `?db*` `?table` `?path` `?history` |
| `POST /api/v1/sqlite/kv/{key}/push` | Append to array | `?db*` `?table` `?path` `?history` `body*` |
| `POST /api/v1/sqlite/kv/{key}/remove` | Remove array element | `?db*` `?table` `?path` `?index` `?history` `body*` |
| `POST /api/v1/sqlite/kv/{key}/rollback` | Rollback key operations | `?db*` `?table` `?steps` |
| `POST /api/v1/sqlite/kv/rollback` | Rollback entire table | `?db*` `?table` `?to_timestamp*` `?dry_run` `?confirm` `body*:sqlite_main.kvTableRollbackRequest` |
| `PUT /api/v1/sqlite/kv/{key}` | Set value for key | `?db*` `?table` `?path` `?ttl` `?if_match` `?history` `?create_db_if_missing` `body*:string` |

**Param notes:**

- `db` — Database file path
- `table` — Custom table name
- `from` — Starting timestamp (Unix)
- `to` — Ending timestamp (Unix)
- `keys` — Comma-separated list of keys to compare (optional)
- `key` — Key name
- `delta` — Amount to decrement
- `path` — JSON path to nested numeric value
- `history` — Enable history tracking
- `db` — Database file path or directory
- `key` — Key name (supports / for hierarchical keys)
- `path` — JSON path for nested value extraction
- `at_timestamp` — Unix timestamp for time-travel query (selects handleKVAtTimestamp)
- `rebuild` — Rebuild cache (directory mode only)
- `limit` — Maximum number of operations to return (0 → default 50, clamped to maximum 1000)
- `op_number` — Operation number to reconstruct from
- `timestamp` — Unix timestamp to reconstruct from
- `limit` — Maximum number of keys to return
- `prefix` — Filter keys by prefix
- `delta` — Amount to increment
- `limit` — Maximum number of results
- `offset` — Skip N results for pagination (regular LIST only; ignored when at_timestamp is set)
- `at_timestamp` — Unix timestamp for time-travel LIST (selects handleKVListAtTimestamp; returns a different envelope and ignores offset)
- `path` — JSON path to nested array
- `index` — Array index to remove
- `steps` — Number of operations to rollback
- `to_timestamp` — Target timestamp to rollback to (Unix)
- `dry_run` — Preview changes without applying
- `confirm` — Must be 'yes' to execute actual rollback
- `path` — JSON path for nested value update
- `ttl` — Time-to-live in seconds
- `if_match` — Current value for compare-and-swap
- `create_db_if_missing` — Create database file if it is missing

**Body shapes:**

- `POST /api/v1/sqlite/kv/{key}/push` body — `object` — Value to append
- `POST /api/v1/sqlite/kv/{key}/remove` body — `object` — Request body with value to match and remove
- `PUT /api/v1/sqlite/kv/{key}` body — `string` — Value to store

### `query` (1) — Query

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/sqlite/query` | Execute shareable SQL query | `?db*` `?sql*` |

**Param notes:**

- `db` — Database file path
- `sql` — Base64-encoded SQL query

### `sql` (1) — SQL database operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/sqlite/maintenance` | Run a database maintenance operation | `?db*` `?timeout` `body*` |

**Param notes:**

- `db` — Database path (absolute path, bare name, or./name shorthand resolved to /hoody/databases/*.db)
- `timeout` — Request deadline in seconds (clamped to [1, 300])

**Body shapes:**

- `POST /api/v1/sqlite/maintenance` body — `object` — Maintenance request: {op: wal_checkpoint_truncate\|vacuum_into\|quick_check, dest_path?: string}


### Body schemas

- `sqlite_main.request` — `{ resultFormat: string, transaction: sqlite_main.requestItem[] }`
- `sqlite_main.kvBatchDeleteRequest` — `{ keys*: string[] }`
- `sqlite_main.kvBatchGetRequest` — `{ keys*: string[] }`
- `sqlite_main.kvBatchSetRequest` — `{ items*: sqlite_main.kvBatchSetItem[] }`
- `sqlite_main.kvTableRollbackRequest` — `{ exclude_keys: string[], keys: string[] }`
- `sqlite_main.requestItem` — `{ noFail: bool, query: string, statement: string, values: int[], valuesBatch: int[][], sql: string }`
- `sqlite_main.kvBatchSetItem` — `{ content_type: string, key*: string, ttl: int, value: string }`
