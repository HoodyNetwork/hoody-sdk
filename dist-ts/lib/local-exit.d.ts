/**
 * Local exit proxy: publish a computer's HTTPS proxy, exit from this machine.
 *
 * Chain, outermost first:
 *
 *   client ──HTTPS proxy──> <computer>-egress.<server>.computers.hoody.com
 *          └─ hoody-egress, upstream = socks5h://127.0.0.1:<port>
 *                └─ hoody-tunnel PULL bind on computer loopback
 *                      └─ WebSocket to this process
 *                            └─ SOCKS5 terminated here, destination dialled locally
 *
 * Nothing listens on this machine. The only local sockets are outbound: one
 * WebSocket to the kit, and one TCP connection per proxied request.
 *
 * The computer URL is the credential, per Hoody's capability-URL model. Anyone
 * holding it can relay through this machine, so treat it like a password and set
 * proxy permissions when it is going somewhere untrusted.
 */
import type { DestinationPolicy } from './net-destination-policy.js';
import type { Socks5ConnectEvent } from './socks5-server.js';
import type { ProxyAuth, ProxyAuthPolicy } from './proxy-auth.js';
/**
 * The computer to exit through: one of the SDK's own computer responses (computers.get /
 * create / a computers.list item) unchanged, or a hand-built object. Every field is optional
 * in the type because the responses declare them so (`id?: string`, `project_id?: string`,
 * `server_name?: string | null`, `server` a server-details object or null); id, a project id
 * and a server name are required at runtime and their absence is refused before anything is wired.
 */
export interface LocalExitComputerLike {
    id?: string;
    project_id?: string;
    projectId?: string;
    server?: string | {
        name?: string | null;
    } | null;
    server_name?: string | null;
}
export interface LocalExitOptions {
    /** Authenticated account client. */
    client: any;
    computer: LocalExitComputerLike;
    /**
     * Kit credential for a computer whose proxy permission rules require one, used
     * for the tunnel and the egress calls. Defaults to the client's own `kitAuth`.
     */
    kitAuth?: ProxyAuth | ProxyAuthPolicy;
    /** Loopback port inside the computer. 0 or omitted = kernel-assigned. */
    computerPort?: number;
    policy?: DestinationPolicy;
    /** Create a proxy alias so the handed-out URL carries no computer id. */
    alias?: string | true;
    /** Confirm the exit IP through the platform's IP service (the client's getIpUrl()) after wiring. Default true. */
    verify?: boolean;
    /**
     * Take over a computer that already has an upstream configured.
     *
     * Off by default: teardown clears the upstream, and the kit never returns
     * credentials, so an upstream replaced here cannot be put back.
     */
    replaceExistingUpstream?: boolean;
    maxConcurrent?: number;
    connectTimeoutMs?: number;
    idleTimeoutMs?: number;
    onConnect?: (event: Socks5ConnectEvent) => void;
    /**
     * Called if the tunnel session ends on its own. The exit is dead at that
     * point; the upstream has already been cleared before this fires.
     */
    onSessionLost?: (info: {
        upstreamCleared: boolean;
    }) => void;
}
export interface LocalExitVerification {
    /** Exit IP as seen by the platform's IP service THROUGH the proxy. */
    exitIp: string;
    /** This machine's IP measured directly, bypassing the proxy. */
    localIp: string;
    /** True when the proxy's exit matches this machine: the property that matters. */
    matches: boolean;
    country?: string | undefined;
    asn?: string | undefined;
}
export interface LocalExitTeardownReport {
    upstreamCleared: boolean;
    upstreamVerified: boolean;
    /**
     * Teardown deliberately left the upstream in place: it belongs to another
     * exit now.
     *
     * A separate field because it cannot be derived. `upstreamVerified` cannot
     * carry it: it would mean "nothing of OURS is set" in this case and "the
     * upstream is off" everywhere else, and a reader of the second meaning would
     * announce "Computer restored (upstream cleared)." for a computer knowingly
     * left running someone else's proxy. Inferring it from
     * `upstreamVerified && !upstreamCleared` is also wrong: that pair occurs when
     * every clear attempt threw but the read-back independently showed the
     * upstream already off, which is a real clear, not a handover.
     */
    upstreamHandedOver: boolean;
    tunnelClosed: boolean;
    aliasRemoved: boolean;
    errors: Array<{
        step: string;
        message: string;
    }>;
}
/**
 * Thrown when startup fails AND the computer was left with this run's upstream
 * still set.
 *
 * The unwind deliberately does not drop the tunnel in that state: closing it
 * would guarantee the dead-port condition the ordering exists to avoid. But
 * throwing a bare Error then stranded the tunnel — no handle was ever returned,
 * so an SDK caller that stays alive had a live WebSocket it could not reach.
 * ("The tunnel dies with the process" is true of the CLI and false of the SDK.)
 * This carries the escape hatch with the failure.
 */
