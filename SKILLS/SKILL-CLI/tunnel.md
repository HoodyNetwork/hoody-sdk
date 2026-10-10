> _**CLI skill · `tunnel` namespace** · ~5,123 tokens · hoody-sdk v1.0.0-beta.17_

# `tunnel` — reverse tunnels for HTTP/WS/TCP via container relay

## Purpose

**Mental model: ngrok, but built into every container, with the rest of the platform glued in for free.** Same job — reverse tunnel laptop ↔ container — but the public URL lives on the container's own `*.containers.hoody.com` host, so it inherits everything the proxy already does:

- **Capability gates** (`hoody containers proxy *`) — Password / Token / JWT / IP groups can gate the tunnel URLs like any other container URL, once a group is granted access and the container's default policy denies everyone else (see Workflow 3).
- **Request hooks (MITM)** — `hoody containers proxy *` rules apply to the kit's own admin/connect URL (service key `tunnel`). An exposed application is reached on its own port, which has no service name, so hooks do not run on that visitor traffic.
- **Proxy logs** — requests through the proxy, including tunnel traffic, can appear in `hoody proxy logs *` (status, latency, headers, source IP), subject to the container's logging configuration and exclusions.
- **Friendly aliases** — for an exposed application, create an alias with `program: 'http'` and `port` set to the container port the EXPOSE bind was given, so the public URL hides `containerId`. `program: 'tunnel'` targets the kit's admin/connect endpoints instead.

Two surfaces:
- **EXPOSE**: publish laptop HTTP/1.1 (+WS) on container's public domain. (ngrok `http`)
- **PULL**: project laptop TCP onto container loopback. (ngrok `tcp` reverse)

Each surface has:
- **Data plane** (open the tunnel) — long-running WebSocket process. Lives in a separate driver (see Quirks).
- **Control plane** (inspect / kill) — short request/response: `hoody tunnel list`, `hoody tunnel sessions list`, `hoody tunnel bindings list`, `hoody tunnel metrics`, `hoody tunnel health`, `hoody tunnel sessions close`.

## When to use

- Publish laptop HTTP/WS on `*.containers.hoody.com`.
- Project laptop TCP onto container `127.0.0.1:<port>`.
- Inspect, scrape metrics, kill sessions.

## When NOT to use

Container-hosted HTTP → `exec`, browser → `browser`, one-shot HTTP → `curl`, edge logs → `proxyLogs`, container↔container TCP not supported.

## Prerequisites

- `hoody-tunnel` kit running; base port reserved.
- A public EXPOSE URL is only issued where the deployment is configured to mint one; otherwise the bind succeeds with no public URL.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Inspect

`hoody tunnel list` → sessions, bindings, streams, orphans, FD budget. Drill via `hoody tunnel sessions list` / `hoody tunnel bindings list`. `hoody tunnel health`; `hoody tunnel metrics` → Prometheus.

### 2. Kill stuck session

1. `hoody tunnel sessions list` → `sessionId`.
2. `hoody tunnel sessions close` with `grace_ms` 0–5000 (default 50). Returns `202`. Live → GOAWAY then close; orphans drop now (parking skipped).
3. Re-list before re-binding.

### 3. MITM / log / gate the tunnel

Tunnel traffic flows through the same proxy as every other kit URL, so:

