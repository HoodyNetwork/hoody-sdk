> _**SDK skill · `tunnel` namespace** · ~7,472 tokens · hoody-sdk v1.0.1_

# `tunnel` — reverse tunnels for HTTP/WS/TCP via computer relay

## Purpose

**Mental model: ngrok, but built into every computer, with the rest of the platform glued in for free.** Same job — reverse tunnel laptop ↔ computer — but the public URL lives on the computer's own `*.computers.hoody.com` host, so it inherits everything the proxy already does:

- **Capability gates** (`computers.proxy.*` (`client.api.computers.proxy`)) — Password / Token / JWT / IP groups can gate the tunnel URLs like any other computer URL, once a group is granted access and the computer's default policy denies everyone else (see Workflow 3).
- **Request hooks (MITM)** — hook rules (`computers.proxy.createHook`, `computers.proxy.listHooks`, …) apply to the kit's own admin URL (service key `tunnel`); a hook whose match covers `/api/v1/tunnel/connect` makes the proxy refuse the tunnel's WebSocket upgrade with a 403 (WebSocket upgrades are not supported on a hooked path), so exclude that path. An exposed application is reached on its own port, which has no service name, so hooks do not run on that visitor traffic.
- **Proxy logs** — requests through the proxy, including tunnel traffic, can appear in `proxyLogs.*` (status, latency, source IP), subject to the computer's logging configuration and exclusions.
- **Friendly aliases** — for an exposed application, create an alias with `program: 'http'` and `port` set to the computer port the EXPOSE bind was given, so the public URL hides `computerId`. `program: 'tunnel'` targets the kit's admin/connect endpoints instead.

Two surfaces:
- **EXPOSE**: publish laptop HTTP/1.1 (+WS) on computer's public domain. (ngrok `http`)
- **PULL**: project laptop TCP onto computer loopback. (ngrok `tcp` reverse)

Each surface has:
- **Data plane** (open the tunnel) — long-running WebSocket process. Lives in a separate driver (see Quirks).
- **Control plane** (inspect / kill) — short request/response: `tunnel.list`, `tunnel.sessions.list`, `tunnel.bindings.list`, `tunnel.kit.getMetrics`, `tunnel.kit.getHealth`, `tunnel.sessions.close`.

## When to use

- Publish laptop HTTP/WS on `*.computers.hoody.com`.
- Project laptop TCP onto computer `127.0.0.1:<port>`.
- Inspect, scrape metrics, kill sessions.

## When NOT to use

Computer-hosted HTTP → `exec`, browser → `browser`, one-shot HTTP → `curl`, edge logs → `proxyLogs`.

## Prerequisites

- `hoody-tunnel` kit running; base port reserved.
- The kit returns a `BIND_OK.publicUrl` only when the deployment sets a public URL pattern. When it is absent and the tunnel URL has the expected `<project>-<computer>-tunnel-<n>.<server>.<domain>` host shape, the SDK and CLI derive the exposed port URL as `https://<project>-<computer>-http-<port>.<server>.<domain>`.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

## Common workflows

### 1. Inspect

`tunnel.list` → sessions, bindings, streams, orphans, FD budget. Drill via `tunnel.sessions.list` / `tunnel.bindings.list`. `tunnel.kit.getHealth`; `tunnel.kit.getMetrics` → Prometheus.

### 2. Kill stuck session

1. Live session: `tunnel.sessions.list` → `sessionId`. A parked orphan (counted in `tunnel.list` `orphanedSessions`) is never in `sessions.list`: take its `sessionId` from the `tunnel.bindings.list` rows you mean to drop. An id absent from `sessions.list` is a candidate, but both lists can change between requests.
2. `tunnel.sessions.close` with `grace_ms` 0–5000 (default 50). Returns `202`. Live → GOAWAY then close; orphans drop now (parking skipped).
3. Re-list before re-binding: `sessions.list` for a live session, `bindings.list` for an orphan (teardown is asynchronous, so its rows can linger briefly).

### 3. MITM / log / gate the tunnel

Tunnel traffic flows through the same proxy as every other kit URL, so:

