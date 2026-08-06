> _**HTTP skill · `daemon` namespace** · ~7,341 tokens · hoody-sdk v1.0.0-beta.12_

# `daemon` — supervisord program lifecycle (start any program; logs always retained)

## Purpose

**Default for "start a program" / "spawn a process"** when you don't need an interactive shell or a TUI. REST over `supervisord` — every process is supervised, auto-restart-eligible, log-captured (stdout + stderr written under `/hoody/storage/hoody-daemon/logs/<name>/stdout.log` and `/hoody/storage/hoody-daemon/logs/<name>/stderr.log` — one directory per program, with rotated timestamped log files behind those symlinks), and inspectable after the fact. Log FILES outlive the process on disk, but the ephemeral tracking entry is reaped on stop/exit — after that `GET /api/v1/daemon/quick-start/{id}/logs` 404s (see Quirks); capture logs before stopping, or read the on-disk files directly (e.g. via the `files` namespace). `GET /api/v1/daemon/programs/{id}/logs` covers configured (non-ephemeral) programs.

Two flavours:

- **Quick-start (ephemeral, no config write)** — `quickStart.launch { command, user, ttl?, wait?, timeout? }`. Returns `temporary_id = quick_<ts>_<seq>`. Best for one-offs and short-lived jobs (build steps, batch transforms, "run this once and tell me the output"). Logs survive the process; pull with `GET /api/v1/daemon/quick-start/{id}/logs`. Optional `ttl` auto-stops after N seconds.
- **Registered program (durable, persists across kit restarts)** — `programs.add { name, command, user, enabled: true, boot: true?, autorestart: 'unexpected', … }` → `control.start { wait: true }`. Use this when the process should come back after a container restart, when you want auto-restart on crash, or when you need port-range fan-out / lazy-load on first proxy hit.

## When to use

- "Run this command and keep the logs" → `POST /api/v1/daemon/quick-start`.
- "Run this server / agent / script as a long-running supervised process, restart on failure" → `POST /api/v1/daemon/programs/add` + `POST /api/v1/daemon/programs/{id}/start`.
- Background workers, port-range fan-out, lazy-loaded HTTP services, supervisord-event webhooks.

## When NOT to use

- **Traditional system services that ship native systemd units** (apache2, nginx, postgresql, mysql, redis, mosquitto, sshd, postfix, …) — leave them on `systemd`. Hoody containers are full Linux boxes with systemd + root (they behave like VMs, not Docker), so the standard `apt install nginx && systemctl enable --now nginx` flow Just Works and benefits from the upstream unit's hardening (drop-in directories, sd_notify, journal integration, etc.). Mixing systemd-managed and `daemon`-managed processes in the same container is fine — pick whichever fits the program.
- Need an interactive TTY (Claude Code, Codex, htop, vim, anything that paints the screen) → use `terminal` with a **pinned non-ephemeral `terminal_id`**, NOT `daemon`. Daemon programs have no TTY.
- Need to pipe input mid-run / send keystrokes → `terminal` (`POST /api/v1/terminal/press`, `POST /api/v1/terminal/paste`).
- One-shot synchronous request/response → `exec` (HTTP handler, returns body).
- Schedule (cron syntax) → `cron`. Access logs → `proxyLogs`. File-system events → `watch`.

### When to prefer `daemon` over `systemd`

- Custom scripts and binaries you wrote that don't have a packaged unit.
- Quick experiments where you want REST-driven start/stop/log without writing a unit file.
- Port-range fan-out (`port_range` + `port_param` + `lazy_load`) — supervisord-side feature, not a systemd one.
- Programs you want to provision / mutate / remove via the Hoody API (CI scripts, multi-tenant container fleets) — `POST /api/v1/daemon/programs/add` is one HTTP call.

### When to prefer `systemd` over `daemon`

- Any service whose Debian/Ubuntu package already drops a working unit in `/lib/systemd/system/` (most server software).
- You want `journalctl -u <service>`, `systemctl status`, drop-in overrides, socket-activated services, timers (cron-equivalent), or any other systemd feature.
- The program is part of the container's "default-on" baseline (boots with the container, never managed externally).

## Prerequisites

- `/dev/hoody`, `/hoody`, `LOG_BASE_DIR=/hoody/storage/hoody-daemon/logs/` exist.
- `user` = real system account.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Register and boot

