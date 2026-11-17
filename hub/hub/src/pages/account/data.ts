// The account page's data: its queries and mutations, declared in one place.
// Live it goes through core's coreSource (reads, changes, mintSecret, useLockedChange); under the fixture
// transport (hub:dev, hub:shots, tests) the page's own fixtures answer. Routes (base scope):
//   GET /users/auth/me                      GET /users/auth/2fa/status
//   PUT /users/{id}                         POST /users/auth/2fa/setup            (secret)
//   POST /users/auth/2fa/verify-setup       DELETE /users/auth/2fa
//   POST /users/auth/2fa/backup-codes/regenerate (secret)    PUT /users/auth/2fa/token-gate
//   GET /users/auth/sessions?state&limit&cursor              DELETE /users/auth/sessions/{id}
//   POST /users/auth/sessions/revoke-others
//   PUT /users/{id} {alias}                 GET /users/me/security-history?page&limit&include_failed&include_security
//   POST /users/me/email-change             DELETE /users/me/email-change
//   GET /ip (this browser's address as the Hoody API sees it)
//   PUT /users/{id} {support_reply_email}
// And, as nobody (core's pre-sign-in calls: no session is needed or sent in a browser), the two mails an account asks
// for its own address:   POST /auth/forgot-password   POST /auth/resend-verification
import { alive, api, capture, computerHandle, containersRoute, coreSource, defineRoute, fixtureModeActive, holdSecret, localSetting, localWipeWarning, keepsChanges, meRoute, mintSecret, noteShownAlias, myIpRoute, onBump, removeLocalData, requestPasswordReset, resendVerification, stringOrEmpty as str, turnOffRoute, useAttemptsVersion, useChangesVersion, useLockedChange, useSecret, verifySetupRoute, type HeldRow, type HeldSecret, type LocalWipe, type LocalWipeWarning, type AccountMailResult, type WipeCheck, pageFixtures } from '@core';
import { ipDetailsFrom, type IpDetails, type OutcomeKind } from '@kit';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DEFAULT_AGENT_DAYS, cleanCode, isQrImage, parseDays } from './logic';

export interface Profile {
  id: string;
  email: string;
  emailVerified: boolean;
  username: string;
  alias: string;
  /** ISO time. */
  since: string | null;
  /** The new address of an email change waiting for its confirm link, or null. Undefined: not known (the API leaves
   *  the three email change fields out when it could not read them), never "nothing waiting". */
  pendingEmail?: string | null;
  /** When that link stops working (ISO time). */
  pendingUntil?: string | null;
  /** While the last change can still be undone from the old address, no other change can start (ISO time). */
  undoUntil?: string | null;
  /** Whether the account has a password (false: it signs in with GitHub or Google only). Undefined: the answer did not
   *  say (an API that does not report it, or another shape), never "no password". */
  hasPassword?: boolean;
  /** Whether a support reply is also emailed. Undefined: the answer did not say; the setting is then not offered. */
  supportMail?: boolean;
}

export interface TwoFactor {
  enabled: boolean;
  /** Setup was started but never confirmed. */
  setupUnfinished: boolean;
  /** Backup codes left, or null when the server did not say. */
  codesLeft: number | null;
  /** API key changes ask for a code. */
  gate: boolean;
}

export interface Session {
  id: string;
  current: boolean;
  active: boolean;
  method: string;
  client: string;
  clientName: string;
  userAgent: string;
  createdAt: string | null;
  lastSeenAt: string | null;
  lastIp: string | null;
  lastCountry: string | null;
  endedAt: string | null;
  endReason: string | null;
  endedHere: boolean;
  keysMade: number;
}

export interface SessionsPage {
  sessions: Session[];
  /** More rows exist than this page holds. */
  hasMore: boolean;
  /** The cursor of the next page, when there is one. */
  next?: string;
  /** The cursor this page was fetched with (none for the first page). */
  at?: string;
}

/** What the 2FA setup answer holds; shown once, wiped when the sheet closes (see parts/Secrets). */
export interface SetupSecrets {
  manualKey: string;
  /** A data: image URL. */
  qr: string;
  codes: string[];
}

/** One computer's SSH key slot as the account page lists it (read only; the key is set on the computer). */
export interface ComputerKey {
  id: string;
  name: string;
  /** The Computers page's handle (name and last four id characters), for the link. */
  handle: string;
  /** The key text, or null when the computer has none. Shown only summed up (logic.ts keySummary). */
  key: string | null;
}
export interface ComputerKeys {
  rows: ComputerKey[];
  /** False when the server has more computers than this one read holds. */
  whole: boolean;
}

/** One row of the account's security history (sign-ins; with `everything`, refused attempts and other security events). */
export interface HistoryEntry {
  id: string;
  /** The server's event name (login, login_failed, logout, otp_enabled, ...); unknown names show as text. */
  event: string;
  failed: boolean;
  ip: string | null;
  /** ISO-3166 alpha-2, or null when the server could not place the address (never a location). */
  country: string | null;
  client: string | null;
  at: string | null;
}

export interface HistoryPage {
  entries: HistoryEntry[];
  /** The page number this page was fetched with. */
  page: number;
  /** Pages the server has for this filter, or null when it did not say. */
  pages: number | null;
}

export interface Change<T = undefined> {
  outcome: OutcomeKind;
  data?: T;
  status?: number;
  code?: string;
  /** A refusal's wait in whole seconds, when the answer named one (a lockout, a rate limit). */
  retryAfter?: number;
  /** The person answered Cancel to the two-step code prompt: nothing was sent (outcome 'not_sent'), nothing to say. */
  cancelled?: true;
}

const rec = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});
const dataOf = (raw: unknown): Record<string, unknown> => rec(rec(raw).data);

// The refusal a secret answer may keep by name: a wrong code. A wrong password comes as a 401 with no code of its
// own and too many tries as a 429; both are read from the status, which every rejection keeps.
const SECRET_CODES = ['INVALID_OTP_CODE'] as const;

