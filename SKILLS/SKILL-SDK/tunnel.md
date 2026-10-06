> _**SDK skill · `tunnel` namespace** · ~5,947 tokens · hoody-sdk v1.0.0-beta.15_

# `tunnel` — reverse tunnels for HTTP/WS/TCP via container relay

## Purpose

**Mental model: ngrok, but built into every container, with the rest of the platform glued in for free.** Same job — reverse tunnel laptop ↔ container — but the public URL lives on the container's own `*.containers.hoody.com` host, so it inherits everything the proxy already does:

- **Capability gates** (`proxy.containerPermissions.*`) — Password / Token / JWT / IP groups can gate the tunnel URLs like any other container URL, once a group is granted access and the container's default policy denies everyone else (see Workflow 3).
- **Request hooks (MITM)** — `proxy.hooks.*` rules apply to the kit's own admin/connect URL (service key `tunnel`). An exposed application is reached on its own port, which has no service name, so hooks do not run on that visitor traffic.
- **Proxy logs** — requests through the proxy, including tunnel traffic, can appear in `proxyLogs.*` (status, latency, headers, source IP), subject to the container's logging configuration and exclusions.
- **Friendly aliases** — for an exposed application, create an alias with `program: 'http'` and `port` set to the container port the EXPOSE bind was given, so the public URL hides `containerId`. `program: 'tunnel'` targets the kit's admin/connect endpoints instead.

Two surfaces:
- **EXPOSE**: publish laptop HTTP/1.1 (+WS) on container's public domain. (ngrok `http`)
- **PULL**: project laptop TCP onto container loopback. (ngrok `tcp` reverse)

Each surface has:
- **Data plane** (open the tunnel) — long-running WebSocket process. Lives in a separate driver (see Quirks).
- **Control plane** (inspect / kill) — short request/response: `tunnel.list`, `tunnel.sessions.list`, `tunnel.bindings.list`, `tunnel.kit.getMetrics`, `tunnel.kit.getHealth`, `tunnel.sessions.close`.

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

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Inspect

`tunnel.list` → sessions, bindings, streams, orphans, FD budget. Drill via `tunnel.sessions.list` / `tunnel.bindings.list`. `tunnel.kit.getHealth`; `tunnel.kit.getMetrics` → Prometheus.

### 2. Kill stuck session

1. `tunnel.sessions.list` → `sessionId`.
2. `tunnel.sessions.close` with `grace_ms` 0–5000 (default 50). Returns `202`. Live → GOAWAY then close; orphans drop now (parking skipped).
3. Re-list before re-binding.

### 3. MITM / log / gate the tunnel

Tunnel traffic flows through the same proxy as every other kit URL, so:

- **Logs** (subject to the container's logging configuration and exclusions; entries for the kit's admin/connect URL carry `serviceName` `tunnel`, while visitor traffic on an exposed port is reached through that port and does not carry the `tunnel` service name): `client.proxyLogs.list(...)` returns every request that hit the container — status, latency, source IP, headers — and `client.proxyLogs.stream(...)` gives a live tail. ⚠ `list` accepts a `serviceName` query but the kit-URL handler drops it (the SNI already scopes the read to your container), so filter its entries on `serviceName === 'tunnel'` yourself. `proxyLogs.stream` does send `serviceName` as a query filter, so the live tail can be scoped server-side. (proxyLogs query params on `list` are `limit` / `offset` / `projectId` / `containerId` / `serviceName` / `level` / `includeRequestBody` / `includeResponseBody` / `last` / `afterId` / `kind` / `method` / `source` / `sinceMs` / `untilMs`; there is no `program` filter.) No agent on the laptop needed.
- **Hooks (MITM)**: proxy hook rules registered under the `tunnel` service key (hooks are keyed by service name, per container) inspect / rewrite / inject / block requests to the kit's admin and `/connect` URL. They do **not** run on visitor traffic to an exposed application: that traffic arrives on the exposed port, which carries no service name, and the proxy only hook-routes requests that have one. A rule is `{ match, script, timeout? }`, and `match` can test only `method`, `path` and `headers`: there is no `program` field and no alias-hostname match.
- **Gates**: defining an authentication group (`proxy.containerPermissions.set{Password,Token,Jwt,Ip}Group`) does not gate anything by itself: the group starts with no access grants, and a container whose default policy is `allow` still lets every other caller through. Grant the group access and set the default policy to `deny`. An exposed port has no service name, so its route checks the matching protocol cell (`http`/`https`) first, where a grant or an explicit `false` decides, and only falls back to the `*` cell when there is no protocol cell; the laptop never has to handle the credential.