- **Logs** (subject to the container's logging configuration and exclusions; entries for the kit's admin/connect URL carry `serviceName` `tunnel`, while visitor traffic on an exposed port is reached through that port and does not carry the `tunnel` service name): `hoody proxy logs list` returns every request that hit the container (status, latency, source IP, headers) and `hoody proxy logs stream` gives a live tail. ⚠ `list` ignores `--service-name` (the kit URL already scopes the read to your container), so filter its entries on `serviceName == "tunnel"` yourself; `stream` honours it, so the live tail can be scoped server-side. (proxyLogs query params on `list` are `limit` / `offset` / `projectId` / `containerId` / `serviceName` / `level` / `includeRequestBody` / `includeResponseBody` / `last` / `afterId` / `kind` / `method` / `source` / `sinceMs` / `untilMs`; there is no `program` filter.) No agent on the laptop needed.
- **Hooks (MITM)**: proxy hook rules registered under the `tunnel` service key (hooks are keyed by service name, per container) inspect / rewrite / inject / block requests to the kit's admin and `/connect` URL. They do **not** run on visitor traffic to an exposed application: that traffic arrives on the exposed port, which carries no service name, and the proxy only hook-routes requests that have one. A rule is `{ match, script, timeout? }`, and `match` can test only `method`, `path` and `headers`: there is no `program` field and no alias-hostname match.
- **Gates**: defining an authentication group (`hoody containers proxy groups …`) does not gate anything by itself: the group starts with no access grants, and a container whose default policy is `allow` still lets every other caller through. Grant the group access and set the default policy to `deny`. An exposed port has no service name, so its route checks the matching protocol cell (`http`/`https`) first, where a grant or an explicit `false` decides, and only falls back to the `*` cell when there is no protocol cell; the laptop never has to handle the credential.

## Quirks & gotchas

- The data plane (expose / pull) is a long-running driver process, not a request/response call. Runtime: Bun 1.3+ or Node 20.3+ (22+ recommended: Node 20 is end-of-life; the listening-server form is Bun-only). On Node releases whose built-in WebSocket is affected by CVE-2026-12151 (before 22.23.0, all of 23 and 25, 24 before 24.17.0, 26 before 26.3.1) the tunnel socket is opened with the `ws` package instead. The generated `tunnel` namespace covers only the read/observability + admin surface (`hoody tunnel list`, `hoody tunnel sessions list`, `hoody tunnel bindings list`, `hoody tunnel metrics`, `hoody tunnel sessions close`) — the driver itself ships alongside it. Use `hoody tunnel expose <target>` or `hoody tunnel pull <target>`, registered on the same `tunnel` command group as the admin subcommands.
- `BIND_OK.publicUrl` is `null` on deployments that do not mint public tunnel URLs — the bind still works, you just reach it another way.
- `grace_ms` capped at 5000ms; over → `400`.
- `containerPort: 0` requests an automatically allocated port; ports 1–79 are rejected; `80..=1023` are refused unless the deployment allows privileged ports (gated separately for expose and for pull).
- PULL loopback-only. EXPOSE has atomic takeover (`takeover:true`); the displaced owner gets a `RESET` frame on each stream of the old binding carrying the **numeric** code `13`, then a takeover notice: frame type `0x40`, whose JSON body is `{bindId, reason}` — `reason` is free text, so branch on the frame type, never on its wording. The bundled tunnel driver does not surface that notice; only code that decodes frames itself sees it. PULL takeover → `BIND_ERR` with `code:"INVALID_KIND"`.
- Idle reaping needs zero streams AND zero bindings. Orphans with parked bindings wait out the configured takeover grace (default 60 s; zero disables parking).
- v1 vs v2 subprotocols share `/connect` (`hoody-tunnel.v1` for single-WS sessions, `hoody-tunnel.v2` for multi-WS shard pools); `isV2` on `hoody tunnel sessions list` reports the shape. Both subprotocols support graceful resume via `resume.sessionId` in HELLO; `isV2:false` does NOT mean "no resume".
- Multi-WS (v2) drop semantics: dropping the **primary** socket closes the whole session; dropping a **secondary** shard makes the driver close streams pinned to that shard while the kit detaches the shard and the session continues.
- Pre-auth connection cap defaults to 32; exceeding it closes the socket before HELLO (no explicit close code). HELLO timeout defaults to 5 s.
- **No UDP support.** EXPOSE is HTTP/1.1+WS only; PULL is TCP only.
- `GET /api/v1/tunnel/connect` (operation `tunnelConnect`) is the WS-upgrade endpoint of the data plane. Use `hoody tunnel expose <target>` or `hoody tunnel pull <target>`, which handle the WS subprotocol and HELLO frame. Each run opens a fresh session. While it runs, the CLI resumes a dropped connection automatically as long as the kit still holds its bindings; if recovery fails, it exits with code 1.

