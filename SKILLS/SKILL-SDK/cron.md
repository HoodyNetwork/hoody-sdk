> _**SDK skill · `cron` namespace** · ~6,924 tokens · hoody-sdk v1.0.0-beta.15_

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

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Schedule

`entries.create` takes a schedule + command (plus name/comment/expires_at/enabled) and returns the created entry with its `id`.

### 2. List

`entries.list` (`page`/`limit`, max 200). The SDK also offers auto-pagination helpers over the same endpoint: `client.cron.entries.listAll` and `client.cron.entries.listIterator`.

### 3. Edit / disable / extend

`entries.update` PATCH. `clear_expiration: true` overrides `expires_at`. `enabled: false` keeps rule prefixed `# hoody-cron-disabled:`.

### 4. Bulk replace

`crontabs.get` (sweep) then `crontabs.set` body — revalidates `# hoody-cron:` blocks; response has `removed_expired`.

### 5. Audit all users

`crontabs.list` → paginated `{ items: [{ user, crontab }], total, page, limit }`. The SDK also offers auto-pagination helpers over the same endpoint: `client.cron.crontabs.listAll` and `client.cron.crontabs.listIterator`.

## Quirks & gotchas

- `user`: matches `^[A-Za-z0-9_.-]{1,32}$` for the character class, but the validator additionally rejects a **leading** `-` (trailing `-` is allowed).
- Vixie 5-field plus standard `@`-macros; Quartz rejected.
- `command`/`name`/`comment` reject newline/null/VT/FF/NEL/LS/PS; caps 4096/120/500.
- The kit collapses runs of whitespace inside the command of a managed entry with a 5-field schedule: when the spool is parsed back, the command is split on whitespace and re-joined with single spaces, and the next write for that user stores the collapsed text. `echo "a  b"` becomes `echo "a b"`. An `@macro` schedule keeps the command as written. Put commands that depend on exact spacing in a script and schedule the script.
- `expires_at` RFC 3339, strictly future.
- Body cap 256 KiB by default, which the deployment can change, AND 10,000 lines; duplicate entry id rejected, and a duplicate `id=` within one metadata line is rejected.
- **`crontabs.set` replaces the whole crontab.** `crontabs.get` returns each managed entry as its `# hoody-cron:` metadata line followed by its rule line, and PUT parses those pairs back into the same managed entries with the same ids. So a read, edit, write cycle keeps every managed entry whose two lines are still in the body; a managed entry left out of the body is deleted. Edit the text from `crontabs.get` instead of writing a fresh body, and do not re-create managed entries after a PUT: they are still there, and re-creating them makes every job run twice. Comment or blank lines placed between a metadata line and its rule line are dropped.
- A PUT body may contain `# hoody-cron:` metadata lines written by the caller. The kit revalidates every managed entry it parses from them (schedule, command, name, comment) and rejects duplicate ids, but it does not check where the metadata came from: a well-formed pair written by hand is accepted as a managed entry, and a metadata line it cannot parse or pair is kept as a raw line.
- `entries.list`/`entries.get` clean expired entries before serializing under a per-user mutex — a GET can mutate the spool.
- `entries.list` items have `type: "managed"` or `"raw"`; only `managed` items carry `id`.
- Sweep every 60s default; per-user lock.

## Common errors

Error bodies are `{ code, message, details }`, except where noted.

- `400 INVALID_EXPIRES_AT` / `EXPIRES_IN_PAST`.
- `400 INVALID_SCHEDULE / Invalid schedule` — Vixie 5-field plus `@`-macros only; Quartz / 6-field rejected.
- `400 INVALID_USER` (bad user name), `INVALID_COMMAND`, `INVALID_NAME`, `INVALID_COMMENT`: a field failed validation (see Quirks for the rules).
- `400 INVALID_ID` `Entry id must be a UUID`: the `{id}` path segment is not a UUID.
- `400 INVALID_PAGINATION`: `page` must be 1 or more and `limit` 1 to 200 (default 50).
- `404 USER_NOT_FOUND`: the user is not in `/etc/passwd`. `404 ENTRY_NOT_FOUND`: no managed entry has that id (it may have expired and been swept).
- `413`: a request body over the size cap (256 KiB by default) is rejected by the HTTP layer before the handler runs, with a plain-text body, not JSON. The JSON `PAYLOAD_TOO_LARGE` comes from the crontab parser: for a crontab over 10,000 lines, or over its separate byte ceiling of about 40 MB, which only a deployment that raised the size cap can reach.
- `415` (the body is not `application/json`) and `422` (the JSON does not match the request schema) come from the JSON extractor, with a plain-text body.
- `500 BACKEND_ERROR` — `crontab(1)` fail / 30s timeout.
- `403 Forbidden` — private IP, no dev-server.

