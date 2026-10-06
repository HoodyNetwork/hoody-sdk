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

import { TunnelService } from '../generated/tunnel/tunnel.service.js';
import type { ProxyAuth, ProxyAuthPolicy } from './proxy-auth.js';
import {
  expose,
  pull,
  serve,
  type ExposeOptions,
  type PullOptions,
  type ServeOptions,
  type TunnelHandle,
} from './tunnel-client.js';

const PATCH_MARKER = Symbol.for('hoody.sdk.tunnel.service.extensions');
/** Set on each client's `tunnel` service by lib/hoody-client.ts: the client that owns it. */
export const TUNNEL_OWNER = Symbol.for('hoody.sdk.tunnel.owner');

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
    serve(opts: ScopedTunnelServeOptions): Promise<TunnelHandle & { url: string }>;
  }
}

/** The tunnel WebSocket URL and kit credential this service's client resolves. */
function resolveConnection(
  service: TunnelService,
  method: string,
  opts: { kitAuth?: ProxyAuth | ProxyAuthPolicy; serviceIndex?: number },
): { url: string; kitAuth?: ProxyAuth | ProxyAuthPolicy } {
  const vars = opts.serviceIndex !== undefined ? { serviceIndex: opts.serviceIndex } : {};
  // buildTemplateUrl returns the bare path when the client has no container
  // to fill the host template with (a client that is not container-scoped).
  const base = (service as unknown as {
    buildTemplateUrl(path: string, v: Record<string, string | number | undefined>): string;
  }).buildTemplateUrl('/api/v1/tunnel/connect', vars);
  if (!/^https?:\/\//i.test(base)) {
    throw new Error(
      `tunnel.${method}: needs a container-scoped client — ` +
      `(await hoody.withContainer(container)).tunnel.${method}(...)`,
    );
  }
  const url = base.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
  const owner = (service as unknown as Record<symbol, unknown>)[TUNNEL_OWNER] as
    { kitAuth?: ProxyAuth | ProxyAuthPolicy } | undefined;
  // Read at call time: onKitAuthExpired replaces the client's kitAuth in place.
  const kitAuth = opts.kitAuth ?? owner?.kitAuth;
  return kitAuth ? { url, kitAuth } : { url };
}

function driverOptions<T extends { kitAuth?: unknown; serviceIndex?: number }>(opts: T) {
  const { kitAuth: _kitAuth, serviceIndex: _serviceIndex, ...rest } = opts;
  return rest;
}

export function patchTunnelServiceExtensions(): void {
  const proto = TunnelService.prototype as unknown as Record<string | symbol, unknown>;
  if (proto[PATCH_MARKER]) return;
  proto[PATCH_MARKER] = true;

  TunnelService.prototype.expose = async function (this: TunnelService, opts: ScopedTunnelExposeOptions) {
    return expose({ ...driverOptions(opts), ...resolveConnection(this, 'expose', opts) });
  };
  TunnelService.prototype.pull = async function (this: TunnelService, opts: ScopedTunnelPullOptions) {
    return pull({ ...driverOptions(opts), ...resolveConnection(this, 'pull', opts) });
  };
  TunnelService.prototype.serve = async function (this: TunnelService, opts: ScopedTunnelServeOptions) {
    return serve({ ...driverOptions(opts), ...resolveConnection(this, 'serve', opts) });
  };
}
