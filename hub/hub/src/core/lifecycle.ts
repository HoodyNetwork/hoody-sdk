// lifecycle.ts: boot, sign-out, another tab's session change, suspension.
//
// Contract:
//   - bootLive() reads the page identity once (never adopted afterwards), restores the realm selection, hooks
//     every purge to the account teardown, watches storage, then asks GET /users/auth/me. A suspended account
//     (is_banned true) boots into 'banned': the shell shows only the suspended screen.
//   - signOutForgetting(account, shown): the shell's warned sign-out. `shown` is
//     the warning's list, signOutHolds(). In one changes.ts forgetAccountChanges turn under the store lock, the
//     account's stored records (both id prefixes: the account's own and ATTEMPT_PREFIX + account) are removed
//     and read back only when every hold stored then is in `shown` ('done', then logout()); a hold the warning
//     did not show (admitted by another tab meanwhile, or swapped for another) removes nothing ('changed': the
//     shell re-reads and warns again); storage refused ('failed') or a removal that could not be read back
//     ('unknown') keeps the page signed in. A send still out, a change's or an attempt's (a shown ref flagged
//     `sending`), keeps its record on 'done' and 'unknown': the shell names those sends in the
//     warning. A hold of a lock the host keeps (attempts.ts setKeptAttemptLocks) is neither shown nor removed.
//     The auth purge itself removes no hold (attempts.ts attemptsAuthPurge drops only this tab's copy).
//   - logout(): first the passcode's lock-only broadcast for the shown account (shared.js postHubLock; every open tab
//     of it locks; the passcode record stays). From the first call no new action starts (alive() is false everywhere). The account is torn
//     down, every change still in flight gets one "may have gone through" notice, the session is ended
//     server-side while its bearer still exists (shared.js endOutgoingSession: bounded, best-effort), then
//     purged through clearAuthTokens (purgeOutgoingSession, reason 'signout'; it removes no stored hold) only while
//     storage still holds this page's session (a session another tab stored since, a token session included, is never
//     purged), and the page leaves for sign-in. A purge that leaves a credential stored keeps the page on the
//     purge-failed panel, whose Try again purges again. With changes in flight the page waits at least 2.5 s so the
//     notice can be read. Preference writes accepted before sign-out (keys kept at sign-out, cryptStore) land
//     before the page leaves, waited for at most 3 s.
//   - signOutWiping(account, unchanged, wipe): "Remove all local data" (local-wipe.ts removeLocalData).
//     The account shown, the stored session (still this page's) and the confirm's warning (`unchanged`,
//     read now) are checked first: a sign-out already running or no account is 'failed', another account, another
//     session or a warning grown since is 'changed', and nothing happens. Otherwise logout() runs with `wipe` as its
//     last step: after the purge, before the page leaves. A session another tab stored meanwhile (another account
//     signed in, a token session included) is never purged or wiped: checked before the purge, and again before the
//     wipe, which gets the same check to run in the task of its clear; the page leaves as after any sign-out. A wipe
//     that answers false keeps the page on the purge-failed panel, whose Try again runs the purge and the wipe again; it
//     never leaves with the wipe unfinished. A wipe that answers 'kept' wiped nothing and the page leaves signed out.
//   - forgetHere(): Forget this browser from this page (the passcode's Forgot passcode and terminal path):
//     shared.js forgetBrowser() with `leaving` set first, so the purge hook does not navigate; 'purged' → sign-in
//     (`?error=locked_out` on the terminal path), 'failed' → the page stays.
//   - holdTabLock (tab-lock.ts): initLive takes this tab's shared Hub tab lock, which Remove all local data counts.
//   - Another tab signs out, or in as someone else (a same-user sign-in with a new sid too): full teardown,
//     then leave, to sign-in when no session is left, else reload as the new session. A refresh (same sid)
//     changes nothing.
//   - A Hoody API 403 ACCOUNT_BANNED for the shown account turns the page into the suspended screen in place,
//     once: teardown ('suspended'), identity.banned, a generation bump; no reload, no loop.
//   - A 401 at boot: superseded → reload as the new session; otherwise clearAuthTokens (reason 'expiry': the
//     account's unresolved holds stay) and go to sign-in.
//   - Token sessions (shared access): the routing is in api.ts, the check in token.ts. bootLive() runs the token
//     boot: 'ready' once the token and the owner's identity check out, 'offline' (the panel: Retry reloads,
//     Leave ends the session) when the check could not answer, 'leaving' when it ended. The termination
//     table (endTokenSession): ended, realm, unavailable, invalid, leave → purge (reason 'signout' for leave,
//     'expiry' for the rest) while storage holds this page's identity, then sign-in (with the reason; none for
//     leave); network, offline → the panel in place, nothing purged; superseded → reload; a purge that fails →
//     the purge-failed panel with no navigation, whose Retry ends again with the same reason.
import { api, notifyPending, openMutations, setBannedHandler, setTokenRefusal, type HubError } from './api';
import { attemptHoldRefs, attemptHoldRefsIn, attemptKept, dropAttemptIds } from './attempts';
import type { HoldRef } from './change-store';
import { changeHoldRefs, forgetAccountChanges } from './changes';
import { bump, identity, initCore, loggingOut, page, setIdentity, snapshot, startLoggingOut, tokenSession } from './ctx';
import { clearSignOutPlaintext, cryptWritesSettled, signOutAsked } from './cryptStore';
import { endAccount, hookPurge, initRealm, load, pin, wipe } from './realm';
import { defineRoute } from './routes';
import { dropScriptAsks, type ScriptAsk, type ScriptAskWrite } from './script-asks';
import { holdTabLock, resetTabLock } from './tab-lock';
import { hostEnv, localStore, sessionStore } from './host-env';
import { isStandalone } from './origin';
import { holds, onBeforeAuthPurge, readPage, sessionUid, shared, tokenRealmOf } from './session';
import { bootToken, tokenRefused, type TokenEnd, type TokenNotice } from './token';

