> _**SDK skill · `daemon` namespace** · ~14,190 tokens · hoody-sdk v1.0.0-beta.15_

# `daemon` — supervisord program lifecycle (start any program; logs kept)

## Purpose

**Default for "start a program" / "spawn a process"** when you don't need an interactive shell or a TUI. REST over `supervisord` — every process is supervised, auto-restart-eligible, log-captured by default (stdout + stderr written under `/hoody/storage/hoody-daemon/logs/<name>/stdout.log` and `/hoody/storage/hoody-daemon/logs/<name>/stderr.log` — one directory per program, with rotated timestamped log files behind those symlinks), and inspectable after the fact. Those are the default paths: a program can set its own log files or turn logging off. Log files rotate by size. When an apply changes a program's configuration, its old timestamped default log sessions older than the retention period (30 days by default) are deleted; the active session is kept, and custom log files are not covered by that cleanup. Log FILES outlive the process on disk, but the ephemeral tracking entry is reaped once the program is stopped, fatal, or exited with autorestart off — after that `ephemeralPrograms.getLogs` 404s (see Quirks); capture logs before stopping, or read the on-disk files directly (e.g. via the `files` namespace). `programs.getLogs` covers configured (non-ephemeral) programs.

Two flavours:

- **Quick-start (ephemeral, not added to the program list)** — `ephemeralPrograms.start { command, user, ttl?, wait?, timeout? }`. Returns `temporary_id = quick_<ts>_<seq>`. Best for one-offs and short-lived jobs (build steps, batch transforms, "run this once and tell me the output"). It adds no durable program entry, but it does write a temporary supervisord configuration and records the program in the kit's ephemeral tracking file so the cleanup pass can find it. The log files stay on disk, but `ephemeralPrograms.getLogs` works only while the tracking entry exists. The cleanup pass (every 30 s) reaps the entry, and the logs route then 404s, once the program is `stopped` or `fatal`, or `exited` with autorestart turned off; under the default `unexpected` policy an `exited` program is not reaped. Read the logs before stopping it. Optional `ttl` auto-stops after N seconds.
- **Registered program (durable, persists across kit restarts)** — `programs.create { name, command, user, enabled: true, boot: true?, autorestart: 'unexpected', … }` → `programs.start { wait: false }`, then poll `programs.getStatus`. Use this when the process should come back after a container restart, when you want auto-restart on crash, or when you need port-range fan-out / lazy-load on first proxy hit.

## When to use

- "Run this command and keep the logs" → `ephemeralPrograms.start`.
- "Run this server / agent / script as a long-running supervised process, restart on failure" → `programs.create` + `programs.start`.
- Background workers, port-range fan-out, lazy-loaded HTTP services, supervisord-event webhooks.

## When NOT to use

- **Traditional system services that ship native systemd units** (apache2, nginx, postgresql, mysql, redis, mosquitto, sshd, postfix, …) — leave them on `systemd`. Hoody containers are full Linux boxes with systemd + root (they behave like VMs, not Docker), so the standard `apt install nginx && systemctl enable --now nginx` flow Just Works and benefits from the upstream unit's hardening (drop-in directories, sd_notify, journal integration, etc.). Mixing systemd-managed and `daemon`-managed processes in the same container is fine — pick whichever fits the program.
- Need an interactive TTY (Claude Code, Codex, htop, vim, anything that paints the screen) → a one-off or hand-driven session is `terminal` with a **pinned non-ephemeral `terminal_id`**; a program that must be supervised (auto-restart, start at boot) is a `daemon` program with `terminal_id`, which runs on that terminal's PTY. Without `terminal_id` a daemon program has no TTY. A program with `terminal_id` cannot also have an effective sandbox.
- Watch or type into a daemon program's terminal → `client.daemon.programs.attachTerminal(container, program)` (resolves `{ terminalId, ws }`; `ws.disconnect()` leaves the program running). Snapshot, press, paste, write and wait drive it over REST without a WebSocket. Execute and session create on that id answer `409 DAEMON_TERMINAL`; a stopped program answers `409 DAEMON_PROGRAM_NOT_RUNNING` and closes a WebSocket with `4404`.
- Need to pipe input mid-run / send keystrokes → `terminal` (`terminal.sessions.pressKeys`, `terminal.sessions.paste`).
- One-shot synchronous request/response → `exec` (HTTP handler, returns body).
- Schedule (cron syntax) → `cron`. Access logs → `proxyLogs`. File-system events → `watch`.

### When to prefer `daemon` over `systemd`

- Custom scripts and binaries you wrote that don't have a packaged unit.
- Quick experiments where you want REST-driven start/stop/log without writing a unit file.
- Port-range fan-out (`port_range` + `port_param` + `lazy_load`) — supervisord-side feature, not a systemd one.
- Programs you want to provision / mutate / remove via the Hoody API (CI scripts, multi-tenant container fleets) — `programs.create` is one HTTP call.

### When to prefer `systemd` over `daemon`

- Any service whose Debian/Ubuntu package already drops a working unit in `/lib/systemd/system/` (most server software).
- You want `journalctl -u <service>`, `systemctl status`, drop-in overrides, socket-activated services, timers (cron-equivalent), or any other systemd feature.
- The program is part of the container's "default-on" baseline (boots with the container, never managed externally).

## Prerequisites

- `/dev/hoody`, `/hoody` and the log directory `/hoody/storage/hoody-daemon/logs/` exist.
- `user` = real system account.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Register and boot

- `programs.create` (`name`/`command`/`user`; `enabled`, `boot`; opt `directory`/`environment`/`autorestart`/`priority`/`*_logfile`) -> `programs.start` `{ wait: false }`, then poll `programs.getStatus` (`include_stats`) until `status.status` is `running` (`wait: true` blocks the request and easily exceeds 30 s on a cold kit; see Example 1); `programs.getLogs` on failure.

### 2. Ephemeral with TTL

- `ephemeralPrograms.start` (`command`/`user`, opt `ttl?`/`wait?`/`timeout?`) returns `temporary_id` = `quick_<ts>_<seq>`. Poll/tail with `ephemeralPrograms.getStatus`/`ephemeralPrograms.getLogs`; `ephemeralPrograms.stop` to terminate.

### 3. Lazy port-range fleet