## Quirks & gotchas

- The data plane (expose / pull) is a long-running driver process, not a request/response call. Runtime: Bun 1.3+ or Node 22.23+ (24.18+ on the 24 line; the listening-server form is Bun-only). The generated `tunnel` namespace covers only the read/observability + admin surface (`tunnel.list`, `sessions.list`, `bindings.list`, `kit.getMetrics`, `sessions.close`) — the driver itself ships alongside it. On a `withContainer()` client use `box.tunnel.expose` / `box.tunnel.pull` / `box.tunnel.serve`: they build the tunnel WebSocket URL from the container and send the client's `kitAuth`. The package-root `tunnelExpose` / `tunnelPull` / `tunnelServe` take an explicit `url` instead.
- `BIND_OK.publicUrl` is `null` on deployments that do not mint public tunnel URLs — the bind still works, you just reach it another way.
- `grace_ms` capped at 5000ms; over → `400`.
- `containerPort: 0` requests an automatically allocated port; ports 1–79 are rejected; `80..=1023` are refused unless the deployment allows privileged ports (gated separately for expose and for pull).
- PULL loopback-only. EXPOSE has atomic takeover (`takeover:true`); the displaced owner gets a `RESET` frame on each stream of the old binding carrying the **numeric** code `13`, then a takeover notice: frame type `0x40` (`TunnelFrameType.BindRevoked` in the SDK), whose JSON body is `{bindId, reason}` — `reason` is free text, so branch on the frame type, never on its wording. The `tunnelExpose` driver does not surface that notice; only code that decodes frames itself sees it. PULL takeover → `BIND_ERR` with `code:"INVALID_KIND"`.
- Idle reaping needs zero streams AND zero bindings. Orphans with parked bindings wait out the configured takeover grace (default 60 s; zero disables parking).
- v1 vs v2 subprotocols share `/connect` (`hoody-tunnel.v1` for single-WS sessions, `hoody-tunnel.v2` for multi-WS shard pools); `isV2` on `sessions.list` reports the shape. Both subprotocols support graceful resume via `resume.sessionId` in HELLO; `isV2:false` does NOT mean "no resume".
- Multi-WS (v2) drop semantics: dropping the **primary** socket closes the whole session; dropping a **secondary** shard makes the driver close streams pinned to that shard while the kit detaches the shard and the session continues.
- Pre-auth connection cap defaults to 32; exceeding it closes the socket before HELLO (no explicit close code). HELLO timeout defaults to 5 s.
- **No UDP support.** EXPOSE is HTTP/1.1+WS only; PULL is TCP only.
- `GET /api/v1/tunnel/connect` (operation `tunnelConnect`) is the WS-upgrade endpoint of the data plane. It has no generated SDK method: a plain HTTP GET cannot perform the upgrade, so the SDK omits it. Use the driver helpers (`box.tunnel.expose` / `pull` / `serve` on a container-scoped client, or the package-root `tunnelConnect` / `TunnelSession`, `tunnelExpose`, `tunnelPull`, `tunnelServe`), which handle the WS subprotocol and HELLO frame; resuming a session takes the low-level `TunnelSession` (`resumeSessionId`).

## Common errors

- `404` on kill — session gone; no retry.
- `403` — SSRF guard; not via the edge proxy.
- Upgrade `400` — missing/unsupported subprotocol; WS `1002` — HELLO rejected after upgrade; plain socket close — HELLO timeout or pre-auth cap reached.
- `BIND_ERR` codes: `ALREADY_BOUND` (retry `takeover:true`), `PORT_IN_USE`, `RESERVED_PORT`, `INVALID_HOST`, `PRIVILEGED_PORT`, `BIND_CAP_EXCEEDED`, `INVALID_KIND` (unsupported `(kind, mode)` combo, or `takeover:true` on PULL), `INTERNAL` (server-side, e.g. random-port exhaustion).
- `GOAWAY` on an idle or unanswered-PING session: the body is a JSON object whose `code` is a **number**, `10`, and whose `message` reads `session idle timeout` or `pong timeout`; its two other fields are always `0`. Compare it against the SDK's exported `TunnelResetCode` (`IdleTimeout = 0x000a`, and `BindTakeover = 0x000d` for the RESET case below) rather than a bare literal, and treat `message` as human-readable only. Reconnect via `resume.sessionId`.
- `503`+`Retry-After:5` at visitor URL — orphan takeover-grace window (set by `expose` driver kill, NOT by admin `sessions.close` which skips orphan parking).