export const meRoute = defineRoute<{ data?: { id?: unknown; email?: string; username?: string; alias?: unknown; onboarding?: unknown; is_banned?: unknown } }>({ method: 'GET', path: '/users/auth/me', scope: 'base' });

/**
 * A later /users/auth/me answer a page read (the account page's profile, e.g. the read that proves a rename) carries
 * the account's display name: the shown identity takes it, so the greeting and the account menu follow without a
 * reload. Only for the account shown (another account's answer changes nothing); a blank name is none (the username
 * shows again). Display only: nothing reads the alias to decide.
 */
export function noteShownAlias(accountId: string, alias: unknown): void {
  const id = identity();
  if (!id || !id.id || id.id !== accountId) return;
  const next = typeof alias === 'string' ? alias.trim() : '';
  if ((id.alias ?? '') === next) return;
  const { alias: _was, ...rest } = id;
  setIdentity(next ? { ...rest, alias: next } : rest);
}

export interface LifecycleConfig {
  /** Leave this page (default: location.replace). */
  navigate(url: string): void;
  /** The sign-in page. */
  loginPath: string;
  /** This page again (a reload as the session storage now holds). */
  herePath(): string;
}

let cfg: LifecycleConfig = {
  navigate: (u) => { window.location.replace(u); },
  loginPath: '/auth/login',
  herePath: () => window.location.pathname + window.location.search,
};

export function configureLifecycle(c: Partial<LifecycleConfig>): void {
  cfg = { ...cfg, ...c };
}

export type TokenPanel =
  | { panel: 'offline' | 'network'; retryAfterS?: number }
  | { panel: 'purgeFailed'; again: TokenEnd | 'leave' };
export type LifecycleEvent =
  | { kind: 'suspended' }
  | { kind: 'leaving'; to: 'login' | 'here' }
  | { kind: 'purge-failed' }
  | ({ kind: 'token-panel' } & TokenPanel)
  | ({ kind: 'token-notice' } & TokenNotice);
