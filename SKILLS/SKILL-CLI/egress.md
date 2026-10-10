> _**CLI skill · `egress` namespace** · ~7,069 tokens · hoody-sdk v1.0.0-beta.17_

# `egress` — the container's outbound HTTP proxy

## Purpose

**Mental model: a proxy the standard container provision already runs, whose exit IP you choose at runtime.** Point any HTTP client at the container's egress URL and the request leaves through the container. Configure an *upstream* and the same URL routes through that instead, so the exit IP changes without touching the client.

It answers on the container's own host at the `egress` service slug, so on a normally-provisioned container there is nothing to install, start, or configure first — registration happens at provision time, not on demand, and Prerequisites has the one precondition and a one-call check. Indexed forms reach the same single process and share one upstream setting — the index is not a second proxy. What the index does change is proxy permissions, which are evaluated per service index, so `egress-1` and `egress-2` can carry different credentials while exiting through the same address. The canonical URL carries no index; an explicit `egress-<n>` is accepted and selects the permission scope described above.

It handles `CONNECT` tunnelling for HTTPS (never seeing inside the TLS session) and absolute-URI forwarding for plain HTTP.

## When to use

Use it when something inside a container needs to make outbound HTTP requests through a controllable exit: giving a scraper a specific egress IP, routing container traffic through a third-party SOCKS5 or HTTP proxy, or exposing a proxy endpoint to a client that only accepts a host and port. Use `hoody egress upstream set` to chain, `hoody egress upstream get` to inspect, and `hoody egress upstream disable` to go back to the container's own IP.

Use `hoody egress local start` when the exit should be your own machine rather than a rented proxy; see Quirks.

## When NOT to use

Do not use it as a general ingress path: any request whose target begins with `/` and is not one of the management routes returns 404 and is never forwarded, so it cannot be repurposed as a reverse proxy. (`OPTIONS` is the one exception, answered 204 before routing.) Do not reach for it to expose a local service to the internet — that is the `tunnel` namespace. Do not expect request hooks to apply; egress is on the hook-rejected list.

## Prerequisites

A running container whose provision registered egress — the overwhelmingly common case, not something to arrange. Provisioning registers egress on a new container by default, and containers created before egress existed are backfilled over time, so the gaps to expect are a container whose host has it turned off and one that has not been backfilled yet. No kit program needs enabling first — where registered, hoody-egress is eager (`boot: true`, `lazy_load: false`, unlike lazily-loaded siblings such as `pipe` or `run`), so the endpoint answers as soon as the container is up. To confirm before relying on it, probe the unauthenticated health route: `hoody --container <id> egress health` printing the standard health blob confirms egress is live; an error does not establish that it is absent. A failed probe cannot separate an unregistered kit from an overloaded or unreachable one: the server checks its connection cap before reading the request, so it can answer 503 while alive, and an edge or transport failure looks the same from outside. Registration can also be read from the always-present daemon kit: look for a `hoody-egress` entry in `hoody daemon programs list`. Setting an upstream needs nothing beyond the container URL and whatever proxy permissions guard it.

A local exit (`hoody egress local start`) needs more: the container's hoody-tunnel kit must be running, because the exit is wired as a tunnel PULL bind onto the container's loopback, and the CLI must be logged in (`hoody login`), because the tunnel WebSocket authenticates with your account token. Every `hoody --container` command, the plain upstream commands included, also needs that login the first time it meets a container: the CLI looks up the container's routing with your account token and then caches it. If the tunnel kit is down, startup fails before the container is touched.

## Capability URL

The endpoint is `https://{projectId}-{containerId}-egress-{serviceIndex}.{server}.containers.hoody.com` — see `SKILL-CLI.md § Proxy URLs` for the routing rules — and it is a capability URL: the project and container identifiers in the hostname *are* the credential, and hoody-egress performs no authentication of its own. An open egress endpoint is therefore an open proxy — anyone holding the URL can send traffic through it, consuming the server's bandwidth and attributed to its exit IP. Set proxy permissions on the `egress` service before sharing it or configuring an upstream.

## Common workflows

