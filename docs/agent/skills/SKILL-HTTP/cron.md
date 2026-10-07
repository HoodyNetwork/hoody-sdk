> _**HTTP skill · `cron` namespace** · ~5,717 tokens · hoody-sdk v1.0.0-beta.16_

# `cron` — managed crontab entries per system user

## Purpose

Edit `crontab(1)` of a system user. UUID-keyed managed entries (name, comment, expiry, enabled) coexist with hand-written lines. Sweep drops expired.

## When to use

- Recurring jobs via cron daemon.
- Future commands with `expires_at` cleanup.
- Repair crontab without losing hand-written lines.

## When NOT to use

Not for: ad-hoc → `terminal`/`exec`, long-runners → `daemon`, FS triggers → `watch`.

## Prerequisites

- `crontab(1)` + cron daemon present; `user` in `/etc/passwd`.
- `user`-scoped.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Schedule

`POST /users/{user}/entries` takes a schedule + command (plus name/comment/expires_at/enabled) and returns the created entry with its `id`.

### 2. List

`GET /users/{user}/entries` (`page`/`limit`, max 200).

### 3. Edit / disable / extend

`PATCH /users/{user}/entries/{id}` PATCH. `clear_expiration: true` overrides `expires_at`. `enabled: false` keeps rule prefixed `# hoody-cron-disabled:`.

### 4. Bulk replace

`GET /users/{user}/crontab` (sweep) then `PUT /users/{user}/crontab` body — revalidates `# hoody-cron:` blocks; response has `removed_expired`.

### 5. Audit all users

`GET /crontab` → paginated `{ items: [{ user, crontab }], total, page, limit }`.

## Quirks & gotchas

- `user`: matches `^[A-Za-z0-9_.-]{1,32}$` for the character class, but the validator additionally rejects a **leading** `-` (trailing `-` is allowed).
- Vixie 5-field plus standard `@`-macros; Quartz rejected.
- `command`/`name`/`comment` reject newline/null/VT/FF/NEL/LS/PS; caps 4096/120/500.
- Send a managed entry's command exactly as a shell would run it, and do not escape `%`: the kit writes it into the crontab as `\%` so cron runs the command unchanged and reads it back the same way. A `\%` you send is escaped again and runs as `\%`, backslash included. Raw lines in a `PUT /users/{user}/crontab` body are written as given, so a `%` there follows crontab rules: a bare `%` ends the command, and `\%` is a literal `%`.
- A managed entry's command is read back from the spool exactly as written, runs of whitespace included, so a later write for that user stores it unchanged: `echo "a  b"` stays `echo "a  b"`.
- `expires_at` RFC 3339, strictly future.
- Body cap 256 KiB by default, which the deployment can change, AND 10,000 lines; duplicate entry id rejected, and a duplicate `id=` within one metadata line is rejected.
- **`PUT /users/{user}/crontab` replaces the whole crontab.** `GET /users/{user}/crontab` returns each managed entry as its `# hoody-cron:` metadata line followed by its rule line, and PUT parses those pairs back into the same managed entries with the same ids. So a read, edit, write cycle keeps every managed entry whose two lines are still in the body; a managed entry left out of the body is deleted. Edit the text from `GET /users/{user}/crontab` instead of writing a fresh body, and do not re-create managed entries after a PUT: they are still there, and re-creating them makes every job run twice. Comment or blank lines placed between a metadata line and its rule line are dropped.
- A PUT body may contain `# hoody-cron:` metadata lines written by the caller. The kit revalidates every managed entry it parses from them (schedule, command, name, comment) and rejects duplicate ids, but it does not check where the metadata came from: a well-formed pair written by hand is accepted as a managed entry, and a metadata line it cannot parse or pair is kept as a raw line. Every other non-comment line gets the syntax check of `crontab(1)`: a line it would refuse is `400 INVALID_CRONTAB` naming that line, and nothing is written.
- `GET /users/{user}/entries`/`GET /users/{user}/entries/{id}` clean expired entries before serializing under a per-user mutex — a GET can mutate the spool.
- `GET /users/{user}/entries` items have `type: "managed"` or `"raw"`; only `managed` items carry `id`.
- Sweep every 60s default; per-user lock.

