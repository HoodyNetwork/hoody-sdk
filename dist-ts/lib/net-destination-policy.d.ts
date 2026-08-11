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
/** Injectable resolver seam so the gate is unit-testable without DNS. */
export type DnsLookup = (hostname: string) => Promise<string[]>;
export interface DestinationPolicy {
    /** Refuse private, loopback, link-local, CGNAT and reserved space. Default true. */
    blockPrivate?: boolean;
    /** Extra IPv4 CIDRs to refuse, applied after `blockPrivate`. */
    denyCidrs?: string[];
    /** Destination ports the proxy will dial. Default `[80, 443]`; `'*'` allows any. */
    allowPorts?: number[] | '*';
    /**
     * Resolvers to use for destination lookups, e.g. `['1.1.1.1', '9.9.9.9']`.
     *
     * Because this proxy resolves on the operator's machine, the default is
     * whatever that machine uses, which sends every destination name to their ISP
     * or corporate resolver. Setting this keeps lookups on a chosen resolver
     * instead. Addresses may carry a port (`1.1.1.1:5353`).
     */
    dnsServers?: string[];
}
export interface ResolvedDestination {
    /** The hostname as requested, for logging. */
    host: string;
    /** The authorized address. Dial THIS, never re-resolve `host`. */
    ip: string;
    port: number;
}
export type DenyReason = 'private-destination-blocked' | 'port-not-allowed' | 'dns-failed' | 'ipv6-unsupported'
/** The policy itself is unusable, so nothing can be authorized against it. */
 | 'policy-invalid';
export declare class DestinationDeniedError extends Error {
    readonly reason: DenyReason;
    constructor(reason: DenyReason, message: string);
}
/**
 * True for anything that is not a routable public IPv4 address.
 *
 * Deliberately inclusive: unknown or unparseable input returns true (deny), so a
 * malformed address cannot slip through the gate it is supposed to fail.
 */
export declare function isPrivateAddress(ip: string): boolean;
/** Exposed for tests and for callers that rotate policy at runtime. */
export declare function clearDnsCache(): void;
/**
 * Authorize a destination and return the address to dial.
 *
 * Throws `DestinationDeniedError` rather than returning a flag, so a caller that
 * forgets to check cannot accidentally proceed.
 */
export declare function resolveAndAuthorize(host: string, port: number, policy?: DestinationPolicy, opts?: {
    timeoutMs?: number;
    signal?: AbortSignal;
    lookup?: DnsLookup;
}): Promise<ResolvedDestination>;
