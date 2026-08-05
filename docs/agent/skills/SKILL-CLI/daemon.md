> _**CLI skill · `daemon` namespace** · ~6,417 tokens · hoody-sdk v1.0.0-beta.11_

# `daemon` — supervisord program lifecycle (start any program; logs always retained)

## Purpose

**Default for "start a program" / "spawn a process"** when you don't need an interactive shell or a TUI. REST over `supervisord` — every process is supervised, auto-restart-eligible, log-captured (stdout + stderr written under `/hoody/storage/hoody-daemon/logs/<name>/stdout.log` and `/hoody/storage/hoody-daemon/logs/<name>/stderr.log` — one directory per program, with rotated timestamped log files behind those symlinks), and inspectable after the fact. Log FILES outlive the process on disk, but the ephemeral tracking entry is reaped on stop/exit — after that `hoody daemon ephemeral logs` 404s (see Quirks); capture logs before stopping, or read the on-disk files directly (e.g. via the `files` namespace). `hoody daemon programs logs` covers configured (non-ephemeral) programs.

Two flavours:

- **Quick-start (ephemeral, no config write)** — `quickStart.launch { command, user, ttl?, wait?, timeout? }`. Returns `temporary_id = quick_<ts>_<seq>`. Best for one-offs and short-lived jobs (build steps, batch transforms, "run this once and tell me the output"). Logs survive the process; pull with `hoody daemon ephemeral logs`. Optional `ttl` auto-stops after N seconds.
- **Registered program (durable, persists across kit restarts)** — `programs.add { name, command, user, enabled: true, boot: true?, autorestart: 'unexpected', … }` → `control.start { wait: true }`. Use this when the process should come back after a container restart, when you want auto-restart on crash, or when you need port-range fan-out / lazy-load on first proxy hit.

## When to use

- "Run this command and keep the logs" → `hoody daemon ephemeral start`.
- "Run this server / agent / script as a long-running supervised process, restart on failure" → `hoody daemon programs create` + `hoody daemon programs start`.
- Background workers, port-range fan-out, lazy-loaded HTTP services, supervisord-event webhooks.

## When NOT to use

- **Traditional system services that ship native systemd units** (apache2, nginx, postgresql, mysql, redis, mosquitto, sshd, postfix, …) — leave them on `systemd`. Hoody containers are full Linux boxes with systemd + root (they behave like VMs, not Docker), so the standard `apt install nginx && systemctl enable --now nginx` flow Just Works and benefits from the upstream unit's hardening (drop-in directories, sd_notify, journal integration, etc.). Mixing systemd-managed and `daemon`-managed processes in the same container is fine — pick whichever fits the program.
- Need an interactive TTY (Claude Code, Codex, htop, vim, anything that paints the screen) → use `terminal` with a **pinned non-ephemeral `terminal_id`**, NOT `daemon`. Daemon programs have no TTY.
- Need to pipe input mid-run / send keystrokes → `terminal` (`hoody terminal sessions press`, `hoody terminal sessions paste`).
- One-shot synchronous request/response → `exec` (HTTP handler, returns body).
- Schedule (cron syntax) → `cron`. Access logs → `proxyLogs`. File-system events → `watch`.

### When to prefer `daemon` over `systemd`

- Custom scripts and binaries you wrote that don't have a packaged unit.
- Quick experiments where you want REST-driven start/stop/log without writing a unit file.
- Port-range fan-out (`port_range` + `port_param` + `lazy_load`) — supervisord-side feature, not a systemd one.
- Programs you want to provision / mutate / remove via the Hoody API (CI scripts, multi-tenant container fleets) — `hoody daemon programs create` is one HTTP call.

### When to prefer `systemd` over `daemon`

- Any service whose Debian/Ubuntu package already drops a working unit in `/lib/systemd/system/` (most server software).
- You want `journalctl -u <service>`, `systemctl status`, drop-in overrides, socket-activated services, timers (cron-equivalent), or any other systemd feature.
- The program is part of the container's "default-on" baseline (boots with the container, never managed externally).

## Prerequisites

- `/dev/hoody`, `/hoody`, `LOG_BASE_DIR=/hoody/storage/hoody-daemon/logs/` exist.
- `user` = real system account.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Register and boot

