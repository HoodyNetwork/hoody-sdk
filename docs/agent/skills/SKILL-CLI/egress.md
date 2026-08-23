> _**CLI skill · `egress` namespace** · ~4,821 tokens · hoody-sdk v1.0.0-beta.14_

# `egress` — the container's outbound HTTP proxy

## Purpose

**Mental model: a proxy the standard container provision already runs, whose exit IP you choose at runtime.** Point any HTTP client at the container's egress URL and the request leaves through the container. Configure an *upstream* and the same URL routes through that instead, so the exit IP changes without touching the client.

It answers on the container's own host at the `egress` service slug, so on a normally-provisioned container there is nothing to install, start, or configure first — registration happens at provision time, not on demand, and Prerequisites has the one precondition and a one-call check. Indexed forms reach the same single process and share one upstream setting — the index is not a second proxy. What the index does change is proxy permissions, which are evaluated per service index, so `egress-1` and `egress-2` can carry different credentials while exiting through the same address. Be aware of a contradiction in the sources: the SDK's own service registry (`lib/kit-catalog.ts`, `cli/index.ts`) declares egress as carrying no instance index, while the edge parser accepts indexed forms and the OpenAPI server template includes one. The edge behaviour above is what actually happens.

It handles `CONNECT` tunnelling for HTTPS (never seeing inside the TLS session) and absolute-URI forwarding for plain HTTP.

## When to use

Use it when something inside a container needs to make outbound HTTP requests through a controllable exit: giving a scraper a specific egress IP, routing container traffic through a third-party SOCKS5 or HTTP proxy, or exposing a proxy endpoint to a client that only accepts a host and port. Use `hoody egress upstream set` to chain, `hoody egress upstream get` to inspect, and `hoody egress upstream clear` to go back to the container's own IP.

Use `hoody egress local` when the exit should be the operator's own machine rather than a rented proxy; see Quirks.

## When NOT to use

Do not use it as a general ingress path: any request whose target begins with `/` and is not one of the management routes returns 404 and is never forwarded, so it cannot be repurposed as a reverse proxy. (`OPTIONS` is the one exception, answered 204 before routing.) Do not reach for it to expose a local service to the internet — that is the `tunnel` namespace. Do not expect request hooks to apply; egress is on the hook-rejected list.

## Prerequisites

A running container whose provision registered egress — the overwhelmingly common case, not something to arrange. Provisioning registers egress on a new container by default, and containers created before egress existed are backfilled over time, so the gaps to expect are a container whose host has it turned off and one that has not been backfilled yet. No kit program needs enabling first — where registered, hoody-egress is eager (`boot: true`, `lazy_load: false`, unlike lazily-loaded siblings such as `pipe` or `run`), so the endpoint answers as soon as the container is up. To confirm before relying on it, probe the unauthenticated health route: `hoody --container <id> egress health` printing the standard health blob confirms egress is live; an error does not establish that it is absent. A failed probe cannot separate an unregistered kit from an overloaded or unreachable one: the server checks its connection cap before reading the request, so it can answer 503 while alive, and an edge or transport failure looks the same from outside. Registration can also be read from the always-present daemon kit: look for a `hoody-egress` entry in `hoody daemon programs list`. Setting an upstream needs nothing beyond the container URL and whatever proxy permissions guard it.

A local exit (`hoody egress local`) needs more: the container's hoody-tunnel kit must be running, because the exit is wired as a tunnel PULL bind onto the container's loopback, and the CLI must be logged in (`hoody login`), because the tunnel WebSocket authenticates with your account token even though the plain upstream commands need none. If the tunnel kit is down, startup fails before the container is touched.

## Capability URL

The endpoint is `https://{projectId}-{containerId}-egress-{serviceIndex}.{server}.containers.hoody.com` — see `SKILL-CLI.md § Proxy URLs` for the routing rules — and it is a capability URL: the project and container identifiers in the hostname *are* the credential, and hoody-egress performs no authentication of its own. An open egress endpoint is therefore an open proxy — anyone holding the URL can send traffic through it, consuming the server's bandwidth and attributed to its exit IP. Set proxy permissions on the `egress` service before sharing it or configuring an upstream.

