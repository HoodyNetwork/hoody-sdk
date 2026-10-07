/**
 * High-level tunnel API: expose(), pull(), serve(). One-call wrappers that
 * build a TunnelSession, perform connect + bind, and install local
 * forwarding (HTTP fetch / TCP / Bun.serve) so callers don't have to wire
 * the lower-level protocol pieces themselves.
 */
import type { ProxyAuth, ProxyAuthPolicy } from "./proxy-auth.js";
import { TunnelSession, type BindResult, type ResumedBind, type HelloResult, type TunnelCloseInfo } from "./tunnel-session.js";
import { type LocalTarget } from "./tunnel-http-pump.js";
export type { LocalTarget } from "./tunnel-http-pump.js";
export type { ConnectOptions, BindOptions, BindResult, JoinTicket, ResumedBind, HelloResult, TunnelCloseInfo } from "./tunnel-session.js";
export { TunnelSessionError } from "./tunnel-session.js";
export interface ExposeOptions {
    /**
     * Tunnel kit hostname (`PROJECT-CONTAINER-tunnel-1.SERVER.containers.hoody.com`)
     * or its URL. Not a container id. On a `withContainer()` client,
     * `box.tunnel.expose()` resolves this for you.
     */
    container?: string;
    /** Full WebSocket URL (overrides container). */
    url?: string;
    /**
     * @deprecated Ignored and never sent — the tunnel kit does not read it,
     * and sending the account token leaked it to the container. Use `kitAuth`.
     */
    token?: string;
    /** Kit credential for the proxy's tunnel permission rule (see ConnectOptions.kitAuth). */
    kitAuth?: ProxyAuth | ProxyAuthPolicy;
    /** Port to expose on the container. Use 0 for auto-assigned random port. */
    containerPort: number;
    /** Local target to forward traffic to. */
    to: LocalTarget;
    /** Evict any existing binding on the same port. */
    takeover?: boolean;
}
export interface PullOptions {
    container?: string;
    url?: string;
    /**
     * @deprecated Ignored and never sent — the tunnel kit does not read it,
     * and sending the account token leaked it to the container. Use `kitAuth`.
     */
    token?: string;
    /** Kit credential for the proxy's tunnel permission rule (see ConnectOptions.kitAuth). */
    kitAuth?: ProxyAuth | ProxyAuthPolicy;
    /** Port to bind on container loopback. Use 0 for auto-assigned random port. */
    containerPort: number;
    /** Local target to forward traffic to. */
    to: LocalTarget;
    /** Loopback host (default 127.0.0.1). */
    host?: string;
}
export interface ServeOptions {
    container?: string;
    url?: string;
    /**
     * @deprecated Ignored and never sent — the tunnel kit does not read it,
     * and sending the account token leaked it to the container. Use `kitAuth`.
     */
    token?: string;
    /** Kit credential for the proxy's tunnel permission rule (see ConnectOptions.kitAuth). */
    kitAuth?: ProxyAuth | ProxyAuthPolicy;
    /** Port to expose on the container. Use 0 for auto-assigned random port. */
    containerPort: number;
    /** Bun.serve-compatible fetch handler. */
    fetch: (req: Request) => Response | Promise<Response>;
}
/**
 * The tunnel WebSocket URL for a `container` option: a hostname, or an
 * http(s)/ws(s) URL of the tunnel kit. A DNS name gets `wss://`, since the
 * public edge serves TLS only. Loopback, IP literals and single-label hosts
 * (a kit reached directly on a private network) keep plain `ws://`.
 */
export declare function tunnelConnectUrl(container: string): string;
/**
 * The public URL of a container port exposed through the tunnel kit at
 * `kitUrl` (any form `container` or `url` accepts): the kit's host
 * `<project>-<container>-tunnel-<n>.<server>.<domain>` gives
 * `https://<project>-<container>-http-<port>.<server>.<domain>`, the proxy's
 * route to that port (kit catalog `http-{port}`). For the BIND_OK of a kit
 * run without HOODY_TUNNEL_PUBLIC_URL_PATTERN, whose `publicUrl` is null.
 * Undefined for a host of any other shape (a kit reached directly).
 */