## Related namespaces

- `terminal`, `daemon`, `exec`, `watch`, `files`.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first.

### 1. Set up a nightly DB backup with trial-run dry-fire

**Goal:** schedule `pg_dump` daily at 02:00 in the container's LOCAL timezone (the kit does no TZ conversion; only `expires_at` is UTC-anchored), set the entry to expire one year from now; first verify it actually fires by running it every minute for one cycle.

**Step 1 — create the entry.** Capture the returned `id`; `schedule_human` should read `"At 02:00 every day"`.

```typescript
const r = await client.cron.entries.create('root', {
  schedule: '0 2 * * *',
  command: 'pg_dump -U postgres mydb | gzip > /backups/db-$(date +\\%F).sql.gz',  // `%` MUST be escaped — crontab truncates at a bare %
  name: 'nightly-db-backup',
  expires_at: new Date(Date.now() + 365 * 86_400_000).toISOString(),  // must be in the future
});
const id = r.data!.id;
```

**Step 2 — trial-run** by tightening to every minute. Wait ~70 s then `tail /var/log/syslog` (via the `terminal` kit) to confirm cron actually fired the job.

```typescript
await client.cron.entries.update('root', id, {
  schedule: '* * * * *',
  comment: 'TEST MODE — revert before merge',
});
```

**Step 3 — promote back to nightly** with a clean comment.

```typescript
await client.cron.entries.update('root', id, {
  schedule: '0 2 * * *',
  comment: 'production schedule',
});
```

### 2. Maintenance window — pause every managed job, do work, resume

**Goal:** disable every managed entry so nothing fires during a 30-min DB migration; re-enable once clean.

**Step 1 — capture every enabled managed id.** The listing is paginated (50 per page by default, at most 200), so read every page before filtering: a job left on a later page stays enabled through the migration. Run steps 1 and 2 as one script that exits on any listing or update failure, and start the migration only when it exits successfully; a partial list or a failed disable leaves jobs enabled.

```typescript
// listAll walks every page and resolves to the typed entries; a failed page throws.
const entries = await client.cron.entries.listAll('root');
const ids = entries.flatMap(e => (e.type === 'managed' && e.enabled ? [e.id] : []));
```

**Step 2 — bulk disable.**

```typescript
// A failed update rejects, so the script stops before the migration starts.
await Promise.all(ids.map(id => client.cron.entries.update('root', id, { enabled: false })));
```

**Step 3 — run your migration. Step 4 — bulk re-enable** the captured ids (same loop with `enabled: true`). After a failed step 2, re-enable the same list: the entries disabled before the failure are still disabled. Entries pick up at their next regular tick; no missed-window catch-up.

### 3. Migrate a hand-written crontab into managed entries

**Goal:** convert legacy raw lines (no `id`, no metadata) into managed entries with names + lifecycle fields, then remove the raw originals so nothing runs twice.

**Step 1 — collect the raw lines to migrate.** `entries.list` returns hand-written lines as `{ type: 'raw', line }` items; managed entries are `type: 'managed'` and are left alone.

```typescript
const listed = await client.cron.entries.listAll('root');
// Raw items only; skip blanks, comments and environment lines (SHELL=, MAILTO=, ...).
const toMigrate = listed
  .flatMap(e => (e.type === 'raw' ? [e.line] : []))
  .filter(l => !/^\s*($|#|[A-Za-z_][A-Za-z0-9_]*=)/.test(l));
```

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

**Step 3 — remove only the migrated raw lines.** Only after every create in step 2 succeeded: run steps 2 and 3 as one script, so the stop after a failed create also skips this step. After a partial failure, the managed entries created so far run alongside their raw lines (each of those jobs runs twice) until you delete them or finish the migration. Read the crontab text again (it now contains the new managed entries as `# hoody-cron:` metadata and rule line pairs), drop the raw lines from step 1 and write the rest back. A new managed entry's rule line is usually the same text as the raw line it replaces, so match a line only when the line before it is not a `# hoody-cron:` metadata line: dropping a rule line leaves its metadata unpaired, and the managed entry is lost. The PUT keeps every managed entry that is still in the text, with the same id. Do not PUT an empty crontab here: that would delete the entries step 2 just created.

