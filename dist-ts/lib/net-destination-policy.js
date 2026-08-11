/**
 * Destination policy for the local exit proxy.
 *
 * The local exit proxy dials from the USER'S machine, so an unguarded
 * destination is not "some server on the internet" — it is anything that machine
 * can reach, including the home LAN, the router's admin page, a NAS, and
 * loopback services. This module is the gate.
 *
 * The rule that matters: **resolve first, authorize every resolved address, then
 * dial the pinned IP.** Checking the hostname string is not a gate. `nas.local`
 * is obvious, but `totally-public.example.com` with an A record of `192.168.1.1`
 * is not, and a string check waves it straight through. Dialling the hostname
 * after authorizing it is also unsafe: the second lookup can return a different
 * address than the one that was approved (DNS rebinding). So the caller receives
 * an IP and connects to that.
 */
import { lookup as dnsLookup, Resolver } from 'node:dns/promises';
import * as net from 'node:net';
export class DestinationDeniedError extends Error {
    reason;
    constructor(reason, message) {
        super(message);
        this.name = 'DestinationDeniedError';
        this.reason = reason;
    }
}
const DEFAULT_ALLOW_PORTS = [80, 443];
/**
 * True for anything that is not a routable public IPv4 address.
 *
 * Deliberately inclusive: unknown or unparseable input returns true (deny), so a
 * malformed address cannot slip through the gate it is supposed to fail.
 */
export function isPrivateAddress(ip) {
    // IPv6 is refused wholesale elsewhere; treat any v6 form as non-public here so
    // this function is never the thing that lets one through.
    if (net.isIPv6(ip))
        return true;
    if (!net.isIPv4(ip))
        return true;
    const parts = ip.split('.').map((n) => Number(n));
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
        return true;
    }
    const [a, b, c, d] = parts;
    if (a === 0)
        return true; // 0.0.0.0/8   this network
    if (a === 10)
        return true; // 10/8        private
    if (a === 127)
        return true; // 127/8       loopback
    if (a === 169 && b === 254)
        return true; // 169.254/16  link-local
    if (a === 172 && b >= 16 && b <= 31)
        return true; // 172.16/12 private
    if (a === 192 && b === 168)
        return true; // 192.168/16  private
    if (a === 100 && b >= 64 && b <= 127)
        return true; // 100.64/10 CGNAT
    if (a === 198 && (b === 18 || b === 19))
        return true; // 198.18/15 benchmarking
    if (a >= 224)
        return true; // 224/4 multicast, 240/4 reserved, 255.255.255.255
    // The reserved documentation and protocol-assignment ranges are /24s, and the
    // rest of each surrounding /16 is ordinary routable space. Matching on the
    // first two octets blocked all of 192.0/16, 198.51/16 and 203.0/16, which
    // quietly made real destinations unreachable through the proxy — a refusal
    // this side, with nothing at the destination to explain it.
    // 192.0.0.0/24 is special-purpose, but IANA marks 192.0.0.9 (Port Control
    // Protocol anycast) and 192.0.0.10 (Traversal Using Relays anycast) as
    // globally reachable. Blocking the whole /24 refuses two real public
    // destinations.
    if (a === 192 && b === 0 && c === 0)
        return !(d === 9 || d === 10);
    if (a === 192 && b === 0 && c === 2)
        return true; // TEST-NET-1
    if (a === 198 && b === 51 && c === 100)
        return true; // TEST-NET-2
    if (a === 203 && b === 0 && c === 113)
        return true; // TEST-NET-3
    if (a === 192 && b === 88 && c === 99)
        return true; // 6to4 relay anycast
    return false;
}
/** Parse `a.b.c.d/len` into a matcher. Returns null when unparseable. */
function parseCidr(cidr) {
    const [addr, lenRaw] = cidr.split('/');
    if (!addr || !net.isIPv4(addr))
        return null;
    const len = lenRaw === undefined ? 32 : Number(lenRaw);
    if (!Number.isInteger(len) || len < 0 || len > 32)
        return null;
    const octets = addr.split('.').map(Number);
    const base = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
    const mask = len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0;
    return { base: (base & mask) >>> 0, mask };
}
function inCidr(ip, cidr) {
    const parsed = parseCidr(cidr);
    if (!parsed)
        return false;
    const o = ip.split('.').map(Number);
    if (o.length !== 4 || o.some((n) => !Number.isInteger(n)))
        return false;
    const value = ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
    return ((value & parsed.mask) >>> 0) === parsed.base;
}
function portAllowed(port, allow) {
    if (allow === '*')
        return true;
    const list = allow ?? DEFAULT_ALLOW_PORTS;
    return list.includes(port);
}
const defaultLookup = async (hostname) => {
    // `all: true` so EVERY answer is authorized, not just the first. A name with
    // one public and one private address must be refused, not accepted on the
    // strength of whichever record happened to sort first.
    const records = await dnsLookup(hostname, { all: true, verbatim: true });
    return records.map((r) => r.address);
};
/**
 * Resolver cache keyed by the server list, so a custom resolver is built once
 * rather than per request.
 */
