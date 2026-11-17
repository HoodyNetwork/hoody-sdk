// What the shell (and only the shell) imports from core: boot, sign-out, the realm and computer switchers,
// the notices it shows and the dev fixture mode. Pages import '@core' (index.ts) and never these.
export { initLive, bootLive, configureLifecycle, logout, onLifecycle, endTokenSession, signOutForgetting, signOutForgettingAsks, signOutHolds, type AsksDropped, type SignOutForget, type BootResult, type LifecycleEvent, type LifecycleConfig, type TokenPanel } from './lifecycle';
export type { HoldRef } from './change-store';
export { tokenInfo, checkTokenSession, type TokenInfo, type TokenNotice } from './token';
export {
  load as loadRealms, switchTo as switchRealm, beginSwitch, switchRevision, type SwitchOp, list as realmList, count as realmCount, displayName as realmName, tint as realmTint, setTint as setRealmTint,
  setAlias as setRealmAlias, shortId as realmShortId, onRealmNotice, onTeardown, PALETTE as REALM_PALETTE, type RealmNotice, type RealmColor,
} from './realm';
export { setTarget, setView, snapshot, subscribe, type Target, type CoreSnapshot } from './ctx';
export { setOtpPrompt, onPending, type OtpPrompt, type PendingNotice } from './api';
export { useOtpPrompt, type OtpPromptState } from './otp';
export { startFixtureMode, FIXTURE_REALM, FIXTURE_TARGET } from './transport';
export { currentStage, type Stage, type StageClose } from './kit-io';
// The warned sign-out's script asks: what its warning lists, and a version to re-read on.
export { readScriptAsks, sameScriptAsk, useScriptAsksVersion, type ScriptAsk } from './script-asks';
// The bell: the notification summary poller and the bounded unread read behind browser alerts.
export { notificationSummary, onNotificationSummary, refreshNotificationSummary, readUnreadSince, type NotificationSummary, type NotificationRow, type UnreadSince } from './notifications';
// Browser alerts and discovery hints: the notifications page and the shell's alert runner share one copy.
export {
  type AlertNotice, type BrowserEnv, type PlatformInfo, type WhyUnsupported, type AlertState, type AlertStatus, type HintKind, type SectionId, type Seen, type AlertPlan,
  type EnableResult, type AlertInfo, type ShowResult,
  platformOf, supportOf, alertStatus, firstHelp, TITLE_MAX, BODY_MAX, cleanAlertText, HINT_KINDS, SECTIONS, isHintKind, isSectionId, hintWanted, hintSection,
  MAX_SINGLE_ALERTS, SHOWN_RING, freshNotices, planAlerts, addShown,
  readEnv, getChoice, setChoice, readList, isBroken, flagBroken, clearBroken, currentStatus, enableAlerts, disableAlerts, showAlert, isAway,
} from './alerts';
export { containersRoute } from './computer';
// The passcode lock: the lock screen, the key gates, Lock now in the account menu and palette.
export { checkPasscode, isLocked, lockNow, lockSettings, lockView, useLocked, useLockVersion, MAX_TRIES, type CheckResult, type LockView } from './applock';
export { lockHost } from './applock-host';
export { forgetHere } from './lifecycle';
// The Bots badge: how many Bots of the shown realm wait for a person.
export { useBotsWaiting, useBotsWaitingRead, type BotsWaitingRead } from './bots';
// The AI chats nobody is looking at: the observer the shell mounts once (chat-attention.ts).
export { useChatAttention } from './chat-attention';