// Every route this page may send, declared once (base scope, account-bound).
const R = {
  me: meRoute,
  status: defineRoute({ method: 'GET', path: '/users/auth/2fa/status', scope: 'base' }),
  sessions: defineRoute({ method: 'GET', path: '/users/auth/sessions', scope: 'base', query: ['state', 'limit', 'cursor'] }),
  password: defineRoute({ method: 'PUT', path: '/users/:id', scope: 'base', body: ['current_password', 'password'] }),
  // PASSWORD_NOT_SET: the account has no password to ask for; named so the set-up drawer can say so (a secret route
  // keeps only the codes it lists).
  setup: defineRoute({ method: 'POST', path: '/users/auth/2fa/setup', scope: 'base', body: ['password'], secret: true, codes: [...SECRET_CODES, 'PASSWORD_NOT_SET'] }),
  codes: defineRoute({ method: 'POST', path: '/users/auth/2fa/backup-codes/regenerate', scope: 'base', body: ['password', 'code'], secret: true, codes: SECRET_CODES }),
  gate: defineRoute({ method: 'PUT', path: '/users/auth/2fa/token-gate', scope: 'base', body: ['enabled', 'password', 'otp_code'] }),
  endOne: defineRoute({ method: 'DELETE', path: '/users/auth/sessions/:id', scope: 'base' }),
  endOthers: defineRoute({ method: 'POST', path: '/users/auth/sessions/revoke-others', scope: 'base' }),
  // The display name only: this declaration carries no other field of the profile update.
  rename: defineRoute({ method: 'PUT', path: '/users/:id', scope: 'base', body: ['alias'] }),
  // The support reply email preference only, as the display name's declaration carries only the name.
  supportMail: defineRoute({ method: 'PUT', path: '/users/:id', scope: 'base', body: ['support_reply_email'] }),
  history: defineRoute({ method: 'GET', path: '/users/me/security-history', scope: 'base', query: ['page', 'limit', 'include_failed', 'include_security'] }),
  // The refusals the email change keeps by code.
  emailStart: defineRoute({
    method: 'POST', path: '/users/me/email-change', scope: 'base', body: ['new_email', 'current_password', 'otp_code'],
    codes: ['EMAIL_UNCHANGED', 'EMAIL_DOMAIN_NOT_ACCEPTED', 'PASSWORD_NOT_SET', 'OTP_REQUIRED', 'EMAIL_CHANGE_NOT_ALLOWED', 'EMAIL_CHANGE_LOCKED', 'ACCOUNT_CHANGED', 'CURRENT_PASSWORD_INCORRECT', 'INVALID_OTP_CODE'],
  }),
  emailCancel: defineRoute({ method: 'DELETE', path: '/users/me/email-change', scope: 'base' }),
};

/** History rows per page (the server's maximum). */
export const HISTORY_LIMIT = 100;
/** One read of computers holds at most this many. */
export const COMPUTER_KEYS_LIMIT = 100;

function historyOf(x: unknown): HistoryEntry | null {
  const r = rec(x);
  if (typeof r.id !== 'string' || r.id === '') return null;
  const event = str(r.event);
  return {
    id: r.id,
    event,
    // The coarse outcome when the server sent one; an older answer without it reads failed from the event name.
    failed: r.outcome === 'failed' || (r.outcome === undefined && /_failed$/.test(event)),
    ip: str(r.ip_address) || null,
    country: str(r.country) || null,
    client: str(r.client) || null,
    at: str(r.created_at) || null,
  };
}
/** One security-history answer, read (exported for its tests). Throws on anything that is not one. */
export function historyPageOf(raw: unknown, page?: number): HistoryPage {
  const body = rec(raw);
  // A list that is not one, or a row without its id, is a failed read: never an empty history.
  if (!Array.isArray(body.data)) throw new Error('malformed history');
  const entries = body.data.map(historyOf);
  if (entries.some((e) => e === null)) throw new Error('malformed history');
  // A page count that is there must be one (a whole number, 0 or more); none at all is unknown (useHistoryPages then
  // judges by a full page).
  const pages = rec(body.metadata).pages;
  if (pages !== undefined && pages !== null && !(typeof pages === 'number' && Number.isInteger(pages) && pages >= 0)) throw new Error('malformed history');
  return { entries: entries as HistoryEntry[], page: page ?? 1, pages: typeof pages === 'number' ? pages : null };
}

/** One computers answer read as the SSH key list (exported for its tests). Throws on anything that is not one. */
export function computerKeysOf(raw: unknown): ComputerKeys {
  const d = dataOf(raw);
  if (!Array.isArray(d.computers)) throw new Error('malformed computers');
  // A row that is not a computer (no id, a key that is not text) makes the read a failed one: never a shorter
  // list or "No key". The name is optional in the answer: the id stands in.
  const rows = d.computers.map((x) => {
    const c = rec(x);
    const k = c.ssh_public_key;
    if (typeof x !== 'object' || x === null || typeof c.id !== 'string' || c.id === '' || (k !== undefined && k !== null && typeof k !== 'string')) throw new Error('malformed computers');
    const id = c.id, name = typeof c.name === 'string' && c.name !== '' ? c.name : c.id;
    return { id, name, handle: computerHandle({ id, name }), key: typeof k === 'string' && k.trim() ? k : null };
  });
  // Whole: the pagination says one page; without a usable count, fewer rows than a page (core's pageOf rule).
  const pages = rec(d.pagination).totalPages;
  return { rows, whole: typeof pages === 'number' ? pages <= 1 : d.computers.length < COMPUTER_KEYS_LIMIT };
}

const historyRead = (everything: boolean) => ({
  route: R.history,
  input: (page?: number) => ({ query: { page: page ?? 1, limit: HISTORY_LIMIT, include_failed: everything, include_security: everything } }),
  select: (raw: unknown, page?: number): HistoryPage => historyPageOf(raw, page),
});

function sessionOf(x: unknown): Session {
  const s = rec(x);
  const made = rec(s.auth_tokens_created).count;
  return {
    id: str(s.id),
    current: s.current === true,
    active: s.active === true,
    method: str(s.method),
    client: str(s.client),
    clientName: str(s.client_name),
    userAgent: str(s.user_agent),
    createdAt: str(s.created_at) || null,
    lastSeenAt: str(s.last_refreshed_at) || null,
    lastIp: str(s.last_ip) || null,
    lastCountry: str(s.last_country) || null,
    endedAt: str(s.ended_at) || null,
    endReason: str(s.end_reason) || null,
    endedHere: s.ended_by_current === true,
    keysMade: typeof made === 'number' ? made : 0,
  };
}
/** The first status answer of a read-back (undefined when none answered or it was malformed). */
function statusIn(answers: readonly (readonly unknown[])[], at = 0): TwoFactor | undefined {
  const x = answers[at]?.[0];
  return x && typeof x === 'object' ? (x as TwoFactor) : undefined;
}
/**
 * The chain of pages a read-back saw, or none when it is not one chain from page 1: each later page must have been
 * fetched with the cursor the page before it answered now (a sign-in since moves them, and a session between two
 * chains is then in no page read).
 */
function chainOf(pages: SessionsPage[]): SessionsPage[] {
  const out: SessionsPage[] = [];
  for (const p of pages) {
    const prev = out[out.length - 1];
    if (out.length === 0 ? p.at !== undefined : prev?.next !== p.at) return out;
    out.push(p);
  }
  return out;
}
/** The session pages a read-back saw. */
function pagesIn(answers: readonly (readonly unknown[])[], at: number): SessionsPage[] {
  return (answers[at] ?? []).filter((x): x is SessionsPage => !!x && typeof x === 'object' && Array.isArray((x as SessionsPage).sessions));
}
const sessionsRead = (state: 'active' | 'ended') => ({
  route: R.sessions,
  input: (cursor?: string) => ({ query: { state, limit: 50, ...(cursor ? { cursor } : {}) } }),
  select: (raw: unknown, cursor?: string): SessionsPage => {
    const d = dataOf(raw);
    // A list without its rows, a row without its id or state, or a cursor that is not text is a failed read: a
    // revoke is proven by what these pages do not show, so a malformed page must prove nothing.
    const list = d.sessions;
    if (!Array.isArray(list) || (d.next_cursor !== undefined && d.next_cursor !== null && typeof d.next_cursor !== 'string')) throw new Error('malformed sessions');
    for (const x of list) {
      const r = rec(x);
      if (typeof r.id !== 'string' || r.id === '' || typeof r.active !== 'boolean') throw new Error('malformed sessions');
    }
    const next = str(d.next_cursor);
    return { sessions: list.map(sessionOf), hasMore: next !== '', ...(next ? { next } : {}), ...(cursor ? { at: cursor } : {}) };
  },
});

