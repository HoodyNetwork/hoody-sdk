// Pure functions of the account page (no React, no I/O).
import type { Session, TwoFactor } from './data';

// ── password ────────────────────────────────────────────────────────────────

/** The four classes as the server counts them. Its symbols are this list only: a space, an accented letter or an
 *  emoji is none of the four (core's passwordFitsRule holds the same list for sign-up: change both together). */
const PASSWORD_CLASSES = [/[a-z]/, /[A-Z]/, /[0-9]/, /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/] as const;

/** How many of the four classes a password uses, counted as the server counts them. */
export function passwordClasses(pw: string): number {
  return PASSWORD_CLASSES.filter((re) => re.test(pw)).length;
}

/** The server rule mirrored for instant feedback: at least 12 characters, 3 of 4 classes. */
export function isWeakPassword(pw: string): boolean {
  return pw.length < 12 || passwordClasses(pw) < 3;
}

/** The server's upper bound: at most 72 UTF-8 bytes. Its schema's 128
 *  characters can never be the tighter limit (a character is at least one byte). */
export const PASSWORD_MAX_BYTES = 72;
export function isLongPassword(pw: string): boolean {
  return new TextEncoder().encode(pw).length > PASSWORD_MAX_BYTES;
}

export type PasswordProblem = 'required' | 'weak' | 'long' | 'same' | 'mismatch';

export interface PasswordErrors {
  current?: PasswordProblem;
  password?: PasswordProblem;
  again?: PasswordProblem;
}

/** Field errors for the change-password form, or null when it may be sent. */
export function passwordErrors(current: string, next: string, again: string): PasswordErrors | null {
  const e: PasswordErrors = {};
  if (!current) e.current = 'required';
  if (isWeakPassword(next)) e.password = 'weak';
  else if (isLongPassword(next)) e.password = 'long';
  else if (next === current) e.password = 'same';
  if (next !== again) e.again = 'mismatch';
  return Object.keys(e).length ? e : null;
}

export interface PasswordChecks {
  length: boolean;
  classes: boolean;
  differs: boolean;
  matches: boolean;
}

/** The live rules checklist of the password drawer. */
export function passwordChecks(current: string, next: string, again: string): PasswordChecks {
  return {
    length: next.length >= 12,
    classes: passwordClasses(next) >= 3,
    differs: next.length > 0 && next !== current,
    matches: next.length > 0 && next === again,
  };
}

// ── two-step codes ──────────────────────────────────────────────────────────

/** An authenticator code: exactly six digits. */
export function isAppCode(v: string): boolean {
  return /^\d{6}$/.test(cleanCode(v));
}

/** A code as it is sent: without the spaces and hyphens people type or paste between its groups. An app code is
 *  six digits and a backup code is letters and digits only, so neither loses anything of its own. */
export function cleanCode(v: string): string {
  return v.replace(/[\s-]/g, '');
}

/** Why the set-up's Turn on is off, in the order the person meets it: the backup codes are not ticked as saved, then
 *  the code is not six digits long yet. Null when it can be pressed. */
export function setupGate(saved: boolean, code: string): 'saved' | 'code' | null {
  if (!saved) return 'saved';
  return code.length < 6 ? 'code' : null;
}

/** Where a backup code is also accepted (turn off), anything non-empty goes; the server judges it. */
export function isCodeOrBackup(v: string): boolean {
  return cleanCode(v).length > 0;
}

// ── agent sign-in lifetime ──────────────────────────────────────────────────

export const DEFAULT_AGENT_DAYS = 90;

/** A whole number of days, 1 to 365: digits only ("1.5", "30days", "1e2" are not days). */
export function parseDays(v: string | number | null | undefined): number | null {
  const text = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : (v ?? '').trim();
  if (!/^[0-9]{1,3}$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 && n <= 365 ? n : null;
}

// ── sessions ────────────────────────────────────────────────────────────────

/** Scripts where ZWNJ and ZWJ change how letters join (Arabic and its relatives, the Indic scripts). By Script_Extensions,
 *  so the marks and signs these scripts share count as theirs: the Arabic vowel marks (U+064B-0655, Script=Inherited)
 *  and the tatweel (U+0640, Script=Common) are Arabic too. */
const SHAPES =
  /[\p{Script_Extensions=Arabic}\p{Script_Extensions=Syriac}\p{Script_Extensions=Nko}\p{Script_Extensions=Mongolian}\p{Script_Extensions=Devanagari}\p{Script_Extensions=Bengali}\p{Script_Extensions=Gurmukhi}\p{Script_Extensions=Gujarati}\p{Script_Extensions=Oriya}\p{Script_Extensions=Tamil}\p{Script_Extensions=Telugu}\p{Script_Extensions=Kannada}\p{Script_Extensions=Malayalam}\p{Script_Extensions=Sinhala}]/u;
/** The same scripts by plain Script: one neighbour of a kept joiner must be one of their own characters, not only a mark
 *  they share with others (U+0303/0308 and other combining marks carry Syriac in Script_Extensions, U+02BC Devanagari,
 *  the Vedic marks several Indic scripts), so a joiner between two shared marks in Latin, CJK or Cyrillic text is still
 *  removed. */
const OWN =
  /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Mongolian}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}]/u;