**Inspect the current setting.** `hoody egress upstream get` reports `enabled`, `state`, the scheme, host and port, the config path, and an `auth` boolean. The two flags answer different questions. `enabled` says an upstream is CONFIGURED. `state` says which configuration is in force: `active` (an address has been checked and approved and requests are sent through it), `unavailable` (configured but no approved address, so proxied requests get 502 and are never sent directly instead) or `direct` (nothing configured). Neither flag reports reachability. `active` means approved pins exist, not that anything answers on them, so a permitted address with nothing listening stays `active` while every request fails. `unavailable` is the one that operators most often read backwards: it means proxied traffic is REFUSED with `502 configured upstream proxy is unavailable`, never quietly sent direct. `enabled` is therefore `true` in both `active` and `unavailable`; only `direct` reads `false`. Scheme, host, port and `auth` are present whenever there is a parsed upstream configuration to report, and absent when there is not: nothing is configured (`direct`), the configured text did not parse, or the persisted setting could not be read. Credentials are never returned, by design, so a read cannot be used to recover a secret someone else configured. One compatibility rule for anything that branches on `state`: it is newer than the other fields, so a container running an older egress build answers without it. Treat its ABSENCE as "this kit predates the field" and fall back to `enabled`, rather than comparing a missing value against `'active'` and concluding the upstream is broken.

**Point traffic somewhere else.** `hoody egress upstream set <url>` takes the proxy URL as its one required argument — e.g. `hoody egress upstream set socks5h://user:pass@host:1080` — and sends it as the request body; it does not read stdin. Four schemes are accepted: `socks5h` sends the destination hostname upstream for resolution there, `socks5` resolves locally and sends an address, and `http` / `https` chain through an HTTP proxy using `CONNECT`, the latter with TLS to the upstream. Prefer `socks5h` when the point of the exercise is to avoid leaking destination lookups.

**Go back to the container's own IP.** `hoody egress upstream disable`. There is no empty-body form here: `set` requires its argument and refuses an empty value, so use `disable`. Check with `hoody egress upstream get`.

**Lease an upstream that should end with its client.** `hoody egress upstream set <url> --lease 60` installs the upstream for that many whole seconds, from 5 to 3600. The answer, and every later read while that upstream is configured, carries `lease: { id, ttl, expires_at, expires_in }` (`expires_at` in Unix seconds). Renew it before the deadline with `hoody egress upstream renew --lease-id <id>`: the deadline moves to `ttl` seconds from now, never earlier than it already was and never more than 3600 seconds ahead, and the answer is the same body a read returns. If no renewal arrives in time, the kit disables the upstream the way an explicit disable does and records the disable in its config file, so the container goes back to its own IP and stays there across a restart. A lease that ran out while the kit was down is disabled at startup. A set without `lease` installs a permanent upstream and ends any earlier lease. A replacement or a disable also ends it, and renewing the old id then answers 409.

**Confirm where traffic exits.** Request `https://ip.hoody.com` through the proxy; it reports the address it saw, which is the container's or the upstream's once one is set.

## Quirks & gotchas

