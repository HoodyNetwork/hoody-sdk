> _**SDK skill · `daemon` namespace** · ~9,489 tokens · hoody-sdk v1.0.0-beta.11_

# `daemon` — supervisord program lifecycle (start any program; logs always retained)

## Purpose

**Default for "start a program" / "spawn a process"** when you don't need an interactive shell or a TUI. REST over `supervisord` — every process is supervised, auto-restart-eligible, log-captured (stdout + stderr written under `/hoody/storage/hoody-daemon/logs/<name>/stdout.log` and `/hoody/storage/hoody-daemon/logs/<name>/stderr.log` — one directory per program, with rotated timestamped log files behind those symlinks), and inspectable after the fact. Log FILES outlive the process on disk, but the ephemeral tracking entry is reaped on stop/exit — after that `quickStart.getEphemeralLogs` 404s (see Quirks); capture logs before stopping, or read the on-disk files directly (e.g. via the `files` namespace). `status.getLogs` covers configured (non-ephemeral) programs.

Two flavours:

- **Quick-start (ephemeral, no config write)** — `quickStart.launch { command, user, ttl?, wait?, timeout? }`. Returns `temporary_id = quick_<ts>_<seq>`. Best for one-offs and short-lived jobs (build steps, batch transforms, "run this once and tell me the output"). Logs survive the process; pull with `quickStart.getEphemeralLogs`. Optional `ttl` auto-stops after N seconds.
- **Registered program (durable, persists across kit restarts)** — `programs.add { name, command, user, enabled: true, boot: true?, autorestart: 'unexpected', … }` → `control.start { wait: true }`. Use this when the process should come back after a container restart, when you want auto-restart on crash, or when you need port-range fan-out / lazy-load on first proxy hit.

## When to use

- "Run this command and keep the logs" → `quickStart.launch`.
- "Run this server / agent / script as a long-running supervised process, restart on failure" → `programs.add` + `control.start`.
- Background workers, port-range fan-out, lazy-loaded HTTP services, supervisord-event webhooks.

## When NOT to use

- **Traditional system services that ship native systemd units** (apache2, nginx, postgresql, mysql, redis, mosquitto, sshd, postfix, …) — leave them on `systemd`. Hoody containers are full Linux boxes with systemd + root (they behave like VMs, not Docker), so the standard `apt install nginx && systemctl enable --now nginx` flow Just Works and benefits from the upstream unit's hardening (drop-in directories, sd_notify, journal integration, etc.). Mixing systemd-managed and `daemon`-managed processes in the same container is fine — pick whichever fits the program.
- Need an interactive TTY (Claude Code, Codex, htop, vim, anything that paints the screen) → use `terminal` with a **pinned non-ephemeral `terminal_id`**, NOT `daemon`. Daemon programs have no TTY.
- Need to pipe input mid-run / send keystrokes → `terminal` (`pressTerminalKeys`, `pasteTerminalText`).
- One-shot synchronous request/response → `exec` (HTTP handler, returns body).
- Schedule (cron syntax) → `cron`. Access logs → `proxyLogs`. File-system events → `watch`.

### When to prefer `daemon` over `systemd`

- Custom scripts and binaries you wrote that don't have a packaged unit.
- Quick experiments where you want REST-driven start/stop/log without writing a unit file.
- Port-range fan-out (`port_range` + `port_param` + `lazy_load`) — supervisord-side feature, not a systemd one.
- Programs you want to provision / mutate / remove via the Hoody API (CI scripts, multi-tenant container fleets) — `programs.add` is one HTTP call.

### When to prefer `systemd` over `daemon`

- Any service whose Debian/Ubuntu package already drops a working unit in `/lib/systemd/system/` (most server software).
- You want `journalctl -u <service>`, `systemctl status`, drop-in overrides, socket-activated services, timers (cron-equivalent), or any other systemd feature.
- The program is part of the container's "default-on" baseline (boots with the container, never managed externally).

## Prerequisites

- `/dev/hoody`, `/hoody`, `LOG_BASE_DIR=/hoody/storage/hoody-daemon/logs/` exist.
- `user` = real system account.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Register and boot

- `programs.add` (`name`/`command`/`user`; `enabled`, `boot`; opt `directory`/`environment`/`autorestart`/`priority`/`*_logfile`) -> `control.start` `{ wait: true, timeout: 30 }` -> `status.get` (`include_stats`); `status.getLogs` on failure.

### 2. Ephemeral with TTL