/** The profile part of GET /users/auth/me (exported for its tests). */
export function profileOf(d: Record<string, unknown>): Profile {
  return {
    id: str(d.id),
    email: str(d.email),
    emailVerified: d.email_verified === true,
    username: str(d.username),
    alias: str(d.alias),
    since: str(d.created_at) || null,
    pendingEmail: known(d.pending_email),
    pendingUntil: known(d.pending_email_expires_at),
    undoUntil: known(d.email_change_undo_until),
    ...(typeof d.has_password === 'boolean' ? { hasPassword: d.has_password } : {}),
    ...(typeof d.support_reply_email === 'boolean' ? { supportMail: d.support_reply_email } : {}),
  };
}

/** The profile showing the asked support-mail choice proves that change; any other value, or none, is unknown (the
 *  request may still be running). Exported for its tests. */
export function supportMailProves(id: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const p = answers[0]?.[0] as Profile | undefined;
  const want = (id as { on?: unknown } | undefined)?.on;
  return p && typeof want === 'boolean' && p.supportMail === want ? 'applied' : undefined;
}

/** An email change field: a string, an explicit null, or undefined when the answer left it out or gave another shape. */
function known(v: unknown): string | null | undefined {
  if (v === null) return null;
  return typeof v === 'string' && v !== '' ? v : undefined;
}

/** How the server stores an address it compares (trimmed, lowercased). */
export const emailKey = (x: string): string => x.trim().toLowerCase();

/**
 * The profile waiting on the asked address proves an email change start (a taken address reads the same, by design);
 * anything else is unknown, never not applied: the request may still be running (exported for its tests).
 */
export function emailStartProves(id: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const p = answers[0]?.[0] as Profile | undefined;
  const want = (id as { email?: string } | undefined)?.email;
  return p && want && typeof p.pendingEmail === 'string' && emailKey(p.pendingEmail) === want ? 'applied' : undefined;
}
/** Nothing waiting any more (an explicit null) proves a cancel; still waiting or not read is unknown (exported for its tests). */
export function emailCancelProves(_id: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const p = answers[0]?.[0] as Profile | undefined;
  return p && p.pendingEmail === null ? 'applied' : undefined;
}

// Live on a real page; the page's own fixtures under the fixture transport (hub:dev, hub:shots, tests).
const source = coreSource(
  'account',
  {
    reads: {
      profile: {
        route: R.me,
        select: (raw): Profile => {
          const d = dataOf(raw);
          return profileOf(d);
        },
      },
      identity: { route: R.me, select: (raw) => ({ banned: dataOf(raw).is_banned === true }) },
      twofa: {
        route: R.status,
        select: (raw): TwoFactor | null => {
          const d = dataOf(raw);
          // An answer without every field is unknown, never "off" or "gate off": proofs read this, so a missing
          // field must not turn into false (the page says it could not be read).
          if (typeof d.enabled !== 'boolean' || typeof d.verified !== 'boolean' || typeof d.require_for_tokens !== 'boolean') return null;
          const enabled = d.enabled && d.verified;
          const codesLeft = typeof d.backup_codes_remaining === 'number' ? d.backup_codes_remaining : null;
          return {
            enabled,
            // Display only, never a proof: the server stores a started set-up as not enabled, not verified, with codes made.
            setupUnfinished: !enabled && codesLeft !== null && codesLeft > 0,
            codesLeft,
            gate: d.require_for_tokens,
          };
        },
      },
      'sessions-active': sessionsRead('active'),
      'sessions-ended': sessionsRead('ended'),
      'history-signins': historyRead(false),
      'history-all': historyRead(true),
      // The computers in view (core's GET /computers, under the selected realm) and the key each accepts.
      // This browser's address as the Hoody API sees it (GET /ip); null when the answer names none.
      'my-ip': { route: myIpRoute, select: (raw): IpDetails | null => ipDetailsFrom(raw) },
      'computer-keys': {
        route: containersRoute,
        input: () => ({ query: { page: 1, limit: COMPUTER_KEYS_LIMIT } }),
        select: (raw): ComputerKeys => computerKeysOf(raw),
      },
    },
    changes: {
      changePassword: {
        route: R.password,
        input: (v: { current: string; password: string }) => ({ params: { id: capture().account ?? '' }, body: { current_password: v.current, password: v.password } }),
        reads: ['profile'],
        // The identity is the operation, never the credentials (core keys a lock on a hash of the variables otherwise).
        lockKey: () => 'password',
      },
      rename: {
        route: R.rename,
        input: (v: { alias: string }) => ({ params: { id: capture().account ?? '' }, body: { alias: v.alias } }),
        reads: ['profile'],
        // One display name change at a time, whatever name it asks for: another name after an unknown outcome waits for Check again.
        lockKey: () => 'rename',
        identity: (v) => ({ alias: v.alias }),
        // The profile showing the asked name proves it; any other name is unknown (the request may still be running).
        proves: (id: unknown, answers) => {
          const p = answers[0]?.[0] as Profile | undefined;
          return p && typeof p.alias === 'string' && p.alias === (id as { alias?: string })?.alias ? 'applied' : undefined;
        },
      },
      // The support reply email, on or off. One change at a time whichever way it asks; the profile showing the asked
      // value proves it.
      supportMail: {
        route: R.supportMail,
        input: (v: { on: boolean }) => ({ params: { id: capture().account ?? '' }, body: { support_reply_email: v.on } }),
        reads: ['profile'],
        lockKey: () => 'supportMail',
        identity: (v) => ({ on: v.on }),
        proves: supportMailProves,
      },
      // Start an email change. The password travels in the body only; the lock is the operation, never it. A
      // two-step code is asked by core's prompt on OTP_REQUIRED, as for every 2FA-gated change (pages/keys).
      emailStart: {
        route: R.emailStart,
        input: (v: { email: string; password: string }) => ({
          body: { new_email: v.email.trim(), current_password: v.password },
        }),
        reads: ['profile'],
        lockKey: () => 'emailStart',
        identity: (v) => ({ email: emailKey(v.email) }),
        proves: emailStartProves,
      },
      emailCancel: {
        route: R.emailCancel,
        reads: ['profile'],
        lockKey: () => 'emailCancel',
        proves: emailCancelProves,
      },
      setGate: {
        route: R.gate,
        input: (v: { enabled: boolean; password?: string; code?: string }) => ({
          body: v.enabled ? { enabled: true } : { enabled: false, password: v.password ?? '', otp_code: cleanCode(v.code ?? '') },
        }),
        reads: ['twofa'],
        // The identity is the operation, never the credentials: another code after an unknown outcome is the same change.
        lockKey: () => 'setGate',
        // What the change asked for is what the proof compares the status with. An unchanged status is unknown, never
        // not applied: the request may still be running on the server, and no read here ties the state to its end.
        identity: (v) => ({ on: v.enabled }),
        proves: (id: unknown, answers) => {
          const s = statusIn(answers);
          return s && (id as { on?: boolean })?.on === s.gate ? 'applied' : undefined;
        },
      },
      // Both answer with a rotated session pair that core adopts (the page never sees it); every other session of the
      // account is ended, so the session lists are re-read with the status.
      verifySetup: {
        route: verifySetupRoute,
        input: (v: { code: string }) => ({ body: { code: cleanCode(v.code) } }),
        reads: ['twofa', 'sessions-active', 'sessions-ended'],
        lockKey: () => 'verifySetup',
        // Still not enabled is unknown (the request may still be running), only enabled proves it.
        proves: (_id: unknown, answers) => (statusIn(answers)?.enabled ? 'applied' : undefined),
      },
      turnOff: {
        route: turnOffRoute,
        input: (v: { password: string; code: string }) => ({ body: { password: v.password, code: cleanCode(v.code) } }),
        reads: ['twofa', 'sessions-active', 'sessions-ended'],
        lockKey: () => 'turnOff',
        // Still on is unknown (the request may still be running), only off proves it.
        proves: (_id: unknown, answers) => {
          const s = statusIn(answers);
          return s && !s.enabled ? 'applied' : undefined;
        },
      },
      endSession: {
        route: R.endOne,
        input: (v: { id: string }) => ({ params: { id: v.id } }),
        select: (raw): { alreadyEnded: boolean } => ({ alreadyEnded: dataOf(raw).already_ended === true }),
        reads: ['sessions-active', 'sessions-ended'],
        // The session's id is the identity (not a secret): the lists show whether it is still active.
        lockKey: (v: { id: string }) => v.id,
        proves: (id: unknown, answers) => {
          // Still active is unknown (the request may still be running). Gone = applied only when that chain ends
          // (no page past the last read could hold it); a session listed as ended proves it too, when that list is mounted.
          const pages = chainOf(pagesIn(answers, 0));
          if (pages.length === 0) return undefined;
          if (pages.some((p) => p.sessions.some((x) => x.id === id && x.active))) return undefined;
          if (pagesIn(answers, 1).some((p) => p.sessions.some((x) => x.id === id && !x.active))) return 'applied';
          return pages[pages.length - 1]?.hasMore ? undefined : 'applied';
        },
      },
      endOthers: {
        route: R.endOthers,
        select: (raw): { ended: number } => {
          const n = dataOf(raw).revoked;
          return { ended: typeof n === 'number' ? n : 0 };
        },
        reads: ['sessions-active', 'sessions-ended'],
        lockKey: () => 'endOthers',
        proves: (_id: unknown, answers) => {
          const pages = chainOf(pagesIn(answers, 0));
          if (pages.length === 0) return undefined;
          // Another active session on a page that was read is unknown (the request may still be running); none, with no page left unread, means it went.
          if (pages.some((p) => p.sessions.some((x) => x.active && !x.current))) return undefined;
          return pages[pages.length - 1]?.hasMore ? undefined : 'applied';
        },
      },
    },
  },
  // The ship build (__HUB_FIXTURES__ false) holds no fixture module: the fallback is given only in a fixture build,
  // the only build where coreSource answers from it (fixtureModeActive needs __HUB_FIXTURES__).
  pageFixtures('account'),
);

