/**
 * High-level tunnel API: expose(), pull(), serve(). One-call wrappers that
 * build a TunnelSession, perform connect + bind, and install local
 * forwarding (HTTP fetch / TCP / Bun.serve) so callers don't have to wire
 * the lower-level protocol pieces themselves.
 */
import type { ProxyAuth, ProxyAuthPolicy } from "./proxy-auth.js";
import { TunnelSession, type BindResult, type ResumedBind, type HelloResult } from "./tunnel-session.js";
import { type LocalTarget } from "./tunnel-http-pump.js";
export type { LocalTarget } from "./tunnel-http-pump.js";
export type { ConnectOptions, BindOptions, BindResult, JoinTicket, ResumedBind, HelloResult } from "./tunnel-session.js";
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
/**
 * High-level convenience: start a local Bun.serve + connect + expose.
 */
export declare function serve(opts: ServeOptions): Promise<TunnelHandle & {
    url: string;
}>;
/** Re-export for direct low-level access. */
export { TunnelSession } from "./tunnel-session.js";
/** Re-export connect for the tunnel namespace */
export { TunnelSession as connect } from "./tunnel-session.js";
