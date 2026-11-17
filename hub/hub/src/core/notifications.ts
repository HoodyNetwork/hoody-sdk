// notifications.ts: the account-notification summary poller and the bounded unread read behind the browser alerts.
//
// Contract, in plain words:
//   - One question on a timer: "is there anything new?" GET /notifications/summary (base host) answers a count and a
//     position; the list is never polled. notificationSummary() is the last answer for the shown account, or null;
//     onNotificationSummary(l) tells l on every change; refreshNotificationSummary() polls now (still under backoff).
//     The poller starts when the first listener subscribes or someone reads the summary, for the shown account.
//   - Four cost bounds: a hidden tab sends nothing; one shared "attempt" clock per account in
//     localStorage, so N tabs cost one poll per period (any visible tab polls when it is due: no leader); the period is
//     the server's poll_interval_seconds, clamped to 1 min..1 h (default 5 min); failures back off exponentially in
//     30 s ticks (5xx, 429, network, a malformed answer: up to 20 ticks; 404, a deploy skew: 20 ticks at once; 401,
//     after the session's own refresh: up to 10 ticks, then retried there so it heals). Any other 4xx stops it.
//   - Account namespacing is a security property: keys are hub_notif:<uid>:summary / :attempt (registered, purged at
//     sign-out), the cached summary names its own uid and is re-checked on read; another account's leftovers are
//     removed at start. Each poll is bound to the shown account (api() with a captured ctx): when storage names
//     another session, nothing is sent or written and the poller stops. An account change clears the painted
//     summary at once; sign-out (teardown) stops it and forgets it. A realm switch does not touch it. A token
//     (shared-access) session keeps it inert, and a call refused before sending stops it (never retried on a timer).
//   - The writing tab paints from its own answer; other tabs repaint from the storage event; a new tab hydrates from
//     the cache synchronously. Visibility and a bfcache restore check at once (not forced).
//   - noteNotificationsRead(n) / noteAllNotificationsRead() apply a read the user just made (this tab and, through the
//     cache, every tab) and poll again; an answer issued before that read is dropped, never painted over it.
//   - readUnreadSince(older, ctx) reads unread notices newest first, 20 a page, until older(row) is true (every row
//     after it is older) or 5 pages; `capped` says it stopped at the limit with unread notices left. A dead ctx is
//     'stale' (nothing to show), a failed read 'error'. It touches no poller state.
import { api, type HubError } from './api';
import { hostEnv, localStore, registrationGroup } from './host-env';
import { alive, capture, shownId, subscribe, tokenSession, type Ctx } from './ctx';
import { onTeardown } from './realm';
import { defineRoute } from './routes';
import { storageEntry } from './session';
import { stringOrEmpty as str } from './shape';

export interface NotificationSummary {
  readonly uid: string;
  readonly unread_count: number;
  readonly is_capped: boolean;
  readonly unread_cap: number | null;
  readonly latest_id: string | null;
  readonly latest_created_at: string | null;
}

export type NoticeSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
export type NoticeType = 'MAINTENANCE' | 'ANNOUNCEMENT' | 'STATUS_UPDATE' | 'BILLING';
export interface NotificationRow {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly severity: NoticeSeverity;
  readonly type?: NoticeType;
  /** ISO time, or null. */
  readonly at: string | null;
  readonly read: boolean;
}
export type UnreadSince =
  | { readonly state: 'ok'; readonly rows: readonly NotificationRow[]; readonly total: number; readonly capped: boolean }
  | { readonly state: 'stale' | 'error'; readonly rows: readonly NotificationRow[]; readonly capped: false };

interface SummaryWire { unread_count?: unknown; is_capped?: unknown; unread_cap?: unknown; latest_id?: unknown; latest_created_at?: unknown; poll_interval_seconds?: unknown }
export const notificationSummaryRoute = defineRoute<{ data?: SummaryWire }>({ method: 'GET', path: '/notifications/summary', scope: 'base' });
export const notificationListRoute = defineRoute<{ data?: unknown[]; pagination?: { total?: unknown; totalPages?: unknown } }>({
  method: 'GET', path: '/notifications', scope: 'base', query: ['unread_only', 'read_only', 'limit', 'page'],
});

const PREFIX = 'hub_notif:';
export const NOTIFY_TICK_MS = 30_000;
const DEFAULT_PERIOD_MS = 300_000, MIN_PERIOD_MS = 60_000, MAX_PERIOD_MS = 3_600_000;
const MAX_BACKOFF_TICKS = 20, AUTH_MAX_BACKOFF_TICKS = 10;
const REQUEST_TIMEOUT_MS = 20_000;
export const SINCE_SIZE = 20, SINCE_PAGES = 5;