- `quickStart.launch` (`command`/`user`, opt `ttl?`/`wait?`/`timeout?`) returns `temporary_id` = `quick_<ts>_<seq>`. Poll/tail with `quickStart.getStatus`/`getEphemeralLogs`; `quickStart.stop` to terminate.

### 3. Lazy port-range fleet

- `programs.add` + `port_range: { start, end }`, `port_param`, `lazy_load: true`, `enabled: true`. `programs.list?port=8042&include_status=true`. `control.start` `{ port: 8042 }`; `control.stop` `{ port }` or `{ all: true }`.

### 4. Reach a service you just started

Any container port is publicly addressable as soon as the listener is up — no proxy alias, firewall edit, or extra registration needed:

- HTTP service on `:8080` → `https://{projectId}-{containerId}-http-8080.{node}.containers.hoody.com`
- HTTPS service on `:8443` → `https://{projectId}-{containerId}-https-8443.{node}.containers.hoody.com`

Edge is always `https://`; the slug only describes the inner protocol. Gate access via `proxyPermissionsContainer.*` if it shouldn't be public. See § Proxy URLs.

### 5. Update / wipe

`programs.edit` field-merge; `control.disable`/`enable`; `programs.remove`; `programs.reset` -> `programs.default.json`.

## Quirks & gotchas

- Boolean query params (`hoody_kit`, `lazy_load`, `enabled`, `boot`, `include_status`, `include_stats`) STRICT: only `true`/`false`; `1`/`yes`/`0`/`""` -> 400.
- Webhook URLs HTTPS-only unless `NODE_ENV=development` (which also skips every host check below). Userinfo is always rejected; in production the literal label `localhost` and private/CGNAT/link-local/v6-ULA addresses are too, including when written as NAT64, v4-mapped-v6, or non-standard v4 (`2130706433`, `0x7f000001`, `127.1`) — but only when the URL authority is already an IP literal or `localhost`. A DNS name is accepted whatever it resolves to, so treat this as input validation, not an egress control. Redirects are never followed.
- Webhook edits deep-merge (omitted fields NOT cleared); events need `notifications.enabled` + `event_listener_enabled` + supervisord `eventlistener`.
- Duplicate names + overlapping port ranges rejected on create AND update (adjacent OK); `port_param` requires `port_range`.
- `command` no newlines/CR/NUL; `user` `(?i)[a-z_][a-z0-9_-]*\$?` (case-insensitive) via `id`; `*_logfile` confined to `LOG_BASE_DIR`.
- `control.start` on `port_range` REQUIRES `{ port }`; `control.stop` `{ port }` or `{ all: true }`.
- `quick_<ms>_<seq>` IDs (e.g. `quick_1700000000000_1`) are produced by the kit (which accepts `^quick_[a-zA-Z0-9_]+$` via `sanitize_temp_id`) but the OpenAPI path-param schema is the stricter `^quick_\d+$`, and the generated **TypeScript SDK enforces it client-side** — the CLI and raw HTTP pass the full id straight to the kit and work fine. In SDK mode, drive `quickStart.getStatus` / `quickStart.stop` via raw HTTP to avoid the local validator, OR call `quickStart.list` and select by `name`. TTL polled ~10 s.
- Default ephemeral log paths are `/hoody/storage/hoody-daemon/logs/<name>/stdout.log` and `/hoody/storage/hoody-daemon/logs/<name>/stderr.log` (one directory per program), NOT `<name>.out.log`/`<name>.err.log`.
- After `quickStart.stop`, the in-memory tracking entry is removed (the on-disk log files persist but are unreachable through `getEphemeralLogs`, which returns `404`). Capture logs (read `quickStart.getEphemeralLogs` or fetch the on-disk file directly) BEFORE calling `stop`.
- `control.start` accepts `if_not_running: true` for an idempotent boot — early-returns with `already_running: true` if the program is already running (port-range responses include an `instance` block with per-instance status/pid; standard programs return `instance: null` — no pid). Use it for "ensure started" workflows.
- **`environment` REPLACES the whole map** on `programs.edit` (not per-key merge). If the existing env is `{A:1,B:2}` and you PATCH `{environment:{A:9}}`, the result is `{A:9}`. To preserve secrets, GET the program first and re-send the merged map.
- Webhook delivery requires THREE flags ON: per-program `webhooks.enabled: true`, kit-level `notifications.enabled: true`, AND kit-level `event_listener_enabled: true`. Toggling only the per-program flag will not fire callbacks.
- Proxy `X-Bypass-Local-Restrictions` strips `command`/`environment`/`directory`/`user`/`webhooks`/`stdout_logfile`/`stderr_logfile`.
- CLI `--port-range-{start,end}` -> nested `port_range`.