- **Logs** (subject to the computer's logging configuration and exclusions; entries for the kit's admin/connect URL carry `serviceName` `tunnel`, while visitor traffic on an exposed port is reached through that port and does not carry the `tunnel` service name): `client.proxyLogs.list(...)` returns one page of the logged requests that hit the computer — status, latency, source IP (200 per call by default, at most 1000) — and `client.proxyLogs.stream(...)` gives a live tail. Both `list` and `stream` apply `serviceName` server-side, before paging: pass `{ serviceName: 'tunnel' }` to select the kit's admin/connect traffic. (proxyLogs `list` filters include `serviceName`, `excludeService`, `path`, `status` / `minStatus` / `maxStatus`, `method`, `kind`, `source`, `traceId`, `sinceMs` / `untilMs`, with `limit` / `offset` / `afterId` / `beforeId` paging; there is no `program` filter.) No agent on the laptop needed.
- **Hooks (MITM)**: proxy hook rules registered under the `tunnel` service key (hooks are keyed by service name, per computer) inspect / rewrite / inject / block ordinary HTTP requests to the kit's admin endpoints. A rule matching `/api/v1/tunnel/connect` does not hook the tunnel: the proxy refuses a WebSocket upgrade on a hooked path with a 403 whose body says `WebSocket upgrades are not supported on a path covered by a proxy hook`, so exclude that path from hook matches or no tunnel can connect. They do **not** run on visitor traffic to an exposed application: that traffic arrives on the exposed port, which carries no service name, and the proxy only hook-routes requests that have one. To create a rule, read the computer's hooks for their current ETag, then add the rule with that ETag in an `If-Match: file:v<N>` header (without it the answer is `428`) and the body `{ match, script, timeout?, applies_to?, position? }`: `position` controls where it is inserted, and `applies_to.groups` runs the rule only for requests from those permission groups. `match` can test only `method`, `path` and `headers`: there is no `program` field and no alias-hostname match.
- **Gates**: defining an authentication group (`computers.proxy.set{Password,Token,Jwt,Ip}Group`) does not gate anything by itself: the group starts with no access grants, and a computer whose default policy is `allow` still lets every other caller through. Grant the group access and set the default policy to `deny`. An exposed port has no service name, so its route checks the matching protocol cell (`http`/`https`) first, where a grant or an explicit `false` decides, and only falls back to the `*` cell when there is no protocol cell; the laptop never has to handle the credential.

## Quirks & gotchas

