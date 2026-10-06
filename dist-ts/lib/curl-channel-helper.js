/**
 * curl-channel — high-level helper that derives the multiplexed channel URL
 * from a HoodyClient and opens a {@link CurlChannel}.
 *
 * Usage:
 *
 *   const scoped = await client.withContainer({ project, container });
 *   const ch = await scoped.curl.channel.connect();
 *   const fetch = createCurlFetch({ url: ch.url, channel: ch });
 *   const res = await fetch('https://api.example.com/x');
 *
 * The helper:
 *   • derives `wss://<projectId>-<containerId>-curl-<idx>.<server>.<containersDomain>/api/v1/curl/channel`
 *     from `client.urlTemplates['curl']` (set by `withContainer()`).
 *   • or uses `opts.url` verbatim — the test escape hatch + custom-routing
 *     surface for non-Hoody-hosted curl bridges.
 *
 * The curl-channel WS route at `/api/v1/curl/channel` has no in-process auth
 * (verified in the upstream curl protocol). Where a Hoody Proxy permission
 * rule guards the curl service, the kit credential is the client's `kitAuth`
 * (its `curl` entry for a policy) or `opts.kitAuth`, applied to the upgrade
 * the way lib/kit-ws-auth.ts describes: headers in Node/Bun, `?token=` in a
 * browser. The account token is never sent.
 *
 * Channel limits (`opts.limits`) are the server's own query parameters on the
 * channel URL (hoody-curl `ChannelQuery`); the server clamps each one.
 */
import { ChannelService } from '../generated/curl/channel.service.js';
import { ownerOf } from './service-owner.js';
import { CurlChannel } from './curl-channel-client.js';
import { clientKitAuth, kitAuthForNamespace, kitAuthWebSocketParts } from './kit-ws-auth.js';
const CURL_CHANNEL_PATCH_MARKER = Symbol.for('hoody.sdk.curl.channel.patch');
const LIMIT_PARAMS = [
    ['maxConcurrentStreams', 'max_concurrent_streams'],
    ['maxQueue', 'max_queue'],
    ['maxFrameBytes', 'max_frame_bytes'],
    ['maxRequestBytes', 'max_request_bytes'],
    ['chunkBytes', 'chunk_bytes'],
    ['streamTimeoutSecs', 'stream_timeout_secs'],
    ['idleTimeoutSecs', 'idle_timeout_secs'],
    ['maxOutboundMessages', 'max_outbound_messages'],
];
function applyLimits(url, limits) {
    if (!limits)
        return url;
    const u = new URL(url);
    for (const [key, param] of LIMIT_PARAMS) {
        const value = limits[key];
        if (value === undefined)
            continue;
        if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
            throw new Error(`curl.channel.connect(): limits.${key} must be a non-negative integer, got ${String(value)}`);
        }
        u.searchParams.set(param, String(value));
    }
    return u.toString();
}
/**
 * Resolve the full connection plan: URL (limits and, in a browser, the
 * `?token=` credential applied) plus the upgrade headers (Node/Bun).
 * Exported for unit tests.
 */
export function resolveCurlChannelConnection(client, opts = {}) {
    const base = applyLimits(assembleCurlChannelUrl(client, opts), opts.limits);
    const auth = kitAuthForNamespace(opts.kitAuth ?? (opts.url ? undefined : clientKitAuth(client)), 'curl');
    return kitAuthWebSocketParts(base, auth, 'curl.channel.connect()');
}
/**
 * Assemble the curl channel `wss://` URL from a HoodyClient. Exported for
 * unit tests and advanced consumers; NOT re-exported as part of the root
 * SDK public API — the stable public surface is `client.curl.channel.connect(opts)`.
 */
export function assembleCurlChannelUrl(client, opts = {}) {
    if (opts.url)
        return opts.url;
    const serviceIndex = opts.serviceIndex ?? 1;
    // Prefer reading urlTemplates['curl'] set by `client.withContainer(...)` —
    // the same path terminal-exec.ts:182 uses. This avoids round-tripping
    // through `getKitUrl` (which throws on container===null and re-derives
    // pieces we already have in the template).
    const tpl = client.urlTemplates?.['curl'];
    const projectId = opts.projectId ?? tpl?.projectId;
    const containerId = opts.containerId ?? tpl?.containerId;
    // Templates expose both `server` and `serverName`; the curl URL template
    // uses `serverName` (verified at generated/client.ts:878). Accept either.
    const server = opts.server ?? tpl?.serverName ?? tpl?.server;
    if (!projectId || !containerId || !server) {
        throw new Error('curl.channel.connect() requires either { url } or a container-scoped client ' +
            '(call client.withContainer({ project, container }) first) or ' +
            'explicit { projectId, containerId, server } in opts. Got: ' +
            JSON.stringify({ projectId, containerId, server }));
    }
    const domain = typeof client.resolveContainersDomain ===
        'function'
        ? client.resolveContainersDomain()
        : 'containers.hoody.com';
    return `wss://${projectId}-${containerId}-curl-${serviceIndex}.${server}.${domain}/api/v1/curl/channel`;
}
export function patchCurlChannelPrototype() {
    const prototype = ChannelService.prototype;
    if (prototype[CURL_CHANNEL_PATCH_MARKER])
        return;
    prototype['connect'] = async function (opts = {}) {
        const client = ownerOf(this, 'curl.channel.connect');
        const { url, headers } = resolveCurlChannelConnection(client, opts);
        const channelOptions = {
            url,
            ...(Object.keys(headers).length > 0 ? { headers } : {}),
            ...(opts.binary !== undefined ? { binary: opts.binary } : {}),
            ...(opts.hooks !== undefined ? { hooks: opts.hooks } : {}),
            ...(opts.reconnect !== undefined ? { reconnect: opts.reconnect } : {}),
            ...(opts.helloTimeoutMs !== undefined
                ? { helloTimeoutMs: opts.helloTimeoutMs }
                : {}),
            ...(opts.pingIntervalMs !== undefined
                ? { pingIntervalMs: opts.pingIntervalMs }
                : {}),
            ...(opts.silenceInsecureTransportWarning !== undefined
                ? {
                    silenceInsecureTransportWarning: opts.silenceInsecureTransportWarning,
                }
                : {}),
        };
        return CurlChannel.open(channelOptions);
    };
    prototype[CURL_CHANNEL_PATCH_MARKER] = true;
}
