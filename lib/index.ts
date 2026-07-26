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
export type {
  TerminalClientOptions,
  TerminalPreferences,
  ShellType,
  ConnectionState,
  ITerminalWebSocketTyped,
  ITerminalWebSocketOptions,
} from './terminal-client.js';
export { encrypt, decrypt, isEncrypted, parseEnvelope, VaultCryptoError } from './vault-crypto.js';
export type { EncryptedEnvelope } from './vault-crypto.js';
export { streamAgentPrompt } from './agent-client.js';
export type {
  AgentPromptEvent,
  AgentPromptResult,
  AgentPromptHandle,
  AgentPromptKitAuth,
  StreamAgentPromptArgs,
} from './agent-client.js';
export {
  formatEd25519SshPublicKey,
  parseEd25519SshPublicKey,
  generateEd25519SshKeyPair,
} from './ssh-keys.js';
export type {
  Ed25519SeedInput,
  SshPublicKeyInput,
  ParsedEd25519SshPublicKey,
  GenerateEd25519SshKeyPairOptions,
  GeneratedEd25519SshKeyPair,
} from './ssh-keys.js';
export {
  getHoodySignatureHeader,
  parseHoodySignatureHeader,
  parseHoodySignatureFrom,
  verifyHoodySignatureHeader,
  verifyHoodySignatureFrom,
} from './signing.js';
export type {
  HoodySignatureHeader,
  HoodySignatureHeaderCarrier,
  VerifyHoodySignatureInput,
  VerifyHoodySignatureOptions,
} from './signing.js';
export {
  HoodyClient,
  patchHoodyClientMetrics,
} from './hoody-client.js';
// Public API surface: errors, config, middleware contract.
export {
  ApiError,
  isApiError,
  isRetryableApiError,
  ValidationError,
} from '../generated/errors.js';
export type {
  ApiErrorRequestContext,
  ApiErrorResponseDetails,
  RetryableApiError,
  RetryableStatus,
} from '../generated/errors.js';
export type { HoodyClientConfig } from '../generated/client.js';
export type {
  IHttpClientConfig,
  IRequestData,
  IHttpClientMiddleware,
  IHttpClientMiddlewareRequestContext,
  IHttpClientMiddlewareResponseContext,
  IHttpClientMiddlewareErrorContext,
} from '../generated/http-client.js';
export {
  getKitCatalogEntries,
} from './kit-catalog.js';
export type {
  KitCatalogEntry,
  KitCatalogKind,
  KitCatalogOptions,
} from './kit-catalog.js';
export {
  normalizeContainerStatsResponse,
  normalizeProjectStatsResponse,
} from './metrics.js';
export {
  patchExecScriptsServicePrototype,
} from './exec-scripts.js';
export type {
  ExecDeleteFileOptions,
  ExecListFilesOptions,
  ExecReadJsonFileResponse,
  ExecReadFileOptions,
  ExecScriptsRequestOptions,
  ExecScriptsTemplateVars,
  ExecWriteJsonFileOptions,
  ExecWriteFileOptions,
} from './exec-scripts.js';
export {
  patchExecScriptExecutionPrototype,
} from './exec-script-execution.js';
export type {
  ExecExecutionRequestOptions,
  ExecExecutionTemplateVars,
} from './exec-script-execution.js';
export {
  patchTerminalExecPrototype,
} from './terminal-exec.js';
export type {
  TerminalExecOptions,
  TerminalExecResult,
  TerminalShellOptions,
  TerminalShell,
} from './terminal-exec.js';
export {
  patchTerminalSshPrototype,
} from './terminal-ssh.js';
export type {
  SshTerminalOptions,
  LocalTerminalOptions,
  DesktopTerminalOptions,
  SshExecOptions,
  TerminalCreateResult,
  SshExecResult,
} from './terminal-ssh.js';