/** A listener returns true (exactly) when it showed the event (the shell's toast handler: a token notice it toasted); emit
 *  answers whether any did, so a token refusal is marked said only when it was (token.ts tokenSaid). */
const listeners = new Set<(e: LifecycleEvent) => unknown>();
export function onLifecycle(l: (e: LifecycleEvent) => unknown): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
function emit(e: LifecycleEvent): boolean {
  let shown = false;
  for (const l of [...listeners]) { try { if (l(e) === true) shown = true; } catch { /* the listener's own */ } }
  return shown;
}

/** The one is_banned check: true / false from an answer, null when there is nothing to go by. */
export function bannedOf(me: { is_banned?: unknown } | null | undefined): boolean | null {
  const b = me && me.is_banned;
  return b === true || b === false ? b : null;
}

let leaving = false;
function leave(to: 'login' | 'here', query = ''): void {
  emit({ kind: 'leaving', to });
  // The standalone Hub has no sign-in page beside it: it loads this page again, and its own first screen asks.
  cfg.navigate(to === 'login' && !isStandalone() ? cfg.loginPath + query : cfg.herePath());
}

/** Another tab changed the session: teardown, then leave (sign-in when nothing is left, else reload). */
export function superseded(): void {
  if (leaving) return;
  leaving = true;
  const left = !!sessionUid(null);
  endAccount(left ? 'account' : 'signout');
  leave(left ? 'here' : 'login');
}

function handle401(): void {
  if (shared().authSessionSuperseded()) { leaving = true; leave('here'); return; }
  // leaving first: the purge below runs purged(), which must not navigate a second time.
  leaving = true;
  // An expired session, never a sign-out: the account's unresolved holds stay for its next sign-in.
  shared().clearAuthTokens({ reason: 'expiry' });
  leave('login');
}

// Any purge this page did not start itself (a refresh that failed after boot, on any call): the account
// was torn down (realm.ts hookPurge), so the page goes to sign-in. Its own sign-out (loggingOut), a page
// already leaving and a token session (endTokenSession owns its exits) navigate on their own. The
// navigation waits a microtask, so the purge that called this finishes first.
function purged(): void {
  if (leaving || loggingOut() || tokenSession()) return;
  leaving = true;
  queueMicrotask(() => { leave('login'); });
}
let purgeFollowed = false;

/** The shown account is suspended (a Hoody API 403 ACCOUNT_BANNED): the suspended screen, in place, once. */
export function suspend(): void {
  const id = identity();
  if (tokenSession() || !id || id.banned) return;
  setIdentity({ ...id, banned: true });
  wipe('suspended');
  bump('suspended');
  emit({ kind: 'suspended' });
}

let watching = false;
// Counts session disposals (resetLifecycle). A sign-out started before one is over: its delayed steps check this first.
let sessionEpoch = 0;
let logoutTimer: ReturnType<typeof setTimeout> | null = null;
function onStorage(key: string | null): void {
  const pg = page();
  if (!pg || loggingOut()) return;
  if (pg.kind === 'token') {
    if ((key === null || key === 'hub_token_session_v1' || key === 'access_token' || key === 'refresh_token') && !holds(pg)) endTokenSession('superseded');
    return;
  }
  if ((key !== 'access_token' && key !== 'refresh_token' && key !== null) || holds(pg)) return;
  superseded();
}

export type BootResult =
  | { state: 'ready'; realms: Promise<readonly string[] | null> }
  | { state: 'banned' }
  | ({ state: 'offline' } & Omit<Extract<TokenPanel, { panel: 'offline' | 'network' }>, 'panel'>)
  | ({ state: 'purge-failed' } & Omit<Extract<TokenPanel, { panel: 'purgeFailed' }>, 'panel'>)
  | { state: 'failed'; error: HubError }
  | { state: 'leaving' };

