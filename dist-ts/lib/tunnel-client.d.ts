/**
 * High-level tunnel API: expose(), pull(), serve(). One-call wrappers that
 * build a TunnelSession, perform connect + bind, and install local
 * forwarding (HTTP fetch / TCP / Bun.serve) so callers don't have to wire
 * the lower-level protocol pieces themselves.
 */
import { TunnelSession, type BindResult } from "./tunnel-session.js";
import { type LocalTarget } from "./tunnel-http-pump.js";
export type { LocalTarget } from "./tunnel-http-pump.js";
export type { ConnectOptions, BindOptions, BindResult, JoinTicket, ResumedBind, HelloResult } from "./tunnel-session.js";
export interface ExposeOptions {
    /** Container tunnel WebSocket URL or container hostname. */
    container?: string;
    /** Full WebSocket URL (overrides container). */
    url?: string;
    /** Bearer token for tunnel authentication. */
    token: string;
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
    token: string;
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
    token: string;
    /** Port to expose on the container. Use 0 for auto-assigned random port. */
    containerPort: number;
    /** Bun.serve-compatible fetch handler. */
    fetch: (req: Request) => Response | Promise<Response>;
}
export interface TunnelHandle {
    /** Underlying tunnel session. */
    session: TunnelSession;
    /** Bind result with assigned port and optional publicUrl. */
    bind: BindResult;
    /** Public URL for the exposed service (from BIND_OK). */
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
