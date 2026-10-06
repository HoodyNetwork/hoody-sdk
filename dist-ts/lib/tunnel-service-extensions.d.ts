/**
 * Tunnel data plane on a container-scoped client: `box.tunnel.expose()`,
 * `box.tunnel.pull()` and `box.tunnel.serve()`.
 *
 * The generated TunnelService covers the kit's REST surface only. These
 * helpers wrap the package-root drivers (lib/tunnel-client.ts) and take the
 * two things a caller otherwise builds by hand from the client that owns the
 * service: the tunnel WebSocket URL (the same host the REST calls use) and the
 * kit credential (`kitAuth` given to `withContainer()` or the client config).
 *
 * Node / Bun only: patched from lib/index.ts, never from the browser entry,
 * because the drivers open raw sockets.
 */
import type { ProxyAuth, ProxyAuthPolicy } from './proxy-auth.js';
import { type ExposeOptions, type PullOptions, type ServeOptions, type TunnelHandle } from './tunnel-client.js';
/** Set on each client's `tunnel` service by lib/hoody-client.ts: the client that owns it. */
export declare const TUNNEL_OWNER: unique symbol;
/** Where the scoped helpers differ from the package-root ones: no `url`, `container` or `token`. */
type Scoped<T> = Omit<T, 'url' | 'container' | 'token' | 'kitAuth'> & {
    /** Kit credential for this tunnel only. Defaults to the client's `kitAuth`. */
    kitAuth?: ProxyAuth | ProxyAuthPolicy;
    /** Tunnel kit instance (`tunnel-<n>`). Default 1. */
    serviceIndex?: number;
};
export type ScopedTunnelExposeOptions = Scoped<ExposeOptions>;
export type ScopedTunnelPullOptions = Scoped<PullOptions>;
export type ScopedTunnelServeOptions = Scoped<ServeOptions>;
declare module '../generated/tunnel/tunnel.service.js' {
    interface TunnelService {
        /**
         * Expose a local HTTP / WebSocket service on a container port.
         * Requires a container-scoped client (`await hoody.withContainer(container)`).
         */
        expose(opts: ScopedTunnelExposeOptions): Promise<TunnelHandle>;
        /**
         * Bind a container-loopback port to a local TCP service.
         * Requires a container-scoped client (`await hoody.withContainer(container)`).
         */
        pull(opts: ScopedTunnelPullOptions): Promise<TunnelHandle>;
        /**
         * Run a `fetch` handler locally (Bun only) and expose it on a container port.
         * Requires a container-scoped client (`await hoody.withContainer(container)`).
         */
        serve(opts: ScopedTunnelServeOptions): Promise<TunnelHandle & {
            url: string;
        }>;
    }
}
export declare function patchTunnelServiceExtensions(): void;
export {};