/** First boot: identity, realm, watchers. */
export function initLive(): void {
  hookPurge();
  if (!purgeFollowed) { purgeFollowed = true; onBeforeAuthPurge(purged); }
  const pg = readPage();
  const tr = tokenRealmOf(pg);
  initCore({ page: pg, tokenRealm: tr });
  if (pg && pg.kind === 'token' && tr) pin(tr);
  initRealm();
  setBannedHandler(suspend);
  setTokenRefusal(pg && pg.kind === 'token' ? tokenRefused : null);
  if (!watching) { watching = true; hostEnv().onExternalChange((_area, key) => { onStorage(key); }); }
  holdTabLock();
}

/** The boot's realm list read. Nobody has to await it, so its failure is marked handled here; a caller that awaits
 *  the promise still sees the rejection. */
function bootRealms(): Promise<readonly string[] | null> {
  const p = load();
  p.catch(() => {});
  return p;
}

/** Asks who this page shows. Call initLive() once first; call again for the boot card's Try again. */
export async function bootLive(): Promise<BootResult> {
  if (tokenSession()) return bootTokenSession();
  try {
    const me = await api(meRoute);
    const d = (me && me.data) || {};
    const banned = bannedOf(d) === true;
    // The display name the account chose (alias), when it has one: the greeting and the account menu use it first.
    const alias = typeof d.alias === 'string' ? d.alias.trim() : '';
    setIdentity({ id: d.id != null ? String(d.id) : null, email: d.email, username: d.username, ...(alias ? { alias } : {}), onboarding: d.onboarding, banned });
    if (banned) return { state: 'banned' };
    return { state: 'ready', realms: bootRealms() };
  } catch (err) {
    const e = err as HubError;
    const pg = page();
    // Another session replaced this page's before the identity arrived: leave for it, never purge it.
    if (leaving || (pg && !holds(pg))) { superseded(); return { state: 'leaving' }; }
    if (e && e.status === 401) { handle401(); return { state: 'leaving' }; }
    return { state: 'failed', error: e };
  }
}

// ---- token sessions ----
let tokenEnding = false;
// After a failed purge: the purge-failed panel's Try again (logout() again) purges once more, with the same
// reason (a token session's end, or the sign-out). The sign-out latch (loggingOut) stays: the account was already
// torn down, so nothing comes alive again.
let purgeAgain: (() => void) | null = null;
let bootSettle: ((r: BootResult) => void) | null = null;
function settleBoot(r: BootResult): boolean {
  const f = bootSettle;
  bootSettle = null;
  if (f) f(r);
  return !!f;
}
function tokenPanel(p: TokenPanel): void {
  const r: BootResult = p.panel === 'purgeFailed' ? { state: 'purge-failed', again: p.again } : { state: 'offline', retryAfterS: p.retryAfterS };
  if (!settleBoot(r)) emit({ kind: 'token-panel', ...p });
}

/** Ends this token session (the termination table in the contract). The panels' Leave is endTokenSession('leave'). */
export function endTokenSession(reason: TokenEnd | 'leave' | 'offline'): void {
  if (reason === 'network' || reason === 'offline') { tokenPanel({ panel: reason }); return; }
  if (tokenEnding) return;
  tokenEnding = true;
  startLoggingOut();
  endAccount(reason === 'superseded' ? 'account' : 'logout');
  let res: 'purged' | 'kept' | 'failed' = 'kept';
  // Only the person's Leave is a sign-out; every other end is the session expiring (unresolved holds stay).
  if (reason !== 'superseded') { try { res = shared().purgeOutgoingSession(page(), { reason: reason === 'leave' ? 'signout' : 'expiry' }); } catch { res = 'failed'; } }
  // The purge-failed panel's Try again (the shell calls logout(); the sign-out latch is set) ends again with the
  // same reason, never as a sign-out.
  if (res === 'failed') { tokenEnding = false; purgeAgain = () => endTokenSession(reason); tokenPanel({ panel: 'purgeFailed', again: reason }); return; }
  leaving = true;
  settleBoot({ state: 'leaving' });
  if (res === 'kept') leave('here');
  else leave('login', reason === 'leave' ? '' : '?error=shared_' + reason);
}