- **Teardown deletes, it does not restore.** Clearing removes the upstream, and the kit never returns credentials — a read reports scheme, host, port and an `auth` flag only — so an authenticated upstream that some other tool configured cannot be put back unless whoever configured it still holds the full URL. An unauthenticated one can be rebuilt from a read taken before the clear.
- **The setting is applied without a restart.** It lands in the file reported as `config_path` in the response and is picked up within about a second. A clear does not remove that file — it records an explicit `disabled` state, which is what makes the disable survive a restart of a process that was started with an upstream. A URL line the destination guard refuses, or one that does not parse, is NOT a fall back to direct, and which of two things it does depends on whether an upstream is already working: with one in force that upstream keeps carrying traffic, and with none in force the kit reports `state: "unavailable"` and answers proxied requests with 502 until the line is fixed or removed.
- **Direct destinations are filtered, unconditionally, and IPv4 only.** With no upstream in force, the kit resolves the destination, refuses private, loopback, link-local, CGNAT, benchmarking, documentation, TEST-NET, multicast and reserved addresses with `403 destination not permitted`, and dials the address it checked, so a short-TTL record cannot pass the check and then point elsewhere. An IPv6 literal destination is refused on every path, upstream or not, mapped (`::ffff:a.b.c.d`), compatible and NAT64 spellings included; a name the kit resolves itself that has no IPv4 address is refused too. There is no flag, environment variable, file or API field that admits one. The same address rule applies to the upstream itself, with one exception for chaining: a `socks5`/`socks5h` upstream on IPv4 loopback is accepted on any port, credentials optional, because that is the shape a local exit installs. Past an upstream, the destination is that exit's business for all four schemes: `socks5` resolves the name here and sends the first IPv4 address without the private-address check, and `socks5h`, `http` and `https` hand the name to the exit, which also decides its address family.
- **A configured upstream that cannot be used refuses traffic; it does not fall back to direct.** With no upstream in force, a configured one that is refused, unresolvable or unparsable reads as `enabled: true, state: "unavailable"`, and proxied requests get `502 configured upstream proxy is unavailable`. That is deliberate: a request must not leave from the container's own address after someone asked for an exit. The kit keeps retrying, so a transient DNS failure recovers on its own. For an upstream set without a lease, direct egress returns only on an explicit disable (`DELETE`, an empty or `disabled` body, or emptying a config file that has governed); an upstream set with a `lease` (in seconds) is also disabled automatically when the lease runs out without a renewal. A replacement refused by the management API (the `400` answers below) changes nothing at all. A replacement written into the config file behaves differently: an unparsable line is ignored while an upstream is working, but a line that parses and is refused only for now becomes the pending setting. The working upstream keeps carrying traffic meanwhile, the kit keeps re-checking the new line, and it takes over as soon as a later check approves it.
- **The body is small and strictly framed.** A missing `Content-Length` is 411, and a *declared* `Content-Length` over 4096 is 413 — the check is on the header, before the body is read. This is not a channel for anything but a URL.
- **Health answers almost any method.** The health route matches on path alone, so every method except `OPTIONS` reaches it; `OPTIONS` is answered 204 with CORS headers before routing, which is what makes browser preflight work against the management API.
- **A local exit makes your own machine the exit** (`hoody egress local start`). It binds a loopback port inside the container over hoody-tunnel, points the upstream at it, and terminates SOCKS5 on your side, so requests leave from the machine the CLI is running on. Nothing listens on that machine; every socket it opens is outbound. Destinations are gated to public IPv4 by default, every resolved A record is authorised, and the pinned address is what gets dialled, so DNS rebinding cannot redirect a connection after approval. **Only destination ports 80 and 443 are allowed by default**, so SSH, database or `:8080` traffic through the exit is refused; widen it with `--allow-ports 22,443,5432` (or `"*"` for any). `--allow-private` admits private and loopback destinations, and `--dns` picks the resolvers.
- **A local exit refuses to clobber an existing upstream.** If the container already has one configured, which includes one currently reported as `state: "unavailable"`, `hoody egress local start` fails with `local exit: this container already has an upstream (<scheme>://<host>:<port>)` instead of replacing it (when the kit reports no address for the upstream, the message says so in place of the address), because teardown clears the upstream and the kit never returns credentials, so an authenticated upstream it replaced could not be put back automatically. Clear a stale one first with `hoody egress upstream disable`, or pass `--replace-upstream` to take the container over knowingly; when that exit stops, the container goes back to its own IP, not to the proxy it displaced.
- **A dead loopback port breaks every request.** If a local exit dies without clearing the upstream, the container keeps pointing at a port that no longer answers and every request through its egress fails until the upstream is cleared. Recover with `hoody --container <id> egress upstream disable`.
- **The URL — credentials included — is a command-line argument.** `hoody egress upstream set` has no stdin, file, or environment form; `--input` is rejected for this command. The full URL therefore lands in shell history and is visible in `ps` while the command runs. On a shared machine, set the upstream through the SDK (its upstream.set method) or with a raw HTTP `PUT /api/v1/egress/upstream` whose body is read from a mode-`0600` file instead.
- **Browsers need a PAC file, not the manual proxy fields.** The connection to the proxy is itself TLS, so the manual host-and-port fields open a plaintext connection that the edge refuses with 400. A PAC file returning `HTTPS host:443` works in both Chrome and Firefox.

## Common errors

Errors come from two surfaces that answer differently. The management surface always sends a body: `text/plain` for every error except the 404, which is JSON, and every body ends with a trailing newline, so match on prefix or substring rather than equality. Most framing and forwarding errors send no response body and no `Content-Type`; the exceptions are a destination-policy refusal (403) and an unavailable configured upstream (502), which both carry a `text/plain` body. The status line still arrives with headers, always including `Vary: Origin` and `Connection: close`.

**Management surface** (path-form requests: `/api/v1/egress/upstream`, `/api/v1/egress/upstream/renew` and the route catch-all):