## Common errors

Error bodies are `{ code, message, details }`, except where noted.

- `400 INVALID_EXPIRES_AT` / `EXPIRES_IN_PAST`.
- `400 INVALID_SCHEDULE / Invalid schedule` — Vixie 5-field plus `@`-macros only; Quartz / 6-field rejected.
- `400 INVALID_USER` (bad user name), `INVALID_COMMAND`, `INVALID_NAME`, `INVALID_COMMENT`: a field failed validation (see Quirks for the rules).
- `400 INVALID_ID` `Entry id must be a UUID`: the `{id}` path segment is not a UUID.
- `400 INVALID_PAGINATION`: `page` must be 1 or more and `limit` 1 to 200 (default 50).
- `404 USER_NOT_FOUND`: the user is not in `/etc/passwd`. `404 ENTRY_NOT_FOUND`: no managed entry has that id (it may have expired and been swept).
- `413 PAYLOAD_TOO_LARGE`: a request body over the size cap (256 KiB by default), or a crontab over 10,000 lines or over its separate byte ceiling of about 40 MB, which only a deployment that raised the size cap can reach.
- `415 UNSUPPORTED_MEDIA_TYPE`: the Content-Type is neither `application/json` nor an `application/*+json` type. `400 INVALID_JSON`: the body is not valid JSON. `400 INVALID_BODY`: the JSON does not match the request fields (a missing or mistyped field).
- `500 BACKEND_ERROR` — `crontab(1)` fail / 30s timeout.
- `403 Forbidden` — Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only. The body is the plain text `Forbidden`, not JSON.

## Related namespaces

- `terminal`, `daemon`, `exec`, `watch`, `files`.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first.

### 1. Set up a nightly DB backup with trial-run dry-fire

**Goal:** schedule `pg_dump` daily at 02:00 in the container's LOCAL timezone (the kit does no TZ conversion; only `expires_at` is UTC-anchored), set the entry to expire one year from now; first verify it actually fires by running it every minute for one cycle.

**Step 1 — create the entry.** Capture the returned `id`; `schedule_human` should read `"At 02:00 every day"`.

```bash
KIT="https://${P}-${C}-cron-1.${N}.containers.hoody.com"
EXP=$(date -u -d '+1 year' +%FT%TZ)   # expires_at must be in the future
ID=$(curl -sX POST "$KIT/users/root/entries" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg e "$EXP" '{
    schedule: "0 2 * * *",
    command: "pg_dump -U postgres mydb | gzip > /backups/db-$(date +%F).sql.gz",
    name: "nightly-db-backup",
    expires_at: $e
  }')" | jq -r '.id')
echo "id=$ID"
```

**Step 2 — trial-run** by tightening to every minute. Wait ~70 s then `tail /var/log/syslog` (via the `terminal` kit) to confirm cron actually fired the job.

```bash
curl -sX PATCH "$KIT/users/root/entries/$ID" \
  -H 'Content-Type: application/json' \
  -d '{"schedule":"* * * * *","comment":"TEST MODE — revert before merge"}'
```

**Step 3 — promote back to nightly** with a clean comment.

```bash
curl -sX PATCH "$KIT/users/root/entries/$ID" \
  -H 'Content-Type: application/json' \
  -d '{"schedule":"0 2 * * *","comment":"production schedule"}'
```

### 2. Maintenance window — pause every managed job, do work, resume

**Goal:** disable every managed entry so nothing fires during a 30-min DB migration; re-enable once clean.

**Step 1 — capture every enabled managed id.** The listing is paginated (50 per page by default, at most 200), so read every page before filtering: a job left on a later page stays enabled through the migration. Run steps 1 and 2 as one script that exits on any listing or update failure, and start the migration only when it exits successfully; a partial list or a failed disable leaves jobs enabled.

