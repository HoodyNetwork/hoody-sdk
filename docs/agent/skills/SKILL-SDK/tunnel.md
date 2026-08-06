> _**SDK skill · `tunnel` namespace** · ~4,473 tokens · hoody-sdk v1.0.0-beta.12_

# `tunnel` — reverse tunnels for HTTP/WS/TCP via container relay

## Purpose

**Mental model: ngrok, but built into every container, with the rest of the platform glued in for free.** Same job — reverse tunnel laptop ↔ container — but the public URL lives on the container's own `*.containers.hoody.com` host, so it inherits everything the proxy already does:

- **Capability gates** (`proxyPermissionsContainer.*`) apply unchanged — Password / Token / JWT / IP groups gate the tunnel URL the same way they gate any kit URL.
- **Request hooks (MITM)** — wire `proxyHooks.*` rules to inspect, transform, redirect, or block requests before they reach the tunnel; same engine as the rest of the platform.
- **Proxy logs** — every tunnel request is captured by `proxyLogs.*` automatically (status, latency, headers, source IP). No extra setup.
- **Friendly aliases** — point a `<alias>.{server_name}.containers.hoody.com` at the tunnel via `proxyAliases.create({ program: 'tunnel', … })` so the public URL hides `containerId`.

Two surfaces:
- **EXPOSE**: publish laptop HTTP/1.1 (+WS) on container's public domain. (ngrok `http`)
- **PULL**: project laptop TCP onto container loopback. (ngrok `tcp` reverse)

Each surface has:
- **Data plane** (open the tunnel) — long-running WebSocket process. Lives in a separate driver (see Quirks).
- **Control plane** (inspect / kill) — short request/response: `tunnel.listTunnels`, `tunnel.listSessions`, `tunnel.listBindings`, `tunnel.getMetrics`, `tunnel.health.check`, `tunnel.killSession`.

## When to use

- Publish laptop HTTP/WS on `*.containers.hoody.com`.
- Project laptop TCP onto container `127.0.0.1:<port>`.
- Inspect, scrape metrics, kill sessions.

## When NOT to use

Container-hosted HTTP → `exec`, browser → `browser`, one-shot HTTP → `curl`, edge logs → `proxyLogs`, container↔container TCP not supported.

## Prerequisites

- `hoody-tunnel` kit running; base port reserved.
- EXPOSE URL needs `HOODY_TUNNEL_PUBLIC_URL_PATTERN`.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Inspect

`tunnel.listTunnels` → sessions, bindings, streams, orphans, FD budget. Drill via `tunnel.listSessions` / `tunnel.listBindings`. `tunnel.health.check`; `tunnel.getMetrics` → Prometheus.

### 2. Kill stuck session

1. `tunnel.listSessions` → `sessionId`.
2. `tunnel.killSession` with `grace_ms` 0–5000 (default 50). Returns `202`. Live → GOAWAY then close; orphans drop now (parking skipped).
3. Re-list before re-binding.

### 3. MITM / log / gate the tunnel

Tunnel traffic flows through the same proxy as every other kit URL, so:

- **Logs**: `client.proxyLogs.logs.list({ serviceName: 'tunnel' })` returns every request that hit the tunnel — status, latency, source IP, headers — and `client.proxyLogs.logs.streamLogs(...)` for live tail; the generated SDK stream method does **not** expose `serviceName`, so use `list({ serviceName: 'tunnel', ... })` for tunnel-scoped polling. (proxyLogs query params on `list` are `limit` / `offset` / `projectId` / `containerId` / `serviceName` / `level` / `includeRequestBody` / `includeResponseBody` / `last` / `afterId` / `cursor` / `kind` / `method` / `source`; there is no `program` filter.) No agent on the laptop needed.
- **Hooks (MITM)**: register a `proxyHooks` rule scoped to `program: 'tunnel'` (or by alias hostname) to inspect / rewrite / inject / block requests before they reach the WS data plane. Same hook DSL as for any kit. Useful for: stripping a bearer header on the way through, redacting PII, rate-limiting, swapping bodies on the fly, fault-injecting for tests.
- **Gates**: layer `proxyPermissionsContainer.set{Password,Token,Jwt,Ip}Group` on the container; the tunnel URL becomes auth-gated without the laptop ever needing to handle it.

## Quirks & gotchas

