> _**CLI skill · `cron` namespace** · ~7,743 tokens · hoody-sdk v1.0.1_

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

- `crontab(1)` + cron daemon present; `user` resolvable by the system user lookup.
- `user`-scoped.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Schedule

`hoody cron entries create` takes a schedule + command (plus name/comment/expires_at/enabled) and returns the created entry with its `id`.

### 2. List

`hoody cron entries list` (fetches every page itself; `--limit N` caps the total, up to 10,000 items or 1,000 requests).

### 3. Edit / disable / extend

`hoody cron entries update` PATCH. `clear_expiration: true` overrides `expires_at`. `enabled: false` keeps rule prefixed `# hoody-cron-disabled:`.

### 4. Bulk replace

For a normal bulk replace, read with `hoody cron crontabs get` (sweep), edit the returned text, then call `hoody cron crontabs set` with the body — it revalidates `# hoody-cron:` blocks, and the response has `removed_expired`. If a read or entry call fails with `409 STORED_CRONTAB_INVALID` (the stored crontab cannot be used), read `details` and repair it by calling `hoody cron crontabs set` directly with a complete, valid replacement: PUT does not parse the stored crontab (and without `If-Match` a failed read of it does not stop the replace), and anything you leave out of the replacement is removed.

### 5. Audit all users

`hoody cron crontabs list` → paginated `{ items: [{ user, crontab, etag }], total, page, limit }`; the CLI fetches every page itself, and `--limit N` caps the total (up to 10,000 items or 1,000 requests).

## Quirks & gotchas

- `user`: matches `^[A-Za-z0-9_.-]{1,32}$` for the character class, but the validator additionally rejects a **leading** `-` (trailing `-` is allowed).
- Vixie 5-field plus standard `@`-macros; Quartz rejected.
- `command`/`name`/`comment` reject CR, LF, null, VT, FF, NEL, LS and PS; caps are 4096/120/500 bytes (after trimming), and an empty or whitespace-only value is refused too.
- Send a managed entry's command exactly as a shell would run it, and do not escape `%`: the kit writes it into the crontab as `\%` so cron runs the command unchanged and reads it back the same way. A `\%` you send is escaped again and runs as `\%`, backslash included. Raw lines in a `hoody cron crontabs set` body are written as given, so a `%` there follows crontab rules: a bare `%` ends the command, and `\%` is a literal `%`.
- A managed entry's command is read back from the spool exactly as written, runs of whitespace included, so a later write for that user stores it unchanged: `echo "a  b"` stays `echo "a  b"`.
- `expires_at` RFC 3339, strictly future.
- Body cap 256 KiB by default, which the deployment can change, AND 10,000 lines; duplicate entry id rejected, and a duplicate `id=` within one metadata line is rejected.
- **`hoody cron crontabs set` replaces the whole crontab.** `hoody cron crontabs get` returns each managed entry as its `# hoody-cron:` metadata line followed by its rule line, and PUT parses those pairs back into the same managed entries with the same ids. So a read, edit, write cycle keeps every managed entry whose two lines are still in the body, except one whose `expires_at` has passed by the time of the write (it is dropped and counted in `removed_expired`); a managed entry left out of the body is deleted. Edit the text from `hoody cron crontabs get` instead of writing a fresh body, and do not re-create managed entries after a PUT: they are still there. Re-creating an identical entry answers 200 with the existing one and writes nothing; the same schedule and command with a different name, comment, `expires_at` or `enabled` is `409 ENTRY_EXISTS` (details give its id), so change it with PATCH. Comment or blank lines placed between a metadata line and its rule line are dropped.
- A PUT body may contain `# hoody-cron:` metadata lines written by the caller. The kit revalidates every managed entry it parses from them (schedule, command, name, comment) and rejects duplicate ids, but it does not check where the metadata came from: a well-formed pair written by hand is accepted as a managed entry, and a metadata line it cannot parse or pair is kept as a raw line, except one with two `id=` fields, which refuses the whole body with `400 INVALID_ID`. Every other non-comment line gets the syntax check of `crontab(1)`: a line it would refuse is `400 INVALID_CRONTAB` naming that line, and nothing is written.
- `hoody cron entries list`/`hoody cron entries get` clean expired entries before serializing under a per-user mutex — a GET can mutate the spool.
- `hoody cron entries list` items have `type: "managed"` or `"raw"`; only `managed` items carry `id`.
- Sweep every 60s default; per-user lock.

