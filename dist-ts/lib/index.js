/**
 * Hoody SDK — Main Library Entry Point (Node.js)
 *
 * This barrel file aggregates all hand-written library modules that augment
 * the auto-generated SDK (./generated/). It is the primary import target for
 * Node.js consumers:
 *
 *   import { HoodyClient, EventsManager, encrypt } from 'hoody-sdk';
 *
 * Subsystem grouping of exports below:
 *
 * -- Core client --
 *   HoodyClient, patchHoodyClientMetrics
 *
 * -- Real-time events (Socket.IO) --
 *   EventsClient, EventsManager
 *
 * -- Interactive terminal (WebSocket Duplex stream over the byte-prefix
 *    protocol; full ProxyAuth + getKitAuth/getToken provider callbacks
 *    for credential rotation across reconnect) --
 *   TerminalClient + TerminalClientOptions / TerminalPreferences /
 *   ShellType / ConnectionState; plus TerminalWebSocketTyped for
 *   consumers who want the typed-only client without the Duplex shim
 *
 * -- Vault crypto (encrypt/decrypt secrets) --
 *   encrypt, decrypt, isEncrypted, parseEnvelope, EncryptedEnvelope
 *
 * -- SSH key utilities --
 *   formatEd25519SshPublicKey, parseEd25519SshPublicKey,
 *   generateEd25519SshKeyPair + related types
 *
 * -- Response signing helpers --
 *   getHoodySignatureHeader, parseHoodySignatureHeader, parseHoodySignatureFrom,
 *   verifyHoodySignatureHeader, verifyHoodySignatureFrom
 *
 * -- Metrics normalisation --
 *   normalizeContainerStatsResponse, normalizeProjectStatsResponse
 *
 * -- Exec helpers (prototype augmentation + dynamic script support) --
 *   patchExecScriptsServicePrototype, patchExecScriptExecutionPrototype,
 *   patchExecDynamicClientPrototype, filterAgentScripts + types
 *
 * Safe from regeneration — add new custom exports here.
 */
