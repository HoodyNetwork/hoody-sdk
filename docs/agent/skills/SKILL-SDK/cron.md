> _**SDK skill · `cron` namespace** · ~12,056 tokens · hoody-sdk v1.0.1_

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

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Schedule

`entries.create` takes a schedule + command (plus name/comment/expires_at/enabled) and returns the created entry with its `id`.

### 2. List

`entries.list` (`page`/`limit`, max 200). The SDK also offers auto-pagination helpers over the same endpoint: `client.cron.entries.listAll` and `client.cron.entries.listIterator`.

### 3. Edit / disable / extend

`entries.update` PATCH. `clear_expiration: true` overrides `expires_at`. `enabled: false` keeps rule prefixed `# hoody-cron-disabled:`.

### 4. Bulk replace

For a normal bulk replace, read with `crontabs.get` (sweep), edit the returned text, then call `crontabs.set` with the body — it revalidates `# hoody-cron:` blocks, and the response has `removed_expired`. If a read or entry call fails with `409 STORED_CRONTAB_INVALID` (the stored crontab cannot be used), read `details` and repair it by calling `crontabs.set` directly with a complete, valid replacement: PUT does not parse the stored crontab (and without `If-Match` a failed read of it does not stop the replace), and anything you leave out of the replacement is removed.

### 5. Audit all users

`crontabs.list` → paginated `{ items: [{ user, crontab, etag }], total, page, limit }`. The SDK also offers auto-pagination helpers over the same endpoint: `client.cron.crontabs.listAll` and `client.cron.crontabs.listIterator`.

## Quirks & gotchas

- `user`: matches `^[A-Za-z0-9_.-]{1,32}$` for the character class, but the validator additionally rejects a **leading** `-` (trailing `-` is allowed).
- Vixie 5-field plus standard `@`-macros; Quartz rejected.
- `command`/`name`/`comment` reject CR, LF, null, VT, FF, NEL, LS and PS; caps are 4096/120/500 bytes (after trimming), and an empty or whitespace-only value is refused too.
- Send a managed entry's command exactly as a shell would run it, and do not escape `%`: the kit writes it into the crontab as `\%` so cron runs the command unchanged and reads it back the same way. A `\%` you send is escaped again and runs as `\%`, backslash included. Raw lines in a `crontabs.set` body are written as given, so a `%` there follows crontab rules: a bare `%` ends the command, and `\%` is a literal `%`.
- A managed entry's command is read back from the spool exactly as written, runs of whitespace included, so a later write for that user stores it unchanged: `echo "a  b"` stays `echo "a  b"`.
- `expires_at` RFC 3339, strictly future.
- Body cap 256 KiB by default, which the deployment can change, AND 10,000 lines; duplicate entry id rejected, and a duplicate `id=` within one metadata line is rejected.
- **`crontabs.set` replaces the whole crontab.** `crontabs.get` returns each managed entry as its `# hoody-cron:` metadata line followed by its rule line, and PUT parses those pairs back into the same managed entries with the same ids. So a read, edit, write cycle keeps every managed entry whose two lines are still in the body, except one whose `expires_at` has passed by the time of the write (it is dropped and counted in `removed_expired`); a managed entry left out of the body is deleted. Edit the text from `crontabs.get` instead of writing a fresh body, and do not re-create managed entries after a PUT: they are still there. Re-creating an identical entry answers 200 with the existing one and writes nothing; the same schedule and command with a different name, comment, `expires_at` or `enabled` is `409 ENTRY_EXISTS` (details give its id), so change it with PATCH. Comment or blank lines placed between a metadata line and its rule line are dropped.
- A PUT body may contain `# hoody-cron:` metadata lines written by the caller. The kit revalidates every managed entry it parses from them (schedule, command, name, comment) and rejects duplicate ids, but it does not check where the metadata came from: a well-formed pair written by hand is accepted as a managed entry, and a metadata line it cannot parse or pair is kept as a raw line, except one with two `id=` fields, which refuses the whole body with `400 INVALID_ID`. Every other non-comment line gets the syntax check of `crontab(1)`: a line it would refuse is `400 INVALID_CRONTAB` naming that line, and nothing is written.
- `entries.list`/`entries.get` clean expired entries before serializing under a per-user mutex — a GET can mutate the spool.
- `entries.list` items have `type: "managed"` or `"raw"`; only `managed` items carry `id`.
- Sweep every 60s default; per-user lock.

## Common errors

Error bodies are `{ code, message, details }`, except where noted.

