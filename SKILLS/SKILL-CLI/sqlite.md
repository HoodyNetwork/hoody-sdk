> _**CLI skill · `sqlite` namespace** · ~5,961 tokens · hoody-sdk v1.0.0-beta.12_

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

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### DB + SQL tx

`hoody db create` `path` (bare/`./name`/abs under `/hoody/databases`), `init_kv: true` for KV table → `hoody db exec-transaction` `{ transaction: [{ statement, values?|valuesBatch? }] }` (`create_db_if_missing: true` skips create) → `hoody db history list`.

### KV CRUD + CAS + counters

- `hoody kv set` — `ttl`, `if_match` (CAS), `path`, `history`.
- `hoody kv get` — `path`, `at_timestamp`. `hoody kv exists` takes only `db`/`table`; `hoody kv delete` takes only `db`/`table`/`history` (`history` keeps the tombstone).
- `hoody kv incr`/`hoody kv decr`/`hoody kv arrays push`/`pop`/`hoody kv arrays delete` — atomic, `path`-aware.

### Time-travel (needs `history: true`)

- `hoody kv history` (default 50, max 1000); `hoody kv snapshots get-key` at `op_number`.
- `hoody kv snapshots get-table` / `hoody kv snapshots compare-table` — Unix `timestamp` / diff.
- `hoody kv rollback` last N; `hoody kv rollback-table`: `dry_run` (query) then `confirm: 'yes'` (query — NOT body field). Body is **required** by SDK/CLI; pass `{}` for full-table rollback or `{"keys":[...]}` / `{"exclude_keys":[...]}` to scope.

### Bulk + shareable

- `hoody kv batch set`/`hoody kv batch get`/`hoody kv batch delete` — single SQLite tx.
- `hoody db exec-shareable` — GET, URL-safe base64 `sql`, read-only. `GET /api/v1/sqlite/health`/`GET /api/v1/sqlite/health/cache`.

## Quirks & gotchas

- **Bare-URL auth (no claim/token headers).** Like every kit (including `agent`), the `sqlite` kit accepts the bare per-container kit URL — no `X-Hoody-Container-Claim` or `X-Hoody-Token` headers required. The capability URL itself is the bearer.
- **Tx item key matters: `"query"` vs `statement` are NOT interchangeable.** Each `transaction[i]` MUST carry exactly one of `"query"` (returns rows) or `statement` (rows-affected only). If you put a SELECT under `statement`, you silently get back `rowsUpdated: 0` and no data. The `sql` alias maps to `statement`.
- Path resolution: bare names auto-resolve under `/hoody/databases/` (with `.db` appended if no extension). Relative paths containing `/` or `\` are **rejected**, NOT auto-absoluted; only literal absolute paths (e.g. `/hoody/databases/app.db`) are treated as absolute. Outside `/hoody/databases` needs `--allow-any-absolute-db-path`. Symlinks followed; outward targets rejected. `:memory:` databases are rejected.
- Directory mode requires absolute db (`directory-mode: invalid path input: path must be absolute`).
- Tx items: `statement` or alias `sql`. `hoody db exec-transaction` caps: 10k items, 100k rows/`valuesBatch`, 1M total rows. `values` and `valuesBatch` are mutually exclusive on a single item; `"query"` items cannot use `valuesBatch`.
- **GET `/query` rejects mutations**: INSERT/UPDATE/DELETE, `RETURNING` on writes, multi-statement (semicolons), PRAGMA writes, VACUUM, ATTACH/DETACH. Use `hoody db exec-transaction` with `statement:` items for writes.
- **SELECT result-row cap is 10 000** (responses set `truncated: true` when hit) on both transaction `"query"` items and GET `/query`; further rows silently truncated. Paginate explicitly for larger result sets.
- **`hoody kv set` body is a JSON-encoded STRING**, not an object. Generated SDK type is `string`; encode objects yourself before sending (e.g. JSON-stringify the value). Same for the `hoody kv batch set` per-item `value`.
- Time-travel **history is opt-out, not opt-in**: write handlers default `history: true`. Pass `history: false` to skip recording — but later `hoody kv history` / snapshot / time-travel reads will see gaps (`has_gaps`, `gap_keys`, `candidate_truncated` fields). Per-key history reconstruction is capped at 50 000 ops.
- `create_db_if_missing`/`auto_create` aliases; mismatch → `conflicting flags`.
- `hoody kv list` w/ `at_timestamp` → time-travel handler (different envelope, ignores `offset`). `getHistory.limit`: 0→50, >1000→1000.
- `hoody db exec-shareable` `sql` accepts URL-safe base64 (`+`→`-`, `/`→`_`); both padded and unpadded forms are accepted. Inputs that do not decode to a SELECT/WITH query are treated as raw SQL. No workspace scoping — the kit URL alone is the credential, share carefully.
- CLI: `hoody db` (aliases `sql`, `sqlite`); KV under `hoody kv`.

## Common errors

- `412 Value mismatch for CAS` (`if_match` mismatch) / `412 Key does not exist for CAS` (both CAS failures are 412).
- `400 directory-mode: invalid path input: path must be absolute`.
- `400 absolute database paths outside /hoody/databases are disallowed`.
- `400 in-memory databases are not supported`.
- `400 conflicting flags: create_db_if_missing and auto_create must match`.
- `400 GET /query only accepts read-only SELECT/WITH queries; use POST /db for mutating SQL` (returned for non-SELECT input; a non-base64 `sql` value is not an error — it is interpreted as raw SQL).
- `400 Invalid JSON body` on `hoody kv batch set` — wire shape requires each `value` to be a JSON-encoded string, not an object.
- `409 time-travel chain gap` when the requested timestamp falls inside a `history: false` window.
- Per-statement tx errors → `{ reqIdx, error }`; HTTP 200 if tx parsed.

## Related namespaces

`files` `.db` in `/hoody/databases/` · `exec` in-container · `notes` notebooks · `cron` schedule maintenance.

## Examples

Every step in every example was live-tested against a real `sqlite-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first, then choose a `DB` path. Bare names (`./mydb`) auto-resolve under `/hoody/databases/`; absolute paths outside that tree need the kit's `--allow-any-absolute-db-path` flag (`/tmp/...` works on dev kits).