```bash
KIT="https://${P}-${C}-cron-1.${N}.containers.hoody.com"
IDS=""; page=1
while :; do
  body=$(curl -sf "$KIT/users/root/entries?page=$page&limit=200") \
    || { echo "listing page $page failed" >&2; exit 1; }
  ids=$(jq -r '.entries[] | select(.type=="managed" and .enabled) | .id' <<<"$body") \
    || { echo "unreadable listing" >&2; exit 1; }
  IDS="$IDS $ids"
  [ $((page * 200)) -lt "$(jq -r .total <<<"$body")" ] || break
  page=$((page + 1))
done
echo "$IDS"
```

**Step 2 — bulk disable.**

```bash
for id in $IDS; do
  curl -sf -X PATCH "$KIT/users/root/entries/$id" \
    -H 'Content-Type: application/json' \
    -d '{"enabled":false}' >/dev/null \
    || { echo "disable failed for $id: do not start the migration" >&2; exit 1; }
done
```

**Step 3 — run your migration. Step 4 — bulk re-enable** the captured ids (same loop with `enabled: true`). After a failed step 2, re-enable the same list: the entries disabled before the failure are still disabled. Entries pick up at their next regular tick; no missed-window catch-up.

### 3. Migrate a hand-written crontab into managed entries

**Goal:** convert legacy raw lines (no `id`, no metadata) into managed entries with names + lifecycle fields, then remove the raw originals so nothing runs twice.

**Step 1 — collect the raw lines to migrate.** `GET /users/{user}/entries` returns hand-written lines as `{ type: 'raw', line }` items; managed entries are `type: 'managed'` and are left alone.

```bash
KIT="https://${P}-${C}-cron-1.${N}.containers.hoody.com"
# Raw items only; skip blanks, comments and environment lines (SHELL=, MAILTO = ..., "A B" = c).
: > /tmp/cron-migrate.txt; page=1
while :; do
  body=$(curl -sf "$KIT/users/root/entries?page=$page&limit=200") || exit 1
  jq -r '.entries[] | select(.type=="raw") | .line' <<<"$body" \
    | grep -Ev "^[[:space:]]*(\$|#|([A-Za-z_][A-Za-z0-9_]*|\"[^\"]*\"|'[^']*')[[:space:]]*=)" >> /tmp/cron-migrate.txt
  [ $((page * 200)) -lt "$(jq -r .total <<<"$body")" ] || break
  page=$((page + 1))
done
cat /tmp/cron-migrate.txt
```

**Before step 2 — check every line for `%` and `\`.** A raw line is in crontab syntax and a managed command is not: in a raw line a bare `%` ends the command and sends the rest to its stdin, and `\%` and `\\` stand for `%` and `\`, while the kit escapes a managed command itself (see Quirks). The scripts below copy the command text as it is, so they keep a line's meaning only when it contains neither `%` nor `\`. Take any other line out of the step 1 list and migrate it by hand: write the command cron actually runs (`\%` becomes `%`, `\\` becomes `\`, and a `%`-delimited stdin becomes a pipe or a here-string) and create its entry from that. Step 3 drops only the lines still in the list, so remove the raw lines you migrated by hand the same way, or each of those jobs runs twice.

**Step 2 — create a managed entry per line.** An `@macro` line (`@daily`, `@reboot`, ...) has a one-field schedule; any other line has five fields. The rest of the line is the command.

```bash
i=0; FAILED=0
while IFS= read -r LINE; do
  i=$((i + 1))
  case "$(echo "$LINE" | sed -E 's/^[[:space:]]+//')" in @*) F=1 ;; *) F=5 ;; esac
  SCHED=$(echo "$LINE" | awk -v f="$F" '{s=$1; for (k = 2; k <= f; k++) s = s " " $k; print s}')
  CMD=$(echo "$LINE" | sed -E "s/^[[:space:]]*([^[:space:]]+[[:space:]]+){$F}//")
  curl -sf -X POST "$KIT/users/root/entries" \
    -H 'Content-Type: application/json' \
    -d "$(jq -nc --arg s "$SCHED" --arg c "$CMD" --arg n "migrated-$i" '{schedule:$s,command:$c,name:$n}')" >/dev/null \
    || { echo "create failed for: $LINE" >&2; FAILED=1; break; }
