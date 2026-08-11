/**
 * SOCKS5 server (RFC 1928 + RFC 1929), terminated in-process.
 *
 * This is the engine behind the local exit proxy: hoody-egress inside the
 * container chains to `socks5h://127.0.0.1:<port>`, that port is a hoody-tunnel
 * PULL bind, and every accepted connection arrives here as a stream. We speak
 * SOCKS5 on it and dial the destination from THIS machine, so the exit IP is the
 * local one.
 *
 * The transport is abstracted behind `Socks5Stream` rather than taking a
 * TunnelSession directly, so the protocol machine is exercised by unit tests with
 * no kit, no sockets, and no network.
 *
 * Only CONNECT is implemented. BIND and UDP ASSOCIATE are refused, and IPv6
 * destinations are refused, which keeps the authorization surface to one code
 * path in net-destination-policy.
 */
import { type DestinationPolicy, type DenyReason, type DnsLookup } from './net-destination-policy.js';
export interface Socks5Credentials {
    username: string;
    password: string;
}
/**
 * Transport seam. One instance per client connection.
 *
 * `write` resolves when the peer has accepted the bytes, which is what gives the
 * relay its backpressure: the tunnel implementation returns a promise that
 * settles on flow-control credit.
 */
export interface Socks5Stream {
    write(bytes: Uint8Array): Promise<void>;
    /**
     * Signal "no more bytes from us" WITHOUT tearing the stream down.
     *
     * TCP half-close is not a synonym for close. When the origin sends FIN the
     * client may still be uploading, so the conversation has to survive one
     * direction ending. `end()` detaches the transport, which made an origin
     * half-close destroy the client's still-open upload path.
     */
    endWrite(): void;
    end(): void;
    reset(reason: string): void;
    onData(cb: (bytes: Uint8Array) => void | Promise<void>): void;
    onEnd(cb: () => void): void;
    onReset(cb: () => void): void;
}
export type Socks5DenyReason = DenyReason | 'auth-failed' | 'not-socks5' | 'no-acceptable-auth' | 'command-unsupported' | 'concurrency-limit' | 'connect-timeout' | 'idle-timeout' | 'refused' | 'unreachable' | 'handshake-too-large'
/** Peer kept sending after the destination socket signalled it was full. */
 | 'backpressure-exceeded'
/** Peer closed before the handshake produced a destination. Not a success. */
 | 'client-closed';
export interface Socks5ConnectEvent {
    host: string;
    port: number;
    /** The address actually dialled. Absent when the request never got that far. */
    resolvedIp?: string | undefined;
    ok: boolean;
    reason?: Socks5DenyReason | undefined;
    /**
     * What actually went wrong, when the reason alone does not say.
     *
     * `unreachable` is the catch-all arm of the errno mapping, so on its own it
     * covers everything from a TLS-less ECONNRESET to a send failure on the
     * tunnel. Operators debugging a proxy need the distinction, and so did the
     * first live run of this code.
     */
    detail?: string | undefined;
    bytesUp?: number | undefined;
    bytesDown?: number | undefined;
    durationMs?: number | undefined;
}
export interface Socks5ServerOptions {
    /**
     * REQUIRED. There is no anonymous mode: the loopback port is reachable by every
     * process inside the container, so an unauthenticated listener would hand the
     * user's home connection to anything running there.
     */
    auth: Socks5Credentials;
    policy?: DestinationPolicy;
    /**
     * Concurrent conversations, counted from stream creation. Default 128.
     *
     * Deliberately not "concurrent upstream sockets": a stream that is still
     * handshaking costs a slot too, otherwise stalled peers are invisible to the
     * cap and can accumulate without limit.
     */
    maxConcurrent?: number;
    /** TCP connect timeout. Node's default is minutes; this is not. Default 10s. */
    connectTimeoutMs?: number;
    /** Idle relay timeout. Default 300s, matching the kit's own idle timeout. */
    idleTimeoutMs?: number;
    /**
     * Deadline for completing the SOCKS5 handshake. Default 30s.
     *
     * Without it a stream that connects and then says nothing lives forever: the
     * idle timer only starts at relay, so a peer that stalls mid-greeting is never
     * collected. Every process inside the container can reach the loopback port,
     * so that is a cheap way to pin the operator's proxy.
     */
    handshakeTimeoutMs?: number;
    onConnect?: (event: Socks5ConnectEvent) => void;
    lookup?: DnsLookup;
}
/** Shared across all streams of one server so the cap is global, not per-stream. */
export interface Socks5ServerState {
    active: number;
}
export declare function createServerState(): Socks5ServerState;
/**
 * Drive one SOCKS5 conversation on `stream`.
 *
 * Returns a handle so the owner can tear the connection down (session close,
 * server shutdown) without waiting for the peer.
 */
export declare function handleSocks5Stream(stream: Socks5Stream, opts: Socks5ServerOptions, state?: Socks5ServerState): {
    close(reason?: string): void;
};
