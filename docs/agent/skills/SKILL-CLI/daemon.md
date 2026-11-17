> _**CLI skill · `daemon` namespace** · ~10,741 tokens · hoody-sdk v1.0.1_

# `daemon` — supervisord program lifecycle (start any program; logs kept)

## Purpose

**Default for "start a program" / "spawn a process"** when you don't need an interactive shell or a TUI. REST over `supervisord` — every process is supervised, auto-restart-eligible, log-captured by default (stdout + stderr written under `/hoody/storage/hoody-daemon/logs/<name>/stdout.log` and `/hoody/storage/hoody-daemon/logs/<name>/stderr.log` — one directory per program name; registered programs use symlinks to timestamped log sessions, while quick-start programs write these files directly), and inspectable after the fact. Those are the default paths: a program can set its own log files or turn logging off. Log files rotate by size. When an apply changes a registered program's configuration, its old timestamped default log sessions older than the retention period (30 days by default) are deleted; the active session is kept, and custom log files are not covered by that cleanup. Log FILES outlive the process on disk, but the ephemeral tracking entry is normally dropped 10 minutes after the program finishes or is stopped (it stays longer while a failed withdrawal from supervisord is still being retried) — after that `hoody daemon ephemeralprograms logs get` 404s (see Quirks); read the logs within those 10 minutes, or read the on-disk files directly (e.g. via the `files` namespace). `hoody daemon programs logs get` covers configured (non-ephemeral) programs.

Two flavours:

- **Quick-start (ephemeral, not added to the program list)** — `hoody daemon ephemeralprograms start --command <command> --user <user> [--ttl <ttl>] [--wait] [--timeout <timeout>]`. Returns `temporary_id = quick_<ts>_<seq>`. Best for one-offs and short-lived jobs (build steps, batch transforms, "run this once and tell me the output"). It adds no durable program entry, but it does write a temporary supervisord configuration and records the program in the kit's ephemeral tracking file so the cleanup pass can find it. The log files stay on disk, but `hoody daemon ephemeralprograms logs get` works only while the tracking entry exists. The cleanup pass (every 30 s) finalizes a program that is `stopped` or `fatal`, or `exited` with autorestart turned off; under `autorestart: "unexpected"` an `exited` program is finalized when its exit code is known to be 0, and is kept while its exit code is unknown. A finalized program's result and logs stay readable for 10 minutes; then the pass drops the entry and the logs route 404s (an entry whose withdrawal from supervisord failed is kept until a later pass completes it). Stopping a program that already finished does not extend that window. Optional `ttl` auto-stops after N seconds. A quick-start defaults to `autorestart: "false"` and runs once, even when the command fails; set `autorestart: "unexpected"` to restart it after a nonzero exit once it has run past the startup window (`delay_seconds`, 1 second when 0); a nonzero exit inside that window is a failed start, retried a limited number of times and then `fatal`.
- **Registered program (durable, persists across kit restarts)** — `hoody daemon programs create --name <name> --command <command> --user <user> --enabled [--boot] --autorestart unexpected ...` → `hoody daemon programs start <id>`, then poll `hoody daemon programs status`. Use this when the process should come back after a computer restart, when you want auto-restart on crash, or when you need port-range fan-out / lazy-load on first proxy hit.

## When to use

- "Run this command and keep the logs" → `hoody daemon ephemeralprograms start`.
- "Run this server / agent / script as a long-running supervised process, restart on failure" → `hoody daemon programs create` + `hoody daemon programs start`.
- Background workers, port-range fan-out, lazy-loaded HTTP services, supervisord-event webhooks.

## When NOT to use

- **Traditional system services that ship native systemd units** (apache2, nginx, postgresql, mysql, redis, mosquitto, sshd, postfix, …) — leave them on `systemd`. Hoody computers are full Linux boxes with systemd + root (they behave like VMs, not Docker), so the standard `apt install nginx && systemctl enable --now nginx` flow Just Works and benefits from the upstream unit's hardening (drop-in directories, sd_notify, journal integration, etc.). Mixing systemd-managed and `daemon`-managed processes in the same computer is fine — pick whichever fits the program.
- Need an interactive TTY (Claude Code, Codex, htop, vim, anything that paints the screen) → a one-off or hand-driven session is `terminal` with a **pinned non-ephemeral `terminal_id`**; a program that must be supervised (auto-restart, start at boot) is a `daemon` program with `terminal_id`, which runs on that terminal's PTY. Without `terminal_id` a daemon program has no TTY. A program with `terminal_id` cannot also have an effective sandbox.
- Watch or type into a daemon program's terminal → `hoody --computer "$C" daemon programs terminal connect "$PROGRAM"`, where `$PROGRAM` holds the program's id or exact name (add `--name` when the name is only digits; Ctrl-] detaches and leaves the program running; `--read-only` watches only). Snapshot, press, paste, write and wait drive it over REST without a WebSocket. Execute and session create on that id answer `409 DAEMON_TERMINAL`; a stopped program answers `409 DAEMON_PROGRAM_NOT_RUNNING` and closes a WebSocket with `4404`.
- After starting a program with `terminal_id`, attach to its terminal or use the terminal's REST automation at least once. Until something connects, its output waits in the terminal up to about 19 KB, and a program that writes more blocks and can stall. Once connected, hoody-terminal stays connected until the program ends or the terminal session is deleted.
- Need to pipe input mid-run / send keystrokes → `terminal` (`hoody terminal sessions keys press`, `hoody terminal sessions paste`).
- One-shot synchronous request/response → `exec` (HTTP handler, returns body).
- Schedule (cron syntax) → `cron`. Access logs → `proxyLogs`. File-system events → `watch`.

