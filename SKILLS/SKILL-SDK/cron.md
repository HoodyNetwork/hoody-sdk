> _**SDK skill · `cron` namespace** · ~4,899 tokens · hoody-sdk v1.0.0-beta.12_

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

`entries.create` schedule + command (+ name/comment/expires_at/enabled) → `ManagedEntry` with `id`.

### 2. List

`entries.list` (`page`/`limit`, max 200); the SDK additionally offers auto-pagination helpers (`listAll`, `listIterator`) over the same endpoint.

### 3. Edit / disable / extend

`entries.update` PATCH. `clear_expiration: true` overrides `expires_at`. `enabled: false` keeps rule prefixed `# hoody-cron-disabled:`.

### 4. Bulk replace

`crontab.get` (sweep) then `crontab.put` body — revalidates `# hoody-cron:` blocks; response has `removed_expired`.

### 5. Audit all users

`crontab.listGlobal` → paginated `{ items: [{ user, crontab }], total, page, limit }`; the SDK additionally offers auto-pagination helpers (`listGlobalAll`, `listGlobalIterator`) over the same endpoint.

## Quirks & gotchas

- `user`: matches `^[A-Za-z0-9_.-]{1,32}$` for the character class, but the validator additionally rejects a **leading** `-` (trailing `-` is allowed).
- Vixie 5-field plus standard `@`-macros; Quartz rejected.
- `command`/`name`/`comment` reject newline/null/VT/FF/NEL/LS/PS; caps 4096/120/500.
- `expires_at` RFC 3339, strictly future.
- Body cap 256 KiB (configurable via `max_crontab_bytes`, default 256 KiB) AND 10,000 lines; duplicate entry id rejected, and a duplicate `id=` within one metadata line is rejected.
- **`crontab.put` is a full overwrite — destroys every managed entry on the target user, not just the raw lines.** Server persists only the parsed payload via `state.backend.set(&user, &cleaned)`; entries not in the request body are gone. If you mix `entries.create` and `crontab.put` on the same user, every PUT wipes prior managed state. Strategy: pick one (managed-only via the `entries` endpoints, OR raw-only via `crontab.put`); if you must mix, treat the PUT body as the canonical source of truth and re-create managed entries after each PUT.
- Forged `# hoody-cron:` lines in PUT body are revalidated and rejected.
- `entries.list`/`entries.get` clean expired entries before serializing under a per-user mutex — a GET can mutate the spool.
- `entries.list` items have `type: "managed"` or `"raw"`; only `managed` items carry `id`.
- Sweep every 60s default; per-user lock.

## Common errors

- `400 INVALID_EXPIRES_AT` / `EXPIRES_IN_PAST`.
- `400 INVALID_SCHEDULE / Invalid schedule` — Vixie 5-field plus `@`-macros only; Quartz / 6-field rejected.
- `413 PAYLOAD_TOO_LARGE` — body exceeds 256 KiB cap.
- `500 BACKEND_ERROR` — `crontab(1)` fail / 30s timeout.
- `403 Forbidden` — private IP, no dev-server.

## Related namespaces

- `terminal`, `daemon`, `exec`, `watch`, `files`.

## Examples

