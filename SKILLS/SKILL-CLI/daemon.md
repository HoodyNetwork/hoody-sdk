> _**CLI skill · `daemon` namespace** · ~9,198 tokens · hoody-sdk v1.0.0-beta.16_

# `daemon` — supervisord program lifecycle (start any program; logs kept)

## Purpose

**Default for "start a program" / "spawn a process"** when you don't need an interactive shell or a TUI. REST over `supervisord` — every process is supervised, auto-restart-eligible, log-captured by default (stdout + stderr written under `/hoody/storage/hoody-daemon/logs/<name>/stdout.log` and `/hoody/storage/hoody-daemon/logs/<name>/stderr.log` — one directory per program, with rotated timestamped log files behind those symlinks), and inspectable after the fact. Those are the default paths: a program can set its own log files or turn logging off. Log files rotate by size. When an apply changes a program's configuration, its old timestamped default log sessions older than the retention period (30 days by default) are deleted; the active session is kept, and custom log files are not covered by that cleanup. Log FILES outlive the process on disk, but the ephemeral tracking entry is dropped 10 minutes after the program finishes or is stopped — after that `hoody daemon ephemeral programs logs get` 404s (see Quirks); read the logs within those 10 minutes, or read the on-disk files directly (e.g. via the `files` namespace). `hoody daemon programs logs get` covers configured (non-ephemeral) programs.

Two flavours:

- **Quick-start (ephemeral, not added to the program list)** — `hoody daemon ephemeral programs start --command <command> --user <user> [--ttl <ttl>] [--wait] [--timeout <timeout>]`. Returns `temporary_id = quick_<ts>_<seq>`. Best for one-offs and short-lived jobs (build steps, batch transforms, "run this once and tell me the output"). It adds no durable program entry, but it does write a temporary supervisord configuration and records the program in the kit's ephemeral tracking file so the cleanup pass can find it. The log files stay on disk, but `hoody daemon ephemeral programs logs get` works only while the tracking entry exists. The cleanup pass (every 30 s) finalizes a program that is `stopped` or `fatal`, or `exited` with autorestart turned off; under the default `unexpected` policy an `exited` program is finalized when its exit code is known to be 0, and is kept while its exit code is unknown. A finalized program's result and logs stay readable for 10 minutes; then the pass drops the entry and the logs route 404s. Stopping a program that already finished does not extend that window. Optional `ttl` auto-stops after N seconds.
- **Registered program (durable, persists across kit restarts)** — `hoody daemon programs create --name <name> --command <command> --user <user> --enabled [--boot] --autorestart unexpected ...` → `hoody daemon programs start <id>`, then poll `hoody daemon programs status`. Use this when the process should come back after a container restart, when you want auto-restart on crash, or when you need port-range fan-out / lazy-load on first proxy hit.

## When to use

- "Run this command and keep the logs" → `hoody daemon ephemeral programs start`.
- "Run this server / agent / script as a long-running supervised process, restart on failure" → `hoody daemon programs create` + `hoody daemon programs start`.
- Background workers, port-range fan-out, lazy-loaded HTTP services, supervisord-event webhooks.

## When NOT to use

- **Traditional system services that ship native systemd units** (apache2, nginx, postgresql, mysql, redis, mosquitto, sshd, postfix, …) — leave them on `systemd`. Hoody containers are full Linux boxes with systemd + root (they behave like VMs, not Docker), so the standard `apt install nginx && systemctl enable --now nginx` flow Just Works and benefits from the upstream unit's hardening (drop-in directories, sd_notify, journal integration, etc.). Mixing systemd-managed and `daemon`-managed processes in the same container is fine — pick whichever fits the program.
- Need an interactive TTY (Claude Code, Codex, htop, vim, anything that paints the screen) → a one-off or hand-driven session is `terminal` with a **pinned non-ephemeral `terminal_id`**; a program that must be supervised (auto-restart, start at boot) is a `daemon` program with `terminal_id`, which runs on that terminal's PTY. Without `terminal_id` a daemon program has no TTY. A program with `terminal_id` cannot also have an effective sandbox.
- Watch or type into a daemon program's terminal → `hoody daemon programs attach <id|name>` (Ctrl-] detaches and leaves the program running; `--readonly` watches only). Snapshot, press, paste, write and wait drive it over REST without a WebSocket. Execute and session create on that id answer `409 DAEMON_TERMINAL`; a stopped program answers `409 DAEMON_PROGRAM_NOT_RUNNING` and closes a WebSocket with `4404`.
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