- `programs.create` + `port_range: { start, end }`, `port_param`, `lazy_load: true`, `enabled: true`. `programs.list?port=8042&include_status=true`. `programs.start` `{ port: 8042 }`; `programs.stop` `{ port }` or `{ all: true }`.

### 4. Reach a service you just started

Any container port is publicly addressable as soon as the listener is up — no proxy alias, firewall edit, or extra registration needed:

- HTTP service on `:8080` → `https://{projectId}-{containerId}-http-8080.{node}.containers.hoody.com`
- HTTPS service on `:8443` → `https://{projectId}-{containerId}-https-8443.{node}.containers.hoody.com`

Edge is always `https://`; the slug only describes the inner protocol. Gate access via `proxy.containerPermissions.*` if it shouldn't be public. See § Proxy URLs.

### 5. Update / wipe

`programs.update` (partial: an omitted field keeps its stored value, but `environment`, `sandbox`, `port_range` and `webhooks.enabled`+`webhooks.urls` are replaced whole when sent; see Quirks); `programs.disable`/`enable`; `programs.delete`; `programs.reset` -> `programs.default.json`.

## Quirks & gotchas

- Boolean query params (`hoody_kit`, `lazy_load`, `enabled`, `boot`, `include_status`, `include_stats`) STRICT: only `true`/`false`, in any letter case; `1`/`yes`/`0`/`""` -> 400. Send lowercase, which is what the SDK's typed values are.
- Webhook URLs are validated only in an enabled block: `webhooks.enabled: false` skips every URL, event, header, timeout and retry check (the block must still carry `enabled` and `urls`). In an enabled block, URLs are HTTPS-only unless `NODE_ENV=development` (which also skips every host check below). Userinfo is rejected; in production the literal label `localhost` and private/CGNAT/link-local/v6-ULA addresses are too, including when written as NAT64, v4-mapped-v6, or non-standard v4 (`2130706433`, `0x7f000001`, `127.1`), when the URL authority is an IP literal or `localhost`. A DNS name is not resolved when the block is saved; at delivery time, in production, private and reserved addresses are dropped from its resolution and delivery fails when none remains. Delivery never follows redirects and ignores the environment's HTTP proxy settings.
- A `webhooks` edit must send `enabled` AND `urls` (a block without `urls` is a 400, `missing field urls`) and replaces both; `events`, `headers`, `timeout` and `retry` keep their stored values when omitted. An enabled block with an empty `urls` is a 400. Callbacks are delivered only when the deployment enables event delivery for the kit; the block is validated and stored either way.
- Duplicate names + overlapping port ranges rejected on create AND update (adjacent OK); `port_param` requires `port_range`.
- The program list and the quick-start list have no pagination helpers (the all-pages and iterator variants other list methods get). They were removed on 2026-09-22: neither response is paginated, so the helpers read items from `data.items`, a field these responses do not have, and returned nothing. Call `programs.list()` and read `response.data.programs`; call `ephemeralPrograms.list()` and read `response.data.ephemeral_programs`.
- `command` no newlines/CR/NUL; `user` `(?i)[a-z_][a-z0-9_-]*\$?` (case-insensitive) via `id`; `*_logfile` must resolve under `/hoody/storage/hoody-daemon/logs/`.
- `programs.start` on `port_range` REQUIRES `{ port }`; `programs.stop` `{ port }` or `{ all: true }`.
- `ephemeralPrograms.start` returns `temporary_id` = `quick_<unix-ms>_<seq>` (e.g. `quick_1700000000000_1`); pass it unchanged to `ephemeralPrograms.getStatus`, `ephemeralPrograms.getLogs` and `ephemeralPrograms.stop` on every surface. TTL polled ~10 s.
- A program is addressed by its integer `id` from `programs.list`, never by its name: a name in the `{id}` slot is refused with 404 before the daemon looks anything up. To find the id of a named program, filter the list by name.
- Default ephemeral log paths are `/hoody/storage/hoody-daemon/logs/<name>/stdout.log` and `/hoody/storage/hoody-daemon/logs/<name>/stderr.log` (one directory per program), NOT `<name>.out.log`/`<name>.err.log`.
- After `ephemeralPrograms.stop`, the tracking entry is removed once its temporary configuration is deleted (the on-disk log files persist but are unreachable through `ephemeralPrograms.getLogs`, which returns `404`). If that deletion fails, the entry is kept and retried on the next cleanup pass, even though the stop response still reports success. Capture logs (read `ephemeralPrograms.getLogs` or fetch the on-disk file directly) BEFORE calling `stop`.
- `programs.start` accepts `if_not_running: true` for an idempotent boot — early-returns with `already_running: true` if the program is already running and, for a standard program with a `ready_port`, that port accepts connections; otherwise, including a running program whose `ready_port` is not serving, it takes the start path, and polls for readiness only with `wait: true` (port-range responses include an `instance` block with per-instance status/pid; standard programs omit the `instance` field entirely, so there is no pid). Use it for "ensure started" workflows.
- **`environment` REPLACES the whole map** on `programs.update` (not per-key merge). If the existing env is `{A:1,B:2}` and you PATCH `{environment:{A:9}}`, the result is `{A:9}`. To preserve secrets, GET the program first and re-send the merged map.
- **`sandbox` is three-state on `programs.update`**: absent keeps the stored block, `null` clears it, and an object REPLACES the whole block (no field merge). Sending `{sandbox:{process:{max_pids:64}}}` to a program that also had `filesystem.read_only_root` and `network.mode: restricted` leaves only `max_pids`, and the program runs without the others. Read `programs.getSandbox(id)` first (`configured` is the stored block) and resend every restriction you want kept: merge locally and send the whole block.
- Quick-start programs cannot be sandboxed: a non-null `sandbox` on `ephemeralPrograms.start` is a 400 (`sandbox is not supported for quick-start programs`); `null` is accepted as absent.
- An effective sandbox is refused for a `user` that resolves to uid 0 (under any name) and together with `terminal_id`. A block that restricts nothing is stored as absent and does not appear on the program.
- **A sandboxed program fails CLOSED at launch.** If a mechanism its policy needs is missing the program does not start unconfined, it refuses to start at all: Landlock below the network ABI, a `bwrap` or `systemd-run` the container does not have, or an ingress policy with no `nft`. Expect the program to be down, not unprotected. A launch-stage refusal is printed as `sandbox: <reason>` on the PROGRAM's stderr, not in the daemon log, so read `programs.getLogs` with `type=stderr`; the daemon log carries the earlier failures instead (validation, rendering, firewall admission, the supervisord apply). A stored block is also re-validated every time the program is rendered, so a block that later breaks a rule refuses the render rather than running the program unconfined.
- A NON-EMPTY `network.ingress_allow_from`, or an `ingress_rate_limit`, needs a listening set: without `bind_ports`, `port_range` or `ready_port` the edit is a 400 (`sandbox.network.ingress_* requires a listening set`). An empty list owes no rules and so needs nothing. They filter IPv4 TCP arriving on `eth0` at those ports only, leave established connections alone, and an empty `ingress_allow_from` restricts nothing rather than denying everyone.
- **Do not test an ingress allowlist from inside the same container.** The chain only matches what arrives on `eth0`, so same-container traffic never reaches it at all; and `ingress_allow_platform` defaults to `true`, which returns traffic whose source is loopback or the container's gateway ahead of both the meter and the allowlist. Either way a local probe proves nothing. Test with a new connection from an outside source. Public traffic the proxy forwards keeps the client's own address and IS filtered. The rate meter runs before the allowlist and stops tracking new sources once its 65535-entry set is full, while the allowlist keeps applying.
- `programs.getSandbox(id)` answers with more than the stored block, and none of it certifies a running program: `configured` is what was persisted; `rev` is the 12-hex revision recomputed from the currently valid stored policy, the one the daemon WOULD place on the wrapper command line rather than an observation of the running process, and null when no effective policy validates; `effective` is DIAGNOSTIC argv recomputed from the stored policy, carrying placeholders like `<program argv>` and `<pid>`, never the observed command, and it omits what the wrapper applies from inside itself (Landlock ports and the open-file limit); `live` reports the nft table, chain and rules read from the kernel at request time; `firewall` is `none`, `ok`, `draining` or `degraded`, with `problems` listing validation, state, integrity and unresolved-install failures. Read `problems` before concluding a restriction is in force.
- **`restricted` is a PORT policy, not a destination policy.** `full` restricts neither bind nor connect. `restricted` limits which TCP ports the program may bind and connect to, at every destination including loopback: it cannot allow one host and deny another, and it does not touch UDP, ICMP or raw sockets, because Landlock has no hook for them. It also governs the `bind` and `connect` CALLS, not a socket that starts listening without an explicit bind, and a listener obtained that way is outside the ingress rules too. `none` is different in kind: it unshares the network namespace, so it removes IP networking of every protocol. Unix sockets reachable by filesystem path stay reachable under every mode, `none` included, governed by file permissions rather than by this field.
- Ports are numbers or inclusive `"a-b"` strings. An omitted `bind_ports` defaults to the union of `port_range` and `ready_port`, and an explicit list has to cover both. `restricted` needs a non-empty resolved bind set, and an omitted or empty `connect_ports` denies outbound TCP entirely; a non-empty `connect_ports` requires `restricted`. `none` refuses declared listeners, a non-null explicit `bind_ports` (`[]` included), a non-empty connect or allow list, and a configured rate limit. Empty lists and either value of `ingress_allow_platform` are accepted and inert.
- **The filesystem side is confinement, not a private container.** An effective sandbox drops all capabilities and unshares the user, PID and IPC namespaces, but the program keeps its account's supplementary groups and still sees the container's filesystem subject to ordinary permissions. `read_only_root` stops writes, not reads, and `/dev` and `/proc` are mounted over it. Private `/tmp` and `/var/tmp` are added only with `process.private_tmp: true`, which defaults to false: otherwise the program shares the container's temporary directories. `hidden` is not a secrecy boundary against an actor who can rename a validated directory or one of its ancestors: writable sources are pinned by descriptor at launch, but mount destinations are still resolved by pathname.
- Process limits have fixed domains and are rejected outside them: `max_memory` from `16M` to `64G` (decimal bytes, or uppercase binary `K`/`M`/`G`, with scope swap disabled), `max_pids` from 4 to 65536 counting threads and two wrapper helpers, `max_open_files` from 8 to 1048576 applied as both the soft and the hard limit. There is no CPU or disk quota here.
- **A stored sandbox is not proof that one is installed.** An add or edit can persist the new block and still fail to apply it to supervisord; the response says so, and the earlier process may keep running unconfined when its stop cannot be confirmed. Treat a failed write as unresolved, read `problems`, fix the cause and reapply, rather than assuming either the old or the new policy is in force.
- The ingress table `ip hoody_daemon` is rebuilt from desired state, not continuously enforced. Flushing or weakening it out of band can leave running programs unprotected: status turns `degraded` and new ingress launches refuse, but there is no integrity-repair loop and nothing stops what is already running. The next firewall transaction or reconcile rebuilds the table; re-applying an identical policy does not. Restore it and check `live` plus `firewall` after any out-of-band change.
- Ingress rules are attached to a destination PORT on `eth0`, not to a process. Another listener on that same port at a different local address gets the same filtering, and the ownership check only knows about ports other programs have DECLARED, so an undeclared listener is neither protected from this nor protected against it.
- **A policy change restarts the program.** The revision is part of the supervisord command line, so changing the resolved policy replaces the definition and stops the running instance; whether another starts is decided by `boot` and `lazy_load`, not by the edit. The old revision's ingress rules and port reservations can linger as `draining` after the call returns, so for a short window traffic meets both policies and the port is not yet free to reuse.
- Webhook delivery needs per-program `webhooks.enabled: true` AND a deployment that enables event delivery for the kit. No request turns event delivery on, so a program whose `webhooks.enabled` is `true` can still receive no callbacks; a saved `webhooks` block is not proof that any will arrive.
- Proxy `X-Bypass-Local-Restrictions` strips `command`/`environment`/`directory`/`user`/`webhooks`/`stdout_logfile`/`stderr_logfile`/`sandbox`.
- `port_range` is an object `{ start, end }`.