/** A letter or a mark (not a digit or a sign of the same script, where a joiner shapes nothing). */
const LETTER = /[\p{L}\p{M}]/u;
/** What an emoji ZWJ sequence joins: before the joiner an emoji shown as one (not a text sign like ©), or a skin tone or
 *  the emoji presentation selector on a pictograph (❤️‍🔥, 🏃🏽‍♀️); after it a pictograph (👨‍⚕️ joins U+2695). */
const EMOJI_SHOWN = /\p{Emoji_Presentation}/u;
const EMOJI_TAIL = /[\p{Emoji_Modifier}\uFE0F]/u;
const PICTOGRAPH = /\p{Extended_Pictographic}/u;
function emojiBefore(s: string, i: number): boolean {
  const a = charBefore(s, i);
  // A selector or skin tone counts only on a pictograph (a standalone skin tone is itself "shown as emoji").
  if (EMOJI_TAIL.test(a)) return PICTOGRAPH.test(charBefore(s, i - a.length));
  return EMOJI_SHOWN.test(a);
}
const isHigh = (u: number) => u >= 0xd800 && u <= 0xdbff;
const isLow = (u: number) => u >= 0xdc00 && u <= 0xdfff;
/** The whole character that ends just before index i, and the one that starts at i (a surrogate pair read as one
 *  character); '' at an edge. */
function charBefore(s: string, i: number): string {
  if (i <= 0) return '';
  const start = i >= 2 && isLow(s.charCodeAt(i - 1)) && isHigh(s.charCodeAt(i - 2)) ? i - 2 : i - 1;
  return String.fromCodePoint(s.codePointAt(start)!);
}
function charAt(s: string, i: number): string {
  return i < s.length ? String.fromCodePoint(s.codePointAt(i)!) : '';
}
/** A joiner stays only where it shapes text: ZWNJ between two letters of a joining script (a Persian word), ZWJ there
 *  or inside an emoji sequence (a family emoji). Next to anything else (Latin "é\u200dé" looks like "éé") it only hides
 *  a difference, so it goes like the other invisibles. */
function joinerShapes(s: string, i: number): boolean {
  const a = charBefore(s, i);
  const b = charAt(s, i + 1);
  if (SHAPES.test(a) && LETTER.test(a) && SHAPES.test(b) && LETTER.test(b) && (OWN.test(a) || OWN.test(b))) return true;
  return s[i] === '\u200d' && emojiBefore(s, i) && PICTOGRAPH.test(b);
}

/** Untrusted labels (a device name, a user agent): controls, bidi marks and zero-width characters removed (a joiner
 * kept only where it shapes text), cut at n without splitting a character or ending on a joiner. */
export function cleanLabel(s: string | null | undefined, n: number): string {
  const raw = String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069]/g, ' ');
  const v = raw
    .replace(/[\u200c\u200d]/g, (c, i: number) => (joinerShapes(raw, i) ? c : ' '))
    .replace(/\s+/g, ' ')
    .trim();
  if (v.length <= n) return v;
  let end = n - 1;
  while (end > 0 && (isHigh(v.charCodeAt(end - 1)) || v[end - 1] === '\u200c' || v[end - 1] === '\u200d')) end--;
  return `${v.slice(0, end)}…`;
}

/** How a session signed in, as the server records it. "unknown" (its default), empty or any other text: not known. */
export const DEVICE_CHANNELS = ['web', 'ssh', 'webssh', 'cli', 'sdk', 'agent', 'admin'] as const;
export type DeviceChannel = (typeof DEVICE_CHANNELS)[number];

export function knownChannel(c: string | null | undefined): DeviceChannel | null {
  return (DEVICE_CHANNELS as readonly string[]).includes(c ?? '') ? (c as DeviceChannel) : null;
}

