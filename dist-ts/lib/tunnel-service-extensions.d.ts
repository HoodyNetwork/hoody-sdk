/**
 * Tunnel data plane on a computer-scoped client: `box.tunnel.expose()`,
 * `box.tunnel.pull()` and `box.tunnel.serve()`.
 *
 * The generated TunnelService covers the kit's REST surface only. These
 * helpers wrap the package-root drivers (lib/tunnel-client.ts) and take the
 * two things a caller otherwise builds by hand from the client that owns the
 * service: the tunnel WebSocket URL (the same host the REST calls use) and the
 * kit credential (`kitAuth` given to `withComputer()` or the client config).
 *
 * Node / Bun only: patched from lib/index.ts, never from the browser entry,
 * because the drivers open raw sockets.
 */
import type { ProxyAuth, ProxyAuthPolicy } from './proxy-auth.js';
import { type ExposeOptions, type PullOptions, type ServeOptions, type TunnelHandle } from './tunnel-client.js';
/** Set on each client's `tunnel` service by lib/hoody-client.ts: the client that owns it. */
export declare const TUNNEL_OWNER: unique symbol;
/** Where the scoped helpers differ from the package-root ones: no `url` or `computer`. */
type Scoped<T> = Omit<T, 'url' | 'computer' | 'kitAuth'> & {
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
         * Expose a local HTTP / WebSocket service on a computer port.
         * Requires a computer-scoped client (`await hoody.withComputer(computer)`).
         */
        expose(opts: ScopedTunnelExposeOptions): Promise<TunnelHandle>;
        /**
         * Bind a computer-loopback port to a local TCP service.
         * Requires a computer-scoped client (`await hoody.withComputer(computer)`).
         */
        pull(opts: ScopedTunnelPullOptions): Promise<TunnelHandle>;
        /**
         * Run a `fetch` handler locally (Bun only) and expose it on a computer port.
         * Requires a computer-scoped client (`await hoody.withComputer(computer)`).
         */
        serve(opts: ScopedTunnelServeOptions): Promise<TunnelHandle & {
            url: string;
        }>;
    }
}
/**
 * Install `expose()`, `pull()` and `serve()` on the generated tunnel service (`box.tunnel`). Each
 * takes the tunnel URL and the kit credential from the client that owns the service, and throws
 * when that client is not scoped to a computer. Calling it again does nothing.
 */
export declare function patchTunnelServiceExtensions(): void;
export {};
