> _**SDK skill · `daemon` namespace** · ~16,140 tokens · hoody-sdk v1.0.1_

# `daemon` — supervisord program lifecycle (start any program; logs kept)

## Purpose

**Default for "start a program" / "spawn a process"** when you don't need an interactive shell or a TUI. REST over `supervisord` — every process is supervised, auto-restart-eligible, log-captured by default (stdout + stderr written under `/hoody/storage/hoody-daemon/logs/<name>/stdout.log` and `/hoody/storage/hoody-daemon/logs/<name>/stderr.log` — one directory per program name; registered programs use symlinks to timestamped log sessions, while quick-start programs write these files directly), and inspectable after the fact. Those are the default paths: a program can set its own log files or turn logging off. Log files rotate by size. When an apply changes a registered program's configuration, its old timestamped default log sessions older than the retention period (30 days by default) are deleted; the active session is kept, and custom log files are not covered by that cleanup. Log FILES outlive the process on disk, but the ephemeral tracking entry is normally dropped 10 minutes after the program finishes or is stopped (it stays longer while a failed withdrawal from supervisord is still being retried) — after that `ephemeralPrograms.getLogs` 404s (see Quirks); read the logs within those 10 minutes, or read the on-disk files directly (e.g. via the `files` namespace). `programs.getLogs` covers configured (non-ephemeral) programs.

Two flavours:

- **Quick-start (ephemeral, not added to the program list)** — `ephemeralPrograms.start { command, user, ttl?, wait?, timeout? }`. Returns `temporary_id = quick_<ts>_<seq>`. Best for one-offs and short-lived jobs (build steps, batch transforms, "run this once and tell me the output"). It adds no durable program entry, but it does write a temporary supervisord configuration and records the program in the kit's ephemeral tracking file so the cleanup pass can find it. The log files stay on disk, but `ephemeralPrograms.getLogs` works only while the tracking entry exists. The cleanup pass (every 30 s) finalizes a program that is `stopped` or `fatal`, or `exited` with autorestart turned off; under `autorestart: "unexpected"` an `exited` program is finalized when its exit code is known to be 0, and is kept while its exit code is unknown. A finalized program's result and logs stay readable for 10 minutes; then the pass drops the entry and the logs route 404s (an entry whose withdrawal from supervisord failed is kept until a later pass completes it). Stopping a program that already finished does not extend that window. Optional `ttl` auto-stops after N seconds. A quick-start defaults to `autorestart: "false"` and runs once, even when the command fails; set `autorestart: "unexpected"` to restart it after a nonzero exit once it has run past the startup window (`delay_seconds`, 1 second when 0); a nonzero exit inside that window is a failed start, retried a limited number of times and then `fatal`.
- **Registered program (durable, persists across kit restarts)** — `programs.create { name, command, user, enabled: true, boot: true?, autorestart: 'unexpected', … }` → `programs.start { wait: false }`, then poll `programs.getStatus`. Use this when the process should come back after a computer restart, when you want auto-restart on crash, or when you need port-range fan-out / lazy-load on first proxy hit.

## When to use

- "Run this command and keep the logs" → `ephemeralPrograms.start`.
- "Run this server / agent / script as a long-running supervised process, restart on failure" → `programs.create` + `programs.start`.
- Background workers, port-range fan-out, lazy-loaded HTTP services, supervisord-event webhooks.

## When NOT to use

- **Traditional system services that ship native systemd units** (apache2, nginx, postgresql, mysql, redis, mosquitto, sshd, postfix, …) — leave them on `systemd`. Hoody computers are full Linux boxes with systemd + root (they behave like VMs, not Docker), so the standard `apt install nginx && systemctl enable --now nginx` flow Just Works and benefits from the upstream unit's hardening (drop-in directories, sd_notify, journal integration, etc.). Mixing systemd-managed and `daemon`-managed processes in the same computer is fine — pick whichever fits the program.
- Need an interactive TTY (Claude Code, Codex, htop, vim, anything that paints the screen) → a one-off or hand-driven session is `terminal` with a **pinned non-ephemeral `terminal_id`**; a program that must be supervised (auto-restart, start at boot) is a `daemon` program with `terminal_id`, which runs on that terminal's PTY. Without `terminal_id` a daemon program has no TTY. A program with `terminal_id` cannot also have an effective sandbox.
- Watch or type into a daemon program's terminal → `client.daemon.programs.connectTerminal(program)` on a computer-scoped client (resolves `{ terminalId, ws }`; `ws.disconnect()` leaves the program running). Snapshot, press, paste, write and wait drive it over REST without a WebSocket. Execute and session create on that id answer `409 DAEMON_TERMINAL`; a stopped program answers `409 DAEMON_PROGRAM_NOT_RUNNING` and closes a WebSocket with `4404`.
- After starting a program with `terminal_id`, attach to its terminal or use the terminal's REST automation at least once. Until something connects, its output waits in the terminal up to about 19 KB, and a program that writes more blocks and can stall. Once connected, hoody-terminal stays connected until the program ends or the terminal session is deleted.
- Need to pipe input mid-run / send keystrokes → `terminal` (`terminal.sessions.pressKeys`, `terminal.sessions.paste`).
- One-shot synchronous request/response → `exec` (HTTP handler, returns body).
- Schedule (cron syntax) → `cron`. Access logs → `proxyLogs`. File-system events → `watch`.

### When to prefer `daemon` over `systemd`

- Custom scripts and binaries you wrote that don't have a packaged unit.
- Quick experiments where you want REST-driven start/stop/log without writing a unit file.
- Port-range fan-out (`port_range` + `port_param` + `lazy_load`) — supervisord-side feature, not a systemd one.
- Programs you want to provision / mutate / remove via the Hoody API (CI scripts, multi-tenant computer fleets) — `programs.create` is one HTTP call.

### When to prefer `systemd` over `daemon`

- Any service whose Debian/Ubuntu package already drops a working unit in `/lib/systemd/system/` (most server software).
- You want `journalctl -u <service>`, `systemctl status`, drop-in overrides, socket-activated services, timers (cron-equivalent), or any other systemd feature.
- The program is part of the computer's "default-on" baseline (boots with the computer, never managed externally).

## Prerequisites

- `/dev/hoody` and `/hoody` exist; without them the daemon exits without serving.
- The log directory `/hoody/storage/hoody-daemon/logs/` need not exist at startup. When logging is enabled (not `logs_enabled: false`), the daemon creates the default or custom log directories a program needs before it publishes that program's configuration. If creating one fails, the add, edit, enable, start or quick-start fails with `the log directory <dir> could not be created: <reason>` and nothing is published; for example, a missing directory is refused when an existing directory above it under the log root is not owned by root or is group- or world-writable. A log directory that already exists in full is used as it is, so create the full path yourself.
- `user` = real system account.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Register and boot