done < /tmp/cron-migrate.txt
[ "$FAILED" = 0 ] || exit 1   # stop here: step 3 must not run after a failed create
```

**Step 3 — remove only the migrated raw lines.** Only after every create in step 2 succeeded: run steps 2 and 3 as one script, so the stop after a failed create also skips this step. After a partial failure, the managed entries created so far run alongside their raw lines (each of those jobs runs twice) until you delete them or finish the migration. Read the crontab text again (it now contains the new managed entries as `# hoody-cron:` metadata and rule line pairs), drop the raw lines from step 1 and write the rest back. A new managed entry's rule line is usually the same text as the raw line it replaces, so match a line only when the line before it is not a `# hoody-cron:` metadata line: dropping a rule line leaves its metadata unpaired, and the managed entry is lost. The PUT keeps every managed entry that is still in the text, with the same id. Do not PUT an empty crontab here: that would delete the entries step 2 just created.

```bash
[ -s /tmp/cron-migrate.txt ] || exit 0   # nothing to drop
BODY=$(curl -sf "$KIT/users/root/crontab") || exit 1
CUR=$(jq -er '.crontab | select(type == "string")' <<<"$BODY") || exit 1
# Drop a listed line only when it does not follow a "# hoody-cron:" metadata line.
NEW=$(printf '%s\n' "$CUR" | awk 'NR == FNR { drop[$0] = 1; next }
  { keep = !($0 in drop) || prev ~ /^[[:space:]]*# hoody-cron:/; prev = $0 } keep' /tmp/cron-migrate.txt -)
curl -sf -X PUT "$KIT/users/root/crontab" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg c "$NEW" '{crontab:$c}')"
```

### 4. Hourly poll → tighten to every 5 minutes after a failure

**Goal:** a health-poller is failing intermittently; you want denser data without redeploying anything. Find by name, change schedule, restore later.

**Step 1 — find the entry id by name.** Names are not unique and the listing is paginated, so read every page and stop unless exactly one managed entry carries the name.

```bash
KIT="https://${P}-${C}-cron-1.${N}.containers.hoody.com"
ID=""; page=1
while :; do
  body=$(curl -sf "$KIT/users/root/entries?page=$page&limit=200") || exit 1
  ID="$ID $(jq -r '.entries[] | select(.type=="managed" and .name=="health-poll") | .id' <<<"$body")"
  [ $((page * 200)) -lt "$(jq -r .total <<<"$body")" ] || break
  page=$((page + 1))
done
set -- $ID
[ $# -eq 1 ] || { echo "expected one entry named health-poll, found $#: $ID" >&2; exit 1; }
ID=$1
```

**Step 2 — tighten to `*/5 * * * *`.** `schedule_human` becomes `"Every 5 minutes"` immediately on the response.

```bash
curl -sX PATCH "$KIT/users/root/entries/$ID" \
  -H 'Content-Type: application/json' -d '{"schedule":"*/5 * * * *"}'
```

**Step 3 — restore** to hourly once the investigation is over: the same call with the JSON body `{"schedule":"0 * * * *"}`.

### 5. Time-bounded experiment — auto-expire after 30 days

**Goal:** run a daily metrics sample for one month, then have it self-remove. Then learn how to extend or unbound the deadline.

**Step 1 — create with `expires_at`.** ISO 8601 RFC 3339; must be in the future.

```bash
KIT="https://${P}-${C}-cron-1.${N}.containers.hoody.com"
EXP=$(date -u -d '+30 days' +%FT%TZ)
ID=$(curl -sX POST "$KIT/users/root/entries" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg e "$EXP" '{
    schedule: "@daily",
    command: "/opt/metrics/sample.sh",
    name: "metrics-experiment",
    expires_at: $e
  }')" | jq -r .id)
```