- The data-plane (open / pull) is a long-running driver process, not a request/response call. Runtime: Bun 1.3+ or Node 20+ (the listening-server form is Bun-only). The main `tunnel` namespace covers only the read/observability + admin surface (`listTunnels`, `listSessions`, `listBindings`, `getMetrics`, `killSession`).
- `BIND_OK.publicUrl=null` without `HOODY_TUNNEL_PUBLIC_URL_PATTERN`.
- `grace_ms` capped at 5000ms; over → `400`.
- Ports `<80` rejected; `80..=1023` need `--allow-privileged-expose`/`--allow-privileged-pull`.
- PULL loopback-only. EXPOSE has atomic takeover (`takeover:true`); old owner gets `RESET(BIND_TAKEOVER)`+`BIND_REVOKED`. PULL takeover → `BIND_ERR(INVALID_KIND)`.
- Idle reaping needs zero streams AND zero bindings. Orphans with parked bindings wait 60s takeover-grace.
- v1 vs v2 subprotocols share `/connect` (`hoody-tunnel.v1` for single-WS sessions, `hoody-tunnel.v2` for multi-WS shard pools); `isV2` on `listSessions` reports the shape. Both subprotocols support graceful resume via `resume.sessionId` in HELLO; `isV2:false` does NOT mean "no resume".
- Multi-WS (v2) drop semantics: dropping the **primary** socket closes the whole session; dropping a **secondary** shard makes the driver close streams pinned to that shard while the kit detaches the shard and the session continues.
- Pre-auth connection cap defaults to `--max-pre-auth-connections=32`; exceeding it closes the socket before HELLO (no explicit close code). HELLO timeout defaults to 5 s.
- **No UDP support.** EXPOSE is HTTP/1.1+WS only; PULL is TCP only.
- `tunnelConnect` is the WS-upgrade endpoint of the data plane. The generated SDK exposes it as a plain `http.get` returning an `ApiResponse<unknown>` — that is NOT a working tunnel attach. Use the driver helpers (`tunnelExpose` / `tunnelPull` / `tunnelServe`) re-exported from the main SDK package, which handle the WS subprotocol, HELLO frame, and resume; do not call `client.tunnel.tunnelConnect` directly.

## Common errors

- `404` on kill — session gone; no retry.
- `403` — SSRF guard; not via Hoody Proxy.
- Upgrade `400` — missing/unsupported subprotocol; WS `1002` — HELLO rejected after upgrade; plain socket close — HELLO timeout or pre-auth cap reached.
- `BIND_ERR` codes: `ALREADY_BOUND` (retry `takeover:true`), `PORT_IN_USE`, `RESERVED_PORT`, `INVALID_HOST`, `PRIVILEGED_PORT`, `BIND_CAP_EXCEEDED`, `INVALID_KIND` (unsupported `(kind, mode)` combo, or `takeover:true` on PULL), `INTERNAL` (server-side, e.g. random-port exhaustion).
- `GOAWAY(IDLE_TIMEOUT)` — no PONG in 60s; reconnect via `resume.sessionId`.
- `503`+`Retry-After:5` at visitor URL — orphan takeover-grace window (set by `expose` driver kill, NOT by admin `killSession` which skips orphan parking).

## Related namespaces

- `proxyLogs` — every tunnel request appears here automatically; filter by `serviceName: 'tunnel'` (there is no `program` filter on the proxy-log API).
- `api` — `proxyHooks.*` (MITM rules), `proxyPermissionsContainer.*` (capability gates), `proxyAliases.create({ program: 'tunnel' })` (friendly hostnames hiding `containerId`).
- `exec` — for one-off HTTP handlers hosted directly inside the container (no laptop). `curl` — outbound HTTP from the container. `browser` — full headless Chromium. `daemon` — supervise long-running processes.

## Examples

The `tunnel` namespace covers only the **observability + admin** surface — `health.check`, `listTunnels`, `listSessions`, `listBindings`, `getMetrics`, `killSession`. The data plane (open / pull) is a long-running WebSocket driver that lives in a separate package; it is intentionally out of scope here, so these 7 examples assume *somebody else* (a teammate's tunnel expose/pull session, your CI machine's tunnel session, a test rig) is currently holding the tunnel. You're the operator: inspecting it, scraping metrics, killing it. Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first.

Read-only steps were live-attempted against the test container; on this deployment the tunnel kit process was not running on that container at the moment of writing (502); the admin endpoints serve independently of any session. Schemas, status codes, response shapes and CLI flags are verified against `generated/openapi.public.json`, `docs/reference/CLI-COMMANDS.md`.

### 1. Health probe — kit alive, FD budget not exhausted

**Goal:** before any other call, confirm the tunnel kit is reachable and not saturated. Response includes `pid`, `started`, `userAgent`, `fds` (Unix-only file-descriptor count when available), and `memory.rss`.

```typescript
const r = await client.tunnel.health.check();
const h = r.data!;
console.log({ status: h.status, pid: h.pid, fds: h.fds, rss: h.memory?.rss });
```
If the response is HTML / `Error 502` instead of JSON, the kit base listener isn't reachable through the proxy (kit crashed / not installed / proxy mis-route) — the admin endpoints are designed to stay live independent of any active session. Lack of an active session shows up as `sessions: []`, not 502.