**Two SQL field names that are NOT interchangeable:** in a transaction item, the `"query":"..."` key is for SELECT (returns `resultSet`/`resultHeaders`) and the `"statement":"..."` key is for DDL/DML (returns `rowsUpdated` only). Putting a SELECT under `"statement"` runs it but throws away rows — `rowsUpdated:0` even when matches exist. The `"sql"` alias maps to `"statement"`, not `"query"`.

### 1. Schema setup with idempotent multi-statement transaction

**Goal:** create a fresh database under `/tmp/`, install a 3-statement schema (table + index + seed row) atomically, then read it back. Every statement is `IF NOT EXISTS` / parameterised so the whole step is replay-safe.

**Step 1 — create the db file** with the kv table pre-seeded so KV ops on the same db don't have to bootstrap separately.

```bash
DB="/tmp/sqlite-examples-$RANDOM.db"
hoody --container "$C" db create --path "$DB" --init-kv
```
**Step 2 — install schema** in a single transaction. Returns `{results:[...]}` with one entry per statement; `rowsUpdated:1` on the final INSERT confirms the seed landed.

```bash
hoody --container "$C" db exec-transaction --db "$DB" --transaction '[
  {"statement":"CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, created_at INTEGER)"},
  {"statement":"CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)"},
  {"statement":"INSERT OR IGNORE INTO users (name, email, created_at) VALUES (?, ?, ?)","values":["Ada","ada@example.com",1778191500]}
]'
```
**Step 3 — read back using a SELECT under a transaction item with the `"query":"..."` key (NOT the `"statement":"..."` key — `statement` returns `rowsUpdated` only and silently drops rows).** The response carries `resultHeaders` + `resultSet` of column→value objects.

```bash
hoody --container "$C" db exec-transaction --db "$DB" --transaction '[{"query":"SELECT id, name, email FROM users"}]'
```
### 2. KV CRUD with TTL — short-lived session token

**Goal:** store a per-user session blob with a 60-second TTL, prove `hoody kv exists` flips to 404 after expiry, then explicitly delete.

**Step 1 — set with TTL.** The PUT body is the raw JSON value (string, object, array — kit infers `content_type`); query params carry `ttl` in seconds.

```bash
hoody --container "$C" kv set 'session:alex' --db "$DB" --ttl 60 \
  --body '{"user_id":"d6ec...","scopes":["read","write"]}'
```
**Step 2 — `HEAD` for existence** (zero-body, cheap). Returns `200` while live, `404` once TTL elapses.