After the timestamp passes, the kit's 60 s sweep **deletes** expired managed entries. `GET /users/{user}/entries`/`GET /users/{user}/entries/{id}` also clean expired entries before serializing, so once the sweep runs you can no longer read the expired entry — the entry simply disappears from listings. The `removed_expired` count on `PUT /users/{user}/crontab` tells you how many expired entries got dropped during a bulk replace.

**Step 2a — extend the deadline mid-experiment** (to 60 days from now):

```bash
curl -sX PATCH "$KIT/users/root/entries/$ID" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg e "$(date -u -d '+60 days' +%FT%TZ)" '{expires_at:$e}')"
```

**Step 2b — make it permanent** instead. Pass `clear_expiration: true`. If you also send `expires_at` in the same call, `clear_expiration` silently wins (server returns `200` with `expires_at: null` — no error).

```bash
curl -sX PATCH "$KIT/users/root/entries/$ID" \
  -H 'Content-Type: application/json' -d '{"clear_expiration":true}'
```

### 6. Quick-disable a misbehaving entry by name

**Goal:** A teammate paged you about a runaway cron at 3am. You don't have the id, only the name they mentioned (`noisy-job`).

**Step 1 — find its id by name.** Read every page and require exactly one match; if several entries share the name, pick the intended id explicitly.

```bash
KIT="https://${P}-${C}-cron-1.${N}.containers.hoody.com"
ENTRY_ID=""; page=1
while :; do
  body=$(curl -sf "$KIT/users/root/entries?page=$page&limit=200") || exit 1
  ENTRY_ID="$ENTRY_ID $(jq -r '.entries[] | select(.type=="managed" and .name=="noisy-job") | .id' <<<"$body")"
  [ $((page * 200)) -lt "$(jq -r .total <<<"$body")" ] || break
  page=$((page + 1))
done
set -- $ENTRY_ID
[ $# -eq 1 ] || { echo "expected one entry named noisy-job, found $#: $ENTRY_ID" >&2; exit 1; }
ENTRY_ID=$1
```

**Step 2 — disable it (entry stays in the listing for forensics; cron won't fire it).**

```bash
curl -sX PATCH "$KIT/users/root/entries/$ENTRY_ID" \
  -H 'Content-Type: application/json' \
  -d "{\"enabled\":false,\"comment\":\"disabled $(date -u +%FT%TZ) — investigating\"}"
```

**Step 3 — re-enable later** by calling the same update with `enabled: true`.

### 7. Audit which users on the container have any cron entries

**Goal:** compliance question — "who has scheduled jobs?". A container has 60+ system users, more than the default page of 50, so read every page.

`GET /crontab` returns one record per account in `/etc/passwd` (`{ user, crontab }`), 50 per page by default and at most 200. Filter client-side for non-empty `crontab`.

```bash
KIT="https://${P}-${C}-cron-1.${N}.containers.hoody.com"
page=1
while :; do
  body=$(curl -sf "$KIT/crontab?page=$page&limit=200") || break
  jq '.items[] | select(.crontab | test("\\S")) | {user, crontab}' <<<"$body"
  [ $((page * 200)) -lt "$(jq -r .total <<<"$body")" ] || break
  page=$((page + 1))
done
```

For each non-empty user, drill in via `GET /users/{user}/entries` for that user for the managed view, or read the `crontab` text directly from the listing above.

### 8. Atomic full-crontab replace from versioned config

**Goal:** your IaC layer keeps the canonical crontab as a string in Git; on deploy, push the whole thing. ⚠ The canonical text becomes the whole crontab: raw lines not in it are removed, and so is every managed entry whose `# hoody-cron:` metadata and rule lines are not in it.

**Step 1 — snapshot current state** for forensics:

```bash
KIT="https://${P}-${C}-cron-1.${N}.containers.hoody.com"
curl -sf "$KIT/users/root/crontab" > /tmp/cron-snapshot.json
```

**Step 2 — push the canonical config.** Body MUST use `application/json` or an `application/*+json` Content-Type (raw `text/plain` returns `415`). Response carries `removed_expired` (count of managed entries that were dropped because their `expires_at` had passed).

```bash
NEW=$(cat /etc/iac/canonical-crontab.txt)
curl -sX PUT "$KIT/users/root/crontab" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg c "$NEW" '{crontab:$c}')"
```

### 9. Update only the comment / metadata, leave the schedule untouched

**Goal:** add a runbook URL or owner tag without changing the schedule or the enabled state. PATCH is partial — fields you don't pass are not assigned.

```bash
KIT="https://${P}-${C}-cron-1.${N}.containers.hoody.com"
curl -sX PATCH "$KIT/users/root/entries/$ID" \
  -H 'Content-Type: application/json' \
  -d '{"comment":"owner: @team · runbook: https://wiki.example.com/cron-x"}'
```

`updated_at` advances; `schedule`, `enabled` and `command` are unchanged.

### 10. Rotate-and-replace pattern — read, edit text, write back

**Goal:** a teammate wants ONE hand-written line gone without disturbing the rest. You don't have an id (it's raw). Match the whole line exactly, and skip a matching line that follows a `# hoody-cron:` metadata line: that one is a managed entry's rule, and dropping it orphans the entry.