## Common errors

- `404` on kill — session gone; no retry.
- `403` — Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only. The response is a bare 403.
- Upgrade `400` — missing/unsupported subprotocol; WS `1002` — HELLO rejected after upgrade; plain socket close — HELLO timeout or pre-auth cap reached.
- `BIND_ERR` codes: `ALREADY_BOUND` (EXPOSE: retry with `takeover:true`; PULL: pick another port or close the owning session), `PORT_IN_USE`, `RESERVED_PORT`, `INVALID_HOST`, `PRIVILEGED_PORT`, `BIND_CAP_EXCEEDED`, `INVALID_KIND` (unsupported `(kind, mode)` combo, or `takeover:true` on PULL), `INTERNAL` (server-side, e.g. random-port exhaustion).
- `GOAWAY` on an idle or unanswered-PING session: the body is a JSON object whose `code` is a **number**, `10`, and whose `message` reads `session idle timeout` or `pong timeout`; its two other fields are always `0`. The takeover RESET below carries `13` (`0x000d`). Treat `message` as human-readable only. Reconnect via `resume.sessionId`.
- `503`+`Retry-After:5` at visitor URL — orphan takeover-grace window. Only a primary socket that drops without a close frame (a killed driver, a lost network), or closes with a code other than 1000, parks its bindings; a client `GOAWAY`, a close frame with no code or code 1000 (what a clean driver close sends), or admin `hoody tunnel sessions close` ends the session without parking.

## Related namespaces