- `409 STORED_CRONTAB_INVALID` — the crontab already stored for the user cannot be used, for example a Unicode line break, a `# hoody-cron:` line with two id fields, a line or byte count over the cap, or a stored line that `crontab(1)` refuses when a delete or the expiry sweep writes back the remaining lines, or when a create or update finds a stored raw line it refuses; nothing in your request is wrong. Read `details` for the reason. Repair it with `crontabs.set` (workflow 4).
- `400 INVALID_EXPIRES_AT` / `EXPIRES_IN_PAST`.
- `400 INVALID_SCHEDULE / Invalid schedule` — Vixie 5-field plus `@`-macros only; Quartz / 6-field rejected.
- `400 INVALID_USER` (bad user name), `INVALID_COMMAND`, `INVALID_NAME`, `INVALID_COMMENT`: a field failed validation (see Quirks for the rules).
- `400 INVALID_ID`: the `{id}` path segment is not a UUID (`Entry id must be a UUID`), or a `crontabs.set` body holds two managed entries with the same id, or a `# hoody-cron:` line with two `id=` fields (`Invalid id`).
- `400 INVALID_PAGINATION`: `page` must be 1 or more and `limit` 1 to 200 (default 50).
- `404 USER_NOT_FOUND`: the system user lookup did not find the user. `404 ENTRY_NOT_FOUND`: no managed entry has that id (it may have expired and been swept).
- `413 PAYLOAD_TOO_LARGE`: a request body over the size cap (256 KiB by default), or a crontab over 10,000 lines or over its separate byte ceiling of about 40 MB, which only a deployment that raised the size cap can reach.
- `415 UNSUPPORTED_MEDIA_TYPE`: the Content-Type is neither `application/json` nor an `application/*+json` type. `400 INVALID_JSON`: the body is not valid JSON. `400 INVALID_BODY`: the JSON does not match the request fields (a missing or mistyped field).
- `500 BACKEND_ERROR` (`Internal server error`): a `crontab(1)` subprocess or I/O operation fails for a backend reason or times out (a read, and each step of a write — feeding stdin, then waiting for exit — gets 30 s). A recognized syntax refusal by `crontab(1)` is `400 INVALID_CRONTAB`; a delete or expiry cleanup maps a refusal of the remaining stored content to `409 STORED_CRONTAB_INVALID`, as does a create or update when the stored crontab holds a raw line identified as refused.
- `403 Forbidden` — Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only. The body is the plain text `Forbidden`, not JSON.

## Related namespaces

- `terminal`, `daemon`, `exec`, `watch`, `files`.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `computers.get` (`client.api.computers.get(computerId)`) first.

### 1. Set up a nightly DB backup with trial-run dry-fire

**Goal:** schedule `pg_dump` daily at 02:00 in the computer's LOCAL timezone unless a `CRON_TZ=` or `TZ=` line earlier in that user's crontab applies (the entry then reads `tz_override: true` with a warning); the kit does no TZ conversion, and only `expires_at` is UTC-anchored, set the entry to expire one year from now; first verify it actually fires by running it every minute for one cycle.

**Step 1 — create the entry.** Capture the returned `id`; `schedule_human` should read `"At 02:00 every day"`.

```typescript
const r = await client.cron.entries.create('root', {
  schedule: '0 2 * * *',
  command: 'pg_dump -U postgres mydb | gzip > /backups/db-$(date +%F).sql.gz',  // write `%` as is: the kit escapes it for cron
  name: 'nightly-db-backup',
  expires_at: new Date(Date.now() + 365 * 86_400_000).toISOString(),  // must be in the future
});
const id = r.data!.id;
```

**Step 2 — trial-run** by tightening to every minute.

```typescript
await client.cron.entries.update('root', id, {
  schedule: '* * * * *',
  comment: 'TEST MODE — revert before merge',
});
```

Wait ~70 s, then list the entry's runs (`client.cron.runs.list({ entry_id: id })`) or read the entry's `last_run` to confirm cron actually fired the job. Runs are reported only for an entry whose `run_reports` is `true`: the entry is enabled, its shell is POSIX, and its stored rule carries the current reporter's prefix. Check the field before relying on run reports. A run started with Run now is recorded whatever `run_reports` says, so confirm that cron fired from a run whose `trigger` is `timer` and that started after the trial began.

**Step 3 — promote back to nightly** with a clean comment.

```typescript
await client.cron.entries.update('root', id, {
  schedule: '0 2 * * *',
  comment: 'production schedule',
});
```

### 2. Maintenance window — pause every managed job, do work, resume

**Goal:** disable every managed entry of one user's crontab during a 30-min DB migration; re-enable once clean. Raw crontab lines (entries with `type` `raw`) and other users' crontabs are not touched and keep running: pause those separately, or first convert them to managed entries (example 3 below).