- `programs.create` (`name`/`command`/`user`; `enabled`, `boot`; opt `directory`/`environment`/`autorestart`/`priority`/`*_logfile`) -> `programs.start` `{ wait: false }`, then poll `programs.getStatus` (`include_stats`) until `status.status` is `running` (`wait: true` blocks the request and easily exceeds 30 s on a cold kit; see Example 1); `programs.getLogs` on failure.

### 2. Ephemeral with TTL

- `ephemeralPrograms.start` (`command`/`user`, opt `ttl?`/`wait?`/`timeout?`) returns `temporary_id` = `quick_<ts>_<seq>`. Poll/tail with `ephemeralPrograms.getStatus`/`ephemeralPrograms.getLogs`; `ephemeralPrograms.stop` to terminate.

### 3. Lazy port-range fleet

- `programs.create` + `port_range: { start, end }`, `port_param`, `lazy_load: true`, `enabled: true`. `programs.list({ port: 8042, include_status: 'true' })`. `programs.start` `{ port: 8042 }`; `programs.stop` `{ port }` or `{ all: true }`.

### 4. Reach a service you just started

Any computer port is publicly addressable as soon as the listener is up — no proxy alias, firewall edit, or extra registration needed:

- HTTP service on `:8080` → `https://{projectId}-{computerId}-http-8080.{node}.computers.hoody.com`
- HTTPS service on `:8443` → `https://{projectId}-{computerId}-https-8443.{node}.computers.hoody.com`

Edge is always `https://`; the slug only describes the inner protocol. Gate access via `computers.proxy.*` (`client.api.computers.proxy`) if it shouldn't be public. See § Proxy URLs.

### 5. Update / wipe

`programs.update` (partial: an omitted field keeps its stored value, but `environment`, `sandbox`, `port_range` and `webhooks.enabled`+`webhooks.urls` are replaced whole when sent; see Quirks); `programs.disable`/`programs.enable`; `programs.delete`; `programs.reset` -> `programs.default.json`.

## Quirks & gotchas