/** A channel in a person's words: ssh and webssh are both "SSH". */
const channelWord = (c: DeviceChannel, t: DeviceWords): string => t(`s.ch.${c === 'webssh' ? 'ssh' : c}` as const);

/** Security history's "Through": the channel in the sessions table's words; null when the channel is not known. */
export function historyChannel(c: string | null | undefined, t: DeviceWords): string | null {
  const ch = knownChannel(c?.trim());
  return ch ? channelWord(ch, t) : null;
}

/** What a user agent says, read by deviceOf. Browser and system names are product names, never translated. */
export type AgentGuess =
  | { kind: 'browser'; browser: string | null; os: string | null }
  | { kind: 'script'; tool: string }
  | { kind: 'channel'; channel: DeviceChannel }
  | { kind: 'other'; text: string };

const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\/|\bOpera\b/, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bVivaldi\//, 'Vivaldi'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\bHeadlessChrome\//, 'Headless Chrome'],
  [/\bChromium\//, 'Chromium'],
  [/\b(?:Chrome|CriOS)\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
];

const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bWindows\b/, 'Windows'],
  [/\bMacintosh\b|\bMac OS X\b/, 'macOS'],
  [/\bLinux\b|\bX11\b/, 'Linux'],
];

/** Programs that are not browsers, by the first word of their user agent. Hoody's own clients name their channel. */
const TOOLS: readonly (readonly [RegExp, string | { channel: DeviceChannel }])[] = [
  [/^hoody-cli\b/i, { channel: 'cli' }],
  [/^hoody-sdk\b/i, { channel: 'sdk' }],
  [/^hoody-agent\b/i, { channel: 'agent' }],
  [/^(?:node|undici|node-fetch|axios|got)\b/i, 'Node.js'],
  [/^bun\b/i, 'Bun'],
  [/^deno\b/i, 'Deno'],
  [/^curl\b/i, 'curl'],
  [/^wget\b/i, 'Wget'],
  [/^(?:python|aiohttp|httpx)\b/i, 'Python'],
  [/^go-http-client\b/i, 'Go'],
  [/^(?:okhttp|java)\b/i, 'Java'],
  [/^(?:ruby|faraday)\b/i, 'Ruby'],
  [/^postmanruntime\b/i, 'Postman'],
];

/** Text a client sends when it has no name ("unknown" is also the server's own default for the channel). */
const PLACEHOLDER = /^(?:unknown|null|undefined|none|n\/a|-+)$/i;

const pick = (ua: string, table: readonly (readonly [RegExp, string])[]): string | null =>
  table.find(([re]) => re.test(ua))?.[1] ?? null;