## Common errors

Error bodies are `{ code, message, details }`, except where noted.

- `409 STORED_CRONTAB_INVALID` — the crontab already stored for the user cannot be used, for example a Unicode line break, a `# hoody-cron:` line with two id fields, a line or byte count over the cap, or a stored line that `crontab(1)` refuses when a delete or the expiry sweep writes back the remaining lines, or when a create or update finds a stored raw line it refuses; nothing in your request is wrong. Read `details` for the reason. Repair it with `hoody cron crontabs set` (workflow 4).
- `400 INVALID_EXPIRES_AT` / `EXPIRES_IN_PAST`.
- `400 INVALID_SCHEDULE / Invalid schedule` — Vixie 5-field plus `@`-macros only; Quartz / 6-field rejected.
- `400 INVALID_USER` (bad user name), `INVALID_COMMAND`, `INVALID_NAME`, `INVALID_COMMENT`: a field failed validation (see Quirks for the rules).
- `400 INVALID_ID`: the `{id}` path segment is not a UUID (`Entry id must be a UUID`), or a `hoody cron crontabs set` body holds two managed entries with the same id, or a `# hoody-cron:` line with two `id=` fields (`Invalid id`).
- `400 INVALID_PAGINATION`: `page` must be 1 or more and `limit` 1 to 200 (default 50). The CLI list commands walk the pages and send at most 200 per request, so a positive integer `--limit` above 200 is a total cap, not a refusal; a `--limit` that is not a positive integer is sent as typed and can be refused.
- `404 USER_NOT_FOUND`: the system user lookup did not find the user. `404 ENTRY_NOT_FOUND`: no managed entry has that id (it may have expired and been swept).
- `413 PAYLOAD_TOO_LARGE`: a request body over the size cap (256 KiB by default), or a crontab over 10,000 lines or over its separate byte ceiling of about 40 MB, which only a deployment that raised the size cap can reach.
- `415 UNSUPPORTED_MEDIA_TYPE`: the Content-Type is neither `application/json` nor an `application/*+json` type. `400 INVALID_JSON`: the body is not valid JSON. `400 INVALID_BODY`: the JSON does not match the request fields (a missing or mistyped field).
- `500 BACKEND_ERROR` (`Internal server error`): a `crontab(1)` subprocess or I/O operation fails for a backend reason or times out (a read, and each step of a write — feeding stdin, then waiting for exit — gets 30 s). A recognized syntax refusal by `crontab(1)` is `400 INVALID_CRONTAB`; a delete or expiry cleanup maps a refusal of the remaining stored content to `409 STORED_CRONTAB_INVALID`, as does a create or update when the stored crontab holds a raw line identified as refused.
- `403 Forbidden` — Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only. The body is the plain text `Forbidden`, not JSON.

## Related namespaces

- `terminal`, `daemon`, `exec`, `watch`, `files`.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `hoody computers get` first.

### 1. Set up a nightly DB backup with trial-run dry-fire

**Goal:** schedule `pg_dump` daily at 02:00 in the computer's LOCAL timezone unless a `CRON_TZ=` or `TZ=` line earlier in that user's crontab applies (the entry then reads `tz_override: true` with a warning); the kit does no TZ conversion, and only `expires_at` is UTC-anchored, set the entry to expire one year from now; first verify it actually fires by running it every minute for one cycle.

**Step 1 — create the entry.** Capture the returned `id`; `schedule_human` should read `"At 02:00 every day"`.

```bash
ID=$(hoody --computer "$C" cron entries create root \
  --schedule '0 2 * * *' \
  --command 'pg_dump -U postgres mydb | gzip > /backups/db-$(date +%F).sql.gz' \
  --name nightly-db-backup \
  --expires-at "$(date -u -d '+1 year' +%FT%TZ)" \
  -o json | jq -r '.id')
```

**Step 2 — trial-run** by tightening to every minute.