## Common errors

- 400 webhook: `must use HTTPS`, `contains userinfo`, `reserved IP range`.
- 400 `name already in use` / `Port range overlaps` / `port_param requires port_range`.
- success=false `Port parameter required` / `Program with ID {id} is disabled` -> `control.enable`.
- Direct private-IP connections get a plain `403 Forbidden` (the kit logs `connection blocked reason=private_ip` server-side; that string is NOT in the response) -> use the capability URL.
- 1 MB JSON body limit.

## Related namespaces

`exec` sync. `cron` scheduled. `proxyLogs` access log. `terminal` TTY. `display` virtual display.

## Examples

Every step in every example was live-tested against a real `daemon-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first. The kit returns numeric `program.id` (not a UUID) — capture it from the `programs.add` response.

### 1. Register a long-running supervised program with auto-boot

**Goal:** add a tick-emitting worker that supervisord keeps alive across kit restarts, then start it without blocking the caller.

**Step 1 — add (`enabled: true`, `boot: true`).** Capture `program.id`. Use `user: "user"` (uid 1000); the daemon's `command` allows shell metachars but you must own the quoting — single-quote the outer payload to avoid double-escaping.

```typescript
const r = await client.daemon.programs.add({
  name: 'examples-daemon-tick',
  command: `sh -c 'while :; do echo tick $(date -u +%s); sleep 5; done'`,
  user: 'user', enabled: true, boot: true, autorestart: 'unexpected',
});
const id = r.data!.program.id;
```
**Step 2 — `control.start` with `wait: false`.** ⚠ `wait: true` blocks the HTTP request until the process is running and easily exceeds 30 s on a cold kit (live-verified — `wait:true,timeout:30` returned client-side timeout). Pass `wait: false` and poll `status.get` instead.

```typescript
await client.daemon.control.start(id, { wait: false });
while ((await client.daemon.status.get(id)).data!.status.status !== 'running') {
  await new Promise(r => setTimeout(r, 1000));
}
```
### 2. Quick-start ephemeral with TTL — launch, check status, tail logs

**Goal:** fire a one-shot command (no config write), let it run up to 10 minutes, retrieve its output. ⚠ **Major quirk (TypeScript SDK only)** — `quickStart.launch` returns `temporary_id = "quick_<ms>_<seq>"` (e.g. `quick_1700000000000_1`), but the generated SDK's client-side validator rejects that exact id on `quickStart.getStatus` with `id must match pattern: ^quick_\d+$` (live-verified); the CLI and raw HTTP accept the full id and work fine. Truncating to `quick_<ms>` returns 404. **SDK workaround:** use `quickStart.list` to find the entry by `name`, or call `quickStart.getEphemeralLogs` (which DOES accept the full id) to verify the run.

**Step 1 — launch.**

```typescript
const r = await client.daemon.quickStart.launch({
  name: 'examples-daemon-qs',
  command: `sh -c "for i in $(seq 1 30); do echo qs-$i; sleep 1; done"`,
  user: 'user', ttl: 600,
});
const qid = r.data!.temporary_id;
```
**Step 2 — find via `quickStart.list` (in SDK mode this avoids the TypeScript SDK's client-side `^quick_\d+$` pattern validator on `getStatus`; CLI and raw HTTP don't need the detour).**

```typescript
const list = await client.daemon.quickStart.list();
const me = list.data!.ephemeral_programs.find(e => e.name === 'examples-daemon-qs');
```
**Step 3 — tail logs (the full id with `_<seq>` is accepted here).**

```typescript
const lg = await client.daemon.quickStart.getEphemeralLogs(qid, { type: 'stdout', lines: 10 } as any);
```
**Step 4 — stop.** ⚠ The kit's `quickStart.stop` accepts the full `quick_<ms>_<seq>` id (as do the CLI and raw HTTP), but the **generated TypeScript SDK enforces a stricter `^quick_\d+$` pattern client-side** and rejects real ids returned by `quickStart.launch`. In SDK mode drive stop via raw HTTP **POST** to `/api/v1/daemon/quick-start/{id}/stop`, or look up by `name` via `quickStart.list` and use the SDK only for ids matching the stricter pattern.

```typescript
// SDK validator rejects full quick_<ms>_<seq> ids; drop to raw fetch:
await fetch(`${kitUrl}/api/v1/daemon/quick-start/${qid}/stop`, { method: 'POST', headers: kitHeaders });
```
### 3. Lazy port-range fan-out — one program, N port-bound instances

**Goal:** declare an HTTP service that listens on any port in `18800–18802`, materialised on demand the first time someone hits the proxy URL.

**Step 1 — add with `port_range` + `port_param` + `lazy_load`.** ⚠ `port_param` cannot be empty (live-verified — kit returns `400 Invalid port_param format: ""`). Use a real CLI flag, e.g. `--port`. The kit appends ` <flag> <port>` to your command at start-time.

```typescript
const r = await client.daemon.programs.add({
  name: 'examples-daemon-fanout',
  command: 'python3 -m http.server',
  user: 'user', enabled: true,
  port_range: { start: 18800, end: 18802 },
  port_param: '--port', lazy_load: true,
});
const id = r.data!.program.id;
```
**Step 2 — start one specific port and read fleet-wide status.** `programs.list?port=18800&include_status=true` returns the program with a `status: { type: "port-range", running_instances, total_instances, instances: [{ port, status, … }] }` block (live-verified).

```typescript
await client.daemon.control.start(id, { port: 18800 } as any);
const r = await client.daemon.programs.list({ port: 18800, include_status: 'true' } as any);
```
The instance is reachable at `https://${P}-${C}-http-18800.${N}.containers.hoody.com` — no extra alias needed (see § "Reach a service you just started").