```bash
hoody --container "$C" kv exists 'session:alex' --db "$DB"
```
**Step 3 — explicit delete** (don't wait for TTL). `hoody kv delete` is NOT idempotent: deleting a missing key returns `404 Key not found`; on a hit it returns `{success:true,deleted:true}`. Wrap with try/catch or pre-check via `hoody kv get`.

```bash
hoody --container "$C" kv delete 'session:alex' --db "$DB"
```
### 3. Compare-and-swap on a versioned config blob

**Goal:** roll a config doc forward only when the current value matches what we last read. CAS uses `if_match` carrying the **literal raw value** (URL-encoded), not a hash — wrong value → `412 Value mismatch for CAS`.

**Step 1 — initial set** (no `if_match` needed; CAS only protects subsequent updates).

```bash
hoody --container "$C" kv set config --db "$DB" --body '{"version":1,"feature_x":false}'
```
**Step 2 — read current**, then send the next version with `if_match` set to the exact JSON bytes you just read. Mismatched expected → `412`, request body is rejected.

```bash
CUR=$(hoody --container "$C" kv get config --db "$DB" -o raw)   # -o raw: CAS compares BYTE-EXACT, and `-o json | jq` would re-serialize
hoody --container "$C" kv set config --db "$DB" --if-match "$CUR" \
  --body '{"version":2,"feature_x":true}'
```
**Step 3 — observe a conflict** by sending stale `if_match`. Expect `HTTP 412 {"error":"Value mismatch for CAS"}` — the write is rejected without modifying the stored value.

```bash
hoody --container "$C" kv set config --db "$DB" --if-match 'stale' --body '{"version":99}' || echo 'CAS rejected as expected'
```
### 4. Atomic counter for per-user rate limiting

**Goal:** hot-path increment/decrement without a transaction round-trip. `hoody kv incr`/`hoody kv decr` are server-side atomic and create the key on first hit; `delta` must be a POSITIVE integer (`delta <= 0` → `400 delta must be a positive integer`) — use `hoody kv decr` for the negative direction. Useful for request quotas, login-attempt counters, work-queue depth.

**Step 1 — increment by 1** on each request. First call materialises the key as `text/plain` integer.

```bash
hoody --container "$C" kv incr 'rate:alex:hour' --db "$DB" --delta 1
```
**Step 2 — bulk-add 10** in one shot (e.g. credit refund). `delta` must be a positive integer; use `hoody kv decr` to go the other way — a negative `delta` is rejected with `400`.

```bash
hoody --container "$C" kv incr 'rate:alex:hour' --db "$DB" --delta 10
```
**Step 3 — burn down by 3** (e.g. consume 3 quota units). Final value is plain text — `hoody kv get` returns the integer body directly, not wrapped.

```bash
hoody --container "$C" kv decr 'rate:alex:hour' --db "$DB" --delta 3
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
**Step 2 — inspect history** (`hoody kv history` returns newest first; each entry has `op_number` and `operation` — `operation.raw_old_value` / `operation.raw_new_value` are base64 and appear only for non-JSON content types).

```bash
hoody --container "$C" kv history feature-flags --db "$DB" --limit 10
```
**Step 3 — roll back the last two ops** so `feature-flags` returns to `{chat:false,voice:false}`. Only the chosen key is affected.

```bash
hoody --container "$C" kv rollback feature-flags --db "$DB" --steps 2
hoody --container "$C" kv get      feature-flags --db "$DB"
```
### 7. Snapshot at op-number, then diff against current

**Goal:** prove what a key looked like right after creation, then summarise every key that changed in a window. Uses `hoody kv snapshots get-key` (per-key, by `op_number`) and `hoody kv snapshots compare-table` (whole table, by Unix timestamps).

**Step 1 — fetch the per-key snapshot at `op_number=1`** (= the first state).

```bash
hoody --container "$C" kv snapshots get-key feature-flags --db "$DB" --op-number 1
```
**Step 2 — record `from` and `to` timestamps** around a write window, then mutate so there is something to diff.

```bash
FROM=$(date +%s); sleep 1
hoody --container "$C" kv set cmp-test --db "$DB" --history --body '{"v":1}'
sleep 1; TO=$(date +%s)
```
**Step 3 — diff the table** between the two timestamps. `stats.created/modified/deleted` summarises; `changes[]` enumerates per-key.

```bash
hoody --container "$C" kv snapshots compare-table --db "$DB" --from "$FROM" --to "$TO"
```
### 8. Bulk batch — set / get / delete in single round-trips

**Goal:** seed three KV pairs, fetch them in one request (with one missing key to see the null payload), then drop them all. Each call wraps in a single SQLite tx; cap is 100 items per batch.

**Important wire-format detail:** in `hoody kv batch set`, every `value` must be a **string** (a JSON-encoded scalar/object). Sending a raw object → `400 Invalid JSON body`.

**Step 1 — bulk set with TTL on one item.**

```bash
hoody --container "$C" kv batch set --db "$DB" --body '{"items":[
  {"key":"u:1","value":"{\"name\":\"alice\"}","content_type":"application/json"},
  {"key":"u:2","value":"{\"name\":\"bob\"}","content_type":"application/json"},
  {"key":"u:3","value":"{\"name\":\"carol\"}","content_type":"application/json","ttl":3600}
]}'
```
**Step 2 — bulk get** (missing keys come back as `null`, present ones as `{value, content_type}`).

```bash
hoody --container "$C" kv batch get --db "$DB" --body '{"keys":["u:1","u:2","u:3","u:404"]}'
```
**Step 3 — bulk delete.** Returns `{deleted: <count>, success: true}`. Missing keys silently no-op.

```bash
hoody --container "$C" kv batch delete --db "$DB" --body '{"keys":["u:1","u:2","u:3"]}'
```
### 9. Shareable read-only SQL via base64-encoded GET

**Goal:** mint a one-shot URL that runs a SELECT — safe to embed in dashboards / logs because the kit enforces read-only. `sql` is **URL-safe base64** (`+`→`-`, `/`→`_`); padding is optional — both padded and unpadded forms are accepted (the kit falls back to `base64.RawURLEncoding`).

**Step 1 — encode** the query.

```bash
SQL='SELECT id, name, email FROM users LIMIT 10'
# `db exec-shareable` does NOT auto-encode the SQL; pre-encode to URL-safe
# base64 (padding optional) the same way the HTTP example does:
SQL_B64=$(printf '%s' "$SQL" | base64 -w0 | tr '+/' '-_')
hoody --container "$C" db exec-shareable --db "$DB" --sql "$SQL_B64"
```
**Step 2 — issue the GET.** Response includes `columns`, `resultSet`, `rowCount`, `truncated`. A non-base64 `sql` value is not an error — it is interpreted as raw SQL; a non-SELECT query → `400 GET /query only accepts read-only SELECT/WITH queries; use POST /db for mutating SQL`.

```bash
# Step 1 already executed it
:
```
**Step 3 — paste-able URL** (e.g. dashboard link). The kit URL itself is the auth grant — guard who you share it with.

```bash
# `--url` is NOT a flag on `db exec-shareable` (it belongs to `db open`);
# compose a pasteable URL by hand if you want one:
echo "https://${P}-${C}-sqlite-1.${N}.containers.hoody.com/api/v1/sqlite/query?db=${DB}&sql=${SQL_B64}"
```
### 10. Bulk insert via `valuesBatch` — one statement, many rows

**Goal:** load 3 rows (or 100k) through one prepared statement instead of one tx item per row. `valuesBatch` is an array of value-arrays positionally aligned with the `?` placeholders. Caps: 100k rows per `valuesBatch`, 1M rows per tx.

**Step 1 — bulk insert.** Response carries `rowsUpdatedBatch:[1,1,1]` — one entry per row.

```bash
hoody --container "$C" db exec-transaction --db "$DB" --transaction '[{
  "statement":"INSERT INTO users (name, email, created_at) VALUES (?, ?, ?)",
  "valuesBatch":[["Bob","bob@example.com",1778000000],["Carol","carol@example.com",1778000100],["Dan","dan@example.com",1778000200]]
}]'
```
**Step 2 — verify count** by sending a SELECT inside a transaction item with the `"query":"..."` key (NOT the `"statement":"..."` key).

```bash
hoody --container "$C" db exec-transaction --db "$DB" --transaction '[{"query":"SELECT COUNT(*) AS n FROM users"}]'
```
**Step 3 — clean up** (drop the throwaway db file via `files`, or just leave under `/tmp/` for the next reboot to reclaim).

```bash
hoody --container "$C" files rm "$DB"
```

## Reference

### `hoody db` (8) — SQLite database operations

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody db create` | new, add | write | Create new SQLite database | `sqlite.database.create` | `hoody db create --path /home/user/file.txt --init-kv --kv-table kv_store` |
| `hoody db exec-shareable` |  | action | Execute shareable SQL query | `sqlite.query.executeShareable` | `hoody db exec-shareable --db <db> --sql <sql>` |
| `hoody db exec-transaction` |  | action | Execute SQL transaction | `sqlite.database.executeTransaction` | `hoody db exec-transaction --db <db> --create-db-if-missing --result-format <result_format> --transaction <transaction>` |
| `hoody db history clear` |  | destructive | Clear query history | `sqlite.history.clear` | `hoody db history clear --db <db>` |
| `hoody db history delete` | rm, remove | destructive | Delete history entry | `sqlite.history.deleteEntry` | `hoody db history delete <index> --db <db>` |
| `hoody db history list` |  | read | Get query history | `sqlite.history.list` | `hoody db history list --db <db> --limit 100` |
| `hoody db history stats` |  | read | Get history statistics | `sqlite.history.getStats` | `hoody db history stats --db <db>` |
| `hoody db open` |  | action | Open the SQLite kit service (DB UI) in your browser |  | `hoody db open [index] [--url]` |