Every step in every example was live-tested against a real `cron-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first.

### 1. Set up a nightly DB backup with trial-run dry-fire

**Goal:** schedule `pg_dump` daily at 02:00 in the container's LOCAL timezone (the kit does no TZ conversion; only `expires_at` is UTC-anchored), set the entry to expire end of 2026; first verify it actually fires by running it every minute for one cycle.

**Step 1 — create the entry.** Capture the returned `id`; `schedule_human` should read `"At 02:00 every day"`.

```typescript
const r = await client.cron.entries.create('root', {
  schedule: '0 2 * * *',
  command: 'pg_dump -U postgres mydb | gzip > /backups/db-$(date +\\%F).sql.gz',  // `%` MUST be escaped — crontab truncates at a bare %
  name: 'nightly-db-backup',
  expires_at: '2026-12-31T23:59:59Z',
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

**Step 1 — capture every enabled managed id.**

```typescript
const list = await client.cron.entries.list('root');
const ids = list.data!.entries
  .filter(e => e.type === 'managed' && e.enabled)
  .map(e => e.id);
```
**Step 2 — bulk disable.**

```typescript
await Promise.all(ids.map(id => client.cron.entries.update('root', id, { enabled: false })));
```
**Step 3 — run your migration. Step 4 — bulk re-enable** (same loop, body `{ enabled: true }`). Entries pick up at their next regular tick; no missed-window catch-up.

### 3. Migrate a hand-written crontab into managed entries

**Goal:** convert legacy raw lines (no `id`, no metadata) into managed entries with names + lifecycle fields. ⚠ Read the warning at step 3 before running anything destructive.

**Step 1 — read the raw crontab.** `entries.list` shows the same lines as `{ type: 'raw', line: '...' }` items.

```typescript
const raw = (await client.cron.crontab.get('root')).data!.crontab;
const rawLines = raw.split('\n').filter(l => l && !l.startsWith('#'));
```
**Step 2 — re-create as managed.** Parse each raw line into `(schedule, command)` and POST it.

```typescript
for (const line of rawLines) {
  const [m, h, dom, mon, dow, ...cmdParts] = line.split(/\s+/);
  await client.cron.entries.create('root', {
    schedule: `${m} ${h} ${dom} ${mon} ${dow}`,
    command: cmdParts.join(' '),
    name: `migrated-${cmdParts.join(' ').replace(/[^a-z0-9]+/gi,'-').slice(0,40)}`,
  });
}
```
**Step 3 — ⚠ DESTRUCTIVE — wipe the raw lines.** `crontab.put` REPLACES the entire crontab including managed entries (live-verified — see Quirks). Do this ONLY after step 2 has succeeded, and re-create the managed entries AFTER the wipe if you want them back.

```typescript
await client.cron.crontab.put('root', { crontab: '' });
// then re-create managed entries — `crontab.put` wipes them too
```
### 4. Hourly poll → tighten to every 5 minutes after a failure

**Goal:** a health-poller is failing intermittently; you want denser data without redeploying anything. Find by name, change schedule, restore later.

**Step 1 — find the entry id by name.**

```typescript
const list = await client.cron.entries.list('root');
const id = list.data!.entries.find(e => e.name === 'health-poll')!.id;
```
**Step 2 — tighten to `*/5 * * * *`.** `schedule_human` becomes `"Every 5 minutes"` immediately on the response.

```typescript
await client.cron.entries.update('root', id, { schedule: '*/5 * * * *' });
```
**Step 3 — restore** to hourly with body `{ schedule: '0 * * * *' }` once the investigation is over (same call, different schedule string).

### 5. Time-bounded experiment — auto-expire after 30 days

**Goal:** run a daily metrics sample for one month, then have it self-remove. Then learn how to extend or unbound the deadline.

**Step 1 — create with `expires_at`.** ISO 8601 RFC 3339; must be in the future.

```typescript
const r = await client.cron.entries.create('root', {
  schedule: '@daily',
  command: '/opt/metrics/sample.sh',
  name: 'metrics-experiment',
  expires_at: '2026-07-08T00:00:00Z',
});
const id = r.data!.id;
```
After the timestamp passes, the kit's 60 s sweep **deletes** expired managed entries. `entries.list`/`entries.get` also clean expired entries before serializing, so once the sweep runs you can no longer read the expired entry — the entry simply disappears from listings. The `removed_expired` count on `crontab.put` tells you how many expired entries got dropped during a bulk replace.

**Step 2a — extend the deadline mid-experiment** (push out by 30 days):

```typescript
await client.cron.entries.update('root', id, { expires_at: '2026-08-07T00:00:00Z' });
```
**Step 2b — make it permanent** instead. Pass `clear_expiration: true`. If you also send `expires_at` in the same call, `clear_expiration` silently wins (server returns `200` with `expires_at: null` — no error).

```typescript
await client.cron.entries.update('root', id, { clear_expiration: true });
```
### 6. Quick-disable a misbehaving entry by name

**Goal:** A teammate paged you about a runaway cron at 3am. You don't have the id, only the name they mentioned (`noisy-job`).

**Step 1 — find its id by name.**

```typescript
const r = await client.cron.entries.list('root');
const entry = r.data!.entries.find(e => e.type === 'managed' && e.name === 'noisy-job');
const entryId = entry!.id;
```
**Step 2 — disable it (entry stays in the listing for forensics; cron won't fire it).**

```typescript
await client.cron.entries.update('root', entryId, {
  enabled: false,
  comment: `disabled ${new Date().toISOString()} — investigating`,
});
```
**Step 3 — re-enable later** by calling the same update with `{ enabled: true }`.

### 7. Audit which users on the container have any cron entries

**Goal:** compliance question — "who has scheduled jobs?". Container has 60+ system users; you want one shot.

`crontab.listGlobal` returns one record per account in `/etc/passwd` (`{ user, crontab }`). Filter client-side for non-empty `crontab`.

```typescript
const r = await client.cron.crontab.listGlobal();
const userswithCron = r.data!.items.filter(i => i.crontab.trim() !== '');
```
For each non-empty user, drill in via `entries.list(user)` for the managed view, or read the `crontab` text directly from step 1.

### 8. Atomic full-crontab replace from versioned config

**Goal:** your IaC layer keeps the canonical crontab as a string in Git; on deploy, push the whole thing. ⚠ Destructive — wipes managed AND raw entries.

**Step 1 — snapshot current state** for forensics:

```typescript
const snapshot = (await client.cron.crontab.get('root')).data;
```
**Step 2 — push the canonical config.** Body MUST be `application/json` (raw `text/plain` returns `415`). Response carries `removed_expired` (count of managed entries that were dropped because their `expires_at` had passed).

```typescript
import { readFileSync } from 'fs';
const newCrontab = readFileSync('/etc/iac/canonical-crontab.txt', 'utf8');
await client.cron.crontab.put('root', { crontab: newCrontab });
```
### 9. Update only the comment / metadata, leave the schedule untouched

**Goal:** add a runbook URL or owner tag without risking changing what the entry does. PATCH is partial — fields you don't pass stay put.

```typescript
await client.cron.entries.update('root', id, {
  comment: 'owner: @team · runbook: https://wiki.example.com/cron-x',
});
```
`updated_at` advances; `schedule` / `command` / `enabled` are unchanged.

### 10. Rotate-and-replace pattern — read, edit text, write back

**Goal:** a teammate wants ONE hand-written line gone without disturbing the rest. You don't have an id (it's raw).

**Step 1 — fetch** the multi-line string. **Step 2 — edit client-side** (split, drop, rejoin). **Step 3 — write back.** ⚠ This also wipes any managed entries — re-create them with `entries.create` afterwards if you had any.

```typescript
const cur = (await client.cron.crontab.get('root')).data!.crontab;
const next = cur.split('\n').filter(l => l !== '*/30 * * * * /old.sh').join('\n');
await client.cron.crontab.put('root', { crontab: next });
```

## Reference

**Accessor:** `client.cron`  |  **Import:** `import * as cron from 'hoody-sdk/cron'`

### `client.cron.crontab` (5) — Raw crontab management

#### `get` — Get Crontab

```typescript
client.cron.crontab.get(user: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |

**Returns:** `cron_RawCrontabResponse`  |  **HTTP:** `GET /users/{user}/crontab`
**CLI:** `hoody cron crontabs get`

---

#### `listGlobal` — List All Crontabs

```typescript
client.cron.crontab.listGlobal(page?: integer, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | Page number (1-based) |
| `limit` | `integer` | query | No | Items per page (max 200) |

**Returns:** `cron_RawCrontabListResponse`  |  **HTTP:** `GET /crontab`
**CLI:** `hoody cron crontabs list`

---

#### `listGlobalAll` — List All Crontabs (collect all pages)

```typescript
client.cron.crontab.listGlobalAll(page?: integer, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | Page number (1-based) |
| `limit` | `integer` | query | No | Items per page (max 200) |

**Returns:** `cron_RawCrontabListResponse[]`  |  **HTTP:** `GET /crontab`
**CLI:** `hoody cron crontabs list`

---

#### `listGlobalIterator` — List All Crontabs (async iterator)

```typescript
client.cron.crontab.listGlobalIterator(page?: integer, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | Page number (1-based) |
| `limit` | `integer` | query | No | Items per page (max 200) |

**Returns:** `AsyncIterableIterator<cron_RawCrontabListResponse>`  |  **HTTP:** `GET /crontab`
**CLI:** `hoody cron crontabs list`

---

#### `put` — Put Crontab

```typescript
client.cron.crontab.put(user: string, data: cron_RawCrontabRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `data` | `cron_RawCrontabRequest` | body | Yes |  |

**Returns:** `cron_RawCrontabUpdateResponse`  |  **HTTP:** `PUT /users/{user}/crontab`
**CLI:** `hoody cron crontabs replace`

---

### `client.cron.entries` (7) — Managed entry CRUD

#### `create` — Create Entry

```typescript
client.cron.entries.create(user: string, data: cron_CreateEntryRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `data` | `cron_CreateEntryRequest` | body | Yes |  |

**Returns:** `cron_ManagedEntryResponse`  |  **HTTP:** `POST /users/{user}/entries`
**CLI:** `hoody cron entries create`

---

#### `delete` — Delete Entry

```typescript
client.cron.entries.delete(user: string, id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `id` | `string` | path | Yes | Managed entry id |

**Returns:** `cron_DeleteEntryResponse`  |  **HTTP:** `DELETE /users/{user}/entries/{id}`
**CLI:** `hoody cron entries delete`

---

#### `get` — Get Entry

```typescript
client.cron.entries.get(user: string, id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `id` | `string` | path | Yes | Managed entry id |

**Returns:** `cron_ManagedEntryResponse`  |  **HTTP:** `GET /users/{user}/entries/{id}`
**CLI:** `hoody cron entries get`

---

#### `list` — List Entries

```typescript
client.cron.entries.list(user: string, page?: integer, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `page` | `integer` | query | No | Page number (1-based) |
| `limit` | `integer` | query | No | Items per page (max 200) |

**Returns:** `cron_EntryListResponse`  |  **HTTP:** `GET /users/{user}/entries`
**CLI:** `hoody cron entries list`

---

#### `listAll` — List Entries (collect all pages)

```typescript
client.cron.entries.listAll(user: string, page?: integer, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `page` | `integer` | query | No | Page number (1-based) |
| `limit` | `integer` | query | No | Items per page (max 200) |

**Returns:** `cron_EntryListResponse[]`  |  **HTTP:** `GET /users/{user}/entries`
**CLI:** `hoody cron entries list`

---

#### `listIterator` — List Entries (async iterator)

```typescript
client.cron.entries.listIterator(user: string, page?: integer, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `page` | `integer` | query | No | Page number (1-based) |
| `limit` | `integer` | query | No | Items per page (max 200) |

**Returns:** `AsyncIterableIterator<cron_EntryListResponse>`  |  **HTTP:** `GET /users/{user}/entries`
**CLI:** `hoody cron entries list`

---

#### `update` — Update Entry

```typescript
client.cron.entries.update(user: string, id: string, data: cron_UpdateEntryRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `user` | `string` | path | Yes | System username |
| `id` | `string` | path | Yes | Managed entry id |
| `data` | `cron_UpdateEntryRequest` | body | Yes |  |

**Returns:** `cron_ManagedEntryResponse`  |  **HTTP:** `PATCH /users/{user}/entries/{id}`
**CLI:** `hoody cron entries update`

---

### `client.cron.health` (1) — Health

#### `check` — Health Check

```typescript
client.cron.health.check()
```

**Returns:** `cron_HealthResponse`  |  **HTTP:** `GET /health`
**CLI:** `hoody cron health`

---

### `client.cron.system` (2) — System endpoints

#### `getOpenApiJson` — Get Open Api Json

```typescript
client.cron.system.getOpenApiJson()
```

**Returns:** `any`  |  **HTTP:** `GET /openapi.json`

---

#### `getOpenApiYaml` — Get Open Api Yaml

```typescript
client.cron.system.getOpenApiYaml()
```

**Returns:** `any`  |  **HTTP:** `GET /openapi.yaml`


### Body schemas

- `cron_RawCrontabRequest` — `{ crontab*: string }`
- `cron_CreateEntryRequest` — `{ command*: string, comment: string|null, enabled: bool|null, expires_at: string|null, name: string|null, schedule*: string }`
- `cron_UpdateEntryRequest` — `{ clear_expiration: bool|null, command: string|null, comment: string|null, enabled: bool|null, expires_at: string|null, name: string|null, schedule: string|null }`

