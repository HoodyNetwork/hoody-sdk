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
// Export everything from the main generated index
export * from '../generated/index.js';
export { HoodyClient, } from './hoody-client.js';
// EventsClient + EventsManager use socket.io-client and are
// browser-compatible; they must be reachable from the browser entry.
export { EventsClient } from './events-client.js';
export { EventsManager } from './events-manager.js';
export { ApiError, isApiError, isRetryableApiError, ValidationError, } from '../generated/errors.js';
export { listKits, } from './kit-catalog.js';
export { normalizeContainerStatsResponse, normalizeProjectStatsResponse, } from './metrics.js';
export { encrypt, decrypt, isEncrypted, parseEnvelope, VaultCryptoError } from './vault-crypto.js';
// Streamed agent prompt. Browser-safe since its SSE parser moved out of the
// Node-only pipe-stream.ts into sse-stream.ts.
export { streamAgentPrompt } from './agent-client.js';
export { parseSseEvent, parseSseStream } from './sse-stream.js';
export { formatEd25519SshPublicKey, parseEd25519SshPublicKey, generateEd25519SshKeyPair, } from './ssh-keys.js';
export { getHoodySignatureHeader, parseHoodySignatureHeader, parseHoodySignatureFrom, verifyHoodySignatureHeader, verifyHoodySignatureFrom, verifyHoodySignatureFromContext, hoodySignaturePath, } from './signing.js';
// -- Exec dynamic discovery & skills --
export { discoverScripts, scriptPathToName, isValidToolName, sanitizeDescription, extractParamsFromSchema, extractPathParams, } from './exec-dynamic-discovery.js';
export { clearDiscoveryCache, } from './exec-dynamic-client.js';
export { filterAgentScripts, } from './exec-dynamic-skills.js';
export { parseRawScriptEntry, parseRawScriptEntries, } from './exec-dynamic-parse.js';
// -- Remote control of a live exec script (#674): `exec.connect(url, { token })` --
export { ExecRemoteError, ExecRemoteTokenError, ExecRemotePermissionError, ExecRemoteThrewError, ExecRemoteTimeoutError, ExecRemoteUnsupportedError, ExecRemoteConnectionError, isExecRemoteError, formatExecRemoteFix, createExecRemoteConnection, } from './exec-remote.js';
// Export Socket.IO for browser usage
import { io } from 'socket.io-client';
export { io };
// -- Notification display helpers --
export { NotificationDisplayClient } from './notification-display-client.js';
export { parseNotificationData, createNotificationPresenter } from './notification-presenter.js';
export { isProxyAuthPolicy, withTokenQueryParam } from './proxy-auth.js';
export { ApiConnecteventstreamWebSocket } from './events-types.js';
export { EventsError, EventsAuthError, EventsClosedError, EventsSessionChangedError, EventsTimeoutError, EventsGapError, socketActionFor, historyActionFor, } from './events-errors.js';
export { EventIdLru, EventsRecovery } from './events-replay.js';
export { EventsSession } from './events-session.js';
export { EVENT_TYPES, EVENT_CATALOG, isEventType, isEventPattern, isEphemeralEventType, isPersistedEventType, isReservedEventType, expandEventPattern, eventCatalogInfo, } from './events-catalog.js';
// -- Notes TUS upload (box.notes.files.upload / resumeUpload / …) --
export { generateNotesFileId, encodeTusMetadata, NOTES_UPLOAD_CHUNK_BYTES, } from './notes-upload.js';
// -- Pipe media streaming helpers (browser-only) --
export { PipeMedia, mediaStreamToReadableStream } from './pipe-media.js';
// -- Pipe browser data transfer: sendFile / receive / download / subscribeProgress --
export { PipeBrowser, PipeTransferError } from './pipe-browser.js';
export { pipeTransportFromClient } from './pipe-transport.js';
// -- Pipe WebSocket relay (?ws): connect() duplex --
export { PipeWsError, PIPE_WS_MAX_MESSAGE_BYTES } from './pipe-ws.js';
// -- curl-channel (WebSocket-multiplexed fetch over Hoody curl kit) --
// In browsers, the channel uses globalThis.WebSocket (no `ws` package).
export { CurlChannel, CurlChannelStream, createCurlFetch, ChannelError as CurlChannelError, AbortError as CurlAbortError, createAbortError as createCurlAbortError, SSE_EVENT_QUEUE_CAP as CURL_SSE_EVENT_QUEUE_CAP, MAX_INBOUND_FRAME_BYTES as CURL_MAX_INBOUND_FRAME_BYTES, } from './curl-channel-client.js';
// -- Embed URLs for every kit UI: `client.embeds.<kit>.<view>(container, opts)` --
// Same block as the Node entry; browser-safe (no Node APIs).
export { buildEmbedUrl, getEmbedCatalog, listEmbedViews, deriveContainersDomain, EmbedValidationError, } from './embeds/runtime.js';
export { createEmbeds } from './embeds/attach.js';
// Patch the curl channel helper (client.curl.channel.connect) — must run after HoodyClient export
// so the prototype object exists when patched.
import { patchCurlChannelPrototype as _patchCurlBrowser } from './curl-channel-helper.js';
_patchCurlBrowser();
// Install `client.embeds` (a prototype getter; see lib/embeds/attach.ts).
import { HoodyClient as _HCBrowser } from './hoody-client.js';
import { patchEmbedsPrototype as _patchEmbedsBrowser } from './embeds/attach.js';
_patchEmbedsBrowser(_HCBrowser);