- `/dev/hoody`, `/hoody` and the log directory `/hoody/storage/hoody-daemon/logs/` exist.
- `user` = real system account.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Register and boot

- `hoody daemon programs create` (`name`/`command`/`user`; `enabled`, `boot`; opt `directory`/`environment`/`autorestart`/`priority`/`*_logfile`) -> `hoody daemon programs start <id>`, then poll `hoody daemon programs status` (`include_stats`) until `status.status` is `running` (`wait: true` blocks the request and easily exceeds 30 s on a cold kit; see Example 1); `hoody daemon programs logs get` on failure.

### 2. Ephemeral with TTL

- `hoody daemon ephemeral programs start` (`command`/`user`, opt `ttl?`/`wait?`/`timeout?`) returns `temporary_id` = `quick_<ts>_<seq>`. Poll/tail with `hoody daemon ephemeral programs status`/`hoody daemon ephemeral programs logs get`; `hoody daemon ephemeral programs stop` to terminate.

### 3. Lazy port-range fleet

- `hoody daemon programs create` + `port_range: { start, end }`, `port_param`, `lazy_load: true`, `enabled: true`. `hoody daemon programs list --port 8042 --include-status`. `hoody daemon programs start <id> --port 8042`; `hoody daemon programs stop <id> --port <port>` or `{ all: true }`.

### 4. Reach a service you just started

Any container port is publicly addressable as soon as the listener is up — no proxy alias, firewall edit, or extra registration needed:

- HTTP service on `:8080` → `https://{projectId}-{containerId}-http-8080.{node}.containers.hoody.com`
- HTTPS service on `:8443` → `https://{projectId}-{containerId}-https-8443.{node}.containers.hoody.com`

Edge is always `https://`; the slug only describes the inner protocol. Gate access via `hoody containers proxy *` if it shouldn't be public. See § Proxy URLs.

### 5. Update / wipe

`hoody daemon programs update` (partial: an omitted field keeps its stored value, but `environment`, `sandbox`, `port_range` and `webhooks.enabled`+`webhooks.urls` are replaced whole when sent; see Quirks); `hoody daemon programs disable`/`hoody daemon programs enable`; `hoody daemon programs delete`; `hoody daemon programs reset` -> `programs.default.json`.

## Quirks & gotchas