## Common workflows

**Inspect the current setting.** `hoody egress upstream get` reports whether an upstream is enabled, its scheme, host and port, the config path, and an `auth` boolean. When no upstream is enabled the object carries only `enabled` and `config_path`; scheme, host, port, and `auth` appear only while one is set. Credentials are never returned, by design, so a read cannot be used to recover a secret someone else configured.

**Point traffic somewhere else.** `hoody egress upstream set <url>` takes the proxy URL as its one required argument — e.g. `hoody egress upstream set socks5h://user:pass@host:1080` — and sends it as the request body; it does not read stdin. Four schemes are accepted: `socks5h` sends the destination hostname upstream for resolution there, `socks5` resolves locally and sends an address, and `http` / `https` chain through an HTTP proxy using `CONNECT`, the latter with TLS to the upstream. Prefer `socks5h` when the point of the exercise is to avoid leaking destination lookups.

**Go back to the container's own IP.** `hoody egress upstream clear` (alias `disable`). There is no empty-body form here: `set` requires its URL argument and rejects an empty value, so `clear` is the only way back. Check with `hoody egress upstream get`.

**Confirm where traffic exits.** Request `https://ip.hoody.com` through the proxy; it reports the address it saw, which is the container's or the upstream's once one is set.

## Quirks & gotchas

- **Teardown deletes, it does not restore.** Clearing removes the upstream, and the kit never returns credentials — a read reports scheme, host, port and an `auth` flag only — so an authenticated upstream that some other tool configured cannot be put back unless whoever configured it still holds the full URL. An unauthenticated one can be rebuilt from a read taken before the clear.
- **The setting is a file, and it is reloaded, not restarted.** It is written to `/hoody/storage/hoody-egress/config/upstream_proxy.txt` with mode `0600` through an atomic temp-file rename, and picked up within about a second. Deleting the file disables the upstream only if the watcher has already seen it on disk; a file that never existed is deliberately ignored, so it cannot override an upstream handed to the process as a URL at startup. (A clear does not delete the file — it rewrites it with the URL line removed.)
- **The body is small and strictly framed.** A missing `Content-Length` is 411, and a *declared* `Content-Length` over 4096 is 413 — the check is on the header, before the body is read. This is not a channel for anything but a URL.
- **Health answers almost any method.** The health route matches on path alone, so every method except `OPTIONS` reaches it; `OPTIONS` is answered 204 with CORS headers before routing, which is what makes browser preflight work against the management API.
- **A local exit makes the operator's machine the exit** (`hoody egress local`). It binds a loopback port inside the container over hoody-tunnel, points the upstream at it, and terminates SOCKS5 on the operator's side, so requests leave from the machine the CLI is running on. Nothing listens on that machine; every socket it opens is outbound. Destinations are gated to public IPv4 by default, every resolved A record is authorised, and the pinned address is what gets dialled, so DNS rebinding cannot redirect a connection after approval.
- **A local exit refuses to clobber an existing upstream.** If the container already has one enabled, `hoody egress local` fails with `local exit: this container already has an upstream (<scheme>://<host>:<port>)` instead of replacing it, because teardown clears the upstream and the kit never returns credentials, so an authenticated upstream it replaced could not be put back automatically. Clear a stale one first with `hoody egress upstream clear`, or pass `--replace-upstream` to take the container over knowingly; when that exit stops, the container goes back to its own IP, not to the proxy it displaced.
- **A dead loopback port breaks every request.** If a local exit dies without clearing the upstream, the container keeps pointing at a port that no longer answers and every request through its egress fails until the upstream is cleared. Recover with `hoody --container <id> egress upstream clear`.
- **The URL — credentials included — is a command-line argument.** `hoody egress upstream set` has no stdin, file, or environment form; `--input` is rejected for this command. The full URL therefore lands in shell history and is visible in `ps` while the command runs. On a shared machine, set the upstream from code (`hoody egress upstream set`) or with a raw HTTP `PUT` whose body is read from a mode-`0600` file instead.
- **Browsers need a PAC file, not the manual proxy fields.** The connection to the proxy is itself TLS, so the manual host-and-port fields open a plaintext connection that the edge refuses with 400. A PAC file returning `HTTPS host:443` works in both Chrome and Firefox.

