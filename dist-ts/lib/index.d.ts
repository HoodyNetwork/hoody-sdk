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
 *   ShellType / ConnectionState (the typed-only client without the Duplex
 *   shim is the generated TerminalSessionsConnectWebSocket)
 *
 * -- WebSocket upgrade errors (generated WebSocket clients, TerminalClient) --
 *   WebSocketUpgradeRefusedError, WebSocketUpgradeFailedError, WebSocketCredentialNotSentError +
 *   isWebSocketUpgradeRefusedError, isWebSocketUpgradeFailedError, isWebSocketCredentialNotSentError
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
 *   normalizeComputerStatsResponse, normalizeProjectStatsResponse
 *
 * -- Exec helpers (prototype augmentation + dynamic script support) --
 *   filterAgentScripts + types (the prototype patches run at import; they are not exported)
 *
 * -- Embed URLs for every kit UI (client.embeds) --
 *   buildEmbedUrl, getEmbedCatalog, listEmbedViews, deriveComputersDomain,
 *   EmbedValidationError, createEmbeds + types
 *
 * Safe from regeneration — add new custom exports here.
 */
export { EventsClient } from './events-client.js';
export { EventsManager } from './events-manager.js';
export { io } from 'socket.io-client';
export { TerminalClient } from './terminal-client.js';
export type { TerminalClientOptions, TerminalPreferences, ShellType, ConnectionState, ITerminalWebSocketOptions, } from './terminal-client.js';
export { isWebSocketUpgradeRefusedError, isWebSocketUpgradeFailedError, isWebSocketCredentialNotSentError, } from './websocket-errors.js';
export type { WebSocketUpgradeRefusedError, WebSocketUpgradeFailedError, WebSocketCredentialNotSentError, } from './websocket-errors.js';
export { encrypt, decrypt, isEncrypted, parseEnvelope, VaultCryptoError } from './vault-crypto.js';
export type { EncryptedEnvelope } from './vault-crypto.js';
export { streamAgentPrompt } from './agent-client.js';
export type { AgentPromptEvent, AgentPromptResult, AgentPromptHandle, AgentPromptKitAuth, StreamAgentPromptArgs, } from './agent-client.js';
export { formatEd25519SshPublicKey, parseEd25519SshPublicKey, generateEd25519SshKeyPair, } from './ssh-keys.js';
export type { Ed25519SeedInput, SshPublicKeyInput, ParsedEd25519SshPublicKey, GenerateEd25519SshKeyPairOptions, GeneratedEd25519SshKeyPair, } from './ssh-keys.js';
export { getHoodySignatureHeader, parseHoodySignatureHeader, parseHoodySignatureFrom, verifyHoodySignatureHeader, verifyHoodySignatureFrom, verifyHoodySignatureFromContext, hoodySignaturePath, } from './signing.js';
export type { HoodySignatureResponseContext, HoodySignatureHeader, HoodySignatureHeaderCarrier, VerifyHoodySignatureInput, VerifyHoodySignatureOptions, } from './signing.js';
export { HoodyClient, } from './hoody-client.js';
export type { DaemonProgramRef, ProgramTerminalConnectOptions, ProgramTerminalConnection, } from './hoody-client.js';
export { ApiError, isApiError, isRetryableApiError, ValidationError, RetiredOptionError, isApiErrorCode, } from '../generated/errors.js';
export type { ApiErrorOutcome, ApiErrorRequestContext, ApiErrorResponseDetails, RetryableApiError, RetryableStatus, } from '../generated/errors.js';
export type { HoodyClientConfig } from '../generated/client.js';
export type { HoodyCredentials } from '../generated/client.js';
export { TwoFactorRequiredError, isRealmScopeError } from '../generated/client.js';
export type { HoodySessionTokens, HoodySessionUpdate, RealmScopeApiError, ComputerLike } from '../generated/client.js';
export { HttpClient } from '../generated/http-client.js';
export { nodeTransportInUse } from '../generated/http-client.js';
export type { HoodyFetch, IEventStream, IStreamEvent, ITypedStreamEvent, IStreamEventsOptions, IStreamResponse, IStreamTurnEnd } from '../generated/http-client.js';
export type * from '../generated/types.js';
export type { IHttpClientConfig, IRequestData, IHttpClientMiddleware, IHttpClientMiddlewareRequestContext, IHttpClientMiddlewareResponseContext, IHttpClientMiddlewareErrorContext, } from '../generated/http-client.js';
export { listKits, } from './kit-catalog.js';
export type { KitCatalogEntry, KitCatalogKind, KitCatalogOptions, } from './kit-catalog.js';
export { normalizeComputerStatsResponse, normalizeProjectStatsResponse, } from './metrics.js';
export type { ExecDeleteFileOptions, ExecListFilesOptions, ExecReadJsonFileResponse, ExecReadFileOptions, ExecScriptsRequestOptions, ExecScriptsTemplateVars, ExecWriteJsonFileOptions, ExecWriteFileOptions, } from './exec-scripts.js';
export type { ExecExecutionRequestOptions, ExecExecutionTemplateVars, } from './exec-script-execution.js';
export type { TerminalExecOptions, TerminalExecResult, TerminalShellOptions, TerminalShell, } from './terminal-exec.js';
import type { TerminalShellOptions as _ShellOptions, TerminalShell as _Shell } from './terminal-exec.js';
declare module './hoody-client.js' {
    interface HoodyClient {
        /**
         * Open an interactive PTY shell session to the computer.
         *
         * Each call opens a fresh session of its own; pass `terminalId` to join a
         * shared one instead (see TerminalShellOptions.terminalId).
         *
         * Returns a Duplex stream that supports `.pipe()`.
         * Requires a computer-scoped client (call `withComputer()` first).
         *
         * @example
         * ```ts
         * const scoped = await client.withComputer(computer);
         * const sh = scoped.shell();
         * await sh.ready;
         * sh.write('echo hello\n');
         * sh.pipe(process.stdout);
         * ```
         */
        shell(options?: _ShellOptions): _Shell;
    }
}
export type { SshTerminalOptions, LocalTerminalOptions, DesktopTerminalOptions, SshExecOptions, TerminalCreateResult, SshExecResult, } from './terminal-ssh.js';
export { listCallableScripts, scriptPathToName, isValidToolName, sanitizeDescription, extractParamsFromSchema, extractPathParams, } from './exec-dynamic-discovery.js';
export type { CallableScript, CallableScriptParam, CallableScriptsCache, ListCallableScriptsOptions, } from './exec-dynamic-discovery.js';
export { clearCallableScriptsCache, } from './exec-dynamic-client.js';
export type { CallScriptOptions, ExecDynamicServices, } from './exec-dynamic-client.js';
export { filterAgentScripts, } from './exec-dynamic-skills.js';
export { parseRawScriptEntry, parseRawScriptEntries, } from './exec-dynamic-parse.js';
export type { RawScriptEntry, } from './exec-dynamic-parse.js';
export { readFileCache as readExecFileCache, writeFileCache as writeExecFileCache, deleteFileCache as deleteExecFileCache, pruneStaleCache as pruneExecStaleCache, } from './exec-dynamic-cache.js';
export { ScreenshotSaveError, } from './screenshot-save.js';
export type { SaveScreenshotOptions, SaveScreenshotResult, ScreenshotSource, ScreenshotFormat, ScreenshotSaveErrorCode, DisplayScreenshotCaptureOptions, BrowserScreenshotCaptureOptions, TerminalScreenshotCaptureOptions, } from './screenshot-save.js';
export type { FilesReadOptions, FilesExistsOptions } from './files-service-extensions.js';
export type { SqliteBindValue, SqliteParams, SqliteSqlRequest, SqliteQueryResult, SqliteRunResult, } from './sqlite-helpers.js';
export type { KvReadOptions, KvExistsOptions, KvSetTextOptions, KvReadArgs, KvKeyArgs, KvKeyValueArgs, KvKeyMethod, KvKeyValueMethod, KvStoreObjectForms, SqliteKvStore, KvArraysKeyMethod, KvArraysKeyValueMethod, KvArraysKeyArgs, KvArraysKeyValueArgs, KvArraysObjectForms, SqliteKvArraysStore } from './kv-helpers.js';
export { mount, unmount, unmountById, unmountAll, unmountByComputer, listMounts, pruneStaleMounts, probeKit, resolveKitUrl, parseCliTarget, UnmountError, PendingUploadsError, } from './mount.js';
export type { MountOptions, MountTarget, MountHandle, MountListEntry, ProbeResult, ParsedCliTarget, ComputerLike as MountComputerLike, UnmountOptions, EarlierUnsent, } from './mount.js';
export { share, listShares, stopShare, ShareError, AmbiguousShareError, UndeliveredWritesError, } from './share.js';
export type { ShareOptions, ShareHandle, ShareTarget, ShareEvent, ShareState, ShareListEntry, ListSharesOptions, StopShareOptions, StopShareResult, } from './share.js';
export { NotificationDisplayClient } from './notification-display-client.js';
export type { NotificationDisplayClientConfig } from './notification-display-client.js';
export { createNotificationPresenter, parseNotificationData, } from './notification-presenter.js';
export type { NotificationPresenter, NotificationPresenterConfig, ParsedNotification, } from './notification-presenter.js';
export type { ProxyAuth, ProxyAuthPolicy, KitProgram, ProxyAuthJwt, ProxyAuthPassword, ProxyAuthToken, ProxyAuthComputerClaim, ProxyAuthIp, } from './proxy-auth.js';
export { isProxyAuthPolicy } from './proxy-auth.js';
export type { EventServerMessage, EventClientMessage, HoodyEvent, PersistedHoodyEvent, EventsStreamGap, HoodyStreamEvent, EphemeralHoodyEvent, EventActor, EventVisibility, EventHistoryItem, EventWireFrame, WelcomeFrame, TickFrame, ErrorFrame, RevokedFrame, ScopeChangedFrame, ServerFrame, } from './events-types.js';
export { EventsSocketTransport } from './events-types.js';
export type { EventsClientOptions, EventsOnOptions, EventsWaitOptions, EventsStreamOptions, EventsWaitFilter } from './events-client.js';
export type { EventFilter, EventsLifecycleState, EventsConnectionEvent, EventsStateEvent, EventsManagerOptions, EventsTransport } from './events-manager.js';
export { EventsError, EventsAuthError, EventsClosedError, EventsSessionChangedError, EventsTimeoutError, EventsGapError, socketActionFor, historyActionFor, } from './events-errors.js';
export type { EventsGapReason, EventsSocketAction, EventsHistoryAction } from './events-errors.js';
export { EventIdLru, EventsRecovery } from './events-replay.js';
export type { EventsHistoryPage, EventsHistoryReader } from './events-replay.js';
export { EventsSession } from './events-session.js';
export { EVENT_TYPES, EVENT_CATALOG, isEventType, isEventPattern, isEphemeralEventType, isPersistedEventType, isReservedEventType, expandEventPattern, eventCatalogInfo, } from './events-catalog.js';
export type { EventType, EventPattern, EventTypesMatching, EventPayload, HoodyEventMap, PersistedEventType, EphemeralEventType, ReservedEventType, EventCatalogInfo, ResourceTypeFor, ResourceType as EventResourceType, } from './events-catalog.js';
export { PipeStream, PipeReceiveEmptyBodyError, PipeIntegrityError, PipeTransferError, encodePipePath, validatePipePath, coerceToReadableStream, parseStatusLine, parseStatusStream, parseSseEvent, parseSseStream, boolQuery as pipeBoolQuery, } from './pipe-stream.js';
export type { PipeStreamConfig, PipeSource, PipeSendOptions, PipeSendResult, PipeStatusMessage, PipeReceiveOptions, PipeReceiveResult, PipeStatus, PipeProgressEvent, PipeForwardTcpOptions, PipeForwardTcpResult, SseEvent, } from './pipe-stream.js';
export { PipeWsError, PIPE_WS_MAX_MESSAGE_BYTES } from './pipe-ws.js';
export type { PipeDuplex, PipeConnectOptions } from './pipe-ws.js';
export { parseLocalTarget as parseTunnelTarget, parseComputerPort as parseTunnelPort, } from './tunnel-parse-target.js';
export { expose as exposeTunnel, pull as pullTunnel, serve as serveTunnel, tunnelConnectUrl, TunnelSession, } from './tunnel-client.js';
export { keepTunnelAlive, resumeExpose as resumeTunnelExpose, resumePull as resumeTunnelPull, TunnelSessionError, TunnelResumeAbortedError, } from './tunnel-client.js';
export type { TunnelCloseInfo, KeepTunnelAliveOptions, KeptTunnel, TunnelEnd, ResumeControl, ResumeTunnelExposeOptions, ResumeTunnelPullOptions, ResumedTunnel, } from './tunnel-client.js';
export type { ScopedTunnelExposeOptions, ScopedTunnelPullOptions, ScopedTunnelServeOptions, } from './tunnel-service-extensions.js';
export type { ExposeOptions as ExposeTunnelOptions, PullOptions as PullTunnelOptions, ServeOptions as ServeTunnelOptions, TunnelHandle, LocalTarget as TunnelLocalTarget, ConnectOptions as TunnelConnectOptions, BindOptions as TunnelBindOptions, BindResult as TunnelBindResult, JoinTicket as TunnelJoinTicket, ResumedBind as TunnelResumedBind, HelloResult as TunnelHelloResult, } from './tunnel-client.js';
export { FrameType as TunnelFrameType, ResetCode as TunnelResetCode, HEADER_SIZE as TUNNEL_HEADER_SIZE, MAX_PAYLOAD_SIZE as TUNNEL_MAX_PAYLOAD_SIZE, MAX_FRAME_SIZE as TUNNEL_MAX_FRAME_SIZE, isExtensionRange as isTunnelExtensionRange, isMandatoryUnknown as isTunnelMandatoryUnknown, isControlFrame as isTunnelControlFrame, } from './tunnel-protocol-types.js';
export type { Frame as TunnelFrame, FrameHeader as TunnelFrameHeader, } from './tunnel-protocol-types.js';
export { encodeFrame as encodeTunnelFrame, encodeFrames as encodeTunnelFrames, decodeFrame as decodeTunnelFrame, decodeFrames as decodeTunnelFrames, dataFrame as tunnelDataFrame, pingFrame as tunnelPingFrame, pongFrame as tunnelPongFrame, windowFrame as tunnelWindowFrame, eofFrame as tunnelEofFrame, CodecError as TunnelCodecError, MAX_MESSAGE_SIZE as TUNNEL_MAX_MESSAGE_SIZE, MAX_FRAMES_PER_MESSAGE as TUNNEL_MAX_FRAMES_PER_MESSAGE, } from './tunnel-protocol-codec.js';
export type { DecodeResult as TunnelDecodeResult } from './tunnel-protocol-codec.js';
export { handleHttpStream as handleTunnelHttpStream, handleTcpStream as handleTunnelTcpStream, setupAutoForwarding as setupTunnelAutoForwarding, destroyAllLocalAgents as destroyAllTunnelLocalAgents, } from './tunnel-http-pump.js';
export { startLocalExit, fetchThroughProxy, LocalExitStartupError, } from './local-exit.js';
export type { LocalExitOptions, LocalExitHandle, LocalExitVerification, LocalExitTeardownReport, LocalExitComputerLike, } from './local-exit.js';
export { startTunnelSocks5 } from './tunnel-socks5.js';
export type { StartTunnelSocks5Options, TunnelSocks5Handle, } from './tunnel-socks5.js';
export { handleSocks5Stream, createServerState as createSocks5ServerState, } from './socks5-server.js';
export type { Socks5Stream, Socks5Credentials, Socks5ServerOptions, Socks5ServerState, Socks5ConnectEvent, Socks5DenyReason, } from './socks5-server.js';
export { resolveAndAuthorize as resolveAndAuthorizeDestination, isPrivateAddress, clearDnsCache as clearDestinationDnsCache, DestinationDeniedError, } from './net-destination-policy.js';
export type { DestinationPolicy, ResolvedDestination, DenyReason as DestinationDenyReason, DnsLookup as DestinationDnsLookup, } from './net-destination-policy.js';
export { CurlChannel, CurlChannelStream, createCurlFetch, ChannelError as CurlChannelError, AbortError as CurlAbortError, createAbortError as createCurlAbortError, SSE_EVENT_QUEUE_CAP as CURL_SSE_EVENT_QUEUE_CAP, MAX_INBOUND_FRAME_BYTES as CURL_MAX_INBOUND_FRAME_BYTES, } from './curl-channel-client.js';
export type { CurlRequest, ExecutionMode as CurlExecutionMode, SseEvent as CurlSseEvent, ChannelHello as CurlChannelHello, ChannelHooks as CurlChannelHooks, ChannelOptions as CurlChannelOptions, ReconnectOptions as CurlChannelReconnectOptions, RequestOptions as CurlChannelRequestOptions, CurlFetch, CurlFetchOptions, ChannelClientMessage as CurlChannelClientMessage, ChannelServerMessage as CurlChannelServerMessage, } from './curl-channel-client.js';
export type { CurlChannelHelperOptions } from './curl-channel-helper.js';
export { generateNotesFileId, encodeTusMetadata, NOTES_UPLOAD_CHUNK_BYTES, } from './notes-upload.js';
export type { NotesUploadData, NotesUploadProgress, NotesChunkOptions, NotesUploadFileOptions, NotesUploadResult, NotesUploadFileResult, } from './notes-upload.js';
export { exportStream as notesExportStream } from './notes-export.js';
export type { NotesExportQuery, NotesExportOptions } from './notes-export.js';
export { BOT_MESSAGE_IDEMPOTENCY_CAPABILITY } from './bot-chat.js';
export type { BotAskOptions, BotAskResult, BotFollowLogsOptions, BotLogRow, BotMessageReceipt, BotStreamFrame, } from './bot-chat.js';
export { runOpenCore } from './run-open.js';
export type { RunOpenCanOpenResult, RunOpenCatalogEntry, RunOpenCloseOptions, RunOpenFailure, RunOpenFindOptions, RunOpenFindResult, RunOpenHandle, RunOpenOptions, RunOpenRequest, RunOpenResult, RunOpenState, RunOpenGetStatusOptions, RunOpenWaitOptions, RunOpenWaitResult, RunOpenWhere, } from './run-open.js';
export { BotUrlClient, BotUrlError, isBotUrlError, isGateHandle, BOT_URL_ERRORS } from './bot-url-client.js';
export { isValidBotLabel, isValidBotZone, botLabelOfHost, botLabelOfUrl, botZoneFor, botUrlZones, BOT_URL_ZONE } from './bot-label.js';
export type { BotLabelOfUrlOptions } from './bot-label.js';
export type { BotUrlAnswer, BotUrlAskOptions, BotUrlChatMessage, BotUrlChatOptions, BotUrlChatResult, BotUrlErrorInfo, BotUrlEvent, BotUrlStreamEventsOptions, BotUrlEventStream, BotUrlGateAnswer, BotUrlLocalCode, BotUrlModel, BotUrlClientOptions, BotUrlRetryOptions, BotUrlStatus, BotUrlUpdate, BotUrlUpdates, } from './bot-url-client.js';
export { pipeTransportFromClient } from './pipe-transport.js';
export type { PipeTransport, PipeTransportRequest } from './pipe-transport.js';
export type { ExecScriptCallOptions, ExecScriptMethod } from './exec-script-execution.js';
export { ExecRemoteError, ExecRemoteTokenError, ExecRemotePermissionError, ExecRemoteThrewError, ExecRemoteTimeoutError, ExecRemoteUnsupportedError, ExecRemoteConnectionError, isExecRemoteError, formatExecRemoteFix, createExecRemoteConnection, } from './exec-remote.js';
export type { ExecRemoteFactory, ExecRemoteConnection, ExecRemoteOptions, ExecRemoteOpOptions, ExecRemoteEvaluateOptions, ExecRemoteEvaluateContext, ExecRemoteRunKind, ExecRemoteStreamEventsOptions, ExecRemoteTailLevel, ExecRemoteSendResult, ExecRemoteCallResult, ExecRemoteEvaluateResult, ExecRemoteLogLine, ExecRemoteCapabilities, ExecRemoteFrame, ExecRemoteFix, ExecRemoteSession, ExecRemoteCloseInfo, ExecRemoteTransport, ExecRemoteRawAnswer, } from './exec-remote.js';
export type { CurlChannelLimits } from './curl-channel-helper.js';
export { withTokenQueryParam } from './proxy-auth.js';
export { buildEmbedUrl, getEmbedCatalog, listEmbedViews, deriveComputersDomain, EmbedValidationError, } from './embeds/runtime.js';
export type { EmbedErrorCode, EmbedParamValue, EmbedQuery, EmbedComputerTarget, EmbedAliasTarget, EmbedTarget, EmbedBuildOptions, EmbedBuildContext, } from './embeds/runtime.js';
export { createEmbeds } from './embeds/attach.js';
export type { HoodyEmbeds, EmbedTargetArg, EmbedsHost } from './embeds/attach.js';
export type { EmbedKit, EmbedViewId, EmbedViewParams, EmbedViewQuery, EmbedWrapperOptions, EmbedWrappers, EmbedsCatalog, } from '../generated/embeds.generated.js';
export { AGENT_CONFIG_TOOLS, DEFAULT_SYNC_CATEGORIES, } from './agent-config-sync.js';
export type { SyncCategory, AgentRoot, AgentConfigToolSpec, AgentConfigSyncOptions, SyncFileEntry, AgentConfigSyncResult, } from './agent-config-sync.js';
