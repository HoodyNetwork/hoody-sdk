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
import type {
  ChannelHooks,
  ReconnectOptions,
} from './curl-channel-client.js';

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
}

/**
 * Assemble the curl channel `wss://` URL from a HoodyClient. Exported for
 * unit tests and advanced consumers; NOT re-exported as part of the root
 * SDK public API — the stable public surface is `client.curlChannel(opts)`.
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
      'curlChannel() requires either { url } or a container-scoped client ' +
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

export function patchCurlChannelPrototype(): void {
  const prototype = HoodyClient.prototype as HoodyClient &
    Record<string | symbol, unknown>;
  if (prototype[CURL_CHANNEL_PATCH_MARKER]) return;

  prototype.curlChannel = async function (
    this: HoodyClient,
    opts: CurlChannelHelperOptions = {},
  ): Promise<CurlChannel> {
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
            silenceInsecureTransportWarning:
              opts.silenceInsecureTransportWarning,
          }
        : {}),
    });
  };

  prototype[CURL_CHANNEL_PATCH_MARKER] = true;
}
