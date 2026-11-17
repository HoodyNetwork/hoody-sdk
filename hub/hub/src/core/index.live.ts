// core's live barrel: everything '@core' offers except the fixture names (the sample world, the fixture boot, the
// core fixture states, the run-open kit fake). It imports no fixture module. The web barrel (./index.ts) re-exports it
// with the fixture names; the terminal ship build resolves '@core' here (scripts/term/resolve.ts FIXTURE_BARRELS), so a
// live terminal module that imports a fixture name from '@core' fails that build.
export { defineRoute, type Route, type RouteSpec, type CallInput } from './routes';
export { FILES_ALIASES, MAX_PATH_BYTES, PROTECTED_ROOTS, encodePathParts, filesUrl, lossyName, normalizeDirPath, partsOfPath, pathPartsProblem, protectedPath, type PathPartsProblem } from './files-path';
export { api, outcomeOf, onPending, type HubError, type Outcome, type PendingNotice } from './api';
// Error details: the facts a surface may show and copy for support about one failed call.
export { errorInfo, errorPage, isErrorInfo, setPageResolver, type ErrorInfo, type ErrorOutcome, type PageResolver } from './errors';
export { defineQuery, defineMutation, queryClient, CoreQueryProvider, refreshFresh, useCore, type FreshAnswer, type FreshRead, type QueryDef, type MutationDef, type MutationHook, type MutationResult, type RunOutcome } from './query';
export { capture, alive, onBump, type BumpReason, type Ctx, type Target, type CoreSnapshot } from './ctx';
export { isIdemKey, newKey, type Validators } from './kit';
export { agentBaseFor, buildPortUrl, familyDomains, hostSegment, hostUnderFamily, maskAddress, portAddress, proxyDomain, routingNode } from './hosts';
// An embedded display viewer's frame (a computer's desktop, a VM's screen): one sandbox, feature list and slow line.
export { DISPLAY_FRAME_FEATURES, DISPLAY_FRAME_SANDBOX, DISPLAY_FRAME_SLOW_MS, displayFrameAllow } from './display-frame';
export { labelNamesOtherHost, readLink, type LinkEnv, type LinkFamily, type LinkRead } from './linkRead';
export { classifyRuntime, computerRuntime, computerRuntimeRoute, portListening, type Listener, type PortListening, type RawRuntime, type RuntimeInfo } from './computerRuntime';
export { agentHome, agentHomeRoute, expandHome, fileStat, fileStatRoute, homeOfCwds, kindOfStat, statParts, statProblem, type HomeInput, type PathKind, type StatInput, type StatProblem } from './pathProbe';
export { EXEC_DEFAULT, EXEC_MAX, execIndex, execOfParam, execRoot } from './exec';
export { defineFixtures, reply, answers, fixtureSocket, type FixtureAnswer, type FixtureRule, type FixtureRequest, type FixtureSocketServer, type SocketScript } from './transport';
export { mintSecret, useSecret, holdSecret, scrubMint, type HeldSecret, type Minted } from './secret';
export { otpCancelled, otpGate, FIXTURE_OTP_CODE } from './otp';
export { accountPref, prefsGeneration, accountForgets, useAccountForgets, useAccountPref, usePrefStatus, usePrefUpdate, localSetting, useLocalSetting, type CryptRead, type AccountPref, type AccountPrefOptions, type PrefWrite, type PrefReport, type LocalSetting, type LocalSettingOptions } from './prefs';
// Encrypted account preferences: "Forget on this browser" (the account menu), boot's wait for the open, and the
// sign-out confirm's "still saving" (pendingPrefWrites), and how kept writes ended at sign-out (unsavedAtSignOut).
export { forgetThisBrowser, cryptReady, onCryptForget, openBlob, overValueMax, pendingPrefWrites, sealBlob, unsavedAtSignOut, type SealedBlob, type WritesOutcome } from './cryptStore';
export { can, capsOf, minimumHeld, useCan } from './token';
export { suggestName, suggestedNameValid, NAME_MAX, type Rand } from './names';
// The object guards and record fallbacks (shape.ts): one helper per behaviour, a table test each.
export { isRecord, isRecordOrArray, isPlainRecord, recordOrEmpty, recordOrNull, recordOrUndefined, stringOrEmpty, type Rec } from './shape';
export { chooseComputer, chooseNoComputer, dropComputer, computerHandle, computerHref, pickComputer, rememberedComputerId, computerState, containerRowOf, imageWords, useCurrentComputer, type ComputerRow, type ComputerState, type ContainerRowView, type DistroId, type ImageWords, type RealmRef } from './computer';
export { useRealms, realmsView, realmLabel, type RealmsView, type RealmRow, type RealmName } from './realms';
export { useRealmCap, realmCapShown } from './realms';
export { REALM_LIMIT_CODE, PLAN_REALMS, isRealmLimit, realmCapMore, realmLimitNumbers, type RealmCap, type RealmCapView } from './realmLimit';
// What a "Use with your agent" prompt names: the shown realm and computer, never a routing node.
export { agentScopeFacts, filterComputer, useAgentScopeFacts } from './agentScope';
// The one realm id check (24 lowercase hex) and realm scope check ('global' or one id): realm-id.ts.
export { isRealmId, isRealmOrGlobal } from './realm-id';
export { readSetupState, reinstalledOffers, useSetupState, redeemInvite, retrySetup, retrySetupWait, claimRetryMinute, resetSetup, setupFixtures, accountContainersRoute, type SetupState, type SetupKind, type SetupRoom, type SetupResult } from './setup';
// The one field core checks before a guarded agent call leaves: core-minted tickets (journal and approver lease), ticket.ts.
export { claimTickets, resetTickets, type Need, type Ticket, type TicketBind, type TicketCall, type TicketIssuer, type TicketKind, type TicketSettled } from './ticket';
export { run, download, postBytes, speechRoute, save, stream, upload, version, store, partitioned, stage, type RunAnswer, type PostBytesInput, type UploadAnswer, type UploadInput, type StreamState, type AgentVersion, type Partitioned, type StoreReset, type StorePut, type Tri, type StoreUpdate, type StoreUpdateFn, type Stage, type StageClose } from './kit-io';
export { utf8Bytes } from './utf8';
export { sha256Hex } from './sha256';
export { resumableStream, type Resumable, type ResumeCursor, type ResumeInput, type ResumeState, type Resync } from './stream-resume';
export { createStreamBudget, RANKS, streamBudget, watchStream, type Grant, type Level, type Mode, type ModeInfo, type Rank, type StreamBudget, type StreamKind, type Watch, type WatchSpec, type WhyNot } from './stream-budget';
export { budgetedStream, streamComputer, type LiveOptions } from './stream-live';
export { botVoiceRoute, openSocket, type HubSocket, type SocketHandlers, type SocketInput, type SocketOutcome } from './socket';
export { sessionStream, MAX_MUX, type SessionStreamOptions } from './stream-mux';
export { reachOf, type Reach } from './reachability';
// The fixture seam: what live code asks of the fixture world while fixtures are on, without importing a fixture module.
export { fixtureComputer, pageFixtures, fixtureErrorKind, fixtureLatency, installFixtureSeam, installFixtureChats, fixtureChats, addFixtureAgent, fixtureAgentKnows, fixtureAgentYolo, fixtureAgentPicture, type FixtureSeam, type FixtureChatSeed } from './fixture-seam';
// The chat lists the AI page and the shell's chat-attention observer share (one query key per read), and the chats
// nobody is looking at: gates for the AI dot, and notes of chats left running (chat-attention.ts).
export {
  chatListRoutes, chatListReads, chatListRealm, chatPlace, markPinned, pinnedAt, onPinned, pinnedRev, sessionOf, sessionsOf, sessionAnswerOf, gatesOf, CHAT_SESSION_PAGE, CHAT_GATE_PAGE,
  type ChatListIn, type ChatSession, type ChatOrigin, type ChatGate, type ChatGatePage, type ChatSessionPage,
} from './chat-lists';
export { attentionGates, onChatAttention, chatAttentionRev, useChatAttentionRev, noteLeftRunning, clearChatNote, chatNotes, useChatNotes, noteMark } from './chat-attention.pure';
export type { AttentionGates, ChatNote } from './chat-attention.pure';
export { chatTickedPlace } from './chat-attention';
// Bots: the one waiting rule and the list route (pages/bots imports both; the shell reads useBotsWaiting).
export { botWaiting, botNeedsYou, botsListRoute, botKeyOf, botIdOk, botRealmOk, parseBotList, parseComputerBots, computerBotsRead, noteBotTarget, useComputerBots, type BotList, type ComputerBot } from './bots';
export { FIXTURE_TARGET, FIXTURE_REALM, FIXTURE_UID } from './transport';
// Commerce (Market, buy, wallet, subscriptions): the flows as `commerce.*` and the money rules as `commerceRules.*`;
// the hooks and their types also by name.
export * as commerce from './commerce';
import { commerceRoutes } from './commerce';
export * as commerceRules from './commerce-pure';
// What a bare-metal listing says, worded once for the Market and Billing's checkout: `listingRules.listingFacts(row)`.
export * as listingRules from './listing-facts';
// Fixture data only: the facts input of every Market fixture listing, shared by the Market and Billing fixtures.
export { SAMPLE_FACTS } from './listing-facts.samples';
export * as providers from './providers';
// The model chooser's trip to the AI page and back: `handoff.*`.
export * as handoff from './handoff';
export type { Handoff, HandoffResult, HandoffDest, NewBotDraft, SettingsDraft } from './handoff';
// An agent conversation's settings (model, effort, reply length, auto-approve) and Claude Code's set: `agent.*`.
export * as agent from './agent';
export { LANES, clock, laneLevel, laneWords, readLanes, usageRefusal, type Lane, type LaneKey, type LaneReading, type LaneWord, type UsageLaneWire } from './ai-usage';
export { usePurchase, useTopUp, useAttempt, type Purchase, type PurchaseSnapshot, type TopUp, type TopUpSnapshot, type Attempt, type AttemptSnapshot, type AttemptKind, type AttemptTarget } from './commerce';
// Notifications: the bell's summary (read-only for pages), the acknowledgement notes, and rows.
export { notificationSummary, onNotificationSummary, refreshNotificationSummary, noteNotificationsRead, noteAllNotificationsRead, notificationRow, notificationListRoute, notificationSummaryRoute, readUnreadSince, type NotificationSummary, type NotificationRow, type NoticeSeverity, type NoticeType, type UnreadSince } from './notifications';
// Browser alerts and discovery hints: the notifications page and the shell's alert runner share one copy.
// The pure half lives in alerts.pure.ts (shared with the terminal build), the browser half in alerts.ts.
export type {
  AlertNotice, BrowserEnv, PlatformInfo, WhyUnsupported, AlertState, AlertStatus, HintKind, SectionId, Seen, AlertPlan,
  EnableResult, AlertInfo, ShowResult,
} from './alerts.pure';
export {
  platformOf, supportOf, alertStatus, firstHelp, TITLE_MAX, BODY_MAX, cleanAlertText, HINT_KINDS, SECTIONS, isHintKind, isSectionId, hintWanted, hintSection,
  MAX_SINGLE_ALERTS, SHOWN_RING, freshNotices, planAlerts, addShown,
  getChoice, setChoice, readList, isBroken, flagBroken, clearBroken, disableAlerts,
} from './alerts.pure';
export { readEnv, currentStatus, enableAlerts, showAlert, isAway } from './alerts';
// The page data source over core (fixtureSource's surface; live on a live page).
export { coreSource, sendProved, sourceReads, SourceError, type CoreSource, type LiveRead, type LiveChange, type SourceTable, type SourceResult, type SourceErrorKind, type FallbackSource } from './source';
// Whether a person chose a computer since a press (computerChoiceRev), and All computers chosen (noComputerChosen).
export { computerChoiceRev, noComputerChosen, noteComputerRows } from './computer';
export { onRouting, routingAllows, routingOf, routingRev } from './routing';
export { fixtureModeActive } from './transport';
export { containersRoute } from './computer';
// Ask's agent sign-in: the boot token for one bootstrap request; the one key mint route (Keys and the boot token).
export { agentBootToken, FIXTURE_BOOT_TOKEN, TOKEN_MINT_CODES, tokenMintRoute } from './boot-token';
// New script's agent sign-in: sign in, prove it by the status, and the status projection.
// The two mails an account asks Hoody to send to its own address (the Account page): the routes the sign-in screens call.
export { requestPasswordReset, resendVerification, type AccountMailResult } from './account-mail';
export { agentLoginOf, agentSignInRoutes, checkAgentLogin, noteAgentStatus, signInAgent, signInOffered, signInUnsure, subscribeSignInUnsure, watchComputer, type AgentLogin, type SignInResult } from './agent-signin';
// Setup routes, so page fixtures can answer them (rules match by route object), and the account read.
export { redeemRoute, retrySetupRoute, freeTierRoute, serversRoute, setupLocks } from './setup';
// One route object per endpoint (fixture rules match by route object): pages use these, never their own copy.
export { versionRoute } from './kit-io';
export { onAuthPurge, onTeardown, probeRoute, vaultKeyRoute, vaultKeyPutRoute, type VaultKeyAnswer } from './realm';
// The realm alias surface: rename, colour, list, and the alias rules.
export { setAlias as setRealmAlias, setTint as setRealmTint, load as loadRealms, PALETTE as REALM_PALETTE, validateRealmAliases, foldRealmAlias, readRealmAliases, aliases as realmAliases, type RealmColor } from './realm';
// Shared locks: the pending changes another page sent (key, identity, computer), to read a receipt and settle.
export { changeHoldRefs, changeHoldRefsIn, changesOverview, heldChanges, keepsChanges, mergeStoredChanges, nobodysHeld, sendingChanges, unresolvedChanges, useChangesVersion, type HeldByOther, type HeldChange, type HeldFrom, type HeldRow, type ForgetVerdict, type AttemptsForget, type ChangeOverview, type HoldRef, type SendingChange } from './changes';
export { attemptFor, attemptStored, attemptsVersion, heldAttempts, heldAttemptsAnyAccount, holdAttempt, MAX_ATTEMPTS, subscribeAttempts, useAttemptsVersion, type AttemptHold, type HeldAttempt, type HoldCode, type HoldResult, type StoredHold } from './attempts';
// The scripts writer's unsettled asks (hub.v3.script-asks): compare-and-set read/put/drop under the change-store lock.
export { claimScriptAsk, dropScriptAsk, dropScriptAsks, putScriptAsk, readScriptAsks, subscribeScriptAsks, subscribeVersion as subscribeScriptAsksVersion, validScriptAsk, SCRIPT_ASKS_KEY, SCRIPT_ASKS_MAX, SCRIPT_ASKS_MAX_BYTES, SCRIPT_ASK_STR_MAX, type ScriptAsk, type ScriptAskPhase, type ScriptAskWrite } from './script-asks';
// New script draft records (same key and lock): one per draft, compare-and-set (pages/scripts/new/records.ts).
export { admitDraftRecord, dropDraftRecord, putDraftRecord, readDraftRecords, validDraftRecord, DRAFTS_MAX, DRAFT_KEEP_MS, type DeployPhase, type DraftDeploy, type DraftMode, type DraftRecord, type DraftState } from './script-asks';
/** GET /subserver-subscriptions (the subscriptions list): the same object commerce reads (commerce.commerceRoutes.subsListRoute). */
export const subsListRoute = commerceRoutes.subsListRoute;
export { forgetHere, meRoute, noteShownAlias } from './lifecycle';
// Remove all local data (Account settings): the confirm's warning, then the checked sign-out that wipes this browser's Hub storage.
export { localWipeWarning } from './local-wipe.pure';
export type { LocalWipe, LocalWipeWarning, WipeCheck, WipeHold } from './local-wipe.pure';
export { removeLocalData } from './local-wipe';
// The C9 lock for a page's own change call.
export { useLockedChange, readBackAll, type LockedChange, type LockedOptions, type LockedRead, type LockedResult, type LockState } from './locked';
// 2FA on/off: session-rotating changes (api() adopts the reissued pair).
export { verifySetupRoute, turnOffRoute, type ReissuedSession } from './twofa';
export { useRunOpen, type UseRunOpenOptions } from './run-open-hook';
// Inside an iframe (a page hides what a frame must not offer).
export { isFramed } from './session';
// The realm API domain a page names (realm URLs are built from it).
export { realmDomain } from './session';
export { hubApiBase } from './session';
// The app-launch terminal band (ids up to 9999; a launch made before in the old band is still read and closed).
export { BAND as RUN_BAND, inBand as inRunBand, inHeld as inRunHeld } from './run-open/index';
export { computerIdOf, formatRunHandle, parseRunTarget, runOpenCodes, type OpenRequest, type RunHandle, type RunOpen, type RunProgress, type RunResult, type RunState } from './run-open/index';
export { boardSend, boardFixtureRoute, BOARD_BROWSER_IDS, BOARD_IDS, BOARD_SHELLS, BROWSE_TIMEOUT_MS, outsideUrl, type BoardKit, type BoardSendOptions, type BoardTarget } from './run-open/board';
// Daemon programs: the route table and the one program-change builder (Programs page and Computers tab).
export { programRoutes, programLock, programOp, type ProgramAct, type ProgramOp, type ProgramOpInput, type ProgramRestartReceipt, type ProgramOverviewWire } from './programs';
export {
  programModel, programProof, programCounts, programOrder, programProves, temporaryStopProves, restartReceiptVerdict,
  type Row as ProgramRow, type Part as ProgramPart, type Model as ProgramModel, type Counts as ProgramCounts, type Can as ProgramCan,
  type StateKey as ProgramStateKey, type Scope as ProgramScope, type Action as ProgramAction, type StopInfo as ProgramStopInfo,
  type RawOverview as ProgramRawOverview, type RawProgram as ProgramRawProgram, type RawTemporary as ProgramRawTemporary,
  type RawInstance as ProgramRawInstance, type RawResult as ProgramRawResult,
} from './program-model';
// Computer power: the one lifecycle change (start, stop, pause, resume...) every page sends, and the list that proves it.
// Core's page reading of a containers answer (its rows and whether they are the whole list), for pages that read their own containers list.
export { pageOf as computersPageOf } from './power';
export { ALL_PAGES_MAX, useComputersAll, type ComputersAll } from './power';
export { computerLifecycle, computerLifecycleRoute, computersList, computersPage, lifecycleLock, lifecycleProves, lifecycleVerdict, LIFECYCLE_OPS, type LifecycleOp, type LifecycleVars, type ComputerWire, type ComputerPage } from './power';
export { ALLOWLIST_MAX, IP_LOOKUP_MAX, appendIp, geoLookupIp, ipLookupRoute, ipv4Problem, myIpRoute, parseAllowlist, privateV4, type IpProblemCode, type ParsedAllowlist } from './ipv4';
export { ipGeo, createIpGeo, parseLookup, type GeoDeps, type GeoState, type IpGeo } from './ipgeo';
export { aliasRoutes, aliasLock, aliasList, aliasRowsOf, aliasAtPort, ALIAS_RE, aliasProblem, suggestAliasName, validAlias, type AliasRow } from './aliases';
export { pipeRoutes } from './pipe';
// Uploads: one picked file through a declared file route, hashed and sent by the transfer worker.
export { sendFile, PER_COMPUTER, type FileUploadInput, type FileUploadOutcome, type UploadPhase } from './upload';
export { askLeave, holdLeave, leaveCount, onLeaveCount, setLeaveAsker, useLeaveCount, type LeaveKind } from './leave';
// Switch guard: unsaved work a page names before a user-started realm switch or sign-out (switch-guard.ts).
export { lossesCovered, noteLossesConfirmed, onSwitchGuards, registerSwitchGuard, switchLosses } from './switch-guard';
export { asUnknown, refusal, subjectOf, targetOf, useHeldChangeOf, useHeldOf, useRunner, useShownRealm, type HeldOpts, type RefusalFacts, type RunnerMutation, type RunnerOutcome, type RunnerResult, type Subject } from './storage';
// A computer's own colour as `#RRGGBB` (or null): the only value any computer-colour style reads.
export { computerColor } from './computerColor';
// The Hub passcode: the per-tab lock engine. The lock host, the lock screen and the
// Account section use these; only the engine writes the passcode record.
export { bootGate, cancelPending, changeLock, checkIdle, checkPasscode, configureAppLock, isLocked, leaveTab, lockNow, lockSettings, lockSupport, lockTab, lockView, noteInput, onLockChange, passcodeProblem, passcodeStored, removePasscode, setPasscode, startLockReceiver, useLocked, useLockVersion, IDLE_CHOICES, MAX_TRIES, type ChangeResult, type CheckResult, type IdleMin, type LockSettings, type LockView, type PasscodeProblem, type RemoveResult, type SetResult } from './applock';
export { installLockHost, lockHost } from './applock-host';
export { LOCK_HOST_ID, LOCKED_ATTR } from './applock-host.pure';
// Bots voice: Talk's one-tab lock and its take-over channel reach Web Locks and the tab channel through the host env.
export { hostEnv, type HostChannel, type HostLocks } from './host-env';
// The Hoody API operations by operationId (generated: core/ops.gen.ts). Types only here: OPS stays out of
// the barrel, so a page bundle never carries the catalogue.
export type { OperationId, OpMethod } from './ops.gen';
// Where this Hub talks to: the served Hub answers from its own origin; the one-file standalone Hub reads the origin the
// person chose. Read-only helpers; nothing outside core sets the origin.
export { isStandalone, servedHubUrl, apiOrigin, hubSiteOrigin, hubFileUrl, HUB_FILE_NAME } from './origin';
// The legal pages on Hoody's site (the plans page's lower links, the one-file Hub's sign-up).
export { LEGAL } from './site';