// ---- state ----
let uid: string | null = null;
let summary: NotificationSummary | null = null;
let periodMs = DEFAULT_PERIOD_MS;
let timer: ReturnType<typeof setInterval> | null = null;
let stopped = false;
let inFlight = false;
let backoffTicks = 0, backoffLevel = 0;
let pendingRefresh = false;
let ackRevision = 0;
let generation = 0;
let wired = false;
// Armed by the first public call; a test reset or a sign-out disarms it, so following the identity starts nothing.
let armed = false;
const listeners = new Set<(s: NotificationSummary | null) => void>();

const keyFor = (kind: 'summary' | 'attempt'): string | null => (uid ? PREFIX + uid + ':' + kind : null);
function lsGet(k: string): string | null { try { return localStore().getItem(k); } catch { return null; } }
function lsSet(k: string, v: string): void {
  if (!storageEntry('local', k)) return; // never an unregistered key
  try { localStore().setItem(k, v); } catch { /* storage unavailable: per-tab polling */ }
}
const clampPeriod = (s: unknown): number | null => (typeof s === 'number' && Number.isFinite(s) && s > 0 ? Math.min(MAX_PERIOD_MS, Math.max(MIN_PERIOD_MS, s * 1000)) : null);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function fromWire(d: SummaryWire, owner: string): NotificationSummary | null {
  if (typeof d.unread_count !== 'number' || !Number.isFinite(d.unread_count)) return null;
  return Object.freeze({
    uid: owner,
    unread_count: Math.max(0, Math.floor(d.unread_count)),
    is_capped: d.is_capped === true,
    unread_cap: typeof d.unread_cap === 'number' && Number.isFinite(d.unread_cap) ? d.unread_cap : null,
    latest_id: strOrNull(d.latest_id),
    latest_created_at: strOrNull(d.latest_created_at),
  });
}

function readCache(): NotificationSummary | null {
  const k = keyFor('summary');
  if (!k || !uid) return null;
  try {
    const p = JSON.parse(lsGet(k) || 'null') as (SummaryWire & { user_id?: unknown }) | null;
    if (!p || typeof p !== 'object' || p.user_id !== uid) return null; // names its own owner
    const s = fromWire(p, uid);
    if (!s) return null;
    const per = clampPeriod(p.poll_interval_seconds);
    if (per) periodMs = per;
    return s;
  } catch { return null; }
}
function writeCache(s: NotificationSummary): void {
  const k = keyFor('summary');
  if (!k) return;
  lsSet(k, JSON.stringify({
    user_id: s.uid, unread_count: s.unread_count, is_capped: s.is_capped, unread_cap: s.unread_cap,
    latest_id: s.latest_id, latest_created_at: s.latest_created_at,
    poll_interval_seconds: Math.round(periodMs / 1000), fetched_at: Date.now(),
  }));
}
function lastAttempt(): number {
  const k = keyFor('attempt');
  if (!k) return 0;
  const n = parseInt(lsGet(k) || '0', 10);
  if (!Number.isFinite(n) || n < 0 || n > Date.now() + MAX_PERIOD_MS) return 0; // a future stamp is corrupt
  return n;
}
function noteAttempt(): void { const k = keyFor('attempt'); if (k) lsSet(k, String(Date.now())); }

function setSummary(s: NotificationSummary | null): void {
  summary = s;
  for (const l of [...listeners]) { try { l(summary); } catch { /* the listener's own */ } }
}

function transient(): void { backoffLevel = Math.min(MAX_BACKOFF_TICKS, backoffLevel ? backoffLevel * 2 : 1); backoffTicks = backoffLevel; }
function authRefused(): void { backoffLevel = Math.min(AUTH_MAX_BACKOFF_TICKS, backoffLevel ? backoffLevel * 2 : 1); backoffTicks = backoffLevel; }

// ---- poll ----
function ownCtx(): Ctx | null {
  const ctx = capture(null);
  return uid && ctx.account === uid && alive(ctx) ? ctx : null;
}