- `POST /api/v1/daemon/programs/add` (`name`/`command`/`user`; `enabled`, `boot`; opt `directory`/`environment`/`autorestart`/`priority`/`*_logfile`) -> `POST /api/v1/daemon/programs/{id}/start` `{ wait: true, timeout: 30 }` -> `GET /api/v1/daemon/status/{id}` (`include_stats`); `GET /api/v1/daemon/programs/{id}/logs` on failure.

### 2. Ephemeral with TTL

- `POST /api/v1/daemon/quick-start` (`command`/`user`, opt `ttl?`/`wait?`/`timeout?`) returns `temporary_id` = `quick_<ts>_<seq>`. Poll/tail with `GET /api/v1/daemon/quick-start/{id}/status`/`GET /api/v1/daemon/quick-start/{id}/logs`; `POST /api/v1/daemon/quick-start/{id}/stop` to terminate.

### 3. Lazy port-range fleet

- `POST /api/v1/daemon/programs/add` + `port_range: { start, end }`, `port_param`, `lazy_load: true`, `enabled: true`. `programs.list?port=8042&include_status=true`. `POST /api/v1/daemon/programs/{id}/start` `{ port: 8042 }`; `POST /api/v1/daemon/programs/{id}/stop` `{ port }` or `{ all: true }`.

### 4. Reach a service you just started

Any container port is publicly addressable as soon as the listener is up — no proxy alias, firewall edit, or extra registration needed:

- HTTP service on `:8080` → `https://{projectId}-{containerId}-http-8080.{node}.containers.hoody.com`
- HTTPS service on `:8443` → `https://{projectId}-{containerId}-https-8443.{node}.containers.hoody.com`

Edge is always `https://`; the slug only describes the inner protocol. Gate access via `proxyPermissionsContainer.*` if it shouldn't be public. See § Proxy URLs.

### 5. Update / wipe

`POST /api/v1/daemon/programs/edit/{id}` field-merge; `POST /api/v1/daemon/programs/{id}/disable`/`POST /api/v1/daemon/programs/{id}/enable`; `POST /api/v1/daemon/programs/remove/{id}`; `POST /api/v1/daemon/programs/reset` -> `programs.default.json`.

## Quirks & gotchas

- Boolean query params (`hoody_kit`, `lazy_load`, `enabled`, `boot`, `include_status`, `include_stats`) STRICT: only `true`/`false`; `1`/`yes`/`0`/`""` -> 400.
- Webhook URLs HTTPS-only unless `NODE_ENV=development` (which also skips every host check below). Userinfo is always rejected; in production the literal label `localhost` and private/CGNAT/link-local/v6-ULA addresses are too, including when written as NAT64, v4-mapped-v6, or non-standard v4 (`2130706433`, `0x7f000001`, `127.1`) — but only when the URL authority is already an IP literal or `localhost`. A DNS name is accepted whatever it resolves to, so treat this as input validation, not an egress control. Redirects are never followed.
- Webhook edits deep-merge (omitted fields NOT cleared); events need `notifications.enabled` + `event_listener_enabled` + supervisord `eventlistener`.
- Duplicate names + overlapping port ranges rejected on create AND update (adjacent OK); `port_param` requires `port_range`.
- `command` no newlines/CR/NUL; `user` `(?i)[a-z_][a-z0-9_-]*\$?` (case-insensitive) via `id`; `*_logfile` confined to `LOG_BASE_DIR`.
- `POST /api/v1/daemon/programs/{id}/start` on `port_range` REQUIRES `{ port }`; `POST /api/v1/daemon/programs/{id}/stop` `{ port }` or `{ all: true }`.
- `quick_<ms>_<seq>` IDs (e.g. `quick_1700000000000_1`) are produced by the kit (which accepts `^quick_[a-zA-Z0-9_]+$` via `sanitize_temp_id`) but the OpenAPI path-param schema is the stricter `^quick_\d+$`, and the generated **TypeScript SDK enforces it client-side** — the CLI and raw HTTP pass the full id straight to the kit and work fine. In SDK mode, drive `GET /api/v1/daemon/quick-start/{id}/status` / `POST /api/v1/daemon/quick-start/{id}/stop` via raw HTTP to avoid the local validator, OR call `GET /api/v1/daemon/quick-start` and select by `name`. TTL polled ~10 s.
- Default ephemeral log paths are `/hoody/storage/hoody-daemon/logs/<name>/stdout.log` and `/hoody/storage/hoody-daemon/logs/<name>/stderr.log` (one directory per program), NOT `<name>.out.log`/`<name>.err.log`.
- After `POST /api/v1/daemon/quick-start/{id}/stop`, the in-memory tracking entry is removed (the on-disk log files persist but are unreachable through `GET /api/v1/daemon/quick-start/{id}/logs`, which returns `404`). Capture logs (read `GET /api/v1/daemon/quick-start/{id}/logs` or fetch the on-disk file directly) BEFORE calling `stop`.
- `POST /api/v1/daemon/programs/{id}/start` accepts `if_not_running: true` for an idempotent boot — early-returns with `already_running: true` if the program is already running (port-range responses include an `instance` block with per-instance status/pid; standard programs return `instance: null` — no pid). Use it for "ensure started" workflows.
- **`environment` REPLACES the whole map** on `POST /api/v1/daemon/programs/edit/{id}` (not per-key merge). If the existing env is `{A:1,B:2}` and you PATCH `{environment:{A:9}}`, the result is `{A:9}`. To preserve secrets, GET the program first and re-send the merged map.
- Webhook delivery requires THREE flags ON: per-program `webhooks.enabled: true`, kit-level `notifications.enabled: true`, AND kit-level `event_listener_enabled: true`. Toggling only the per-program flag will not fire callbacks.
- Proxy `X-Bypass-Local-Restrictions` strips `command`/`environment`/`directory`/`user`/`webhooks`/`stdout_logfile`/`stderr_logfile`.
- CLI `--port-range-{start,end}` -> nested `port_range`.