**Step 1 — capture every enabled managed id.** The listing is paginated (50 per page by default, at most 200), so over HTTP read every page before filtering: a job left on a later page stays enabled through the migration. The CLI fetches every page itself, up to 10,000 items or 1,000 requests, so check that it returned `total` rows. Run steps 1 and 2 as one script that exits on any listing or update failure; a partial list or a failed disable leaves jobs enabled. A successful run alone does not prove every job is off: each page is read from the live crontab after expired entries are removed, so an entry that expires, or one added or removed by someone else, between two pages shifts the rows and a job can be skipped. Keep the crontab still while you collect and disable (no other edits to this user's crontab, no entry due to expire in the window), then read every page again and start the migration only when no managed entry is still enabled.

```typescript
// listAll walks every page and resolves to the typed entries; a failed page throws.
const entries = await client.cron.entries.listAll('root');
const ids = entries.flatMap(e => (e.type === 'managed' && e.enabled ? [e.id] : []));
```

**Step 2 — bulk disable.**

```typescript
// One update at a time: a failed update throws before the next is sent, so no disable
// is still in flight when you stop or start recovery, and the migration never starts.
for (const id of ids) {
  await client.cron.entries.update('root', id, { enabled: false });
}
```

**Step 3 — run your migration. Step 4 — bulk re-enable** the captured ids (same loop with `enabled: true`). After a failed step 2, re-enable the same list: the entries disabled before the failure are still disabled. Entries pick up at their next regular tick; no missed-window catch-up.

### 3. Migrate a hand-written crontab into managed entries

**Goal:** convert legacy raw lines (no `id`, no metadata) into managed entries with names + lifecycle fields, then remove the raw originals so nothing runs twice.

**Step 1 — collect the raw lines to migrate.** `entries.list` returns hand-written lines as `{ type: 'raw', line }` items; managed entries are `type: 'managed'` and are left alone. Before you change anything, read every page and stop if a raw item's `line`, after trimming leading whitespace, starts with `# hoody-cron:`: the parser treats a metadata line that lacks an id, `created_at` or `updated_at` as an ordinary comment, so the rule under it is a raw job, and the metadata-aware filters in step 3 (and in example 10) would keep it. Repair that line first.

```typescript
const listed = await client.cron.entries.listAll('root');
// Raw job lines only: the kit leaves `schedule`/`command` null on blanks, comments, environment assignments and lines with no command.
if (listed.some(e => e.type === 'raw' && /^\s*# hoody-cron:/.test(e.line))) throw new Error('malformed # hoody-cron: metadata: repair it first');
const toMigrate = listed
  .flatMap(e => (e.type === 'raw' && e.command != null ? [e.line] : []))
  .filter((l, k, all) => all.indexOf(l) === k);  // an identical raw line twice would make the second create fail (409): keep each once
```

**Before step 2 — check every line for `%` and `\`.** A raw line is in crontab syntax and a managed command is not: in a raw line a bare `%` ends the command and sends the rest to its stdin, and `\%` and `\\` stand for `%` and `\`, while the kit escapes a managed command itself (see Quirks). The scripts below copy the command text as it is, so they keep a line's meaning only when it contains neither `%` nor `\`. Take any other line out of the step 1 list and migrate it by hand: write the command cron actually runs (`\%` becomes `%`, `\\` becomes `\`, and a `%`-delimited stdin becomes a pipe or a here-string) and create its entry from that. Step 3 drops only the lines still in the list, so remove the raw lines you migrated by hand the same way, or each of those jobs runs twice.

**Before step 2 — check the environment lines too.** The new entries go at the end of the crontab, so each job then runs with the environment the last `SHELL=`, `PATH=` or other assignment lines in the file set, not the lines above its old position. When an assignment changes between the jobs, migrate the jobs above it by hand as well, setting what they need in the command.

**Before step 2 — drop the lines a managed entry cannot hold.** Raw crontab syntax is wider than a managed entry's: a raw line may have no command at all (`@reboot` alone), which step 1 already leaves out (its `command` is null), and its schedule may use a form the managed API rejects, such as the reversed range `5-0`. A refused schedule stops the run after the creates before it. Take such lines out of the step 1 list and leave them raw.

**Duplicates.** A create with the same schedule and command returns the existing entry when its name, comment, expiry and enabled state also match, and is refused `409 ENTRY_EXISTS` otherwise. These snippets give every create its own name, so a crontab that holds an identical raw line twice would stop the migration at the second copy and leave that job scheduled three times (both raw lines and the first managed entry). The snippets above keep each identical line once and step 3 removes every copy of it, so a job that was listed twice runs once afterwards (a managed entry holds one copy). If it must keep running twice, take the line out of the step 1 list and leave both copies raw. Two lines that differ only in spacing but have the same schedule and command are refused the same way: migrate one and delete the other by hand.

**Step 2 — create a managed entry per line.** An `@macro` line (`@daily`, `@reboot`, ...) has a one-field schedule; any other line has five fields. The rest of the line is the command.

```typescript
// A failed create throws, which ends the script before the step 3 PUT runs.
let i = 0;
for (const line of toMigrate) {
  const t = line.trim();
  const n = t.startsWith('@') ? 1 : 5;
  await client.cron.entries.create('root', {
    schedule: t.split(/\s+/).slice(0, n).join(' '),
    command: t.replace(new RegExp(`^(\\S+\\s+){${n}}`), ''),
    name: `migrated-${++i}`,
  });
}
```

**Step 3 — remove only the migrated raw lines.** Only after every create in step 2 succeeded: run steps 2 and 3 as one script, so the stop after a failed create also skips this step. After a partial failure, the managed entries created so far run alongside their raw lines (each of those jobs runs twice) until you delete them or finish the migration. Read the crontab text again (it now contains the new managed entries as `# hoody-cron:` metadata and rule line pairs), drop the raw lines from step 1 and write the rest back. A new managed entry's rule line can be the same text as the raw line it replaces (an enabled entry with no `expires_at` and no run-report prefix, for example under a non-POSIX `SHELL`, whose command has no `%` to escape), so match a line only when its nearest line above, past blank and comment lines, is not a valid `# hoody-cron:` metadata line (the parser pairs the two across blanks and comments; the step 1 check rules out the malformed ones): dropping a rule line leaves its metadata unpaired, and the managed entry is lost. The PUT keeps every managed entry that is still in the text, with the same id (one whose `expires_at` has passed by the time of the write is dropped). Do not PUT an empty crontab here: that would delete the entries step 2 just created. Send the `etag` from that read as a precondition on the write (the `ifMatch` option): a crontab changed since the read answers `412 PRECONDITION_FAILED` and nothing is written, so read again, recompute and retry. Without it the write is unconditional and removes any entry another client added since your read.

```typescript
const got = (await client.cron.crontabs.get('root')).data!;
const cur = got.crontab;
const drop = new Set(toMigrate);
// Keep a listed line when a metadata line precedes it, past blanks and comments: it is a managed entry's rule.
let prev = '';
const kept = cur.split('\n').filter((l) => {
  const keep = !drop.has(l) || /^\s*# hoody-cron:/.test(prev);
  if (!/^\s*($|#)/.test(l) || /^\s*# hoody-cron(-disabled)?:/.test(l)) prev = l;
  return keep;
});
await client.cron.crontabs.set('root', { crontab: kept.join('\n') }, { ifMatch: got.etag });
```

### 4. Hourly poll → tighten to every 5 minutes after a failure

**Goal:** a health-poller is failing intermittently; you want denser data without redeploying anything. Find by name, change schedule, restore later.

**Step 1 — find the entry id by name.** Names are not unique and the listing is paginated, so read every page and stop unless exactly one managed entry carries the name.

```typescript
// Names are not unique: require exactly one match across every page.
const hits = (await client.cron.entries.listAll('root'))
  .filter(e => e.type === 'managed' && e.name === 'health-poll');
const [hit] = hits;
if (hits.length !== 1 || hit?.type !== 'managed') throw new Error(`expected one health-poll, found ${hits.length}`);
const id = hit.id;
```

**Step 2 — tighten to `*/5 * * * *`.** `schedule_human` becomes `"Every 5 minutes"` immediately on the response.

```typescript
await client.cron.entries.update('root', id, { schedule: '*/5 * * * *' });
```

**Step 3 — restore** to hourly once the investigation is over: the same call with `{ schedule: '0 * * * *' }`.

### 5. Time-bounded experiment — auto-expire after 30 days

**Goal:** run a daily metrics sample for one month, then have it self-remove. Then learn how to extend or unbound the deadline.

**Step 1 — create with `expires_at`.** ISO 8601 RFC 3339; must be in the future.

```typescript
const r = await client.cron.entries.create('root', {
  schedule: '@daily',
  command: '/opt/metrics/sample.sh',
  name: 'metrics-experiment',
  expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
});
const id = r.data!.id;
```

After the timestamp passes, the kit's sweep, which runs every 60 seconds by default, **deletes** expired managed entries. `entries.list`/`entries.get` also clean expired entries before serializing, so once the sweep runs you can no longer read the expired entry — the entry simply disappears from listings. The `removed_expired` count on `crontabs.set` tells you how many expired entries got dropped during a bulk replace.

**Step 2a — extend the deadline mid-experiment** (to 60 days from now):

```typescript
await client.cron.entries.update('root', id, {
  expires_at: new Date(Date.now() + 60 * 86_400_000).toISOString(),
});
```

**Step 2b — make it permanent** instead. Pass `clear_expiration: true`. If you also send `expires_at` in the same call, `clear_expiration` silently wins (server returns `200` with `expires_at: null` — no error).

```typescript
await client.cron.entries.update('root', id, { clear_expiration: true });
```

### 6. Quick-disable a misbehaving entry by name

**Goal:** A teammate paged you about a runaway cron at 3am. You don't have the id, only the name they mentioned (`noisy-job`).

**Step 1 — find its id by name.** Read every page and require exactly one match; if several entries share the name, pick the intended id explicitly.

```typescript
// Names are not unique: require exactly one match across every page.
const matches = (await client.cron.entries.listAll('root'))
  .filter(e => e.type === 'managed' && e.name === 'noisy-job');
const [entry] = matches;
if (matches.length !== 1 || entry?.type !== 'managed') throw new Error(`expected one noisy-job, found ${matches.length}`);
const entryId = entry.id;
```

**Step 2 — disable it (entry stays in the listing for forensics; cron won't fire it).**

```typescript
await client.cron.entries.update('root', entryId, {
  enabled: false,
  comment: `disabled ${new Date().toISOString()} — investigating`,
});
```

**Step 3 — re-enable later** by calling the same update with `enabled: true`.

### 7. Audit which users on the computer have any cron entries

**Goal:** compliance question — "who has scheduled jobs?". A computer has 60+ system users, more than the default page of 50, so read every page.

`crontabs.list` returns one record per account in `/etc/passwd` whose name the kit accepts (`{ user, crontab, etag }`; a name longer than 32 bytes, starting with `-` or holding a character outside letters, digits, `_`, `.` and `-` is left out, and the list is sorted with duplicates removed), 50 per page by default and at most 200. Filter client-side for non-empty `crontab`.

An invalid stored crontab fails the whole page with `409 STORED_CRONTAB_INVALID`: the message names the user and `details` gives the reason. Repair it with `crontabs.set` (workflow 4), then run the audit again. A backend failure can also fail the page.

```typescript
// crontabs.listAll walks every page; each element is typed { user, crontab, etag }.
const accounts = await client.cron.crontabs.listAll();
const usersWithCron = accounts.filter(a => a.crontab.trim() !== '');
```

For each non-empty user, drill in via `entries.list` for that user for the managed view, or read the `crontab` text directly from the listing above.

### 8. Atomic full-crontab replace from versioned config

**Goal:** your IaC layer keeps the canonical crontab as a string in Git; on deploy, push the whole thing. Warning: The canonical text becomes the whole crontab: raw lines not in it are removed, and so is every managed entry whose `# hoody-cron:` metadata and rule lines are not in it.

**Step 1 — snapshot current state** for forensics:

```typescript
const snapshot = (await client.cron.crontabs.get('root')).data;
```

**Step 2 — push the canonical config.** Body MUST use `application/json` or an `application/*+json` Content-Type (raw `text/plain` returns `415`). Response carries `removed_expired` (count of managed entries that were dropped because their `expires_at` had passed).

```typescript
import { readFileSync } from 'fs';
const newCrontab = readFileSync('/etc/iac/canonical-crontab.txt', 'utf8');
await client.cron.crontabs.set('root', { crontab: newCrontab });
```

### 9. Update only the comment / metadata, leave the schedule untouched

**Goal:** add a runbook URL or owner tag without changing the schedule or the enabled state. PATCH is partial — fields you don't pass are not assigned.

```typescript
await client.cron.entries.update('root', id, {
  comment: 'owner: @team · runbook: https://wiki.example.com/cron-x',
});
```

`updated_at` advances; `schedule`, `enabled` and `command` are unchanged.

### 10. Rotate-and-replace pattern — read, edit text, write back

**Goal:** a teammate wants ONE hand-written line gone without disturbing the rest. You don't have an id (it's raw). Match the whole line exactly, and skip a matching line whose nearest line above, past blank and comment lines, is a `# hoody-cron:` metadata line: that one is a managed entry's rule, provided the metadata is valid (read every page of `entries.list` first and stop if a raw item's `line`, after trimming leading whitespace, starts with `# hoody-cron:`, because the parser treats malformed metadata as a plain comment and the rule under it as a raw job, which this filter would keep; the parser pairs a metadata line with the next rule across blanks and comments), and dropping it orphans the entry. Every unprotected line equal to the text goes: if the crontab holds the same raw line twice, both copies are removed and the job no longer runs.