- The data plane (expose / pull) is a long-running driver process, not a request/response call. Runtime: Bun 1.3+ or Node 20.19+ (22+ recommended: Node 20 is end-of-life; the listening-server form is Bun-only). On Node 20 and 21, which have no global `WebSocket` by default, the driver uses the bundled `ws` client. On Node releases whose built-in WebSocket is affected by CVE-2026-12151 (before 22.23.0, all of 23 and 25, 24 before 24.17.0, 26 before 26.3.1) the tunnel socket is opened with the `ws` package instead. The generated `tunnel` namespace covers only the read/observability + admin surface (`kit.getHealth`, `tunnel.list`, `sessions.list`, `bindings.list`, `kit.getMetrics`, `sessions.close`) — the driver itself ships alongside it. On a `withComputer()` client use `box.tunnel.expose` / `box.tunnel.pull` / `box.tunnel.serve`: they build the tunnel WebSocket URL from the computer and send the client's `kitAuth`. The package-root `exposeTunnel` / `pullTunnel` / `serveTunnel` have no client to read from: pass either a full `url` or a `computer` (the tunnel kit's hostname or URL), plus `kitAuth` when the kit is gated.
- `BIND_OK.publicUrl` is `null` when the deployment sets no public URL pattern; the bind still works. The SDK and CLI derive `handle.publicUrl` from the tunnel URL when its host has the expected `<project>-<computer>-tunnel-<n>.<server>.<domain>` shape; otherwise the derived URL is undefined. An alias with `program: 'http'` and `port` set to the exposed computer port can hide the computer ID.
- `grace_ms` capped at 5000ms; over → `400`.
- `computerPort: 0` requests an automatically allocated port; ports 1–79 are rejected; `80..=1023` are refused unless the deployment allows privileged ports (gated separately for expose and for pull).
- PULL loopback-only. EXPOSE has atomic takeover (`takeover: true`); the displaced owner gets a `RESET` frame on each stream of the old binding carrying the **numeric** code `13`, then a takeover notice: frame type `0x40` (`TunnelFrameType.BindRevoked` in the SDK), whose JSON body is `{bindId, reason}` — `reason` is free text, so branch on the frame type, never on its wording. The takeover notice is best effort and can be dropped when the displaced owner's control queue is full. A `RESET` first tries the stream's own lane; if it must use the control queue and that queue is full, the `RESET` is not queued and the kit ends the displaced owner's whole session, attempting a GOAWAY with code `14` (`RESOURCE_EXHAUSTED`) and message `control lane saturated on stream RESET`. Do not rely on receiving either frame or the GOAWAY. The bundled tunnel driver does not surface that notice; only code that decodes frames itself sees it. PULL takeover → `BIND_ERR` with `code:"INVALID_KIND"`.
- Idle reaping needs zero streams AND zero bindings. Orphans with parked bindings wait out the configured takeover grace (default 60 s; zero disables parking).
- v1 vs v2 subprotocols share `/connect` (`hoody-tunnel.v1` for single-WS sessions, `hoody-tunnel.v2` for multi-WS shard pools); `isV2` on `sessions.list` reports the shape. Both subprotocols support graceful resume via `resume.sessionId` in HELLO; `isV2:false` does NOT mean "no resume".
- Multi-WS (v2) drop semantics: dropping the **primary** socket closes the whole session; dropping a **secondary** shard makes the driver close streams pinned to that shard while the kit detaches the shard and the session continues.
- Pre-auth connection cap defaults to 32; exceeding it closes the socket before HELLO (no explicit close code). HELLO timeout defaults to 5 s.
- **No UDP support.** EXPOSE is HTTP/1.1+WS only; PULL is TCP only.
- `GET /api/v1/tunnel/connect` is the WS-upgrade endpoint of the data plane. It has no generated SDK method: a plain HTTP GET cannot perform the upgrade, so the SDK omits it. Use the driver helpers (`box.tunnel.expose` / `pull` / `serve` on a computer-scoped client, or the package-root `TunnelSession`, `exposeTunnel`, `pullTunnel`, `serveTunnel`), which handle the WS subprotocol and HELLO frame. `keepTunnelAlive` resumes a dropped session while the kit still holds its bindings, for up to `resumeWindowMs` (default 60 seconds); to resume by hand, use the package-root `resumeTunnelExpose` / `resumeTunnelPull` with `sessionId`, or the low-level `TunnelSession` with `resumeSessionId`.

## Common errors

- `404` on kill — session gone; no retry.
- `403` — Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only. The response is a bare 403.
- Upgrade `400` — missing/unsupported subprotocol; WS `1002` — HELLO rejected after upgrade; plain socket close — HELLO timeout or pre-auth cap reached.
- `BIND_ERR` codes: `ALREADY_BOUND` (EXPOSE: retry with `takeover: true`), `PORT_IN_USE` (for PULL: pick another port or close the owning session), `RESERVED_PORT`, `INVALID_HOST`, `PRIVILEGED_PORT`, `BIND_CAP_EXCEEDED`, `INVALID_KIND` (unsupported `(kind, mode)` combo, or `takeover: true` on PULL), `INTERNAL` (server-side, e.g. random-port exhaustion), `INVALID_PORT` (`computerPort` not an integer 0–65535), `UPGRADE_REQUIRED` (the BIND used the retired `containerPort` key: update the driver), `INVALID_BIND_REF`, `RESOURCE_EXHAUSTED` (bind ids spent: open a new session).
- `GOAWAY` on an idle or unanswered-PING session: the body is a JSON object whose `code` is a **number**, `10`, and whose `message` reads `session idle timeout` or `pong timeout`; its two other fields are always `0`. Compare it against the SDK's exported `TunnelResetCode` (`IdleTimeout = 0x000a`, and `BindTakeover = 0x000d` for the RESET case below) rather than a bare literal, and treat `message` as human-readable only. After an idle timeout open a fresh session (an idle-reaped session had no bindings, so nothing is parked for resume). After a pong timeout, resume via `resume.sessionId` only while the kit still holds the session's bindings in takeover grace; otherwise open a fresh session.
- `503`+`Retry-After:5` at visitor URL — orphan takeover-grace window. A session that ends without a deliberate client close parks its bindings (a killed driver, a lost network, a close code other than 1000, or the kit ending it after missed PONGs), provided it holds bindings, takeover grace is above zero and the parked-session cap has room; a client `GOAWAY`, a close frame with no code or code 1000 (what a clean driver close sends), or admin `sessions.close` ends the session without parking.

