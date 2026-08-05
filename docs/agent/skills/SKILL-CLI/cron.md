> _**CLI skill · `cron` namespace** · ~3,574 tokens · hoody-sdk v1.0.0-beta.11_

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

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Schedule

`hoody cron entries create` schedule + command (+ name/comment/expires_at/enabled) → `ManagedEntry` with `id`.

### 2. List

`hoody cron entries list` (`page`/`limit`, max 200); the SDK additionally offers auto-pagination helpers (`hoody cron entries list`, `hoody cron entries list`) over the same endpoint.

### 3. Edit / disable / extend

`hoody cron entries update` PATCH. `clear_expiration: true` overrides `expires_at`. `enabled: false` keeps rule prefixed `# hoody-cron-disabled:`.

### 4. Bulk replace

`hoody cron crontabs get` (sweep) then `hoody cron crontabs replace` body — revalidates `# hoody-cron:` blocks; response has `removed_expired`.

### 5. Audit all users

`hoody cron crontabs list` → paginated `{ items: [{ user, crontab }], total, page, limit }`; the SDK additionally offers auto-pagination helpers (`hoody cron crontabs list`, `hoody cron crontabs list`) over the same endpoint.

## Quirks & gotchas

- `user`: matches `^[A-Za-z0-9_.-]{1,32}$` for the character class, but the validator additionally rejects a **leading** `-` (trailing `-` is allowed).
- Vixie 5-field plus standard `@`-macros; Quartz rejected.
- `command`/`name`/`comment` reject newline/null/VT/FF/NEL/LS/PS; caps 4096/120/500.
- `expires_at` RFC 3339, strictly future.
- Body cap 256 KiB (configurable via `max_crontab_bytes`, default 256 KiB) AND 10,000 lines; duplicate entry id rejected, and a duplicate `id=` within one metadata line is rejected.
- **`hoody cron crontabs replace` is a full overwrite — destroys every managed entry on the target user, not just the raw lines.** Server persists only the parsed payload via `state.backend.set(&user, &cleaned)`; entries not in the request body are gone. If you mix `hoody cron entries create` and `hoody cron crontabs replace` on the same user, every PUT wipes prior managed state. Strategy: pick one (managed-only via the `entries` endpoints, OR raw-only via `hoody cron crontabs replace`); if you must mix, treat the PUT body as the canonical source of truth and re-create managed entries after each PUT.
- Forged `# hoody-cron:` lines in PUT body are revalidated and rejected.
- `hoody cron entries list`/`hoody cron entries get` clean expired entries before serializing under a per-user mutex — a GET can mutate the spool.
- `hoody cron entries list` items have `type: "managed"` or `"raw"`; only `managed` items carry `id`.
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

Every step in every example was live-tested against a real `cron-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

### 1. Set up a nightly DB backup with trial-run dry-fire

**Goal:** schedule `pg_dump` daily at 02:00 in the container's LOCAL timezone (the kit does no TZ conversion; only `expires_at` is UTC-anchored), set the entry to expire end of 2026; first verify it actually fires by running it every minute for one cycle.

**Step 1 — create the entry.** Capture the returned `id`; `schedule_human` should read `"At 02:00 every day"`.

```bash
ID=$(hoody --container "$C" cron entries create root \
  --schedule '0 2 * * *' \
  --command 'pg_dump -U postgres mydb | gzip > /backups/db-$(date +\%F).sql.gz' \
  --name nightly-db-backup \
  --expires-at 2026-12-31T23:59:59Z \
  -o json | jq -r '.id')
```
**Step 2 — trial-run** by tightening to every minute. Wait ~70 s then `tail /var/log/syslog` (via the `terminal` kit) to confirm cron actually fired the job.

```bash
hoody --container "$C" cron entries update root "$ID" \
  --schedule '* * * * *' --comment 'TEST MODE — revert before merge'
```
**Step 3 — promote back to nightly** with a clean comment.

```bash
hoody --container "$C" cron entries update root "$ID" \
  --schedule '0 2 * * *' --comment 'production schedule'
```
### 2. Maintenance window — pause every managed job, do work, resume

**Goal:** disable every managed entry so nothing fires during a 30-min DB migration; re-enable once clean.

**Step 1 — capture every enabled managed id.**

```bash
IDS=$(hoody --container "$C" cron entries list root -o json \
  | jq -r '.entries[] | select(.type=="managed" and .enabled) | .id')
