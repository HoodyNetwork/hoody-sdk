// The pure half of alerts.ts (split out so the terminal build shares it; the contract is at the top of alerts.ts):
// the alert and hint decisions, and the per-account choices kept through localSetting. alerts.ts re-exports every name
// here and keeps the browser half (readEnv, currentStatus, enableAlerts, showAlert, isAway).
import type { NotificationRow } from './notifications';
import { type LocalSetting, localSetting } from './prefs';

/** What the alert engine reads of a notice (a NotificationRow, or a page's own row of the same shape). */
export interface AlertNotice {
  readonly id: string;
  readonly at: string | null;
  readonly read: boolean;
}

// ── browser alerts: the permission state machine ───────────────────────────

/** What the browser offers; read once by readEnv() below so every function here is testable without one. */
export interface BrowserEnv {
  /** window.Notification exists. */
  hasNotification: boolean;
  permission: string | undefined;
  secure: boolean;
  ua: string;
  platform: string;
  touch: number;
  standalone: boolean;
}

export interface PlatformInfo {
  ios: boolean;
  android: boolean;
  mobile: boolean;
  standalone: boolean;
  browser: 'edge' | 'firefox' | 'chrome' | 'safari' | 'other';
}

export function platformOf(e: BrowserEnv): PlatformInfo {
  const ios = /iPad|iPhone|iPod/.test(e.ua) || (e.platform === 'MacIntel' && e.touch > 1);
  const android = /Android/.test(e.ua);
  const browser = /Edg(e|A|iOS)?\//.test(e.ua)
    ? 'edge'
    : /Firefox|FxiOS/.test(e.ua)
      ? 'firefox'
      : /Chrome|CriOS|Chromium/.test(e.ua)
        ? 'chrome'
        : /Safari/.test(e.ua)
          ? 'safari'
          : 'other';
  return {
    ios,
    android,
    mobile: ios || android,
    standalone: e.standalone,
    browser,
  };
}

export type WhyUnsupported = 'insecure' | 'ios_tab' | 'no_api';

export function supportOf(e: BrowserEnv): { ok: true } | { ok: false; why: WhyUnsupported } {
  if (!e.secure) return { ok: false, why: 'insecure' };
  if (!e.hasNotification || typeof e.permission !== 'string') {
    const p = platformOf(e);
    return { ok: false, why: p.ios && !p.standalone ? 'ios_tab' : 'no_api' };
  }
  return { ok: true };
}

export type AlertState = 'unsupported' | 'broken' | 'blocked' | 'ask' | 'off' | 'on';

export interface AlertStatus {
  state: AlertState;
  why: WhyUnsupported | 'ctor' | '';
  /** The browser's own word: granted | denied | default, or 'unsupported'. */
  perm: string;
  platform: PlatformInfo;
}

/**
 * 'unsupported' (why), 'broken' (the browser refused to build an alert from a page), 'blocked' (permission
 * denied: only the browser's own site settings can undo it), 'ask' (not asked, or the prompt was dismissed
 * without an answer), 'off' (granted, switched off here), 'on'.
 */
export function alertStatus(e: BrowserEnv, stored: { alerts: string | null; broken: boolean }): AlertStatus {
  const platform = platformOf(e);
  const sup = supportOf(e);
  if (!sup.ok)
    return {
      state: 'unsupported',
      why: sup.why,
      perm: 'unsupported',
      platform,
    };
  const perm = e.permission === 'granted' || e.permission === 'denied' ? e.permission : 'default';
  if (stored.broken && perm !== 'denied') return { state: 'broken', why: 'ctor', perm, platform };
  if (perm === 'denied') return { state: 'blocked', why: '', perm, platform };
  if (perm === 'default') return { state: 'ask', why: '', perm, platform };
  return {
    state: stored.alerts === 'on' ? 'on' : 'off',
    why: '',
    perm,
    platform,
  };
}