- 400 — the following causes, each with its own `text/plain` body: `Invalid upstream URL` when the value does not parse or its scheme is not one of the four, `Upstream destination not permitted` when it parses but every address it resolves to is refused by the destination guard, `Upstream unresolvable` when the host did not resolve inside the connect timeout (transient, worth a retry, and distinct from the previous one), `Failed to read body` when the read fails or times out, and `Body must be UTF-8`. A set request can also return `Invalid lease: give whole seconds from 5 to 3600`, or `A lease needs an upstream URL` when a lease accompanies an empty or `disabled` body. The OpenAPI 400 description names the same bodies; it is documentation, not additional wire text. A refused or unresolvable replacement leaves a working upstream in force, so a 400 here does not mean the container lost its exit.
- 404 — a path-form target that is not a management route, and the one JSON error: `{"error":"not found"}` with `Content-Type: application/json`. It is never forwarded, so it means the request was addressed to the proxy rather than through it.
- 400 — `Missing or invalid lease_id` on a renewal whose `lease_id` is absent or is not 1 to 64 ASCII letters and digits.
- 405 — `Method Not Allowed` for any verb on the upstream route other than `GET`, `PUT`, `POST`, or `DELETE`, and for any verb but `POST` on the renew route. `OPTIONS` never reaches it; it is answered 204 before routing.
- 411 — `Missing Content-Length` on a set request.
- 413 — `Body too large` when the declared `Content-Length` exceeds 4096 bytes.
- 409 — `No upstream lease with this id is in force` on a renewal: the lease already expired, the upstream was replaced or disabled, or the config file no longer holds that lease. Nothing is rewritten, so the old upstream is not revived. Set the upstream again, with a new lease, if it is still wanted.
- 500 — `Failed to write config` when persisting the upstream file fails, on set, clear and renewal alike, and `Failed to read config` when a renewal cannot read it. The in-memory upstream is swapped only after a successful write, so after a 500 the previous setting still applies.

**Proxy data path and request framing.** Most of these send no response body; the two policy answers below (403, and the 502 whose body names an unavailable upstream) are the exceptions, and both carry `Content-Type: text/plain` plus CORS headers.

- 400 — an oversized or truncated header block, a bad request line, an invalid `CONNECT` authority, or a non-`CONNECT` target that is neither absolute-form `http://` nor asterisk-form `*`. An `https://` URL sent without `CONNECT` lands here. Asterisk-form is the one non-absolute target that forwards: `*` with a `Host` header is sent to the authority the header names; without one it is a 400. Header lines themselves never trigger it: a line with no colon is silently skipped, not rejected. IPv6 spellings split across 400 and 403: a bracketed authority must hold a plain IPv6 address, so `[fe80::1%eth0]`, `[example.com]` and `[]` are malformed authorities (400) rejected before any lookup, while a well-formed `[2606:4700::1111]` is a policy refusal (403). An unbracketed literal such as `CONNECT ::1:443` is also a 400.
- 403 — `destination not permitted`, the destination guard's refusal, on `CONNECT` and absolute-URI forwarding alike. With no upstream in force it covers private, loopback, link-local, CGNAT, benchmarking, documentation, TEST-NET, multicast and reserved IPv4. On every path it covers an IPv6 literal destination and a name this kit resolves that has no IPv4 address (the kit is IPv4-only); a name handed to a `socks5h`, `http` or `https` upstream is resolved by that exit instead. Nothing turns it off, so retrying or changing client is pointless: use a public IPv4 destination. The body is identical whether or not anything is listening there, so it is not a port scanner. One stated limitation: for a body-bearing forward the request body is written before the response is read, so an early refusal during a large upload can reach the client as a connection close rather than a 403.
- 408 — request headers not completed within the read timeout.
- 502 — `configured upstream proxy is unavailable` when an upstream is configured but has no approved address (refused, unresolvable, or unparsable text). The destination is not even resolved, and the request is never sent directly instead, so this status is the kit refusing to leak a request out of the container's own IP after you asked for an exit. Read `state` on `GET /api/v1/egress/upstream` to confirm, and either fix the address or clear the upstream. Every other 502 has no body: the outbound connection failed, the destination was unreachable, the chained upstream refused or timed out, or no valid response came back. It is also the answer when the client's own request body breaks mid-forward: a malformed chunk size or chunk ending fails inside the forwarding path, and the outer handler reports every forwarding failure as 502, so a bad client body reads the same as a dead upstream. A 502 is not always a standalone response either: after the `CONNECT` 200 has been sent, or after a forwarded response has started, a relay failure appends the 502 to the bytes already written. With an upstream set and `state: "active"`, a bodyless 502 on every request usually means the upstream itself is dead; see the dead-loopback quirk.
- 503 — the concurrent-connection cap is reached.