- `proxyLogs` — tunnel traffic through the proxy can appear here, subject to the logging configuration; the list route ignores the `serviceName` query (and there is no `program` filter), and only the kit's admin/connect traffic carries `serviceName` `tunnel`.
- `api` — `hoody containers proxy *` (MITM rules for the kit's admin/connect URL), `hoody containers proxy *` (capability gates), `hoody proxy aliases *` (friendly hostnames hiding `containerId`: `program: 'http'` plus `port` for an exposed application).
- `exec` — for one-off HTTP handlers hosted directly inside the container (no laptop). `curl` — outbound HTTP from the container. `browser` — full headless Chromium. `daemon` — supervise long-running processes.

## Examples

The `tunnel` namespace's REST operations cover the **observability + admin** surface — `hoody tunnel health`, `hoody tunnel list`, `hoody tunnel sessions list`, `hoody tunnel bindings list`, `hoody tunnel metrics`, `hoody tunnel sessions close`. The data plane (expose / pull) is a long-running WebSocket driver: it ships with this package (`hoody tunnel expose` / `hoody tunnel pull`) but is out of scope for these 7 examples, which assume *somebody else* (a teammate's tunnel session, your CI machine's session, a test rig) is currently holding the tunnel. You're the operator: inspecting it, scraping metrics, killing it. Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

The admin endpoints serve independently of any session.

### 1. Health probe — kit alive

**Goal:** before any other call, confirm the tunnel kit is reachable and read its process statistics. It always reports `status: "ok"` when it answers and does not check tunnel capacity: for that, read `fdPermitsAvailable` from `hoody tunnel list` (example #2) or the FD-permits metric (example #5). Response includes `pid`, `started`, `userAgent`, `fds` (Unix-only file-descriptor count when available), and `memory.rss`.

```bash
hoody --container "$C" tunnel health -o json \
  | jq '{status, service, started, pid, fds, rss: .memory.rss}'
```

If the response is HTML / `Error 502` instead of JSON, the kit base listener isn't reachable through the proxy (kit crashed / not installed / proxy mis-route) — the admin endpoints are designed to stay live independent of any active session. Lack of an active session shows up as `sessions: []`, not 502.

### 2. List every active tunnel — combined sessions + bindings + FD budget

**Goal:** "what's currently tunneling on this container?" One call returns `sessions[]` (each with `peerAddr`, `protocol`, `connectionsGranted`, `activeStreams`, `exposeBindings[]`, `pullBindings[]`), `orphanedSessions` count, `totalStreams`, `totalBindings`, and `fdPermitsAvailable`.

```bash
hoody --container "$C" tunnel list -o json | jq '{
  active:(.sessions|length), orphans:.orphanedSessions,
  streams:.totalStreams, binds:.totalBindings, fdBudget:.fdPermitsAvailable
}'
```

`hoody tunnel list` is the one-shot overview. For per-session detail (peer addr, max-stream cap, v2 flag) drill in via `hoody tunnel sessions list` (example #3). Note: `protocol` is per-session and reflects the negotiated control-plane protocol, NOT the upstream — for the "is this an EXPOSE or PULL" answer, look at which of `exposeBindings` / `pullBindings` is non-empty.

### 3. Drill into one session — peer addr, stream load, capacity

**Goal:** you got a `sessionId` from #2; now you want the session detail (who's connected, how loaded). Returns `peerAddr` (`<ip>:<port>` of the laptop holding the tunnel), `connectionsGranted` (the negotiated WebSocket pool size: 1 for v1, 1–16 for v2), `activeStreams` (right now), `maxStreams` (negotiated cap), `isV2` (control-plane protocol), and `bindings[]`.

```bash
: "${SID:?Set SID to a sessionId returned by example 2}"
hoody --container "$C" tunnel sessions list -o json \
  | jq --arg s "$SID" '.sessions[] | select(.sessionId==$s) | {peer:.peerAddr, load:"\(.activeStreams)/\(.maxStreams)", binds:.bindings}'
```

`activeStreams / maxStreams` is the headroom number — a session sitting at `48/50` has two stream slots left. At the cap there is no error code to match on: an EXPOSE visitor request is answered `503` with `Retry-After: 1` and the plain-text body `max streams exceeded`, while a PULL connection is dropped with nothing sent at all. `isV2:false` means the session negotiated the single-WebSocket v1 control plane; resume is still supported via `resume.sessionId` while the orphan is in takeover grace.

### 4. List bindings — which ports are exposed across every session

**Goal:** answer "what container ports are tunnels eating right now?". `hoody tunnel bindings list` flattens across one row per active binding — `port`, `kind` (`http` / `tcp`), `mode` (`expose` / `pull`), plus the owning `sessionId`/`bindId` on every row. PULL rows also carry `bindAddr`: the same port can be bound on two loopback addresses at once, so a PULL listener is identified by `bindAddr` + `port`, not by the port alone. EXPOSE rows omit `bindAddr`.

```bash
hoody --container "$C" tunnel bindings list -o json \
  | jq '.bindings | group_by(.mode)
        | map({mode:.[0].mode, count:length,
               listeners: map(if .bindAddr then "\(.bindAddr):\(.port)" else "\(.port)" end)})'
```

Useful pre-flight check before someone tries to bind another port — `BIND_ERR(PORT_IN_USE)` is one of the most common BIND failures. Also: the wire field is `port` here but `containerPort` inside the per-session `bindings[]` array of #3: same value, different name.

### 5. Scrape Prometheus metrics — sessions, bindings, FD permits

**Goal:** wire the tunnel kit into your scrape job. Endpoint emits Prometheus text (one of the few endpoints that's not JSON). Three gauges: `hoody_tunnel_sessions_active`, `hoody_tunnel_bindings_active` (two labelled series, `{kind="http",mode="expose"}` and `{kind="tcp",mode="pull"}`; sum them for the total) and `hoody_tunnel_fd_permits_available`.

```bash
hoody --container "$C" tunnel metrics -o raw \
  | grep -E '^hoody_tunnel_(sessions_active|bindings_active|fd_permits_available)'
# -o raw is REQUIRED: without it the text/plain body prints as one JSON-quoted line.
```

For a dashboard, register the kit URL as a Prometheus scrape target through an alias so the scrape config doesn't carry `containerId`: `hoody proxy aliases create --container-id "$C" --program tunnel`. To restrict it to your monitoring network, define an IP group, grant it the `tunnel` service, and set the container's default policy to `deny` — the group alone restricts nothing (see Workflow 3).

### 6. Kill a stuck session (recipe — needs a real session)

**Goal:** a teammate's tunnel expose session is wedged; you want it gone without restarting the kit. `hoody tunnel sessions close` returns `202` with `{sessionId, status}`. `grace_ms` ∈ [0, 5000] (default 50, anything above 5000 → `400`); it bounds how long the kit spends sending a best-effort GOAWAY before teardown. It is not a drain period: in-flight streams can be cut off. Orphan sessions skip the parking grace window and drop immediately.

⚠ Closing a session cuts off whoever is connected to it, including its in-flight streams. Pick the intended session before running this recipe.

```bash
SID=$(hoody --container "$C" tunnel sessions list -o json \
  | jq -r '.sessions[] | select(.peerAddr | startswith("203.0.113.")) | .sessionId' | head -1)
hoody --container "$C" tunnel sessions close "$SID" --grace-ms 1000 -y
hoody --container "$C" tunnel sessions list -o json | jq --arg s "$SID" '.sessions[] | select(.sessionId==$s)'
```

After an unclean driver disconnect (the socket drops without a close frame, or closes with a code other than 1000), visitors of an orphaned `expose` URL see `503 Retry-After:5` during takeover grace (default 60 s); a clean close (`GOAWAY`, or close code 1000) releases the bindings at once. PULL listeners also stay bound during that grace, but drop each new connection while no live session holds them. `hoody tunnel sessions close` (admin) skips orphan parking and starts teardown, so do **not** expect that 503 window from an admin kill; its `202` means teardown was initiated, not that it has finished, so re-list to confirm.

### 7. Auto-discover orphans + low-FD alert (monitoring recipe)

**Goal:** one cron-able script that watches both the orphan count (parked bindings whose laptop dropped) and the FD permits remaining; pages on either. `hoody tunnel list` carries both numbers.

```bash
J=$(hoody --container "$C" tunnel list -o json)
ORPH=$(echo "$J" | jq '.orphanedSessions'); FDS=$(echo "$J" | jq '.fdPermitsAvailable')
[ "$FDS" -lt 64 ] || [ "$ORPH" -gt 0 ] && echo "ALERT orphans=$ORPH fds=$FDS"
```

Only the process that owns a tunnel sees its `GOAWAY` and `RESET` frames: opening another connection to `/api/v1/tunnel/connect` starts a new session (or resumes an orphaned one) and does not observe a live session held by someone else.  As an operator, poll the admin endpoints as above.

## Reference

### `hoody tunnel` (8) — Reverse tunnels — expose HTTP/WS/TCP services online via container relay

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody tunnel bindings list` |  | read | List active bindings across all sessions | `tunnel.bindings.list` | `hoody tunnel bindings list` |
| `hoody tunnel expose` |  | action | Expose a local service to the internet through the container (long-running, Ctrl+C to stop) |  | `hoody tunnel expose 3000` |
| `hoody tunnel health` |  | read | Tunnel kit health | `tunnel.kit.getHealth` | `hoody tunnel health` |
| `hoody tunnel list` |  | read | List all active tunnels (combined sessions + bindings) | `tunnel.list` | `hoody tunnel list` |
| `hoody tunnel metrics` |  | read | Prometheus metrics for the tunnel kit | `tunnel.kit.getMetrics` | `hoody tunnel metrics` |
| `hoody tunnel pull` |  | action | Pull a TCP service from local machine into the container loopback (long-running, Ctrl+C to stop) |  | `hoody tunnel pull 5432 --port 5432` |
| `hoody tunnel sessions close` |  | destructive | Terminate an active tunnel session | `tunnel.sessions.close` | `hoody tunnel sessions close abc-123 --grace-ms 100 -y` |
| `hoody tunnel sessions list` |  | read | List active tunnel sessions | `tunnel.sessions.list` | `hoody tunnel sessions list` |