## Related namespaces

- `proxyLogs` — tunnel traffic through the proxy can appear here, subject to the logging configuration; list and stream both honour `serviceName` (there is no `program` filter), and only the kit's admin/connect traffic carries `serviceName` `tunnel`.
- `api` — the hook methods of `computers.proxy` (`createHook`, `listHooks`, …: MITM rules for the kit's admin/connect URL), its permission methods (capability gates), `proxy.aliases.*` (friendly hostnames hiding `computerId`: `program: 'http'` plus `port` for an exposed application).
- `exec` — for one-off HTTP handlers hosted directly inside the computer (no laptop). `curl` — outbound HTTP from the computer. `browser` — full headless Chromium. `daemon` — supervise long-running processes.

## Examples

The `tunnel` namespace's REST operations cover the **observability + admin** surface — `kit.getHealth`, `tunnel.list`, `sessions.list`, `bindings.list`, `kit.getMetrics`, `sessions.close`. The data plane (expose / pull) is a long-running WebSocket driver: it ships with this package (`box.tunnel.expose` / `pull` / `serve`) but is out of scope for these 7 examples, which assume *somebody else* (a teammate's tunnel session, your CI machine's session, a test rig) is currently holding the tunnel. You're the operator: inspecting it, scraping metrics, killing it. Set `P`, `C`, `N` (project id, computer id, server name) from `computers.get` (`client.api.computers.get(computerId)`) first.

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

**Goal:** "what's currently tunneling on this computer?" One call returns `sessions[]` (each with `peerAddr`, `protocol`, `connectionsGranted`, `activeStreams`, `exposeBindings[]`, `pullBindings[]`), `orphanedSessions` count, `totalStreams`, `totalBindings`, and `fdPermitsAvailable`.

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

**Goal:** you got a `sessionId` from #2; now you want the session detail (who's connected, how loaded). Returns `peerAddr` (`<ip>:<port>` of the WebSocket peer as the kit sees it: the computers proxy forwards the client IP transparently, so the IP is the connecting machine's public address; several sessions can share that IP, so identify a session by its `sessionId` and bindings), `connectionsGranted` (the negotiated WebSocket pool size: 1 for v1, 1–16 for v2), `activeStreams` (right now), `maxStreams` (the kit's per-session stream cap), `isV2` (control-plane protocol), and `bindings[]`.

```typescript
const sid = process.env.SID;
if (!sid) throw new Error('Set SID to a sessionId returned by example 2');
const r = await client.tunnel.sessions.list();
const s = r.data!.sessions.find(x => x.sessionId === sid);
if (s) console.log({
  peer: s.peerAddr,
  v2: s.isV2,
  load: `${s.activeStreams}/${s.maxStreams}`,
  webSocketPoolSize: s.connectionsGranted,
  binds: s.bindings.map(b => `${b.kind}/${b.mode}:${b.computerPort}#${b.bindId}`),
});
```

`activeStreams / maxStreams` is the headroom number — a session sitting at `48/50` has two stream slots left. At the cap there is no error code to match on: an EXPOSE visitor request is answered `503` with `Retry-After: 1` and the plain-text body `max streams exceeded`, while a PULL connection is dropped with nothing sent at all. `isV2:false` means the session negotiated the single-WebSocket v1 control plane; resume is still supported via `resume.sessionId` while the orphan is in takeover grace.

### 4. List bindings — which ports are exposed across every session

**Goal:** answer "what computer ports are tunnels eating right now?". `bindings.list` flattens across one row per active binding — `port`, `kind` (`http` / `tcp`), `mode` (`expose` / `pull`), plus the owning `sessionId`/`bindId` on every row. PULL rows also carry `bindAddr`: the same port can be bound on two loopback addresses at once, so a PULL listener is identified by `bindAddr` + `port`, not by the port alone. EXPOSE rows omit `bindAddr`.

```typescript
const r = await client.tunnel.bindings.list();
const byMode = r.data!.bindings.reduce<Record<string, string[]>>((acc, b) => {
  // A PULL listener is bindAddr + port; the same port can appear on two addresses.
  (acc[b.mode] ||= []).push(b.bindAddr ? `${b.bindAddr}:${b.port}` : String(b.port));
  return acc;
}, {});
console.log(byMode);  // { expose: ['3000', '8080'], pull: ['127.0.0.1:5432'] }
```

Useful pre-flight check before someone tries to bind another port — `BIND_ERR(PORT_IN_USE)` is one of the most common BIND failures. Also: the wire field is `port` here but `computerPort` inside the per-session `bindings[]` array of #3: same value, different name.

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

For a dashboard, register the kit URL as a Prometheus scrape target through an alias so the scrape config doesn't carry `computerId`: `client.api.proxy.aliases.create({ computer_id: C, program: 'tunnel' })`. To restrict it to your monitoring network, define an IP group, grant it the `tunnel` service, and set the computer's default policy to `deny` — the group alone restricts nothing (see Workflow 3).

### 6. Kill a stuck session (recipe — needs a real session)

**Goal:** a teammate's tunnel expose session is wedged; you want it gone without restarting the kit. `sessions.close` returns `202` with `{sessionId, status}`. `grace_ms` is a whole number from 0 to 5000 (default 50; the SDK refuses a fraction with a `ValidationError`, and the kit answers a whole number above 5000 with `400 INVALID_GRACE_MS`); it bounds how long the kit spends sending a best-effort GOAWAY before teardown. It is not a drain period: in-flight streams can be cut off. Orphan sessions skip the parking grace window and drop immediately. An orphan is not in `sessions.list`: find its id in `bindings.list`, so each variant below accepts a `SID` found in either list, and confirms an orphan's teardown by re-reading `bindings.list`.

Warning: Closing a session cuts off whoever is connected to it, including its in-flight streams. Pick the intended session by its `sessionId` and bindings (recipe #2 / #3) before running this recipe: `peerAddr` holds the connecting machine's public IP, which several sessions can share, so it cannot select a session.

```typescript
const sid = process.env.SID;
if (!sid) throw new Error('Set SID to the intended sessionId after inspecting its bindings');
const live = (await client.tunnel.sessions.list()).data!.sessions.some(s => s.sessionId === sid);
// An orphan is never in sessions.list; it shows up only as the sessionId of its binding rows.
const parked = (await client.tunnel.bindings.list()).data!.bindings.some(b => b.sessionId === sid);
if (!live && !parked) throw new Error('no matching session');
const r = await client.tunnel.sessions.close(sid, { grace_ms: 1000 });
console.log(r.data); // { sessionId, status: 'closing' }
```

After an unclean end of the session (the socket drops without a close frame, closes with a code other than 1000, or the kit ends it after missed PONGs), visitors of an orphaned `expose` URL see `503 Retry-After:5` during takeover grace (default 60 s); a clean close (`GOAWAY`, or close code 1000) releases the bindings at once. PULL listeners also stay bound during that grace, but drop each new connection while no live session holds them. `sessions.close` (admin) skips orphan parking and starts teardown, so do **not** expect that 503 window from an admin kill; its `202` means teardown was initiated, not that it has finished, so re-list to confirm.

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

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, computerId?, serviceIndex?, serverName? }` (`server` is the older spelling of `serverName`, which wins when both are set), which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are set by the client and are refused with a `TypeError` before the call is sent: configure the token on the client, a kit credential as `kitAuth` on `withComputer()` or the client config (`middlewareContext.kitAuth` replaces the client's `kitAuth` for one call), and use another client for another identity), `cache` (ignored here: only an `api` GET is cached, never a GET to a kit host), `responseIsFinal` (`true`: never sent again once it may have reached the server), `keyedInProgressWait` (`false`: a 409 IDEMPOTENCY_REQUEST_IN_PROGRESS is the answer, not asked again), `redactBodyKeys` (body keys whose values an ApiError shows as [REDACTED]) and `maxResponseBytes` (a response body over this many bytes is refused with code RESPONSE_TOO_LARGE, and reading stops) (no `_realm`: that one is control-plane only). When the signature shows an options object (`options?: object` is one that takes the transport options only), the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself keeps the argument order it displays. A `wsOptions` argument (WebSocket methods only) accepts just `reconnect`, `connectTimeoutMs` and `transport`; the other transport options (`timeoutMs`, `signal`, …) stay in the request options the signature shows, never in `wsOptions`.

**Reading a method.** A method that shows no **Returns:** returns the response type named after it, the words after `client.` joined in PascalCase plus `Response`: `client.tunnel.bindings.list()` returns `Promise<TunnelBindingsListResponse>`.

### `client.tunnel` (1) — Tunnel control plane (WebSocket + health + management)

#### `list` — List all active tunnels (combined sessions + bindings)

```typescript
client.tunnel.list()
```

**HTTP:** `GET /api/v1/tunnel/tunnels`
**CLI:** `hoody tunnel list`

---

#### `expose` — Expose a local HTTP / WebSocket service on a computer port.

```typescript
client.tunnel.expose(opts: ScopedTunnelExposeOptions)
```

**Returns:** `Promise<TunnelHandle>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.
**Needs a computer-scoped client:** call it on `await client.withComputer(computer)`; on a client that is not computer-scoped it throws.

---

#### `pull` — Bind a computer-loopback port to a local TCP service.

```typescript
client.tunnel.pull(opts: ScopedTunnelPullOptions)
```

**Returns:** `Promise<TunnelHandle>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.
**Needs a computer-scoped client:** call it on `await client.withComputer(computer)`; on a client that is not computer-scoped it throws.

---

#### `serve` — Run a `fetch` handler locally (Bun only) and expose it on a computer port.

```typescript
client.tunnel.serve(opts: ScopedTunnelServeOptions)
```

**Returns:** `Promise<TunnelHandle & { url: string }>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.
**Needs a computer-scoped client:** call it on `await client.withComputer(computer)`; on a client that is not computer-scoped it throws.

---

### `client.tunnel.sessions` (2) — Active tunnel sessions (control plane)

#### `close` — Terminate an active tunnel session

```typescript
client.tunnel.sessions.close(session_id: string, options?: { grace_ms?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `session_id` | `string` | path | Yes | Session ID as returned by GET /sessions |
| `grace_ms` | `number` | query | No | Time in ms the kit spends sending a best-effort GOAWAY before it closes the session (0-5000, default 50); streams are not drained. |

**HTTP:** `DELETE /api/v1/tunnel/sessions/{session_id}`
**CLI:** `hoody tunnel sessions close <session-id>`

---

#### `list` — List active tunnel sessions

```typescript
client.tunnel.sessions.list()
```

**HTTP:** `GET /api/v1/tunnel/sessions`
**CLI:** `hoody tunnel sessions list`

---

### `client.tunnel.kit` (2) — Tunnel control plane (WebSocket + health + management)

#### `getHealth` — Kit health

```typescript
client.tunnel.kit.getHealth()
```

**HTTP:** `GET /api/v1/tunnel/health`
**CLI:** `hoody tunnel health`

---

#### `getMetrics` — Prometheus metrics

```typescript
client.tunnel.kit.getMetrics()
```

**Returns:** `Promise<ApiResponse<string>>`  |  **HTTP:** `GET /api/v1/tunnel/metrics`
**CLI:** `hoody tunnel metrics`

---

### `client.tunnel.bindings` (1) — Active URL/port bindings exposed by sessions

#### `list` — List active bindings across all sessions

```typescript
client.tunnel.bindings.list()
```

**HTTP:** `GET /api/v1/tunnel/bindings`
**CLI:** `hoody tunnel bindings list`