**Step 1 — fetch** the multi-line string and its `etag`. **Step 2 — edit client-side** (split, drop, rejoin). **Step 3 — write back** with the `etag` as a precondition (the `ifMatch` option): a crontab changed since the read answers `412 PRECONDITION_FAILED` and nothing is written, so read again, recompute and retry; without it the write removes anything another client added since your read. Managed entries that have not expired survive: the fetched text holds each one as a `# hoody-cron:` metadata line plus its rule line, and the PUT parses them back with the same ids. One whose `expires_at` has passed by then is dropped, and the response's `removed_expired` counts those. Leave those lines untouched; there is nothing to re-create afterwards (an identical create answers 200 with the existing entry; one with the same schedule and command but different metadata answers `409 ENTRY_EXISTS`. A different schedule or command can create another entry).

```typescript
const got = (await client.cron.crontabs.get('root')).data!;
const cur = got.crontab;
let prev = '';
const next = cur.split('\n').filter((l) => {
  const keep = l !== '*/30 * * * * /old.sh' || /^\s*# hoody-cron:/.test(prev);
  if (!/^\s*($|#)/.test(l) || /^\s*# hoody-cron(-disabled)?:/.test(l)) prev = l;
  return keep;
}).join('\n');
await client.cron.crontabs.set('root', { crontab: next }, { ifMatch: got.etag });
```