```
**Step 2 — bulk disable.**

```bash
# The generated CLI cannot express enabled:false — `--enabled` is a presence-only
# boolean (there is no --no-enabled), so it can only re-enable. PATCH over HTTP:
for id in $IDS; do
  curl -sX PATCH "$KIT/users/root/entries/$id" \
    -H 'Content-Type: application/json' \
    -d '{"enabled":false}' >/dev/null
done
```
**Step 3 — run your migration. Step 4 — bulk re-enable** (same loop, body `{ enabled: true }`). Entries pick up at their next regular tick; no missed-window catch-up.

### 3. Migrate a hand-written crontab into managed entries

**Goal:** convert legacy raw lines (no `id`, no metadata) into managed entries with names + lifecycle fields. ⚠ Read the warning at step 3 before running anything destructive.

**Step 1 — read the raw crontab.** `hoody cron entries list` shows the same lines as `{ type: 'raw', line: '...' }` items.

```bash
hoody --container "$C" cron crontabs get root -o json | jq -r .crontab
```
**Step 2 — re-create as managed.** Parse each raw line into `(schedule, command)` and POST it.

```bash
hoody --container "$C" cron entries create root \
  --schedule '5 6 * * *' --command '/opt/myapp/cleanup.sh' --name daily-cleanup
```
**Step 3 — ⚠ DESTRUCTIVE — wipe the raw lines.** `hoody cron crontabs replace` REPLACES the entire crontab including managed entries (live-verified — see Quirks). Do this ONLY after step 2 has succeeded, and re-create the managed entries AFTER the wipe if you want them back.

```bash
hoody --container "$C" cron crontabs replace root --crontab ''
```
### 4. Hourly poll → tighten to every 5 minutes after a failure

**Goal:** a health-poller is failing intermittently; you want denser data without redeploying anything. Find by name, change schedule, restore later.

**Step 1 — find the entry id by name.**

```bash
ID=$(hoody --container "$C" cron entries list root -o json \
  | jq -r '.entries[] | select(.name=="health-poll") | .id')
```
**Step 2 — tighten to `*/5 * * * *`.** `schedule_human` becomes `"Every 5 minutes"` immediately on the response.

```bash
hoody --container "$C" cron entries update root "$ID" --schedule '*/5 * * * *'
```
**Step 3 — restore** to hourly with body `{ schedule: '0 * * * *' }` once the investigation is over (same call, different schedule string).

### 5. Time-bounded experiment — auto-expire after 30 days

**Goal:** run a daily metrics sample for one month, then have it self-remove. Then learn how to extend or unbound the deadline.

**Step 1 — create with `expires_at`.** ISO 8601 RFC 3339; must be in the future.

```bash
ID=$(hoody --container "$C" cron entries create root \
  --schedule @daily --command /opt/metrics/sample.sh \
  --name metrics-experiment --expires-at 2026-07-08T00:00:00Z \
  -o json | jq -r .id)
```
After the timestamp passes, the kit's 60 s sweep **deletes** expired managed entries. `hoody cron entries list`/`hoody cron entries get` also clean expired entries before serializing, so once the sweep runs you can no longer read the expired entry — the entry simply disappears from listings. The `removed_expired` count on `hoody cron crontabs replace` tells you how many expired entries got dropped during a bulk replace.

**Step 2a — extend the deadline mid-experiment** (push out by 30 days):

```bash
hoody --container "$C" cron entries update root "$ID" \
  --expires-at 2026-08-07T00:00:00Z
```
**Step 2b — make it permanent** instead. Pass `clear_expiration: true`. If you also send `expires_at` in the same call, `clear_expiration` silently wins (server returns `200` with `expires_at: null` — no error).

```bash
hoody --container "$C" cron entries update root "$ID" --clear-expiration
```
### 6. Quick-disable a misbehaving entry by name

**Goal:** A teammate paged you about a runaway cron at 3am. You don't have the id, only the name they mentioned (`noisy-job`).

**Step 1 — find its id by name.**

```bash
ENTRY_ID=$(hoody --container "$C" cron entries list root -o json \
  | jq -r '.entries[] | select(.type=="managed" and .name=="noisy-job") | .id')