/** Read a user agent: a browser and its system, a known program, else its first word. Null when it says nothing. */
export function guessAgent(userAgent: string | null | undefined): AgentGuess | null {
  const ua = cleanLabel(userAgent, 512);
  if (!ua) return null;
  if (!/^Mozilla\//.test(ua)) {
    const tool = TOOLS.find(([re]) => re.test(ua))?.[1];
    if (typeof tool === 'string') return { kind: 'script', tool };
    if (tool) return { kind: 'channel', channel: tool.channel };
  }
  const browser = pick(ua, BROWSERS);
  const os = pick(ua, SYSTEMS);
  // A system alone makes a browser only in a browser's agent: "MyTool/1.2 (Linux)" or Dalvik on Android is a program.
  if (browser || (os && /^Mozilla\//.test(ua))) return { kind: 'browser', browser, os };
  const word = cleanLabel(ua.split(/[\s/;(]/)[0], 40);
  // A word that is a placeholder, a channel, one letter ("n/a" reads "n") or the bare browser prefix names nothing.
  return word.length > 1 && !PLACEHOLDER.test(word) && !knownChannel(word.toLowerCase()) && !/^Mozilla$/i.test(word) ? { kind: 'other', text: word } : null;
}

/** The words a device label is built from (a subset of the page's strings, so a test can pass makeT(strings)). */
export type DeviceWords = (
  key: 's.dev.on' | 's.dev.browserOn' | 's.dev.script' | `s.ch.${Exclude<DeviceChannel, 'webssh'>}` | 's.unknownDevice',
  vars?: Readonly<Record<string, string | number>>,
) => string;

export interface DeviceLabel {
  /** The main name: the client's own name, else what its user agent says, else how it signed in. Never empty. */
  name: string;
  /** How it signed in, when the name does not already say so (a client name, a script, a CLI user agent). */
  tag: string | null;
}

/** The one way a session's device is named (table cell, End action, the end confirmation). Untrusted text is cleaned. */
export function deviceLabel(s: Pick<Session, 'client' | 'clientName' | 'userAgent'>, t: DeviceWords): DeviceLabel {
  const channel = knownChannel(s.client?.trim());
  const word = (c: DeviceChannel) => channelWord(c, t);
  const tagUnless = (implied: DeviceChannel | null): string | null => (channel && channel !== implied ? word(channel) : null);
  const label = deviceLabelOf(s, t, channel, word, tagUnless);
  // A name that already says the channel as a whole word ("CLI on build-server", "OpenSSH_9.9") needs no tag repeating it;
  // a word inside another ("BrowserStack") does not say it.
  const lower = label.name.toLowerCase();
  const says = channel !== null && CHANNEL_WORDS[channel].some((w) => new RegExp(`(?:^|[^a-z0-9])${w}(?:$|[^a-z0-9])`).test(lower));
  return label.tag && says ? { name: label.name, tag: null } : label;
}

/** The words that name each channel inside a device name (fixed English product words, matched whole). */
const CHANNEL_WORDS: Record<DeviceChannel, readonly string[]> = {
  web: ['browser'],
  ssh: ['ssh', 'openssh'],
  webssh: ['ssh', 'openssh'],
  cli: ['cli'],
  sdk: ['sdk'],
  agent: ['agent'],
  admin: ['admin'],
};

function deviceLabelOf(
  s: Pick<Session, 'clientName' | 'userAgent'>,
  t: DeviceWords,
  channel: DeviceChannel | null,
  word: (c: DeviceChannel) => string,
  tagUnless: (implied: DeviceChannel | null) => string | null,
): DeviceLabel {
  const named = cleanLabel(s.clientName, 80);
  if (named && !PLACEHOLDER.test(named)) return { name: named, tag: tagUnless(null) };
  const g = guessAgent(s.userAgent);
  if (g?.kind === 'browser') {
    const name =
      g.browser && g.os ? t('s.dev.on', { browser: g.browser, os: g.os }) : g.browser ?? t('s.dev.browserOn', { os: g.os ?? '' });
    return { name, tag: tagUnless('web') };
  }
  if (g?.kind === 'script') return { name: t('s.dev.script', { tool: g.tool }), tag: tagUnless(null) };
  if (g?.kind === 'channel') return { name: word(g.channel), tag: tagUnless(g.channel) };
  if (g?.kind === 'other') return { name: g.text, tag: tagUnless(null) };
  return { name: channel ? word(channel) : t('s.unknownDevice'), tag: null };
}

export interface SessionRow {
  session: Session;
  /** The device's name (deviceLabel). */
  device: string;
  /** How it signed in, when the name does not say (deviceLabel). */
  tag: string | null;
  /** Last seen (active) or the time it ended (ended). */
  when: string | null;
  /** The End verb applies: active and not this browser. */
  canEnd: boolean;
}

export function sessionRows(sessions: readonly Session[], t: DeviceWords): SessionRow[] {
  return sessions.map((s) => {
    const d = deviceLabel(s, t);
    return {
      session: s,
      device: d.name,
      tag: d.tag,
      when: s.active ? s.lastSeenAt || s.createdAt : s.endedAt || s.lastSeenAt || s.createdAt,
      canEnd: s.active && !s.current,
    };
  });
}

export function otherActiveCount(sessions: readonly Session[]): number {
  return sessions.filter((s) => s.active && !s.current).length;
}

/** The server's rows may carry any text; only known methods and end reasons get words. */
export const KNOWN_METHODS = ['password', 'two_factor', 'github', 'google', 'device', 'signup'] as const;
export const KNOWN_END_REASONS = [
  'user_revoked',
  'others_revoked',
  'copied_sign_in',
  'session_cap',
  'expired',
  'signed_out_everywhere',
  'password_changed',
  'password_reset',
  'two_factor_changed',
  'account_changed',
] as const;

export function knownMethod(m: string): (typeof KNOWN_METHODS)[number] | null {
  return (KNOWN_METHODS as readonly string[]).includes(m) ? (m as (typeof KNOWN_METHODS)[number]) : null;
}

export function knownEndReason(r: string | null): (typeof KNOWN_END_REASONS)[number] | null {
  return r !== null && (KNOWN_END_REASONS as readonly string[]).includes(r) ? (r as (typeof KNOWN_END_REASONS)[number]) : null;
}

// ── errors ──────────────────────────────────────────────────────────────────

export type ErrorKey = 'err.generic' | 'err.password' | 'err.code' | 'err.tooMany' | 'err.changed' | 'err.framed' | 'err.readFirst';

/** The longest wait said in minutes; a longer one reads "Try again later" (nobody counts 1440 minutes). */
const WAIT_MINUTES_MAX = 120;

/** Whether a refusal named a wait at all. */
function waitNamed(seconds: number | undefined): seconds is number {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0;
}

/** A refusal's wait in whole minutes, rounded up; null when the answer named none or one too long to count in minutes. */
export function waitMinutes(seconds: number | undefined): number | null {
  if (!waitNamed(seconds)) return null;
  const minutes = Math.ceil(seconds / 60);
  return minutes <= WAIT_MINUTES_MAX ? minutes : null;
}

/** Too many tries → its sentence: the wait in minutes when the answer named one that can be counted, else the one
 *  sentence that promises no time (no wait named, or one beyond two hours). */
export function limitWords(e: { status?: number; code?: string; retryAfter?: number } | undefined): { key: 'err.tooMany' } | { key: 'err.tooManyWait'; vars: { count: number } } {
  const count = waitMinutes(e?.retryAfter);
  return count === null ? { key: 'err.tooMany' } : { key: 'err.tooManyWait', vars: { count } };
}

/** A refused change → its sentence and what fills it: too many tries says the wait when the answer named one
 *  (a lockout can last 15 minutes), and promises no time when it did not. */
export function errorWords(
  e: { status?: number; code?: string; retryAfter?: number } | undefined,
  asked: 'password' | 'code' | 'none',
): { key: ErrorKey } | { key: 'err.tooManyWait'; vars: { count: number } } {
  const key = errorKey(e, asked);
  return key === 'err.tooMany' ? limitWords(e) : { key };
}

/** A definite 400 that names no refusal of its own: no code, or only the status line's words. */
export function plainBadRequest(r: { outcome?: string; status?: number; code?: string }): boolean {
  return r.outcome === 'failed' && r.status === 400 && (r.code === undefined || r.code === 'Bad Request');
}

/** The set-up's first step asks the account password; the server takes 8 to 128 characters as one (counted as it
 *  counts them: an emoji is one). Anything else it refuses unread, so it can only be a wrong password. */
export function possiblePassword(v: string): boolean {
  const n = [...v].length;
  return n >= 8 && n <= 128;
}

/**
 * Whether a refused password change can only be the server's password rule. The change's 400s without a code are: a
 * new password its rule refuses, a field outside its length bounds, and (an API that does not report `has_password`)
 * an account with no password. So the plain 400 is the rule only when the profile said the account has a password
 * (that API gives the no-password refusal its own code) and both fields were within the bounds the request check
 * takes: the current password 8 to 128 characters, the new one 12 or more. Anything else stays the general sentence.
 */
export function weakPasswordRefusal(
  r: { outcome?: string; status?: number; code?: string },
  sent: { current: string; next: string; hasPassword: boolean | undefined },
): boolean {
  return plainBadRequest(r) && sent.hasPassword === true && possiblePassword(sent.current) && [...sent.next].length >= 12;
}

/** An address as a sentence names it when the whole one is already on the page: its first character and its domain. */
export function maskEmail(email: string): string {
  const v = email.trim();
  const at = v.lastIndexOf('@');
  if (at < 1) return '';
  return `${[...v][0]}•••${v.slice(at)}`;
}

/** What asking Hoody for a mail came to (data.ts useAccountMail), as the row says it. `sent` and `unsure` are said in
 *  the row's own value; a refusal is the row's outcome line. */
export function mailRefusalWords(
  ask: { state: string; retryAfter?: number } | undefined,
): { key: 'err.tooMany' | 'err.generic' | 'err.framed' | 'err.readOnly' } | { key: 'err.tooManyWait'; vars: { count: number } } | null {
  if (!ask) return null;
  if (ask.state === 'wait') return limitWords(ask);
  if (ask.state === 'framed') return { key: 'err.framed' };
  if (ask.state === 'readonly') return { key: 'err.readOnly' };
  return ask.state === 'failed' ? { key: 'err.generic' } : null;
}

/** A refused change → the fixed sentence for it. `asked` names what a bare 401 refused. */
export function errorKey(e: { status?: number; code?: string } | undefined, asked: 'password' | 'code' | 'none'): ErrorKey {
  if (!e) return 'err.generic';
  if (e.code === 'READ_BACK_FIRST') return 'err.readFirst';
  if (e.status === 429 || e.code === 'RATE_LIMITED') return 'err.tooMany';
  if (e.code === 'INVALID_OTP_CODE') return 'err.code';
  if (e.code === 'CURRENT_PASSWORD_INCORRECT') return 'err.password';
  if (e.code === 'FRAMED' || e.code === 'FRAMED_ACTION_REFUSED') return 'err.framed';
  // A 401 blames what was typed; a confirmation with nothing typed has nothing to blame.
  if (e.status === 401) return asked === 'none' ? 'err.generic' : asked === 'code' ? 'err.code' : 'err.password';
  if (e.status === 409) return 'err.changed';
  return 'err.generic';
}

/** A change's refusal as errorKey reads it: its code and status, whichever the answer gave. */
export function refusal(r: { code?: string; status?: number; retryAfter?: number }): { code?: string; status?: number; retryAfter?: number } | undefined {
  if (r.code === undefined && r.status === undefined) return undefined;
  return { ...(r.code !== undefined && { code: r.code }), ...(r.status !== undefined && { status: r.status }), ...(r.retryAfter !== undefined && { retryAfter: r.retryAfter }) };
}

/** The 2FA setup QR is shown as an image: only a base64 png or svg data URL is ever used as its src. */
export function isQrImage(src: string): boolean {
  return /^data:image\/(png|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(src);
}

// ── the lock on a 2FA change whose outcome is unknown (C9) ──────────────────

export type OpState = 'sent' | 'pending';

/**
 * A 2FA change (setup, new codes, turn off) is locked from the moment it is sent. A sure answer lifts the
 * lock; one the Hub could not confirm keeps it as `pending` until the status is read back: nothing is sent
 * blind (a second setup or new codes would replace secrets nobody saw).
 */
export class OpLocks {
  private readonly rows = new Map<string, OpState>();
  private readonly listeners = new Set<() => void>();
  private snap: ReadonlyMap<string, OpState> = new Map();
  // Ops whose last send may have applied and has had no sure answer since (a read-back cannot prove a repeat is safe).
  private readonly maybe = new Set<string>();
  private maybeSnap: ReadonlySet<string> = new Set();

  private emit(): void {
    this.snap = new Map(this.rows);
    this.maybeSnap = new Set(this.maybe);
    for (const l of [...this.listeners]) l();
  }
  get(op: string): OpState | undefined {
    return this.rows.get(op);
  }
  // Bumped by clear(): a send that began before an account or realm switch cannot settle a lock of the next one.
  private epoch = 0;
  /** Locks the op as sent; returns the epoch to pass to settle(). */
  sent(op: string): number {
    this.rows.set(op, 'sent');
    this.versions.set(op, this.version(op) + 1);
    this.emit();
    return this.epoch;
  }
  // Counts the sends of each op: a release carries the version it read, so it cannot free a newer send's lock.
  private readonly versions = new Map<string, number>();
  version(op: string): number {
    return this.versions.get(op) ?? 0;
  }
  /** Frees the op if it is still waiting on a read-back and no newer send happened since `version` was read. */
  release(op: string, version: number): boolean {
    if (this.rows.get(op) !== 'pending' || this.version(op) !== version) return false;
    this.rows.delete(op);
    this.emit();
    return true;
  }
  settle(op: string, pending: boolean, epoch?: number): void {
    if (epoch !== undefined && epoch !== this.epoch) return;
    if (pending) this.rows.set(op, 'pending');
    else this.rows.delete(op);
    this.emit();
  }
  /** True when any of the named ops is waiting on a read-back. */
  anyPending(ops: readonly string[]): boolean {
    return ops.some((o) => this.rows.get(o) === 'pending');
  }
  /** The op's last send may have applied; it stays so until a sure answer (done or refused) or a context change. */
  markMaybe(op: string): void {
    this.maybe.add(op);
    this.emit();
  }
  clearMaybe(op: string): void {
    this.maybe.delete(op);
    this.emit();
  }
  maybeSnapshot = (): ReadonlySet<string> => this.maybeSnap;
  clear(): void {
    this.epoch++;
    this.rows.clear();
    this.maybe.clear();
    this.emit();
  }
  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  snapshot = (): ReadonlyMap<string, OpState> => this.snap;
}

export type SheetName = 'password' | 'setup' | 'codes' | 'off' | 'gate-off' | 'name' | 'wipe' | 'email';
const SHEET_NAMES: readonly SheetName[] = ['password', 'setup', 'codes', 'off', 'gate-off', 'name', 'wipe', 'email'];

/** What the two-step status read says, for opening Set up: 'off' (off, or a set-up started and never confirmed),
 *  'on', or 'unknown' (not answered yet, failed, or an answer missing a field: the read says null). */
export type TwoStepRead = 'off' | 'on' | 'unknown';

export function twoStepRead(r: { isError: boolean; data?: TwoFactor | null }): TwoStepRead {
  if (r.isError || !r.data) return 'unknown';
  return r.data.enabled ? 'on' : 'off';
}

/**
 * The sheet a `?sheet=` link may open. A suspended account has no change sheets. Set up opens only while two-step
 * sign-in was read back off (or its set-up unfinished): with it on the server refuses a new set-up, and an unknown
 * status opens nothing either. `setupOpen`: Set up is the sheet open now under this link; it stays open whatever the
 * status says since (its own Turn on, Check again or another window turning two-step on never takes the drawer away).
 * Every other sheet opens whatever the status, so a way to turn two-step off is never withheld for an unknown one.
 */
export function openableSheet(
  name: string | undefined,
  o: { suspended: boolean; twoStep: TwoStepRead; setupOpen?: boolean },
): SheetName | undefined {
  const sheet = SHEET_NAMES.find((x) => x === name);
  if (!sheet || o.suspended) return undefined;
  if (sheet === 'setup' && o.twoStep !== 'off' && !o.setupOpen) return undefined;
  return sheet;
}

/** The passcode lock's sheets. */
export type LockSheetMode = 'lock-set' | 'lock-change' | 'lock-remove';
const LOCK_SHEETS: readonly LockSheetMode[] = ['lock-set', 'lock-change', 'lock-remove'];

/**
 * The passcode sheet a `?sheet=` link may open: none for a suspended account or a token session (no passcode there),
 * Set only while this browser holds no record and can hold one, Change and Remove only while the record is valid (an
 * unreadable one is removed only by Forget this browser, on the lock screen).
 */
export function openableLockSheet(
  name: string | undefined,
  o: { suspended: boolean; token: boolean; record: 'none' | 'malformed' | 'valid'; supported: boolean },
): LockSheetMode | undefined {
  const sheet = LOCK_SHEETS.find((x) => x === name);
  if (!sheet || o.suspended || o.token) return undefined;
  if (sheet === 'lock-set') return o.record === 'none' && o.supported ? sheet : undefined;
  return o.record === 'valid' ? sheet : undefined;
}

/**
 * The session the end dialog is about. Only another active session can be ended from a link: never this one, never
 * an id that is not listed. `picked` is the row the person pressed End on (it may come from a page loaded with
 * "Show older sessions"); the first page covers a link opened cold.
 */
export function endTargetOf(id: string | undefined, picked: Session | null, firstPage: readonly Session[] | undefined): Session | 'others' | undefined {
  if (!id) return undefined;
  if (id === 'others') return 'others';
  const row = picked?.id === id ? picked : firstPage?.find((x) => x.id === id);
  return row && row.active && !row.current ? row : undefined;
}

// ── display name and security history ───────────────────────────────────────

/** The longest display name the server takes. */
export const NAME_MAX = 100;

/**
 * Whether a refused display-name change is about the name itself. The change sends the name alone, already trimmed and
 * within its length, so its only 400s without a code are the server's two name refusals: a name with direction or
 * control characters, and a name that reads as an official Hoody identity. The codes are named for an API that sends
 * one (RESERVED_IDENTITY is the code its spec documents for the reserved name).
 */
const NAME_CODES: readonly string[] = ['RESERVED_IDENTITY', 'ALIAS_RESERVED', 'ALIAS_INVALID_CHARS'];
export function nameRefusal(r: { outcome?: string; status?: number; code?: string }): boolean {
  return plainBadRequest(r) || (r.outcome === 'failed' && r.code !== undefined && NAME_CODES.includes(r.code));
}

/** What is wrong with a display name before it is sent (trimmed), or null. Unchanged counts: nothing to send. */
export function nameProblem(value: string, current: string): 'empty' | 'long' | 'same' | null {
  const v = value.trim();
  if (!v) return 'empty';
  if (v.length > NAME_MAX) return 'long';
  if (v === current.trim()) return 'same';
  return null;
}

// ── email change ────────────────────────────────────────────────────────────

/** One address, as the API's request check takes it (its schema's `format: 'email'`): ASCII name parts joined by single
 *  dots, a domain of letter-digit-hyphen labels with at least one dot, at most 254 characters. The looser shape used here
 *  before let through addresses the API refuses (a non-ASCII name, two dots in a row, an underscore in the domain), and
 *  the refusal came back as the general failure with nothing said at the field. */
const EMAIL_SHAPE = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

/** What is wrong with the new address before anything is sent, or null. Compared as the server stores addresses. */
export function emailProblem(value: string, current: string): 'empty' | 'invalid' | 'same' | null {
  const v = value.trim();
  if (!v) return 'empty';
  if (v.length > 254 || !EMAIL_SHAPE.test(v)) return 'invalid';
  if (v.toLowerCase() === current.trim().toLowerCase()) return 'same';
  return null;
}

export type EmailErrorKey = ErrorKey | 'e.same' | 'e.domain' | 'e.noPassword' | 'e.locked' | 'e.notAllowed' | 'e.verifyFirst' | 'e.codeNeeded';

/** A refused email change → its sentence; anything it does not name reads as the other changes do. */
export function emailErrorKey(e: { status?: number; code?: string } | undefined, verified?: boolean): EmailErrorKey {
  switch (e?.code) {
    case 'EMAIL_UNCHANGED': return 'e.same';
    case 'EMAIL_DOMAIN_NOT_ACCEPTED': return 'e.domain';
    case 'PASSWORD_NOT_SET': return 'e.noPassword';
    case 'EMAIL_CHANGE_LOCKED': return 'e.locked';
    // The server refuses the change for an address that is not verified yet, and for some accounts: only the
    // profile tells them apart, and only a profile that reads not verified names the first.
    case 'EMAIL_CHANGE_NOT_ALLOWED': return verified === false ? 'e.verifyFirst' : 'e.notAllowed';
    case 'OTP_REQUIRED': return 'e.codeNeeded';
    // The change asks the password; a wrong code is refused by name, so a bare 401 is the password.
    default: return errorKey(e, 'password');
  }
}

/** Every event the security history serves: the two sign-in events and the API's list of security events
 *  (history-events.test.ts fails when that list gains a name this one lacks). Each has its words in strings.en.json
 *  as `h.e.<event>`. */
export const KNOWN_EVENTS = [
  'login',
  'login_failed',
  'logout',
  'otp_setup_initiated',
  'otp_enabled',
  'otp_disabled',
  'otp_verify_success',
  'otp_verify_failed',
  'otp_backup_code_used',
  'otp_backup_codes_regenerated',
  'token_gate_enabled',
  'token_gate_disabled',
  'session_refreshed',
  'session_revoked',
  'password_reset',
  'password_changed',
  'auth_token_created',
  'auth_token_revoked',
  'oauth_linked',
  'email_change_requested',
  'email_change_cancelled',
  'email_changed',
  'email_change_reverted',
  'two_factor_undone',
] as const;

/** The page's own words for an event it knows, or null (the row then shows the event name as cleaned text). */
export function historyEventKey(event: string): `h.e.${(typeof KNOWN_EVENTS)[number]}` | null {
  return (KNOWN_EVENTS as readonly string[]).includes(event) ? (`h.e.${event}` as `h.e.${(typeof KNOWN_EVENTS)[number]}`) : null;
}

// ── computer SSH keys (read only) ───────────────────────────────────────────

const KEY_TYPES: Readonly<Record<string, string>> = {
  'ssh-ed25519': 'ED25519',
  'ssh-rsa': 'RSA',
  'ecdsa-sha2-nistp256': 'ECDSA',
  'ecdsa-sha2-nistp384': 'ECDSA',
  'ecdsa-sha2-nistp521': 'ECDSA',
  'sk-ssh-ed25519@openssh.com': 'ED25519-SK',
  'sk-ecdsa-sha2-nistp256@openssh.com': 'ECDSA-SK',
};
export interface KeySummary {
  /** The key type in capitals, or '' when the text is not a key this page knows. */
  type: string;
  /** The key's last 8 characters, enough to tell two keys apart; never the whole key. */
  tail: string;
  /** The comment after the key (often user@host), or ''. */
  comment: string;
}
/** A computer's key summed up for a list: null when the computer has none. */
export function keySummary(key: string | null | undefined): KeySummary | null {
  const text = typeof key === 'string' ? key.trim() : '';
  if (!text) return null;
  const [kind = '', body = '', ...rest] = text.split(/\s+/);
  const type = KEY_TYPES[kind];
  if (!type || !/^[A-Za-z0-9+/]+={0,3}$/.test(body)) return { type: '', tail: '', comment: '' };
  return { type, tail: body.replace(/=+$/, '').slice(-8), comment: rest.join(' ') };
}
