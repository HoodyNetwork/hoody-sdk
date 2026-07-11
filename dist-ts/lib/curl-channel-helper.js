/**
 * curl-channel — high-level helper that derives the multiplexed channel URL
 * from a HoodyClient and opens a {@link CurlChannel}.
 *
 * Usage:
 *
 *   const scoped = client.withContainer({ project, container });
 *   const ch = await scoped.curlChannel();
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
 * (verified in the upstream curl protocol) —
 * the capability URL itself is the credential, mediated by the Hoody Proxy.
 */
import { HoodyClient } from './hoody-client.js';
import { CurlChannel } from './curl-channel-client.js';
const CURL_CHANNEL_PATCH_MARKER = Symbol.for('hoody.sdk.curl.channel.patch');
/**
 * Assemble the curl channel `wss://` URL from a HoodyClient. Exported for
 * unit tests and advanced consumers; NOT re-exported as part of the root
 * SDK public API — the stable public surface is `client.curlChannel(opts)`.
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
        throw new Error('curlChannel() requires either { url } or a container-scoped client ' +
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
    const prototype = HoodyClient.prototype;
    if (prototype[CURL_CHANNEL_PATCH_MARKER])
        return;
    prototype.curlChannel = async function (opts = {}) {
        const url = assembleCurlChannelUrl(this, opts);
        return CurlChannel.open({
            url,
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
        });
    };
    prototype[CURL_CHANNEL_PATCH_MARKER] = true;
}