export declare class LocalExitStartupError extends Error {
    /** Always false: this error exists precisely for the not-cleared case. */
    readonly upstreamCleared = false;
    /** The loopback port the computer is still pointing at. */
    readonly computerPort: number | undefined;
    /**
     * Close the tunnel this failed start left open. Idempotent, and never throws.
     *
     * Doing so leaves the computer pointing at a port that no longer answers, so
     * clear the upstream first if you can.
     */
    readonly closeTunnel: () => Promise<void>;
    constructor(message: string, opts: {
        cause?: unknown;
        computerPort?: number | undefined;
        closeTunnel: () => Promise<void>;
    });
}
export interface LocalExitHandle {
    /** The HTTPS proxy URL to hand out. */
    proxyUrl: string;
    /** Alias hostname when one was created. */
    aliasUrl?: string | undefined;
    computerPort: number;
    verification?: LocalExitVerification | undefined;
    getActiveStreamCount(): number;
    verifyExit(): Promise<LocalExitVerification>;
    stop(): Promise<LocalExitTeardownReport>;
    /**
     * Close the tunnel even if the upstream could not be cleared.
     *
     * `stop()` deliberately holds the tunnel open in that case so the computer
     * keeps working. That would otherwise pin a long-lived caller's event loop
     * forever when clearing keeps failing; this is the escape hatch. The returned
     * report still says whether the computer was left dirty.
     */
    forceStop(): Promise<LocalExitTeardownReport>;
    /** `await using` support; attached only where the runtime has `Symbol.asyncDispose` (Node 20.4+, Bun). */
    [Symbol.asyncDispose](): Promise<void>;
}
/**
 * The IP service of the client's own platform: `https://ip.<platform domain>`.
 *
 * It was one fixed host, so an account on any other platform confirmed its exit against
 * a different platform's service, from this machine and through the computer. The client's own
 * getIpUrl() is the answer when it has one (HoodyClient derives it from its base URL); a client
 * without it gets the same derivation from the base URL every other URL here comes from.
 * Exported for the unit test; not part of the package entry.
 */
export declare function ipServiceUrl(client: any, baseUrl: string): string;
/**
 * Bring up the local exit.
 *
 * Ordering is deliberate: the tunnel is bound and serving BEFORE the upstream is
 * pointed at it, so hoody-egress is never configured to dial a port that does not
 * answer. Teardown reverses it.
 */
export declare function startLocalExit(opts: LocalExitOptions): Promise<LocalExitHandle>;
/**
 * True once a chunked body has its terminating zero-size chunk.
 *
 * Searching for the literal `\r\n0\r\n` misses the forms RFC 9112 allows —
 * `0;ext=value` and any zero written with leading digits (`00`) — so a
 * conforming response would never be recognised as finished and the read hung
 * until the timeout.
 */
export declare function chunkedBodyComplete(payload: Buffer): boolean;
/**
 * Reassemble a `Transfer-Encoding: chunked` body.
 *
 * Exported for tests: framing is where a hand-rolled HTTP reader goes wrong, and
 * the failure mode is a hang rather than an error.
 */
export declare function decodeChunked(payload: Buffer): string;
/** What {@link readProxiedResponse} found: `pending` (keep reading), `complete` (body in hand) or `error`. */
export type ProxiedResponse = {
    kind: 'pending';
} | {
    kind: 'complete';
    status: number;
    text: string;
} | {
    kind: 'error';
    message: string;
};
/**
 * Decide whether a proxied HTTP response is complete, and read its body.
 *
 * Reads one HTTP/1.x response from `body`, the bytes received so far: `pending` until the headers and the whole
 * body are in, `complete` with the status and the decoded text, or `error` for a response that cannot be trusted
 * (malformed status line, conflicting or invalid Content-Length). Interim 1xx responses other than 101 are
 * skipped, and Transfer-Encoding wins over Content-Length.
 *
 * Pure and synchronous, and separate from the socket reader so the framing rules can be tested directly.
 */
export declare function readProxiedResponse(body: Buffer): ProxiedResponse;
/**
 * Issue a request through an HTTPS proxy using only Node builtins.
 *
 * `fetch` cannot be pointed at a proxy per-call without a dispatcher, and a
 * dispatcher means a dependency. So this speaks CONNECT directly over TLS: one
 * TLS session to the proxy, `CONNECT host:443`, then a second TLS session inside
 * it to the origin. That is exactly what a browser does, and it keeps the SDK
 * dependency-free.
 */
export declare function fetchThroughProxy(proxyUrl: string, targetUrl: string, connectHeaders?: Record<string, string>): Promise<any>;
