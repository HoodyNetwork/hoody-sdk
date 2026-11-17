// @kit/pure: kit functions and constants whose whole import closure is free of CSS, React Aria,
// react-dom, the router and browser globals, so the terminal Hub can import them. A name joins only when
// kit/entries.closure.test.ts passes with it; its list there is the membership. Pages import it as '@kit/pure'.
export { LOCALE, makeT } from './strings';
export { bytesToGb, countryFlag, formatDate, formatDateTime, formatNumber, formatPercent, formatRelative, formatStorage } from './format';
export { matchesSearch } from './data/DataTableViewLogic';
export { codeLangOfPath } from './data/codeLang';
export { agentSignedOut } from './agent';
export { ipDetailsFrom, type IpDetails } from './data/ipDetails';
export { platformHosts, platformText, type PlatformHosts } from './widgets/platformText';
export { normalizeHexColor } from './forms/hexColor';
// The type-or-browse path rule: a page that maps PathField's text to a path reads "outside" the same way.
export { pathSplit } from './forms/pathPick';
// The cron preset model: the Schedules editor and a script's schedule read the same functions.
export { EVERY as CRON_EVERY, nextRuns as cronNextRuns, recognise as cronRecognise, toExpr as cronToExpr, type CronField, type Kit as CronKit, type Preset as CronPreset, type Preview as CronPreview } from './cron';
export { initial as voiceInitial, step as voiceStep, pendingOf as voicePendingOf, restorePending as voiceRestorePending, NOTE_TTL_MS as VOICE_NOTE_TTL_MS, NOTES_CAP as VOICE_NOTES_CAP, type Effect as VoiceEffect, type MaybeSent, type Mode as VoiceMode, type PendingIdentity, type VoiceEvent, type VoiceState } from './voice/machine';
// Bots voice: the voice socket's frame codec (kit/voice/wire.ts, no imports), for pages/bots/voice/session.ts.
export { connectQuery as voiceConnectQuery, decodeOutputAudio as voiceDecodeOutputAudio, encodeClientFrame as voiceEncodeClientFrame, encodeInputAudio as voiceEncodeInputAudio, parseServerFrame as voiceParseServerFrame } from './voice/wire';
