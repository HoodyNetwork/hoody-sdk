/**
 * Hoody SDK — Browser-Specific Entry Point
 *
 * This file is the browser counterpart of ./index.ts (the Node.js entry point).
 * During browser builds (see build.config.ts), esbuild's `browser-http-client`
 * plugin transparently rewrites any `import ... from './http-client.js'` to
 * resolve `lib/http-client.browser.ts` instead of the Node.js HTTP client.
 * That substitution, combined with this entry point, produces a self-contained
 * browser bundle that:
 *
 *  - Uses fetch() instead of Node's http module for HTTP calls
 *  - Bundles socket.io-client for real-time WebSocket events
 *  - Exposes response-signature helpers for X-Hoody-Signature parsing
 *  - Re-exports the full generated SDK plus hand-written lib utilities
 *
 * build.config.ts references this file as the entryPoint for all three browser
 * output formats (IIFE, minified IIFE, ESM).
 *
 * Maintained in lib/ — not auto-generated.
 */
export * from '../generated/index.js';
export { HoodyClient, patchHoodyClientMetrics, } from './hoody-client.js';
export { EventsClient } from './events-client.js';
export { EventsManager } from './events-manager.js';
export type { HoodyClientConfig } from '../generated/client.js';
export { ApiError, isApiError, isRetryableApiError, ValidationError, } from '../generated/errors.js';
export type { ApiErrorRequestContext, ApiErrorResponseDetails, RetryableApiError, RetryableStatus, } from '../generated/errors.js';
export type { IHttpClientConfig, IRequestData, IHttpClientMiddleware, IHttpClientMiddlewareRequestContext, IHttpClientMiddlewareResponseContext, IHttpClientMiddlewareErrorContext, } from '../generated/http-client.js';
export { getKitCatalogEntries, } from './kit-catalog.js';
export type { KitCatalogEntry, KitCatalogKind, KitCatalogOptions, } from './kit-catalog.js';
export { normalizeContainerStatsResponse, normalizeProjectStatsResponse, } from './metrics.js';
export { encrypt, decrypt, isEncrypted, parseEnvelope, VaultCryptoError } from './vault-crypto.js';
export type { EncryptedEnvelope } from './vault-crypto.js';
export { formatEd25519SshPublicKey, parseEd25519SshPublicKey, generateEd25519SshKeyPair, } from './ssh-keys.js';
export { getHoodySignatureHeader, parseHoodySignatureHeader, parseHoodySignatureFrom, verifyHoodySignatureHeader, verifyHoodySignatureFrom, } from './signing.js';
export type { HoodySignatureHeader, HoodySignatureHeaderCarrier, VerifyHoodySignatureInput, VerifyHoodySignatureOptions, } from './signing.js';
export { discoverScripts, scriptPathToName, isValidToolName, sanitizeDescription, extractParamsFromSchema, extractPathParams, } from './exec-dynamic-discovery.js';
export type { DiscoveredScript, DiscoveredParam, DiscoveryCache, DiscoverOptions, } from './exec-dynamic-discovery.js';
export { patchExecDynamicClientPrototype, clearDiscoveryCache, } from './exec-dynamic-client.js';
export type { CallScriptOptions, ExecDynamicServices, } from './exec-dynamic-client.js';
export { filterAgentScripts, } from './exec-dynamic-skills.js';
export { parseRawScriptEntry, parseRawScriptEntries, } from './exec-dynamic-parse.js';
export type { RawScriptEntry, } from './exec-dynamic-parse.js';
import { io } from 'socket.io-client';
export { io };
export { NotificationDisplayClient } from './notification-display-client.js';
export type { NotificationDisplayClientConfig } from './notification-display-client.js';
export { parseNotificationData, createNotificationPresenter } from './notification-presenter.js';
export type { NotificationPresenter, NotificationPresenterConfig, ParsedNotification, } from './notification-presenter.js';
export type { ProxyAuth, ProxyAuthPolicy, KitProgram, ProxyAuthJwt, ProxyAuthPassword, ProxyAuthToken, ProxyAuthContainerClaim, ProxyAuthIp, } from './proxy-auth.js';
export { isProxyAuthPolicy } from './proxy-auth.js';
export type { EventServerMessage, EventClientMessage, } from './events-types.js';
export { ApiConnecteventstreamWebSocket } from './events-types.js';
export { PipeMedia, mediaStreamToReadableStream } from './pipe-media.js';
export type { PipeMediaConfig, MediaSession, ReceiveSession, ShareScreenOptions, ShareWebcamOptions, ReceiveMediaOptions, } from './pipe-media.js';
export { CurlChannel, CurlChannelStream, createCurlFetch, ChannelError as CurlChannelError, AbortError as CurlAbortError, createAbortError as createCurlAbortError, SSE_EVENT_QUEUE_CAP as CURL_SSE_EVENT_QUEUE_CAP, MAX_INBOUND_FRAME_BYTES as CURL_MAX_INBOUND_FRAME_BYTES, } from './curl-channel-client.js';
export type { CurlRequest, ExecutionMode as CurlExecutionMode, SseEvent as CurlSseEvent, ChannelHello as CurlChannelHello, ChannelHooks as CurlChannelHooks, ChannelOptions as CurlChannelOptions, ReconnectOptions as CurlChannelReconnectOptions, RequestOptions as CurlChannelRequestOptions, CurlFetch, CurlFetchOptions, ChannelClientMessage as CurlChannelClientMessage, ChannelServerMessage as CurlChannelServerMessage, } from './curl-channel-client.js';
export type { CurlChannelHelperOptions } from './curl-channel-helper.js';