**Step 1 — fetch** the multi-line string. **Step 2 — edit client-side** (split, drop, rejoin). **Step 3 — write back.** Managed entries survive: the fetched text holds each one as a `# hoody-cron:` metadata line plus its rule line, and the PUT parses them back with the same ids. Leave those lines untouched and do not re-create the entries afterwards, or every managed job runs twice.

```bash
KIT="https://${P}-${C}-cron-1.${N}.containers.hoody.com"
# Check the read and the parse separately: a failed read must never become an empty PUT.
BODY=$(curl -sf "$KIT/users/root/crontab") || exit 1
CUR=$(jq -er '.crontab | select(type == "string")' <<<"$BODY") || exit 1
NEW=$(printf '%s\n' "$CUR" | awk -v target='*/30 * * * * /old.sh' \
  '{ keep = $0 != target || prev ~ /^[[:space:]]*# hoody-cron:/; prev = $0 } keep')
curl -sX PUT "$KIT/users/root/crontab" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg c "$NEW" '{crontab:$c}')"
```

## Reference

### `crontabs` (3) — Raw crontab management

| Method | Summary | Params |
|--------|---------|--------|
| `GET /users/{user}/crontab` | Get Crontab |  |
| `GET /crontab` | List All Crontabs | `?page` `?limit` |
| `PUT /users/{user}/crontab` | Put Crontab | `body*:cron_RawCrontabRequest` |

**Param notes:**

- `user` — System username
- `page` — Page number (1-based, default 1)
- `limit` — Items per page (default 50, max 200)

### `entries` (5) — Managed entry CRUD

| Method | Summary | Params |
|--------|---------|--------|
| `POST /users/{user}/entries` | Create Entry | `body*:cron_CreateEntryRequest` |
| `DELETE /users/{user}/entries/{id}` | Delete Entry |  |
| `GET /users/{user}/entries/{id}` | Get Entry |  |
| `GET /users/{user}/entries` | List Entries | `?page` `?limit` |
| `PATCH /users/{user}/entries/{id}` | Update Entry | `body*:cron_UpdateEntryRequest` |

**Param notes:**

- `user` — System username
- `page` — Page number (1-based, default 1)
- `limit` — Items per page (default 50, max 200)

### `kit` (1) — System endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `GET /health` | Health Check |  |


### Body schemas

- `cron_RawCrontabRequest` — `{ crontab*: string }`
- `cron_CreateEntryRequest` — `{ command*: string, comment: string|null, enabled: bool|null, expires_at: string|null, name: string|null, schedule*: string }`
- `cron_UpdateEntryRequest` — `{ clear_expiration: bool|null, command: string|null, comment: string|null, enabled: bool|null, expires_at: string|null, name: string|null, schedule: string|null }`