const resolverCache = new Map();
function resolverFor(servers) {
    const key = servers.join(',');
    let r = resolverCache.get(key);
    if (!r) {
        r = new Resolver();
        r.setServers(servers);
        resolverCache.set(key, r);
    }
    return r;
}
/**
 * Look up A records through an explicit resolver.
 *
 * `dns.lookup` consults the OS (and therefore /etc/hosts and the system
 * resolver) and cannot be pointed at a server, so a custom resolver has to use
 * `resolve4`. The trade-off is deliberate: naming a resolver means naming where
 * lookups go, and honouring /etc/hosts would undermine that.
 */
function makeCustomLookup(servers) {
    return async (hostname) => resolverFor(servers).resolve4(hostname);
}
/**
 * Short-lived resolution cache.
 *
 * A proxy resolves the same handful of hosts over and over; without this, every
 * single request pays a full lookup. Measured on a 60-request run against one
 * host: 60 lookups, and one of them exceeded the 5s cap and failed the request.
 *
 * Only the RESOLUTION is cached, never the authorization decision. Policy is
 * re-applied to the cached addresses on every call, so tightening `denyCidrs` or
 * flipping `blockPrivate` takes effect immediately rather than after the TTL.
 * Caching the resolution is safe because callers dial the pinned address anyway:
 * a record that changes mid-TTL cannot redirect an in-flight connection.
 */
const DNS_TTL_MS = 30_000;
const DNS_CACHE_MAX = 512;
const dnsCache = new Map();
function cacheGet(host) {
    const hit = dnsCache.get(host);
    if (!hit)
        return undefined;
    if (hit.expires <= Date.now()) {
        dnsCache.delete(host);
        return undefined;
    }
    // Refresh insertion order so the eviction below is roughly LRU.
    dnsCache.delete(host);
    dnsCache.set(host, hit);
    return hit.addrs;
}
function cacheSet(host, addrs) {
    if (dnsCache.size >= DNS_CACHE_MAX) {
        const oldest = dnsCache.keys().next().value;
        if (oldest !== undefined)
            dnsCache.delete(oldest);
    }
    dnsCache.set(host, { addrs, expires: Date.now() + DNS_TTL_MS });
}
/** Exposed for tests and for callers that rotate policy at runtime. */
export function clearDnsCache() {
    dnsCache.clear();
}
/**
 * Authorize a destination and return the address to dial.
 *
 * Throws `DestinationDeniedError` rather than returning a flag, so a caller that
 * forgets to check cannot accidentally proceed.
 */