- Boolean query params (`hoody_kit`, `lazy_load`, `enabled`, `boot`, `include_status`, `include_stats`) STRICT: only `true`/`false`, in any letter case; `1`/`yes`/`0`/`""` -> 400. Send lowercase, which is what the SDK's typed values are.
- Webhook URLs are validated only in an enabled block: `webhooks.enabled: false` skips every URL, event, header, timeout and retry check (the block must still carry `enabled` and `urls`). In an enabled block, URLs are HTTPS-only unless `NODE_ENV=development` (which also skips every host check below). Userinfo is rejected; in production the literal label `localhost` and private/CGNAT/link-local/v6-ULA addresses are too, including when written as NAT64, v4-mapped-v6, or non-standard v4 (`2130706433`, `0x7f000001`, `127.1`), when the URL authority is an IP literal or `localhost`. A DNS name is not resolved when the block is saved; at delivery time, in production, private and reserved addresses are dropped from its resolution and delivery fails when none remains. Delivery never follows redirects and ignores the environment's HTTP proxy settings.
- A `webhooks` edit must send `enabled` AND `urls` (a block without `urls` is a 400, `missing field urls`) and replaces both; `events`, `headers`, `timeout` and `retry` keep their stored values when omitted. An enabled block with an empty `urls` is a 400. Callbacks are delivered only when the deployment enables event delivery for the kit; the block is validated and stored either way.
- Duplicate names + overlapping port ranges rejected on create AND update (adjacent OK); `port_param` requires `port_range`.
- `command` no newlines/CR/NUL; `user` `(?i)[a-z_][a-z0-9_-]*\$?` (case-insensitive) via `id`; `*_logfile` must resolve under `/hoody/storage/hoody-daemon/logs/`.
- `hoody daemon programs start` on `port_range` REQUIRES `{ port }`; `hoody daemon programs stop <id> --port <port>` or `{ all: true }`.
- `hoody daemon ephemeral programs start` returns `temporary_id` = `quick_<unix-ms>_<seq>` (e.g. `quick_1700000000000_1`); pass it unchanged to `hoody daemon ephemeral programs status`, `hoody daemon ephemeral programs logs get` and `hoody daemon ephemeral programs stop` on every surface. TTL polled ~10 s.
- A program is addressed by its integer `id` from `hoody daemon programs list`, never by its name: a name in the `{id}` slot is refused with 404 before the daemon looks anything up. To find the id of a named program, filter the list by name (`hoody daemon programs list --name <name> -o json`).
- Default ephemeral log paths are `/hoody/storage/hoody-daemon/logs/<name>/stdout.log` and `/hoody/storage/hoody-daemon/logs/<name>/stderr.log` (one directory per program), NOT `<name>.out.log`/`<name>.err.log`.
- After `hoody daemon ephemeral programs stop`, the program's result and logs stay readable for 10 minutes; then its tracking entry is dropped and `hoody daemon ephemeral programs logs get` returns `404`, while the on-disk log files persist. If withdrawing the program's supervisord group fails, the stop still reports success, with `cleaned_up: false`, and the next cleanup pass retries the withdrawal. Read `hoody daemon ephemeral programs logs get` within those 10 minutes, or fetch the on-disk file directly.
- `hoody daemon programs start` accepts `if_not_running: true` for an idempotent boot — early-returns with `already_running: true` if the program is already running and, for a standard program with a `ready_port`, that port accepts connections; otherwise, including a running program whose `ready_port` is not serving, it takes the start path, and polls for readiness only with `wait: true` (port-range responses include an `instance` block with the instance's status, but a newly dispatched start leaves out its pid — only the already-running shortcut returns an observed pid; standard programs omit the `instance` field entirely. Read the pid from `hoody daemon programs status <id>`). Use it for "ensure started" workflows.
- **`environment` REPLACES the whole map** on `hoody daemon programs update` (not per-key merge). If the existing env is `{A:"1",B:"2"}` and you update with `{environment:{A:"9"}}`, the stored map becomes `{A:"9"}` (values are strings). To preserve secrets, GET the program first and re-send the merged map.
- **`sandbox` is three-state on `hoody daemon programs update`**: absent keeps the stored block, `null` clears it, and an object REPLACES the whole block (no field merge). Sending `{sandbox:{process:{max_pids:64}}}` to a program that also had `filesystem.read_only_root` and `network.mode: restricted` leaves only `max_pids`, and the program runs without the others. Read `hoody daemon programs sandbox get <id>` first (`configured` is the stored block) and resend every restriction you want kept. The CLI does this check for you: a `--sandbox-*` edit that would drop a stored restriction is refused, nothing is sent, and each restriction is listed with the flag that resends it; `--sandbox-replace` sends the edit anyway.
- Quick-start programs cannot be sandboxed: a non-null `sandbox` on `hoody daemon ephemeral programs start` is a 400 (`sandbox is not supported for quick-start programs`); `null` is accepted as absent.
- An effective sandbox is refused for a `user` that resolves to uid 0 (under any name) and together with `terminal_id`. A block that restricts nothing is stored as absent and does not appear on the program.
- **A sandboxed program fails CLOSED at launch.** If a mechanism its policy needs is missing the program does not start unconfined, it refuses to start at all: Landlock below the network ABI, a `bwrap` or `systemd-run` the container does not have, or an ingress policy with no `nft`. Expect the program to be down, not unprotected. A launch-stage refusal is printed as `sandbox: <reason>` on the PROGRAM's stderr, not in the daemon log, so read `hoody daemon programs logs get` with `type=stderr`; the daemon log carries the earlier failures instead (validation, rendering, firewall admission, the supervisord apply). A stored block is also re-validated every time the program is rendered, so a block that later breaks a rule refuses the render rather than running the program unconfined.
- A NON-EMPTY `network.ingress_allow_from`, or an `ingress_rate_limit`, needs a listening set: without `bind_ports`, `port_range` or `ready_port` the edit is a 400 (`sandbox.network.ingress_* requires a listening set`). An empty list owes no rules and so needs nothing. They filter IPv4 TCP arriving on `eth0` at those ports only, leave established connections alone, and an empty `ingress_allow_from` restricts nothing rather than denying everyone.
- **Do not test an ingress allowlist from inside the same container.** The chain only matches what arrives on `eth0`, so same-container traffic never reaches it at all; and `ingress_allow_platform` defaults to `true`, which returns traffic whose source is loopback or the container's gateway ahead of both the meter and the allowlist. Either way a local probe proves nothing. Test with a new connection from an outside source. Public traffic the proxy forwards keeps the client's own address and IS filtered. The rate meter runs before the allowlist and stops tracking new sources once its 65535-entry set is full, while the allowlist keeps applying.
- `hoody daemon programs sandbox get <id>` answers with more than the stored block, and none of it certifies a running program: `configured` is what was persisted; `rev` is the 12-hex revision recomputed from the currently valid stored policy, the one the daemon WOULD place on the wrapper command line rather than an observation of the running process, and null when no effective policy validates; `effective` is DIAGNOSTIC argv recomputed from the stored policy, carrying placeholders like `<program argv>` and `<pid>`, never the observed command, and it omits what the wrapper applies from inside itself (Landlock ports and the open-file limit); `live` reports the nft table, chain and rules read from the kernel at request time; `firewall` is `none`, `ok`, `draining` or `degraded`, with `problems` listing validation, state, integrity and unresolved-install failures. Read `problems` before concluding a restriction is in force.
- **`restricted` is a PORT policy, not a destination policy.** `full` restricts neither bind nor connect. `restricted` limits which TCP ports the program may bind and connect to, at every destination including loopback: it cannot allow one host and deny another, and it does not touch UDP, ICMP or raw sockets, because Landlock has no hook for them. It also governs the `bind` and `connect` CALLS, not a socket that starts listening without an explicit bind, and a listener obtained that way is outside the ingress rules too. `none` is different in kind: it unshares the network namespace, so it removes IP networking of every protocol. Network mode alone does not block filesystem Unix sockets: under every mode, `none` included, they are governed by filesystem restrictions and file permissions rather than by this field. Every effective sandbox also masks `/run/user` with an empty directory, so sockets beneath it (the user manager, the session bus, agent sockets) are unreachable.
- Ports are numbers or inclusive `"a-b"` strings. An omitted `bind_ports` defaults to the union of `port_range` and `ready_port`, and an explicit list has to cover both. `restricted` needs a non-empty resolved bind set, and an omitted or empty `connect_ports` denies outbound TCP entirely; a non-empty `connect_ports` requires `restricted`. `none` refuses declared listeners, a non-null explicit `bind_ports` (`[]` included), a non-empty connect or allow list, and a configured rate limit. Empty lists and either value of `ingress_allow_platform` are accepted and inert.
- **The filesystem side is confinement, not a private container.** An effective sandbox drops all capabilities and unshares the user, PID and IPC namespaces, but the program keeps its account's supplementary groups and still sees the container's filesystem subject to ordinary permissions. `read_only_root` stops writes, not reads, and `/dev` and `/proc` are mounted over it. Private `/tmp` and `/var/tmp` are added only with `process.private_tmp: true`, which defaults to false: otherwise the program shares the container's temporary directories. `hidden` is not a secrecy boundary against an actor who can rename a validated directory or one of its ancestors: writable sources are pinned by descriptor at launch, but mount destinations are still resolved by pathname.
- Process limits have fixed domains and are rejected outside them: `max_memory` from `16M` to `64G` (decimal bytes, or uppercase binary `K`/`M`/`G`, with scope swap disabled), `max_pids` from 4 to 65536 counting threads and two wrapper helpers, `max_open_files` from 8 to 1048576 applied as both the soft and the hard limit. `max_cpu` (`"<n>%"`, whole numbers from `1%` to `102400%`, `100%` = one CPU), `max_file_size` (a per-file size limit, `1K` to `1024G`) and `tmp_size` (the size of each private tmpfs, `1M` to `64G`, only with `private_tmp: true`) are accepted too; a daemon built before they were added refuses them as unknown fields. There is no aggregate disk quota.
- **A stored sandbox is not proof that one is installed.** An add or edit can persist the new block and still fail to apply it to supervisord; the response says so, and the earlier process may keep running unconfined when its stop cannot be confirmed. Treat a failed write as unresolved, read `problems`, fix the cause and reapply, rather than assuming either the old or the new policy is in force.
- The ingress table `ip hoody_daemon` is rebuilt from desired state, not continuously enforced. Flushing or weakening it out of band can leave running programs unprotected: status turns `degraded` and new ingress launches refuse, but there is no integrity-repair loop and nothing stops what is already running. The next firewall transaction or reconcile rebuilds the table; re-applying an identical policy does not. Restore it and check `live` plus `firewall` after any out-of-band change.
- Ingress rules are attached to a destination PORT on `eth0`, not to a process. Another listener on that same port at a different local address gets the same filtering, and the ownership check only knows about ports other programs have DECLARED, so an undeclared listener is neither protected from this nor protected against it.
- **A policy change restarts the program.** The revision is part of the supervisord command line, so changing the resolved policy replaces the definition and stops the running instance; whether another starts is decided by `boot` and `lazy_load`, not by the edit. The old revision's ingress rules and port reservations can linger as `draining` after the call returns, so for a short window traffic meets both policies and the port is not yet free to reuse.
- Webhook delivery needs per-program `webhooks.enabled: true` AND a deployment that enables event delivery for the kit. No request turns event delivery on, so a program whose `webhooks.enabled` is `true` can still receive no callbacks; a saved `webhooks` block is not proof that any will arrive.
- `port_range` is an object `{ start, end }`; the CLI flags `--port-range-start` and `--port-range-end` build it.

## Common errors

- 400 webhook (enabled blocks only): `must use HTTPS protocol`, `must not contain userinfo`, `cannot point to private, loopback, link-local, or cloud-metadata IP addresses`.
- 400 `name already in use` / `Port range overlaps` / `port_param requires port_range`.
- success=false `Port parameter required for port-range programs` -> resend with a `port` from the program's range, via `--port`. success=false `Program with ID {id} is disabled` -> `hoody daemon programs enable` first.
- `403 Forbidden` — Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only. The body is the plain text `Forbidden` with no reason; use the capability URL.
- 1 MB JSON body limit.

## Related namespaces

`exec` sync. `cron` scheduled. `proxyLogs` access log. `terminal` TTY. `display` virtual display.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. The kit returns numeric `program.id` (not a UUID) — capture it from the `hoody daemon programs create` response.

### 1. Register a long-running supervised program with auto-boot

**Goal:** add a tick-emitting worker that supervisord keeps alive across kit restarts, then start it without blocking the caller.

**Step 1 — add (`enabled: true`, `boot: true`).** Capture `program.id`. Use `user: "user"` (uid 1000); the daemon's `command` allows shell metachars but you must own the quoting — single-quote the outer payload to avoid double-escaping.

```bash
ID=$(hoody --container "$C" daemon programs create \
  --name examples-daemon-tick \
  --command 'sh -c '\''while :; do echo tick $(date -u +%%s); sleep 5; done'\''' \
  --user user --enabled --boot --autorestart unexpected \
  -o json | jq -r '.program.id')
```

**Step 2 — `hoody daemon programs start` with `wait: false`.** ⚠ `wait: true` blocks the HTTP request until the process is running and easily exceeds 30 s on a cold kit (`wait:true,timeout:30` hits the client-side timeout). Pass `wait: false` and poll `hoody daemon programs status` instead.

```bash
hoody --container "$C" daemon programs start "$ID"
while [ "$(hoody --container "$C" daemon programs status "$ID" -o json | jq -r .status.status)" != "running" ]; do sleep 1; done
```

### 2. Quick-start ephemeral with TTL — launch, check status, tail logs

**Goal:** fire a one-shot command (no durable program entry), let it run up to 10 minutes, retrieve its output. `hoody daemon ephemeral programs start` returns `temporary_id = "quick_<unix-ms>_<seq>"` (e.g. `quick_1700000000000_1`); every later call takes that id unchanged. Truncating it to `quick_<ms>` returns 404.

**Step 1 — launch.**

```bash
QID=$(hoody --container "$C" daemon ephemeral programs start \
  --name examples-daemon-qs --user user --ttl 600 \
  --command 'sh -c "for i in $(seq 1 30); do echo qs-$i; sleep 1; done"' \
  -o json | jq -r .temporary_id)
```

**Step 2 — check status.**

```bash
hoody --container "$C" daemon ephemeral programs status "$QID" -o json
```

**Step 3 — tail logs.**

```bash
hoody --container "$C" daemon ephemeral programs logs get "$QID" --type stdout --lines 10
```

**Step 4 — stop.** Read the logs within 10 minutes of the stop: after that the tracking entry is dropped and `hoody daemon ephemeral programs logs get` returns 404 (the on-disk log files stay).

```bash
hoody --container "$C" daemon ephemeral programs stop "$QID"
```

### 3. Lazy port-range fan-out — one program, N port-bound instances

**Goal:** declare an HTTP service that listens on any port in `18800–18802`, materialised on demand the first time someone hits the proxy URL.

**Step 1 — add with `port_range` + `port_param` + `lazy_load`.** ⚠ `port_param` cannot be empty (the kit returns `400 Invalid port_param format: ""`). Use a real CLI flag, e.g. `--port`. At start-time the kit appends `<flag>=<port>` — **equals-joined**, one instance per port in the range — so the program must accept the `--flag=value` form. `python3 -m http.server` does NOT (its port is positional and `--port` is an unrecognised argument), so the example wraps it in a one-line `sh -c` that turns the appended flag back into the positional port.

```bash
ID=$(hoody --container "$C" daemon programs create \
  --name examples-daemon-fanout --command 'sh -c "exec python3 -m http.server ${1##*=}" sh' \
  --user user --enabled \
  --port-range-start 18800 --port-range-end 18802 \
  --port-param=--port --lazy-load \
  -o json | jq -r .program.id)
```

**Step 2 — start one specific port and read fleet-wide status.** `hoody daemon programs list --port 18800 --include-status` returns the program with a `status: { type: "port-range", running_instances, total_instances, instances: [{ port, status, … }] }` block.

```bash
hoody --container "$C" daemon programs start "$ID" --port 18800
hoody --container "$C" daemon programs list --port 18800 --include-status true -o json \
  | jq '.programs[].status'
```

The instance is reachable at `https://${P}-${C}-http-18800.${N}.containers.hoody.com` — no extra alias needed (see § "Reach a service you just started").

### 4. Tail program logs (`hoody daemon programs logs get` with type / lines)

**Goal:** investigate why a worker keeps restarting. `hoody daemon programs logs get` returns `{ logs, type, lines, log_file }` where `log_file` is the on-disk path under `/hoody/storage/hoody-daemon/logs/<name>/{stdout,stderr}.log`.

```bash
hoody --container "$C" daemon programs logs get "$ID" --type stderr --lines 200
```

For a port-range program, pass `?port=18800` to read the per-instance log file.

### 5. Webhook on supervisord process events (e.g. crash → HTTPS callback)

**Goal:** when the program enters the `FATAL` state, POST to your HTTPS endpoint. ⚠ Webhook URLs must be **HTTPS** unless `NODE_ENV=development` (and reject userinfo, `localhost`, and private/CGNAT/link-local ranges). ⚠ **Event names are kit-specific, not the supervisord canonical `PROCESS_STATE_*` ones**: the kit accepts only `STARTING, RUNNING, BACKOFF, STOPPING, STOPPED, EXITED, FATAL, UNKNOWN, "all", "*"`. Sending `PROCESS_STATE_FATAL` returns `400 Invalid event type`.

```bash
# `programs update` needs only the id; every other flag is optional.
hoody --container "$C" daemon programs update "$ID" \
  --webhooks-enabled \
  --webhooks-urls https://hooks.example.com/daemon-events \
  --webhooks-events FATAL --webhooks-events BACKOFF \
  --webhooks-headers X-Source=hoody-daemon \
  --webhooks-timeout 10 --webhooks-retry 2
```

⚠ A `webhooks` edit replaces `enabled` and `urls` and must send both: `{ webhooks: { enabled: false } }` on its own is a 400 (`missing field urls`). To turn delivery off, resend the current `urls` with `enabled: false`; to rotate URLs, send the full new `urls` array. `events`, `headers`, `timeout` and `retry` keep their stored values when omitted. `hoody daemon programs update` needs only the id on every surface: the SDK edit type is `ProgramUpdate`, with nothing required.

### 6. Wipe + reset to defaults — non-destructive snapshot first

**Goal:** restore the supervisord program set to whatever ships in `programs.default.json`. ⚠ **Destructive** — every program you added gets wiped. Snapshot before you call.

```bash
hoody --container "$C" daemon programs list -o json > /tmp/daemon-snapshot.json   # CLI list has no --limit
hoody --container "$C" daemon programs reset -y
```

### 7. Patch only the env vars on a running program

**Goal:** flip `LOG_LEVEL=debug` without restating `command`/`user`/etc. `hoody daemon programs update` is partial on every surface: fields absent from the request body keep their stored values. `environment` itself is replaced whole (see the note below).

> The CLI sends only the flags you pass: `hoody daemon programs update "$ID" --environment LOG_LEVEL=debug` transmits `{"environment":{"LOG_LEVEL":"debug"}}` and nothing else, so no stored field is overwritten by a default.

```bash
# environment is replaced whole: pass every variable the program should keep.
hoody --container "$C" daemon programs update "$ID" \
  --environment LOG_LEVEL=debug --environment BUILD=examples
hoody --container "$C" daemon programs stop "$ID"
hoody --container "$C" daemon programs start "$ID"
```

⚠ `environment` REPLACES the whole map (not per-key merge). If you have `{A:"1",B:"2"}` and update with `{environment:{A:"9"}}`, you end up with just `{A:"9"}` — re-send everything you want to keep.

### 8. Inspect a running program with stats

**Goal:** read CPU/RSS/uptime to feed a dashboard. For a standard program, `hoody daemon programs status <id>` returns `{ success, status: { id, status, pid?, uptime? }, stats? }`: the resource figures are in the separate `stats` object, present only when they could be collected for a running process. A program that is not running (`backoff`, `stopped`, `fatal`, …) has no `pid`, `uptime` or `stats`; supervisord's diagnostic text is never returned as `uptime`. A port-range program answers with `instances` instead, each instance carrying its own `stats`.

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

**Goal:** keep the program defined but stop supervisord from auto-restarting it. `hoody daemon programs disable` flips `enabled: false` (process stays in the listing for forensics); `hoody daemon programs enable` brings it back without touching `command`/`environment`. Enabling reapplies the program's configuration, so a program with `boot: true` (and not `lazy_load`) can start right away; follow it with an ensure-start (`if_not_running: true`), which returns early when the program is running and ready, and otherwise takes the start path (readiness polling only with `wait: true`).

```bash
hoody --container "$C" daemon programs disable "$ID"
hoody --container "$C" daemon programs enable "$ID"
hoody --container "$C" daemon programs start "$ID" --if-not-running
```

⚠ Trying `hoody daemon programs start` while `enabled: false` returns `success: false` with `Program with ID {id} is disabled` (e.g. `Program with ID 7 is disabled`) — call `hoody daemon programs enable` first.

## Reference

### `hoody daemon` (21) — Daemon and ephemeral programs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody daemon ephemeral programs list` |  | read | List all ephemeral programs | `daemon.ephemeralPrograms.list` | `hoody daemon ephemeral programs list` |
| `hoody daemon ephemeral programs logs get` |  | read | Get ephemeral program logs | `daemon.ephemeralPrograms.getLogs` | `hoody daemon ephemeral programs logs get <id> --type stdout --lines 100` |
| `hoody daemon ephemeral programs start` |  | write | Launch ephemeral CUSTOM program | `daemon.ephemeralPrograms.start` | `hoody daemon ephemeral programs start --command 'python my_batch_job.py' --user worker --directory /opt/app --inject-container-env` |
| `hoody daemon ephemeral programs status` |  | read | Get ephemeral program status | `daemon.ephemeralPrograms.getStatus` | `hoody daemon ephemeral programs status quick_1731605123456_0` |
| `hoody daemon ephemeral programs stop` |  | write | Stop ephemeral program | `daemon.ephemeralPrograms.stop` | `hoody daemon ephemeral programs stop quick_1731605123456_0` |
| `hoody daemon health` |  | read | Service health check | `daemon.kit.getHealth` | `hoody daemon health` |
| `hoody daemon programs create` |  | write | Add a new CUSTOM program | `daemon.programs.create` | `hoody daemon programs create --id 10 --name my-app --description 'My Node.js application' --command 'node app.js' --user nodejs` |
| `hoody daemon programs delete` |  | destructive | Remove a program | `daemon.programs.delete` | `hoody daemon programs delete 1 -y` |
| `hoody daemon programs disable` |  | write | Disable a program | `daemon.programs.disable` | `hoody daemon programs disable 1` |
| `hoody daemon programs enable` |  | write | Enable a program | `daemon.programs.enable` | `hoody daemon programs enable 1` |
| `hoody daemon programs get` |  | read | Get a specific program | `daemon.programs.get` | `hoody daemon programs get 1` |
| `hoody daemon programs list` |  | read | List all programs | `daemon.programs.list` | `hoody daemon programs list --hoody-kit true --lazy-load true` |
| `hoody daemon programs logs get` |  | read | Get program logs | `daemon.programs.getLogs` | `hoody daemon programs logs get 10 --type stdout --lines 100` |
| `hoody daemon programs logs stream` |  | read | Follow a program's log live: replays the last --lines lines, then prints every new line. A reconnect resumes after the last line received | `daemon.programs.streamLogs` | `hoody daemon programs logs stream --id 10 --type stdout --port 8080` |
| `hoody daemon programs reset` |  | write | Reset programs to default | `daemon.programs.reset` | `hoody daemon programs reset -y` |
| `hoody daemon programs sandbox get` |  | read | Show a program's sandbox: the stored block, the policy revision, what it resolves to, and what the firewall is holding | `daemon.programs.getSandbox` | `hoody daemon programs sandbox get 1` |
| `hoody daemon programs start` |  | write | Start a program or port instance | `daemon.programs.start` | `hoody daemon programs start 1 --port 8042 --wait` |
| `hoody daemon programs status` |  | read | Get the status of every program (no id) | `daemon.programs.listStatus` | `hoody daemon programs status --port 8080` |
| `hoody daemon programs status` |  | read | Get the status of one program | `daemon.programs.getStatus` | `hoody daemon programs status --port 8080` |
| `hoody daemon programs stop` |  | write | Stop a program or port instance | `daemon.programs.stop` | `hoody daemon programs stop 1 --port 8042` |
| `hoody daemon programs update` |  | write | Edit a program | `daemon.programs.update` | `hoody daemon programs update 1 --name my-app --description 'My Node.js application'` |