## Related namespaces

- `proxyLogs` — tunnel traffic through the proxy can appear here, subject to the logging configuration; the list route ignores the `serviceName` query (and there is no `program` filter), and only the kit's admin/connect traffic carries `serviceName` `tunnel`.
- `api` — `proxy.hooks.*` (MITM rules for the kit's admin/connect URL), `proxy.containerPermissions.*` (capability gates), `proxy.aliases.*` (friendly hostnames hiding `containerId`: `program: 'http'` plus `port` for an exposed application).
- `exec` — for one-off HTTP handlers hosted directly inside the container (no laptop). `curl` — outbound HTTP from the container. `browser` — full headless Chromium. `daemon` — supervise long-running processes.

## Examples

The `tunnel` namespace's REST operations cover the **observability + admin** surface — `kit.getHealth`, `tunnel.list`, `sessions.list`, `bindings.list`, `kit.getMetrics`, `sessions.close`. The data plane (expose / pull) is a long-running WebSocket driver: it ships with this package (`box.tunnel.expose` / `pull` / `serve`) but is out of scope for these 7 examples, which assume *somebody else* (a teammate's tunnel session, your CI machine's session, a test rig) is currently holding the tunnel. You're the operator: inspecting it, scraping metrics, killing it. Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first.

The admin endpoints serve independently of any session.

### 1. Health probe — kit alive

**Goal:** before any other call, confirm the tunnel kit is reachable and read its process statistics. It always reports `status: "ok"` when it answers and does not check tunnel capacity: for that, read `fdPermitsAvailable` from `tunnel.list` (example #2) or the FD-permits metric (example #5). Response includes `pid`, `started`, `userAgent`, `fds` (Unix-only file-descriptor count when available), and `memory.rss`.

```typescript
const r = await client.tunnel.kit.getHealth();
const h = r.data!;
console.log({ status: h.status, pid: h.pid, fds: h.fds, rss: h.memory?.rss });
```

If the response is HTML / `Error 502` instead of JSON, the kit base listener isn't reachable through the proxy (kit crashed / not installed / proxy mis-route) — the admin endpoints are designed to stay live independent of any active session. Lack of an active session shows up as `sessions: []`, not 502.

### 2. List every active tunnel — combined sessions + bindings + FD budget

**Goal:** "what's currently tunneling on this container?" One call returns `sessions[]` (each with `peerAddr`, `protocol`, `connectionsGranted`, `activeStreams`, `exposeBindings[]`, `pullBindings[]`), `orphanedSessions` count, `totalStreams`, `totalBindings`, and `fdPermitsAvailable`.

```typescript
const r = await client.tunnel.list();
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

`tunnel.list` is the one-shot overview. For per-session detail (peer addr, max-stream cap, v2 flag) drill in via `sessions.list` (example #3). Note: `protocol` is per-session and reflects the negotiated control-plane protocol, NOT the upstream — for the "is this an EXPOSE or PULL" answer, look at which of `exposeBindings` / `pullBindings` is non-empty.

### 3. Drill into one session — peer addr, stream load, capacity

**Goal:** you got a `sessionId` from #2; now you want the session detail (who's connected, how loaded). Returns `peerAddr` (`<ip>:<port>` of the laptop holding the tunnel), `connectionsGranted` (the negotiated WebSocket pool size: 1 for v1, 1–16 for v2), `activeStreams` (right now), `maxStreams` (negotiated cap), `isV2` (control-plane protocol), and `bindings[]`.

```typescript
const r = await client.tunnel.sessions.list();
const s = r.data!.sessions.find(x => x.sessionId === sid);
if (s) console.log({
  peer: s.peerAddr,
  v2: s.isV2,
  load: `${s.activeStreams}/${s.maxStreams}`,
  webSocketPoolSize: s.connectionsGranted,
  binds: s.bindings.map(b => `${b.kind}/${b.mode}:${b.containerPort}#${b.bindId}`),
});
```

`activeStreams / maxStreams` is the headroom number — a session sitting at `48/50` has two stream slots left. At the cap there is no error code to match on: an EXPOSE visitor request is answered `503` with `Retry-After: 1` and the plain-text body `max streams exceeded`, while a PULL connection is dropped with nothing sent at all. `isV2:false` means the session negotiated the single-WebSocket v1 control plane; resume is still supported via `resume.sessionId` while the orphan is in takeover grace.

### 4. List bindings — which ports are exposed across every session

**Goal:** answer "what container ports are tunnels eating right now?". `bindings.list` flattens across one row per active binding — `port`, `kind` (`http` / `tcp`), `mode` (`expose` / `pull`), plus the owning `sessionId`/`bindId` on every row. PULL rows also carry `bindAddr`: the same port can be bound on two loopback addresses at once, so a PULL listener is identified by `bindAddr` + `port`, not by the port alone. EXPOSE rows omit `bindAddr`.

```typescript
const r = await client.tunnel.bindings.list();
const byMode = r.data!.bindings.reduce<Record<string, string[]>>((acc, b) => {
  // A PULL listener is bindAddr + port; the same port can appear on two addresses.
  (acc[b.mode] ||= []).push(b.bindAddr ? `${b.bindAddr}:${b.port}` : String(b.port));
  return acc;
}, {});
console.log(byMode);  // { expose: ['3000', '8080'], pull: ['127.0.0.1:5432'] }
```

Useful pre-flight check before someone tries to bind another port — `BIND_ERR(PORT_IN_USE)` is one of the most common BIND failures. Also: the wire field is `port` here but `containerPort` inside the per-session `bindings[]` array of #3: same value, different name.

### 5. Scrape Prometheus metrics — sessions, bindings, FD permits

**Goal:** wire the tunnel kit into your scrape job. Endpoint emits Prometheus text (one of the few endpoints that's not JSON). Three gauges: `hoody_tunnel_sessions_active`, `hoody_tunnel_bindings_active` (two labelled series, `{kind="http",mode="expose"}` and `{kind="tcp",mode="pull"}`; sum them for the total) and `hoody_tunnel_fd_permits_available`.

```typescript
const r = await client.tunnel.kit.getMetrics();
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

For a dashboard, register the kit URL as a Prometheus scrape target through an alias so the scrape config doesn't carry `containerId`: `client.api.proxy.aliases.create({ container_id: C, program: 'tunnel' })`. To restrict it to your monitoring network, define an IP group, grant it the `tunnel` service, and set the container's default policy to `deny` — the group alone restricts nothing (see Workflow 3).

### 6. Kill a stuck session (recipe — needs a real session)

**Goal:** a teammate's tunnel expose session is wedged; you want it gone without restarting the kit. `sessions.close` returns `202` with `{sessionId, status}`. `grace_ms` ∈ [0, 5000] (default 50, anything above 5000 → `400`); it bounds how long the kit spends sending a best-effort GOAWAY before teardown. It is not a drain period: in-flight streams can be cut off. Orphan sessions skip the parking grace window and drop immediately.

⚠ Don't run this in the doc as live verification — it kills whoever's actually connected. Recipe only.

```typescript
const list = await client.tunnel.sessions.list();
const stuck = list.data!.sessions.find(s => s.peerAddr.startsWith('203.0.113.'));
if (!stuck) throw new Error('no matching session');
const r = await client.tunnel.sessions.close(stuck.sessionId, { grace_ms: 1000 });
console.log(r.data); // { sessionId, status: 'closing' }
```

After a non-admin driver disconnect, visitors of an orphaned `expose` URL see `503 Retry-After:5` during takeover grace (default 60 s). PULL listeners also stay bound during that grace, but drop each new connection while no live session holds them. `sessions.close` (admin) skips orphan parking and starts teardown, so do **not** expect that 503 window from an admin kill; its `202` means teardown was initiated, not that it has finished, so re-list to confirm.

### 7. Auto-discover orphans + low-FD alert (monitoring recipe)

**Goal:** one cron-able script that watches both the orphan count (parked bindings whose laptop dropped) and the FD permits remaining; pages on either. `tunnel.list` carries both numbers.

```typescript
const r = await client.tunnel.list();
const { orphanedSessions, fdPermitsAvailable } = r.data!;
if (fdPermitsAvailable < 64 || orphanedSessions > 0) {
  console.warn(`tunnel kit ${C}: orphans=${orphanedSessions} fds=${fdPermitsAvailable}`);
}
```

Only the process that owns a tunnel sees its `GOAWAY` and `RESET` frames: opening another connection to `/api/v1/tunnel/connect` starts a new session (or resumes an orphaned one) and does not observe a live session held by someone else. In the owning process, a `GOAWAY` closes the session and fires `TunnelSession.onClose`, and a `RESET` ends the one stream it names; the driver does not surface the takeover notice. As an operator, poll the admin endpoints as above.

## Reference

**Accessor:** `client.tunnel`  |  **Import:** `import * as tunnel from 'hoody-sdk/tunnel'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, containerId?, serviceIndex?, server? }`, which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are refused) and `cache` (a GET's response cache: `true`, a TTL in ms, or `false` to bypass) (no `_realm`: that one is control-plane only). When the signature shows an options object, the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`.

### `client.tunnel.bindings` (1) — Tunnel control plane (WebSocket + health + management)

#### `list` — List active bindings across all sessions

```typescript
client.tunnel.bindings.list()
```

**Returns:** `Promise<TunnelBindingsListResponse>`  |  **HTTP:** `GET /api/v1/tunnel/bindings`
**CLI:** `hoody tunnel bindings list`

---

### `client.tunnel.kit` (2) — Tunnel control plane (WebSocket + health + management)

#### `getHealth` — Kit health

```typescript
client.tunnel.kit.getHealth()
```

**Returns:** `Promise<TunnelKitGetHealthResponse>`  |  **HTTP:** `GET /api/v1/tunnel/health`
**CLI:** `hoody tunnel health`

---

#### `getMetrics` — Prometheus metrics

```typescript
client.tunnel.kit.getMetrics()
```

**Returns:** `Promise<ApiResponse<string>>`  |  **HTTP:** `GET /api/v1/tunnel/metrics`
**CLI:** `hoody tunnel metrics`

---

### `client.tunnel.sessions` (2) — Tunnel control plane (WebSocket + health + management)

#### `close` — Terminate an active tunnel session

```typescript
client.tunnel.sessions.close(session_id: string, options?: { grace_ms?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `session_id` | `string` | path | Yes | Session ID as returned by GET /sessions |
| `grace_ms` | `number` | query | No | GOAWAY drain budget in ms (0-5000, default 50) |

**Returns:** `Promise<TunnelSessionsCloseResponse>`  |  **HTTP:** `DELETE /api/v1/tunnel/sessions/{session_id}`
**CLI:** `hoody tunnel sessions close`

---

#### `list` — List active tunnel sessions

```typescript
client.tunnel.sessions.list()
```

**Returns:** `Promise<TunnelSessionsListResponse>`  |  **HTTP:** `GET /api/v1/tunnel/sessions`
**CLI:** `hoody tunnel sessions list`

---

### `client.tunnel` (1) — Tunnel control plane (WebSocket + health + management)

#### `list` — List all active tunnels (combined sessions + bindings)

```typescript
client.tunnel.list()
```

**Returns:** `Promise<TunnelListResponse>`  |  **HTTP:** `GET /api/v1/tunnel/tunnels`
**CLI:** `hoody tunnel list`

---

#### `expose` — Expose a local HTTP / WebSocket service on a container port.

```typescript
client.tunnel.expose(opts: ScopedTunnelExposeOptions)
```

**Returns:** `Promise<TunnelHandle>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `pull` — Bind a container-loopback port to a local TCP service.

```typescript
client.tunnel.pull(opts: ScopedTunnelPullOptions)
```

**Returns:** `Promise<TunnelHandle>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `serve` — Run a `fetch` handler locally (Bun only) and expose it on a container port.

```typescript
client.tunnel.serve(opts: ScopedTunnelServeOptions)
```

**Returns:** `Promise<TunnelHandle & { url: string }>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