/** Which "how to re-enable" help opens first. */
export function firstHelp(p: PlatformInfo): 'ios' | 'android' | 'chrome' | 'firefox' | 'safari' {
  if (p.ios) return 'ios';
  if (p.android) return 'android';
  if (p.browser === 'edge' || p.browser === 'other') return 'chrome';
  return p.browser;
}

// ── text safety for a native alert ─────────────────────────────────────────

export const TITLE_MAX = 90;
export const BODY_MAX = 200;

/**
 * An alert is plain text in every browser, but admin text is stored verbatim: strip controls and the bidi
 * overrides that make a title read backwards, collapse spaces, cut on a code-point boundary.
 */
export function cleanAlertText(text: string, max: number): string {
  const s = text
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩﻿]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length <= max) return s;
  let cut = s.slice(0, max - 1);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return `${cut}…`;
}

// ── discovery hints ────────────────────────────────────────────────────────

/**
 * `account: true` kinds are backed by a notice the platform really writes (so the hint may say "you will get a
 * notice"); `account: false` kinds are local to the open tab: only a browser alert can raise them.
 */
export const HINT_KINDS = {
  inbox: { account: true, section: 'browser' },
  bell: { account: true, section: 'browser' },
  computer: { account: true, section: 'browser' },
  purchase: { account: true, section: 'browser' },
  rental: { account: true, section: 'browser' },
  bot: { account: false, section: 'browser' },
  script: { account: false, section: 'browser' },
  schedule: { account: false, section: 'browser' },
} as const;

export type HintKind = keyof typeof HINT_KINDS;
export const SECTIONS = ['kinds', 'where', 'browser', 'phone'] as const;
export type SectionId = (typeof SECTIONS)[number];

export function isHintKind(v: string): v is HintKind {
  return Object.hasOwn(HINT_KINDS, v);
}

export function isSectionId(v: string | undefined): v is SectionId {
  return v !== undefined && (SECTIONS as readonly string[]).includes(v);
}

/**
 * Whether the hint for `kind` should draw now: known, not dismissed, and there is something to offer. Alerts
 * already on means the person has what the hint sells. A browser that cannot alert still gets the account-notice
 * kinds (the bell is real); the local kinds need alerts and stay away.
 */
export function hintWanted(kind: string, dismissed: readonly string[], state: AlertState): boolean {
  if (!isHintKind(kind) || dismissed.includes(kind)) return false;
  if (state === 'on') return false;
  if ((state === 'unsupported' || state === 'broken') && !HINT_KINDS[kind].account) return false;
  return true;
}

/** An unsupported or broken browser is pointed at "where you see them", not at turning alerts on. */
export function hintSection(kind: HintKind, state: AlertState): SectionId {
  return state === 'unsupported' || state === 'broken' ? 'where' : HINT_KINDS[kind].section;
}

// ── the alert engine's decisions ───────────────────────────────────────────

/** The newest notice the engine has handled; id '' is an inbox that was empty. */
export interface Seen {
  id: string;
  at: string;
}

export const MAX_SINGLE_ALERTS = 3;
export const SHOWN_RING = 50;

/**
 * The notices that are new: unread, newer than the baseline, and never alerted before (any tab: the `shown`
 * ring). Oldest first, so alerts come in the order things happened.
 */
export function freshNotices<N extends AlertNotice>(rows: readonly N[], seen: Seen, shown: readonly string[]): N[] {
  const floor = seen.at ? Date.parse(seen.at) : Number.NaN;
  const older = (n: N) => {
    const t = n.at ? Date.parse(n.at) : Number.NaN;
    return n.id === seen.id || (Number.isFinite(floor) && Number.isFinite(t) && t <= floor);
  };
  return rows.filter((n) => !n.read && !older(n) && !shown.includes(n.id)).reverse();
}

export type AlertPlan<N extends AlertNotice = NotificationRow> = { kind: 'single'; notice: N }[] | { kind: 'many'; n: number; more: boolean; tagId: string };