- `hoody daemon programs create` (`name`/`command`/`user`; `enabled`, `boot`; opt `directory`/`environment`/`autorestart`/`priority`/`*_logfile`) -> `hoody daemon programs start` `{ wait: true, timeout: 30 }` -> `hoody daemon programs status` (`include_stats`); `hoody daemon programs logs` on failure.

### 2. Ephemeral with TTL

- `hoody daemon ephemeral start` (`command`/`user`, opt `ttl?`/`wait?`/`timeout?`) returns `temporary_id` = `quick_<ts>_<seq>`. Poll/tail with `hoody daemon ephemeral status`/`hoody daemon ephemeral logs`; `hoody daemon ephemeral stop` to terminate.

### 3. Lazy port-range fleet

- `hoody daemon programs create` + `port_range: { start, end }`, `port_param`, `lazy_load: true`, `enabled: true`. `programs.list?port=8042&include_status=true`. `hoody daemon programs start` `{ port: 8042 }`; `hoody daemon programs stop` `{ port }` or `{ all: true }`.

### 4. Reach a service you just started

Any container port is publicly addressable as soon as the listener is up — no proxy alias, firewall edit, or extra registration needed:

- HTTP service on `:8080` → `https://{projectId}-{containerId}-http-8080.{node}.containers.hoody.com`
- HTTPS service on `:8443` → `https://{projectId}-{containerId}-https-8443.{node}.containers.hoody.com`

Edge is always `https://`; the slug only describes the inner protocol. Gate access via `proxyPermissionsContainer.*` if it shouldn't be public. See § Proxy URLs.

### 5. Update / wipe

`hoody daemon programs edit` field-merge; `hoody daemon programs disable`/`hoody daemon programs enable`; `hoody daemon programs delete`; `hoody daemon programs reset` -> `programs.default.json`.

## Quirks & gotchas

- Boolean query params (`hoody_kit`, `lazy_load`, `enabled`, `boot`, `include_status`, `include_stats`) STRICT: only `true`/`false`; `1`/`yes`/`0`/`""` -> 400.
- Webhook URLs HTTPS-only unless `NODE_ENV=development` (which also skips every host check below). Userinfo is always rejected; in production the literal label `localhost` and private/CGNAT/link-local/v6-ULA addresses are too, including when written as NAT64, v4-mapped-v6, or non-standard v4 (`2130706433`, `0x7f000001`, `127.1`) — but only when the URL authority is already an IP literal or `localhost`. A DNS name is accepted whatever it resolves to, so treat this as input validation, not an egress control. Redirects are never followed.
- Webhook edits deep-merge (omitted fields NOT cleared); events need `notifications.enabled` + `event_listener_enabled` + supervisord `eventlistener`.
- Duplicate names + overlapping port ranges rejected on create AND update (adjacent OK); `port_param` requires `port_range`.
- `command` no newlines/CR/NUL; `user` `(?i)[a-z_][a-z0-9_-]*\$?` (case-insensitive) via `id`; `*_logfile` confined to `LOG_BASE_DIR`.
- `hoody daemon programs start` on `port_range` REQUIRES `{ port }`; `hoody daemon programs stop` `{ port }` or `{ all: true }`.
- `quick_<ms>_<seq>` IDs (e.g. `quick_1700000000000_1`) are produced by the kit (which accepts `^quick_[a-zA-Z0-9_]+$` via `sanitize_temp_id`) but the OpenAPI path-param schema is the stricter `^quick_\d+$`, and the generated **TypeScript SDK enforces it client-side** — the CLI and raw HTTP pass the full id straight to the kit and work fine. In SDK mode, drive `hoody daemon ephemeral status` / `hoody daemon ephemeral stop` via raw HTTP to avoid the local validator, OR call `hoody daemon ephemeral list` and select by `name`. TTL polled ~10 s.
- Default ephemeral log paths are `/hoody/storage/hoody-daemon/logs/<name>/stdout.log` and `/hoody/storage/hoody-daemon/logs/<name>/stderr.log` (one directory per program), NOT `<name>.out.log`/`<name>.err.log`.
- After `hoody daemon ephemeral stop`, the in-memory tracking entry is removed (the on-disk log files persist but are unreachable through `hoody daemon ephemeral logs`, which returns `404`). Capture logs (read `hoody daemon ephemeral logs` or fetch the on-disk file directly) BEFORE calling `stop`.
- `hoody daemon programs start` accepts `if_not_running: true` for an idempotent boot — early-returns with `already_running: true` if the program is already running (port-range responses include an `instance` block with per-instance status/pid; standard programs return `instance: null` — no pid). Use it for "ensure started" workflows.
- **`environment` REPLACES the whole map** on `hoody daemon programs edit` (not per-key merge). If the existing env is `{A:1,B:2}` and you PATCH `{environment:{A:9}}`, the result is `{A:9}`. To preserve secrets, GET the program first and re-send the merged map.
- Webhook delivery requires THREE flags ON: per-program `webhooks.enabled: true`, kit-level `notifications.enabled: true`, AND kit-level `event_listener_enabled: true`. Toggling only the per-program flag will not fire callbacks.
- Proxy `X-Bypass-Local-Restrictions` strips `command`/`environment`/`directory`/`user`/`webhooks`/`stdout_logfile`/`stderr_logfile`.
- CLI `--port-range-{start,end}` -> nested `port_range`.