export function useProfile() {
  const q = source.useQuery<Profile>('profile');
  // The profile is a fresh /users/auth/me answer: the shell's greeting and account menu follow its display name, so a
  // proven rename shows there without a reload.
  const id = q.data?.id;
  const alias = q.data?.alias;
  useEffect(() => {
    if (id) noteShownAlias(id, alias);
  }, [id, alias]);
  return q;
}

/** null data = the status could not be read (the page says so; it never guesses "off"). */
export function useTwoFactor() {
  return source.useQuery<TwoFactor | null>('twofa');
}

/** The shell's identity: a suspended account keeps only its sign-in sessions. */
export function useIdentity() {
  return source.useQuery<{ banned: boolean }>('identity');
}

/**
 * Every page of one kind loaded so far, merged: the first page, then one more per `more()` by cursor, so a
 * list past 50 sessions can be reached. The key is the first page's, so a revoke's read-back covers them all.
 */
export function useSessionPages(kind: 'active' | 'ended') {
  const key = kind === 'active' ? 'sessions-active' : 'sessions-ended';
  // A cursor belongs to the account and list it came from: another account or kind starts again at page 1.
  const account = capture().account ?? '';
  const [chain, setChain] = useState<{ kind: string; account: string; cursors: string[] }>({ kind, account, cursors: [] });
  const cursors = useMemo(() => (chain.kind === kind && chain.account === account ? chain.cursors : []), [chain, kind, account]);
  const qs = source.useQueries<SessionsPage, string | undefined>(key, [undefined, ...cursors]);
  const first = qs[0];
  const last = qs[qs.length - 1];
  const done = qs.every((q) => q.data !== undefined);
  // A row can move between pages while the list is open: each session is listed once, by its id.
  // Pages already loaded stay while the next one loads (no collapse to page 1).
  const all = first?.data ? qs.flatMap((q) => q.data?.sessions ?? []) : undefined;
  const seen = new Set<string>();
  const sessions = all?.filter((x) => !seen.has(x.id) && !!seen.add(x.id));
  // A page that now answers another next cursor than the one its follower was fetched with: the list moved (a new
  // sign-in). The chain is rebuilt from that page, so no row hides between two chains.
  const moved = qs.findIndex((q, i) => i < cursors.length && q.data !== undefined && q.data.next !== cursors[i]);
  useEffect(() => {
    if (moved < 0) return;
    const fresh = qs[moved]?.data?.next;
    setChain({ kind, account, cursors: [...cursors.slice(0, moved), ...(fresh ? [fresh] : [])] });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- qs changes every render; moved and cursors are what the rebuild reads
  }, [moved, cursors, kind, account]);
  const next = done && moved < 0 ? last?.data?.next : undefined;
  const more = useCallback(() => {
    if (next && !cursors.includes(next)) setChain({ kind, account, cursors: [...cursors, next] });
  }, [next, cursors, kind, account]);
  const firstError = first?.error ?? null;
  return {
    sessions,
    hasMore: next !== undefined,
    more,
    /** Pages loaded so far (the first one counts). */
    loaded: cursors.length + 1,
    loadingMore: cursors.length > 0 && !done && !qs.some((q) => q.error),
    isPending: Boolean(first?.isPending),
    /** The first page failed: the list cannot be shown. */
    error: firstError,
    /** A later page failed (the pages before it still show); refetch retries it. */
    moreError: firstError ? null : (qs.find((q) => q.error)?.error ?? null),
    /** Every page again (a failed one included); isError when any still fails. */
    refetch: async (): Promise<{ isError: boolean }> => {
      const rs = await Promise.all(qs.map((q) => q.refetch()));
      return { isError: rs.some((r) => r.isError) };
    },
  };
}

/** This browser's address (GET /ip): null data = the answer named no address (the page says it could not be read). */
export function useMyAddress() {
  return source.useQuery<IpDetails | null>('my-ip');
}

export function useSessions(kind: 'active' | 'ended') {
  return source.useQuery<SessionsPage>(kind === 'active' ? 'sessions-active' : 'sessions-ended');
}

// The bridge answers per state, not per input; core's mutations will send the real values.
type Vars = Record<string, unknown> | void;

