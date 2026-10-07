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
export {
  HoodyClient,
} from './hoody-client.js';
export type {
  DaemonProgramRef,
  ProgramTerminalAttachOptions,
  ProgramTerminalAttachment,
} from './hoody-client.js';

// EventsClient + EventsManager use socket.io-client and are
// browser-compatible; they must be reachable from the browser entry.
export { EventsClient } from './events-client.js';
export { EventsManager } from './events-manager.js';

// Surface HoodyClientConfig + middleware types
// and error/guard runtime in the browser entry too, not just Node.
export type { HoodyClientConfig } from '../generated/client.js';
// Credentials for HoodyClient.login() and client.login(): a username OR an email identifier.
// Kept on its own line — a test matches the HoodyClientConfig export line verbatim.
export type { HoodyCredentials } from '../generated/client.js';
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
// Types of the helpers the browser bundle installs on the exec and terminal services. Naming a module
// here is what carries its `declare module` augmentation into the browser declarations: without it
// `exec.scripts.writeFile`, `terminal.sessions.createSsh` and `terminal.commands.runSsh` exist at runtime
// and fail to compile. (terminal-exec.ts, the Node `shell()` stream, stays out: the build stubs it.)
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
export type { TerminalExecOptions, TerminalExecResult } from './terminal-run.js';
export type {
  SshTerminalOptions,
  LocalTerminalOptions,
  DesktopTerminalOptions,
  SshExecOptions,
  TerminalCreateResult,
  SshExecResult,
} from './terminal-ssh.js';
export { encrypt, decrypt, isEncrypted, parseEnvelope, VaultCryptoError } from './vault-crypto.js';
export type { EncryptedEnvelope } from './vault-crypto.js';
// Streamed agent prompt. Browser-safe since its SSE parser moved out of the
// Node-only pipe-stream.ts into sse-stream.ts.
export { streamAgentPrompt } from './agent-client.js';
export type {
  AgentPromptEvent,
  AgentPromptResult,
  AgentPromptHandle,
  AgentPromptKitAuth,
  StreamAgentPromptArgs,
} from './agent-client.js';
export { parseSseEvent, parseSseStream } from './sse-stream.js';
export type { SseEvent } from './sse-stream.js';
export {
  formatEd25519SshPublicKey,
  parseEd25519SshPublicKey,
  generateEd25519SshKeyPair,
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

// Export Socket.IO for browser usage
import { io } from 'socket.io-client';
export { io };

// -- Notification display helpers --
export { NotificationDisplayClient } from './notification-display-client.js';
export type { NotificationDisplayClientConfig } from './notification-display-client.js';
export { parseNotificationData, createNotificationPresenter } from './notification-presenter.js';
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
export { isProxyAuthPolicy, withTokenQueryParam } from './proxy-auth.js';

// -- Events WebSocket types (used in EventsClient/EventsManager callbacks) --
// Same list as the Node entry: the events runtime is browser-compatible.
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

// -- Files service extensions and SQLite SQL helpers — same exports as the Node
// entry. hoody-client.ts imports both modules for their prototype patches, but
// an implementation-only import is dropped from the emitted .d.ts; exporting
// from here keeps their `declare module` augmentations (readText/readJson/
// readBytes, sqlite.sql.query/run, sqlite.kv.read) in the browser
// declarations.
export type { FilesReadOptions, FilesExistsOptions } from './files-service-extensions.js';
export type {
  SqliteBindValue,
  SqliteParams,
  SqliteSqlRequest,
  SqliteQueryResult,
  SqliteRunResult,
} from './sqlite-helpers.js';
export type { KvReadOptions, KvExistsOptions, KvSetTextOptions, KvReadArgs, KvKeyArgs, KvKeyValueArgs, KvKeyMethod, KvKeyValueMethod, KvStoreObjectForms, SqliteKvStore } from './kv-helpers.js';

// -- Notes TUS upload (box.notes.files.upload / resumeUpload / …) --
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

// -- Pipe media streaming helpers (browser-only) --
export { PipeMedia, mediaStreamToReadableStream } from './pipe-media.js';
export type {
  PipeMediaConfig, MediaSession, ReceiveSession,
  ShareScreenOptions, ShareWebcamOptions, ShareAudioOptions, ReceiveMediaOptions,
  PipePage, PipePageOptionsMap, PipeOpenPageOptions, PipeSendPageOptions, PipeSharePageOptions,
  PipeReceivePageOptions, PipeVideoPageOptions, PipeNoscriptPageOptions,
} from './pipe-media.js';
// -- Pipe browser data transfer: sendFile / receive / download / subscribeProgress --
export { PipeBrowser, PipeTransferError } from './pipe-browser.js';
export type {
  PipeBrowserConfig, PipeSendData, PipeSendFileOptions, PipeSendFileResult, PipeUploadProgress,
  PipeStatusMessage, PipeReceiveOptions, PipeReceiveResult, PipeDownloadOptions, PipeDownload,
  PipeProgressEvent, PipeStatus,
} from './pipe-browser.js';
export { pipeTransportFromClient } from './pipe-transport.js';
// -- Pipe WebSocket relay (?ws): connect() duplex --
export { PipeWsError, PIPE_WS_MAX_MESSAGE_BYTES } from './pipe-ws.js';
export type { PipeDuplex, PipeConnectOptions } from './pipe-ws.js';
export type { PipeTransport, PipeTransportRequest } from './pipe-transport.js';

// -- curl-channel (WebSocket-multiplexed fetch over Hoody curl kit) --
// In browsers, the channel uses globalThis.WebSocket (no `ws` package).
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

// -- Embed URLs for every kit UI: `client.embeds.<kit>.<view>(container, opts)` --
// Same block as the Node entry; browser-safe (no Node APIs).
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

// Patch the curl channel helper (client.curl.channel.connect) — must run after HoodyClient export
// so the prototype object exists when patched.
import { patchCurlChannelPrototype as _patchCurlBrowser } from './curl-channel-helper.js';
_patchCurlBrowser();

// Install `client.embeds` (a prototype getter; see lib/embeds/attach.ts).
import { HoodyClient as _HCBrowser } from './hoody-client.js';
import { patchEmbedsPrototype as _patchEmbedsBrowser } from './embeds/attach.js';
_patchEmbedsBrowser(_HCBrowser);