// -- Exec dynamic discovery & skills --
export {
  discoverScripts,
  scriptPathToName,
  isValidToolName,
  sanitizeDescription,
  extractParamsFromSchema,
  extractPathParams,
} from './exec-dynamic-discovery.js';
export type {
  DiscoveredScript,
  DiscoveredParam,
  DiscoveryCache,
  DiscoverOptions,
} from './exec-dynamic-discovery.js';
export {
  patchExecDynamicClientPrototype,
  clearDiscoveryCache,
} from './exec-dynamic-client.js';
export type {
  CallScriptOptions,
  ExecDynamicServices,
} from './exec-dynamic-client.js';
export {
  filterAgentScripts,
} from './exec-dynamic-skills.js';
export {
  parseRawScriptEntry,
  parseRawScriptEntries,
} from './exec-dynamic-parse.js';
export type {
  RawScriptEntry,
} from './exec-dynamic-parse.js';
export {
  readFileCache as readExecFileCache,
  writeFileCache as writeExecFileCache,
  deleteFileCache as deleteExecFileCache,
  pruneStaleCache as pruneExecStaleCache,
} from './exec-dynamic-cache.js';

// -- Screenshot save helpers --
export {
  patchScreenshotSavePrototype,
  ScreenshotSaveError,
} from './screenshot-save.js';
export type {
  SaveScreenshotOptions,
  SaveScreenshotResult,
  ScreenshotSource,
  ScreenshotFormat,
  ScreenshotSaveErrorCode,
  DisplayScreenshotCaptureOptions,
  BrowserScreenshotCaptureOptions,
  TerminalScreenshotCaptureOptions,
} from './screenshot-save.js';

// -- Files service extensions (classifyFile, getFileUrl, etc.) --
export {
  patchFilesServiceExtensions,
} from './files-service-extensions.js';

// -- Mount module (rclone+WebDAV filesystem mount) --
export {
  mount,
  unmount,
  unmountById,
  unmountAll,
  unmountByContainer,
  listMounts,
  pruneStaleMounts,
  probeKit,
  resolveKitUrl,
  parseCliTarget,
} from './mount.js';
export type {
  MountOptions,
  MountTarget,
  MountHandle,
  MountListEntry,
  ProbeResult,
  ParsedCliTarget,
  ContainerLike as MountContainerLike,
} from './mount.js';

// -- Code service extensions (embedUrl) --
export {
  patchCodeServiceExtensions,
} from './code-service-extensions.js';
export type { EmbedUrlOptions } from './code-service-extensions.js';

// -- Notification display helpers --
export { NotificationDisplayClient } from './notification-display-client.js';
export type { NotificationDisplayClientConfig } from './notification-display-client.js';
export {
  createNotificationPresenter,
  parseNotificationData,
} from './notification-presenter.js';
export type {
  NotificationPresenter,
  NotificationPresenterConfig,
  ParsedNotification,
} from './notification-presenter.js';

// -- Kit Proxy Authentication types (used in HoodyClientConfig.kitAuth) --
export type {
  ProxyAuth,
  ProxyAuthPolicy,
  KitProgram,
  ProxyAuthJwt,
  ProxyAuthPassword,
  ProxyAuthToken,
  ProxyAuthContainerClaim,
  ProxyAuthIp,
} from './proxy-auth.js';
export { isProxyAuthPolicy } from './proxy-auth.js';

// -- Events WebSocket types (used in EventsClient/EventsManager callbacks) --
export type {
  EventServerMessage,
  EventClientMessage,
} from './events-types.js';
export { ApiConnecteventstreamWebSocket } from './events-types.js';

// -- Pipe stream helpers (Node — generic byte-stream send/receive/forward) --
export {
  PipeStream,
  PipeReceiveEmptyBodyError,
  encodePipePath,
  validatePipePath,
  coerceToReadableStream,
  parseStatusLine,
  parseStatusStream,
  parseSseEvent,
  parseSseStream,
  boolQuery as pipeBoolQuery,
} from './pipe-stream.js';
export type {
  PipeStreamConfig,
  PipeSource,
  PipeSendOptions,
  PipeSendResult,
  PipeStatusMessage,
  PipeReceiveOptions,
  PipeReceiveResult,
  PipeProgressEvent,
  PipeForwardTcpOptions,
  PipeForwardTcpResult,
  SseEvent,
} from './pipe-stream.js';

// -- Tunnel target parsing --
export {
  parseLocalTarget as parseTunnelTarget,
  parseContainerPort as parseTunnelPort,
} from './tunnel-parse-target.js';