/**
 * The holds shown when a warning armed, taken once (when `armed` turns on, or `key` changes while it is on) and kept
 * until it disarms: a Dismiss frees those and no other, however the live holds changed meanwhile (another tab
 * freed or replaced the send). `read` is the live read of the rows this warning is about (heldNow, narrowed to a target).
 * `retake` is the person's own refresh: called when a Check again came back inconclusive, it shows the warning over the
 * rows on screen at that moment (a send that replaced the first one); nothing else ever moves the snapshot between presses.
 */
export function useArmedHolds(armed: boolean, read: () => readonly HeldRow[], key?: unknown): { shown: () => readonly HeldRow[]; retake: () => void } {
  const snap = useRef<readonly HeldRow[] | null>(null);
  const readRef = useRef(read);
  readRef.current = read;
  useEffect(() => {
    snap.current = armed ? readRef.current() : null;
  }, [armed, key]);
  return {
    shown: () => snap.current ?? readRef.current(),
    retake: () => {
      snap.current = readRef.current();
    },
  };
}

/** How long a 409 refusal waits for the page's reads before it is answered anyway. */
const REREAD_WAIT_MS = 10_000;
/**
 * A change refused with 409. Most often the account changed while it was on its way (a password, 2FA or sign-out
 * change made elsewhere), so what the page shows may be out of date. Every read of the page is read again BEFORE the
 * refusal is answered: the sentence shows over the account as it is now, and a second press (each sheet and the
 * end-session dialog refuse one until the answer) goes out against it, with no reload. A session that ended
 * elsewhere answers that read with a 401, which takes the page to sign-in as a reload did. A read that fails shows
 * as it would on its own; the refusal stands either way and nothing is held. The other 409s (an email change that
 * is locked) cost one more read, nothing else. The fixture transport answers no status: nothing is read again there.
 * The answer waits at most REREAD_WAIT_MS: a read that hangs never keeps the refusal back longer.
 */
async function rereadOnConflict(r: { readonly outcome: string; readonly status?: number }): Promise<void> {
  if (r.outcome !== 'failed' || r.status !== 409) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const waited = new Promise<void>((done) => {
      timer = setTimeout(done, REREAD_WAIT_MS);
    });
    await Promise.race([source.invalidate(), waited]);
  } catch {
    // The refusal stands.
  } finally {
    clearTimeout(timer);
  }
}

function useChange<T>(key: string) {
  // A live page's mutation holds core's own lock (one send at a time, an unknown outcome locked until read back);
  // this guard is the same rule for the fixture transport.
  const m = source.useMutation<T, Vars>(key);
  const [running, setRunning] = useState(false);
  const mref = useRef(m);
  mref.current = m;
  const busy = useRef(false);
  const run = useCallback(async (vars?: Record<string, unknown>): Promise<Change<T>> => {
    // One send at a time: a second press while one runs sends nothing.
    if (busy.current) return { outcome: 'not_sent', code: 'BUSY' };
    busy.current = true;
    setRunning(true);
    try {
      const r = await mref.current.mutateAsync(vars);
      // The mutation state holds the variables (the passwords): drop them as soon as the answer is in. Core's reset
      // leaves a pending change's lock and key alone (they hold only a hash), so it is safe in every outcome.
      mref.current.reset?.();
      // The person's own Cancel of the two-step code prompt: the server applied nothing and no code went out.
      if (r.outcome === 'failed' && (r as { cancelled?: boolean }).cancelled === true) return { outcome: 'not_sent', cancelled: true };
      const out: Change<T> = { outcome: r.outcome };
      if (r.data !== undefined) out.data = r.data as T;
      if (r.code !== undefined) out.code = r.code;
      if (r.status !== undefined) out.status = r.status;
      const wait = (r as { retryAfter?: number }).retryAfter;
      if (wait !== undefined) out.retryAfter = wait;
      await rereadOnConflict(out);
      return out;
    } catch {
      mref.current.reset?.();
      return { outcome: 'failed', code: 'CALL_FAILED' };
    } finally {
      busy.current = false;
      setRunning(false);
    }
  }, []);
  // The holds core keeps for this change, from any mount (module level: they survive leaving the page). A reopened sheet
  // is a new mount: its own no-argument settle frees nothing of an earlier mount's send, so a warned Dismiss names the
  // holds that were SHOWN when its warning armed (useArmedHolds) and frees exactly those, each by its token. A row's
  // `identity` is the change's lockKey (the session's id for an end-one revoke): a dialog about one target arms with only
  // that target's rows. `holds` is as of this render (for what to show); `heldNow` reads live (for the snapshot).
  useChangesVersion();
  const holds: readonly HeldRow[] = m.held();
  const heldNow = (): readonly HeldRow[] => mref.current.held();
  // The warned Dismiss of the rows that were shown. True only when every one was freed (none shown: nothing of core's to
  // free). False when any was already settled or replaced since it was shown: that one is not touched (a replacing
  // send stays held), the page says so (never "failed"), and the others were still dismissed. Each free is judged and
  // stored in core's store-lock turn, so the answer comes once they are stored.
  const dismissRows = async (rows: readonly HeldRow[]): Promise<boolean> => {
    const freed = await Promise.all(rows.map((row) => mref.current.dismissHeld(row)));
    return freed.every(Boolean);
  };
  // Core's own lock for this change (module level: it survives leaving the page); Check again reads it back.
  // m.isPending is core's: a send another mount started is still out (the hook is new, its own flags are not).
  return { run, running: running || m.isPending, pending: m.pending, readBack: m.readBack, holds, heldNow, dismissRows };
}

