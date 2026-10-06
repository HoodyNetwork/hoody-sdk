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
import { expose, pull, serve, } from './tunnel-client.js';
const PATCH_MARKER = Symbol.for('hoody.sdk.tunnel.service.extensions');
/** Set on each client's `tunnel` service by lib/hoody-client.ts: the client that owns it. */
export const TUNNEL_OWNER = Symbol.for('hoody.sdk.tunnel.owner');
/** The tunnel WebSocket URL and kit credential this service's client resolves. */
function resolveConnection(service, method, opts) {
    const vars = opts.serviceIndex !== undefined ? { serviceIndex: opts.serviceIndex } : {};
    // buildTemplateUrl returns the bare path when the client has no container
    // to fill the host template with (a client that is not container-scoped).
    const base = service.buildTemplateUrl('/api/v1/tunnel/connect', vars);
    if (!/^https?:\/\//i.test(base)) {
        throw new Error(`tunnel.${method}: needs a container-scoped client — ` +
            `(await hoody.withContainer(container)).tunnel.${method}(...)`);
    }
    const url = base.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
    const owner = service[TUNNEL_OWNER];
    // Read at call time: onKitAuthExpired replaces the client's kitAuth in place.
    const kitAuth = opts.kitAuth ?? owner?.kitAuth;
    return kitAuth ? { url, kitAuth } : { url };
}
function driverOptions(opts) {
    const { kitAuth: _kitAuth, serviceIndex: _serviceIndex, ...rest } = opts;
    return rest;
}
export function patchTunnelServiceExtensions() {
    const proto = TunnelService.prototype;
    if (proto[PATCH_MARKER])
        return;
    proto[PATCH_MARKER] = true;
    TunnelService.prototype.expose = async function (opts) {
        return expose({ ...driverOptions(opts), ...resolveConnection(this, 'expose', opts) });
    };
    TunnelService.prototype.pull = async function (opts) {
        return pull({ ...driverOptions(opts), ...resolveConnection(this, 'pull', opts) });
    };
    TunnelService.prototype.serve = async function (opts) {
        return serve({ ...driverOptions(opts), ...resolveConnection(this, 'serve', opts) });
    };
}