## Common errors

- 400 webhook: `must use HTTPS`, `contains userinfo`, `reserved IP range`.
- 400 `name already in use` / `Port range overlaps` / `port_param requires port_range`.
- success=false `Port parameter required` / `Program with ID {id} is disabled` -> `POST /api/v1/daemon/programs/{id}/enable`.
- Direct private-IP connections get a plain `403 Forbidden` (the kit logs `connection blocked reason=private_ip` server-side; that string is NOT in the response) -> use the capability URL.
- 1 MB JSON body limit.

## Related namespaces

`exec` sync. `cron` scheduled. `proxyLogs` access log. `terminal` TTY. `display` virtual display.

## Examples

Every step in every example was live-tested against a real `daemon-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first. The kit returns numeric `program.id` (not a UUID) — capture it from the `POST /api/v1/daemon/programs/add` response.

### 1. Register a long-running supervised program with auto-boot

**Goal:** add a tick-emitting worker that supervisord keeps alive across kit restarts, then start it without blocking the caller.

**Step 1 — add (`enabled: true`, `boot: true`).** Capture `program.id`. Use `user: "user"` (uid 1000); the daemon's `command` allows shell metachars but you must own the quoting — single-quote the outer payload to avoid double-escaping.

```bash
KIT="https://${P}-${C}-daemon-1.${N}.containers.hoody.com"
ID=$(curl -sX POST "$KIT/api/v1/daemon/programs/add" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"examples-daemon-tick",
    "command":"sh -c '\''while :; do echo tick $(date -u +%s); sleep 5; done'\''",
    "user":"user","enabled":true,"boot":true,"autorestart":"unexpected"
  }' | jq -r '.program.id')
echo "id=$ID"
```
**Step 2 — `POST /api/v1/daemon/programs/{id}/start` with `wait: false`.** ⚠ `wait: true` blocks the HTTP request until the process is running and easily exceeds 30 s on a cold kit (live-verified — `wait:true,timeout:30` returned client-side timeout). Pass `wait: false` and poll `GET /api/v1/daemon/status/{id}` instead.

```bash
curl -sX POST "$KIT/api/v1/daemon/programs/$ID/start" \
  -H 'Content-Type: application/json' -d '{"wait":false}'