```bash
hoody --computer "$C" cron entries update root "$ID" \
  --schedule '* * * * *' --comment 'TEST MODE — revert before merge'
```

Wait ~70 s, then list the entry's runs (`hoody --computer "$C" cron runs list --entry-id "$ID"`) or read the entry's `last_run` to confirm cron actually fired the job. Runs are reported only for an entry whose `run_reports` is `true`: the entry is enabled, its shell is POSIX, and its stored rule carries the current reporter's prefix. Check the field before relying on run reports. A run started with Run now is recorded whatever `run_reports` says, so confirm that cron fired from a run whose `trigger` is `timer` and that started after the trial began.

**Step 3 — promote back to nightly** with a clean comment.

```bash
hoody --computer "$C" cron entries update root "$ID" \
  --schedule '0 2 * * *' --comment 'production schedule'
```

### 2. Maintenance window — pause every managed job, do work, resume

**Goal:** disable every managed entry of one user's crontab during a 30-min DB migration; re-enable once clean. Raw crontab lines (entries with `type` `raw`) and other users' crontabs are not touched and keep running: pause those separately, or first convert them to managed entries (example 3 below).

**Step 1 — capture every enabled managed id.** The listing is paginated (50 per page by default, at most 200), so over HTTP read every page before filtering: a job left on a later page stays enabled through the migration. The CLI fetches every page itself, up to 10,000 items or 1,000 requests, so check that it returned `total` rows. Run steps 1 and 2 as one script that exits on any listing or update failure; a partial list or a failed disable leaves jobs enabled. A successful run alone does not prove every job is off: each page is read from the live crontab after expired entries are removed, so an entry that expires, or one added or removed by someone else, between two pages shifts the rows and a job can be skipped. Keep the crontab still while you collect and disable (no other edits to this user's crontab, no entry due to expire in the window), then read every page again and start the migration only when no managed entry is still enabled.

```bash
# One call fetches every page.
body=$(hoody --computer "$C" cron entries list root -o json) \
  || { echo "listing failed" >&2; exit 1; }
[ "$(jq '.entries | length' <<<"$body")" -eq "$(jq .total <<<"$body")" ] || { echo "listing incomplete" >&2; exit 1; }
IDS=$(jq -r '.entries[] | select(.type=="managed" and .enabled) | .id' <<<"$body") \
  || { echo "unreadable listing" >&2; exit 1; }
```

**Step 2 — bulk disable.**

```bash
# --no-enabled sends {"enabled":false}; --enabled sends true.
for id in $IDS; do
  hoody --computer "$C" cron entries update root "$id" --no-enabled >/dev/null \
    || { echo "disable failed for $id: do not start the migration" >&2; exit 1; }
done
```

**Step 3 — run your migration. Step 4 — bulk re-enable** the captured ids (same loop with `enabled: true`, that is `--enabled`). After a failed step 2, re-enable the same list: the entries disabled before the failure are still disabled. Entries pick up at their next regular tick; no missed-window catch-up.

### 3. Migrate a hand-written crontab into managed entries

**Goal:** convert legacy raw lines (no `id`, no metadata) into managed entries with names + lifecycle fields, then remove the raw originals so nothing runs twice.

**Step 1 — collect the raw lines to migrate.** `hoody cron entries list` returns hand-written lines as `{ type: 'raw', line }` items; managed entries are `type: 'managed'` and are left alone. Before you change anything, read every page and stop if a raw item's `line`, after trimming leading whitespace, starts with `# hoody-cron:`: the parser treats a metadata line that lacks an id, `created_at` or `updated_at` as an ordinary comment, so the rule under it is a raw job, and the metadata-aware filters in step 3 (and in example 10) would keep it. Repair that line first.

```bash
# Raw job lines only: the kit leaves `schedule`/`command` null on blanks, comments, environment assignments and lines with no command.
body=$(hoody --computer "$C" cron entries list root -o json) || exit 1   # every page
jq -e '[.entries[] | select(.type == "raw" and (.line | test("^\\s*# hoody-cron:")))] | length == 0' <<<"$body" >/dev/null \
  || { echo "malformed # hoody-cron: metadata: repair it first" >&2; exit 1; }
jq -r '.entries[] | select(.type=="raw" and .command != null) | .line' <<<"$body" \
  | awk '!seen[$0]++' > /tmp/cron-migrate.txt   # an identical raw line twice would make the second create fail (409): keep each once
cat /tmp/cron-migrate.txt
```

**Before step 2 — check every line for `%` and `\`.** A raw line is in crontab syntax and a managed command is not: in a raw line a bare `%` ends the command and sends the rest to its stdin, and `\%` and `\\` stand for `%` and `\`, while the kit escapes a managed command itself (see Quirks). The scripts below copy the command text as it is, so they keep a line's meaning only when it contains neither `%` nor `\`. Take any other line out of the step 1 list and migrate it by hand: write the command cron actually runs (`\%` becomes `%`, `\\` becomes `\`, and a `%`-delimited stdin becomes a pipe or a here-string) and create its entry from that. Step 3 drops only the lines still in the list, so remove the raw lines you migrated by hand the same way, or each of those jobs runs twice.

**Before step 2 — check the environment lines too.** The new entries go at the end of the crontab, so each job then runs with the environment the last `SHELL=`, `PATH=` or other assignment lines in the file set, not the lines above its old position. When an assignment changes between the jobs, migrate the jobs above it by hand as well, setting what they need in the command.

**Before step 2 — drop the lines a managed entry cannot hold.** Raw crontab syntax is wider than a managed entry's: a raw line may have no command at all (`@reboot` alone), which step 1 already leaves out (its `command` is null), and its schedule may use a form the managed API rejects, such as the reversed range `5-0`. A refused schedule stops the run after the creates before it. Take such lines out of the step 1 list and leave them raw.

**Duplicates.** A create with the same schedule and command returns the existing entry when its name, comment, expiry and enabled state also match, and is refused `409 ENTRY_EXISTS` otherwise. These snippets give every create its own name, so a crontab that holds an identical raw line twice would stop the migration at the second copy and leave that job scheduled three times (both raw lines and the first managed entry). The snippets above keep each identical line once and step 3 removes every copy of it, so a job that was listed twice runs once afterwards (a managed entry holds one copy). If it must keep running twice, take the line out of the step 1 list and leave both copies raw. Two lines that differ only in spacing but have the same schedule and command are refused the same way: migrate one and delete the other by hand.

**Step 2 — create a managed entry per line.** An `@macro` line (`@daily`, `@reboot`, ...) has a one-field schedule; any other line has five fields. The rest of the line is the command.

```bash
i=0; FAILED=0
while IFS= read -r LINE; do
  i=$((i + 1))
  case "$(echo "$LINE" | sed -E 's/^[[:space:]]+//')" in @*) F=1 ;; *) F=5 ;; esac
  SCHED=$(echo "$LINE" | awk -v f="$F" '{s=$1; for (k = 2; k <= f; k++) s = s " " $k; print s}')
  CMD=$(echo "$LINE" | sed -E "s/^[[:space:]]*([^[:space:]]+[[:space:]]+){$F}//")
  hoody --computer "$C" cron entries create root \
    --schedule "$SCHED" --command "$CMD" --name "migrated-$i" >/dev/null \
    || { echo "create failed for: $LINE" >&2; FAILED=1; break; }
