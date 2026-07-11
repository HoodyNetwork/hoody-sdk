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
import type { ChannelHooks, ReconnectOptions } from './curl-channel-client.js';
export interface CurlChannelHelperOptions {
    /**
     * Override the derived `wss://` URL. When set, all other URL-deriving fields
     * are ignored — useful for tests pointing at a local binary and for custom
     * routing (e.g. a TLS-terminating proxy in front of curl).
     */
    url?: string;
    /**
     * Container scope. Omit when the client is already container-scoped via
     * `client.withContainer({ project, container })` — the helper reads
     * `client.urlTemplates['curl']` in that case.
     */
    containerId?: string;
    projectId?: string;
    /** Server slug, e.g. `code-sg-sin-1`. Required only with explicit ids. */
    server?: string;
    /** Service index (replica slot). Default 1, matching the curl URL template. */
    serviceIndex?: number;
    /** Channel-level hooks (onOpen/onClose/onReconnecting/…). */
    hooks?: ChannelHooks;
    /** Auto-reconnect configuration. Pass `{ enabled: false }` to opt out. */
    reconnect?: ReconnectOptions;
    /** Initial hello-frame timeout, in milliseconds. Default 10 s. */
    helloTimeoutMs?: number;
    /** Keepalive ping interval, in milliseconds. Default 30 s. */
    pingIntervalMs?: number;
    /** Suppress the `ws://` plaintext-credential warning (tests / loopback). */
    silenceInsecureTransportWarning?: boolean;
}
/**
 * Assemble the curl channel `wss://` URL from a HoodyClient. Exported for
 * unit tests and advanced consumers; NOT re-exported as part of the root
 * SDK public API — the stable public surface is `client.curlChannel(opts)`.
 */
export declare function assembleCurlChannelUrl(client: HoodyClient, opts?: CurlChannelHelperOptions): string;
declare module './hoody-client.js' {
    interface HoodyClient {
        /**
         * Open a {@link CurlChannel} against this client's container kit. Returns
         * a Promise that resolves once the hello frame has arrived (the channel
         * is ready to accept `request()` calls).
         *
         * See `lib/curl-channel-helper.ts` for the full options surface.
         */
        curlChannel(opts?: CurlChannelHelperOptions): Promise<CurlChannel>;
    }
}
export declare function patchCurlChannelPrototype(): void;