### 4. Tail program logs (`status.getLogs` with type / lines)

**Goal:** investigate why a worker keeps restarting. `getLogs` returns `{ logs, type, lines, log_file }` where `log_file` is the on-disk path under `/hoody/storage/hoody-daemon/logs/<name>/{stdout,stderr}.log` (live-verified).

```typescript
const lg = await client.daemon.status.getLogs(id, { type: 'stderr', lines: 200 } as any);
console.log(lg.data!.logs);
```
For a port-range program, pass `?port=18800` to read the per-instance log file.

### 5. Webhook on supervisord process events (e.g. crash → HTTPS callback)

**Goal:** when the program enters the `FATAL` state, POST to your HTTPS endpoint. ⚠ Webhook URLs must be **HTTPS** unless `NODE_ENV=development` (and reject userinfo, `localhost`, and private/CGNAT/link-local ranges). ⚠ **Event names are kit-specific, not the supervisord canonical `PROCESS_STATE_*` ones**: live-verified the kit accepts only `STARTING, RUNNING, BACKOFF, STOPPING, STOPPED, EXITED, FATAL, UNKNOWN, "all", "*"`. Sending `PROCESS_STATE_FATAL` returns `400 Invalid event type`.

```typescript
// ProgramInput requires name + command + user even on partial updates;
// re-pass them from a prior programs.get snapshot.
const cur = (await client.daemon.programs.get(id)).data as any;
await client.daemon.programs.edit(id, {
  name: cur.name, command: cur.command, user: cur.user,
  webhooks: {
    enabled: true,
    urls: ['https://hooks.example.com/daemon-events'],
    events: ['FATAL', 'BACKOFF'],
    headers: { 'X-Source': 'hoody-daemon' },
    timeout: 10, retry: 2,
  },
});
```
⚠ Webhook edits **deep-merge** — fields you omit from the `webhooks` block are NOT cleared. To turn off, send `{ webhooks: { enabled: false } }`. To rotate URLs, send the new full `urls` array (it replaces — array-set, not array-add). The **generated SDK type** (`ProgramInput`) marks `name`, `command`, and `user` as required on every `programs.edit` body (re-send them from a `programs.get` snapshot); the raw kit HTTP API does NOT require them on updates — it field-merges and accepts a partial `ProgramData`, so for surgical patches drop down to `fetch()`.

### 6. Wipe + reset to defaults — non-destructive snapshot first

**Goal:** restore the supervisord program set to whatever ships in `programs.default.json`. ⚠ **Destructive** — every program you added gets wiped. Snapshot before you call. (This step is intentionally NOT live-tested — it would break the shared test container; pattern shown for reference.)

```typescript
const snapshot = (await client.daemon.programs.list()).data;   // SDK list has no `limit` option
await client.daemon.programs.reset();
// then re-create what you want from snapshot.programs[]
```
### 7. Patch only the env vars on a running program

**Goal:** flip `LOG_LEVEL=debug` without restating `command`/`user`/etc. `programs.edit` is a partial merge — fields you don't pass are preserved (live-verified — the response shows merged `environment` plus all original fields intact).