done < /tmp/cron-migrate.txt
[ "$FAILED" = 0 ] || exit 1   # stop here: step 3 must not run after a failed create
```

**Step 3 — remove only the migrated raw lines.** Only after every create in step 2 succeeded: run steps 2 and 3 as one script, so the stop after a failed create also skips this step. After a partial failure, the managed entries created so far run alongside their raw lines (each of those jobs runs twice) until you delete them or finish the migration. Read the crontab text again (it now contains the new managed entries as `# hoody-cron:` metadata and rule line pairs), drop the raw lines from step 1 and write the rest back. A new managed entry's rule line can be the same text as the raw line it replaces (an enabled entry with no `expires_at` and no run-report prefix, for example under a non-POSIX `SHELL`, whose command has no `%` to escape), so match a line only when its nearest line above, past blank and comment lines, is not a valid `# hoody-cron:` metadata line (the parser pairs the two across blanks and comments; the step 1 check rules out the malformed ones): dropping a rule line leaves its metadata unpaired, and the managed entry is lost. The PUT keeps every managed entry that is still in the text, with the same id (one whose `expires_at` has passed by the time of the write is dropped). Do not PUT an empty crontab here: that would delete the entries step 2 just created. Send the `etag` from that read as a precondition on the write (`--if-match`): a crontab changed since the read answers `412 PRECONDITION_FAILED` and nothing is written, so read again, recompute and retry. Without it the write is unconditional and removes any entry another client added since your read.