## Reference

**Accessor:** `client.cron`  |  **Import:** `import * as cron from 'hoody-sdk/cron'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, computerId?, serviceIndex?, serverName? }` (`server` is the older spelling of `serverName`, which wins when both are set), which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are set by the client and are refused with a `TypeError` before the call is sent: configure the token on the client, a kit credential as `kitAuth` on `withComputer()` or the client config (`middlewareContext.kitAuth` replaces the client's `kitAuth` for one call), and use another client for another identity), `cache` (ignored here: only an `api` GET is cached, never a GET to a kit host), `responseIsFinal` (`true`: never sent again once it may have reached the server), `keyedInProgressWait` (`false`: a 409 IDEMPOTENCY_REQUEST_IN_PROGRESS is the answer, not asked again), `redactBodyKeys` (body keys whose values an ApiError shows as [REDACTED]) and `maxResponseBytes` (a response body over this many bytes is refused with code RESPONSE_TOO_LARGE, and reading stops) (no `_realm`: that one is control-plane only). When the signature shows an options object (`options?: object` is one that takes the transport options only), the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself keeps the argument order it displays. A `wsOptions` argument (WebSocket methods only) accepts just `reconnect`, `connectTimeoutMs` and `transport`; the other transport options (`timeoutMs`, `signal`, …) stay in the request options the signature shows, never in `wsOptions`.

**Reading a method.** A method that shows no **Returns:** returns the response type named after it, the words after `client.` joined in PascalCase plus `Response`: `client.cron.crontabs.get()` returns `Promise<CronCrontabsGetResponse>`. `Item<R>` in a pagination helper's Returns is shorthand on this page, not an exported type: the element type of the item array the helper reads from response `R`, at the path the same line names. A pagination helper written `xAll(/* the arguments of x */)` takes exactly the arguments of `x`, described under `x`.

### `client.cron.entries` (12) — Managed entry CRUD

#### `create` — Create Entry

```typescript
client.cron.entries.create(user: string, data: CronEntriesCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `data` | `CronEntriesCreateRequest` | body | Yes | Shape: `CreateEntryRequest` under Body schemas. |

**HTTP:** `POST /api/v1/cron/users/{user}/entries`
**CLI:** `hoody cron entries create <user> --schedule <schedule> --command <command>`

---

#### `delete` — Delete Entry

```typescript
client.cron.entries.delete(user: string, id: string, options?: { expected_revision?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `id` | `string` | path | Yes | Managed entry id (UUID) |
| `expected_revision` | `string` | query | No | The entry's revision as last read: the entry is deleted only if it is still at it (412 otherwise) |

**HTTP:** `DELETE /api/v1/cron/users/{user}/entries/{id}`
**CLI:** `hoody cron entries delete <user> <id>`

---

#### `describeSchedule` — Describe Schedule

```typescript
client.cron.entries.describeSchedule(data: CronEntriesDescribeScheduleRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `CronEntriesDescribeScheduleRequest` | body | Yes | Shape: `DescribeScheduleRequest` under Body schemas. |

**HTTP:** `POST /api/v1/cron/schedule/describe`

---

#### `get` — Get Entry

```typescript
client.cron.entries.get(user: string, id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `id` | `string` | path | Yes | Managed entry id (UUID) |

**HTTP:** `GET /api/v1/cron/users/{user}/entries/{id}`
**CLI:** `hoody cron entries get <user> <id>`

---

#### `list` — List Entries

```typescript
client.cron.entries.list(user: string, options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `page` | `number` | query | No | Page number (1-based, default 1) |
| `limit` | `number` | query | No | Items per page (default 50, max 200) |

**HTTP:** `GET /api/v1/cron/users/{user}/entries`
**CLI:** `hoody cron entries list <user>`

---

#### `listAll` — List Entries (collect all pages)

```typescript
client.cron.entries.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<CronEntriesListResponse>[]>` — every item of `data.entries`, pages collected from the page you pass, the first by default (`list()` fetches one page). Each item is `CrontabEntryView`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/cron/users/{user}/entries`
**CLI:** `hoody cron entries list <user>`

---

#### `listForAllUsers` — List All Entries

```typescript
client.cron.entries.listForAllUsers(options?: { user?: string; page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | query | No | Only this user's entries |
| `page` | `number` | query | No | Page number (1-based, default 1) |
| `limit` | `number` | query | No | Items per page (default 50, max 200) |

**HTTP:** `GET /api/v1/cron/entries`

---

#### `listForAllUsersAll` — List All Entries (collect all pages)

```typescript
client.cron.entries.listForAllUsersAll(/* the arguments of listForAllUsers */)
```

**Returns:** `Promise<Item<CronEntriesListForAllUsersResponse>[]>` — every item of `data.entries`, pages collected from the page you pass, the first by default (`listForAllUsers()` fetches one page). Each item is `AllEntriesItem`. `listForAllUsersIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/cron/entries`

---

#### `listForAllUsersIterator` — List All Entries (async iterator)

```typescript
client.cron.entries.listForAllUsersIterator(/* the arguments of listForAllUsers */)
```

**Returns:** `AsyncGenerator<Item<CronEntriesListForAllUsersResponse>, void, unknown>` — one item of `data.entries` per step, the next page fetched on demand from the page you pass, the first by default (`listForAllUsers()` fetches one page). Each item is `AllEntriesItem`.  |  **HTTP:** `GET /api/v1/cron/entries`

---

#### `listIterator` — List Entries (async iterator)

```typescript
client.cron.entries.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<CronEntriesListResponse>, void, unknown>` — one item of `data.entries` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page). Each item is `CrontabEntryView`.  |  **HTTP:** `GET /api/v1/cron/users/{user}/entries`
**CLI:** `hoody cron entries list <user>`

---

#### `run` — Run Entry

```typescript
client.cron.entries.run(user: string, id: string, data: CronEntriesRunRequest, options?: { idempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `id` | `string` | path | Yes | Managed entry id (UUID) |
| `idempotencyKey` | `string` | header `Idempotency-Key` | No | A key new for this operation (1 to 255 visible ASCII characters). It is saved before the command starts: the same key and body answer the receipt of that request (200, or the same 500 when the command could not start; `state` follows the run) and never run the command again for 24 hours, and the receipt is read at GET /api/v1/cron/runs?key=. Without it, every accepted request runs the command again, so a retry cannot be told from a new request |
| `data` | `CronEntriesRunRequest` | body | Yes | Shape: `RunEntryRequest` under Body schemas. |

**HTTP:** `POST /api/v1/cron/users/{user}/entries/{id}/run`

---

#### `update` — Update Entry

```typescript
client.cron.entries.update(user: string, id: string, data: CronEntriesUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `id` | `string` | path | Yes | Managed entry id (UUID) |
| `data` | `CronEntriesUpdateRequest` | body | Yes | Shape: `UpdateEntryRequest` under Body schemas. |

**HTTP:** `PATCH /api/v1/cron/users/{user}/entries/{id}`
**CLI:** `hoody cron entries update <user> <id>`

---

### `client.cron.crontabs` (5) — Raw crontab management

#### `get` — Get Crontab

```typescript
client.cron.crontabs.get(user: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |

**HTTP:** `GET /api/v1/cron/users/{user}/crontab`
**CLI:** `hoody cron crontabs get <user>`

---

#### `list` — List All Crontabs

```typescript
client.cron.crontabs.list(options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number (1-based, default 1) |
| `limit` | `number` | query | No | Items per page (default 50, max 200) |

**HTTP:** `GET /api/v1/cron/crontab`
**CLI:** `hoody cron crontabs list`

---

#### `listAll` — List All Crontabs (collect all pages)

```typescript
client.cron.crontabs.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<CronCrontabsListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). Each item is `RawCrontabResponse`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/cron/crontab`
**CLI:** `hoody cron crontabs list`

---

#### `listIterator` — List All Crontabs (async iterator)

```typescript
client.cron.crontabs.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<CronCrontabsListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page). Each item is `RawCrontabResponse`.  |  **HTTP:** `GET /api/v1/cron/crontab`
**CLI:** `hoody cron crontabs list`

---

#### `set` — Put Crontab

```typescript
client.cron.crontabs.set(user: string, data: CronCrontabsSetRequest, options?: { ifMatch?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `ifMatch` | `string` | header `If-Match` | No | Optional precondition (RFC 9110): replace the crontab only if it is still at one of these ETags, as returned by a read of it (the ETag header or the etag field of a crontab or entries read, or of the previous replace): a quoted tag, a comma-separated list of them, or `*` for any. A weak tag never matches. Otherwise 412 PRECONDITION_FAILED and nothing is written. Without it the replace is unconditional and removes entries another client added since your read. |
| `data` | `CronCrontabsSetRequest` | body | Yes | Shape: `RawCrontabRequest` under Body schemas. |

**HTTP:** `PUT /api/v1/cron/users/{user}/crontab`
**CLI:** `hoody cron crontabs set <user> --crontab <crontab>`

---

### `client.cron.runs` (1) — Latest runs of managed jobs

#### `list` — The latest runs of managed jobs, newest first, from the reports the jobs' crontab lines send (see the event stream). The service keeps the runs still running (a scheduled job that starts while 500 runs, scheduled and Run now together, are already running still runs but is not listed; Run now has its own limit of 16 simultaneous runs by default) and, for each entry, its last 50 ended runs of the last 30 days, at most 10 000 ended runs in all, in a history file capped at 5 MiB (the oldest ended runs are dropped first). They are kept on disk, so a restart keeps them: a run still running at the restart is followed again, or recorded `lost` when its shell is gone. When the disk cannot be used, or a write fails later, runs from then on are kept in memory only and a restart loses them; runs that reached the disk before stay (`GET /api/v1/cron/info` `history_persisted` says which). Page back with `before` (the `started_at` of the last run received). Raw lines and entries in a crontab whose `SHELL` is not a POSIX shell have no scheduled runs listed; Run now runs are listed.

```typescript
client.cron.runs.list(options?: { user?: string; entry_id?: string; run_id?: string; key?: string; before?: string; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | query | No | Only runs of this user's jobs |
| `entry_id` | `string` | query | No | Only runs of this managed entry |
| `run_id` | `string` | query | No | Only the run with this id |
| `key` | `string` | query | No | Only the run started by the Run now request with this Idempotency-Key, and that request's receipt (`receipt`) |
| `before` | `string` | query | No | Only runs that started before this RFC 3339 time: pass the started_at of the last run received for the next page |
| `limit` | `number` | query | No | Runs to return, newest first (default 50, max 200) |

**HTTP:** `GET /api/v1/cron/runs`
**CLI:** `hoody cron runs list`

---

### `client.cron.events` (2) — Live events about entries, crontabs and job runs, and the latest runs

#### `connect` — Live events about the crontabs of the computer's users: managed entries created, updated or deleted (`source` api, expired or external), whole crontabs replaced or edited (`crontab_changed`, sent after the entry events of that change), and runs of managed jobs (`job_started`, `job_finished`). Edits made outside this service, such as `crontab -e` or `crontab -r`, appear within about 2 seconds with `source: external`. Job events come from the crontab line of an enabled managed entry, which reports its own start and end: scheduled runs of raw lines (lines this service did not write) and of entries in a crontab whose `SHELL` is not a POSIX shell are not reported; Run now of a managed entry is always recorded and sends job events; and a job whose shell exits without reporting its end (it replaced itself with `exec`, or was killed) finishes with `outcome: lost`. Events are kept in memory only: the history used by `since_id` (the last 1024 events by default) is lost when the service restarts, and a `since_id` from before a restart answers 409 `HISTORY_GAP`. Runs are also kept on disk (GET /api/v1/cron/runs), so after a restart read them there (only the runs that reached the disk: see that operation).

```typescript
client.cron.events.connect(options?: { since_id?: number; user?: string; entry_id?: string; types?: string }, _templateVars?: { projectId?: string; computerId?: string; serviceIndex?: string | number; serverName?: string; server?: string }, wsOptions?: { reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' | 'ws' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `since_id` | `number` | query | No | Replay the retained events after this event id, then go live. Without it the stream starts with the next event |
| `user` | `string` | query | No | Only events about this user's crontab and jobs |
| `entry_id` | `string` | query | No | Only events about this managed entry (crontab_changed when it lists the entry) |
| `types` | `string` | query | No | Only these event types, comma-separated: entry_created, entry_updated, entry_deleted, crontab_changed, job_started, job_finished. lag and end always arrive |

**Returns:** `Promise<CronEventsConnectWebSocket>` — an unconnected wrapper: register handlers, then `await ws.connect()`  |  **HTTP:** `GET /api/v1/cron/events/ws`

---

#### `stream` — Live events about the crontabs of the computer's users: managed entries created, updated or deleted (`source` api, expired or external), whole crontabs replaced or edited (`crontab_changed`, sent after the entry events of that change), and runs of managed jobs (`job_started`, `job_finished`). Edits made outside this service, such as `crontab -e` or `crontab -r`, appear within about 2 seconds with `source: external`. Job events come from the crontab line of an enabled managed entry, which reports its own start and end: scheduled runs of raw lines (lines this service did not write) and of entries in a crontab whose `SHELL` is not a POSIX shell are not reported; Run now of a managed entry is always recorded and sends job events; and a job whose shell exits without reporting its end (it replaced itself with `exec`, or was killed) finishes with `outcome: lost`. Events are kept in memory only: the history used by `since_id` (the last 1024 events by default) is lost when the service restarts, and a `since_id` from before a restart answers 409 `HISTORY_GAP`. Runs are also kept on disk (GET /api/v1/cron/runs), so after a restart read them there (only the runs that reached the disk: see that operation).

```typescript
client.cron.events.stream(options?: { since_id?: number; user?: string; entry_id?: string; types?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `since_id` | `number` | query | No | Replay the retained events after this event id, then go live. Without it the stream starts with the next event. A browser EventSource reconnecting with its Last-Event-ID header resumes the same way |
| `user` | `string` | query | No | Only events about this user's crontab and jobs |
| `entry_id` | `string` | query | No | Only events about this managed entry (crontab_changed when it lists the entry) |
| `types` | `string` | query | No | Only these event types, comma-separated: entry_created, entry_updated, entry_deleted, crontab_changed, job_started, job_finished. lag and end always arrive |

**Returns:** `Promise<IEventStream<Record<never, string>, ITypedStreamEvent<CronEventsStreamFrames>>>`  |  **HTTP:** `GET /api/v1/cron/events/sse`
**CLI:** `hoody cron events stream`

---

### `client.cron.kit` (2) — System endpoints

#### `getHealth` — Health Check

```typescript
client.cron.kit.getHealth()
```

**HTTP:** `GET /api/v1/cron/health`
**CLI:** `hoody cron health`

---

#### `getInfo` — Get Cron Info

```typescript
client.cron.kit.getInfo()
```

**HTTP:** `GET /api/v1/cron/info`


### Body schemas

- `RawCrontabRequest` — `{ crontab*: string }`
- `DescribeScheduleRequest` — `{ schedule*: string }`
- `CreateEntryRequest` — `{ command*: string, comment: string|null, enabled: bool|null, expires_at: string|null, name: string|null, schedule*: string }`
- `UpdateEntryRequest` — `{ clear_expiration: bool|null, command: string|null, comment: string|null, enabled: bool|null, expected_revision: string|null, expires_at: string|null, name: string|null, schedule: string|null }`
  - `expected_revision` — The entry's `revision` as last read: the update is refused with 412 `PRECONDITION_FAILED` if the entry changed since.
- `RunEntryRequest` — `{ expected_revision: string|null }`
  - `expected_revision` — The entry's `revision` as last read: the run is refused with 412 `PRECONDITION_FAILED` if the entry changed since.