export async function resolveAndAuthorize(host, port, policy = {}, opts = {}) {
    const blockPrivate = policy.blockPrivate !== false;
    if (!portAllowed(port, policy.allowPorts)) {
        throw new DestinationDeniedError('port-not-allowed', `port ${port} is not allowed`);
    }
    // An IPv6 literal never reaches the dialer: the SOCKS5 layer rejects ATYP=4,
    // and a v6 answer from DNS is dropped below.
    if (net.isIPv6(host)) {
        throw new DestinationDeniedError('ipv6-unsupported', 'IPv6 destinations are not supported');
    }
    let candidates;
    if (net.isIPv4(host)) {
        candidates = [host];
    }
    else {
        const lookupFn = opts.lookup ??
            (policy.dnsServers && policy.dnsServers.length > 0
                ? makeCustomLookup(policy.dnsServers)
                : defaultLookup);
        const timeoutMs = opts.timeoutMs ?? 5_000;
        // Never cache an injected test resolver. Custom DNS servers get their own
        // cache namespace, since the same name can resolve differently per resolver.
        const useCache = opts.lookup === undefined;
        // `servers|host` collides: a raw SOCKS domain of "1.1.1.1:53|victim.test"
        // produces the same key as looking up "victim.test" through resolver
        // 1.1.1.1:53, so one could be served the other's cached answer. A NUL
        // separator cannot appear in either half.
        const cacheKey = policy.dnsServers?.length
            // NUL separates the two components because it cannot occur in either, so
            // no (resolvers, host) pair can be spelled two ways. With a printable
            // separator, ['a'] + 'b|c' and ['a|b'] + 'c' both key to 'a|b|c'.
            //
            // Measured 2026-08-11: that collision is currently UNREACHABLE through the
            // public API — a hostname containing '|' fails resolution with EBADNAME so
            // it never reaches the cache, and a resolver entry containing '|' is
            // rejected by setServers with ERR_INVALID_IP_ADDRESS. A mutation reverting
            // this to '|' therefore survives the whole suite, and no test can pin it.
            // Kept anyway: it costs one character and it stops being free the moment
            // either validation loosens. Do not "simplify" it back.
            ? `${policy.dnsServers.join(',')}\u0000${host}`
            : `\u0000${host}`;
        const cached = useCache ? cacheGet(cacheKey) : undefined;
        if (cached) {
            candidates = cached;
        }
        else {
            const attempt = async () => {
                let timer;
                try {
                    return await Promise.race([
                        lookupFn(host),
                        new Promise((_, reject) => {
                            timer = setTimeout(() => reject(new DestinationDeniedError('dns-failed', `DNS timeout for ${host}`)), timeoutMs);
                        }),
                    ]);
                }
                finally {
                    if (timer)
                        clearTimeout(timer);
                }
            };
            try {
                candidates = await attempt();
            }
            catch (first) {
                // One retry: a single slow or dropped UDP packet should not fail a
                // request outright. A genuinely unresolvable name fails twice, fast.
                try {
                    candidates = await attempt();
                }
                catch {
                    if (first instanceof DestinationDeniedError)
                        throw first;
                    throw new DestinationDeniedError('dns-failed', `cannot resolve ${host}`);
                }
            }
            if (useCache)
                cacheSet(cacheKey, candidates);
        }
    }
    const v4 = candidates.filter((ip) => net.isIPv4(ip));
    if (v4.length === 0) {
        throw new DestinationDeniedError('dns-failed', `no IPv4 address for ${host}`);
    }
    if (blockPrivate) {
        // EVERY answer must pass. One private record poisons the name: accepting the
        // public one and dialling it still lets an attacker flip the record between
        // this check and a later lookup.
        const offender = v4.find((ip) => isPrivateAddress(ip));
        if (offender) {
            throw new DestinationDeniedError('private-destination-blocked', `${host} resolves to a non-public address (${offender})`);
        }
    }
    for (const cidr of policy.denyCidrs ?? []) {
        // A deny rule that cannot be parsed must not quietly become an allow.
        // `inCidr` answers "not in range" for anything unparseable, so a typo like
        // `198.20.0.0/33`, or a whole comma-separated list passed as one element,
        // used to disable exactly the range the operator was trying to exclude —
        // silently, with the destination then permitted because it is syntactically
        // public. Refuse instead: an over-broad refusal is visible and recoverable,
        // an inert security control is neither.
        if (!parseCidr(cidr)) {
            throw new DestinationDeniedError('policy-invalid', `denyCidrs contains an unparseable rule (${JSON.stringify(cidr)}); refusing the destination rather than ignoring the rule`);
        }
        const hit = v4.find((ip) => inCidr(ip, cidr));
        if (hit) {
            throw new DestinationDeniedError('private-destination-blocked', `${host} resolves into denied range ${cidr} (${hit})`);
        }
    }
    // Return the first authorized address. The caller dials this, so the address
    // that was checked is the address that is used.
    return { host, ip: v4[0], port };
}