```bash
[ -s /tmp/cron-migrate.txt ] || exit 0   # nothing to drop
BODY=$(hoody --computer "$C" cron crontabs get root -o json) || exit 1
CUR=$(jq -er '.crontab | select(type == "string")' <<<"$BODY") || exit 1
ETAG=$(jq -er '.etag' <<<"$BODY") || exit 1
# Drop a listed line only when its nearest rule or metadata line above is not "# hoody-cron:".
NEW=$(printf '%s\n' "$CUR" | awk 'NR == FNR { drop[$0] = 1; next }
  { keep = !($0 in drop) || prev ~ /^[[:space:]]*# hoody-cron:/
    if ($0 !~ /^[[:space:]]*($|#)/ || $0 ~ /^[[:space:]]*# hoody-cron(-disabled)?:/) prev = $0 } keep' /tmp/cron-migrate.txt -)
hoody --computer "$C" cron crontabs set root --crontab "$NEW" --if-match "$ETAG"
```

### 4. Hourly poll → tighten to every 5 minutes after a failure

**Goal:** a health-poller is failing intermittently; you want denser data without redeploying anything. Find by name, change schedule, restore later.

**Step 1 — find the entry id by name.** Names are not unique and the listing is paginated, so read every page and stop unless exactly one managed entry carries the name.

```bash
body=$(hoody --computer "$C" cron entries list root -o json) || exit 1   # every page
[ "$(jq '.entries | length' <<<"$body")" -eq "$(jq .total <<<"$body")" ] || { echo "listing incomplete" >&2; exit 1; }
ID=$(jq -r '.entries[] | select(.type=="managed" and .name=="health-poll") | .id' <<<"$body")
set -- $ID
[ $# -eq 1 ] || { echo "expected one entry named health-poll, found $#: $ID" >&2; exit 1; }
ID=$1
```

**Step 2 — tighten to `*/5 * * * *`.** `schedule_human` becomes `"Every 5 minutes"` immediately on the response.

```bash
hoody --computer "$C" cron entries update root "$ID" --schedule '*/5 * * * *'
```

**Step 3 — restore** to hourly once the investigation is over: the same call with `--schedule '0 * * * *'`.

### 5. Time-bounded experiment — auto-expire after 30 days

**Goal:** run a daily metrics sample for one month, then have it self-remove. Then learn how to extend or unbound the deadline.

**Step 1 — create with `expires_at`.** ISO 8601 RFC 3339; must be in the future.

```bash
ID=$(hoody --computer "$C" cron entries create root \
  --schedule @daily --command /opt/metrics/sample.sh \
  --name metrics-experiment --expires-at "$(date -u -d '+30 days' +%FT%TZ)" \
  -o json | jq -r .id)
```

After the timestamp passes, the kit's sweep, which runs every 60 seconds by default, **deletes** expired managed entries. `hoody cron entries list`/`hoody cron entries get` also clean expired entries before serializing, so once the sweep runs you can no longer read the expired entry — the entry simply disappears from listings. The `removed_expired` count on `hoody cron crontabs set` tells you how many expired entries got dropped during a bulk replace.

**Step 2a — extend the deadline mid-experiment** (to 60 days from now):

```bash
hoody --computer "$C" cron entries update root "$ID" \
  --expires-at "$(date -u -d '+60 days' +%FT%TZ)"
```

**Step 2b — make it permanent** instead. Pass `clear_expiration: true`. If you also send `expires_at` in the same call, `clear_expiration` silently wins (server returns `200` with `expires_at: null` — no error).

```bash
hoody --computer "$C" cron entries update root "$ID" --clear-expiration
```

### 6. Quick-disable a misbehaving entry by name