echo "$ENTRY_ID"
```
**Step 2 — disable it (entry stays in the listing for forensics; cron won't fire it).**

```bash
# The generated CLI cannot express enabled:false (`--enabled` is presence-only,
# no --no-enabled) — PATCH over HTTP:
curl -sX PATCH "$KIT/users/root/entries/$ENTRY_ID" \
  -H 'Content-Type: application/json' \
  -d "{\"enabled\":false,\"comment\":\"disabled $(date -u +%FT%TZ) — investigating\"}"
```
**Step 3 — re-enable later** by calling the same update with `{ enabled: true }`.

### 7. Audit which users on the container have any cron entries

**Goal:** compliance question — "who has scheduled jobs?". Container has 60+ system users; you want one shot.

`hoody cron crontabs list` returns one record per account in `/etc/passwd` (`{ user, crontab }`). Filter client-side for non-empty `crontab`.

```bash
hoody --container "$C" cron crontabs list --limit 200 -o json \
  | jq '.items[] | select(.crontab | test("\\S")) | {user, crontab}'
```
For each non-empty user, drill in via `hoody cron entries list` for the managed view, or read the `crontab` text directly from step 1.

### 8. Atomic full-crontab replace from versioned config

**Goal:** your IaC layer keeps the canonical crontab as a string in Git; on deploy, push the whole thing. ⚠ Destructive — wipes managed AND raw entries.

**Step 1 — snapshot current state** for forensics:

```bash
hoody --container "$C" cron crontabs get root -o json > /tmp/cron-snapshot.json
```
**Step 2 — push the canonical config.** Body MUST be `application/json` (raw `text/plain` returns `415`). Response carries `removed_expired` (count of managed entries that were dropped because their `expires_at` had passed).

```bash
hoody --container "$C" cron crontabs replace root \
  --crontab "$(cat /etc/iac/canonical-crontab.txt)"
```
### 9. Update only the comment / metadata, leave the schedule untouched

**Goal:** add a runbook URL or owner tag without risking changing what the entry does. PATCH is partial — fields you don't pass stay put.

```bash
hoody --container "$C" cron entries update root "$ID" \
  --comment 'owner: @team · runbook: https://wiki.example.com/cron-x'
```
`updated_at` advances; `schedule` / `command` / `enabled` are unchanged.

### 10. Rotate-and-replace pattern — read, edit text, write back

**Goal:** a teammate wants ONE hand-written line gone without disturbing the rest. You don't have an id (it's raw).

**Step 1 — fetch** the multi-line string. **Step 2 — edit client-side** (split, drop, rejoin). **Step 3 — write back.** ⚠ This also wipes any managed entries — re-create them with `hoody cron entries create` afterwards if you had any.

```bash
CUR=$(hoody --container "$C" cron crontabs get root -o json | jq -r .crontab)
NEW=$(echo "$CUR" | grep -v '^\*/30 \* \* \* \* /old\.sh')
hoody --container "$C" cron crontabs replace root --crontab "$NEW"
```

## Reference

### `hoody cron` (9) — Cron scheduling

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody cron crontabs get` |  | read | get crontab | `cron.crontab.get` | `hoody cron crontabs get alice` |
| `hoody cron crontabs list` |  | read | list all crontabs | `cron.crontab.listGlobalIterator` | `hoody cron crontabs list --page 10 --limit 10` |
| `hoody cron crontabs replace` |  | write | put crontab | `cron.crontab.put` | `hoody cron crontabs replace alice --crontab <crontab>` |
| `hoody cron entries create` | new, add | write | create entry | `cron.entries.create` | `hoody cron entries create alice --command "ls -la" --comment "Hello" --enabled --expires-at 2026-12-31T23:59:59Z --name my-resource --schedule "0 * * * *"` |
| `hoody cron entries delete` | rm, remove | destructive | delete entry | `cron.entries.delete` | `hoody cron entries delete alice abc-123` |
| `hoody cron entries get` |  | read | get entry | `cron.entries.get` | `hoody cron entries get alice abc-123` |
| `hoody cron entries list` |  | read | list entries | `cron.entries.listIterator` | `hoody cron entries list alice --page 10 --limit 10` |
| `hoody cron entries update` | edit | write | update entry | `cron.entries.update` | `hoody cron entries update alice abc-123 --clear-expiration --command "ls -la" --comment "Hello" --enabled --expires-at 2026-12-31T23:59:59Z --name my-resource --schedule "0 * * * *"` |
| `hoody cron health` |  | read | health check | `cron.health.check` | `hoody cron health` |

