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
 *   HoodyClient
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
 *   filterAgentScripts + types (the prototype patches run at import; they are not exported)
 *
 * -- Embed URLs for every kit UI (client.embeds) --
 *   buildEmbedUrl, getEmbedCatalog, listEmbedViews, deriveContainersDomain,
 *   EmbedValidationError, createEmbeds + types
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
  verifyHoodySignatureFromContext,
  hoodySignaturePath,
} from './signing.js';
export type {
  HoodySignatureResponseContext,
  HoodySignatureHeader,
  HoodySignatureHeaderCarrier,
  VerifyHoodySignatureInput,
  VerifyHoodySignatureOptions,
} from './signing.js';
export {
  HoodyClient,
} from './hoody-client.js';
export type {
  DaemonProgramRef,
  ProgramTerminalAttachOptions,
  ProgramTerminalAttachment,
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
// Credentials for HoodyClient.login() and client.login(): a username OR an email identifier.
// Kept on its own line — a test matches the HoodyClientConfig export line verbatim.
export type { HoodyCredentials } from '../generated/client.js';
// Session lifecycle: the two-factor challenge HoodyClient.login() raises, the token
// shape adoptSession() takes, and the enriched realm-scope 403.
export { TwoFactorRequiredError, isRealmScopeError } from '../generated/client.js';
export type { HoodySessionTokens, HoodySessionUpdate, RealmScopeApiError, ContainerLike } from '../generated/client.js';
// The transport class, for the same parity with the browser entry (which
// re-exports the whole generated index).
export { HttpClient } from '../generated/http-client.js';
// Whether this process sends through the SDK's own undici transport (Node 22.19+), as the README describes.
export { nodeTransportInUse } from '../generated/http-client.js';
export type { HoodyFetch, IEventStream, IStreamEvent, IStreamEventsOptions, IStreamResponse } from '../generated/http-client.js';
// Every generated request/response/schema type, type-only so it adds nothing
// at runtime: `import type { DaemonProgramsAddRequest } from 'hoody-sdk'`.
// Names this entry exports itself take precedence over the star.
export type * from '../generated/types.js';
export type {
  IHttpClientConfig,
  IRequestData,
  IHttpClientMiddleware,
  IHttpClientMiddlewareRequestContext,
  IHttpClientMiddlewareResponseContext,
  IHttpClientMiddlewareErrorContext,
} from '../generated/http-client.js';
export {
  listKits,
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
export type {
  ExecExecutionRequestOptions,
  ExecExecutionTemplateVars,
} from './exec-script-execution.js';
export type {
  TerminalExecOptions,
  TerminalExecResult,
  TerminalShellOptions,
  TerminalShell,
} from './terminal-exec.js';
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

// -- Files service extensions (classifyFile, getFileUrl, readText/readJson/readBytes, etc.) --
export type { FilesReadOptions, FilesExistsOptions } from './files-service-extensions.js';

// -- SQLite SQL helpers (sqlite.sql.query / run) --
export type {
  SqliteBindValue,
  SqliteParams,
  SqliteSqlRequest,
  SqliteQueryResult,
  SqliteRunResult,
} from './sqlite-helpers.js';

// -- SQLite KV helper (sqlite.kv.read) --
export type { KvReadOptions, KvExistsOptions, KvSetTextOptions, KvReadArgs, KvKeyArgs, KvKeyValueArgs, KvKeyMethod, KvKeyValueMethod, KvStoreObjectForms, SqliteKvStore } from './kv-helpers.js';

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

// -- Share module (a local folder served into a container) --
export {
  share,
  listShares,
  stopShare,
  ShareError,
  AmbiguousShareError,
  UndeliveredWritesError,
} from './share.js';
export type {
  ShareOptions,
  ShareHandle,
  ShareTarget,
  ShareEvent,
  ShareState,
  ShareListEntry,
  ListSharesOptions,
  StopShareOptions,
  StopShareResult,
} from './share.js';
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
  HoodyEvent,
  PersistedHoodyEvent,
  EventsStreamGap,
  HoodyStreamEvent,
  EphemeralHoodyEvent,
  EventActor,
  EventVisibility,
  EventHistoryItem,
  EventWireFrame,
  WelcomeFrame,
  TickFrame,
  ErrorFrame,
  RevokedFrame,
  ScopeChangedFrame,
  ServerFrame,
} from './events-types.js';
export { ApiConnecteventstreamWebSocket } from './events-types.js';
export type { EventsClientOptions, EventsOnOptions, EventsWaitOptions, EventsStreamOptions, EventsWaitFilter } from './events-client.js';
export type { EventFilter, EventsConnectionState, EventsStateEvent, EventsManagerOptions, EventsTransport } from './events-manager.js';
export {
  EventsError,
  EventsAuthError,
  EventsClosedError,
  EventsSessionChangedError,
  EventsTimeoutError,
  EventsGapError,
  socketActionFor,
  historyActionFor,
} from './events-errors.js';
export type { EventsGapReason, EventsSocketAction, EventsHistoryAction } from './events-errors.js';
export { EventIdLru, EventsRecovery } from './events-replay.js';
export type { EventsHistoryPage, EventsHistoryReader } from './events-replay.js';
export { EventsSession } from './events-session.js';
export {
  EVENT_TYPES,
  EVENT_CATALOG,
  isEventType,
  isEventPattern,
  isEphemeralEventType,
  isPersistedEventType,
  isReservedEventType,
  expandEventPattern,
  eventCatalogInfo,
} from './events-catalog.js';
export type {
  EventType,
  EventPattern,
  EventTypesMatching,
  EventPayload,
  HoodyEventMap,
  PersistedEventType,
  EphemeralEventType,
  ReservedEventType,
  EventCatalogInfo,
  ResourceTypeFor,
  ResourceType as EventResourceType,
} from './events-catalog.js';

// -- Pipe stream helpers (Node — generic byte-stream send/receive/forward) --
export {
  PipeStream,
  PipeReceiveEmptyBodyError,
  PipeIntegrityError,
  PipeTransferError,
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
  PipeStatus,
  PipeProgressEvent,
  PipeForwardTcpOptions,
  PipeForwardTcpResult,
  SseEvent,
} from './pipe-stream.js';
// -- Pipe WebSocket relay (?ws): connect() duplex --
export { PipeWsError, PIPE_WS_MAX_MESSAGE_BYTES } from './pipe-ws.js';
export type { PipeDuplex, PipeConnectOptions } from './pipe-ws.js';

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
  tunnelConnectUrl,
  TunnelSession,
} from './tunnel-client.js';
// Keeping a tunnel up across drops, and resuming a dropped session by hand.
export {
  keepTunnelAlive,
  resumeExpose as tunnelResumeExpose,
  resumePull as tunnelResumePull,
  TunnelSessionError,
  TunnelResumeAbortedError,
} from './tunnel-client.js';
export type {
  TunnelCloseInfo,
  KeepTunnelAliveOptions,
  KeptTunnel,
  TunnelEnd,
  ResumeControl,
  ResumeExposeOptions,
  ResumePullOptions,
  ResumedTunnel,
} from './tunnel-client.js';
export type {
  ScopedTunnelExposeOptions,
  ScopedTunnelPullOptions,
  ScopedTunnelServeOptions,
} from './tunnel-service-extensions.js';
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