function bootTokenSession(): Promise<BootResult> {
  const pg = page();
  if (!pg) return Promise.resolve({ state: 'leaving' });
  return new Promise<BootResult>((resolve) => {
    bootSettle = resolve;
    void bootToken({
      page: pg,
      realm: tokenRealmOf(pg) || 'all',
      end: (r) => endTokenSession(r),
      panel: (kind, retryAfterS) => tokenPanel({ panel: kind, retryAfterS }),
      notice: (n) => emit({ kind: 'token-notice', ...n }),
      me: () => api(meRoute).then((me) => {
        const d = (me && me.data) || {};
        return { id: d.id != null ? String(d.id) : '', username: typeof d.username === 'string' ? d.username : '' };
      }, (e: unknown) => ({ failed: e as HubError })),
      started: (id) => {
        setIdentity({ id: id.id, username: id.username, banned: false });
        settleBoot({ state: 'ready', realms: bootRealms() });
      },
      shown: () => identity()?.username || '',
    }).catch(() => { tokenPanel({ panel: 'offline' }); });
  });
}

/** Forget this browser from this page: the lock screen's Forgot passcode and the passcode's
 *  terminal path. `leaving` is set BEFORE shared.js forgetBrowser() runs, so the purge hook (purged()) does not
 *  navigate; the page leaves only after the answer: 'purged' → sign-in (`?error=locked_out` on the terminal path);
 *  'failed' → it stays (the lock screen says so and offers Try again). A shared.js without forgetBrowser answers
 *  'failed' and nothing is removed. */
export function forgetHere(o: { terminal?: boolean } = {}): 'purged' | 'failed' {
  const was = leaving;
  leaving = true;
  let r: 'purged' | 'failed' = 'failed';
  try { const f = shared().forgetBrowser; if (f) r = f() === 'purged' ? 'purged' : 'failed'; } catch { r = 'failed'; }
  if (r !== 'purged') { leaving = was; return 'failed'; }
  leave('login', o.terminal ? '?error=locked_out' : '');
  return 'purged';
}

/** Sign out of this browser (see the contract). */