export declare function exposedPortUrl(kitUrl: string, containerPort: number): string | undefined;
export interface TunnelHandle {
    /** Underlying tunnel session. */
    session: TunnelSession;
    /** Bind result with assigned port and optional publicUrl. */
    bind: BindResult;
    /** Public URL for the exposed service: BIND_OK's, else `exposedPortUrl()`'s. */
    publicUrl?: string | undefined;
    /** Close the tunnel session. */
    close(): Promise<void>;
    [Symbol.asyncDispose](): Promise<void>;
}
/**
 * High-level convenience: connect + expose in one call.
 *
 * Use `containerPort: 0` for auto-assigned random port.
 * Returns the public URL in `handle.publicUrl`.
 */
export declare function expose(opts: ExposeOptions): Promise<TunnelHandle>;
export interface ResumeExposeOptions {
    /** As ExposeOptions.container. */
    container?: string;
    /** Full WebSocket URL (overrides container). */
    url?: string;
    /** Kit credential for the proxy's tunnel permission rule (see ConnectOptions.kitAuth). */
    kitAuth?: ProxyAuth | ProxyAuthPolicy;
    /** The dropped session's id (`TunnelSession.id`, read while it was connected). */
    sessionId: string;
    /** Local target the resumed EXPOSE binds forward to. */
    to: LocalTarget;
    /** Abort the attempt: see ResumeControl.signal. */
    signal?: AbortSignal;
    /** See ResumeControl.handshakeTimeoutMs. */
    handshakeTimeoutMs?: number;
}
/** How a caller bounds and cancels one resume attempt. */
export interface ResumeControl {
    /**
     * Aborting ends the attempt for good: its socket is closed and its timers
     * cleared, and if the kit had already resumed the session its binds are
     * released (UNBIND) without one stream reaching the local target. The call
     * then rejects with `TunnelResumeAbortedError`.
     */
    signal?: AbortSignal;
    /** Give up on HELLO_OK after this long (the session's own limit is 30 s). */
    handshakeTimeoutMs?: number;
}
/** A resume attempt was aborted through its `signal`. */
export declare class TunnelResumeAbortedError extends Error {
    constructor();
}
export interface ResumedTunnel {
    session: TunnelSession;
    /** HELLO_OK: `resumed` is true; `resumedBinds` are the binds the session holds again. */
    hello: HelloResult;
    /**
     * `hello.resumedBinds`, each EXPOSE bind with the public URL expose() gives
     * it (HELLO_OK carries none, so `exposedPortUrl()`'s).
     */
    binds: Array<ResumedBind & {
        publicUrl?: string | undefined;
    }>;
    close(): Promise<void>;
    [Symbol.asyncDispose](): Promise<void>;
}
/**
 * Reclaim a dropped session while the kit still parks it with its bindings
 * (its `takeover_grace`, during which the port answers ALREADY_BOUND to anyone
 * else): HELLO with `resume.sessionId`, then the same forwarding expose()
 * installs, to `to`. Never takes a port over.
 *
 * Resolves null when the kit answered but did not resume (the grace is over or
 * the id is unknown); the fresh session it opened instead is closed. Throws
 * when there was no HELLO_OK (unreachable, or "resume grace expired").
 */
export declare function resumeExpose(opts: ResumeExposeOptions): Promise<ResumedTunnel | null>;
/**
 * High-level convenience: connect + pull in one call.
 */