```typescript
const cur = (await client.cron.crontabs.get('root')).data!.crontab;
const drop = new Set(toMigrate);
const lines = cur.split('\n');
// Keep a listed line when it follows a metadata line: it is a managed entry's rule.
const kept = lines.filter((l, k) => !drop.has(l) || /^\s*# hoody-cron:/.test(lines[k - 1] ?? ''));
await client.cron.crontabs.set('root', { crontab: kept.join('\n') });
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

After the timestamp passes, the kit's 60 s sweep **deletes** expired managed entries. `entries.list`/`entries.get` also clean expired entries before serializing, so once the sweep runs you can no longer read the expired entry — the entry simply disappears from listings. The `removed_expired` count on `crontabs.set` tells you how many expired entries got dropped during a bulk replace.

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

### 7. Audit which users on the container have any cron entries

**Goal:** compliance question — "who has scheduled jobs?". A container has 60+ system users, more than the default page of 50, so read every page.

`crontabs.list` returns one record per account in `/etc/passwd` (`{ user, crontab }`), 50 per page by default and at most 200. Filter client-side for non-empty `crontab`.

```typescript
// crontabs.listAll walks every page. Each record is { user, crontab }; the declared
// element type does not match that shape, so assert it.
const accounts = (await client.cron.crontabs.listAll()) as unknown as { user: string; crontab: string }[];
const usersWithCron = accounts.filter(a => a.crontab.trim() !== '');
```

For each non-empty user, drill in via `entries.list` for that user for the managed view, or read the `crontab` text directly from the listing above.

### 8. Atomic full-crontab replace from versioned config

**Goal:** your IaC layer keeps the canonical crontab as a string in Git; on deploy, push the whole thing. ⚠ The canonical text becomes the whole crontab: raw lines not in it are removed, and so is every managed entry whose `# hoody-cron:` metadata and rule lines are not in it.

**Step 1 — snapshot current state** for forensics:

```typescript
const snapshot = (await client.cron.crontabs.get('root')).data;
```

**Step 2 — push the canonical config.** Body MUST be `application/json` (raw `text/plain` returns `415`). Response carries `removed_expired` (count of managed entries that were dropped because their `expires_at` had passed).

```typescript
import { readFileSync } from 'fs';
const newCrontab = readFileSync('/etc/iac/canonical-crontab.txt', 'utf8');
await client.cron.crontabs.set('root', { crontab: newCrontab });
```

### 9. Update only the comment / metadata, leave the schedule untouched

**Goal:** add a runbook URL or owner tag without changing the schedule or the enabled state. PATCH is partial — fields you don't pass are not assigned. The write still rewrites the user's whole crontab, so runs of whitespace inside a five-field managed entry's command are collapsed (see Quirks).

```typescript
await client.cron.entries.update('root', id, {
  comment: 'owner: @team · runbook: https://wiki.example.com/cron-x',
});
```

`updated_at` advances; `schedule` and `enabled` are unchanged, and `command` is unchanged unless it contained runs of whitespace, which the rewrite collapses.

### 10. Rotate-and-replace pattern — read, edit text, write back

**Goal:** a teammate wants ONE hand-written line gone without disturbing the rest. You don't have an id (it's raw). Match the whole line exactly, and skip a matching line that follows a `# hoody-cron:` metadata line: that one is a managed entry's rule, and dropping it orphans the entry.

**Step 1 — fetch** the multi-line string. **Step 2 — edit client-side** (split, drop, rejoin). **Step 3 — write back.** Managed entries survive: the fetched text holds each one as a `# hoody-cron:` metadata line plus its rule line, and the PUT parses them back with the same ids. Leave those lines untouched and do not re-create the entries afterwards, or every managed job runs twice.

```typescript
const cur = (await client.cron.crontabs.get('root')).data!.crontab;
const lines = cur.split('\n');
const next = lines
  .filter((l, k) => l !== '*/30 * * * * /old.sh' || /^\s*# hoody-cron:/.test(lines[k - 1] ?? ''))
  .join('\n');
await client.cron.crontabs.set('root', { crontab: next });
```

## Reference