```typescript
// programs.edit takes ProgramInput — name/command/user are required (PUT-style replacement).
// Snapshot, mutate, re-send the full object:
const cur = (await client.daemon.programs.get(id)).data!;
await client.daemon.programs.edit(id, {
  name: cur.name,
  command: cur.command,
  user: cur.user,
  environment: { LOG_LEVEL: 'debug', BUILD: 'examples' },
});
await client.daemon.control.stop(id, {} as any);
await client.daemon.control.start(id, { wait: false });
```
⚠ `environment` REPLACES the whole map (not per-key merge). If you have `{A:1,B:2}` and PATCH `{A:9}`, you end up with just `{A:9}` — re-send everything you want to keep.

### 8. Inspect a running program with stats

**Goal:** read CPU/RSS/uptime to feed a dashboard. `status.get?include_stats=true` returns the basic `{ id, status }` plus stats fields when the process is actually `running` (when in `backoff`/`stopped`, only `status` and a string `uptime` like `"too quickly (process log may have details)"` come back — live-verified).

```typescript
const r = await client.daemon.status.get(id, { include_stats: 'true' } as any);
```
⚠ `include_stats` is a **string** boolean (`"true"`/`"false"`) — `1`/`yes`/empty string return `400` (strict-bool query parse, see Quirks).

### 9. Stop one port instance OR every instance in a port-range fleet

**Goal:** kill just port 18800 vs. drain the whole fleet for a deploy.

**Single port** (other ports keep running):

```typescript
await client.daemon.control.stop(id, { port: 18800 } as any);
```
**Whole fleet** (`all: true`):

```typescript
await client.daemon.control.stop(id, { all: true } as any);
```
⚠ For a port-range program, `control.start` REQUIRES `{ port }` (single-port only); there is no "start them all" — boot each port individually or rely on `lazy_load: true` to materialise on first proxy hit.

### 10. Disable now, re-enable after the migration

**Goal:** keep the program defined but stop supervisord from auto-restarting it. `disable` flips `enabled: false` (process stays in the listing for forensics); `enable` brings it back without touching `command`/`environment`.

```typescript
await client.daemon.control.disable(id);
// … run migration …
await client.daemon.control.enable(id);
await client.daemon.control.start(id, { wait: false });
```
⚠ Trying `control.start` while `enabled: false` returns `success: false` with `Program with ID {id} is disabled` (e.g. `Program with ID 7 is disabled`) — call `control.enable` first.

## Reference

**Accessor:** `client.daemon`  |  **Import:** `import * as daemon from 'hoody-sdk/daemon'`

### `client.daemon.control` (4) — Program control endpoints - enable, disable, start, and stop programs

#### `disable` — Disable a program