## Common errors

Errors come from two surfaces that answer differently. The management surface always sends a body: `text/plain` for every error except the 404, which is JSON, and every body ends with a trailing newline, so match on prefix or substring rather than equality. Framing and forwarding errors send no response body and no `Content-Type`; the status line still arrives with headers, always including `Vary: Origin` and `Connection: close`.

**Management surface** (path-form requests: `/api/v1/egress/upstream` and the route catch-all):

- 400 — three causes with three `text/plain` bodies: `Invalid upstream URL` when the value does not parse or its scheme is not one of the four, `Failed to read body` when the read fails or times out, and `Body must be UTF-8`. The OpenAPI 400 description names the same three bodies; it is documentation, not additional wire text.
- 404 — a path-form target that is not a management route, and the one JSON error: `{"error":"not found"}` with `Content-Type: application/json`. It is never forwarded, so it means the request was addressed to the proxy rather than through it.
- 405 — `Method Not Allowed` for any verb on the upstream route other than `GET`, `PUT`, `POST`, or `DELETE`. `OPTIONS` never reaches it; it is answered 204 before routing.
- 411 — `Missing Content-Length` on a set request.
- 413 — `Body too large` when the declared `Content-Length` exceeds 4096 bytes.
- 500 — `Failed to write config` when persisting the upstream file fails, on set and clear alike. The in-memory upstream is swapped only after a successful write, so after a 500 the previous setting still applies.

**Proxy data path and request framing** (no response body):

- 400 — an oversized or truncated header block, a bad request line, an invalid `CONNECT` authority, or a non-`CONNECT` target that is neither absolute-form `http://` nor asterisk-form `*`. An `https://` URL sent without `CONNECT` lands here. Asterisk-form is the one non-absolute target that forwards: `*` with a `Host` header is sent to the authority the header names; without one it is a 400. Header lines themselves never trigger it: a line with no colon is silently skipped, not rejected.
- 408 — request headers not completed within the read timeout.
- 502 — the outbound connection failed: destination unreachable, the chained upstream refused or timed out, or no valid response came back. It is also the answer when the client's own request body breaks mid-forward: a malformed chunk size or chunk ending fails inside the forwarding path, and the outer handler reports every forwarding failure as 502, so a bad client body reads the same as a dead upstream. A 502 is not always a standalone response either: after the `CONNECT` 200 has been sent, or after a forwarded response has started, a relay failure appends the 502 to the bytes already written. With an upstream set, a 502 on every request usually means the upstream itself is dead; see the dead-loopback quirk.
- 503 — the concurrent-connection cap is reached.

## Related namespaces

`tunnel` for the opposite direction (exposing a local service through the container). `proxyPermissionsContainer` for gating the endpoint, which matters more here than almost anywhere else because the URL is the only credential. `proxyAliases` to hand out a hostname that does not carry the container id. `api` for container firewall rules, whose `firewall/egress` routes govern packet filtering and are unrelated to this service despite the shared word.

## Examples

Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. The endpoint is `https://{P}-{C}-egress-1.{N}.containers.hoody.com`. Every `egress-<n>` index reaches the same single process and shares one upstream, but proxy permissions are evaluated per index, so use the index you granted access on (see § Purpose). The SDK's `getKitUrl` and the URL `startLocalExit` hands back omit the suffix; the edge normalizes a missing index to 1, so `…-egress.…` and `…-egress-1.…` are the same endpoint and the same permission scope.

### 1. Send a request through the proxy — confirm the container is the exit

**Goal:** prove the endpoint routes traffic and see the IP the destination sees. The connection to the proxy is itself TLS, so the proxy address carries an `https://` scheme. `CONNECT` tunnels HTTPS; plain HTTP rides absolute-form forwarding.

```bash
hoody --container "$C" egress health               # kit alive?
# There is no CLI verb that proxies a request — none is needed. The endpoint
# speaks the standard proxy protocol, so curl/git/pip/npm take the URL directly:
EGRESS="https://${P}-${C}-egress-1.${N}.containers.hoody.com"
curl -x "$EGRESS:443" https://ip.hoody.com | jq -r '.data.ip'
```
`ip.hoody.com` reports the address it saw the request come from, so it doubles as the before/after check for every recipe below. Browsers cannot use their manual proxy fields — plaintext to a TLS port is refused with 400; use a PAC file returning `HTTPS host:443` (see Quirks).