### 2. List every active tunnel — combined sessions + bindings + FD budget

**Goal:** "what's currently tunneling on this container?" One call returns `sessions[]` (each with `peerAddr`, `protocol`, `connectionsGranted`, `activeStreams`, `exposeBindings[]`, `pullBindings[]`), `orphanedSessions` count, `totalStreams`, `totalBindings`, and `fdPermitsAvailable`.

```typescript
const r = await client.tunnel.listTunnels();
const t = r.data!;
console.log({
  active: t.sessions.length,
  orphans: t.orphanedSessions,
  streams: t.totalStreams,
  binds: t.totalBindings,
  fdBudget: t.fdPermitsAvailable,
  ids: t.sessions.map(s => s.sessionId),
});
```
`listTunnels` is the one-shot overview. For per-session detail (peer addr, max-stream cap, v2 flag) drill in via `listSessions` (example #3). Note: `protocol` is per-session and reflects the negotiated control-plane protocol, NOT the upstream — for the "is this an EXPOSE or PULL" answer, look at which of `exposeBindings` / `pullBindings` is non-empty.

### 3. Drill into one session — peer addr, stream load, capacity

**Goal:** you got a `sessionId` from #2; now you want the operator-facing detail (who's connected, how loaded). Returns `peerAddr` (`<ip>:<port>` of the laptop holding the tunnel), `connectionsGranted` (lifetime), `activeStreams` (right now), `maxStreams` (negotiated cap), `isV2` (control-plane protocol), and `bindings[]`.

```typescript
const r = await client.tunnel.listSessions();
const s = r.data!.sessions.find(x => x.sessionId === sid);
if (s) console.log({
  peer: s.peerAddr,
  v2: s.isV2,
  load: `${s.activeStreams}/${s.maxStreams}`,
  lifetime: s.connectionsGranted,
  binds: s.bindings.map(b => `${b.kind}/${b.mode}:${b.containerPort}#${b.bindId}`),
});
```
`activeStreams / maxStreams` is the headroom number — a session sitting at `48/50` is one curl away from `STREAM_LIMIT`. `isV2:false` means the session negotiated the single-WebSocket v1 control plane; resume is still supported via `resume.sessionId` while the orphan is in takeover grace.

### 4. List bindings — which ports are exposed across every session

**Goal:** answer "what container ports are tunnels eating right now?". `listBindings` flattens across one row per active binding — `port`, `kind` (`http` / `tcp`), `mode` (`expose` / `pull`). EXPOSE rows include the owning `sessionId`/`bindId`; current PULL rows report `sessionId: ""` and `bindId: 0`.

```typescript
const r = await client.tunnel.listBindings();
const byMode = r.data!.bindings.reduce<Record<string, number[]>>((acc, b) => {
  (acc[b.mode] ||= []).push(b.port);
  return acc;
}, {});
console.log(byMode);  // { expose: [3000, 8080], pull: [5432] }
```
Useful pre-flight check before someone tries to bind another port — `BIND_ERR(PORT_IN_USE)` is one of the most common BIND failures. Also: the wire field is `port` here but `containerPort` inside the per-session `bindings[]` array of #3 — same value, different name (verified against `tunnel_BindingDetail` vs `tunnel_BindingInfo` in the openapi spec).

### 5. Scrape Prometheus metrics — sessions, bindings, FD permits

**Goal:** wire the tunnel kit into your scrape job. Endpoint emits Prometheus text (one of the few endpoints that's not JSON). Three live-verified counters: `hoody_tunnel_sessions_active`, `hoody_tunnel_bindings_active`, `hoody_tunnel_fd_permits_available`.

```typescript
const r = await client.tunnel.getMetrics();
const text = r.data as unknown as string; // text/plain payload
// metric lines may carry a Prometheus label set, and bindings_active is split
// across expose+pull series — tolerate `{...}` and sum every matching line.
const get = (name: string) => {
  const re = new RegExp(`^${name}(?:\\{[^}]*\\})?\\s+(\\S+)`, 'gm');
  let sum = 0, hit = false;
  for (const m of text.matchAll(re)) { sum += Number(m[1]); hit = true; }
  return hit ? sum : NaN;
};
console.log({
  sessions: get('hoody_tunnel_sessions_active'),
  bindings: get('hoody_tunnel_bindings_active'),
  fdPermits: get('hoody_tunnel_fd_permits_available'),
});
```
For a dashboard, register the kit URL as a Prometheus scrape target via `proxyAliases.create({ program: 'tunnel' })` so the scrape config doesn't carry `containerId`, then gate it with `proxyPermissionsContainer.setIpGroup` so only your monitoring VPC can hit `/api/v1/tunnel/metrics`.

### 6. Kill a stuck session (recipe — needs a real session)

**Goal:** a teammate's tunnel expose session is wedged; you want it gone without restarting the kit. `killSession` returns `202` with `{sessionId, status}`. `grace_ms` ∈ [0, 5000] (default 50, anything above 5000 → `400`); the kit sends GOAWAY then waits up to that many ms for in-flight streams before closing. Orphan sessions skip the parking grace window and drop immediately.

⚠ Don't run this in the doc as live verification — it kills whoever's actually connected. Recipe only.

```typescript
const list = await client.tunnel.listSessions();
const stuck = list.data!.sessions.find(s => s.peerAddr.startsWith('203.0.113.'));
if (!stuck) throw new Error('no matching session');
const r = await client.tunnel.killSession(stuck.sessionId, { grace_ms: 1000 });
console.log(r.data); // { sessionId, status: 'closing' }
```
After a non-admin driver disconnect, visitors of an orphaned `expose` URL see `503 Retry-After:5` during takeover grace. `killSession` (admin) skips orphan parking and tears bindings down, so do **not** expect that 60 s 503 window from an admin kill — bindings drop immediately. PULL bindings drop instantly in both paths.

### 7. Auto-discover orphans + low-FD alert (monitoring recipe)

**Goal:** one cron-able script that watches both the orphan count (parked bindings whose laptop dropped) and the FD permits remaining; pages on either. `listTunnels` carries both numbers.

```typescript
const r = await client.tunnel.listTunnels();
const { orphanedSessions, fdPermitsAvailable } = r.data!;
if (fdPermitsAvailable < 64 || orphanedSessions > 0) {
  console.warn(`tunnel kit ${C}: orphans=${orphanedSessions} fds=${fdPermitsAvailable}`);
}
```
For a continuous live tail of `GOAWAY` / `IDLE_TIMEOUT` / `BIND_REVOKED` events as they happen, attach with the tunnel driver helpers (`TunnelSession` / `tunnelExpose` / `tunnelPull`, re-exported from the main SDK package) to `/api/v1/tunnel/connect` — that's the data-plane driver's surface and lives outside this namespace; do **not** use generated `client.tunnel.tunnelConnect` for a real attach. The polling recipe above stays inside the request/response admin surface.

## Reference

**Accessor:** `client.tunnel`  |  **Import:** `import * as tunnel from 'hoody-sdk/tunnel'`

### `client.tunnel.health` (1) — Health

#### `check` — Kit health

```typescript
client.tunnel.health.check()
```

**Returns:** `tunnel_HealthResponse`  |  **HTTP:** `GET /api/v1/tunnel/health`
**CLI:** `hoody tunnel health`

---

### `client.tunnel` (6) — Tunnel control plane (WebSocket + health + management)

#### `getMetrics` — Prometheus metrics

```typescript
client.tunnel.getMetrics()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/tunnel/metrics`
**CLI:** `hoody tunnel metrics`

---

#### `killSession` — Terminate an active tunnel session

```typescript
client.tunnel.killSession(session_id: string, grace_ms?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `session_id` | `string` | path | Yes | Session ID as returned by GET /sessions |
| `grace_ms` | `integer` | query | No | GOAWAY drain budget in ms (0-5000, default 50) |

**Returns:** `tunnel_KillResponse`  |  **HTTP:** `DELETE /api/v1/tunnel/sessions/{session_id}`
**CLI:** `hoody tunnel sessions kill`

---

#### `listBindings` — List active bindings across all sessions

```typescript
client.tunnel.listBindings()
```

**Returns:** `tunnel_BindingsResponse`  |  **HTTP:** `GET /api/v1/tunnel/bindings`
**CLI:** `hoody tunnel bindings list`

---

#### `listSessions` — List active tunnel sessions

```typescript
client.tunnel.listSessions()
```

**Returns:** `tunnel_SessionsResponse`  |  **HTTP:** `GET /api/v1/tunnel/sessions`
**CLI:** `hoody tunnel sessions list`

---

#### `listTunnels` — List all active tunnels (combined sessions + bindings)

```typescript
client.tunnel.listTunnels()
```

**Returns:** `tunnel_TunnelOverview`  |  **HTTP:** `GET /api/v1/tunnel/tunnels`
**CLI:** `hoody tunnel list`

---

#### `tunnelConnect` — Tunnel WebSocket control plane

```typescript
client.tunnel.tunnelConnect()
```

**Returns:** `void`  |  **HTTP:** `GET /api/v1/tunnel/connect`