export function logout(o: { minWaitMs?: number; endMs?: number; writesMs?: number; wipe?: (otherSession: () => boolean) => Promise<boolean | 'kept'> } = {}): void {
  if (loggingOut()) { const again = purgeAgain; purgeAgain = null; if (again) again(); return; }
  // The passcode's lock-only broadcast first: every open tab of the account locks, whatever the
  // sign-out below does. Best effort; the passcode record is not touched.
  const shown = page();
  if (shown && shown.kind === 'account') { try { shared().postHubLock?.(shown.uid); } catch { /* best effort */ } }
  signOutAsked(); // first: startLoggingOut() already ends the account here (the person asked; hub-shell confirmed)
  startLoggingOut();
  const pg = page();
  const s = shared();
  // The page's session is outgoing while storage holds it, or only its refresh token (what a failed purge left), or
  // storage cannot be read now (finish then decides: unreadable there is a failed purge, never a quiet leave).
  let unreadable = false;
  try { unreadable = !storageReadable(); } catch { unreadable = true; }
  const outgoing = tokenSession() || unreadable || s.holdsSession(pg) || !!s.holdsRemnantOf?.(pg) ? pg : null;
  const open = openMutations();
  endAccount('logout');
  for (const c of open) notifyPending(c, true);
  let done = false, ended = false, minWait = !open.length, written = false;
  const mine = sessionEpoch; // a dispose (resetLifecycle) ends this sign-out: nothing below purges, wipes, leaves or emits after it
  const finish = () => {
    if (mine !== sessionEpoch || done || !minWait || !ended || !written) return;
    done = true;
    // Remove all local data: a session another tab stored meanwhile is never purged or wiped; checked before the purge.
    // Storage that cannot be read counts as another session (storedSession() answers null for it, as for none).
    const other = (): boolean => { if (mine !== sessionEpoch) return true; try { return !storageReadable() || (s.storedSession() !== null && !s.holdsSession(outgoing)); } catch { return true; } };
    // Storage that cannot be read cannot prove the session is gone, for a plain sign-out and Remove all local data
    // alike: the purge-failed panel (its Try again runs this again), never a leave. Checked before the wipe's
    // other-session rule, which would read unreadable storage as another session and leave without purging.
    const unreadableNow = (): boolean => { try { return !storageReadable(); } catch { return true; } };
    if (unreadableNow()) { purgeAgain = () => { done = false; finish(); }; emit({ kind: 'purge-failed' }); return; }
    // Remove all local data: a readable session another tab stored meanwhile is left alone; the page leaves.
    if (o.wipe && other()) { leave('login'); return; }
    // With no outgoing session (this page's was already replaced or ended) the purge would remove whatever another tab
    // stores, a fresh sign-in or a token session included: nothing is purged, the page just leaves.
    if (!outgoing) { leave('login'); return; }
    let res: 'purged' | 'kept' | 'failed' = 'failed';
    try { res = s.purgeOutgoingSession(outgoing, { reason: 'signout' }); } catch { res = 'failed'; }
    // A credential still stored after the purge: the page stays (the purge-failed panel, whose Try again runs this
    // again), account or token session alike; it never goes to sign-in still signed in.
    if (res === 'failed') { purgeAgain = () => { done = false; finish(); }; emit({ kind: 'purge-failed' }); return; }
    // The browser refused to remove the account's unsealed plaintext: as a failed purge (the same panel, whose Try
    // again runs this again); the page does not leave while it is at rest.
    if (!clearSignOutPlaintext()) { purgeAgain = () => { done = false; finish(); }; emit({ kind: 'purge-failed' }); return; }
    // Remove all local data: the wipe is the last step; the page leaves only once it answered true, or 'kept' (it wiped
    // nothing). The wipe gets the session check to run again in the task of its clear.
    if (o.wipe) {
      const wipe = o.wipe;
      if (unreadableNow()) { purgeAgain = () => { done = false; finish(); }; emit({ kind: 'purge-failed' }); return; }
      if (other()) { leave('login'); return; }
      void Promise.resolve().then(() => (mine !== sessionEpoch ? false : wipe(other))).catch(() => false).then((ok) => {
        if (mine !== sessionEpoch) return;
        // 'kept' (the wipe found another session) leaves only while storage reads: unreadable kept nothing provable.
        if (ok === true || (ok === 'kept' && !unreadableNow())) { leave('login'); return; }
        purgeAgain = () => { done = false; finish(); };
        emit({ kind: 'purge-failed' });
      });
      return;
    }
    leave('login');
  };
  // A pending notice needs time to be read before the page leaves.
  if (!minWait) logoutTimer = setTimeout(() => { logoutTimer = null; minWait = true; finish(); }, o.minWaitMs ?? 2500);
  s.endOutgoingSession(outgoing, o.endMs).then(() => { ended = true; finish(); }, () => { ended = true; finish(); });
  // Preference writes accepted before sign-out (keys kept at sign-out) land before the page leaves, bounded.
  void cryptWritesSettled(o.writesMs ?? 3000).then(() => { written = true; finish(); });
}

/** The holds the sign-out warning shows and counts (the shown account's): its unresolved changes (changes.ts, the
 *  same set unresolvedChanges() counts) and its attempt holds (attempts.ts, as heldAttempts() lists them, except the
 *  host's kept ones, which no forget drops), each by record id and hold token. The shell counts this list and passes
 *  it back to signOutForgetting unchanged, so the warning and the forget judge one predicate. */
export function signOutHolds(): HoldRef[] {
  return [...changeHoldRefs(), ...attemptHoldRefs()];
}