function poll(): void {
  if (stopped || inFlight || !uid) return;
  const ctx = ownCtx();
  if (!ctx) { stop(); return; }
  inFlight = true;
  noteAttempt();
  const gen = generation, issuedAt = ackRevision, owner = uid;
  const stale = () => gen !== generation || stopped;
  api(notificationSummaryRoute, { ctx, timeoutMs: REQUEST_TIMEOUT_MS }).then((r) => {
    if (stale()) return;
    if (!alive(ctx)) { if (shownId() !== owner) stop(); return; } // storage changed hands, or a realm switch mid-flight
    const s = r && r.data && typeof r.data === 'object' ? fromWire(r.data, owner) : null;
    if (!s) { transient(); return; }
    backoffTicks = 0; backoffLevel = 0;
    if (issuedAt !== ackRevision) return; // a read the user made after this was issued wins
    const per = clampPeriod(r.data && r.data.poll_interval_seconds);
    if (per) periodMs = per;
    writeCache(s);
    setSummary(s);
  }, (e: unknown) => {
    if (stale()) return;
    const x = (e || {}) as HubError;
    if (x.cancelled || !alive(ctx)) { if (shownId() !== owner) stop(); return; }
    // A refresh raced by another tab of this same session (it rotated the token; this page's session still holds, as
    // alive(ctx) just said): a failed poll, not a refusal. A real account or session change took the branch above.
    if (x.superseded) { transient(); return; }
    // The token refresh reached no verdict (the API or the network is down; the session is kept): it also sent
    // nothing, but it is an outage, not a refusal, so it backs off like a failed poll.
    if (x.code === 'REFRESH_UNAVAILABLE') { transient(); return; }
    // Refused before sending (not allowed here): never retried on a timer. The call's TIMEOUT bound reached while the
    // token refresh ran also sent nothing, but it is a slow network, not a refusal: it backs off below like a failed poll.
    if (x.notSent && x.code !== 'TIMEOUT') { stopped = true; return; }
    const st = typeof x.status === 'number' ? x.status : 0;
    if (st === 401) authRefused();
    else if (st === 404) { backoffLevel = MAX_BACKOFF_TICKS; backoffTicks = MAX_BACKOFF_TICKS; }
    else if (st === 0 || st === 429 || st >= 500) transient();
    else stopped = true; // another 4xx (a 403 from a permission change): terminal
  }).finally(() => {
    if (gen !== generation) return; // start/stop already reset the latch
    inFlight = false;
    if (pendingRefresh && !stopped) { pendingRefresh = false; tick(true); }
  });
}

function hidden(): boolean { try { return !hostEnv().visible(); } catch { return false; } }

function tick(force: boolean): void {
  if (stopped || !uid || hidden()) return;
  if (backoffTicks > 0) { backoffTicks--; return; }
  if (!force && Date.now() - lastAttempt() < periodMs) return;
  poll();
}

function schedule(): void {
  if (timer) clearInterval(timer);
  timer = setInterval(() => { tick(false); }, NOTIFY_TICK_MS);
}

function cleanupOrphans(current: string): void {
  try {
    const rm: string[] = [];
    for (let i = 0; i < localStore().length; i++) {
      const k = localStore().key(i);
      if (!k || k.indexOf(PREFIX) !== 0) continue;
      const rest = k.slice(PREFIX.length), sep = rest.indexOf(':');
      if (sep < 0 || rest.slice(0, sep) !== current) rm.push(k);
    }
    for (const k of rm) { try { localStore().removeItem(k); } catch { /* storage unavailable */ } }
  } catch { /* storage unavailable */ }
}

function start(next: string): void {
  if (uid === next && timer && !stopped) return;
  const wasStopped = stopped;
  const switched = uid !== null && uid !== next;
  uid = next;
  stopped = false;
  generation++;
  backoffTicks = 0; backoffLevel = 0;
  ackRevision++;
  inFlight = false;
  pendingRefresh = false;
  if (switched || summary?.uid !== next) { periodMs = DEFAULT_PERIOD_MS; if (summary) setSummary(null); }
  cleanupOrphans(next);
  const cached = readCache();
  if (cached) setSummary(cached);
  tick(wasStopped);
  schedule();
}

function stop(): void {
  stopped = true;
  pendingRefresh = false;
  generation++;
  inFlight = false;
  if (timer) { clearInterval(timer); timer = null; }
}

function forget(): void {
  stop();
  uid = null;
  periodMs = DEFAULT_PERIOD_MS;
  if (summary) setSummary(null);
}

// Follows the shown account: a new account restarts (painted count cleared at once), none stops and forgets.
function follow(): void {
  const id = shownId();
  // A shared-access (token) session has no account notifications: inert, no poll, no cache read or write.
  if (!id || tokenSession()) { if (uid) forget(); return; }
  if (id !== uid) start(id);
}

function wire(): void {
  if (!armed) { armed = true; if (wired) follow(); }
  if (wired) return;
  wired = true;
  subscribe(() => { if (armed && uid !== shownId()) follow(); });
  onTeardown((reason) => { if (reason !== 'switch') { armed = false; forget(); } });
  try {
    registrationGroup(() => {
      hostEnv().onVisibilityChange(() => { if (!hidden()) tick(false); });
      hostEnv().onExternalChange((_area, key) => {
        if (!uid) return;
        if ((key === 'access_token' || key === null) && !stopped && !ownCtx()) { stop(); return; }
        if (key !== keyFor('summary')) return;
        const c = readCache();
        if (c) setSummary(c);
      });
      hostEnv().onLifecycle('pageshow', (e) => {
        if (e.persisted && !stopped && uid) { const c = readCache(); if (c) setSummary(c); tick(false); schedule(); }
      });
    }, () => { /* no document: tests without a DOM */ });
  } catch { /* no document: tests without a DOM */ }
  follow();
}