**Goal:** A teammate paged you about a runaway cron at 3am. You don't have the id, only the name they mentioned (`noisy-job`).

**Step 1 — find its id by name.** Read every page and require exactly one match; if several entries share the name, pick the intended id explicitly.

```bash
body=$(hoody --computer "$C" cron entries list root -o json) || exit 1   # every page
[ "$(jq '.entries | length' <<<"$body")" -eq "$(jq .total <<<"$body")" ] || { echo "listing incomplete" >&2; exit 1; }
ENTRY_ID=$(jq -r '.entries[] | select(.type=="managed" and .name=="noisy-job") | .id' <<<"$body")
set -- $ENTRY_ID
[ $# -eq 1 ] || { echo "expected one entry named noisy-job, found $#: $ENTRY_ID" >&2; exit 1; }
ENTRY_ID=$1
```

**Step 2 — disable it (entry stays in the listing for forensics; cron won't fire it).**

```bash
hoody --computer "$C" cron entries update root "$ENTRY_ID" \
  --no-enabled --comment "disabled $(date -u +%FT%TZ) — investigating"
```

**Step 3 — re-enable later** by calling the same update with `enabled: true`, that is `--enabled`.

### 7. Audit which users on the computer have any cron entries

**Goal:** compliance question — "who has scheduled jobs?". A computer has 60+ system users, more than the default page of 50, so read every page.

`hoody cron crontabs list` returns one record per account in `/etc/passwd` whose name the kit accepts (`{ user, crontab, etag }`; a name longer than 32 bytes, starting with `-` or holding a character outside letters, digits, `_`, `.` and `-` is left out, and the list is sorted with duplicates removed), 50 per page by default and at most 200. Filter client-side for non-empty `crontab`.

An invalid stored crontab fails the whole page with `409 STORED_CRONTAB_INVALID`: the message names the user and `details` gives the reason. Repair it with `hoody cron crontabs set` (workflow 4), then run the audit again. A backend failure can also fail the page.

```bash
body=$(hoody --computer "$C" cron crontabs list -o json) || exit 1   # every page, up to 10,000 items
[ "$(jq '.items | length' <<<"$body")" -eq "$(jq .total <<<"$body")" ] || { echo "listing incomplete" >&2; exit 1; }
jq '.items[] | select(.crontab | test("\\S")) | {user, crontab}' <<<"$body"
```

For each non-empty user, drill in via `hoody cron entries list` for that user for the managed view, or read the `crontab` text directly from the listing above.

### 8. Atomic full-crontab replace from versioned config

**Goal:** your IaC layer keeps the canonical crontab as a string in Git; on deploy, push the whole thing. Warning: The canonical text becomes the whole crontab: raw lines not in it are removed, and so is every managed entry whose `# hoody-cron:` metadata and rule lines are not in it.

**Step 1 — snapshot current state** for forensics:

```bash
hoody --computer "$C" cron crontabs get root -o json > /tmp/cron-snapshot.json
```

**Step 2 — push the canonical config.** Body MUST use `application/json` or an `application/*+json` Content-Type (raw `text/plain` returns `415`). Response carries `removed_expired` (count of managed entries that were dropped because their `expires_at` had passed).

```bash
hoody --computer "$C" cron crontabs set root \
  --crontab "$(cat /etc/iac/canonical-crontab.txt)"
```

### 9. Update only the comment / metadata, leave the schedule untouched

**Goal:** add a runbook URL or owner tag without changing the schedule or the enabled state. PATCH is partial — fields you don't pass are not assigned.

```bash
hoody --computer "$C" cron entries update root "$ID" \
  --comment 'owner: @team · runbook: https://wiki.example.com/cron-x'
```

`updated_at` advances; `schedule`, `enabled` and `command` are unchanged.

### 10. Rotate-and-replace pattern — read, edit text, write back

**Goal:** a teammate wants ONE hand-written line gone without disturbing the rest. You don't have an id (it's raw). Match the whole line exactly, and skip a matching line whose nearest line above, past blank and comment lines, is a `# hoody-cron:` metadata line: that one is a managed entry's rule, provided the metadata is valid (read every page of `hoody cron entries list` first and stop if a raw item's `line`, after trimming leading whitespace, starts with `# hoody-cron:`, because the parser treats malformed metadata as a plain comment and the rule under it as a raw job, which this filter would keep; the parser pairs a metadata line with the next rule across blanks and comments), and dropping it orphans the entry. Every unprotected line equal to the text goes: if the crontab holds the same raw line twice, both copies are removed and the job no longer runs.