- Boolean query params (`hoody_kit`, `lazy_load`, `enabled`, `boot`, `include_status`, `include_stats`) STRICT: only `true`/`false`, in any letter case; `1`/`yes`/`0`/`""` -> 400. Send lowercase, which is what the SDK's typed values are.
- Webhook URLs are validated only in an enabled block: `webhooks.enabled: false` skips every URL, event, header, timeout and retry check (the block must still carry `enabled` and `urls`). In an enabled block, URLs are HTTPS-only and must point to public destinations. Userinfo is rejected, and so is an authority the kit refuses as a destination, in any spelling of the address. A DNS name is not resolved when the block is saved; at delivery time, addresses the kit refuses are dropped from its resolution and delivery fails when none remains. Delivery never follows redirects and ignores the environment's HTTP proxy settings.
- A `webhooks` edit must send `enabled` AND `urls` (a block without `urls` is a 400, `missing field urls`) and replaces both; `events`, `headers`, `timeout` and `retry` keep their stored values when omitted. An enabled block with an empty `urls` is a 400. Callbacks are delivered only when the deployment enables event delivery for the kit; the block is validated and stored either way.
- Duplicate names + overlapping port ranges rejected on create AND on an update that renames the program or moves its port range (adjacent OK); an unrelated update does not re-check them, so an existing duplicate or overlap is left as it is; `port_param` requires `port_range`.
- The program list and the quick-start list have no pagination helpers (the all-pages and iterator variants other list methods get). They were removed on 2026-09-22: neither response is paginated, so the helpers read items from `data.items`, a field these responses do not have, and returned nothing. Call `programs.list()` and read `response.data.programs`; call `ephemeralPrograms.list()` and read `response.data.ephemeral_programs`.
- `command` no newlines/CR/NUL; `user` `(?i)[a-z_][a-z0-9_-]*\$?` (case-insensitive) via `id`; `*_logfile` must resolve under `/hoody/storage/hoody-daemon/logs/`.
- `programs.start` on `port_range` REQUIRES `{ port }`; `programs.stop` `{ port }` or `{ all: true }`.
- `ephemeralPrograms.start` returns `temporary_id` = `quick_<unix-ms>_<seq>` (e.g. `quick_1700000000000_1`); pass it unchanged to `ephemeralPrograms.getStatus`, `ephemeralPrograms.getLogs` and `ephemeralPrograms.stop`. TTL polled ~10 s.
- Over HTTP and in the generated SDK methods a program is addressed by its integer `id` from `programs.list`, never by its name. The exception is the SDK helpers `programs.getTerminalId` and `programs.connectTerminal`: their `program` is an id, `{ id }` or `{ name: 'exact-name' }`, and a name is resolved through `programs.list` (no match or several matches throws). An HTTP path value that is not an integer is refused with 404 before the daemon looks anything up; the SDK rejects a non-integer `id` with a `ValidationError` before sending a request. A numeric name in the id slot is read as an id, not looked up by name. To find the id of a named program, filter the list by name.
- Default ephemeral log paths are `/hoody/storage/hoody-daemon/logs/<name>/stdout.log` and `/hoody/storage/hoody-daemon/logs/<name>/stderr.log` (one directory per program), NOT `<name>.out.log`/`<name>.err.log`.
- After `ephemeralPrograms.stop`, the program's result and logs stay readable for 10 minutes from when it finished (stopping a program that had already finished keeps its result and does not renew that window); then its tracking entry is dropped (later, if the withdrawal is still being retried) and `ephemeralPrograms.getLogs` returns `404`, while the on-disk log files persist. If withdrawing the program's supervisord group fails, the stop still reports success, with `cleaned_up: false`, and the next cleanup pass retries the withdrawal. Read `ephemeralPrograms.getLogs` within those 10 minutes, or fetch the on-disk file directly.
- `programs.start` accepts `if_not_running: true` for an idempotent boot — early-returns with `already_running: true` if the program is already running and, when the program declares a `ready_port` (a standard program or a port-range instance), that port accepts connections; otherwise, including a running program whose `ready_port` is not serving, it takes the start path, and polls for readiness only with `wait: true` (port-range responses include an `instance` block with the instance's status, but a newly dispatched start leaves out its pid — only the already-running shortcut returns an observed pid; standard programs omit the `instance` field entirely. Read the pid from `programs.getStatus(id, { port })`). Use it for "ensure started" workflows.
- **`environment` REPLACES the whole map** on `programs.update` (not per-key merge). If the existing env is `{A:"1",B:"2"}` and you update with `{environment:{A:"9"}}`, the stored map becomes `{A:"9"}` (values are strings). To preserve secrets, GET the program first and re-send the merged map.
- **`sandbox` is three-state on `programs.update`**: absent keeps the stored block, `null` clears it, and an object REPLACES the whole block (no field merge). Sending `{sandbox:{process:{max_pids:64}}}` to a program that also had `filesystem.read_only_root` and `network.mode: restricted` leaves only `max_pids`, and the program runs without the others. Read `programs.getSandbox(id)` first (`configured` is the stored block) and resend every restriction you want kept: merge locally and send the whole block.
- Quick-start programs cannot be sandboxed: a non-null `sandbox` on `ephemeralPrograms.start` is a 400 (`sandbox is not supported for quick-start programs`); `null` is accepted as absent.
- An effective sandbox is refused for a `user` that resolves to uid 0 (under any name) and together with `terminal_id`. A block that restricts nothing is stored as absent and does not appear on the program.
- **A sandboxed program fails CLOSED at launch.** If a mechanism its policy needs is missing the program does not start unconfined, it refuses to start at all: Landlock below the network ABI, a `bwrap` or `systemd-run` the computer does not have, or an ingress policy with no `nft`. Expect the program to be down, not unprotected. A launch-stage refusal is printed as `sandbox: <reason>` on the PROGRAM's stderr, not in the daemon log, so read `programs.getLogs` with `type=stderr`; the daemon log carries the earlier failures instead (validation, rendering, firewall admission, the supervisord apply). A stored block is also re-validated every time the program is rendered, so a block that later breaks a rule refuses the render rather than running the program unconfined.
- A NON-EMPTY `network.ingress_allow_from`, or an `ingress_rate_limit`, needs a listening set: without `bind_ports`, `port_range` or `ready_port` the edit is a 400 (`sandbox.network.ingress_* requires a listening set`). An empty list owes no rules and so needs nothing. They filter IPv4 TCP arriving on `eth0` at those ports only, leave established connections alone, and an empty `ingress_allow_from` restricts nothing rather than denying everyone.
- **Test an ingress allowlist through the program's public service URL, with a new connection.** The chain only matches what arrives on `eth0`, so a direct same-computer connection to the listener never reaches it; a request the computer sends to its own program's public service URL does reach it, arriving from the server's public address, and is filtered. And `ingress_allow_platform` defaults to `true`, which accepts traffic the platform itself sends to the computer ahead of both the meter and the allowlist. A probe from inside the computer proves nothing; test with a new connection from an outside source, or through the program's public service URL. Public traffic the proxy forwards keeps the client's own address and IS filtered. The rate meter runs before the allowlist and stops tracking new sources once its 65535-entry set is full, while the allowlist keeps applying.
- `programs.getSandbox(id)` answers with more than the stored block, and none of it certifies a running program: `configured` is what was persisted; `rev` is the 12-hex revision recomputed from the currently valid stored policy, the one the daemon WOULD place on the wrapper command line rather than an observation of the running process, and null when no effective policy validates; `effective` is DIAGNOSTIC argv recomputed from the stored policy, carrying placeholders like `<program argv>` and `<pid>`, never the observed command, and it omits what the wrapper applies from inside itself (Landlock ports, the seccomp network filter, and the open-file and file-size limits); `live` reports the nft table, chain and rules read from the kernel at request time; `firewall` is `none`, `ok`, `draining` or `degraded`, with `problems` listing validation, state, integrity and unresolved-install failures. Read `problems` before concluding a restriction is in force.
- **`restricted` is a PORT policy, not a destination policy.** `full` restricts neither bind nor connect. `restricted` limits which TCP ports the program may bind and connect to, at every destination including loopback: it cannot allow one host and deny another, and it does not touch UDP or ICMP, because Landlock has no hook for them (raw sockets are already closed: every effective sandbox drops all capabilities). To refuse IPv4 and IPv6 datagram sockets (UDP, UDP-Lite, ICMP ping), set `network.udp: "deny"`: it works in every mode and is effective on its own, answers `EACCES`, also refuses SCTP and RxRPC sockets and disables io_uring (`ENOSYS`), and does not cover a socket handed in from outside the sandbox. A 32-bit program that creates sockets through `socketcall` then gets none, TCP and unix included. With `udp: "deny"` in `full` or `restricted` mode, the daemon makes glibc ask its name servers over TCP (`options use-vc`); combined with `restricted`, add the resolvers' TCP port 53 to `connect_ports`. musl, or a resolver that ignores `resolv.conf` options, needs its own TCP DNS configuration. Without `udp: "deny"`, the daemon does not add `options use-vc`; DNS transport depends on the resolver's configuration. It also governs the `bind` and `connect` CALLS, not a socket that starts listening without an explicit bind, and a listener obtained that way is outside the ingress rules too. `none` is different in kind: it unshares the network namespace, so it removes IP networking of every protocol. Network mode alone does not block filesystem Unix sockets: under every mode, `none` included, they are governed by filesystem restrictions and file permissions rather than by this field. Every effective sandbox also masks `/run/user` with an empty directory, so sockets beneath it (the user manager, the session bus, agent sockets) are unreachable.
- Ports are numbers or inclusive `"a-b"` strings. An omitted `bind_ports` defaults to the union of `port_range` and `ready_port`, and an explicit list has to cover both. `restricted` needs a non-empty resolved bind set, and an omitted or empty `connect_ports` denies outbound TCP entirely; a non-empty `connect_ports` requires `restricted`. `none` refuses declared listeners, a non-null explicit `bind_ports` (`[]` included), a non-empty connect or allow list, and a configured rate limit. Empty lists and either value of `ingress_allow_platform` are accepted and inert.
- **The filesystem side is confinement, not a private computer.** An effective sandbox drops all capabilities and unshares the user, PID and IPC namespaces, but the program keeps its account's supplementary groups and still sees the computer's filesystem subject to ordinary permissions. `read_only_root` stops writes, not reads, and `/dev` and `/proc` are mounted over it. Private `/tmp` and `/var/tmp` are added only with `process.private_tmp: true`, which defaults to false: otherwise the program shares the computer's temporary directories. `hidden` is not a secrecy boundary against an actor who can rename a validated directory or one of its ancestors: writable sources are pinned by descriptor at launch, but mount destinations are still resolved by pathname.
- Process limits have fixed domains and are rejected outside them: `max_memory` from `16M` to `64G` (decimal bytes, or uppercase binary `K`/`M`/`G`, with scope swap disabled), `max_pids` from 4 to 65536 counting threads and two wrapper helpers, `max_open_files` from 8 to 1048576 applied as both the soft and the hard limit. `max_cpu` (`"<n>%"`, whole numbers from `1%` to `102400%`, `100%` = one CPU), `max_file_size` (a per-file size limit, `1K` to `1024G`) and `tmp_size` (the size of each private tmpfs, `1M` to `64G`, only with `private_tmp: true`) are accepted too; a daemon built before they were added refuses them as unknown fields. There is no aggregate disk quota.
- **A stored sandbox is not proof that one is installed.** An add or edit can persist the new block and still fail to apply it; the response says so, and the earlier process may keep running unconfined when its stop cannot be confirmed. Treat a failed write as unresolved, read `problems`, fix the cause and reapply, rather than assuming either the old or the new policy is in force.
- The ingress table `ip hoody_daemon` is rebuilt from desired state, not continuously enforced. Flushing or weakening it out of band can leave running programs unprotected: status turns `degraded`, launches that reach the wrapper before repair refuse, nothing repairs the table on a timer, and nothing stops what is already running. A successful firewall transaction or reconcile can rebuild it. Admission during `programs.start` (the proxy's lazy-load start included), `programs.enable`, or an update that leaves the program enabled also checks an identical active ingress policy and recommits the stored rules when the live table differs; repair can still fail. Restore it and check `live` plus `firewall` after any out-of-band change.
- Ingress rules are attached to a destination PORT on `eth0`, not to a process. Another listener on that same port at a different local address gets the same filtering, and the ownership check only knows about ports other programs have DECLARED, so an undeclared listener is neither protected from this nor protected against it.
- **A policy change restarts the program.** The revision is part of the supervisord command line, so changing the resolved policy replaces the definition and stops the running instance; whether another starts is decided by `boot` and `lazy_load`, not by the edit. The old revision's ingress rules and port reservations can linger as `draining` after the call returns, so for a short window traffic meets both policies and the port is not yet free to reuse.
- Webhook delivery needs per-program `webhooks.enabled: true` AND a deployment that enables event delivery for the kit. No request turns event delivery on, so a program whose `webhooks.enabled` is `true` can still receive no callbacks; a saved `webhooks` block is not proof that any will arrive.
- `port_range` is an object `{ start, end }`.

## Common errors

- 400 webhook (enabled blocks only): `must use HTTPS protocol`, `must not contain userinfo`, and a refusal naming a destination that is not public.
- 400 `is already in use by ID` (duplicate name) / `overlaps with program` (port range) / `port_param requires port_range`.
- 400 (`success: false`) `Port parameter required for port-range programs` -> resend with a `port` from the program's range. 400 (`success: false`) `Program with ID {id} is disabled` -> `programs.enable` first.
- 403 `forbidden` — Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only.
- 1 MB request body limit.

## Related namespaces

`exec` sync. `cron` scheduled. `proxyLogs` access log. `terminal` TTY. `display` virtual display.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `computers.get` (`client.api.computers.get(computerId)`) first. The kit returns numeric `program.id` (not a UUID) — capture it from the `programs.create` response.

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

**Step 2 — `programs.start` with `wait: false`.** Warning: `wait: true` blocks the HTTP request until the process is running and easily exceeds 30 s on a cold kit (with the SDK's default 30 s client timeout, `wait:true,timeout:30` can time out on the client). Pass `wait: false` and poll `programs.getStatus` instead.

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
  command: `sh -c "for qs_n in $(seq 1 30); do echo qs-$qs_n; sleep 1; done"`,
  user: 'user', ttl: 600,
});
if (!r.data.temporary_id) throw new Error(r.data.error ?? 'no temporary_id');
const qid = r.data.temporary_id;
```

**Step 2 — check status.**

```typescript
const st = await client.daemon.ephemeralPrograms.getStatus(qid);
```

**Step 3 — tail logs.**

```typescript
const lg = await client.daemon.ephemeralPrograms.getLogs(qid, { type: 'stdout', lines: 10 } as any);
```

**Step 4 — stop.** Read the logs within 10 minutes of the stop (of the finish, for a program that had already finished: the stop does not renew the window): after that the tracking entry is normally dropped and `ephemeralPrograms.getLogs` returns 404 (the on-disk log files stay; a failed withdrawal delays the drop).

```typescript
await client.daemon.ephemeralPrograms.stop(qid);
```

### 3. Lazy port-range fan-out — one program, N port-bound instances

**Goal:** declare an HTTP service that listens on any port in `18800–18802`, materialised on demand the first time someone hits the proxy URL.

**Step 1 — add with `port_range` + `port_param` + `lazy_load`.** Warning: `port_param` cannot be empty (the kit returns `400 Invalid port_param format: ""`). Use a real CLI flag, e.g. `--port`. At start-time the kit appends `<flag>=<port>` — **equals-joined**, one instance per port in the range — so the program must accept the `--flag=value` form. The append is skipped when the command text already contains ` -p` or ` --port` followed by a value (separated by whitespace or `=`), whatever `port_param` names, so keep fixed port arguments out of the command. `python3 -m http.server` does NOT (its port is positional and `--port` is an unrecognised argument), so the example wraps it in a one-line `sh -c` that turns the appended flag back into the positional port.

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

The instance is reachable at `https://${P}-${C}-http-18800.${N}.computers.hoody.com` — no extra alias needed (see § "Reach a service you just started").

### 4. Tail program logs (`programs.getLogs` with type / lines)

**Goal:** investigate why a worker keeps restarting. `programs.getLogs` returns `{ logs, type, lines, log_file }`. Read the returned `log_file` for the actual on-disk path: the default is `/hoody/storage/hoody-daemon/logs/<name>/{stdout,stderr}.log`, a port-range instance defaults to `/hoody/storage/hoody-daemon/logs/<name>/{stdout,stderr}_<port>.log`, and a configured custom log path is used as given, except for a port-range instance, which inserts `_<port>` before every `.log` in the path, and `log_file` names that same file. A custom path with no `.log` is used as given, so every instance of the range writes that one file: give a port-range program a custom path that ends in `.log` to keep its instances apart.

```typescript
const lg = await client.daemon.programs.getLogs(id, { type: 'stderr', lines: 200 } as any);
console.log(lg.data!.logs);
```

For a port-range program, select the instance when reading logs: add `port: 18800` to the `programs.getLogs` options object.

### 5. Webhook on supervisord process events (e.g. crash → HTTPS callback)

**Goal:** when the program enters the `FATAL` state, POST to your HTTPS endpoint. Warning: When webhooks are enabled, URLs must be **HTTPS**, with no credentials and public destinations only. A disabled configuration skips these checks. Warning: **Event names are kit-specific, not the supervisord canonical `PROCESS_STATE_*` ones**: the kit accepts only `STARTING, RUNNING, BACKOFF, STOPPING, STOPPED, EXITED, FATAL, UNKNOWN, "all", "*"`. Sending `PROCESS_STATE_FATAL` returns `400 Invalid event type`.

```typescript
// programs.update takes ProgramUpdate: every field is optional.
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

Warning: A `webhooks` edit replaces `enabled` and `urls` and must send both: `{ webhooks: { enabled: false } }` on its own is a 400 (`missing field urls`). To turn delivery off, resend the current `urls` with `enabled: false`; to rotate URLs, send the full new `urls` array. `events`, `headers`, `timeout` and `retry` keep their stored values when omitted. `programs.update` takes the id plus the fields to change: the CLI needs only the id, but the SDK `programs.update(id, data)` requires `data`, and the HTTP route refuses an empty body.

### 6. Wipe + reset to defaults — non-destructive snapshot first

**Goal:** restore the supervisord program set to whatever ships in `programs.default.json`. Warning: **Destructive** — every program you added gets wiped. Snapshot before you call.

```typescript
const snapshot = (await client.daemon.programs.list()).data;   // SDK list has no `limit` option
await client.daemon.programs.reset();
// then re-create what you want from snapshot.programs[]
```

### 7. Patch only the env vars on a running program

**Goal:** flip `LOG_LEVEL=debug` without restating `command`/`user`/etc. `programs.update` is partial on every surface: fields absent from the request body keep their stored values. `environment` itself is replaced whole (see the note below).

```typescript
// programs.update takes ProgramUpdate: send only what changes. environment is replaced whole.
await client.daemon.programs.update(id, {
  environment: { LOG_LEVEL: 'debug', BUILD: 'examples' },
});
await client.daemon.programs.stop(id, {} as any);
await client.daemon.programs.start(id, { wait: false });
```

Warning: `environment` REPLACES the whole map (not per-key merge). If you have `{A:"1",B:"2"}` and update with `{environment:{A:"9"}}`, you end up with just `{A:"9"}` — re-send everything you want to keep.

### 8. Inspect a running program with stats

**Goal:** read CPU/RSS/uptime to feed a dashboard. For a standard program, `programs.getStatus?include_stats=true` returns `{ success, status: { id, status, pid?, uptime? }, stats? }`: the resource figures are in the separate `stats` object, present only when they could be collected for a running process. A program that is not running (`backoff`, `stopped`, `fatal`, …) has no `pid`, `uptime` or `stats` (a launcher still lingering after a reported final payload exit reports `exited`; any `pid` and `uptime` the supervisor supplied remain, and `stats` is present when requested and collected); supervisord's diagnostic text is never returned as `uptime`. A port-range program answers with `instances` (each carrying its own `stats`) when no `port` is selected, plus `running_count` and `total_count`; with `port` selected it answers with the single `instance` and its `stats` instead.

```typescript
const r = await client.daemon.programs.getStatus(id, { include_stats: 'true' } as any);
```

Warning: `include_stats` is a **string** boolean (`"true"`/`"false"`) — `1`/`yes`/empty string return `400` (strict-bool query parse, see Quirks).

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

Warning: For a port-range program, a start REQUIRES one port (`port` in the `programs.start` request, single-port only); there is no "start them all" — boot each port individually or rely on `lazy_load: true` to materialise on first proxy hit.

### 10. Disable now, re-enable after the migration

**Goal:** stop the program while retaining its stored definition for the migration. On success, `programs.disable` sets `enabled: false`, stops the program if it is running, and withdraws its supervisord definition. The stored program remains in `programs.list`, including its `command` and `environment`. `programs.enable` sets `enabled: true` without changing those fields. Enabling installs the supervisord definition immediately for a program with `boot`, `lazy_load`, a `port_range`, or an effective sandbox; a `boot: true` program that is not lazy-loaded can start right away. Follow enable with an ensure-start (`if_not_running: true`), which returns early when the program is running and ready and otherwise takes the start path (readiness polling only with `wait: true`). The examples below are for a standard program. A port-range program must be started once per desired port: `port: 18800` in the `programs.start` request; without a port its start is refused.

```typescript
await client.daemon.programs.disable(id);
// … run migration …
await client.daemon.programs.enable(id);   // can already start a boot: true program
await client.daemon.programs.start(id, { wait: false, if_not_running: true });
```

Warning: Trying `programs.start` while `enabled: false` answers 400 with `success: false` and `Program with ID {id} is disabled` (e.g. `Program with ID 7 is disabled`); the SDK throws it as an `ApiError` — call `programs.enable` first.

## Reference

**Accessor:** `client.daemon`  |  **Import:** `import * as daemon from 'hoody-sdk/daemon'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, computerId?, serviceIndex?, serverName? }` (`server` is the older spelling of `serverName`, which wins when both are set), which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are set by the client and are refused with a `TypeError` before the call is sent: configure the token on the client, a kit credential as `kitAuth` on `withComputer()` or the client config (`middlewareContext.kitAuth` replaces the client's `kitAuth` for one call), and use another client for another identity), `cache` (ignored here: only an `api` GET is cached, never a GET to a kit host), `responseIsFinal` (`true`: never sent again once it may have reached the server), `keyedInProgressWait` (`false`: a 409 IDEMPOTENCY_REQUEST_IN_PROGRESS is the answer, not asked again), `redactBodyKeys` (body keys whose values an ApiError shows as [REDACTED]) and `maxResponseBytes` (a response body over this many bytes is refused with code RESPONSE_TOO_LARGE, and reading stops) (no `_realm`: that one is control-plane only). When the signature shows an options object (`options?: object` is one that takes the transport options only), the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself keeps the argument order it displays. A `wsOptions` argument (WebSocket methods only) accepts just `reconnect`, `connectTimeoutMs` and `transport`; the other transport options (`timeoutMs`, `signal`, …) stay in the request options the signature shows, never in `wsOptions`.

**Reading a method.** A method that shows no **Returns:** returns the response type named after it, the words after `client.` joined in PascalCase plus `Response`: `client.daemon.ephemeralPrograms.getLogs()` returns `Promise<DaemonEphemeralProgramsGetLogsResponse>`. `data` is the request body; it has a row only where the row says more than the signature.

**Services** (the ones the notes and examples above call most come first):

- `client.daemon.programs`: create, delete, disable, disableBoot, enable, enableBoot, get, getLogs, getOverview, getRestartReceipt, getSandbox, getStatus, list, listStatuses, reset, restart, start, stop, streamLogs, update, getTerminalId, connectTerminal
- `client.daemon.ephemeralPrograms`: getLogs, getStatus, list, start, stop
- `client.daemon.kit`: getHealth

**Shared parameters.** A parameter row that repeats is printed once. When a signature shows a parameter that the method's own table does not list, its row is in the "Shared parameters" table of the method's service section: same type, wire location, required mark and description. A row in a method's own table always describes that method. An SDK helper (marked as one) has no table and takes nothing from these lists.

### `client.daemon.programs` (20) — Long-running daemon programs (CRUD + lifecycle)

**Shared parameters of `client.daemon.programs`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `number` | path | Yes | Unique numeric identifier of the program. An id that is not a valid `i32` (a word, an empty segment, a number too large) is refused with a plain-text 404, on every route that takes an id, which is NOT the documented JSON 404 of the routes that have one. An id that parses but names no program is the handler's own answer, a 400 carrying the `{success: false, error: ...}` envelope, except on the routes that document a 404. The Hoody Kit programs take the lowest ids on a new computer (the terminal kit is usually 1), so the examples use 100: add your program with `id: 100` (the `complete` add example does), or use the `program.id` the add call returns. Never point a write at a Hoody Kit program's id. |

#### `create` — Add a new CUSTOM program

```typescript
client.daemon.programs.create(data: DaemonProgramsCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DaemonProgramsCreateRequest` | body | Yes | Shape: `ProgramInput` under Body schemas. |

**HTTP:** `POST /api/v1/daemon/programs/add`
**CLI:** `hoody daemon programs create --name <name> --command <command> --user <user>`

---

#### `delete` — Remove a program

```typescript
client.daemon.programs.delete(id: number)
```

**HTTP:** `POST /api/v1/daemon/programs/remove/{id}`
**CLI:** `hoody daemon programs delete <id>`

---

#### `disable` — Disable a program

```typescript
client.daemon.programs.disable(id: number)
```

**HTTP:** `POST /api/v1/daemon/programs/{id}/disable`
**CLI:** `hoody daemon programs disable <id>`

---

#### `disableBoot` — Choose whether a program starts with the computer

```typescript
client.daemon.programs.disableBoot(id: number, data?: Omit<DaemonProgramsDisableBootRequest, "boot">, options?: object)
```

**Fixed by the method:** the method sets `boot: false`; do not pass `boot`.

**HTTP:** `POST /api/v1/daemon/programs/{id}/boot`

---

#### `enable` — Enable a program

```typescript
client.daemon.programs.enable(id: number)
```

**HTTP:** `POST /api/v1/daemon/programs/{id}/enable`
**CLI:** `hoody daemon programs enable <id>`

---

#### `enableBoot` — Choose whether a program starts with the computer

```typescript
client.daemon.programs.enableBoot(id: number, data?: Omit<DaemonProgramsEnableBootRequest, "boot">, options?: object)
```

**Fixed by the method:** the method sets `boot: true`; do not pass `boot`.

**HTTP:** `POST /api/v1/daemon/programs/{id}/boot`

---

#### `get` — Get a specific program

```typescript
client.daemon.programs.get(id: number)
```

**HTTP:** `GET /api/v1/daemon/programs/{id}`
**CLI:** `hoody daemon programs get <id>`

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

**HTTP:** `GET /api/v1/daemon/programs/{id}/logs`
**CLI:** `hoody daemon programs logs get <id>`

---

#### `getOverview` — Overview of every program and quick-start

```typescript
client.daemon.programs.getOverview()
```

**HTTP:** `GET /api/v1/daemon/programs/overview`

---

#### `getRestartReceipt` — Read a restart's receipt by its key

```typescript
client.daemon.programs.getRestartReceipt(id: number, options: { key: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `key` | `string` | query | Yes | The restart's Idempotency-Key. |

**HTTP:** `GET /api/v1/daemon/programs/{id}/restart`

---

#### `getSandbox` — Get sandbox status for a program

```typescript
client.daemon.programs.getSandbox(id: number)
```

**HTTP:** `GET /api/v1/daemon/programs/{id}/sandbox`
**CLI:** `hoody daemon programs sandbox get <id>`

---

#### `getStatus` — Get specific program status

```typescript
client.daemon.programs.getStatus(id: number, options?: { port?: number; include_stats?: "true" | "false" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `port` | `number` | query | No | Filter to specific port instance (for port-range programs only) |
| `include_stats` | `"true" \| "false"` | query | No | Include resource stats (CPU, memory, process tree) for running programs. WHERE the stats land depends on the program: a standard program gets a top-level `stats`; a port-range program gets one `stats` per instance, on the instance itself (`instance.stats`, or `instances[].stats`), never at the top level. Each carries pid, started_at, cpu_percent, memory_rss_bytes, process_count and a per-process breakdown. |

**HTTP:** `GET /api/v1/daemon/status/{id}`
**CLI:** `hoody daemon programs status <id>`

---

#### `list` — List all programs

```typescript
client.daemon.programs.list(options?: { hoody_kit?: "true" | "false"; lazy_load?: "true" | "false"; enabled?: "true" | "false"; boot?: "true" | "false"; name?: string; port?: number; port_from?: number; port_to?: number; include_status?: "true" | "false"; include_stats?: "true" | "false" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `hoody_kit` | `"true" \| "false"` | query | No | Filter by hoody_kit status. Use "true" for Hoody Kit programs only, "false" for user (non-kit) programs only. |
| `lazy_load` | `"true" \| "false"` | query | No | Filter by the lazy_load field. Use "true" for lazy-loaded programs only (started on-demand), "false" for programs whose lazy_load is false. This does not tell whether a program auto-starts: filter on `boot` for that. |
| `enabled` | `"true" \| "false"` | query | No | Filter by enabled status. Use "true" for enabled programs only, "false" for disabled programs only. |
| `boot` | `"true" \| "false"` | query | No | Filter by boot status. Use "true" for programs that auto-start on system boot, "false" for manual-start programs. |
| `name` | `string` | query | No | Filter by exact program name (e.g. "hoody-agent"). Lazy mode: the proxy resolves the agent BY NAME because it is a standard program with no port_range (the port filter cannot match it) and program ids are positional. Invalid names return 400. |
| `port` | `number` | query | No | Filter programs by single port number. Returns only programs whose port_range includes this specific port. Example: ?port=8042 returns programs with ranges containing 8042. |
| `port_from` | `number` | query | No | Filter by port range start (must be used with port_to). Returns programs whose port ranges overlap with the specified range. Uses overlap logic: program.start <= port_to AND program.end >= port_from. |
| `port_to` | `number` | query | No | Filter by port range end (must be used with port_from). Returns programs whose port ranges overlap with the specified range. Multiple programs may be returned if their ranges overlap. |
| `include_status` | `"true" \| "false"` | query | No | Include runtime status for each program. When true, adds a "status" field to each program showing current running state, instances, and process details. |
| `include_stats` | `"true" \| "false"` | query | No | Include resource stats (CPU, memory, process tree) for each running program. Turns status on only when `include_status` is omitted: an explicit `include_status=false` suppresses both status and stats. Where the stats land depends on the program: a standard program gets a top-level `stats`; a port-range program gets one `stats` per running instance, on `status.instances[]`, never at the top level. Each carries pid, started_at, cpu_percent, memory_rss_bytes, process_count and a per-process breakdown. |

**HTTP:** `GET /api/v1/daemon/programs`
**CLI:** `hoody daemon programs list`

---

#### `listStatuses` — Get all program statuses

```typescript
client.daemon.programs.listStatuses()
```

**HTTP:** `GET /api/v1/daemon/status`
**CLI:** `hoody daemon programs status`

---

#### `reset` — Reset programs to default

```typescript
client.daemon.programs.reset()
```

**HTTP:** `POST /api/v1/daemon/programs/reset`
**CLI:** `hoody daemon programs reset`

---

#### `restart` — Restart a program or port instance

```typescript
client.daemon.programs.restart(id: number, data: DaemonProgramsRestartRequest, options?: { idempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `idempotencyKey` | `string` | header `Idempotency-Key` | No | 1 to 255 printable ASCII characters. After the request passes validation the daemon holds the key, bound to this program and body, before it restarts anything. The same key with the same program and body answers the receipt as it stands (200) and never restarts again, while the program exists; the same key with another program or body is refused (422). Receipts are kept for 24 hours, until the daemon restarts. Without a key the restart still runs, but a retry cannot be told apart from a new restart. |

**Body:** `{ port: int, all: bool, wait: bool=true, timeout: int=30 }`

- `port` — The instance to restart, for a port-range program. Refused for a standard program.
- `all` — For a port-range program: restart every instance that is starting or running now. Give `port` or `all: true`, not both.
- `timeout` — How long each start may wait to see its process running, in seconds: 1 to 300, default 30. For a new restart of an existing program, 0 or a value above 300 is refused with 400 `INVALID_REQUEST` (`timeout must be 1 to 300 seconds`).

**HTTP:** `POST /api/v1/daemon/programs/{id}/restart`

---

#### `start` — Start a program or port instance

```typescript
client.daemon.programs.start(id: number, data: DaemonProgramsStartRequest)
```

**Body:** `{ port: int, wait: bool=false, timeout: int=30, if_not_running: bool=false }`

- `port` — Port number to start (required for port-range programs)

**HTTP:** `POST /api/v1/daemon/programs/{id}/start`
**CLI:** `hoody daemon programs start <id>`

---

#### `stop` — Stop a program or port instance

```typescript
client.daemon.programs.stop(id: number, data: DaemonProgramsStopRequest)
```

**Body:** `{ port: int, all: bool }`

**HTTP:** `POST /api/v1/daemon/programs/{id}/stop`
**CLI:** `hoody daemon programs stop <id>`

---

#### `streamLogs` — Follow program logs (SSE)

```typescript
client.daemon.programs.streamLogs(id: number, options?: { type?: "stdout" | "stderr"; lines?: number; port?: number; offset?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `number` | path | Yes | Program ID |
| `type` | `"stdout" \| "stderr"` | query | No | Log stream: stdout or stderr |
| `lines` | `number` | query | No | Number of complete lines replayed from the end of the file before following (default 100). `0` replays nothing and only follows; values above 10000 are clamped to 10000. The replay is found in the last 10 MiB of the file. Ignored when resuming with `offset` or `Last-Event-ID`. |
| `port` | `number` | query | No | Port number (required for port-range programs) |
| `offset` | `number` | query | No | Resume cursor: the `id` of the last `line` event received (a byte offset just past that line). Streaming restarts at the next line and no backlog is replayed. An offset beyond the end of the current file means it was truncated or replaced since: the stream sends a `reset` event and starts from the top of the file. The cursor is a byte position, not a file identity, so a file replaced by one at least as long is not detected across a reconnect. Takes precedence over `Last-Event-ID`. |

**Returns:** `Promise<IEventStream<{ CacheControl?: string; }>>`  |  **HTTP:** `GET /api/v1/daemon/programs/{id}/logs/stream`
**CLI:** `hoody daemon programs logs stream <id>`

---

#### `update` — Edit a program

```typescript
client.daemon.programs.update(id: number, data: DaemonProgramsUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DaemonProgramsUpdateRequest` | body | Yes | Shape: `ProgramUpdate` under Body schemas. |

**HTTP:** `POST /api/v1/daemon/programs/edit/{id}`
**CLI:** `hoody daemon programs update <id>`

---

#### `getTerminalId` — The terminal id of a daemon program (`terminal_id`), read from the computer's daemon (the one this service talks to).

```typescript
client.daemon.programs.getTerminalId(program: DaemonProgramRef)
```

**Returns:** `Promise<number>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `connectTerminal` — Connect to a daemon program's terminal: the program's screen, its input, its size.

```typescript
client.daemon.programs.connectTerminal(program: DaemonProgramRef, options?: ProgramTerminalConnectOptions)
```

**Returns:** `Promise<ProgramTerminalConnection>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

### `client.daemon.ephemeralPrograms` (5) — Ephemeral programs - Create temporary programs that auto-cleanup when stopped or on reboot

#### `getLogs` — Get ephemeral program logs

```typescript
client.daemon.ephemeralPrograms.getLogs(id: string, options?: { type?: "stdout" | "stderr"; lines?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Ephemeral program temporary ID |
| `type` | `"stdout" \| "stderr"` | query | No | Log stream: stdout or stderr |
| `lines` | `number` | query | No | Number of lines to return from the end of the file (default 100). A non-negative integer: `0` returns empty content, and the server clamps values above 10000 to 10000. |

**HTTP:** `GET /api/v1/daemon/quick-start/{id}/logs`
**CLI:** `hoody daemon ephemeralprograms logs get <id>`

---

#### `getStatus` — Get ephemeral program status

```typescript
client.daemon.ephemeralPrograms.getStatus(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Temporary ID of the ephemeral program, as returned in `temporary_id` (`quick_<unix-ms>_<sequence>`). |

**HTTP:** `GET /api/v1/daemon/quick-start/{id}/status`
**CLI:** `hoody daemon ephemeralprograms status <id>`

---

#### `list` — List all ephemeral programs

```typescript
client.daemon.ephemeralPrograms.list()
```

**HTTP:** `GET /api/v1/daemon/quick-start`
**CLI:** `hoody daemon ephemeralprograms list`

---

#### `start` — Launch ephemeral CUSTOM program

```typescript
client.daemon.ephemeralPrograms.start(data: DaemonEphemeralProgramsStartRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `DaemonEphemeralProgramsStartRequest` | body | Yes | Shape: `EphemeralProgramInput` under Body schemas. |

**HTTP:** `POST /api/v1/daemon/quick-start`
**CLI:** `hoody daemon ephemeralprograms start --command <command> --user <user>`

---

#### `stop` — Stop ephemeral program

```typescript
client.daemon.ephemeralPrograms.stop(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Temporary ID of the ephemeral program, as returned in `temporary_id` (`quick_<unix-ms>_<sequence>`). |

**HTTP:** `POST /api/v1/daemon/quick-start/{id}/stop`
**CLI:** `hoody daemon ephemeralprograms stop <id>`

---

### `client.daemon.kit` (1) — Service health check endpoint - returns the standardized health response for monitoring and readiness probes

#### `getHealth` — Service health check

```typescript
client.daemon.kit.getHealth()
```

**HTTP:** `GET /api/v1/daemon/health`
**CLI:** `hoody daemon health`


### Body schemas

- `ProgramInput` — `{ id: int, name*: string, description: string, command*: string, user*: string, enabled: bool=true, boot: bool=false, delay_seconds: int=0, autorestart: "true" | "false" | "unexpected" | bool="unexpected", directory: string, priority: int=999, stdout_logfile: string, stderr_logfile: string, logs_enabled: bool=true, log_max_bytes: int=5242880, log_backups: int=2, environment: { [key: string]: string }, hoody_kit: bool=false, inject_computer_env: bool, boot_if_exists: string, port_range: { start*: int, end*: int }, port_param: string, lazy_load: bool=false, ready_port: int|null, stop_wait_seconds: int, display: string|null | int, terminal_id: int, terminal_shell: string|null, terminal_interactive: bool|null, webhooks: { enabled*: bool, urls*: string[], events: string | string[], headers: object, timeout: int, retry: int }|null, sandbox: SandboxConfig|null }`
- `ProgramUpdate` — `{ id: int|null, name: string|null, description: string|null, command: string|null, user: string|null, enabled: bool|null, boot: bool|null, delay_seconds: int|null, autorestart: "true" | "false" | "unexpected" | bool|null, directory: string|null, priority: int|null, stdout_logfile: string|null, stderr_logfile: string|null, logs_enabled: bool|null, log_max_bytes: int|null, log_backups: int|null, environment: { [key: string]: string }|null, hoody_kit: bool, inject_computer_env: bool|null, boot_if_exists: string, port_range: { start*: int, end*: int }|null, port_param: string|null, lazy_load: bool|null, ready_port: int|null, stop_wait_seconds: int, display: string|null | int, terminal_id: int|null, terminal_shell: string|null, terminal_interactive: bool|null, webhooks: { enabled*: bool, urls*: string[], events: string|null | string[], headers: object|null, timeout: int|null, retry: int|null }|null, sandbox: SandboxConfig|null }`
- `EphemeralProgramInput` — `{ command*: string, user*: string, name: string, autorestart: "true" | "false" | "unexpected" | bool="false", directory: string, environment: { [key: string]: string }, inject_computer_env: bool, priority: int=999, delay_seconds: int=0, stdout_logfile: string, stderr_logfile: string, logs_enabled: bool=true, log_max_bytes: int=5242880, log_backups: int=2, ttl: int, wait: bool=false, timeout: int=30, display: string|null | int, terminal_id: int, terminal_shell: string|null, terminal_interactive: bool|null }`
- `SandboxConfig` — `{ filesystem: SandboxFilesystem|null, network: SandboxNetwork|null, process: SandboxProcess|null }`
  - … Consequences that callers must expect: the reported pid belongs to the sandbox around the program, not to the program itself; a signal death is reported as exit code `128+n` rather than as a signal; and any edit that changes the RESOLVED policy replaces the loaded definition, stopping the …
- `SandboxFilesystem` — `{ read_only_root: bool|null=false, writable: string[]|null, hidden: string[]|null }`
  - … Independently of these fields, every sandboxed program sees an empty `/run/user` in place of the real one, so it cannot reach its account's per-user service manager or session bus; a sandboxed program whose `directory` is under `/run/user` is rejected with 400. Unknown keys are rejected with 400. …
  - `read_only_root` — Make the whole filesystem read-only for the program. … `/sys` is read-only for every sandboxed program regardless of this flag, so the program cannot raise its own resource limits.
  - `writable` — … Each must already exist and is canonicalized. `read_only_root` must be true: `writable` on its own is a 400, not a restriction. … `/hoody` and `/hoody/storage` are therefore refused because they contain the daemon's own tree; `/hoody/storage/apps/<name>` is accepted. At launch each path is canonicalized and its identity (device and inode) recorded, then checked again immediately before the sandbox starts; a path that changed identity, or is no longer a directory, is refused, and what is mounted writable is that approved directory itself. …
- `SandboxNetwork` — `{ mode: "full" | "restricted" | "none"|null="full", bind_ports: (int | string)[]|null, connect_ports: (int | string)[]|null, ingress_allow_from: string[]|null, ingress_allow_platform: bool|null=true, ingress_rate_limit: string|null, udp: "allow" | "deny"|null="allow" }`
  - Network confinement. … Unknown keys are rejected with 400. …
- `SandboxProcess` — `{ max_memory: string|null, max_pids: int|null, max_open_files: int|null, max_cpu: string|null, max_file_size: string|null, tmp_size: string|null, private_tmp: bool|null=false }`
  - Process limits, applied three ways: `max_memory`, `max_pids` and `max_cpu` to the program and everything it starts, taken together (each is read back before the program runs; a limit that did not land refuses the launch); `max_open_files` and `max_file_size` per process, set just before the program starts; and `private_tmp` and `tmp_size` as the program's own temporary directories. The program sees `/sys` read-only and cannot raise these limits. Unknown keys are rejected with 400. …
  - `max_memory` — Memory ceiling, from 16M to 64G, written as `<n>[KMG]` in binary units or as a plain decimal byte count in the same range. … It covers the program and everything it starts, and swap is not allowed, so the limit cannot be passed by swapping. …
  - `max_pids` — Maximum number of processes and threads, from 4 to 65536. The sandbox itself uses 2 of them, so budget at least 2 above the program's own process and thread count.
  - `max_cpu` — … Before the program runs, the applied ceiling is read back and the launch is refused if there is none or it is more than 1 % away from the request. …
  - `tmp_size` — Size of EACH of the program's private `/tmp` and `/var/tmp`, from 1M to 64G, in the size grammar of `max_memory`. Requires `private_tmp: true`; on its own it is a 400. … Needs sandbox runtime support (`/health` reports `bwrap_tmpfs_size`); without it the launch is refused.
  - `private_tmp` — … Rejected with 400 when a `filesystem.writable` entry equals, contains or is contained by `/tmp` or `/var/tmp`: the private mounts are applied first, so a writable bind over them would expose the computer's shared directory. Also rejected when the program's `directory` lies strictly below `/tmp` or `/var/tmp`, or when the daemon itself is installed below either: the private mounts would hide them and the launch could not reach the program. …