export declare function pull(opts: PullOptions): Promise<TunnelHandle>;
export interface ResumePullOptions {
    /** As PullOptions.container. */
    container?: string;
    /** Full WebSocket URL (overrides container). */
    url?: string;
    /** Kit credential for the proxy's tunnel permission rule (see ConnectOptions.kitAuth). */
    kitAuth?: ProxyAuth | ProxyAuthPolicy;
    /** The dropped session's id (`TunnelSession.id`, read while it was connected). */
    sessionId: string;
    /** Local TCP target the resumed PULL binds forward to. */
    to: LocalTarget;
    /** Abort the attempt: see ResumeControl.signal. */
    signal?: AbortSignal;
    /** See ResumeControl.handshakeTimeoutMs. */
    handshakeTimeoutMs?: number;
}
/**
 * resumeExpose() for a pull() session: reclaim a dropped session while the kit
 * still parks it, and forward its resumed PULL binds' TCP streams to `to`.
 * Resolves null when the kit answered but did not resume; throws when there
 * was no HELLO_OK.
 */
export declare function resumePull(opts: ResumePullOptions): Promise<ResumedTunnel | null>;
/** How long the kit parks a dropped session's binds by default (`--takeover-grace`). */
export declare const TUNNEL_RESUME_WINDOW_MS = 60000;
export interface KeepTunnelAliveOptions {
    /** Which driver opened the tunnel: decides how resumed binds forward. */
    mode: "expose" | "pull";
    /** As ExposeOptions.container. */
    container?: string;
    /** Full WebSocket URL (overrides container). */
    url?: string;
    /** Kit credential for the proxy's tunnel permission rule (see ConnectOptions.kitAuth). */
    kitAuth?: ProxyAuth | ProxyAuthPolicy;
    /** Local target the binds forward to. */
    to: LocalTarget;
    /** How long after a drop to keep trying to resume. Default: the kit's 60 s hold. */
    resumeWindowMs?: number;
    /** First delay between attempts (default 500 ms); it doubles up to `maxRetryDelayMs` (default 5 s). */
    retryDelayMs?: number;
    maxRetryDelayMs?: number;
    /** The connection dropped; a resume is about to be tried. */
    onLost?: (info: TunnelCloseInfo) => void;
    /** One resume attempt failed and another will follow. */
    onRetry?: (attempt: number, error: Error) => void;
    /** The session is back, with its binds. */
    onResumed?: (session: TunnelSession) => void;
}
/** How a kept tunnel ended. */
export interface TunnelEnd {
    /** True when `close()` ended it. False when it dropped and could not be resumed. */
    deliberate: boolean;
    /** Why it ended, in words. */
    reason: string;
    /** `RESUME_EXPIRED` when a drop could not be resumed before the hold ran out. */
    code?: "RESUME_EXPIRED";
}
export interface KeptTunnel {
    /** The current session: replaced after each successful resume. */
    readonly session: TunnelSession;
    /** Settles (never rejects) when the tunnel is over. */
    readonly ended: Promise<TunnelEnd>;
    /** Close the tunnel for good, releasing its binds. */
    close(): Promise<void>;
}
/**
 * Keep an expose() / pull() tunnel up across connection drops. When the
 * session drops without `close()`, the kit parks its binds for the takeover
 * grace; this reconnects with the session id inside that window so the same
 * ports keep serving. `ended` settles with the reason once the tunnel is over:
 * a deliberate close, or a drop that could not be resumed in time.
 */
export declare function keepTunnelAlive(handle: {
    session: TunnelSession;
    close(): Promise<void>;
}, opts: KeepTunnelAliveOptions): KeptTunnel;
/**
 * High-level convenience: start a local Bun.serve + connect + expose.
 * Bun only: it runs the handler with `Bun.serve`.
 */
export declare function serve(opts: ServeOptions): Promise<TunnelHandle & {
    url: string;
}>;
/** Re-export for direct low-level access. */
export { TunnelSession } from "./tunnel-session.js";
/** Re-export connect for the tunnel namespace */
export { TunnelSession as connect } from "./tunnel-session.js";