**Step 1 — fetch** the multi-line string and its `etag`. **Step 2 — edit client-side** (split, drop, rejoin). **Step 3 — write back** with the `etag` as a precondition (`--if-match`): a crontab changed since the read answers `412 PRECONDITION_FAILED` and nothing is written, so read again, recompute and retry; without it the write removes anything another client added since your read. Managed entries that have not expired survive: the fetched text holds each one as a `# hoody-cron:` metadata line plus its rule line, and the PUT parses them back with the same ids. One whose `expires_at` has passed by then is dropped, and the response's `removed_expired` counts those. Leave those lines untouched; there is nothing to re-create afterwards (an identical create answers 200 with the existing entry; one with the same schedule and command but different metadata answers `409 ENTRY_EXISTS`. A different schedule or command can create another entry).

```bash
# Check the read and the parse separately: a failed read must never become an empty PUT.
BODY=$(hoody --computer "$C" cron crontabs get root -o json) || exit 1
CUR=$(jq -er '.crontab | select(type == "string")' <<<"$BODY") || exit 1
ETAG=$(jq -er '.etag' <<<"$BODY") || exit 1
NEW=$(printf '%s\n' "$CUR" | awk -v target='*/30 * * * * /old.sh' \
  '{ keep = $0 != target || prev ~ /^[[:space:]]*# hoody-cron:/
     if ($0 !~ /^[[:space:]]*($|#)/ || $0 ~ /^[[:space:]]*# hoody-cron(-disabled)?:/) prev = $0 } keep')
hoody --computer "$C" cron crontabs set root --crontab "$NEW" --if-match "$ETAG"
```

## Reference

### `hoody cron` (12) — Cron scheduling

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody cron crontabs get` |  | read | get crontab | `cron.crontabs.get` | `hoody cron crontabs get alice` |
| `hoody cron crontabs list` |  | read | list all crontabs | `cron.crontabs.list` | `hoody cron crontabs list --page 10 --limit 10` |
| `hoody cron crontabs set` |  | write | put crontab | `cron.crontabs.set` | `hoody cron crontabs set alice --crontab <crontab>` |
| `hoody cron entries create` |  | write | create entry | `cron.entries.create` | `hoody cron entries create alice --command 'ls -la' --comment Hello --enabled --schedule '0 * * * *'` |
| `hoody cron entries delete` |  | destructive | delete entry | `cron.entries.delete` | `hoody cron entries delete alice 3fa85f64-5717-4562-b3fc-2c963f66afa6 -y` |
| `hoody cron entries get` |  | read | get entry | `cron.entries.get` | `hoody cron entries get alice 3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| `hoody cron entries list` |  | read | list entries | `cron.entries.list` | `hoody cron entries list alice --page 10 --limit 10` |
| `hoody cron entries update` |  | write | update entry | `cron.entries.update` | `hoody cron entries update alice 3fa85f64-5717-4562-b3fc-2c963f66afa6 --clear-expiration --command 'ls -la'` |
| `hoody cron events stream` |  | read | Live-tail cron events over Server-Sent Events: entries created, updated or deleted, crontabs changed, jobs started and finished. Filter with `--user`, `--entry-id` and `--types`; resumes from `--since-id` on reconnect. | `cron.events.stream` | `hoody cron events stream --user alice --entry-id 3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| `hoody cron health` |  | read | health check | `cron.kit.getHealth` | `hoody cron health` |
| `hoody cron open` |  | action | Open the Cron kit job manager in your browser |  | `hoody cron open` |
| `hoody cron runs list` |  | read | List the latest runs of managed jobs, newest first (kept on disk when it can be used, so a restart keeps them) | `cron.runs.list` | `hoody cron runs list --user alice --entry-id 3fa85f64-5717-4562-b3fc-2c963f66afa6` |