```typescript
client.daemon.control.disable(id: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `integer` | path | Yes | Unique numeric identifier of the program |

**Returns:** `daemon_ProgramResponse`  |  **HTTP:** `POST /api/v1/daemon/programs/{id}/disable`
**CLI:** `hoody daemon programs disable`

---

#### `enable` — Enable a program

```typescript
client.daemon.control.enable(id: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `integer` | path | Yes | Unique numeric identifier of the program |

**Returns:** `daemon_ProgramResponse`  |  **HTTP:** `POST /api/v1/daemon/programs/{id}/enable`
**CLI:** `hoody daemon programs enable`

---

#### `start` — Start a program or port instance

```typescript
client.daemon.control.start(id: integer, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `integer` | path | Yes | Unique numeric identifier of the program |
| `data` | `object` | body | No |  |

**Body:** `{ port: int, wait: bool=false, timeout: int=30, if_not_running: bool=false }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/daemon/programs/{id}/start`
**CLI:** `hoody daemon programs start`

---

#### `stop` — Stop a program or port instance

```typescript
client.daemon.control.stop(id: integer, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `integer` | path | Yes | Unique numeric identifier of the program |
| `data` | `object` | body | No |  |

**Body:** `{ port: int, all: bool }`

**Returns:** `daemon_Success`  |  **HTTP:** `POST /api/v1/daemon/programs/{id}/stop`
**CLI:** `hoody daemon programs stop`

---

### `client.daemon.health` (1) — Service health check endpoint - returns standardized 9-field health response for monitoring and readiness probes

#### `check` — Service health check

```typescript
client.daemon.health.check()
```

**Returns:** `daemon_HealthResponse`  |  **HTTP:** `GET /api/v1/daemon/health`
**CLI:** `hoody daemon health`

---

### `client.daemon.programs` (8) — Program management endpoints - create, read, update, and delete daemon programs

#### `add` — Add a new CUSTOM program

```typescript
client.daemon.programs.add(data: daemon_ProgramInput)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `daemon_ProgramInput` | body | Yes |  |

**Returns:** `daemon_AddProgramResponse`  |  **HTTP:** `POST /api/v1/daemon/programs/add`
**CLI:** `hoody daemon programs create`

---

#### `edit` — Edit a program

```typescript
client.daemon.programs.edit(id: integer, data: daemon_ProgramInput)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `integer` | path | Yes | Unique numeric identifier of the program |
| `data` | `daemon_ProgramInput` | body | Yes |  |

**Returns:** `daemon_ProgramResponse`  |  **HTTP:** `POST /api/v1/daemon/programs/edit/{id}`
**CLI:** `hoody daemon programs edit`

---

#### `get` — Get a specific program

```typescript
client.daemon.programs.get(id: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `integer` | path | Yes | Unique numeric identifier of the program |

**Returns:** `daemon_ProgramResponse`  |  **HTTP:** `GET /api/v1/daemon/programs/{id}`
**CLI:** `hoody daemon programs get`

---

#### `list` — List all programs

```typescript
client.daemon.programs.list(hoody_kit?: string, lazy_load?: string, enabled?: string, boot?: string, port?: integer, port_from?: integer, port_to?: integer, include_status?: string, include_stats?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `hoody_kit` | `string` | query | No | Filter by hoody_kit status. Use "true" for Hoody Kit programs only, "false" for user (non-kit) programs only. |
| `lazy_load` | `string` | query | No | Filter by lazy_load status. Use "true" for lazy-loaded programs only (started on-demand), "false" for programs that auto-start. |
| `enabled` | `string` | query | No | Filter by enabled status. Use "true" for enabled programs only, "false" for disabled programs only. |
| `boot` | `string` | query | No | Filter by boot status. Use "true" for programs that auto-start on system boot, "false" for manual-start programs. |
| `port` | `integer` | query | No | Filter programs by single port number. Returns only programs whose port_range includes this specific port. Example: ?port=8042 returns programs with ranges containing 8042. |
| `port_from` | `integer` | query | No | Filter by port range start (must be used with port_to). Returns programs whose port ranges overlap with the specified range. Uses overlap logic: program.start <= port_to AND program.end >= port_from. |
| `port_to` | `integer` | query | No | Filter by port range end (must be used with port_from). Returns programs whose port ranges overlap with the specified range. Multiple programs may be returned if their ranges overlap. |
| `include_status` | `string` | query | No | Include runtime status for each program. When true, adds a "status" field to each program showing current running state, instances, and process details. |
| `include_stats` | `string` | query | No | Include resource stats (CPU, memory, process tree) for each running program. Implies include_status=true. Adds a "stats" field with pid, started_at, cpu_percent, memory_rss_bytes, process_count, and per-process breakdown. Only present for running programs. |

**Returns:** `daemon_ProgramListResponse`  |  **HTTP:** `GET /api/v1/daemon/programs`
**CLI:** `hoody daemon programs list`

---

#### `listAll` — List all programs (collect all pages)

```typescript
client.daemon.programs.listAll(hoody_kit?: string, lazy_load?: string, enabled?: string, boot?: string, port?: integer, port_from?: integer, port_to?: integer, include_status?: string, include_stats?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `hoody_kit` | `string` | query | No | Filter by hoody_kit status. Use "true" for Hoody Kit programs only, "false" for user (non-kit) programs only. |
| `lazy_load` | `string` | query | No | Filter by lazy_load status. Use "true" for lazy-loaded programs only (started on-demand), "false" for programs that auto-start. |
| `enabled` | `string` | query | No | Filter by enabled status. Use "true" for enabled programs only, "false" for disabled programs only. |
| `boot` | `string` | query | No | Filter by boot status. Use "true" for programs that auto-start on system boot, "false" for manual-start programs. |
| `port` | `integer` | query | No | Filter programs by single port number. Returns only programs whose port_range includes this specific port. Example: ?port=8042 returns programs with ranges containing 8042. |
| `port_from` | `integer` | query | No | Filter by port range start (must be used with port_to). Returns programs whose port ranges overlap with the specified range. Uses overlap logic: program.start <= port_to AND program.end >= port_from. |
| `port_to` | `integer` | query | No | Filter by port range end (must be used with port_from). Returns programs whose port ranges overlap with the specified range. Multiple programs may be returned if their ranges overlap. |
| `include_status` | `string` | query | No | Include runtime status for each program. When true, adds a "status" field to each program showing current running state, instances, and process details. |
| `include_stats` | `string` | query | No | Include resource stats (CPU, memory, process tree) for each running program. Implies include_status=true. Adds a "stats" field with pid, started_at, cpu_percent, memory_rss_bytes, process_count, and per-process breakdown. Only present for running programs. |

**Returns:** `daemon_ProgramListResponse[]`  |  **HTTP:** `GET /api/v1/daemon/programs`
**CLI:** `hoody daemon programs list`

---

#### `listIterator` — List all programs (async iterator)

```typescript
client.daemon.programs.listIterator(hoody_kit?: string, lazy_load?: string, enabled?: string, boot?: string, port?: integer, port_from?: integer, port_to?: integer, include_status?: string, include_stats?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `hoody_kit` | `string` | query | No | Filter by hoody_kit status. Use "true" for Hoody Kit programs only, "false" for user (non-kit) programs only. |
| `lazy_load` | `string` | query | No | Filter by lazy_load status. Use "true" for lazy-loaded programs only (started on-demand), "false" for programs that auto-start. |
| `enabled` | `string` | query | No | Filter by enabled status. Use "true" for enabled programs only, "false" for disabled programs only. |
| `boot` | `string` | query | No | Filter by boot status. Use "true" for programs that auto-start on system boot, "false" for manual-start programs. |
| `port` | `integer` | query | No | Filter programs by single port number. Returns only programs whose port_range includes this specific port. Example: ?port=8042 returns programs with ranges containing 8042. |
| `port_from` | `integer` | query | No | Filter by port range start (must be used with port_to). Returns programs whose port ranges overlap with the specified range. Uses overlap logic: program.start <= port_to AND program.end >= port_from. |
| `port_to` | `integer` | query | No | Filter by port range end (must be used with port_from). Returns programs whose port ranges overlap with the specified range. Multiple programs may be returned if their ranges overlap. |
| `include_status` | `string` | query | No | Include runtime status for each program. When true, adds a "status" field to each program showing current running state, instances, and process details. |
| `include_stats` | `string` | query | No | Include resource stats (CPU, memory, process tree) for each running program. Implies include_status=true. Adds a "stats" field with pid, started_at, cpu_percent, memory_rss_bytes, process_count, and per-process breakdown. Only present for running programs. |

**Returns:** `AsyncIterableIterator<daemon_ProgramListResponse>`  |  **HTTP:** `GET /api/v1/daemon/programs`
**CLI:** `hoody daemon programs list`

---

#### `remove` — Remove a program

```typescript
client.daemon.programs.remove(id: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `integer` | path | Yes | Unique numeric identifier of the program |

**Returns:** `daemon_RemoveProgramResponse`  |  **HTTP:** `POST /api/v1/daemon/programs/remove/{id}`
**CLI:** `hoody daemon programs delete`

---

#### `reset` — Reset programs to default

```typescript
client.daemon.programs.reset()
```

**Returns:** `any`  |  **HTTP:** `POST /api/v1/daemon/programs/reset`
**CLI:** `hoody daemon programs reset`

---

### `client.daemon.quickStart` (7) — Ephemeral program launcher - Create temporary programs that auto-cleanup when stopped or on reboot

#### `getEphemeralLogs` — Get ephemeral program logs

```typescript
client.daemon.quickStart.getEphemeralLogs(id: string, type?: string, lines?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Ephemeral program temporary ID |
| `type` | `string` | query | No | Log stream: stdout or stderr |
| `lines` | `integer` | query | No | Number of lines to return from end of file |

**Returns:** `daemon_LogResponse`  |  **HTTP:** `GET /api/v1/daemon/quick-start/{id}/logs`
**CLI:** `hoody daemon ephemeral logs`

---

#### `getStatus` — Get ephemeral program status

```typescript
client.daemon.quickStart.getStatus(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Temporary ID of the ephemeral program (format: quick_<timestamp>) |

**Returns:** `daemon_QuickStartResponse`  |  **HTTP:** `GET /api/v1/daemon/quick-start/{id}/status`
**CLI:** `hoody daemon ephemeral status`

---

#### `launch` — Launch ephemeral CUSTOM program

```typescript
client.daemon.quickStart.launch(data: daemon_EphemeralProgramInput)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `daemon_EphemeralProgramInput` | body | Yes |  |

**Returns:** `daemon_QuickStartResponse`  |  **HTTP:** `POST /api/v1/daemon/quick-start`
**CLI:** `hoody daemon ephemeral start`

---

#### `list` — List all ephemeral programs

```typescript
client.daemon.quickStart.list()
```

**Returns:** `daemon_QuickStartListResponse`  |  **HTTP:** `GET /api/v1/daemon/quick-start`
**CLI:** `hoody daemon ephemeral list`

---

#### `listAll` — List all ephemeral programs (collect all pages)

```typescript
client.daemon.quickStart.listAll()
```

**Returns:** `daemon_QuickStartListResponse[]`  |  **HTTP:** `GET /api/v1/daemon/quick-start`
**CLI:** `hoody daemon ephemeral list`

---

#### `listIterator` — List all ephemeral programs (async iterator)

```typescript
client.daemon.quickStart.listIterator()
```

**Returns:** `AsyncIterableIterator<daemon_QuickStartListResponse>`  |  **HTTP:** `GET /api/v1/daemon/quick-start`
**CLI:** `hoody daemon ephemeral list`

---

#### `stop` — Stop ephemeral program

```typescript
client.daemon.quickStart.stop(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Temporary ID of the ephemeral program to stop |

**Returns:** `daemon_QuickStartStopResponse`  |  **HTTP:** `POST /api/v1/daemon/quick-start/{id}/stop`
**CLI:** `hoody daemon ephemeral stop`

---

### `client.daemon.status` (3) — Status monitoring endpoints - monitor runtime status of programs and instances

#### `get` — Get specific program status

```typescript
client.daemon.status.get(id: integer, port?: integer, include_stats?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `integer` | path | Yes | Unique numeric identifier of the program |
| `port` | `integer` | query | No | Filter to specific port instance (for port-range programs only) |
| `include_stats` | `string` | query | No | Include resource stats (CPU, memory, process tree) for running programs. Adds a "stats" field with pid, started_at, cpu_percent, memory_rss_bytes, process_count, and per-process breakdown. |

**Returns:** `daemon_StatusResponse`  |  **HTTP:** `GET /api/v1/daemon/status/{id}`
**CLI:** `hoody daemon programs status`

---

#### `getAll` — Get all program statuses

```typescript
client.daemon.status.getAll()
```

**Returns:** `daemon_AllStatusResponse`  |  **HTTP:** `GET /api/v1/daemon/status`
**CLI:** `hoody daemon programs statuses`

---

#### `getLogs` — Get program logs

```typescript
client.daemon.status.getLogs(id: integer, type?: string, lines?: integer, port?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `integer` | path | Yes | Program ID |
| `type` | `string` | query | No | Log stream: stdout or stderr |
| `lines` | `integer` | query | No | Number of lines to return from end of file |
| `port` | `integer` | query | No | Port number (required for port-range programs) |

**Returns:** `daemon_LogResponse`  |  **HTTP:** `GET /api/v1/daemon/programs/{id}/logs`
**CLI:** `hoody daemon programs logs`


### Body schemas

- `daemon_ProgramInput` — `{ id: int, name*: string, description: string, command*: string, user*: string, enabled: bool=true, boot: bool=false, delay_seconds: int=0, autorestart: "true" | "false" | "unexpected"="unexpected", directory: string, priority: int=999, stdout_logfile: string, stderr_logfile: string, logs_enabled: bool=true, log_max_bytes: int=5242880, log_backups: int=2, environment: { [key: string]: string }, hoody_kit: bool=false, port_range: { start*: int, end*: int }, port_param: string="--port", lazy_load: bool=false, display: string|null, terminal_id: int, terminal_shell: "bash" | "zsh" | "fish" | "sh" | "tmux"|null, terminal_interactive: bool|null, webhooks: { enabled: bool, urls: string[], events: string | string[], headers: object, timeout: int, retry: int }|null }`
- `daemon_EphemeralProgramInput` — `{ command*: string, user*: string, name: string, autorestart: "true" | "false" | "unexpected"="unexpected", directory: string, environment: { [key: string]: string }, priority: int=999, delay_seconds: int=0, stdout_logfile: string, stderr_logfile: string, logs_enabled: bool=true, log_max_bytes: int=5242880, log_backups: int=2, ttl: int, wait: bool=false, timeout: int=30, display: string|null, terminal_id: int, terminal_shell: "bash" | "zsh" | "fish" | "sh" | "tmux"|null, terminal_interactive: bool|null }`

