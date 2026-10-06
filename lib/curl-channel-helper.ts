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
import { ChannelService } from '../generated/curl/channel.service.js';
import { ownerOf } from './service-owner.js';
import { CurlChannel } from './curl-channel-client.js';
import type {
  ChannelHooks,
  ChannelOptions,
  ReconnectOptions,
} from './curl-channel-client.js';
import type { ProxyAuth, ProxyAuthPolicy } from './proxy-auth.js';
import { clientKitAuth, kitAuthForNamespace, kitAuthWebSocketParts, type KitWebSocketParts } from './kit-ws-auth.js';

const CURL_CHANNEL_PATCH_MARKER = Symbol.for('hoody.sdk.curl.channel.patch');

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

const LIMIT_PARAMS: Array<[keyof CurlChannelLimits, string]> = [
  ['maxConcurrentStreams', 'max_concurrent_streams'],
  ['maxQueue', 'max_queue'],
  ['maxFrameBytes', 'max_frame_bytes'],
  ['maxRequestBytes', 'max_request_bytes'],
  ['chunkBytes', 'chunk_bytes'],
  ['streamTimeoutSecs', 'stream_timeout_secs'],
  ['idleTimeoutSecs', 'idle_timeout_secs'],
  ['maxOutboundMessages', 'max_outbound_messages'],
];

function applyLimits(url: string, limits: CurlChannelLimits | undefined): string {
  if (!limits) return url;
  const u = new URL(url);
  for (const [key, param] of LIMIT_PARAMS) {
    const value = limits[key];
    if (value === undefined) continue;
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
export function resolveCurlChannelConnection(
  client: HoodyClient,
  opts: CurlChannelHelperOptions = {},
): KitWebSocketParts {
  const base = applyLimits(assembleCurlChannelUrl(client, opts), opts.limits);
  const auth = kitAuthForNamespace(opts.kitAuth ?? (opts.url ? undefined : clientKitAuth(client)), 'curl');
  return kitAuthWebSocketParts(base, auth, 'curl.channel.connect()');
}

/**
 * Assemble the curl channel `wss://` URL from a HoodyClient. Exported for
 * unit tests and advanced consumers; NOT re-exported as part of the root
 * SDK public API — the stable public surface is `client.curl.channel.connect(opts)`.
 */
export function assembleCurlChannelUrl(
  client: HoodyClient,
  opts: CurlChannelHelperOptions = {},
): string {
  if (opts.url) return opts.url;
  const serviceIndex = opts.serviceIndex ?? 1;

  // Prefer reading urlTemplates['curl'] set by `client.withContainer(...)` —
  // the same path terminal-exec.ts:182 uses. This avoids round-tripping
  // through `getKitUrl` (which throws on container===null and re-derives
  // pieces we already have in the template).
  const tpl = (client as unknown as {
    urlTemplates?: Record<string, { projectId?: string; containerId?: string; server?: string; serverName?: string }>;
  }).urlTemplates?.['curl'];

  const projectId = opts.projectId ?? tpl?.projectId;
  const containerId = opts.containerId ?? tpl?.containerId;
  // Templates expose both `server` and `serverName`; the curl URL template
  // uses `serverName` (verified at generated/client.ts:878). Accept either.
  const server = opts.server ?? tpl?.serverName ?? tpl?.server;

  if (!projectId || !containerId || !server) {
    throw new Error(
      'curl.channel.connect() requires either { url } or a container-scoped client ' +
        '(call client.withContainer({ project, container }) first) or ' +
        'explicit { projectId, containerId, server } in opts. Got: ' +
        JSON.stringify({ projectId, containerId, server }),
    );
  }

  const domain: string =
    typeof (client as unknown as { resolveContainersDomain?: () => string }).resolveContainersDomain ===
    'function'
      ? (client as unknown as { resolveContainersDomain: () => string }).resolveContainersDomain()
      : 'containers.hoody.com';

  return `wss://${projectId}-${containerId}-curl-${serviceIndex}.${server}.${domain}/api/v1/curl/channel`;
}

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

export function patchCurlChannelPrototype(): void {
  const prototype = ChannelService.prototype as unknown as Record<string | symbol, unknown>;
  if (prototype[CURL_CHANNEL_PATCH_MARKER]) return;

  prototype['connect'] = async function (
    this: ChannelService,
    opts: CurlChannelHelperOptions = {},
  ): Promise<CurlChannel> {
    const client = ownerOf<HoodyClient>(this, 'curl.channel.connect');
    const { url, headers } = resolveCurlChannelConnection(client, opts);
    const channelOptions: ChannelOptions & { headers?: Record<string, string> } = {
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
            silenceInsecureTransportWarning:
              opts.silenceInsecureTransportWarning,
          }
        : {}),
    };
    return CurlChannel.open(channelOptions);
  };

  prototype[CURL_CHANNEL_PATCH_MARKER] = true;
}