### When to prefer `daemon` over `systemd`

- Custom scripts and binaries you wrote that don't have a packaged unit.
- Quick experiments where you want REST-driven start/stop/log without writing a unit file.
- Port-range fan-out (`port_range` + `port_param` + `lazy_load`) — supervisord-side feature, not a systemd one.
- Programs you want to provision / mutate / remove via the Hoody API (CI scripts, multi-tenant computer fleets) — `hoody daemon programs create` is one HTTP call.

### When to prefer `systemd` over `daemon`

- Any service whose Debian/Ubuntu package already drops a working unit in `/lib/systemd/system/` (most server software).
- You want `journalctl -u <service>`, `systemctl status`, drop-in overrides, socket-activated services, timers (cron-equivalent), or any other systemd feature.
- The program is part of the computer's "default-on" baseline (boots with the computer, never managed externally).

## Prerequisites

- `/dev/hoody` and `/hoody` exist; without them the daemon exits without serving.
- The log directory `/hoody/storage/hoody-daemon/logs/` need not exist at startup. When logging is enabled (not `logs_enabled: false`), the daemon creates the default or custom log directories a program needs before it publishes that program's configuration. If creating one fails, the add, edit, enable, start or quick-start fails with `the log directory <dir> could not be created: <reason>` and nothing is published; for example, a missing directory is refused when an existing directory above it under the log root is not owned by root or is group- or world-writable. A log directory that already exists in full is used as it is, so create the full path yourself.
- `user` = real system account.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Register and boot

- `hoody daemon programs create` (`--name`/`--command`/`--user`; `--enabled`, `--boot`; opt `--cwd`/`--env`/`--autorestart`/`--priority`/`--stdout-logfile`/`--stderr-logfile`) -> `hoody daemon programs start <id>`, then poll `hoody daemon programs status` (`<id> --include-stats true`) until `status.status` is `running` (`--wait` blocks the request and easily exceeds 30 s on a cold kit; see Example 1); `hoody daemon programs logs get` on failure.

### 2. Ephemeral with TTL

- `hoody daemon ephemeralprograms start` (`command`/`user`, opt `ttl?`/`wait?`/`timeout?`) returns `temporary_id` = `quick_<ts>_<seq>`. Poll/tail with `hoody daemon ephemeralprograms status`/`hoody daemon ephemeralprograms logs get`; `hoody daemon ephemeralprograms stop` to terminate.

### 3. Lazy port-range fleet

- `hoody daemon programs create` + `port_range: { start, end }`, `port_param`, `lazy_load: true`, `enabled: true`. `hoody daemon programs list --port 8042 --include-status true`. `hoody daemon programs start <id> --port 8042`; `hoody daemon programs stop <id> --port <port>` or `--all`.

### 4. Reach a service you just started

Any computer port is publicly addressable as soon as the listener is up — no proxy alias, firewall edit, or extra registration needed:

- HTTP service on `:8080` → `https://{projectId}-{computerId}-http-8080.{node}.computers.hoody.com`
- HTTPS service on `:8443` → `https://{projectId}-{computerId}-https-8443.{node}.computers.hoody.com`

Edge is always `https://`; the slug only describes the inner protocol. Gate access via `hoody computers proxy permissions *` and `hoody computers proxy groups *` if it shouldn't be public. See § Proxy URLs.

### 5. Update / wipe

`hoody daemon programs update` (partial: an omitted field keeps its stored value, but `environment`, `sandbox`, `port_range` and `webhooks.enabled`+`webhooks.urls` are replaced whole when sent; see Quirks); `hoody daemon programs disable`/`hoody daemon programs enable`; `hoody daemon programs delete`; `hoody daemon programs reset` -> `programs.default.json`.

## Quirks & gotchas