## Common errors

- 400 webhook (enabled blocks only): `must use HTTPS protocol`, `must not contain userinfo`, `cannot point to private, loopback, link-local, or cloud-metadata IP addresses`.
- 400 `name already in use` / `Port range overlaps` / `port_param requires port_range`.
- success=false `Port parameter required for port-range programs` -> resend with a `port` from the program's range. success=false `Program with ID {id} is disabled` -> `programs.enable` first.
- Direct private-IP connections get a plain `403 Forbidden` with no reason in the body -> use the capability URL.
- 1 MB JSON body limit.

## Related namespaces

`exec` sync. `cron` scheduled. `proxyLogs` access log. `terminal` TTY. `display` virtual display.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first. The kit returns numeric `program.id` (not a UUID) — capture it from the `programs.create` response.

### 1. Register a long-running supervised program with auto-boot

**Goal:** add a tick-emitting worker that supervisord keeps alive across kit restarts, then start it without blocking the caller.

**Step 1 — add (`enabled: true`, `boot: true`).** Capture `program.id`. Use `user: "user"` (uid 1000); the daemon's `command` allows shell metachars but you must own the quoting — single-quote the outer payload to avoid double-escaping.

```typescript
const r = await client.daemon.programs.create({
  name: 'examples-daemon-tick',
  command: `sh -c 'while :; do echo tick $(date -u +%%s); sleep 5; done'`,
  user: 'user', enabled: true, boot: true, autorestart: 'unexpected',
});
const id = r.data!.program.id;
```