### 2. Set an upstream, read it back, clear it

**Goal:** change the exit IP without touching the client. Four schemes are accepted (`socks5h`, `socks5`, `http`, `https`); prefer `socks5h` when the upstream should also resolve DNS. Set and clear both answer `200` with the current status blob, so the response doubles as the read-back.

```bash
hoody --container "$C" egress upstream set 'socks5h://user:pass@203.0.113.10:1080'
hoody --container "$C" egress upstream get -o json
# {"enabled":true,"scheme":"socks5h","host":"203.0.113.10","port":1080,"auth":true,...}
hoody --container "$C" egress upstream clear       # alias: disable — the only way
                                                   # back; `set` rejects an empty URL
```
The setting lands in the config file atomically and is picked up within about a second (see Quirks). Re-run the exit check from #1: the reported address flips to the upstream's, and back after the clear. `auth: true` is the only trace of the credentials — they are never returned.

### 3. Make your own machine the exit — a local exit

**Goal:** turn the container's egress URL into a proxy whose traffic leaves from the machine you are sitting at. Needs the container's tunnel kit running; nothing listens on your machine (see Quirks).

```bash
hoody login                              # the tunnel WebSocket authenticates with your account token
hoody --container "$C" egress local
#   Proxy URL:     https://P-C-egress-1.N.containers.hoody.com
#   Exit IP:       203.0.113.42 (SG)  confirmed
# Ctrl+C tears it down. On a clean teardown the upstream is cleared and the
# container is back on its own IP; if the clear cannot be verified the CLI says so
# and leaves the tunnel up, so the container keeps working.
```
The SDK path needs an authenticated client constructed with an explicit `baseURL` (see Prerequisites). While the exit runs, treat `proxyUrl` like a password: anyone holding it relays through your connection.

### 4. The takeover guard, and the deliberate override

**Goal:** understand why a local exit refuses to start, and take a container over knowingly. Teardown deletes the upstream and credentials can never be read back, so silently replacing a third-party proxy would destroy it (see Quirks).

```bash
hoody --container "$C" egress local
# Failed to start local exit: local exit: this container already has an upstream
# (socks5h://203.0.113.10:1080). Stopping this exit would clear it, and its
# credentials cannot be read back to restore it. Clear it first, or pass
# replaceExistingUpstream/--replace-upstream to take it over.

hoody --container "$C" egress local --replace-upstream    # take it over knowingly
```
The check-then-set is not atomic — the guard protects against accidents, not races. Teardown re-reads the upstream and compares scheme, host, port and `auth` before clearing, so it leaves an upstream that is visibly someone else's alone and reports `upstreamHandedOver`; a replacement that matches on all four is indistinguishable from this exit's own, because the kit reports only `auth: true` and never credential identity. That needs a stale handle to reach: two live exits cannot share the container's loopback port, so it takes an exit whose listener is already gone, its port reused by a newer exit, and a late teardown on the old handle. When an exit started with the override stops cleanly, the container returns to its own IP, not to the proxy it displaced.

## Reference

### `hoody egress` (5) — Container egress proxy — outbound HTTP/CONNECT with an optional upstream

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody egress health` |  | read | Egress service health | `egress.healthCheck` | `hoody egress health` |
| `hoody egress local` |  | action | Publish this machine's IP as the container's HTTPS proxy exit (long-running, Ctrl+C to stop) |  | `hoody egress local` |
| `hoody egress upstream clear` | disable | destructive | Stop chaining through an upstream; egress goes direct | `egress.disableUpstream` | `hoody egress upstream clear` |
| `hoody egress upstream get` | show | read | Show the upstream proxy the container chains through | `egress.getUpstream` | `hoody egress upstream get` |
| `hoody egress upstream set` |  | action | Route the container's egress through an upstream proxy | `egress.setUpstream` | `hoody egress upstream set https://example.com` |