**Accessor:** `client.cron`  |  **Import:** `import * as cron from 'hoody-sdk/cron'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, containerId?, serviceIndex?, server? }`, which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are refused) and `cache` (a GET's response cache: `true`, a TTL in ms, or `false` to bypass) (no `_realm`: that one is control-plane only). When the signature shows an options object, the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`.

### `client.cron.crontabs` (5) — Raw crontab management

#### `get` — Get Crontab

```typescript
client.cron.crontabs.get(user: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |

**Returns:** `Promise<CronCrontabsGetResponse>`  |  **HTTP:** `GET /users/{user}/crontab`
**CLI:** `hoody cron crontabs get`

---

#### `list` — List All Crontabs

```typescript
client.cron.crontabs.list(options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number (1-based) |
| `limit` | `number` | query | No | Items per page (max 200) |

**Returns:** `Promise<CronCrontabsListResponse>`  |  **HTTP:** `GET /crontab`
**CLI:** `hoody cron crontabs list`

---

#### `listAll` — List All Crontabs (collect all pages)

```typescript
client.cron.crontabs.listAll(options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number (1-based) |
| `limit` | `number` | query | No | Items per page (max 200) |

**Returns:** `Promise<(NonNullable<CronCrontabsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). Each item is `cron_RawCrontabResponse`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /crontab`
**CLI:** `hoody cron crontabs list`

---

#### `listIterator` — List All Crontabs (async iterator)

```typescript
client.cron.crontabs.listIterator(options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number (1-based) |
| `limit` | `number` | query | No | Items per page (max 200) |

**Returns:** `AsyncGenerator<(NonNullable<CronCrontabsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page). Each item is `cron_RawCrontabResponse`.  |  **HTTP:** `GET /crontab`
**CLI:** `hoody cron crontabs list`

---

#### `set` — Put Crontab

```typescript
client.cron.crontabs.set(user: string, data: CronCrontabsSetRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `data` | `CronCrontabsSetRequest` | body | Yes | Shape: `cron_RawCrontabRequest` under Body schemas. |

**Returns:** `Promise<CronCrontabsSetResponse>`  |  **HTTP:** `PUT /users/{user}/crontab`
**CLI:** `hoody cron crontabs set`

---

### `client.cron.entries` (7) — Managed entry CRUD

#### `create` — Create Entry

```typescript
client.cron.entries.create(user: string, data: CronEntriesCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `data` | `CronEntriesCreateRequest` | body | Yes | Shape: `cron_CreateEntryRequest` under Body schemas. |

**Returns:** `Promise<CronEntriesCreateResponse>`  |  **HTTP:** `POST /users/{user}/entries`
**CLI:** `hoody cron entries create`

---

#### `delete` — Delete Entry

```typescript
client.cron.entries.delete(user: string, id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `id` | `string` | path | Yes | Managed entry id (UUID) |

**Returns:** `Promise<CronEntriesDeleteResponse>`  |  **HTTP:** `DELETE /users/{user}/entries/{id}`
**CLI:** `hoody cron entries delete`

---

#### `get` — Get Entry

```typescript
client.cron.entries.get(user: string, id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `id` | `string` | path | Yes | Managed entry id (UUID) |

**Returns:** `Promise<CronEntriesGetResponse>`  |  **HTTP:** `GET /users/{user}/entries/{id}`
**CLI:** `hoody cron entries get`

---

#### `list` — List Entries

```typescript
client.cron.entries.list(user: string, options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `page` | `number` | query | No | Page number (1-based) |
| `limit` | `number` | query | No | Items per page (max 200) |

**Returns:** `Promise<CronEntriesListResponse>`  |  **HTTP:** `GET /users/{user}/entries`
**CLI:** `hoody cron entries list`

---

#### `listAll` — List Entries (collect all pages)

```typescript
client.cron.entries.listAll(user: string, options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `page` | `number` | query | No | Page number (1-based) |
| `limit` | `number` | query | No | Items per page (max 200) |

**Returns:** `Promise<(NonNullable<CronEntriesListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { entries?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.entries`, all pages collected (`list()` fetches one page). Each item is `cron_CrontabEntryView`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /users/{user}/entries`
**CLI:** `hoody cron entries list`

---

#### `listIterator` — List Entries (async iterator)

```typescript
client.cron.entries.listIterator(user: string, options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `page` | `number` | query | No | Page number (1-based) |
| `limit` | `number` | query | No | Items per page (max 200) |

**Returns:** `AsyncGenerator<(NonNullable<CronEntriesListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { entries?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.entries` per step, next page fetched on demand (`list()` fetches one page). Each item is `cron_CrontabEntryView`.  |  **HTTP:** `GET /users/{user}/entries`
**CLI:** `hoody cron entries list`

---

#### `update` — Update Entry

```typescript
client.cron.entries.update(user: string, id: string, data: CronEntriesUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `id` | `string` | path | Yes | Managed entry id (UUID) |
| `data` | `CronEntriesUpdateRequest` | body | Yes | Shape: `cron_UpdateEntryRequest` under Body schemas. |

**Returns:** `Promise<CronEntriesUpdateResponse>`  |  **HTTP:** `PATCH /users/{user}/entries/{id}`
**CLI:** `hoody cron entries update`

---

### `client.cron.kit` (1) — System endpoints

#### `getHealth` — Health Check

```typescript
client.cron.kit.getHealth()
```

**Returns:** `Promise<CronKitGetHealthResponse>`  |  **HTTP:** `GET /health`
**CLI:** `hoody cron health`


### Body schemas

- `cron_RawCrontabRequest` — `{ crontab*: string }`
- `cron_CreateEntryRequest` — `{ command*: string, comment: string|null, enabled: bool|null, expires_at: string|null, name: string|null, schedule*: string }`
- `cron_UpdateEntryRequest` — `{ clear_expiration: bool|null, command: string|null, comment: string|null, enabled: bool|null, expires_at: string|null, name: string|null, schedule: string|null }`