/** What the warned sign-out did. 'done': the shown holds were forgotten, but sends still out (refs flagged
 *  `sending`: their records stay stored and keep refusing a second send until their answers settle them), and the
 *  sign-out runs (this call starts it, unless one began while the forget waited). 'changed': nothing
 *  was signed out, because what the warning showed no longer matches: a hold it did not show is stored now (nothing
 *  was forgotten), or the account shown is no longer `account` (another tab signed in; when that happened while the
 *  forget ran, the leaving account's shown holds may already be forgotten, as the person confirmed), or `still` (the
 *  caller's check that what the warning showed still covers what runs) answered false: before the forget nothing was
 *  forgotten; right before the sign-out the shown holds are already forgotten, as the person confirmed. Re-read: warn
 *  again, or close when another account shows. 'failed': nothing was signed out
 *  (storage refused or could not be read back, no cross-tab lock with holds stored, or a sign-out already runs when
 *  it is asked);
 *  the caller shows its retryable failure. 'unknown': the removal may have landed and could neither be proven nor
 *  undone (also when a sign-out began while the forget waited: never reported as 'failed'); this tab dropped the
 *  shown holds but sends still out from its memory (as a warned Dismiss would) and this call signed nothing out:
 *  the caller says the changes may already be forgotten and offers sign-out again (the next warning lists what
 *  storage still holds). */
export type SignOutForget = 'done' | 'changed' | 'failed' | 'unknown';

/** A warned sign-out's `still` (optional): the warning still covers what runs from this tab (the shell: no more work
 *  started since the confirm than it named). Absent: covered; a throw: not covered. */
function coveredBy(still: (() => boolean) | undefined): boolean {
  if (!still) return true;
  try { return still() === true; } catch { return false; }
}

/** The warned sign-out (the shell's confirm, after the person agreed to stop tracking the holds the warning listed).
 *  `account` is the account the dialog was opened for, `shown` the warning's signOutHolds() for it. In one step under
 *  the store lock (changes.ts forgetAccountChanges, which judges changes and attempts together with the same
 *  predicates as signOutHolds), the account's stored records are removed only when every hold stored then is in
 *  `shown` (by id and token; a hold being freed counts). Then logout(), whose purge removes no stored hold. Only
 *  'done' signs out. The account shown is checked right before and after the forget: another account is never
 *  signed out here. After the forget the account check comes first ('changed'), then the forget's own verdict. */
export async function signOutForgetting(account: string, shown: readonly HoldRef[], o: { minWaitMs?: number; endMs?: number } = {}, still?: () => boolean, onForgotRefused?: () => void): Promise<SignOutForget> {
  const now = (): string | null => { try { return snapshot().account ?? null; } catch { return null; } };
  const covered = () => coveredBy(still);
  if (!account || !Array.isArray(shown) || leaving || loggingOut()) return 'failed';
  if (now() !== account || !covered()) return 'changed';
  let r: SignOutForget;
  const removed = { removedShown: 0 };
  try { r = await forgetAccountChanges(account, shown, { holdsIn: attemptHoldRefsIn, drop: dropAttemptIds, keeps: attemptKept }, removed); } catch { r = 'failed'; }
  if (now() !== account) return 'changed';
  // A sign-out that began while the forget waited never turns the verdict into 'failed': 'unknown'
  // stays unknown, and 'done' leaves through the sign-out already running instead of starting a second one.
  if (r === 'done' && !leaving && !loggingOut()) {
    // Read in the same step as the sign-out: work that started while the forget waited is asked about first.
    if (!covered()) {
      // The forget already ran ('done'): the shown holds it removed are forgotten, and nobody is signed out. Told
      // only when it removed one (a shown send still out stays stored, so nothing of it is forgotten).
      if (removed.removedShown > 0) { try { onForgotRefused?.(); } catch { /* the caller's own */ } }
      return 'changed';
    }
    logout(o);
  }
  return r;
}

// The keys shared.js reads to tell which session is stored (classifyStoredAuth, storedSession, authUidFromStorage),
// present or not: a read of an absent one that throws makes storedSession() answer null as for no session.
const SESSION_KEYS = ['access_token', 'refresh_token', 'two_factor_token', 'hub_token_session_v1'];
/** Every entry of local and session storage reads, and so does every key the stored session is told by, present
 *  or not (Remove all local data: an unreadable entry may hold a session). */