## Related namespaces

`tunnel` for the opposite direction (exposing a local service through the container). `proxy.containerPermissions` for gating the endpoint, which matters more here than almost anywhere else because the URL is the only credential. `proxy.aliases` to hand out a hostname that does not carry the container id. `api` for container firewall rules, whose `firewall/egress` routes govern packet filtering and are unrelated to this service despite the shared word.

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
hoody --container "$C" egress upstream set 'socks5h://user:pass@proxy.example.com:1080'
hoody --container "$C" egress upstream get -o json
# {"enabled":true,"state":"active","scheme":"socks5h","host":"proxy.example.com","port":1080,"auth":true,...}
hoody --container "$C" egress upstream disable       # alias: disable; `set` refuses
                                                   # an empty URL, so clear is the way back
```

The setting lands in the config file atomically and is picked up within about a second (see Quirks). Re-run the exit check from #1: the reported address flips to the upstream's, and back after the clear. `auth: true` is the only trace of the credentials — they are never returned.

### 3. Make your own machine the exit — a local exit

**Goal:** turn the container's egress URL into a proxy whose traffic leaves from the machine you are sitting at. Needs the container's tunnel kit running; nothing listens on your machine (see Quirks).

```bash
hoody login --web --no-browser           # browser sign-in; the tunnel WebSocket authenticates with your account token
hoody --container "$C" egress local start
#   Proxy URL:     https://P-C-egress.N.containers.hoody.com
#   Exit IP:       203.0.113.42 (SG)  confirmed
# Ctrl+C tears it down and then the CLI exits, which closes the tunnel. On a clean
# teardown the upstream is cleared and the container is back on its own IP. If the
# clear failed, the container is left pointing at a dead port and the CLI prints
# the fix: hoody --container "$C" egress upstream disable
# If only the read-back could not confirm the clear, check with `egress upstream get`.
```

While the exit runs, treat the proxy URL like a password: anyone holding it relays through your connection.

### 4. The takeover guard, and the deliberate override

**Goal:** understand why a local exit refuses to start, and take a container over knowingly. Teardown deletes the upstream and credentials can never be read back, so silently replacing a third-party proxy would destroy it (see Quirks).

```bash
hoody --container "$C" egress local start
# Failed to start local exit: local exit: this container already has an upstream
# (socks5h://proxy.example.com:1080). Stopping this exit would clear it, and its
# credentials cannot be read back to restore it. Clear it first, or pass
# replaceExistingUpstream/--replace-upstream to take it over.

hoody --container "$C" egress local start --replace-upstream    # take it over knowingly
```

The check-then-set is not atomic — the guard protects against accidents, not races. The helper's teardown re-reads the upstream and compares scheme, host, port and `auth` before clearing, so it leaves an upstream that is visibly someone else's alone and prints `Left the upstream alone: another exit has taken this container over.`; a replacement that matches on all four is indistinguishable from this exit's own, because the kit reports only `auth: true` and never credential identity. That needs a stale handle to reach: two live exits cannot share the container's loopback port, so it takes an exit whose listener is already gone, its port reused by a newer exit, and a late teardown on the old handle. When an exit started with the override stops cleanly, the container returns to its own IP, not to the proxy it displaced.

## Reference

### `hoody egress` (6) — Container egress proxy — outbound HTTP/CONNECT with an optional upstream

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody egress health` |  | read | Egress service health | `egress.kit.getHealth` | `hoody egress health` |
| `hoody egress local start` |  | action | Publish this machine's IP as the container's HTTPS proxy exit (long-running, Ctrl+C to stop) |  | `hoody egress local start` |
| `hoody egress upstream disable` |  | destructive | Stop chaining through an upstream; egress goes direct | `egress.upstream.disable` | `hoody egress upstream disable` |
| `hoody egress upstream get` |  | read | Show the upstream proxy the container chains through | `egress.upstream.get` | `hoody egress upstream get` |
| `hoody egress upstream renew` |  | action | Renew the upstream lease, pushing its deadline out by its ttl from now | `egress.upstream.renewLease` | `hoody egress upstream renew --lease-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody egress upstream set` |  | action | Route the container's egress through an upstream proxy | `egress.upstream.set` | `hoody egress upstream set socks5h://user:pass@host:1080 --lease 10` |