### `hoody kv` (20) — Key-value store

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody kv arrays delete` |  | destructive | Remove array element | `sqlite.kvStore.removeElement` | `hoody kv arrays delete <key> --db <db> --table kv_store --path /home/user/file.txt --index 10 --history --body '{}'` |
| `hoody kv arrays pop` |  | write | Remove from array end | `sqlite.kvStore.pop` | `hoody kv arrays pop <key> --db <db> --table kv_store --path /home/user/file.txt --history` |
| `hoody kv arrays push` |  | write | Append to array | `sqlite.kvStore.push` | `hoody kv arrays push <key> --db <db> --table kv_store --path /home/user/file.txt --history --body '{}'` |
| `hoody kv batch delete` |  | write | Batch delete multiple keys | `sqlite.kvStore.batchDelete` | `hoody kv batch delete --db <db> --table kv_store --keys <keys>` |
| `hoody kv batch get` |  | write | Batch get multiple keys | `sqlite.kvStore.batchGet` | `hoody kv batch get --db <db> --table kv_store --keys <keys>` |
| `hoody kv batch set` |  | write | Batch set multiple keys | `sqlite.kvStore.batchSet` | `hoody kv batch set --db <db> --table kv_store --items <items>` |
| `hoody kv decr` |  | write | Atomic decrement | `sqlite.kvStore.decr` | `hoody kv decr <key> --db <db> --table kv_store --delta 1 --path /home/user/file.txt --history` |
| `hoody kv delete` |  | destructive | Delete key | `sqlite.kvStore.delete` | `hoody kv delete <key> --db <db> --table kv_store --history` |
| `hoody kv exists` |  | read | Check if key exists | `sqlite.kvStore.exists` | `hoody kv exists <key> --db <db> --table kv_store` |
| `hoody kv get` |  | read | Get value by key | `sqlite.kvStore.get` | `hoody kv get <key> --db <db> --table kv_store --path /home/user/file.txt --at-timestamp 10 --rebuild` |
| `hoody kv history` |  | read | Get key operation history | `sqlite.kvStore.getHistory` | `hoody kv history <key> --db <db> --table kv_store --limit 50` |
| `hoody kv incr` |  | write | Atomic increment | `sqlite.kvStore.incr` | `hoody kv incr <key> --db <db> --table kv_store --delta 1 --path /home/user/file.txt --history` |
| `hoody kv list` | ls | read | List keys | `sqlite.kvStore.listIterator` | `hoody kv list --db <db> --table kv_store --prefix <prefix> --limit 100 --offset 0 --at-timestamp 10` |
| `hoody kv open` |  | action | Open the SQLite kit service (KV UI) in your browser |  | `hoody kv open [index] [--url]` |
| `hoody kv rollback` |  | write | Rollback key operations | `sqlite.kvStore.rollback` | `hoody kv rollback <key> --db <db> --table kv_store --steps 1` |
| `hoody kv rollback-table` |  | write | Rollback entire table | `sqlite.kvStore.rollbackTable` | `hoody kv rollback-table --db <db> --table kv_store --to-timestamp 10 --dry-run --confirm <confirm> --exclude-keys <exclude_keys> --keys <keys>` |
| `hoody kv set` |  | write | Set value for key | `sqlite.kvStore.set` | `hoody kv set <key> --db <db> --table kv_store --path /home/user/file.txt --ttl 10 --if-match <if_match> --history --create-db-if-missing --body '{}'` |
| `hoody kv snapshots compare-table` |  | read | Compare table snapshots | `sqlite.kvStore.compareSnapshots` | `hoody kv snapshots compare-table --db <db> --table kv_store --from 10 --to 10 --keys <keys>` |
| `hoody kv snapshots get-key` |  | read | Get key snapshot at operation | `sqlite.kvStore.getSnapshot` | `hoody kv snapshots get-key <key> --db <db> --table kv_store --op-number 10` |
| `hoody kv snapshots get-table` |  | read | Get table snapshot at timestamp | `sqlite.kvStore.getTableSnapshot` | `hoody kv snapshots get-table --db <db> --table kv_store --timestamp 1750000000000 --limit 100 --prefix <prefix>` |