# Poll until running:
while [ "$(curl -sf "$KIT/api/v1/daemon/status/$ID" | jq -r .status.status)" != "running" ]; do sleep 1; done
```
### 2. Quick-start ephemeral with TTL — launch, check status, tail logs

**Goal:** fire a one-shot command (no config write), let it run up to 10 minutes, retrieve its output. ⚠ **Major quirk (TypeScript SDK only)** — `POST /api/v1/daemon/quick-start` returns `temporary_id = "quick_<ms>_<seq>"` (e.g. `quick_1700000000000_1`), but the generated SDK's client-side validator rejects that exact id on `GET /api/v1/daemon/quick-start/{id}/status` with `id must match pattern: ^quick_\d+$` (live-verified); the CLI and raw HTTP accept the full id and work fine. Truncating to `quick_<ms>` returns 404. **SDK workaround:** use `GET /api/v1/daemon/quick-start` to find the entry by `name`, or call `GET /api/v1/daemon/quick-start/{id}/logs` (which DOES accept the full id) to verify the run.

**Step 1 — launch.**

```bash
KIT="https://${P}-${C}-daemon-1.${N}.containers.hoody.com"
QID=$(curl -sX POST "$KIT/api/v1/daemon/quick-start" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"examples-daemon-qs",
    "command":"sh -c \"for i in $(seq 1 30); do echo qs-$i; sleep 1; done\"",
    "user":"user","ttl":600
  }' | jq -r .temporary_id)
echo "qid=$QID"   # e.g. quick_1700000000000_1
```
**Step 2 — find via `GET /api/v1/daemon/quick-start` (in SDK mode this avoids the TypeScript SDK's client-side `^quick_\d+$` pattern validator on `GET /api/v1/daemon/quick-start/{id}/status`; CLI and raw HTTP don't need the detour).**

```bash
curl -sf "$KIT/api/v1/daemon/quick-start" \
  | jq '.ephemeral_programs[] | select(.name=="examples-daemon-qs") | {temporary_id,status,expires_at}'
```
**Step 3 — tail logs (the full id with `_<seq>` is accepted here).**

```bash
curl -sf "$KIT/api/v1/daemon/quick-start/$QID/logs?type=stdout&lines=10" | jq -r .logs
```
**Step 4 — stop.** ⚠ The kit's `POST /api/v1/daemon/quick-start/{id}/stop` accepts the full `quick_<ms>_<seq>` id (as do the CLI and raw HTTP), but the **generated TypeScript SDK enforces a stricter `^quick_\d+$` pattern client-side** and rejects real ids returned by `POST /api/v1/daemon/quick-start`. In SDK mode drive stop via raw HTTP **POST** to `/api/v1/daemon/quick-start/{id}/stop`, or look up by `name` via `GET /api/v1/daemon/quick-start` and use the SDK only for ids matching the stricter pattern.

```bash
curl -sX POST "$KIT/api/v1/daemon/quick-start/$QID/stop"
```
### 3. Lazy port-range fan-out — one program, N port-bound instances

**Goal:** declare an HTTP service that listens on any port in `18800–18802`, materialised on demand the first time someone hits the proxy URL.

**Step 1 — add with `port_range` + `port_param` + `lazy_load`.** ⚠ `port_param` cannot be empty (live-verified — kit returns `400 Invalid port_param format: ""`). Use a real CLI flag, e.g. `--port`. The kit appends ` <flag> <port>` to your command at start-time.

```bash
KIT="https://${P}-${C}-daemon-1.${N}.containers.hoody.com"
ID=$(curl -sX POST "$KIT/api/v1/daemon/programs/add" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"examples-daemon-fanout",
    "command":"python3 -m http.server",
    "user":"user","enabled":true,
    "port_range":{"start":18800,"end":18802},
    "port_param":"--port","lazy_load":true
  }' | jq -r .program.id)
```
**Step 2 — start one specific port and read fleet-wide status.** `programs.list?port=18800&include_status=true` returns the program with a `status: { type: "port-range", running_instances, total_instances, instances: [{ port, status, … }] }` block (live-verified).

```bash
curl -sX POST "$KIT/api/v1/daemon/programs/$ID/start" \
  -H 'Content-Type: application/json' -d '{"port":18800}'
curl -sf "$KIT/api/v1/daemon/programs?port=18800&include_status=true" \
  | jq '.programs[].status'
```
The instance is reachable at `https://${P}-${C}-http-18800.${N}.containers.hoody.com` — no extra alias needed (see § "Reach a service you just started").

### 4. Tail program logs (`GET /api/v1/daemon/programs/{id}/logs` with type / lines)