## Common errors

- 400 webhook: `must use HTTPS`, `contains userinfo`, `reserved IP range`.
- 400 `name already in use` / `Port range overlaps` / `port_param requires port_range`.
- success=false `Port parameter required` / `Program with ID {id} is disabled` -> `hoody daemon programs enable`.
- Direct private-IP connections get a plain `403 Forbidden` (the kit logs `connection blocked reason=private_ip` server-side; that string is NOT in the response) -> use the capability URL.
- 1 MB JSON body limit.

## Related namespaces

`exec` sync. `cron` scheduled. `proxyLogs` access log. `terminal` TTY. `display` virtual display.

## Examples

Every step in every example was live-tested against a real `daemon-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. The kit returns numeric `program.id` (not a UUID) — capture it from the `hoody daemon programs create` response.

### 1. Register a long-running supervised program with auto-boot

**Goal:** add a tick-emitting worker that supervisord keeps alive across kit restarts, then start it without blocking the caller.

**Step 1 — add (`enabled: true`, `boot: true`).** Capture `program.id`. Use `user: "user"` (uid 1000); the daemon's `command` allows shell metachars but you must own the quoting — single-quote the outer payload to avoid double-escaping.

```bash
ID=$(hoody --container "$C" daemon programs create \
  --name examples-daemon-tick \
  --command 'sh -c '\''while :; do echo tick $(date -u +%s); sleep 5; done'\''' \
  --user user --enabled --boot --autorestart unexpected \
  -o json | jq -r '.program.id')
```
**Step 2 — `hoody daemon programs start` with `wait: false`.** ⚠ `wait: true` blocks the HTTP request until the process is running and easily exceeds 30 s on a cold kit (live-verified — `wait:true,timeout:30` returned client-side timeout). Pass `wait: false` and poll `hoody daemon programs status` instead.

```bash
hoody --container "$C" daemon programs start "$ID"
while [ "$(hoody --container "$C" daemon programs status "$ID" -o json | jq -r .status.status)" != "running" ]; do sleep 1; done
```
### 2. Quick-start ephemeral with TTL — launch, check status, tail logs

**Goal:** fire a one-shot command (no config write), let it run up to 10 minutes, retrieve its output. ⚠ **Major quirk (TypeScript SDK only)** — `hoody daemon ephemeral start` returns `temporary_id = "quick_<ms>_<seq>"` (e.g. `quick_1700000000000_1`), but the generated SDK's client-side validator rejects that exact id on `hoody daemon ephemeral status` with `id must match pattern: ^quick_\d+$` (live-verified); the CLI and raw HTTP accept the full id and work fine. Truncating to `quick_<ms>` returns 404. **SDK workaround:** use `hoody daemon ephemeral list` to find the entry by `name`, or call `hoody daemon ephemeral logs` (which DOES accept the full id) to verify the run.

**Step 1 — launch.**

```bash
QID=$(hoody --container "$C" daemon ephemeral start \
  --name examples-daemon-qs --user user --ttl 600 \
  --command 'sh -c "for i in $(seq 1 30); do echo qs-$i; sleep 1; done"' \
  -o json | jq -r .temporary_id)
```
**Step 2 — find via `hoody daemon ephemeral list` (in SDK mode this avoids the TypeScript SDK's client-side `^quick_\d+$` pattern validator on `hoody daemon ephemeral status`; CLI and raw HTTP don't need the detour).**

```bash
hoody --container "$C" daemon ephemeral list -o json \
  | jq '.ephemeral_programs[] | select(.name=="examples-daemon-qs")'
```
**Step 3 — tail logs (the full id with `_<seq>` is accepted here).**

```bash
hoody --container "$C" daemon ephemeral logs "$QID" --type stdout --lines 10
```
**Step 4 — stop.** ⚠ The kit's `hoody daemon ephemeral stop` accepts the full `quick_<ms>_<seq>` id (as do the CLI and raw HTTP), but the **generated TypeScript SDK enforces a stricter `^quick_\d+$` pattern client-side** and rejects real ids returned by `hoody daemon ephemeral start`. In SDK mode drive stop via raw HTTP **POST** to `/api/v1/daemon/quick-start/{id}/stop`, or look up by `name` via `hoody daemon ephemeral list` and use the SDK only for ids matching the stricter pattern.

```bash
hoody --container "$C" daemon ephemeral stop "$QID"
```
### 3. Lazy port-range fan-out — one program, N port-bound instances

**Goal:** declare an HTTP service that listens on any port in `18800–18802`, materialised on demand the first time someone hits the proxy URL.

**Step 1 — add with `port_range` + `port_param` + `lazy_load`.** ⚠ `port_param` cannot be empty (live-verified — kit returns `400 Invalid port_param format: ""`). Use a real CLI flag, e.g. `--port`. The kit appends ` <flag> <port>` to your command at start-time.

```bash
ID=$(hoody --container "$C" daemon programs create \
  --name examples-daemon-fanout --command 'python3 -m http.server' \
  --user user --enabled \
  --port-range-start 18800 --port-range-end 18802 \
  --port-param=--port --lazy-load \
  -o json | jq -r .program.id)
```
**Step 2 — start one specific port and read fleet-wide status.** `programs.list?port=18800&include_status=true` returns the program with a `status: { type: "port-range", running_instances, total_instances, instances: [{ port, status, … }] }` block (live-verified).

```bash
hoody --container "$C" daemon programs start "$ID" --port 18800
hoody --container "$C" daemon programs list --port 18800 -o json \
  | jq '.programs[].status'
```
The instance is reachable at `https://${P}-${C}-http-18800.${N}.containers.hoody.com` — no extra alias needed (see § "Reach a service you just started").

### 4. Tail program logs (`hoody daemon programs logs` with type / lines)

**Goal:** investigate why a worker keeps restarting. `hoody daemon programs logs` returns `{ logs, type, lines, log_file }` where `log_file` is the on-disk path under `/hoody/storage/hoody-daemon/logs/<name>/{stdout,stderr}.log` (live-verified).

```bash
hoody --container "$C" daemon programs logs "$ID" --type stderr --lines 200
```
For a port-range program, pass `?port=18800` to read the per-instance log file.

### 5. Webhook on supervisord process events (e.g. crash → HTTPS callback)

**Goal:** when the program enters the `FATAL` state, POST to your HTTPS endpoint. ⚠ Webhook URLs must be **HTTPS** unless `NODE_ENV=development` (and reject userinfo, `localhost`, and private/CGNAT/link-local ranges). ⚠ **Event names are kit-specific, not the supervisord canonical `PROCESS_STATE_*` ones**: live-verified the kit accepts only `STARTING, RUNNING, BACKOFF, STOPPING, STOPPED, EXITED, FATAL, UNKNOWN, "all", "*"`. Sending `PROCESS_STATE_FATAL` returns `400 Invalid event type`.

```bash
# CLI `programs edit` requires --name, --command, --user (echo from your snapshot of programs.get).
hoody --container "$C" daemon programs edit "$ID" \
  --name "$NAME" --command "$CMD" --user "$USER" \
  --webhooks-enabled \
  --webhooks-urls https://hooks.example.com/daemon-events \
  --webhooks-events FATAL --webhooks-events BACKOFF \
  --webhooks-headers X-Source=hoody-daemon \
  --webhooks-timeout 10 --webhooks-retry 2
```
⚠ Webhook edits **deep-merge** — fields you omit from the `webhooks` block are NOT cleared. To turn off, send `{ webhooks: { enabled: false } }`. To rotate URLs, send the new full `urls` array (it replaces — array-set, not array-add). The **generated SDK type** (`ProgramInput`) marks `name`, `command`, and `user` as required on every `hoody daemon programs edit` body (re-send them from a `hoody daemon programs get` snapshot); the raw kit HTTP API does NOT require them on updates — it field-merges and accepts a partial `ProgramData`, so for surgical patches drop down to `fetch()`.

### 6. Wipe + reset to defaults — non-destructive snapshot first

**Goal:** restore the supervisord program set to whatever ships in `programs.default.json`. ⚠ **Destructive** — every program you added gets wiped. Snapshot before you call. (This step is intentionally NOT live-tested — it would break the shared test container; pattern shown for reference.)

```bash
hoody --container "$C" daemon programs list -o json > /tmp/daemon-snapshot.json   # CLI list has no --limit
hoody --container "$C" daemon programs reset
```
### 7. Patch only the env vars on a running program

**Goal:** flip `LOG_LEVEL=debug` without restating `command`/`user`/etc. `hoody daemon programs edit` is a partial merge — fields you don't pass are preserved (live-verified — the response shows merged `environment` plus all original fields intact).

```bash
# `programs edit` requires --name/--command/--user (PUT-style replacement); snapshot first then re-pass:
P=$(hoody --container "$C" daemon programs get "$ID" -o json | jq '.program')
hoody --container "$C" daemon programs edit "$ID" \
  --name "$(echo "$P" | jq -r .name)" \
  --command "$(echo "$P" | jq -r .command)" \
  --user "$(echo "$P" | jq -r .user)" \
  --environment LOG_LEVEL=debug --environment BUILD=examples
hoody --container "$C" daemon programs stop "$ID"
hoody --container "$C" daemon programs start "$ID"
```
⚠ `environment` REPLACES the whole map (not per-key merge). If you have `{A:1,B:2}` and PATCH `{A:9}`, you end up with just `{A:9}` — re-send everything you want to keep.

### 8. Inspect a running program with stats

**Goal:** read CPU/RSS/uptime to feed a dashboard. `status.get?include_stats=true` returns the basic `{ id, status }` plus stats fields when the process is actually `running` (when in `backoff`/`stopped`, only `status` and a string `uptime` like `"too quickly (process log may have details)"` come back — live-verified).

```bash
hoody --container "$C" daemon programs status "$ID" --include-stats true
```
⚠ `include_stats` is a **string** boolean (`"true"`/`"false"`) — `1`/`yes`/empty string return `400` (strict-bool query parse, see Quirks).

### 9. Stop one port instance OR every instance in a port-range fleet

**Goal:** kill just port 18800 vs. drain the whole fleet for a deploy.

**Single port** (other ports keep running):

```bash
hoody --container "$C" daemon programs stop "$ID" --port 18800
```
**Whole fleet** (`all: true`):

```bash
hoody --container "$C" daemon programs stop "$ID" --all
```
⚠ For a port-range program, `hoody daemon programs start` REQUIRES `{ port }` (single-port only); there is no "start them all" — boot each port individually or rely on `lazy_load: true` to materialise on first proxy hit.

### 10. Disable now, re-enable after the migration

**Goal:** keep the program defined but stop supervisord from auto-restarting it. `hoody daemon programs disable` flips `enabled: false` (process stays in the listing for forensics); `hoody daemon programs enable` brings it back without touching `command`/`environment`.

```bash
hoody --container "$C" daemon programs disable "$ID"
hoody --container "$C" daemon programs enable "$ID"
hoody --container "$C" daemon programs start "$ID"
```
⚠ Trying `hoody daemon programs start` while `enabled: false` returns `success: false` with `Program with ID {id} is disabled` (e.g. `Program with ID 7 is disabled`) — call `hoody daemon programs enable` first.

## Reference

### `hoody daemon` (19) — Daemon and ephemeral programs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody daemon ephemeral list` |  | read | List all ephemeral programs | `daemon.quickStart.listIterator` | `hoody daemon ephemeral list` |
| `hoody daemon ephemeral logs` |  | read | Get ephemeral program logs | `daemon.quickStart.getEphemeralLogs` | `hoody daemon ephemeral logs abc-123 --type stdout --lines 100` |
| `hoody daemon ephemeral start` |  | write | Launch ephemeral CUSTOM program | `daemon.quickStart.launch` | `hoody daemon ephemeral start --command "ls -la" --user alice --name my-resource --autorestart true --directory /home/user/src --environment <key=value> --priority 999 --delay-seconds 0 --stdout-logfile <stdout_logfile> --stderr-logfile <stderr_logfile> --logs-enabled --log-max-bytes 5242880 --log-backups 2 --ttl 10 --wait --timeout 30 --display :0 --terminal-id 10 --terminal-shell bash --terminal-interactive` |
| `hoody daemon ephemeral status` |  | read | Get ephemeral program status | `daemon.quickStart.getStatus` | `hoody daemon ephemeral status abc-123` |
| `hoody daemon ephemeral stop` |  | write | Stop ephemeral program | `daemon.quickStart.stop` | `hoody daemon ephemeral stop abc-123` |
| `hoody daemon health` |  | read | Service health check | `daemon.health.check` | `hoody daemon health` |
| `hoody daemon programs create` |  | write | Add a new CUSTOM program | `daemon.programs.add` | `hoody daemon programs create --id 10 --name my-resource --description "My description" --command "ls -la" --user alice --enabled --boot --delay-seconds 0 --autorestart true --directory /home/user/src --priority 999 --stdout-logfile <stdout_logfile> --stderr-logfile <stderr_logfile> --logs-enabled --log-max-bytes 5242880 --log-backups 2 --environment <key=value> --hoody-kit --port-range-start <port_range.start> --port-range-end <port_range.end> --port-param=--port --lazy-load --display :0 --terminal-id 10 --terminal-shell bash --terminal-interactive --webhooks-enabled --webhooks-urls <webhooks.urls> --webhooks-events <webhooks.events> --webhooks-headers <key=value> --webhooks-timeout <webhooks.timeout> --webhooks-retry <webhooks.retry>` |
| `hoody daemon programs delete` | rm, remove | destructive | Remove a program | `daemon.programs.remove` | `hoody daemon programs delete abc-123` |
| `hoody daemon programs disable` |  | write | Disable a program | `daemon.control.disable` | `hoody daemon programs disable abc-123` |
| `hoody daemon programs edit` |  | write | Edit a program | `daemon.programs.edit` | `hoody daemon programs edit abc-123 --name my-resource --description "My description" --command "ls -la" --user alice --enabled --boot --delay-seconds 0 --autorestart true --directory /home/user/src --priority 999 --stdout-logfile <stdout_logfile> --stderr-logfile <stderr_logfile> --logs-enabled --log-max-bytes 5242880 --log-backups 2 --environment <key=value> --hoody-kit --port-range-start <port_range.start> --port-range-end <port_range.end> --port-param=--port --lazy-load --display :0 --terminal-id 10 --terminal-shell bash --terminal-interactive --webhooks-enabled --webhooks-urls <webhooks.urls> --webhooks-events <webhooks.events> --webhooks-headers <key=value> --webhooks-timeout <webhooks.timeout> --webhooks-retry <webhooks.retry>` |
| `hoody daemon programs enable` |  | write | Enable a program | `daemon.control.enable` | `hoody daemon programs enable abc-123` |
| `hoody daemon programs get` |  | read | Get a specific program | `daemon.programs.get` | `hoody daemon programs get abc-123` |
| `hoody daemon programs list` |  | read | List all programs | `daemon.programs.listIterator` | `hoody daemon programs list --port 8080 --port-from 10 --port-to 10` |
| `hoody daemon programs logs` |  | read | Get program logs | `daemon.status.getLogs` | `hoody daemon programs logs abc-123 --type stdout --lines 100 --port 8080` |
| `hoody daemon programs reset` |  | write | Reset programs to default | `daemon.programs.reset` | `hoody daemon programs reset` |
| `hoody daemon programs start` |  | write | Start a program or port instance | `daemon.control.start` | `hoody daemon programs start abc-123 --port 8080 --wait --timeout 30 --if-not-running` |
| `hoody daemon programs status` |  | read | Get specific program status | `daemon.status.get` | `hoody daemon programs status abc-123 --port 8080 --include-stats true` |
| `hoody daemon programs statuses` |  | read | Get all program statuses | `daemon.status.getAll` | `hoody daemon programs statuses` |
| `hoody daemon programs stop` |  | write | Stop a program or port instance | `daemon.control.stop` | `hoody daemon programs stop abc-123 --port 8080 --all` |