/** The passwords travel in the request body. The mutation state holds them only while the change runs or is pending; it is reset once the outcome is known. Core's locks keep only a hash of the variables. */
export function useChangePassword() {
  const fixture = useChange<undefined>('changePassword');
  const fref = useRef(fixture);
  fref.current = fixture;
  const locked = useLockedChange<{ current: string; password: string }, true>(
    async (v, _idem, ctx) => {
      await api(R.password, { params: { id: ctx.account ?? '' }, body: { current_password: v.current, password: v.password }, ctx });
      return true;
    },
    // Core's own network-only read of the profile (a key predicate). A profile read answers the same either way, so
    // the page never takes it as proof of the outcome (see PasswordSheet): with no proves it frees nothing, only a warned Dismiss does.
    [(k) => k[0] === 'hub' && k[4] === 'src' && k[5] === 'account' && k[6] === 'profile'],
    'account.password',
    // The identity is the operation, never the credentials: another password after an unknown outcome is the same change.
    { lockKey: () => 'password' },
  );
  const run = useCallback(
    async (vars: { current: string; password: string }): Promise<Change<undefined>> => {
      if (fixtureModeActive()) return fref.current.run(vars);
      const r = await locked.run(vars);
      await rereadOnConflict(r);
      // The wait a refusal names goes out with it (a rate limit says it in Retry-After): the drawer says it in minutes.
      return { outcome: r.outcome, ...(r.code !== undefined ? { code: r.code } : {}), ...(r.status !== undefined ? { status: r.status } : {}), ...(r.retryAfter !== undefined ? { retryAfter: r.retryAfter } : {}) };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- locked.run is stable per hook; the rest are refs
    [locked.run],
  );
  return {
    run,
    running: locked.state === 'running' || fixture.running,
    pending: locked.state === 'pending' || fixture.pending,
    readBack: () => (fixtureModeActive() ? fixture.readBack() : locked.readBack()),
    // No read can prove a password change: only the person's Dismiss frees it. Core's useLockedChange.dismiss acts on the
    // live scope (the holds pending now, own sender or unowned), with no render-snapshot guarantee. True once core
    // stored every free; false leaves the hold shown.
    dismiss: (): Promise<boolean> => (fixtureModeActive() ? Promise.resolve(true) : locked.dismiss()),
  };
}
/**
 * A change whose answer carries a secret. Live it goes through core's mintSecret under useLockedChange (one send
 * at a time, an unknown outcome locks until the 2FA status was read back fresh, the raw answer is wiped at the
 * boundary); the page only ever holds the HeldSecret, never the text. Under the fixture transport the page's
 * fixtures answer as for every other change and their data is held the same way.
 */
function useMinted(
  key: string,
  route: typeof R.setup,
  body: (vars: Record<string, unknown>) => Record<string, string>,
  pick: (raw: unknown) => string | null,
  wrap: (fixtureData: unknown) => string | null,
  /** What a fresh status shows of this change; none: a read cannot tell, only the person's Start over frees it. It never answers not applied. */
  proves?: (status: TwoFactor) => 'applied' | undefined,
) {
  const fixture = useChange<unknown>(key);
  const status = source.useQuery<TwoFactor | null>('twofa');
  const statusRef = useRef(status);
  statusRef.current = status;
  const fref = useRef(fixture);
  fref.current = fixture;
  const locked = useLockedChange<Record<string, unknown>, HeldSecret | null>(
    // The press context goes to the send: a send can never leave in another account, realm or session.
    async (vars, _idem, ctx) => (await mintSecret(route, { body: body(vars), recovers: false, ctx }, pick)).held,
    [
      // Core's own network-only read of the 2FA status (a key predicate, as bots' readsOf): a refetch another fetch
      // cancelled would answer from the cache, which proves nothing.
      (k) => k[0] === 'hub' && k[4] === 'src' && k[5] === 'account' && k[6] === 'twofa',
    ],
    // A stable id: the lock and key survive leaving the page and coming back.
    `account.${key}`,
    // The identity is the operation, never its credentials: another password or code after an unknown outcome
    // is the same change (refused until read back), and no secret is hashed into the lock.
    {
      lockKey: () => key,
      ...(proves ? { proves: (_id: unknown, answers: readonly (readonly unknown[])[]) => { const s = statusIn(answers); return s ? proves(s) : undefined; } } : {}),
    },
  );
  const run = useCallback(
    async (vars: Record<string, unknown> = {}): Promise<Change<HeldSecret>> => {
      if (fixtureModeActive()) {
        const r = await fref.current.run(vars);
        if (r.outcome !== 'done') return { outcome: r.outcome, ...(r.code !== undefined ? { code: r.code } : {}) };
        const text = wrap(r.data);
        const held = text === null ? null : holdSecret(text, capture());
        return held ? { outcome: 'done', data: held } : { outcome: 'pending', code: 'NO_SECRET' };
      }
      const r = await locked.run(vars);
      await rereadOnConflict(r);
      if (r.outcome !== 'done') return { outcome: r.outcome, ...(r.code !== undefined ? { code: r.code } : {}), ...(r.status !== undefined ? { status: r.status } : {}), ...(r.retryAfter !== undefined ? { retryAfter: r.retryAfter } : {}) };
      return r.data ? { outcome: 'done', data: r.data } : { outcome: 'pending', code: 'NO_SECRET' };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- locked.run is stable per hook; the rest are refs
    [locked.run],
  );
  // Live: core's useLockedChange.dismiss acts on the live scope (the holds pending now, own sender or unowned), with no
  // render-snapshot guarantee; the fixture transport has no core hold to free. True once core stored every free:
  // a sheet clears its own state only then.
  const dismissShown = (): Promise<boolean> => (fixtureModeActive() ? Promise.resolve(true) : locked.dismiss());
  return {
    run,
    running: locked.state === 'running' || fixture.running,
    pending: locked.state === 'pending' || fixture.pending,
    readBack: () => (fixtureModeActive() ? fixture.readBack() : locked.readBack()),
    dismissShown,
    // The CodeSheet's contract with a source hook: a locked change keeps no rows to snapshot, its Dismiss is the live scope's.
    heldNow: (): readonly HeldRow[] => [],
    dismissRows: (_rows: readonly HeldRow[]): Promise<boolean> => dismissShown(),
  };
}

/**
 * A read-back's verdict: core's own network-only read-back must say so, and the status read after it must have
 * answered with data (a change with no core lock, such as a 2xx without a secret, is released on a read, not on
 * the absence of a lock).
 */
export function provenBy(own: boolean, status: { isError: boolean; data?: unknown }): boolean {
  return own && readOk(status);
}

/** A fresh, successful read that carried data (a status that answered null could not be read). */
export function readOk(r: { isError: boolean; data?: unknown }): boolean {
  return !r.isError && r.data !== undefined && r.data !== null;
}

export function useStartSetup() {
  return useMinted(
    'setup',
    R.setup,
    (v) => ({ password: str(v.password) }),
    (raw) => {
      const d = dataOf(raw);
      const out =
        typeof d.manual_entry_key === 'string' && typeof d.qr_code === 'string' && isQrImage(d.qr_code) && Array.isArray(d.backup_codes)
          ? JSON.stringify({ k: d.manual_entry_key, q: d.qr_code, c: d.backup_codes.filter((x) => typeof x === 'string') })
          : null;
      // The answer's own copies go now: only the held composite survives.
      d.manual_entry_key = null;
      d.qr_code = null;
      d.backup_codes = [];
      return out;
    },
    (data) => {
      const x = rec(data) as Partial<SetupSecrets>;
      return typeof x.manualKey === 'string' && typeof x.qr === 'string' && isQrImage(x.qr) ? JSON.stringify({ k: x.manualKey, q: x.qr, c: x.codes ?? [] }) : null;
    },
    // No proves: the server stores a started set-up as not enabled and not verified, so no status read can tell it
    // from a start that never happened. A lost answer stays unknown behind a warned Start over.
  );
}
export function useVerifySetup() {
  return useChange<undefined>('verifySetup');
}
export function useTurnOff() {
  return useChange<undefined>('turnOff');
}
export function useNewCodes() {
  return useMinted(
    'newCodes',
    R.codes,
    (v) => ({ password: str(v.password), code: cleanCode(str(v.code)) }),
    (raw) => {
      const d = dataOf(raw);
      const out = Array.isArray(d.backup_codes) ? JSON.stringify({ c: d.backup_codes.filter((x) => typeof x === 'string') }) : null;
      d.backup_codes = [];
      return out;
    },
    (data) => {
      const c = rec(data).codes;
      return Array.isArray(c) ? JSON.stringify({ c }) : null;
    },
  );
}
/**
 * The setup secrets for one render. The page holds only the HeldSecret; the text is read here, at render, and
 * is null once the secret was dropped (a wipe, a close, a context change), so the QR leaves with the key.
 */
export function useSetupParts(held: HeldSecret | null): SetupSecrets | null {
  const text = useSecret(held, held?.ctx);
  return useMemo(() => {
    if (!text) return null;
    try {
      const x = rec(JSON.parse(text));
      return { manualKey: str(x.k), qr: str(x.q), codes: Array.isArray(x.c) ? (x.c as string[]) : [] };
    } catch {
      return null;
    }
  }, [text]);
}
/** The backup codes of a new-codes answer, one render at a time (see useSetupParts). */
export function useCodeList(held: HeldSecret | null): string[] | null {
  const text = useSecret(held, held?.ctx);
  return useMemo(() => {
    if (!text) return null;
    try {
      const c = rec(JSON.parse(text)).c;
      return Array.isArray(c) ? (c as string[]) : null;
    } catch {
      return null;
    }
  }, [text]);
}
/** Start an email change (the confirm link goes to the new address); a profile waiting on that address proves it. */
export function useEmailStart() {
  return useChange<undefined>('emailStart');
}
/** Cancel the waiting email change; a profile with nothing waiting proves it. */
export function useEmailCancel() {
  return useChange<undefined>('emailCancel');
}

/** What a profile read taken after a saved support-mail change tells: `proved` when it shows the asked value,
 *  `unknown` when the read failed (the change was taken and nothing says where it stands: held until a read tells, never
 *  a refusal), `other` when it shows another value. The fixture transport answers per state, not per change (its
 *  profile never moves), so there the saved answer stands. */
export function supportMailAfterSave(read: { isError: boolean; data?: Profile }, on: boolean, fixture: boolean = fixtureModeActive()): 'proved' | 'unknown' | 'other' {
  if (fixture) return 'proved';
  if (read.isError) return 'unknown';
  return read.data?.supportMail === on ? 'proved' : 'other';
}

/** The support reply email preference (PUT /users/{id} {support_reply_email}); a profile showing the asked value proves it. */
export function useSupportMail() {
  return useChange<undefined>('supportMail');
}

/** The display name change (PUT /users/{id} {alias}); a profile showing the new name proves it. */
export function useRename() {
  return useChange<undefined>('rename');
}

/** At most this many history pages are loaded (HISTORY_LIMIT rows each). */
export const HISTORY_MAX_PAGES = 5;

/**
 * The security history of one filter, page 1 first and each next page as soon as the one before it answered with
 * more to come (capped). Rows are listed once by id: a new event moves later rows down a page while it loads.
 */
export function useHistoryPages(everything: boolean) {
  const key = everything ? 'history-all' : 'history-signins';
  const account = capture().account ?? '';
  const [loaded, setLoaded] = useState<{ key: string; account: string; n: number }>({ key, account, n: 1 });
  const n = loaded.key === key && loaded.account === account ? loaded.n : 1;
  const qs = source.useQueries<HistoryPage, number>(key, Array.from({ length: n }, (_, i) => i + 1));
  const last = qs[qs.length - 1];
  const first = qs[0];
  const lastPages = last?.data?.pages;
  // Pages left after the last one loaded: its count says so, or (no count) it came back full.
  const left = !!last?.data && (typeof lastPages === 'number' ? lastPages > n : last.data.entries.length >= HISTORY_LIMIT);
  const more = left && n < HISTORY_MAX_PAGES;
  useEffect(() => {
    if (more) setLoaded({ key, account, n: n + 1 });
  }, [more, key, account, n]);
  const seen = new Set<string>();
  const entries = first?.data ? qs.flatMap((q) => q.data?.entries ?? []).filter((e) => !seen.has(e.id) && !!seen.add(e.id)) : undefined;
  return {
    entries,
    isPending: Boolean(first?.isPending),
    error: first?.error ?? null,
    /** A later page failed: the rows before it still show. */
    moreError: first?.error ? null : (qs.find((q) => q.error)?.error ?? null),
    /** The cap was reached with pages left on the server. */
    capped: n >= HISTORY_MAX_PAGES && left,
    refetch: async (): Promise<void> => {
      await Promise.all(qs.map((q) => q.refetch()));
    },
  };
}

/** Each computer in view and its SSH key (read only). */
export function useComputerKeys() {
  return source.useQuery<ComputerKeys>('computer-keys');
}

export function useSetGate() {
  return useChange<undefined>('setGate');
}
export function useEndSession() {
  return useChange<{ alreadyEnded: boolean }>('endSession');
}
export function useEndOthers() {
  return useChange<{ ended: number }>('endOthers');
}

// ── the agent sign-in lifetime: this browser only ───────────────────────────

const TTL_KEY = 'hub_boot_token_ttl_days';

// Built on first use: registering a key needs shared.js, which a module import must not require.
let ttlSetting: ReturnType<typeof localSetting> | null = null;
const ttlDays = {
  get: () => (ttlSetting ??= localSetting(TTL_KEY, { keepAtSignOut: true })).get(),
  set: (v: string | null) => (ttlSetting ??= localSetting(TTL_KEY, { keepAtSignOut: true })).set(v),
};

export function readAgentDays(): number {
  return parseDays(ttlDays.get()) ?? DEFAULT_AGENT_DAYS;
}

/** True when the browser kept the value. */
export function saveAgentDays(days: number): boolean {
  return ttlDays.set(String(days));
}

/** The context a press starts in (account, realm, session, generation). `still()` turns false once any context change
 *  or sign-out happened since, so an answer that lands later commits nothing on the page: a Start over's second step
 *  or a page lock it would settle belongs to the context it was pressed in. */
export function pressContext(): { still: () => boolean } {
  const at = capture();
  return { still: () => alive(at) };
}

// ── The two mails an account asks for its own address ───────────────────────

/** `reset`: the link that sets a password (an account without one has no other way). `verify`: the address's verify link. */
export type MailKind = 'reset' | 'verify';
/**
 * Where an ask stands. `sent`: Hoody took the request (it answers the same whether or not a mail goes out, so the page
 * says where to look, never that one arrived). `wait`: too many asks. `unsure`: no answer came back, the mail may have
 * been sent. `failed`: a definite refusal. `framed`: this page is inside another page, nothing was sent.
 */
export type MailAsk =
  | { readonly state: 'sending' }
  | { readonly state: 'sent'; readonly to: string }
  | { readonly state: 'wait'; readonly retryAfter?: number }
  | { readonly state: 'unsure' }
  | { readonly state: 'failed' }
  | { readonly state: 'framed' }
  | { readonly state: 'readonly' };

// Kept outside every render: the row, the email drawer and the security checklist show the same ask, and a row that
// unmounts and comes back still shows it (one press, no second mail from another place on the page). Per account:
// dropped on an account change or sign-out (core's rule for unresolved changes), never read for another account.
const mailAsks = new Map<MailKind, { account: string; ask: MailAsk }>();
const mailSubs = new Set<() => void>();
let mailRev = 0;
const mailChanged = (): void => {
  mailRev++;
  for (const f of mailSubs) f();
};
onBump((reason) => {
  if (keepsChanges(reason) || mailAsks.size === 0) return;
  mailAsks.clear();
  mailChanged();
});
/** Tests only: forgets every ask. */
export function resetMailAsks(): void {
  mailAsks.clear();
  mailChanged();
}

/** Core's typed answer to an ask, as the page holds it (exported for its tests). No answer at all, or a fault, is
 *  `unsure`, never a failure: the request may have reached Hoody. Only a refusal that proves nothing was sent (too many
 *  asks, a framed page, an address the request check refused, no API) offers the action again. */
export function mailAskFrom(r: AccountMailResult, to: string): MailAsk {
  if (r.kind === 'sent') return { state: 'sent', to };
  if (r.why === 'retry') return r.retryAfter !== undefined ? { state: 'wait', retryAfter: r.retryAfter } : { state: 'wait' };
  // No answer, or a fault answered on the way (a 5xx can come back after the mail went out): not known.
  if (r.why === 'network' || r.why === 'unavailable') return { state: 'unsure' };
  return r.why === 'framed' ? { state: 'framed' } : r.why === 'read-only' ? { state: 'readonly' } : { state: 'failed' };
}

// Fixture build only, as fxWipe below: under the fixture transport the page's fixtures answer ('mailReset',
// 'mailVerify': done, pending for no answer, or failed with code RATE_LIMITED and an optional retryAfter).
const fxMail = __HUB_FIXTURES__ ? pageFixtures('account')! : null;

/**
 * Ask Hoody to mail the account's own address. `send(email)` sends at most one request per kind: nothing goes out
 * while one is out or after one was taken (`sent`), so no press, in any place that shows the ask, mails twice. The
 * address is the profile's, passed by the caller; it is kept only as the `to` of a taken ask.
 */
export function useAccountMail(kind: MailKind): { ask: MailAsk | undefined; send: (email: string) => Promise<void> } {
  const fixture = fixtureModeActive();
  // The transport is fixed at boot, so each render runs the same hooks. Only under the fixture transport: a test that
  // boots the real core in a fixture build has no page fixtures to ask.
  const fm = __HUB_FIXTURES__ && fixture ? fxMail!.useMutation<unknown>(kind === 'reset' ? 'mailReset' : 'mailVerify') : null;
  const fmRef = useRef(fm);
  fmRef.current = fm;
  useSyncExternalStore(
    (f) => (mailSubs.add(f), () => mailSubs.delete(f)),
    () => mailRev,
    () => mailRev,
  );
  const account = capture().account ?? '';
  const held = mailAsks.get(kind);
  const ask = held && held.account === account ? held.ask : undefined;
  const send = useCallback(
    async (email: string): Promise<void> => {
      const at = capture();
      const who = at.account ?? '';
      const now = mailAsks.get(kind);
      if (!who || !email || (now && now.account === who && (now.ask.state === 'sending' || now.ask.state === 'sent'))) return;
      const put = (next: MailAsk): void => {
        mailAsks.set(kind, { account: who, ask: next });
        mailChanged();
      };
      put({ state: 'sending' });
      let next: MailAsk;
      try {
        if (fixture) {
          // A fixture answer carries its wait in `data` (the fixture source keeps outcome, code and data only).
          const fx = (await fmRef.current!.mutateAsync(undefined)) as { outcome?: unknown; code?: unknown; data?: { retryAfter?: unknown } | null };
          const r = { outcome: fx.outcome, code: fx.code, retryAfter: fx.data?.retryAfter };
          next =
            r.outcome === 'done' ? { state: 'sent', to: email }
            : r.outcome === 'pending' ? { state: 'unsure' }
            : r.code === 'RATE_LIMITED' ? (typeof r.retryAfter === 'number' ? { state: 'wait', retryAfter: r.retryAfter } : { state: 'wait' })
            : r.code === 'FRAMED' ? { state: 'framed' }
            : r.code === 'INVALID' ? { state: 'failed' }
            : { state: 'unsure' };
        } else {
          next = mailAskFrom(await (kind === 'reset' ? requestPasswordReset : resendVerification)(email), email);
        }
      } catch {
        // The call itself threw before or after sending: whether a mail went out is not known.
        next = { state: 'unsure' };
      }
      // The account this was asked for ended meanwhile (its asks were dropped then): the answer is said to nobody.
      // A realm switch keeps the account, so the answer still lands: dropping it would offer the same mail again.
      const mine = mailAsks.get(kind);
      if (!mine || mine.account !== who) return;
      put(next);
    },
    [fixture, kind],
  );
  return { ask, send };
}

// ── Remove all local data: this browser only ────────────────────────────────

/** How often an open confirm reads its warning again (payments have no change notice). */
const WIPE_REREAD_MS = 1000;
// Fixture build only: the ship build (__HUB_FIXTURES__ false) holds no fixture module. The hooks below call it only
// in a fixture build (a build constant, so the hook order never changes within one build); live, its answer was
// never used (fixture queries fail at once there: no fixture loaders).
const fxWipe = __HUB_FIXTURES__ ? pageFixtures('account')! : null;
const WIPE_CHECKS: readonly WipeCheck[] = ['storage', 'databases', 'caches', 'changes', 'asks', 'payments'];

/**
 * Remove all local data (core local-wipe.ts). `warning` is what the confirm shows, read again while `open` (core's
 * change and attempt versions, and a short re-read); `run(shown)` passes exactly the warning the confirm showed. Under
 * the fixture transport the page's fixtures answer both ('wipe-warning', and 'wipeLocal': done, or failed with code
 * TABS, PAYMENTS, CHANGED, or UNCHECKED with data.what; anything else 'failed'), and nothing is signed out or wiped.
 */
export function useLocalWipe(open: boolean) {
  const fixture = fixtureModeActive();
  const fq = __HUB_FIXTURES__ ? fxWipe!.useQuery<LocalWipeWarning | null>('wipe-warning') : null;
  const fm = __HUB_FIXTURES__ ? fxWipe!.useMutation<unknown>('wipeLocal') : null;
  const changes = useChangesVersion();
  const attempts = useAttemptsVersion();
  const [live, setLive] = useState<LocalWipeWarning | null>(() => (fixture ? null : localWipeWarning()));
  useEffect(() => {
    if (fixture || !open) return;
    setLive(localWipeWarning());
    const t = setInterval(() => setLive(localWipeWarning()), WIPE_REREAD_MS);
    return () => clearInterval(t);
  }, [fixture, open, changes, attempts]);
  const warning = fixture ? (fq!.data ?? null) : live;
  const run = useCallback(
    async (shown: LocalWipeWarning): Promise<LocalWipe> => {
      if (!fixture) return removeLocalData(shown);
      try {
        const r = (await fm!.mutateAsync(undefined)) as { outcome?: unknown; code?: unknown; data?: { what?: unknown } };
        const what = r.data && Array.isArray(r.data.what) ? (r.data.what as unknown[]) : null;
        if (r.outcome === 'done') return { kind: 'started' };
        if (r.code === 'TABS') return { kind: 'tabs' };
        if (r.code === 'PAYMENTS') return { kind: 'payments' };
        if (r.code === 'CHANGED') return { kind: 'changed' };
        if (r.code === 'UNCHECKED' && what) return { kind: 'unchecked', what: WIPE_CHECKS.filter((c) => what.includes(c)) };
        return { kind: 'failed' };
      } catch {
        return { kind: 'failed' };
      }
    },
    [fixture, fm],
  );
  return { warning, run, reread: () => (fixture ? void fq!.refetch() : setLive(localWipeWarning())) };
}