// -- Tunnel client (WebSocket binary protocol + high-level expose/pull API) --
export {
  expose as tunnelExpose,
  pull as tunnelPull,
  serve as tunnelServe,
  connect as tunnelConnect,
  TunnelSession,
} from './tunnel-client.js';
export type {
  ExposeOptions as TunnelExposeOptions,
  PullOptions as TunnelPullOptions,
  ServeOptions as TunnelServeOptions,
  TunnelHandle,
  LocalTarget as TunnelLocalTarget,
  ConnectOptions as TunnelConnectOptions,
  BindOptions as TunnelBindOptions,
  BindResult as TunnelBindResult,
  JoinTicket as TunnelJoinTicket,
  ResumedBind as TunnelResumedBind,
  HelloResult as TunnelHelloResult,
} from './tunnel-client.js';
export {
  FrameType as TunnelFrameType,
  ResetCode as TunnelResetCode,
  HEADER_SIZE as TUNNEL_HEADER_SIZE,
  MAX_PAYLOAD_SIZE as TUNNEL_MAX_PAYLOAD_SIZE,
  MAX_FRAME_SIZE as TUNNEL_MAX_FRAME_SIZE,
  isExtensionRange as isTunnelExtensionRange,
  isMandatoryUnknown as isTunnelMandatoryUnknown,
  isControlFrame as isTunnelControlFrame,
} from './tunnel-protocol-types.js';
export type {
  Frame as TunnelFrame,
  FrameHeader as TunnelFrameHeader,
} from './tunnel-protocol-types.js';

// -- Tunnel protocol codec (low-level frame encode/decode) --
export {
  encodeFrame as encodeTunnelFrame,
  encodeFrames as encodeTunnelFrames,
  decodeFrame as decodeTunnelFrame,
  decodeFrames as decodeTunnelFrames,
  dataFrame as tunnelDataFrame,
  pingFrame as tunnelPingFrame,
  pongFrame as tunnelPongFrame,
  windowFrame as tunnelWindowFrame,
  eofFrame as tunnelEofFrame,
  CodecError as TunnelCodecError,
  MAX_MESSAGE_SIZE as TUNNEL_MAX_MESSAGE_SIZE,
  MAX_FRAMES_PER_MESSAGE as TUNNEL_MAX_FRAMES_PER_MESSAGE,
} from './tunnel-protocol-codec.js';
export type { DecodeResult as TunnelDecodeResult } from './tunnel-protocol-codec.js';

// -- Tunnel HTTP/TCP pump (stream handlers for custom session users) --
export {
  handleHttpStream as handleTunnelHttpStream,
  handleTcpStream as handleTunnelTcpStream,
  setupAutoForwarding as setupTunnelAutoForwarding,
  destroyAllLocalAgents as destroyAllTunnelLocalAgents,
} from './tunnel-http-pump.js';

// -- curl-channel (WebSocket-multiplexed fetch over Hoody curl kit) --
// Vendored from the upstream Hoody curl client. Public surface is `client.curlChannel()`;
// the lower-level `CurlChannel` / `createCurlFetch` are re-exported for
// callers that want direct control.
export {
  CurlChannel,
  CurlChannelStream,
  createCurlFetch,
  ChannelError as CurlChannelError,
  AbortError as CurlAbortError,
  createAbortError as createCurlAbortError,
  SSE_EVENT_QUEUE_CAP as CURL_SSE_EVENT_QUEUE_CAP,
  MAX_INBOUND_FRAME_BYTES as CURL_MAX_INBOUND_FRAME_BYTES,
} from './curl-channel-client.js';
export type {
  CurlRequest,
  ExecutionMode as CurlExecutionMode,
  SseEvent as CurlSseEvent,
  ChannelHello as CurlChannelHello,
  ChannelHooks as CurlChannelHooks,
  ChannelOptions as CurlChannelOptions,
  ReconnectOptions as CurlChannelReconnectOptions,
  RequestOptions as CurlChannelRequestOptions,
  CurlFetch,
  CurlFetchOptions,
  ChannelClientMessage as CurlChannelClientMessage,
  ChannelServerMessage as CurlChannelServerMessage,
} from './curl-channel-client.js';
export type { CurlChannelHelperOptions } from './curl-channel-helper.js';

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
export {
  patchAgentConfigSyncPrototype,
  AGENT_CONFIG_TOOLS,
  DEFAULT_SYNC_CATEGORIES,
} from './agent-config-sync.js';
export type {
  SyncCategory,
  AgentRoot,
  AgentConfigToolSpec,
  AgentConfigSyncOptions,
  SyncFileEntry,
  AgentConfigSyncResult,
} from './agent-config-sync.js';