/** Up to three notices alert one by one (oldest first); more become one "N new notices" alert. */
export function planAlerts<N extends AlertNotice>(fresh: readonly N[], more: boolean): AlertPlan<N> | null {
  if (fresh.length === 0) return null;
  if (fresh.length > MAX_SINGLE_ALERTS || more)
    return {
      kind: 'many',
      n: fresh.length,
      more,
      tagId: fresh[fresh.length - 1]?.id ?? '',
    };
  return fresh.map((notice) => ({ kind: 'single' as const, notice }));
}

/** The ring of alerted ids keeps the newest SHOWN_RING. */
export function addShown(shown: readonly string[], ids: readonly string[]): string[] {
  const out = [...shown];
  for (const id of ids) if (!out.includes(id)) out.push(id);
  return out.slice(-SHOWN_RING);
}

// ── the browser half ───────────────────────────────────────────────────────

const PREFIX = 'hub_notify:';
const UID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const CTOR = `${PREFIX}browser:ctor`;

// ── per-account choices ────────────────────────────────────────────────────
// Two families, because sign-out treats them differently: this browser's choices (alerts, hints, ctor) are kept;
// what names the account's notices (seen, shown) is removed at sign-out by core.

// Each key goes through core's localSetting (registered keys, page-only value when the browser refuses to store).
// The account is the caller's `uid`, written into the key, not core's shown account: the shell's alert runner
// names the account whose notices it judges.
const settings = new Map<string, LocalSetting>();
function setting(k: string, keep: boolean): LocalSetting {
  let s = settings.get(k);
  if (!s) {
    s = localSetting(k, { keepAtSignOut: keep });
    settings.set(k, s);
  }
  return s;
}

function okUid(uid: string): boolean {
  return UID_RE.test(uid);
}
function choice(uid: string, name: 'alerts' | 'hints' | 'seen' | 'shown'): LocalSetting {
  return name === 'seen' || name === 'shown' ? setting(`hub_notify_${name}:${uid}`, false) : setting(`${PREFIX}${uid}:${name}`, true);
}

export function getChoice(uid: string, name: 'alerts' | 'hints' | 'seen' | 'shown'): string | null {
  return okUid(uid) ? choice(uid, name).get() : null;
}

/** True when stored for later visits; false when it lives for this page only. */
export function setChoice(uid: string, name: 'alerts' | 'hints' | 'seen' | 'shown', value: string): boolean {
  return okUid(uid) ? choice(uid, name).set(value) : false;
}

export function readList(uid: string, name: 'hints' | 'shown'): string[] {
  try {
    const p: unknown = JSON.parse(getChoice(uid, name) ?? '[]');
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function isBroken(): boolean {
  return setting(CTOR, true).get() === '1';
}
export function flagBroken(): void {
  setting(CTOR, true).set('1');
}
export function clearBroken(): void {
  setting(CTOR, true).set(null);
}

// ── turning alerts on and off ──────────────────────────────────────────────

export interface EnableResult {
  state: AlertStatus['state'];
  /** The choice was stored for later visits (false: this page only). */
  remembered: boolean;
  /** The browser's own word: granted | denied | default (dismissed, or no answer: nothing was decided). */
  answer: string;
}

/** Alerts off for this account in this browser. The permission itself stays (a page cannot revoke it). */
export function disableAlerts(uid: string): { remembered: boolean } {
  const remembered = setChoice(uid, 'alerts', 'off');
  setChoice(uid, 'seen', '');
  return { remembered };
}

// ── one native alert ───────────────────────────────────────────────────────

export interface AlertInfo {
  title: string;
  body: string;
  /** What the alert says instead while a passcode is set: a count and a fixed line, never the notice's own words. */
  generic?: { title: string; body: string };
  tag?: string;
  onClick?: () => void;
}

/** The generic text when a caller gave none (a test alert, a hint alert): the one-notice wording, the same words as
 *  the shell's alert.untitled / alert.body (a conformance test keeps them equal). */
export const GENERIC_ALERT = { title: 'New notice', body: 'Open the Hub to read it.' } as const;

export type ShowResult = { ok: true; via: 'page' | 'worker' } | { ok: false; reason: 'denied' | 'unsupported' | 'ctor' };
