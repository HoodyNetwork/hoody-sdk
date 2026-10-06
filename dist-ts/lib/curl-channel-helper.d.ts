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
import type { HoodyClient } from './hoody-client.js';
import { CurlChannel } from './curl-channel-client.js';
import type { ChannelHooks, ReconnectOptions } from './curl-channel-client.js';
import type { ProxyAuth, ProxyAuthPolicy } from './proxy-auth.js';
import { type KitWebSocketParts } from './kit-ws-auth.js';
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
    /** Server slug, e.g. `code-example-1`. Required only with explicit ids. */
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
    /** Binary-frame fast path (default true). `false` forces the text protocol. */
    binary?: boolean;
    /**
     * Kit credential for the upgrade (kitAuth shape). Defaults to the client's
     * own `kitAuth` (its `curl` entry for a policy) when the URL is derived;
     * with an explicit `url` only this option is used.
     */
    kitAuth?: ProxyAuth | ProxyAuthPolicy;
    /** Per-channel limits, sent as the server's channel query parameters. */
    limits?: CurlChannelLimits;
}
/** hoody-curl channel limits (`ChannelQuery`); the server clamps each value. */
export interface CurlChannelLimits {
    /** Concurrent streams on this channel (`max_concurrent_streams`). */
    maxConcurrentStreams?: number;
    /** Queued requests beyond the concurrency limit (`max_queue`). */
    maxQueue?: number;
    /** Largest single frame, bytes (`max_frame_bytes`). */
    maxFrameBytes?: number;
    /** Largest request body, bytes (`max_request_bytes`). */
    maxRequestBytes?: number;
    /** Response body chunk size, bytes (`chunk_bytes`). */
    chunkBytes?: number;
    /** Per-stream timeout, seconds (`stream_timeout_secs`). */
    streamTimeoutSecs?: number;
    /** Channel idle timeout, seconds (`idle_timeout_secs`). */
    idleTimeoutSecs?: number;
    /** Outbound message buffer, messages (`max_outbound_messages`). */
    maxOutboundMessages?: number;
}
/**
 * Resolve the full connection plan: URL (limits and, in a browser, the
 * `?token=` credential applied) plus the upgrade headers (Node/Bun).
 * Exported for unit tests.
 */
export declare function resolveCurlChannelConnection(client: HoodyClient, opts?: CurlChannelHelperOptions): KitWebSocketParts;
/**
 * Assemble the curl channel `wss://` URL from a HoodyClient. Exported for
 * unit tests and advanced consumers; NOT re-exported as part of the root
 * SDK public API — the stable public surface is `client.curl.channel.connect(opts)`.
 */
export declare function assembleCurlChannelUrl(client: HoodyClient, opts?: CurlChannelHelperOptions): string;
declare module '../generated/curl/channel.service.js' {
    interface ChannelService {
        /**
         * Open a {@link CurlChannel} against this client's container kit. Returns
         * a Promise that resolves once the hello frame has arrived (the channel
         * is ready to accept `request()` calls).
         *
         * See `lib/curl-channel-helper.ts` for the full options surface.
         */
        connect(opts?: CurlChannelHelperOptions): Promise<CurlChannel>;
    }
}
export declare function patchCurlChannelPrototype(): void;