**Goal:** investigate why a worker keeps restarting. `GET /api/v1/daemon/programs/{id}/logs` returns `{ logs, type, lines, log_file }` where `log_file` is the on-disk path under `/hoody/storage/hoody-daemon/logs/<name>/{stdout,stderr}.log` (live-verified).

```bash
KIT="https://${P}-${C}-daemon-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/daemon/programs/$ID/logs?type=stderr&lines=200" | jq -r .logs
```
For a port-range program, pass `?port=18800` to read the per-instance log file.

### 5. Webhook on supervisord process events (e.g. crash → HTTPS callback)

**Goal:** when the program enters the `FATAL` state, POST to your HTTPS endpoint. ⚠ Webhook URLs must be **HTTPS** unless `NODE_ENV=development` (and reject userinfo, `localhost`, and private/CGNAT/link-local ranges). ⚠ **Event names are kit-specific, not the supervisord canonical `PROCESS_STATE_*` ones**: live-verified the kit accepts only `STARTING, RUNNING, BACKOFF, STOPPING, STOPPED, EXITED, FATAL, UNKNOWN, "all", "*"`. Sending `PROCESS_STATE_FATAL` returns `400 Invalid event type`.

```bash
KIT="https://${P}-${C}-daemon-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/daemon/programs/edit/$ID" \
  -H 'Content-Type: application/json' \
  -d '{
    "webhooks":{
      "enabled":true,
      "urls":["https://hooks.example.com/daemon-events"],
      "events":["FATAL","BACKOFF"],
      "headers":{"X-Source":"hoody-daemon"},
      "timeout":10,"retry":2
    }
  }'
```
⚠ Webhook edits **deep-merge** — fields you omit from the `webhooks` block are NOT cleared. To turn off, send `{ webhooks: { enabled: false } }`. To rotate URLs, send the new full `urls` array (it replaces — array-set, not array-add). The **generated SDK type** (`ProgramInput`) marks `name`, `command`, and `user` as required on every `POST /api/v1/daemon/programs/edit/{id}` body (re-send them from a `GET /api/v1/daemon/programs/{id}` snapshot); the raw kit HTTP API does NOT require them on updates — it field-merges and accepts a partial `ProgramData`, so for surgical patches drop down to `fetch()`.

### 6. Wipe + reset to defaults — non-destructive snapshot first

**Goal:** restore the supervisord program set to whatever ships in `programs.default.json`. ⚠ **Destructive** — every program you added gets wiped. Snapshot before you call. (This step is intentionally NOT live-tested — it would break the shared test container; pattern shown for reference.)

```bash
KIT="https://${P}-${C}-daemon-1.${N}.containers.hoody.com"
# 1) snapshot
curl -sf "$KIT/api/v1/daemon/programs" > /tmp/daemon-snapshot.json   # programs.list takes no `limit` query
# 2) reset
curl -sX POST "$KIT/api/v1/daemon/programs/reset"
# 3) restore the entries you want by replaying programs.add for each
```
### 7. Patch only the env vars on a running program

**Goal:** flip `LOG_LEVEL=debug` without restating `command`/`user`/etc. `POST /api/v1/daemon/programs/edit/{id}` is a partial merge — fields you don't pass are preserved (live-verified — the response shows merged `environment` plus all original fields intact).

```bash
KIT="https://${P}-${C}-daemon-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/daemon/programs/edit/$ID" \
  -H 'Content-Type: application/json' \
  -d '{"environment":{"LOG_LEVEL":"debug","BUILD":"examples"}}'
# Restart so the child inherits the new env
curl -sX POST "$KIT/api/v1/daemon/programs/$ID/stop"
curl -sX POST "$KIT/api/v1/daemon/programs/$ID/start" \
  -H 'Content-Type: application/json' -d '{"wait":false}'
```
⚠ `environment` REPLACES the whole map (not per-key merge). If you have `{A:1,B:2}` and PATCH `{A:9}`, you end up with just `{A:9}` — re-send everything you want to keep.

### 8. Inspect a running program with stats

**Goal:** read CPU/RSS/uptime to feed a dashboard. `status.get?include_stats=true` returns the basic `{ id, status }` plus stats fields when the process is actually `running` (when in `backoff`/`stopped`, only `status` and a string `uptime` like `"too quickly (process log may have details)"` come back — live-verified).