// -- Local exit proxy (publish a container's HTTPS proxy, exit from this machine) --
// `startLocalExit` is the one-call entry point the CLI uses. The layers
// below it are exported too, because the pieces are independently useful: the
// SOCKS5 machine runs on any transport implementing `Socks5Stream`, and the
// destination gate is the same authorization used by every outbound dial.
export {
  startLocalExit,
  fetchThroughProxy,
  LocalExitStartupError,
} from './local-exit.js';
export type {
  LocalExitOptions,
  LocalExitHandle,
  LocalExitVerification,
  LocalExitTeardownReport,
  LocalExitContainerLike,
} from './local-exit.js';
export { tunnelSocks5 } from './tunnel-socks5.js';
export type {
  TunnelSocks5Options,
  TunnelSocks5Handle,
} from './tunnel-socks5.js';
export {
  handleSocks5Stream,
  createServerState as createSocks5ServerState,
} from './socks5-server.js';
export type {
  Socks5Stream,
  Socks5Credentials,
  Socks5ServerOptions,
  Socks5ServerState,
  Socks5ConnectEvent,
  Socks5DenyReason,
} from './socks5-server.js';
export {
  resolveAndAuthorize as resolveAndAuthorizeDestination,
  isPrivateAddress,
  clearDnsCache as clearDestinationDnsCache,
  DestinationDeniedError,
} from './net-destination-policy.js';
export type {
  DestinationPolicy,
  ResolvedDestination,
  DenyReason as DestinationDenyReason,
  DnsLookup as DestinationDnsLookup,
} from './net-destination-policy.js';