function storageReadable(): boolean {
  try {
    for (const st of [localStore(), sessionStore()]) {
      for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k !== null) st.getItem(k); }
      for (const k of SESSION_KEYS) st.getItem(k);
    }
    return true;
  } catch {
    return false;
  }
}

/** The stored session is still this page's (another tab neither signed out nor stored another session). */
export function sessionStillOurs(): boolean {
  try {
    const pg = page();
    return !!pg && holds(pg);
  } catch {
    return false;
  }
}

/** What Remove all local data's sign-out did. 'done': the sign-out started, with the wipe as its last step. 'changed':
 *  another account shows, another session is stored, or the warning grew since the confirm (nothing happened).
 *  'failed': no account, a sign-out already runs, or the warning could not be read (nothing happened). */
export type SignOutWipe = 'done' | 'changed' | 'failed';

/** Remove all local data (see the contract): `unchanged` reads the confirm's warning again and says whether it still
 *  covers everything; `wipe` runs after the purge, before the page leaves. */
export function signOutWiping(account: string, unchanged: () => boolean, wipe: (otherSession: () => boolean) => Promise<boolean | 'kept'>, o: { minWaitMs?: number; endMs?: number } = {}): SignOutWipe {
  const now = (): string | null => { try { return snapshot().account ?? null; } catch { return null; } };
  if (!account || leaving || loggingOut()) return 'failed';
  if (now() !== account || !sessionStillOurs()) return 'changed';
  let same: boolean;
  try { same = unchanged(); } catch { return 'failed'; }
  if (!same) return 'changed';
  logout({ ...o, wipe });
  return 'done';
}

/** What the asks drop of a warned sign-out answered: a ScriptAskWrite, or 'not_run' (no account given, or a sign-out
 *  already runs). The drop is one write: every shown ask is removed ('ok') or none is; never a part. */
export type AsksDropped = ScriptAskWrite | 'not_run';

/** The warned sign-out with the script asks its warning showed. First one dropScriptAsks of
 *  `asks` (the warning's readScriptAsks(account)), bound to `account` under the store lock: a session another tab
 *  swapped in meanwhile is never touched ('account_changed', nothing removed). Then signOutForgetting(account,
 *  holds, o, still), whatever the drop answered: a local drop never keeps a person signed in. `result` is that call's
 *  verdict, unchanged. An ask the drop did not remove stays stored under that account id, secret-free, read only by
 *  that account at its next sign-in (C9: no purge drops an ask whose outcome is unknown, a sign-out included). */
export async function signOutForgettingAsks(
  account: string, holds: readonly HoldRef[], asks: readonly ScriptAsk[], o: { minWaitMs?: number; endMs?: number } = {}, still?: () => boolean,
): Promise<{ result: SignOutForget; asksDropped: AsksDropped; forgot?: true }> {
  let asksDropped: AsksDropped = 'not_run';
  // Not covered (`still`, see signOutForgetting): nothing is dropped, and signOutForgetting answers 'changed'.
  if (account && !leaving && !loggingOut() && coveredBy(still)) {
    try { asksDropped = asks.length ? await dropScriptAsks(asks, account) : 'ok'; } catch { asksDropped = 'refused'; }
  }
  // forgot (present only then): the forget removed at least one shown hold from storage, then `still` refused the
  // sign-out ('changed'): those holds are forgotten although the person is still signed in.
  let forgot = false;
  const result = await signOutForgetting(account, holds, o, still, () => { forgot = true; });
  return forgot ? { result, asksDropped, forgot: true } : { result, asksDropped };
}

/** The lifecycle back to its boot state (session disposal, dispose.ts; tests). */
export function resetLifecycle(): void {
  sessionEpoch++;
  if (logoutTimer !== null) { clearTimeout(logoutTimer); logoutTimer = null; }
  leaving = false;
  tokenEnding = false;
  purgeAgain = null;
  purgeFollowed = false;
  bootSettle = null;
  listeners.clear();
  resetTabLock();
}