**Step 2 — `programs.start` with `wait: false`.** ⚠ `wait: true` blocks the HTTP request until the process is running and easily exceeds 30 s on a cold kit (`wait:true,timeout:30` hits the client-side timeout). Pass `wait: false` and poll `programs.getStatus` instead.

```typescript
await client.daemon.programs.start(id, { wait: false });
while ((await client.daemon.programs.getStatus(id)).data!.status?.status !== 'running') {
  await new Promise(r => setTimeout(r, 1000));
}
```

### 2. Quick-start ephemeral with TTL — launch, check status, tail logs

**Goal:** fire a one-shot command (no durable program entry), let it run up to 10 minutes, retrieve its output. `ephemeralPrograms.start` returns `temporary_id = "quick_<unix-ms>_<seq>"` (e.g. `quick_1700000000000_1`); every later call takes that id unchanged. Truncating it to `quick_<ms>` returns 404.

**Step 1 — launch.**

```typescript
const r = await client.daemon.ephemeralPrograms.start({
  name: 'examples-daemon-qs',
  command: `sh -c "for i in $(seq 1 30); do echo qs-$i; sleep 1; done"`,
  user: 'user', ttl: 600,
});
const qid = r.data!.temporary_id;
```

**Step 2 — check status.**

```typescript
const st = await client.daemon.ephemeralPrograms.getStatus(qid);
```

**Step 3 — tail logs.**

```typescript
const lg = await client.daemon.ephemeralPrograms.getLogs(qid, { type: 'stdout', lines: 10 } as any);
```

**Step 4 — stop.** Read the logs first: after a successful `stop` the tracking entry is normally gone and `ephemeralPrograms.getLogs` returns 404.

```typescript
await client.daemon.ephemeralPrograms.stop(qid);
```

### 3. Lazy port-range fan-out — one program, N port-bound instances

**Goal:** declare an HTTP service that listens on any port in `18800–18802`, materialised on demand the first time someone hits the proxy URL.

**Step 1 — add with `port_range` + `port_param` + `lazy_load`.** ⚠ `port_param` cannot be empty (the kit returns `400 Invalid port_param format: ""`). Use a real CLI flag, e.g. `--port`. At start-time the kit appends `<flag>=<port>` — **equals-joined**, one instance per port in the range — so the program must accept the `--flag=value` form. `python3 -m http.server` does NOT (its port is positional and `--port` is an unrecognised argument), so the example wraps it in a one-line `sh -c` that turns the appended flag back into the positional port.

```typescript
const added = await client.daemon.programs.create({
  name: 'examples-daemon-fanout',
  command: 'sh -c "exec python3 -m http.server ${1##*=}" sh',
  user: 'user', enabled: true,
  port_range: { start: 18800, end: 18802 },
  port_param: '--port', lazy_load: true,
});
const id = added.data!.program.id;
```

**Step 2 — start one specific port and read fleet-wide status.** `programs.list?port=18800&include_status=true` returns the program with a `status: { type: "port-range", running_instances, total_instances, instances: [{ port, status, … }] }` block.

```typescript
await client.daemon.programs.start(id, { port: 18800 } as any);
const listed = await client.daemon.programs.list({ port: 18800, include_status: 'true' } as any);
```

The instance is reachable at `https://${P}-${C}-http-18800.${N}.containers.hoody.com` — no extra alias needed (see § "Reach a service you just started").

### 4. Tail program logs (`programs.getLogs` with type / lines)

**Goal:** investigate why a worker keeps restarting. `status.getLogs` returns `{ logs, type, lines, log_file }` where `log_file` is the on-disk path under `/hoody/storage/hoody-daemon/logs/<name>/{stdout,stderr}.log`.

```typescript
const lg = await client.daemon.programs.getLogs(id, { type: 'stderr', lines: 200 } as any);
console.log(lg.data!.logs);
```

For a port-range program, pass `?port=18800` to read the per-instance log file.

### 5. Webhook on supervisord process events (e.g. crash → HTTPS callback)

**Goal:** when the program enters the `FATAL` state, POST to your HTTPS endpoint. ⚠ Webhook URLs must be **HTTPS** unless `NODE_ENV=development` (and reject userinfo, `localhost`, and private/CGNAT/link-local ranges). ⚠ **Event names are kit-specific, not the supervisord canonical `PROCESS_STATE_*` ones**: the kit accepts only `STARTING, RUNNING, BACKOFF, STOPPING, STOPPED, EXITED, FATAL, UNKNOWN, "all", "*"`. Sending `PROCESS_STATE_FATAL` returns `400 Invalid event type`.

```typescript
// programs.edit takes ProgramUpdate: every field is optional.
await client.daemon.programs.update(id, {
  webhooks: {
    enabled: true,
    urls: ['https://hooks.example.com/daemon-events'],
    events: ['FATAL', 'BACKOFF'],
    headers: { 'X-Source': 'hoody-daemon' },
    timeout: 10, retry: 2,
  },
});
```

⚠ A `webhooks` edit replaces `enabled` and `urls` and must send both: `{ webhooks: { enabled: false } }` on its own is a 400 (`missing field urls`). To turn delivery off, resend the current `urls` with `enabled: false`; to rotate URLs, send the full new `urls` array. `events`, `headers`, `timeout` and `retry` keep their stored values when omitted. `programs.update` needs only the id on every surface: the SDK edit type is `ProgramUpdate`, with nothing required.