- Boolean query params (`hoody_kit`, `lazy_load`, `enabled`, `boot`, `include_status`, `include_stats`) STRICT: only `true`/`false`, in any letter case; `1`/`yes`/`0`/`""` -> 400. Send lowercase, which is what the SDK's typed values are.
- Webhook URLs are validated only in an enabled block: `webhooks.enabled: false` skips every URL, event, header, timeout and retry check (the block must still carry `enabled` and `urls`). In an enabled block, URLs are HTTPS-only and must point to public destinations. Userinfo is rejected, and so is an authority the kit refuses as a destination, in any spelling of the address. A DNS name is not resolved when the block is saved; at delivery time, addresses the kit refuses are dropped from its resolution and delivery fails when none remains. Delivery never follows redirects and ignores the environment's HTTP proxy settings.
- A `webhooks` edit must send `enabled` AND `urls` (a block without `urls` is a 400, `missing field urls`) and replaces both; `events`, `headers`, `timeout` and `retry` keep their stored values when omitted. An enabled block with an empty `urls` is a 400. Callbacks are delivered only when the deployment enables event delivery for the kit; the block is validated and stored either way.
- Duplicate names + overlapping port ranges rejected on create AND on an update that renames the program or moves its port range (adjacent OK); an unrelated update does not re-check them, so an existing duplicate or overlap is left as it is; `port_param` requires `port_range`.
- `command` no newlines/CR/NUL; `user` `(?i)[a-z_][a-z0-9_-]*\$?` (case-insensitive) via `id`; `*_logfile` must resolve under `/hoody/storage/hoody-daemon/logs/`.
- `hoody daemon programs start` on `port_range` REQUIRES `--port <port>`; `hoody daemon programs stop <id> --port <port>` or `--all`.
- `hoody daemon ephemeralprograms start` returns `temporary_id` = `quick_<unix-ms>_<seq>` (e.g. `quick_1700000000000_1`); pass it unchanged to `hoody daemon ephemeralprograms status`, `hoody daemon ephemeralprograms logs get` and `hoody daemon ephemeralprograms stop` (the CLI also takes the quick-start's exact `name` and looks its `temporary_id` up, unless the name matches `^quick_[a-zA-Z0-9_]+$`, which it sends as an id: for such a name pass the `temporary_id`). TTL polled ~10 s.
- Over HTTP and in the generated SDK methods a program is addressed by its integer `id` from `hoody daemon programs list`, never by its name. An HTTP path value that is not an integer is refused with 404 before the daemon looks anything up; the SDK rejects a non-integer `id` with a `ValidationError` before sending a request. A numeric name in the id slot is read as an id, not looked up by name. To find the id of a named program, filter the list by name (`hoody --computer "$C" daemon programs list --name web -o json` for a program named `web`). The CLI also takes a name: a value that is not all digits is looked up by exact name and replaced by that program's id; no match or several matches exits 1.
- Default ephemeral log paths are `/hoody/storage/hoody-daemon/logs/<name>/stdout.log` and `/hoody/storage/hoody-daemon/logs/<name>/stderr.log` (one directory per program), NOT `<name>.out.log`/`<name>.err.log`.
- After `hoody daemon ephemeralprograms stop`, the program's result and logs stay readable for 10 minutes from when it finished (stopping a program that had already finished keeps its result and does not renew that window); then its tracking entry is dropped (later, if the withdrawal is still being retried) and `hoody daemon ephemeralprograms logs get` returns `404`, while the on-disk log files persist. If withdrawing the program's supervisord group fails, the stop still reports success, with `cleaned_up: false`, and the next cleanup pass retries the withdrawal. Read `hoody daemon ephemeralprograms logs get` within those 10 minutes, or fetch the on-disk file directly.
- `hoody daemon programs start` accepts `if_not_running: true` for an idempotent boot — early-returns with `already_running: true` if the program is already running and, when the program declares a `ready_port` (a standard program or a port-range instance), that port accepts connections; otherwise, including a running program whose `ready_port` is not serving, it takes the start path, and polls for readiness only with `wait: true` (port-range responses include an `instance` block with the instance's status, but a newly dispatched start leaves out its pid — only the already-running shortcut returns an observed pid; standard programs omit the `instance` field entirely. Read the pid from `hoody daemon programs status <id> --port <port>`). Use it for "ensure started" workflows.
- **`environment` REPLACES the whole map** on `hoody daemon programs update` (not per-key merge). If the existing env is `{A:"1",B:"2"}` and you update with `{environment:{A:"9"}}`, the stored map becomes `{A:"9"}` (values are strings). To preserve secrets, GET the program first and re-send the merged map.
- **`sandbox` is three-state on `hoody daemon programs update`**: absent keeps the stored block, `null` clears it, and an object REPLACES the whole block (no field merge). Sending `{sandbox:{process:{max_pids:64}}}` to a program that also had `filesystem.read_only_root` and `network.mode: restricted` leaves only `max_pids`, and the program runs without the others. Read `hoody daemon programs sandbox get <id>` first (`configured` is the stored block) and resend every restriction you want kept. The CLI does this check for you: a `--sandbox-*` edit that would drop a stored restriction is refused, nothing is sent, and each restriction is listed with the flag that resends it; `--sandbox-replace` sends the edit anyway.
- Quick-start programs cannot be sandboxed: a non-null `sandbox` on `hoody daemon ephemeralprograms start` is a 400 (`sandbox is not supported for quick-start programs`); `null` is accepted as absent.
- An effective sandbox is refused for a `user` that resolves to uid 0 (under any name) and together with `terminal_id`. A block that restricts nothing is stored as absent and does not appear on the program.
- **A sandboxed program fails CLOSED at launch.** If a mechanism its policy needs is missing the program does not start unconfined, it refuses to start at all: Landlock below the network ABI, a `bwrap` or `systemd-run` the computer does not have, or an ingress policy with no `nft`. Expect the program to be down, not unprotected. A launch-stage refusal is printed as `sandbox: <reason>` on the PROGRAM's stderr, not in the daemon log, so read `hoody daemon programs logs get` with `type=stderr`; the daemon log carries the earlier failures instead (validation, rendering, firewall admission, the supervisord apply). A stored block is also re-validated every time the program is rendered, so a block that later breaks a rule refuses the render rather than running the program unconfined.
- A NON-EMPTY `network.ingress_allow_from`, or an `ingress_rate_limit`, needs a listening set: without `bind_ports`, `port_range` or `ready_port` the edit is a 400 (`sandbox.network.ingress_* requires a listening set`). An empty list owes no rules and so needs nothing. They filter IPv4 TCP arriving on `eth0` at those ports only, leave established connections alone, and an empty `ingress_allow_from` restricts nothing rather than denying everyone.
- **Test an ingress allowlist through the program's public service URL, with a new connection.** The chain only matches what arrives on `eth0`, so a direct same-computer connection to the listener never reaches it; a request the computer sends to its own program's public service URL does reach it, arriving from the server's public address, and is filtered. And `ingress_allow_platform` defaults to `true`, which accepts traffic the platform itself sends to the computer ahead of both the meter and the allowlist. A probe from inside the computer proves nothing; test with a new connection from an outside source, or through the program's public service URL. Public traffic the proxy forwards keeps the client's own address and IS filtered. The rate meter runs before the allowlist and stops tracking new sources once its 65535-entry set is full, while the allowlist keeps applying.
- `hoody daemon programs sandbox get <id>` answers with more than the stored block, and none of it certifies a running program: `configured` is what was persisted; `rev` is the 12-hex revision recomputed from the currently valid stored policy, the one the daemon WOULD place on the wrapper command line rather than an observation of the running process, and null when no effective policy validates; `effective` is DIAGNOSTIC argv recomputed from the stored policy, carrying placeholders like `<program argv>` and `<pid>`, never the observed command, and it omits what the wrapper applies from inside itself (Landlock ports, the seccomp network filter, and the open-file and file-size limits); `live` reports the nft table, chain and rules read from the kernel at request time; `firewall` is `none`, `ok`, `draining` or `degraded`, with `problems` listing validation, state, integrity and unresolved-install failures. Read `problems` before concluding a restriction is in force.
- **`restricted` is a PORT policy, not a destination policy.** `full` restricts neither bind nor connect. `restricted` limits which TCP ports the program may bind and connect to, at every destination including loopback: it cannot allow one host and deny another, and it does not touch UDP or ICMP, because Landlock has no hook for them (raw sockets are already closed: every effective sandbox drops all capabilities). To refuse IPv4 and IPv6 datagram sockets (UDP, UDP-Lite, ICMP ping), set `network.udp: "deny"`: it works in every mode and is effective on its own, answers `EACCES`, also refuses SCTP and RxRPC sockets and disables io_uring (`ENOSYS`), and does not cover a socket handed in from outside the sandbox. A 32-bit program that creates sockets through `socketcall` then gets none, TCP and unix included. With `udp: "deny"` in `full` or `restricted` mode, the daemon makes glibc ask its name servers over TCP (`options use-vc`); combined with `restricted`, add the resolvers' TCP port 53 to `connect_ports`. musl, or a resolver that ignores `resolv.conf` options, needs its own TCP DNS configuration. Without `udp: "deny"`, the daemon does not add `options use-vc`; DNS transport depends on the resolver's configuration. It also governs the `bind` and `connect` CALLS, not a socket that starts listening without an explicit bind, and a listener obtained that way is outside the ingress rules too. `none` is different in kind: it unshares the network namespace, so it removes IP networking of every protocol. Network mode alone does not block filesystem Unix sockets: under every mode, `none` included, they are governed by filesystem restrictions and file permissions rather than by this field. Every effective sandbox also masks `/run/user` with an empty directory, so sockets beneath it (the user manager, the session bus, agent sockets) are unreachable.
- Ports are numbers or inclusive `"a-b"` strings. An omitted `bind_ports` defaults to the union of `port_range` and `ready_port`, and an explicit list has to cover both. `restricted` needs a non-empty resolved bind set, and an omitted or empty `connect_ports` denies outbound TCP entirely; a non-empty `connect_ports` requires `restricted`. `none` refuses declared listeners, a non-null explicit `bind_ports` (`[]` included), a non-empty connect or allow list, and a configured rate limit. Empty lists and either value of `ingress_allow_platform` are accepted and inert.
- **The filesystem side is confinement, not a private computer.** An effective sandbox drops all capabilities and unshares the user, PID and IPC namespaces, but the program keeps its account's supplementary groups and still sees the computer's filesystem subject to ordinary permissions. `read_only_root` stops writes, not reads, and `/dev` and `/proc` are mounted over it. Private `/tmp` and `/var/tmp` are added only with `process.private_tmp: true`, which defaults to false: otherwise the program shares the computer's temporary directories. `hidden` is not a secrecy boundary against an actor who can rename a validated directory or one of its ancestors: writable sources are pinned by descriptor at launch, but mount destinations are still resolved by pathname.
- Process limits have fixed domains and are rejected outside them: `max_memory` from `16M` to `64G` (decimal bytes, or uppercase binary `K`/`M`/`G`, with scope swap disabled), `max_pids` from 4 to 65536 counting threads and two wrapper helpers, `max_open_files` from 8 to 1048576 applied as both the soft and the hard limit. `max_cpu` (`"<n>%"`, whole numbers from `1%` to `102400%`, `100%` = one CPU), `max_file_size` (a per-file size limit, `1K` to `1024G`) and `tmp_size` (the size of each private tmpfs, `1M` to `64G`, only with `private_tmp: true`) are accepted too; a daemon built before they were added refuses them as unknown fields. There is no aggregate disk quota.
- **A stored sandbox is not proof that one is installed.** An add or edit can persist the new block and still fail to apply it; the response says so, and the earlier process may keep running unconfined when its stop cannot be confirmed. Treat a failed write as unresolved, read `problems`, fix the cause and reapply, rather than assuming either the old or the new policy is in force.
- The ingress table `ip hoody_daemon` is rebuilt from desired state, not continuously enforced. Flushing or weakening it out of band can leave running programs unprotected: status turns `degraded`, launches that reach the wrapper before repair refuse, nothing repairs the table on a timer, and nothing stops what is already running. A successful firewall transaction or reconcile can rebuild it. Admission during `hoody daemon programs start` (the proxy's lazy-load start included), `hoody daemon programs enable`, or an update that leaves the program enabled also checks an identical active ingress policy and recommits the stored rules when the live table differs; repair can still fail. Restore it and check `live` plus `firewall` after any out-of-band change.
- Ingress rules are attached to a destination PORT on `eth0`, not to a process. Another listener on that same port at a different local address gets the same filtering, and the ownership check only knows about ports other programs have DECLARED, so an undeclared listener is neither protected from this nor protected against it.
- **A policy change restarts the program.** The revision is part of the supervisord command line, so changing the resolved policy replaces the definition and stops the running instance; whether another starts is decided by `boot` and `lazy_load`, not by the edit. The old revision's ingress rules and port reservations can linger as `draining` after the call returns, so for a short window traffic meets both policies and the port is not yet free to reuse.
- Webhook delivery needs per-program `webhooks.enabled: true` AND a deployment that enables event delivery for the kit. No request turns event delivery on, so a program whose `webhooks.enabled` is `true` can still receive no callbacks; a saved `webhooks` block is not proof that any will arrive.
- `port_range` is an object `{ start, end }`; the CLI flags `--port-range-start` and `--port-range-end` build it.

## Common errors

- 400 webhook (enabled blocks only): `must use HTTPS protocol`, `must not contain userinfo`, and a refusal naming a destination that is not public.
- 400 `is already in use by ID` (duplicate name) / `overlaps with program` (port range) / `port_param requires port_range`.
- 400 (`success: false`) `Port parameter required for port-range programs` -> resend with a `port` from the program's range, via `--port`. 400 (`success: false`) `Program with ID {id} is disabled` -> `hoody daemon programs enable` first.
- 403 `forbidden` — Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only.
- 1 MB request body limit.

## Related namespaces

`exec` sync. `cron` scheduled. `proxyLogs` access log. `terminal` TTY. `display` virtual display.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `hoody computers get` first. The kit returns numeric `program.id` (not a UUID) — capture it from the `hoody daemon programs create` response.

### 1. Register a long-running supervised program with auto-boot

**Goal:** add a tick-emitting worker that supervisord keeps alive across kit restarts, then start it without blocking the caller.

**Step 1 — add (`enabled: true`, `boot: true`).** Capture `program.id`. Use `user: "user"` (uid 1000); the daemon's `command` allows shell metachars but you must own the quoting — single-quote the outer payload to avoid double-escaping.

```bash
ID=$(hoody --computer "$C" daemon programs create \
  --name examples-daemon-tick \
  --command 'sh -c '\''while :; do echo tick $(date -u +%%s); sleep 5; done'\''' \
  --user user --enabled --boot --autorestart unexpected \
  -o json | jq -r '.program.id')
```

**Step 2 — `hoody daemon programs start` with `wait: false`.** Warning: `wait: true` blocks the HTTP request until the process is running and easily exceeds 30 s on a cold kit (with the SDK's default 30 s client timeout, `wait:true,timeout:30` can time out on the client). Pass `wait: false` and poll `hoody daemon programs status` instead.

```bash
hoody --computer "$C" daemon programs start "$ID"
while [ "$(hoody --computer "$C" daemon programs status "$ID" -o json | jq -r .status.status)" != "running" ]; do sleep 1; done
```

### 2. Quick-start ephemeral with TTL — launch, check status, tail logs

**Goal:** fire a one-shot command (no durable program entry), let it run up to 10 minutes, retrieve its output. `hoody daemon ephemeralprograms start` returns `temporary_id = "quick_<unix-ms>_<seq>"` (e.g. `quick_1700000000000_1`); every later call takes that id unchanged (or, in the CLI, the exact `name` you gave, unless it matches `^quick_[a-zA-Z0-9_]+$`: then use the `temporary_id`). Truncating it to `quick_<ms>` returns 404.

**Step 1 — launch.**

```bash
QID=$(hoody --computer "$C" daemon ephemeralprograms start \
  --name examples-daemon-qs --user user --ttl 600 \
  --command 'sh -c "for qs_n in $(seq 1 30); do echo qs-$qs_n; sleep 1; done"' \
  -o json | jq -r .temporary_id)
```

**Step 2 — check status.**

```bash
hoody --computer "$C" daemon ephemeralprograms status "$QID" -o json
```

**Step 3 — tail logs.**

```bash
hoody --computer "$C" daemon ephemeralprograms logs get "$QID" --type stdout --lines 10
```

**Step 4 — stop.** Read the logs within 10 minutes of the stop (of the finish, for a program that had already finished: the stop does not renew the window): after that the tracking entry is normally dropped and `hoody daemon ephemeralprograms logs get` returns 404 (the on-disk log files stay; a failed withdrawal delays the drop).

```bash
hoody --computer "$C" daemon ephemeralprograms stop "$QID"
```

### 3. Lazy port-range fan-out — one program, N port-bound instances

**Goal:** declare an HTTP service that listens on any port in `18800–18802`, materialised on demand the first time someone hits the proxy URL.

**Step 1 — add with `port_range` + `port_param` + `lazy_load`.** Warning: `port_param` cannot be empty (the kit returns `400 Invalid port_param format: ""`). Use a real CLI flag, e.g. `--port`. At start-time the kit appends `<flag>=<port>` — **equals-joined**, one instance per port in the range — so the program must accept the `--flag=value` form. The append is skipped when the command text already contains ` -p` or ` --port` followed by a value (separated by whitespace or `=`), whatever `port_param` names, so keep fixed port arguments out of the command. `python3 -m http.server` does NOT (its port is positional and `--port` is an unrecognised argument), so the example wraps it in a one-line `sh -c` that turns the appended flag back into the positional port.

```bash
ID=$(hoody --computer "$C" daemon programs create \
  --name examples-daemon-fanout --command 'sh -c "exec python3 -m http.server ${1##*=}" sh' \
  --user user --enabled \
  --port-range-start 18800 --port-range-end 18802 \
  --port-param=--port --lazy-load \
  -o json | jq -r .program.id)
```

**Step 2 — start one specific port and read fleet-wide status.** `hoody daemon programs list --port 18800 --include-status` returns the program with a `status: { type: "port-range", running_instances, total_instances, instances: [{ port, status, … }] }` block.

```bash
hoody --computer "$C" daemon programs start "$ID" --port 18800
hoody --computer "$C" daemon programs list --port 18800 --include-status true -o json \
  | jq '.programs[].status'
```

The instance is reachable at `https://${P}-${C}-http-18800.${N}.computers.hoody.com` — no extra alias needed (see § "Reach a service you just started").

### 4. Tail program logs (`hoody daemon programs logs get` with type / lines)

**Goal:** investigate why a worker keeps restarting. `hoody daemon programs logs get` returns `{ logs, type, lines, log_file }`. Read the returned `log_file` for the actual on-disk path: the default is `/hoody/storage/hoody-daemon/logs/<name>/{stdout,stderr}.log`, a port-range instance defaults to `/hoody/storage/hoody-daemon/logs/<name>/{stdout,stderr}_<port>.log`, and a configured custom log path is used as given, except for a port-range instance, which inserts `_<port>` before every `.log` in the path, and `log_file` names that same file. A custom path with no `.log` is used as given, so every instance of the range writes that one file: give a port-range program a custom path that ends in `.log` to keep its instances apart.

```bash
hoody --computer "$C" daemon programs logs get "$ID" --type stderr --lines 200
```

For a port-range program, select the instance when reading logs: add `--port 18800`.

### 5. Webhook on supervisord process events (e.g. crash → HTTPS callback)

**Goal:** when the program enters the `FATAL` state, POST to your HTTPS endpoint. Warning: When webhooks are enabled, URLs must be **HTTPS**, with no credentials and public destinations only. A disabled configuration skips these checks. Warning: **Event names are kit-specific, not the supervisord canonical `PROCESS_STATE_*` ones**: the kit accepts only `STARTING, RUNNING, BACKOFF, STOPPING, STOPPED, EXITED, FATAL, UNKNOWN, "all", "*"`. Sending `PROCESS_STATE_FATAL` returns `400 Invalid event type`.

```bash
# `programs update` needs only the id; every other flag is optional.
hoody --computer "$C" daemon programs update "$ID" \
  --webhooks-enabled \
  --webhooks-urls https://hooks.example.com/daemon-events \
  --webhooks-events FATAL --webhooks-events BACKOFF \
  --webhooks-headers X-Source=hoody-daemon \
  --webhooks-timeout 10 --webhooks-retry 2
```

Warning: A `webhooks` edit replaces `enabled` and `urls` and must send both: `{ webhooks: { enabled: false } }` on its own is a 400 (`missing field urls`). To turn delivery off, resend the current `urls` with `enabled: false`; to rotate URLs, send the full new `urls` array. `events`, `headers`, `timeout` and `retry` keep their stored values when omitted. `hoody daemon programs update` takes the id plus the fields to change: the CLI needs only the id, but the SDK `programs.update(id, data)` requires `data`, and the HTTP route refuses an empty body.

### 6. Wipe + reset to defaults — non-destructive snapshot first

**Goal:** restore the supervisord program set to whatever ships in `programs.default.json`. Warning: **Destructive** — every program you added gets wiped. Snapshot before you call.

```bash
hoody --computer "$C" daemon programs list -o json > /tmp/daemon-snapshot.json   # CLI list has no --limit
hoody --computer "$C" daemon programs reset -y
```

### 7. Patch only the env vars on a running program

**Goal:** flip `LOG_LEVEL=debug` without restating `command`/`user`/etc. `hoody daemon programs update` is partial on every surface: fields absent from the request body keep their stored values. `environment` itself is replaced whole (see the note below).

> The CLI sends only the flags you pass: `hoody daemon programs update "$ID" --env LOG_LEVEL=debug` transmits `{"environment":{"LOG_LEVEL":"debug"}}` and nothing else, so no stored field is overwritten by a default.

```bash
# environment is replaced whole: pass every variable the program should keep.
hoody --computer "$C" daemon programs update "$ID" \
  --env LOG_LEVEL=debug --env BUILD=examples
hoody --computer "$C" daemon programs stop "$ID"
hoody --computer "$C" daemon programs start "$ID"
```

Warning: `environment` REPLACES the whole map (not per-key merge). If you have `{A:"1",B:"2"}` and update with `{environment:{A:"9"}}`, you end up with just `{A:"9"}` — re-send everything you want to keep.

### 8. Inspect a running program with stats

**Goal:** read CPU/RSS/uptime to feed a dashboard. For a standard program, `hoody daemon programs status <id> --include-stats true` returns `{ success, status: { id, status, pid?, uptime? }, stats? }`: the resource figures are in the separate `stats` object, present only when they could be collected for a running process. A program that is not running (`backoff`, `stopped`, `fatal`, …) has no `pid`, `uptime` or `stats` (a launcher still lingering after a reported final payload exit reports `exited`; any `pid` and `uptime` the supervisor supplied remain, and `stats` is present when requested and collected); supervisord's diagnostic text is never returned as `uptime`. A port-range program answers with `instances` (each carrying its own `stats`) when no `port` is selected, plus `running_count` and `total_count`; with `port` selected it answers with the single `instance` and its `stats` instead.

```bash
hoody --computer "$C" daemon programs status "$ID" --include-stats true
```

Warning: `include_stats` is a **string** boolean (`"true"`/`"false"`) — `1`/`yes`/empty string return `400` (strict-bool query parse, see Quirks).

### 9. Stop one port instance OR every instance in a port-range fleet

**Goal:** kill just port 18800 vs. drain the whole fleet for a deploy.

**Single port** (other ports keep running):

```bash
hoody --computer "$C" daemon programs stop "$ID" --port 18800
```

**Whole fleet** (`all: true`):

```bash
hoody --computer "$C" daemon programs stop "$ID" --all
```

Warning: For a port-range program, a start REQUIRES one port (`--port <n>` on `daemon programs start`, single-port only); there is no "start them all" — boot each port individually or rely on `lazy_load: true` to materialise on first proxy hit.

### 10. Disable now, re-enable after the migration

**Goal:** stop the program while retaining its stored definition for the migration. On success, `hoody daemon programs disable` sets `enabled: false`, stops the program if it is running, and withdraws its supervisord definition. The stored program remains in `hoody daemon programs list`, including its `command` and `environment`. `hoody daemon programs enable` sets `enabled: true` without changing those fields. Enabling installs the supervisord definition immediately for a program with `boot`, `lazy_load`, a `port_range`, or an effective sandbox; a `boot: true` program that is not lazy-loaded can start right away. Follow enable with an ensure-start (`if_not_running: true`), which returns early when the program is running and ready and otherwise takes the start path (readiness polling only with `wait: true`). The examples below are for a standard program. A port-range program must be started once per desired port: `--port 18800` on `daemon programs start`; without a port its start is refused.

```bash
hoody --computer "$C" daemon programs disable "$ID"
hoody --computer "$C" daemon programs enable "$ID"
hoody --computer "$C" daemon programs start "$ID" --if-not-running
```

Warning: Trying `hoody daemon programs start` while `enabled: false` answers 400 with `success: false` and `Program with ID {id} is disabled` (e.g. `Program with ID 7 is disabled`); the SDK throws it as an `ApiError` — call `hoody daemon programs enable` first.

## Reference

### `hoody daemon` (21) — Daemon and ephemeral programs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody daemon ephemeralprograms list` |  | read | List all ephemeral programs | `daemon.ephemeralPrograms.list` | `hoody daemon ephemeralprograms list --watch 2s` |
| `hoody daemon ephemeralprograms logs get` |  | read | Get ephemeral program logs | `daemon.ephemeralPrograms.getLogs` | `hoody daemon ephemeralprograms logs get <id> --type stdout --lines 100` |
| `hoody daemon ephemeralprograms start` |  | write | Launch ephemeral CUSTOM program | `daemon.ephemeralPrograms.start` | `hoody daemon ephemeralprograms start --command 'python my_batch_job.py' --user worker --cwd /opt/app --inject-computer-env` |
| `hoody daemon ephemeralprograms status` |  | read | Get ephemeral program status | `daemon.ephemeralPrograms.getStatus` | `hoody daemon ephemeralprograms status quick_1731605123456_0` |
| `hoody daemon ephemeralprograms stop` |  | write | Stop ephemeral program | `daemon.ephemeralPrograms.stop` | `hoody daemon ephemeralprograms stop quick_1731605123456_0` |
| `hoody daemon health` |  | read | Service health check | `daemon.kit.getHealth` | `hoody daemon health` |
| `hoody daemon programs create` |  | write | Add a new CUSTOM program | `daemon.programs.create` | `hoody daemon programs create --id 100 --name my-app --description 'My Node.js application' --command 'node app.js' --user nodejs` |
| `hoody daemon programs delete` |  | destructive | Remove a program | `daemon.programs.delete` | `hoody daemon programs delete 100 -y` |
| `hoody daemon programs disable` |  | write | Disable a program | `daemon.programs.disable` | `hoody daemon programs disable 100` |
| `hoody daemon programs enable` |  | write | Enable a program | `daemon.programs.enable` | `hoody daemon programs enable 100` |
| `hoody daemon programs get` |  | read | Get a specific program | `daemon.programs.get` | `hoody daemon programs get 100` |
| `hoody daemon programs list` |  | read | List all programs | `daemon.programs.list` | `hoody daemon programs list --hoody-kit true --lazy-load true` |
| `hoody daemon programs logs get` |  | read | Get program logs | `daemon.programs.getLogs` | `hoody daemon programs logs get 100 --type stdout --lines 100` |
| `hoody daemon programs logs stream` |  | read | Follow a program's log live: replays the last --lines complete lines (found in the last 10 MiB of the file), then prints every new line. A reconnect resumes after the last line received (--offset); a log replaced by a longer file while disconnected is not detected | `daemon.programs.streamLogs` | `hoody daemon programs logs stream 100 --type stdout --port 8080` |
| `hoody daemon programs reset` |  | destructive | Reset programs to default | `daemon.programs.reset` | `hoody daemon programs reset -y` |
| `hoody daemon programs sandbox get` |  | read | Show a program's sandbox: the stored block, the policy revision, what it resolves to, and what the firewall is holding | `daemon.programs.getSandbox` | `hoody daemon programs sandbox get 100` |
| `hoody daemon programs start` |  | write | Start a program or port instance | `daemon.programs.start` | `hoody daemon programs start 100 --port 8042 --wait` |
| `hoody daemon programs status` |  | read | Get the status of every program (no id) | `daemon.programs.listStatuses` | `hoody daemon programs status --watch 2s` |
| `hoody daemon programs status` |  | read | Get the status of one program | `daemon.programs.getStatus` | `hoody daemon programs status <id>` |
| `hoody daemon programs stop` |  | write | Stop a program or port instance | `daemon.programs.stop` | `hoody daemon programs stop 100 --port 8042` |
| `hoody daemon programs update` |  | write | Edit a program | `daemon.programs.update` | `hoody daemon programs update 100 --name my-app --description 'My Node.js application'` |