// -- curl-channel (WebSocket-multiplexed fetch over Hoody curl kit) --
// Vendored from the upstream Hoody curl client. Public surface is `client.curl.channel.connect()`;
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

// Helpers the browser entry already exports (index.browser.ts); the Node entry
// must not be the smaller one.
export {
  generateNotesFileId,
  encodeTusMetadata,
  NOTES_UPLOAD_CHUNK_BYTES,
} from './notes-upload.js';
export type {
  NotesUploadData,
  NotesUploadProgress,
  NotesChunkOptions,
  NotesUploadFileOptions,
  NotesUploadResult,
  NotesUploadFileResult,
} from './notes-upload.js';
export { pipeTransportFromClient } from './pipe-transport.js';
export type { PipeTransport, PipeTransportRequest } from './pipe-transport.js';
export type { ExecScriptCallOptions, ExecScriptMethod } from './exec-script-execution.js';

// -- Remote control of a live exec script (#674): `exec.connect(url, { token })` --
export {
  ExecRemoteError,
  ExecRemoteTokenError,
  ExecRemotePermissionError,
  ExecRemoteThrewError,
  ExecRemoteTimeoutError,
  ExecRemoteUnsupportedError,
  ExecRemoteConnectionError,
  isExecRemoteError,
  formatExecRemoteFix,
  createExecRemoteConnection,
} from './exec-remote.js';
export type {
  ExecRemoteConnect,
  ExecRemoteConnection,
  ExecRemoteConnectOptions,
  ExecRemoteOpOptions,
  ExecRemoteEvalOptions,
  ExecRemoteEvalContext,
  ExecRemoteRunKind,
  ExecRemoteEventsOptions,
  ExecRemoteTailLevel,
  ExecRemoteSendResult,
  ExecRemoteCallResult,
  ExecRemoteEvalResult,
  ExecRemoteLogLine,
  ExecRemoteCapabilities,
  ExecRemoteFrame,
  ExecRemoteFix,
  ExecRemoteSession,
  ExecRemoteCloseInfo,
  ExecRemoteTransport,
  ExecRemoteRawAnswer,
} from './exec-remote.js';
export type { CurlChannelLimits } from './curl-channel-helper.js';
export { withTokenQueryParam } from './proxy-auth.js';

// -- Embed URLs for every kit UI: `client.embeds.<kit>.<view>(container, opts)` --
// Same block as the browser entry. `client.embeds` is installed below, never by hoody-client.ts.
export {
  buildEmbedUrl,
  getEmbedCatalog,
  listEmbedViews,
  deriveContainersDomain,
  EmbedValidationError,
} from './embeds/runtime.js';
export type {
  EmbedErrorCode,
  EmbedParamValue,
  EmbedQuery,
  EmbedContainerTarget,
  EmbedAliasTarget,
  EmbedTarget,
  EmbedBuildOptions,
  EmbedBuildContext,
} from './embeds/runtime.js';
export { createEmbeds } from './embeds/attach.js';
export type { HoodyEmbeds, EmbedTargetArg, EmbedsHost } from './embeds/attach.js';
export type {
  EmbedKit,
  EmbedViewId,
  EmbedViewParams,
  EmbedViewQuery,
  EmbedWrapperOptions,
  EmbedWrappers,
  EmbedsCatalog,
} from '../generated/embeds.generated.js';

// Patch HoodyClient prototype with screenshot-save methods.
// Must run after all modules are loaded to avoid circular-import TDZ errors.
import { HoodyClient as _HC } from './hoody-client.js';
import { patchScreenshotSavePrototype as _patchSS } from './screenshot-save.js';
import { patchCurlChannelPrototype as _patchCurl } from './curl-channel-helper.js';
import { patchAgentConfigSyncPrototype as _patchACS } from './agent-config-sync.js';
import { patchEmbedsPrototype as _patchEmbeds } from './embeds/attach.js';
import { patchTunnelServiceExtensions as _patchTunnel } from './tunnel-service-extensions.js';
_patchSS(_HC);
_patchTunnel();
_patchCurl();
_patchACS();
_patchEmbeds(_HC);

// Agent config sync (Node-only; stubbed for browser in build.config.ts).
export {
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