### 6. Wipe + reset to defaults — non-destructive snapshot first

**Goal:** restore the supervisord program set to whatever ships in `programs.default.json`. ⚠ **Destructive** — every program you added gets wiped. Snapshot before you call.

```typescript
const snapshot = (await client.daemon.programs.list()).data;   // SDK list has no `limit` option
await client.daemon.programs.reset();
// then re-create what you want from snapshot.programs[]
```

### 7. Patch only the env vars on a running program

**Goal:** flip `LOG_LEVEL=debug` without restating `command`/`user`/etc. `programs.update` is partial on every surface: fields absent from the request body keep their stored values. `environment` itself is replaced whole (see the note below).

```typescript
// programs.edit takes ProgramUpdate: send only what changes. environment is replaced whole.
await client.daemon.programs.update(id, {
  environment: { LOG_LEVEL: 'debug', BUILD: 'examples' },
});
await client.daemon.programs.stop(id, {} as any);
await client.daemon.programs.start(id, { wait: false });
```

⚠ `environment` REPLACES the whole map (not per-key merge). If you have `{A:1,B:2}` and PATCH `{A:9}`, you end up with just `{A:9}` — re-send everything you want to keep.

### 8. Inspect a running program with stats

**Goal:** read CPU/RSS/uptime to feed a dashboard. `programs.getStatus?include_stats=true` returns the basic `{ id, status }` plus stats fields when the process is actually `running` (when in `backoff`/`stopped`, only `status` and a string `uptime` like `"too quickly (process log may have details)"` come back).

```typescript
const r = await client.daemon.programs.getStatus(id, { include_stats: 'true' } as any);
```

⚠ `include_stats` is a **string** boolean (`"true"`/`"false"`) — `1`/`yes`/empty string return `400` (strict-bool query parse, see Quirks).

### 9. Stop one port instance OR every instance in a port-range fleet

**Goal:** kill just port 18800 vs. drain the whole fleet for a deploy.

**Single port** (other ports keep running):

```typescript
await client.daemon.programs.stop(id, { port: 18800 } as any);
```

**Whole fleet** (`all: true`):

```typescript
await client.daemon.programs.stop(id, { all: true } as any);
```

⚠ For a port-range program, `programs.start` REQUIRES `{ port }` (single-port only); there is no "start them all" — boot each port individually or rely on `lazy_load: true` to materialise on first proxy hit.

### 10. Disable now, re-enable after the migration

**Goal:** keep the program defined but stop supervisord from auto-restarting it. `disable` flips `enabled: false` (process stays in the listing for forensics); `enable` brings it back without touching `command`/`environment`. Enabling reapplies the program's configuration, so a program with `boot: true` (and not `lazy_load`) can start right away; follow it with an ensure-start (`if_not_running: true`), which returns early when the program is running and ready, and otherwise takes the start path (readiness polling only with `wait: true`).

```typescript
await client.daemon.programs.disable(id);
// … run migration …
await client.daemon.programs.enable(id);   // can already start a boot: true program
await client.daemon.programs.start(id, { wait: false, if_not_running: true });
```

⚠ Trying `programs.start` while `enabled: false` returns `success: false` with `Program with ID {id} is disabled` (e.g. `Program with ID 7 is disabled`) — call `programs.enable` first.

## Reference