export { EventsClient } from './events-client.js';
export { EventsManager } from './events-manager.js';
// Re-export the socket.io-client `io` factory. Symmetry with the browser
// entry (lib/index.browser.ts) so consumers that directly use Socket.IO
// don't need a separate `socket.io-client` dependency import.
export { io } from 'socket.io-client';
export { TerminalClient, TerminalWebSocketTyped } from './terminal-client.js';
export { encrypt, decrypt, isEncrypted, parseEnvelope, VaultCryptoError } from './vault-crypto.js';
export { streamAgentPrompt } from './agent-client.js';
export { formatEd25519SshPublicKey, parseEd25519SshPublicKey, generateEd25519SshKeyPair, } from './ssh-keys.js';
export { getHoodySignatureHeader, parseHoodySignatureHeader, parseHoodySignatureFrom, verifyHoodySignatureHeader, verifyHoodySignatureFrom, } from './signing.js';
export { HoodyClient, patchHoodyClientMetrics, } from './hoody-client.js';
// Public API surface: errors, config, middleware contract.
export { ApiError, isApiError, isRetryableApiError, ValidationError, } from '../generated/errors.js';
export { getKitCatalogEntries, } from './kit-catalog.js';
export { normalizeContainerStatsResponse, normalizeProjectStatsResponse, } from './metrics.js';
export { patchExecScriptsServicePrototype, } from './exec-scripts.js';
export { patchExecScriptExecutionPrototype, } from './exec-script-execution.js';
export { patchTerminalExecPrototype, } from './terminal-exec.js';
export { patchTerminalSshPrototype, } from './terminal-ssh.js';
// -- Exec dynamic discovery & skills --
export { discoverScripts, scriptPathToName, isValidToolName, sanitizeDescription, extractParamsFromSchema, extractPathParams, } from './exec-dynamic-discovery.js';
export { patchExecDynamicClientPrototype, clearDiscoveryCache, } from './exec-dynamic-client.js';
export { filterAgentScripts, } from './exec-dynamic-skills.js';
export { parseRawScriptEntry, parseRawScriptEntries, } from './exec-dynamic-parse.js';
export { readFileCache as readExecFileCache, writeFileCache as writeExecFileCache, deleteFileCache as deleteExecFileCache, pruneStaleCache as pruneExecStaleCache, } from './exec-dynamic-cache.js';
// -- Screenshot save helpers --
export { patchScreenshotSavePrototype, ScreenshotSaveError, } from './screenshot-save.js';
// -- Files service extensions (classifyFile, getFileUrl, etc.) --
export { patchFilesServiceExtensions, } from './files-service-extensions.js';
// -- Mount module (rclone+WebDAV filesystem mount) --
export { mount, unmount, unmountById, unmountAll, unmountByContainer, listMounts, pruneStaleMounts, probeKit, resolveKitUrl, parseCliTarget, } from './mount.js';
// -- Code service extensions (embedUrl) --
export { patchCodeServiceExtensions, } from './code-service-extensions.js';
// -- Notification display helpers --
export { NotificationDisplayClient } from './notification-display-client.js';
export { createNotificationPresenter, parseNotificationData, } from './notification-presenter.js';
export { isProxyAuthPolicy } from './proxy-auth.js';
export { ApiConnecteventstreamWebSocket } from './events-types.js';
// -- Pipe stream helpers (Node — generic byte-stream send/receive/forward) --
export { PipeStream, PipeReceiveEmptyBodyError, encodePipePath, validatePipePath, coerceToReadableStream, parseStatusLine, parseStatusStream, parseSseEvent, parseSseStream, boolQuery as pipeBoolQuery, } from './pipe-stream.js';
// -- Tunnel target parsing --
export { parseLocalTarget as parseTunnelTarget, parseContainerPort as parseTunnelPort, } from './tunnel-parse-target.js';
// -- Tunnel client (WebSocket binary protocol + high-level expose/pull API) --
export { expose as tunnelExpose, pull as tunnelPull, serve as tunnelServe, connect as tunnelConnect, TunnelSession, } from './tunnel-client.js';
export { FrameType as TunnelFrameType, ResetCode as TunnelResetCode, HEADER_SIZE as TUNNEL_HEADER_SIZE, MAX_PAYLOAD_SIZE as TUNNEL_MAX_PAYLOAD_SIZE, MAX_FRAME_SIZE as TUNNEL_MAX_FRAME_SIZE, isExtensionRange as isTunnelExtensionRange, isMandatoryUnknown as isTunnelMandatoryUnknown, isControlFrame as isTunnelControlFrame, } from './tunnel-protocol-types.js';
// -- Tunnel protocol codec (low-level frame encode/decode) --
export { encodeFrame as encodeTunnelFrame, encodeFrames as encodeTunnelFrames, decodeFrame as decodeTunnelFrame, decodeFrames as decodeTunnelFrames, dataFrame as tunnelDataFrame, pingFrame as tunnelPingFrame, pongFrame as tunnelPongFrame, windowFrame as tunnelWindowFrame, eofFrame as tunnelEofFrame, CodecError as TunnelCodecError, MAX_MESSAGE_SIZE as TUNNEL_MAX_MESSAGE_SIZE, MAX_FRAMES_PER_MESSAGE as TUNNEL_MAX_FRAMES_PER_MESSAGE, } from './tunnel-protocol-codec.js';
// -- Tunnel HTTP/TCP pump (stream handlers for custom session users) --
export { handleHttpStream as handleTunnelHttpStream, handleTcpStream as handleTunnelTcpStream, setupAutoForwarding as setupTunnelAutoForwarding, destroyAllLocalAgents as destroyAllTunnelLocalAgents, } from './tunnel-http-pump.js';
// -- curl-channel (WebSocket-multiplexed fetch over Hoody curl kit) --
// Vendored from the upstream Hoody curl client. Public surface is `client.curlChannel()`;
// the lower-level `CurlChannel` / `createCurlFetch` are re-exported for
// callers that want direct control.
export { CurlChannel, CurlChannelStream, createCurlFetch, ChannelError as CurlChannelError, AbortError as CurlAbortError, createAbortError as createCurlAbortError, SSE_EVENT_QUEUE_CAP as CURL_SSE_EVENT_QUEUE_CAP, MAX_INBOUND_FRAME_BYTES as CURL_MAX_INBOUND_FRAME_BYTES, } from './curl-channel-client.js';
// Patch HoodyClient prototype with screenshot-save methods.
// Must run after all modules are loaded to avoid circular-import TDZ errors.
import { HoodyClient as _HC } from './hoody-client.js';
import { patchScreenshotSavePrototype as _patchSS } from './screenshot-save.js';
import { patchCurlChannelPrototype as _patchCurl } from './curl-channel-helper.js';
import { patchAgentConfigSyncPrototype as _patchACS } from './agent-config-sync.js';
_patchSS(_HC);
_patchCurl();
_patchACS(_HC);
// Agent config sync (Node-only; stubbed for browser in build.config.ts).
export { patchAgentConfigSyncPrototype, AGENT_CONFIG_TOOLS, DEFAULT_SYNC_CATEGORIES, } from './agent-config-sync.js';