```bash
KIT="https://${P}-${C}-daemon-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/daemon/status/$ID?include_stats=true" | jq .
```
⚠ `include_stats` is a **string** boolean (`"true"`/`"false"`) — `1`/`yes`/empty string return `400` (strict-bool query parse, see Quirks).

### 9. Stop one port instance OR every instance in a port-range fleet

**Goal:** kill just port 18800 vs. drain the whole fleet for a deploy.

**Single port** (other ports keep running):

```bash
KIT="https://${P}-${C}-daemon-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/daemon/programs/$ID/stop" \
  -H 'Content-Type: application/json' -d '{"port":18800}'
```
**Whole fleet** (`all: true`):

```bash
curl -sX POST "$KIT/api/v1/daemon/programs/$ID/stop" \
  -H 'Content-Type: application/json' -d '{"all":true}'
```
⚠ For a port-range program, `POST /api/v1/daemon/programs/{id}/start` REQUIRES `{ port }` (single-port only); there is no "start them all" — boot each port individually or rely on `lazy_load: true` to materialise on first proxy hit.

### 10. Disable now, re-enable after the migration

**Goal:** keep the program defined but stop supervisord from auto-restarting it. `POST /api/v1/daemon/programs/{id}/disable` flips `enabled: false` (process stays in the listing for forensics); `POST /api/v1/daemon/programs/{id}/enable` brings it back without touching `command`/`environment`.

```bash
KIT="https://${P}-${C}-daemon-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/daemon/programs/$ID/disable"
# … run migration …
curl -sX POST "$KIT/api/v1/daemon/programs/$ID/enable"
# Then explicitly start (enable does NOT auto-start the process, only flips the flag):
curl -sX POST "$KIT/api/v1/daemon/programs/$ID/start" \
  -H 'Content-Type: application/json' -d '{"wait":false}'
```
⚠ Trying `POST /api/v1/daemon/programs/{id}/start` while `enabled: false` returns `success: false` with `Program with ID {id} is disabled` (e.g. `Program with ID 7 is disabled`) — call `POST /api/v1/daemon/programs/{id}/enable` first.

## Reference

### `control` (4) — Program control endpoints - enable, disable, start, and stop programs

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/daemon/programs/{id}/disable` | Disable a program |  |
| `POST /api/v1/daemon/programs/{id}/enable` | Enable a program |  |
| `POST /api/v1/daemon/programs/{id}/start` | Start a program or port instance | `body` |
| `POST /api/v1/daemon/programs/{id}/stop` | Stop a program or port instance | `body` |

**Body shapes:**

- `POST /api/v1/daemon/programs/{id}/start` body — `{ port: int, wait: bool=false, timeout: int=30, if_not_running: bool=false }` — Optional port parameter for port-range programs
  - `port` — Port number to start (required for port-range programs)
  - `wait` — Wait for program to reach RUNNING state before returning
  - `timeout` — Timeout in seconds when wait=true (default: 30)
  - `if_not_running` — Only start if not already running (idempotent mode). If true, checks if instance is running first. Returns already_running field in response. Use this for edge proxy automation.
- `POST /api/v1/daemon/programs/{id}/stop` body — `{ port: int, all: bool }` — Optional parameters for port-range programs
  - `port` — Specific port to stop
  - `all` — Stop all instances (for port-range programs)

### `health` (1) — Service health check endpoint - returns standardized 9-field health response for monitoring and readiness probes

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/daemon/health` | Service health check |  |