// ---- public ----

/** The last summary for the shown account, or null (starts the poller). */
export function notificationSummary(): NotificationSummary | null {
  wire();
  return summary && summary.uid === shownId() ? summary : null;
}

/** l(summary) on every change; returns the unsubscribe. Starts the poller. */
export function onNotificationSummary(l: (s: NotificationSummary | null) => void): () => void {
  listeners.add(l);
  wire();
  return () => { listeners.delete(l); };
}

/** Poll now (backoff still applies). One in flight: poll again when it settles (its answer predates the ask). */
export function refreshNotificationSummary(): void {
  wire();
  // A poller that stopped terminally (a 4xx, storage changed hands) restarts on an explicit ask for the same account.
  if (stopped && uid && shownId() === uid && !tokenSession()) { start(uid); return; }
  if (inFlight) { pendingRefresh = true; return; }
  tick(true);
}

/** The user just read n notices: lower the count here and in every tab, then poll. */
export function noteNotificationsRead(n: number): void {
  ackRevision++;
  if (summary) {
    const next = Object.freeze({ ...summary, unread_count: Math.max(0, summary.unread_count - (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0)) });
    writeCache(next);
    setSummary(next);
  }
  refreshNotificationSummary();
}

/** The user marked every notice read. */
export function noteAllNotificationsRead(): void {
  ackRevision++;
  if (summary) {
    const next = Object.freeze({ ...summary, unread_count: 0, is_capped: false });
    writeCache(next);
    setSummary(next);
  }
  refreshNotificationSummary();
}

// ---- rows and the bounded unread read ----
const SEV = new Set(['INFO', 'SUCCESS', 'WARNING', 'ERROR']);
const TYPES = new Set(['MAINTENANCE', 'ANNOUNCEMENT', 'STATUS_UPDATE', 'BILLING']);

/** One notice as the Hub shows it ; unknown severities read as INFO. */
export function notificationRow(n: unknown): NotificationRow {
  const x = (n && typeof n === 'object' ? n : {}) as Record<string, unknown>;
  const type = typeof x.type === 'string' && TYPES.has(x.type) ? (x.type as NoticeType) : undefined;
  return Object.freeze({
    id: str(x.id), title: str(x.title), message: str(x.message),
    severity: (typeof x.severity === 'string' && SEV.has(x.severity) ? x.severity : 'INFO') as NoticeSeverity,
    ...(type ? { type } : {}),
    at: str(x.created_at) || null,
    read: x.is_read === true,
  });
}

/** Unread notices newest first until older(row) or SINCE_PAGES pages (see the contract). */
export async function readUnreadSince(older: (row: NotificationRow) => boolean, ctx: Ctx): Promise<UnreadSince> {
  if (!alive(ctx) || tokenSession()) return { state: 'stale', rows: [], capped: false };
  const rows: NotificationRow[] = [];
  const ids = new Set<string>();
  let hit = false;
  try {
    for (let p = 1; ; p++) {
      const r = await api(notificationListRoute, { ctx, query: { unread_only: 'true', limit: SINCE_SIZE, page: p } });
      if (!alive(ctx)) return { state: 'stale', rows: [], capped: false };
      const raw = r && Array.isArray(r.data) ? r.data : [];
      for (const n of raw) {
        const x = notificationRow(n);
        if (ids.has(x.id)) continue; // a notice that arrived between pages moves the rest down one place
        ids.add(x.id);
        rows.push(x);
        if (!hit) { try { if (older(x)) hit = true; } catch { /* the caller's own */ } }
      }
      const pg = (r && r.pagination) || {};
      const pages = typeof pg.totalPages === 'number' ? pg.totalPages : 1;
      if (!hit && p < pages && p < SINCE_PAGES && raw.length) continue;
      return { state: 'ok', rows, total: typeof pg.total === 'number' ? pg.total : rows.length, capped: !hit && p < pages };
    }
  } catch (e) {
    if (!alive(ctx) || (e as HubError | null)?.cancelled) return { state: 'stale', rows: [], capped: false };
    return { state: 'error', rows: [], capped: false };
  }
}

/** Stops the poller and forgets everything, listeners too (session disposal, dispose.ts; tests). */
export function resetNotifications(): void {
  armed = false;
  forget();
  stopped = false;
  ackRevision = 0;
  listeners.clear();
}

/** Test seam: the poller's internals. */
export function notificationPollerState() {
  return { uid, periodMs, stopped, inFlight, backoffTicks, backoffLevel, pendingRefresh, ackRevision, armed, timer: timer !== null };
}