**Accessor:** `client.daemon`  |  **Import:** `import * as daemon from 'hoody-sdk/daemon'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, containerId?, serviceIndex?, server? }`, which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are refused) and `cache` (a GET's response cache: `true`, a TTL in ms, or `false` to bypass) (no `_realm`: that one is control-plane only). When the signature shows an options object, the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`.

### `client.daemon.ephemeralPrograms` (5) — Ephemeral program launcher - Create temporary programs that auto-cleanup when stopped or on reboot

#### `getLogs` — Get ephemeral program logs

```typescript
client.daemon.ephemeralPrograms.getLogs(id: string, options?: { type?: "stdout" | "stderr"; lines?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Ephemeral program temporary ID |
| `type` | `"stdout" \| "stderr"` | query | No | Log stream: stdout or stderr |
| `lines` | `number` | query | No | Number of lines to return from the end of the file (default 100). A non-negative integer: `0` returns empty content, and the server clamps values above 10000 to 10000. |

**Returns:** `Promise<DaemonEphemeralProgramsGetLogsResponse>`  |  **HTTP:** `GET /api/v1/daemon/quick-start/{id}/logs`
**CLI:** `hoody daemon ephemeral programs logs get`

---

#### `getStatus` — Get ephemeral program status

```typescript
client.daemon.ephemeralPrograms.getStatus(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Temporary ID of the ephemeral program, as returned in `temporary_id` (`quick_<unix-ms>_<sequence>`). |

**Returns:** `Promise<DaemonEphemeralProgramsGetStatusResponse>`  |  **HTTP:** `GET /api/v1/daemon/quick-start/{id}/status`
**CLI:** `hoody daemon ephemeral programs status`

---

#### `list` — List all ephemeral programs

```typescript
client.daemon.ephemeralPrograms.list()
```

**Returns:** `Promise<DaemonEphemeralProgramsListResponse>`  |  **HTTP:** `GET /api/v1/daemon/quick-start`
**CLI:** `hoody daemon ephemeral programs list`

---

#### `start` — Launch ephemeral CUSTOM program

```typescript
client.daemon.ephemeralPrograms.start(data: DaemonEphemeralProgramsStartRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DaemonEphemeralProgramsStartRequest` | body | Yes | Shape: `daemon_EphemeralProgramInput` under Body schemas. |

**Returns:** `Promise<DaemonEphemeralProgramsStartResponse>`  |  **HTTP:** `POST /api/v1/daemon/quick-start`
**CLI:** `hoody daemon ephemeral programs start`

---

#### `stop` — Stop ephemeral program

```typescript
client.daemon.ephemeralPrograms.stop(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Temporary ID of the ephemeral program, as returned in `temporary_id` (`quick_<unix-ms>_<sequence>`). |

**Returns:** `Promise<DaemonEphemeralProgramsStopResponse>`  |  **HTTP:** `POST /api/v1/daemon/quick-start/{id}/stop`
**CLI:** `hoody daemon ephemeral programs stop`

---

### `client.daemon.kit` (1) — Service health check endpoint - returns the standardized health response for monitoring and readiness probes

#### `getHealth` — Service health check

```typescript
client.daemon.kit.getHealth()
```

**Returns:** `Promise<DaemonHealthCheckResponse>`  |  **HTTP:** `GET /api/v1/daemon/health`
**CLI:** `hoody daemon health`

---

### `client.daemon.programs` (15) — Program management endpoints - create, read, update, and delete daemon programs

#### `create` — Add a new CUSTOM program

```typescript
client.daemon.programs.create(data: DaemonProgramsCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DaemonProgramsCreateRequest` | body | Yes | Shape: `daemon_ProgramInput` under Body schemas. |

**Returns:** `Promise<DaemonProgramsCreateResponse>`  |  **HTTP:** `POST /api/v1/daemon/programs/add`
**CLI:** `hoody daemon programs create`

---

#### `delete` — Remove a program

```typescript
client.daemon.programs.delete(id: number)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `number` | path | Yes | Unique numeric identifier of the program. An id that is not a valid `i32` (a word, an empty segment, a number too large) never reaches the handler: the path extractor refuses it with a plain-text 404, on every route that takes an id, which is NOT the documented JSON 404 of the routes that have one. An id that parses but names no program is the handler's own answer, a 400 carrying the `{success: false, error: ...}` envelope, except on the routes that document a 404. |

**Returns:** `Promise<DaemonProgramsDeleteResponse>`  |  **HTTP:** `POST /api/v1/daemon/programs/remove/{id}`
**CLI:** `hoody daemon programs delete`

---

#### `disable` — Disable a program

```typescript
client.daemon.programs.disable(id: number)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `number` | path | Yes | Unique numeric identifier of the program. An id that is not a valid `i32` (a word, an empty segment, a number too large) never reaches the handler: the path extractor refuses it with a plain-text 404, on every route that takes an id, which is NOT the documented JSON 404 of the routes that have one. An id that parses but names no program is the handler's own answer, a 400 carrying the `{success: false, error: ...}` envelope, except on the routes that document a 404. |

**Returns:** `Promise<DaemonProgramsDisableResponse>`  |  **HTTP:** `POST /api/v1/daemon/programs/{id}/disable`
**CLI:** `hoody daemon programs disable`

---

#### `enable` — Enable a program

```typescript
client.daemon.programs.enable(id: number)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `number` | path | Yes | Unique numeric identifier of the program. An id that is not a valid `i32` (a word, an empty segment, a number too large) never reaches the handler: the path extractor refuses it with a plain-text 404, on every route that takes an id, which is NOT the documented JSON 404 of the routes that have one. An id that parses but names no program is the handler's own answer, a 400 carrying the `{success: false, error: ...}` envelope, except on the routes that document a 404. |

**Returns:** `Promise<DaemonProgramsEnableResponse>`  |  **HTTP:** `POST /api/v1/daemon/programs/{id}/enable`
**CLI:** `hoody daemon programs enable`

---

#### `get` — Get a specific program

```typescript
client.daemon.programs.get(id: number)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `number` | path | Yes | Unique numeric identifier of the program. An id that is not a valid `i32` (a word, an empty segment, a number too large) never reaches the handler: the path extractor refuses it with a plain-text 404, on every route that takes an id, which is NOT the documented JSON 404 of the routes that have one. An id that parses but names no program is the handler's own answer, a 400 carrying the `{success: false, error: ...}` envelope, except on the routes that document a 404. |

**Returns:** `Promise<DaemonProgramsGetResponse>`  |  **HTTP:** `GET /api/v1/daemon/programs/{id}`
**CLI:** `hoody daemon programs get`

---

#### `getLogs` — Get program logs

```typescript
client.daemon.programs.getLogs(id: number, options?: { type?: "stdout" | "stderr"; lines?: number; port?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `number` | path | Yes | Program ID |
| `type` | `"stdout" \| "stderr"` | query | No | Log stream: stdout or stderr |
| `lines` | `number` | query | No | Number of lines to return from the end of the file (default 100). A non-negative integer: `0` returns empty content, and the server clamps values above 10000 to 10000. |
| `port` | `number` | query | No | Port number (required for port-range programs) |

**Returns:** `Promise<DaemonProgramsGetLogsResponse>`  |  **HTTP:** `GET /api/v1/daemon/programs/{id}/logs`
**CLI:** `hoody daemon programs logs get`

---

#### `getSandbox` — Get sandbox status for a program

```typescript
client.daemon.programs.getSandbox(id: number)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `number` | path | Yes | Unique numeric identifier of the program. An id that is not a valid `i32` (a word, an empty segment, a number too large) never reaches the handler: the path extractor refuses it with a plain-text 404, on every route that takes an id, which is NOT the documented JSON 404 of the routes that have one. An id that parses but names no program is the handler's own answer, a 400 carrying the `{success: false, error: ...}` envelope, except on the routes that document a 404. |

**Returns:** `Promise<DaemonProgramsGetSandboxResponse>`  |  **HTTP:** `GET /api/v1/daemon/programs/{id}/sandbox`
**CLI:** `hoody daemon programs sandbox get`

---

#### `getStatus` — Get specific program status

```typescript
client.daemon.programs.getStatus(id: number, options?: { port?: number; include_stats?: "true" | "false" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `number` | path | Yes | Unique numeric identifier of the program. An id that is not a valid `i32` (a word, an empty segment, a number too large) never reaches the handler: the path extractor refuses it with a plain-text 404, on every route that takes an id, which is NOT the documented JSON 404 of the routes that have one. An id that parses but names no program is the handler's own answer, a 400 carrying the `{success: false, error: ...}` envelope, except on the routes that document a 404. |
| `port` | `number` | query | No | Filter to specific port instance (for port-range programs only) |
| `include_stats` | `"true" \| "false"` | query | No | Include resource stats (CPU, memory, process tree) for running programs. WHERE the stats land depends on the program: a standard program gets a top-level `stats`; a port-range program gets one `stats` per instance, on the instance itself (`instance.stats`, or `instances[].stats`), never at the top level. Each carries pid, started_at, cpu_percent, memory_rss_bytes, process_count and a per-process breakdown. |

**Returns:** `Promise<DaemonProgramsGetStatusResponse>`  |  **HTTP:** `GET /api/v1/daemon/status/{id}`
**CLI:** `hoody daemon programs status`

---

#### `list` — List all programs

```typescript
client.daemon.programs.list(options?: { hoody_kit?: "true" | "false"; lazy_load?: "true" | "false"; enabled?: "true" | "false"; boot?: "true" | "false"; name?: string; port?: number; port_from?: number; port_to?: number; include_status?: "true" | "false"; include_stats?: "true" | "false" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `hoody_kit` | `"true" \| "false"` | query | No | Filter by hoody_kit status. Use "true" for Hoody Kit programs only, "false" for user (non-kit) programs only. |
| `lazy_load` | `"true" \| "false"` | query | No | Filter by lazy_load status. Use "true" for lazy-loaded programs only (started on-demand), "false" for programs that auto-start. |
| `enabled` | `"true" \| "false"` | query | No | Filter by enabled status. Use "true" for enabled programs only, "false" for disabled programs only. |
| `boot` | `"true" \| "false"` | query | No | Filter by boot status. Use "true" for programs that auto-start on system boot, "false" for manual-start programs. |
| `name` | `string` | query | No | Filter by exact program name (e.g. "hoody-agent"). Lazy mode: the proxy resolves the agent BY NAME because it is a standard program with no port_range (the port filter cannot match it) and program ids are positional. Invalid names return 400. |
| `port` | `number` | query | No | Filter programs by single port number. Returns only programs whose port_range includes this specific port. Example: ?port=8042 returns programs with ranges containing 8042. |
| `port_from` | `number` | query | No | Filter by port range start (must be used with port_to). Returns programs whose port ranges overlap with the specified range. Uses overlap logic: program.start <= port_to AND program.end >= port_from. |
| `port_to` | `number` | query | No | Filter by port range end (must be used with port_from). Returns programs whose port ranges overlap with the specified range. Multiple programs may be returned if their ranges overlap. |
| `include_status` | `"true" \| "false"` | query | No | Include runtime status for each program. When true, adds a "status" field to each program showing current running state, instances, and process details. |
| `include_stats` | `"true" \| "false"` | query | No | Include resource stats (CPU, memory, process tree) for each running program. Turns status on only when `include_status` is omitted: an explicit `include_status=false` suppresses both status and stats. Adds a "stats" field with pid, started_at, cpu_percent, memory_rss_bytes, process_count, and per-process breakdown. Only present for running programs. |

**Returns:** `Promise<DaemonProgramsListResponse>`  |  **HTTP:** `GET /api/v1/daemon/programs`
**CLI:** `hoody daemon programs list`

---

#### `listStatus` — Get all program statuses

```typescript
client.daemon.programs.listStatus()
```

**Returns:** `Promise<DaemonProgramsListStatusResponse>`  |  **HTTP:** `GET /api/v1/daemon/status`
**CLI:** `hoody daemon programs status`

---

#### `reset` — Reset programs to default

```typescript
client.daemon.programs.reset()
```

**Returns:** `Promise<DaemonProgramsResetResponse>`  |  **HTTP:** `POST /api/v1/daemon/programs/reset`
**CLI:** `hoody daemon programs reset`

---

#### `start` — Start a program or port instance

```typescript
client.daemon.programs.start(id: number, data: DaemonProgramsStartRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `number` | path | Yes | Unique numeric identifier of the program. An id that is not a valid `i32` (a word, an empty segment, a number too large) never reaches the handler: the path extractor refuses it with a plain-text 404, on every route that takes an id, which is NOT the documented JSON 404 of the routes that have one. An id that parses but names no program is the handler's own answer, a 400 carrying the `{success: false, error: ...}` envelope, except on the routes that document a 404. |
| `data` | `DaemonProgramsStartRequest` | body | Yes |  |

**Body:** `{ port: int, wait: bool=false, timeout: int=30, if_not_running: bool=false }`

- `port` — Port number to start (required for port-range programs)

**Returns:** `Promise<DaemonProgramsStartResponse>`  |  **HTTP:** `POST /api/v1/daemon/programs/{id}/start`
**CLI:** `hoody daemon programs start`

---

#### `stop` — Stop a program or port instance

```typescript
client.daemon.programs.stop(id: number, data: DaemonProgramsStopRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `number` | path | Yes | Unique numeric identifier of the program. An id that is not a valid `i32` (a word, an empty segment, a number too large) never reaches the handler: the path extractor refuses it with a plain-text 404, on every route that takes an id, which is NOT the documented JSON 404 of the routes that have one. An id that parses but names no program is the handler's own answer, a 400 carrying the `{success: false, error: ...}` envelope, except on the routes that document a 404. |
| `data` | `DaemonProgramsStopRequest` | body | Yes |  |

**Body:** `{ port: int, all: bool }`

**Returns:** `Promise<DaemonProgramsStopResponse>`  |  **HTTP:** `POST /api/v1/daemon/programs/{id}/stop`
**CLI:** `hoody daemon programs stop`

---

#### `streamLogs` — Follow program logs (SSE)

```typescript
client.daemon.programs.streamLogs(id: number, options?: { type?: "stdout" | "stderr"; lines?: number; port?: number; offset?: number; LastEventID?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `number` | path | Yes | Program ID |
| `type` | `"stdout" \| "stderr"` | query | No | Log stream: stdout or stderr |
| `lines` | `number` | query | No | Number of complete lines replayed from the end of the file before following (default 100). `0` replays nothing and only follows; values above 10000 are clamped to 10000. The replay is found in the last 10 MiB of the file. Ignored when resuming with `offset` or `Last-Event-ID`. |
| `port` | `number` | query | No | Port number (required for port-range programs) |
| `offset` | `number` | query | No | Resume cursor: the `id` of the last `line` event received (a byte offset just past that line). Streaming restarts at the next line and no backlog is replayed. An offset beyond the end of the current file means it was truncated or replaced since: the stream sends a `reset` event and starts from the top of the file. The cursor is a byte position, not a file identity, so a file replaced by one at least as long is not detected across a reconnect. Takes precedence over `Last-Event-ID`. |
| `LastEventID` | `string` | header `Last-Event-ID` | No | Same cursor as `offset`, as sent automatically by an EventSource when it reconnects. Must be a non-negative integer. |

**Returns:** `Promise<IEventStream<{ CacheControl?: string; }>>`  |  **HTTP:** `GET /api/v1/daemon/programs/{id}/logs/stream`
**CLI:** `hoody daemon programs logs stream`

---

#### `update` — Edit a program

```typescript
client.daemon.programs.update(id: number, data: DaemonProgramsUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `number` | path | Yes | Unique numeric identifier of the program. An id that is not a valid `i32` (a word, an empty segment, a number too large) never reaches the handler: the path extractor refuses it with a plain-text 404, on every route that takes an id, which is NOT the documented JSON 404 of the routes that have one. An id that parses but names no program is the handler's own answer, a 400 carrying the `{success: false, error: ...}` envelope, except on the routes that document a 404. |
| `data` | `DaemonProgramsUpdateRequest` | body | Yes | Shape: `daemon_ProgramUpdate` under Body schemas. |

**Returns:** `Promise<DaemonProgramsUpdateResponse>`  |  **HTTP:** `POST /api/v1/daemon/programs/edit/{id}`
**CLI:** `hoody daemon programs update`

---

#### `getTerminalId` — The terminal id of a daemon program (`terminal_id`), read from the container's daemon (the one this service talks to).

```typescript
client.daemon.programs.getTerminalId(program: DaemonProgramRef)
```

**Returns:** `Promise<number>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `attachTerminal` — Attach to a daemon program's terminal: the program's screen, its input, its size.

```typescript
client.daemon.programs.attachTerminal(program: DaemonProgramRef, options?: ProgramTerminalAttachOptions)
```

**Returns:** `Promise<ProgramTerminalAttachment>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.


### Body schemas

- `daemon_ProgramInput` — `{ id: int, name*: string, description: string, command*: string, user*: string, enabled: bool=true, boot: bool=false, delay_seconds: int=0, autorestart: "true" | "false" | "unexpected" | bool="unexpected", directory: string, priority: int=999, stdout_logfile: string, stderr_logfile: string, logs_enabled: bool=true, log_max_bytes: int=5242880, log_backups: int=2, environment: { [key: string]: string }, hoody_kit: bool=false, port_range: { start*: int, end*: int }, port_param: string, lazy_load: bool=false, ready_port: int|null, display: string|null | int, terminal_id: int, terminal_shell: string|null, terminal_interactive: bool|null, webhooks: { enabled*: bool, urls*: string[], events: string | string[], headers: object, timeout: int, retry: int }|null, sandbox: daemon_SandboxConfig|null }`
- `daemon_ProgramUpdate` — `{ id: int|null, name: string|null, description: string|null, command: string|null, user: string|null, enabled: bool|null, boot: bool|null, delay_seconds: int|null, autorestart: "true" | "false" | "unexpected" | bool|null, directory: string|null, priority: int|null, stdout_logfile: string|null, stderr_logfile: string|null, logs_enabled: bool|null, log_max_bytes: int|null, log_backups: int|null, environment: { [key: string]: string }|null, hoody_kit: bool, port_range: { start*: int, end*: int }|null, port_param: string|null, lazy_load: bool|null, ready_port: int|null, display: string|null | int, terminal_id: int|null, terminal_shell: string|null, terminal_interactive: bool|null, webhooks: { enabled*: bool, urls*: string[], events: string|null | string[], headers: object|null, timeout: int|null, retry: int|null }|null, sandbox: daemon_SandboxConfig|null }`
- `daemon_EphemeralProgramInput` — `{ command*: string, user*: string, name: string, autorestart: "true" | "false" | "unexpected" | bool="unexpected", directory: string, environment: { [key: string]: string }, priority: int=999, delay_seconds: int=0, stdout_logfile: string, stderr_logfile: string, logs_enabled: bool=true, log_max_bytes: int=5242880, log_backups: int=2, ttl: int, wait: bool=false, timeout: int=30, display: string|null | int, terminal_id: int, terminal_shell: string|null, terminal_interactive: bool|null }`
- `daemon_SandboxConfig` — `{ filesystem: daemon_SandboxFilesystem|null, network: daemon_SandboxNetwork|null, process: daemon_SandboxProcess|null }`
  - … Consequences that callers must expect — the pid supervisord tracks is the wrapper, not the program; a signal death reaches supervisord as exit code `128+n` rather than as a signal; and any edit that changes the RESOLVED policy replaces the loaded definition, stopping the instance that ran under …
- `daemon_SandboxFilesystem` — `{ read_only_root: bool|null=false, writable: string[]|null, hidden: string[]|null }`
  - … Independently of these fields, every sandboxed program sees an empty `/run/user` in place of the real one, so it cannot reach its account's systemd user manager or session bus; a sandboxed program whose `directory` is under `/run/user` is rejected with 400. Unknown keys are rejected with 400. …
  - `read_only_root` — Bind `/` read-only (`--ro-bind / /`). … `/sys` is bound read-only for every sandboxed program regardless of this flag, so the program cannot edit its own cgroup limits.
  - `writable` — … Each must already exist and is canonicalized. `read_only_root` must be true — `writable` on its own is a 400, not a restriction. … `/hoody` and `/hoody/storage` are therefore refused because they contain the daemon's own tree; `/hoody/storage/apps/<name>` is accepted. At launch the wrapper's outer stage canonicalizes each path, records its `(st_dev, st_ino)`, and compares those against a fresh stat immediately before the sandbox is spawned; a path that changed identity, or is no longer a directory, is refused. …
- `daemon_SandboxNetwork` — `{ mode: "full" | "restricted" | "none"|null="full", bind_ports: (int | string)[]|null, connect_ports: (int | string)[]|null, ingress_allow_from: string[]|null, ingress_allow_platform: bool|null=true, ingress_rate_limit: string|null }`
  - Network confinement. … Unknown keys are rejected with 400. …
- `daemon_SandboxProcess` — `{ max_memory: string|null, max_pids: int|null, max_open_files: int|null, private_tmp: bool|null=false }`
  - … The program sees `/sys` read-only and cannot raise the cgroup limits. Unknown keys are rejected with 400. …
  - `max_pids` — `TasksMax=` on the scope, from 4 to 65536. The count includes the two wrapper helpers (the scope payload and bubblewrap), so budget at least 2 above the program's own process and thread count.
  - `private_tmp` — … Rejected with 400 when a `filesystem.writable` entry equals, contains or is contained by `/tmp` or `/var/tmp`: the private mounts are applied first, so a writable bind over them would expose the container's shared directory. Also rejected when the program's `directory` lies strictly below `/tmp` or `/var/tmp`, or when the daemon itself is installed below either: the private mounts would hide them and the launch could not reach the program.