### `programs` (6) — Program management endpoints - create, read, update, and delete daemon programs

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/daemon/programs/add` | Add a new CUSTOM program | `body*:daemon_ProgramInput` |
| `POST /api/v1/daemon/programs/edit/{id}` | Edit a program | `body*:daemon_ProgramInput` |
| `GET /api/v1/daemon/programs/{id}` | Get a specific program |  |
| `GET /api/v1/daemon/programs` | List all programs | `?hoody_kit` `?lazy_load` `?enabled` `?boot` `?port` `?port_from` `?port_to` `?include_status` `?include_stats` |
| `POST /api/v1/daemon/programs/remove/{id}` | Remove a program |  |
| `POST /api/v1/daemon/programs/reset` | Reset programs to default |  |

**Param notes:**

- `hoody_kit` — Filter by hoody_kit status. Use "true" for Hoody Kit programs only, "false" for user (non-kit) programs only.
- `lazy_load` — Filter by lazy_load status. Use "true" for lazy-loaded programs only (started on-demand), "false" for programs that auto-start.
- `enabled` — Filter by enabled status. Use "true" for enabled programs only, "false" for disabled programs only.
- `boot` — Filter by boot status. Use "true" for programs that auto-start on system boot, "false" for manual-start programs.
- `port` — Filter programs by single port number. Returns only programs whose port_range includes this specific port. Example: ?port=8042 returns programs with ranges containing 8042.
- `port_from` — Filter by port range start (must be used with port_to). Returns programs whose port ranges overlap with the specified range. Uses overlap logic: program.start <= port_to AND program.end >= port_from.
- `port_to` — Filter by port range end (must be used with port_from). Returns programs whose port ranges overlap with the specified range. Multiple programs may be returned if their ranges overlap.
- `include_status` — Include runtime status for each program. When true, adds a "status" field to each program showing current running state, instances, and process details.
- `include_stats` — Include resource stats (CPU, memory, process tree) for each running program. Implies include_status=true. Adds a "stats" field with pid, started_at, cpu_percent, memory_rss_bytes, process_count, and per-process breakdown. Only present for running programs.

### `quickStart` (5) — Ephemeral program launcher - Create temporary programs that auto-cleanup when stopped or on reboot

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/daemon/quick-start/{id}/logs` | Get ephemeral program logs | `?type` `?lines` |
| `GET /api/v1/daemon/quick-start/{id}/status` | Get ephemeral program status |  |
| `POST /api/v1/daemon/quick-start` | Launch ephemeral CUSTOM program | `body*:daemon_EphemeralProgramInput` |
| `GET /api/v1/daemon/quick-start` | List all ephemeral programs |  |
| `POST /api/v1/daemon/quick-start/{id}/stop` | Stop ephemeral program |  |

**Param notes:**

- `type` — Log stream: stdout or stderr
- `lines` — Number of lines to return from end of file

### `status` (3) — Status monitoring endpoints - monitor runtime status of programs and instances

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/daemon/status/{id}` | Get specific program status | `?port` `?include_stats` |
| `GET /api/v1/daemon/status` | Get all program statuses |  |
| `GET /api/v1/daemon/programs/{id}/logs` | Get program logs | `?type` `?lines` `?port` |

**Param notes:**

- `port` — Filter to specific port instance (for port-range programs only)
- `include_stats` — Include resource stats (CPU, memory, process tree) for running programs. Adds a "stats" field with pid, started_at, cpu_percent, memory_rss_bytes, process_count, and per-process breakdown.
- `type` — Log stream: stdout or stderr
- `lines` — Number of lines to return from end of file
- `port` — Port number (required for port-range programs)


### Body schemas

- `daemon_ProgramInput` — `{ id: int, name*: string, description: string, command*: string, user*: string, enabled: bool=true, boot: bool=false, delay_seconds: int=0, autorestart: "true" | "false" | "unexpected"="unexpected", directory: string, priority: int=999, stdout_logfile: string, stderr_logfile: string, logs_enabled: bool=true, log_max_bytes: int=5242880, log_backups: int=2, environment: { [key: string]: string }, hoody_kit: bool=false, port_range: { start*: int, end*: int }, port_param: string="--port", lazy_load: bool=false, display: string|null, terminal_id: int, terminal_shell: "bash" | "zsh" | "fish" | "sh" | "tmux"|null, terminal_interactive: bool|null, webhooks: { enabled: bool, urls: string[], events: string | string[], headers: object, timeout: int, retry: int }|null }`
- `daemon_EphemeralProgramInput` — `{ command*: string, user*: string, name: string, autorestart: "true" | "false" | "unexpected"="unexpected", directory: string, environment: { [key: string]: string }, priority: int=999, delay_seconds: int=0, stdout_logfile: string, stderr_logfile: string, logs_enabled: bool=true, log_max_bytes: int=5242880, log_backups: int=2, ttl: int, wait: bool=false, timeout: int=30, display: string|null, terminal_id: int, terminal_shell: "bash" | "zsh" | "fish" | "sh" | "tmux"|null, terminal_interactive: bool|null }`
