// session.ts: the typed adapter over shared.js, the auth pages' one session library.
//
// Contract (shared.js is the only implementation):
//   - shared.js is loaded as a classic script before the Hub bundle. Its globals (storedSession, apiCall,
//     clearAuthTokens, the storage registry...) are read here, typed, and nowhere else in the Hub.
//     Tests and the fixture mode install another implementation with installShared().
//   - The page identity {kind, uid, sid} is read once, when the Hub boots (readPage), and never adopted
//     afterwards: holds(page) is false once storage holds another session, a same-user sign-in with a new
//     sid included (a refresh keeps the sid).
//   - clearAuthTokens() is the only sign-out purge. Every purge first runs the onBeforeAuthPurge hooks, so
//     realm.ts tears the account down before its storage goes.
//   - The bearer only ever goes to this page's API or one of its realm hosts (apiCall's opts.base check);
//     hubApiBase(r) is the one place a realm host is built. API_BASE names the base host; where that host is
//     (this page's origin, or the standalone Hub's chosen Hoody) is shared.js's decision alone (origin.ts).
//   - Framed pages refuse every change and the sensitive reads (framedSensitiveRoute is shared.js's list).

/** The page's session, frozen at boot. `sid` is null only for an account token without one. */
export interface PageIdentity {
  readonly kind: 'account' | 'token';
  readonly uid: string;
  readonly sid: string | null;
}

/** shared.js storedSession(): the session storage holds now. */
export interface StoredSession extends PageIdentity {
  readonly bearer: string;
  /** Token sessions only: the pinned realm ('all' or a 24-hex id). */
  readonly realm?: string;
  readonly owner?: { readonly id: string; readonly username: string };
}

/** apiCall's sixth argument (see shared.js for the full contract). */
export interface ApiCallOpts {
  base?: string;
  owner?: string | null;
  session?: PageIdentity;
  alive?: () => boolean;
  onSend?: () => void;
  timeoutMs?: number;
  /** A call made as nobody (sign-in): no stored bearer is read, attached, refreshed or cleared for it (core/signin.ts). */
  anonymous?: true;
  /** Refuse a redirect (fetch redirect: 'error'): the body (a password, 2FA step token, check secret) never follows one
   *  to another host. A refused redirect rejects like no answer (core/signin.ts). */
  noRedirect?: true;
  /** The If-Match header, sent on the request and on every retry of it (an ifMatch route's value). */
  ifMatch?: string;
  /** If-None-Match: * (create only), sent on the request and on every retry of it (an etagMatch route's ifNoneMatch). */
  ifNoneMatch?: '*';
  /** Called with a success answer's ETag header (null when absent), right before the answer is returned. */
  onEtag?: (etag: string | null) => void;
}

export interface StorageEntry {
  readonly area: 'local' | 'session';
  readonly key?: string;
  readonly prefix?: string;
  readonly purge: boolean;
  readonly advance?: boolean;
  /** Removed only by Forget this browser (shared.js forgetBrowserStorage), never by an auth purge. */
  readonly forget?: boolean;
}

/** What an auth purge passes its hooks (shared.js): why it runs, and the outgoing account read from storage before
 *  anything is removed (the account's session token; for a token session, its owner; null when none is stored).
 *  An older shared.js passes nothing. */
export interface AuthPurgeInfo {
  readonly reason: 'signout' | 'expiry' | 'refresh' | 'cleanup' | 'forget';
  readonly uid: string | null;
}

/** The shared.js functions the Hub uses. Names and semantics are shared.js's own. */
export interface Shared {
  storedSession(): StoredSession | null;
  holdsIdentity(id: PageIdentity): boolean;
  holdsSession(s: PageIdentity | null): boolean;
  /** What an earlier purge left of account session `s`: only its refresh token (shared.js holdsRemnantOf). */
  holdsRemnantOf?(s: PageIdentity | null): boolean;
  sessionTokenUid(token: string | null): string | null;
  sessionTokenSid(token: string | null): string | null;
  apiCall(method: string, path: string, body: unknown, bearer: null | undefined, retried: undefined, opts: ApiCallOpts): Promise<unknown>;
  isFramedPage(): boolean;
  framedSensitiveRoute(method: string, path: string): object | null;
  framedRefusedError(): HubErrorBase;
  supersededAuthError(): HubErrorBase;
  isSupersededAuthError(e: unknown): boolean;
  realmApiDomain(): string;
  /** The purge reason goes to the hooks (shared.js default 'cleanup'). */
  clearAuthTokens(opts?: { reason?: AuthPurgeInfo['reason'] }): void;
  /** Purges while storage holds `s`; the reason (shared.js default 'expiry') goes to the hooks: 'signout' only for the
   *  person's own sign-out or Leave, 'expiry' for every session that ended by itself. */
  purgeOutgoingSession(s: PageIdentity | null, opts?: { reason?: 'signout' | 'expiry' }): 'purged' | 'kept' | 'failed';
  endOutgoingSession(s: PageIdentity | null, ms?: number): Promise<void>;
  onBeforeAuthPurge(fn: (info?: AuthPurgeInfo) => void): void;
  authStorageEntry(area: 'local' | 'session', key: string): StorageEntry | null;
  /** A refresh or a send found storage holding another session (this tab's answer was superseded). */
  authSessionSuperseded(): boolean;
  /** Stores a reissued pair only for `owner` while storage still holds that same session; true when stored. */
  adoptReissuedSession(d: unknown, owner: string): boolean;
  /** Not in shared.js: the stored access token. Absent means localStorage's (the fixture mode overrides it). */
  readAccessToken?(): string | null;
  /** The passcode's lock-only broadcast for `uid` (core/applock.ts). Optional: an older shared.js lacks it. */
  postHubLock?(uid: string): void;
  /** Forget this browser, passcode included (no Web Lock; synchronous). Optional: an older shared.js lacks it. */
  forgetBrowser?(): 'purged' | 'failed';
  // The API origin seam (shared.js "The API origin"; core reads it through origin.ts only). Absent in the fixture and
  // terminal implementations, which are never the standalone page.
  /** True on the standalone Hub (one HTML file opened from anywhere), decided once when shared.js loaded. */
  hubStandalonePage?(): boolean;
  /** '' on a served page; the standalone page's API origin; null while a standalone page may not send. */
  hubApiOrigin?(): string | null;
  /** The canonical origin of an address when this file lists it, or '' when refused. */
  checkApiOrigin?(raw: unknown): string;
  /** The Hoody this page's link chose (read once when shared.js loaded); null on a served page. */
  standaloneChoice?(): StandaloneChoice | null;
  getStandaloneApi?(): StandaloneApi | null;
  setStandaloneApi?(cfg: StandaloneApi): StandaloneApiSet;
  clearStandaloneApi?(): 'cleared' | 'not_standalone' | 'signed_in' | 'storage';
  /** The login page's session writer (core/signin.ts only). Optional: absent in the fixture and terminal implementations. */
  storeAccessTokens?(pair: Readonly<Record<string, string>>): void;
  /** What storage holds: 'account', 'token', 'none' or 'unreadable' (core/signin.ts reads it after a store). */
  classifyStoredAuth?(): string;
}

/** The standalone Hub's Hoody: its API origin and the two domains that Hoody names for realm hosts and computers
 *  ('' when it names none). */
export interface StandaloneApi {
  readonly origin: string;
  readonly realmApiDomain: string;
  readonly proxyDomain: string;
}
export type StandaloneApiSet = 'set' | 'not_standalone' | 'invalid' | 'locked' | 'signed_in' | 'storage';
/** What the standalone page's link asked for (shared.js standaloneChoice): the origin to use, and how it was chosen:
 *  'default' (no `hoody` parameter), 'alt' (the file's alternative), 'local' (this machine), or 'refused' (any other
 *  value; the default). */
export interface StandaloneChoice {
  readonly origin: string;
  readonly asked: 'default' | 'alt' | 'local' | 'refused';
}

/** The fields shared.js and the transports put on a rejection. Everything is optional. */
export interface HubErrorBase {
  status?: number;
  code?: string | null;
  kind?: string;
  data?: unknown;
  details?: unknown;
  message?: string;
  notSent?: boolean;
  stale?: boolean;
  superseded?: boolean;
  cancelled?: boolean;
  framed?: boolean;
  pending?: boolean;
  retryAfter?: number | null;
  retryAfterMs?: number | null;
  /** The API's X-Trace-Id of an answered refusal (trace-id.ts shape), when the answer carried one. */
  traceId?: string;
  /** api(): the declared route of the call, "METHOD /template" (trace-id.ts routeLabel). */
  route?: string;
}

export const API_BASE = '/api/v1';
const RE24 = /^[0-9a-f]{24}$/;

/** The shared.js functions a page must have. */
export const SHARED_NAMES = [
  'storedSession', 'holdsIdentity', 'holdsSession', 'sessionTokenUid', 'sessionTokenSid', 'apiCall', 'isFramedPage',
  'framedSensitiveRoute', 'framedRefusedError', 'supersededAuthError', 'isSupersededAuthError', 'realmApiDomain',
  'clearAuthTokens', 'purgeOutgoingSession', 'endOutgoingSession', 'onBeforeAuthPurge', 'authStorageEntry',
  'authSessionSuperseded', 'adoptReissuedSession',
] as const;
/** Read when present, so another implementation (an older shared.js, a test's) still loads. */
export const SHARED_OPTIONAL = [
  'postHubLock', 'holdsRemnantOf', 'forgetBrowser', 'hubStandalonePage', 'hubApiOrigin', 'checkApiOrigin', 'standaloneChoice', 'getStandaloneApi',
  'setStandaloneApi', 'clearStandaloneApi', 'storeAccessTokens', 'classifyStoredAuth',
] as const;

let impl: Shared | null = null;

/** The shared.js globals, checked once. A page without shared.js cannot run the Hub. */
function fromGlobals(): Shared {
  const g = globalThis as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const n of SHARED_NAMES) {
    if (typeof g[n] !== 'function') throw new Error('shared.js is not loaded (' + n + ')');
    out[n] = g[n];
  }
  for (const n of SHARED_OPTIONAL) if (typeof g[n] === 'function') out[n] = g[n];
  return out as unknown as Shared;
}

/** The passcode lock's keys (`hub_lock:<uid>`, `hub_lock_now:<uid>`) are written only by core/applock.ts and
 *  shared.js: every Hub reader of the registry through shared() (settings, preferences, kit stores, notices) sees
 *  them as unregistered, so no generic writer can take one. */
function reserveLockKeys(s: Shared): Shared {
  const entry = s.authStorageEntry;
  return { ...s, authStorageEntry: (area, key) => (typeof key === 'string' && key.startsWith('hub_lock') ? null : entry(area, key)) };
}

export function shared(): Shared {
  if (!impl) impl = reserveLockKeys(fromGlobals());
  return impl;
}

/** Tests and the fixture mode: replace shared.js. Pass null to go back to the globals. */
export function installShared(s: Shared | null): void {
  impl = s && reserveLockKeys(s);
}

/** This page's identity from the stored session, frozen; null when nothing usable is stored. */
export function readPage(): PageIdentity | null {
  const s = shared().storedSession();
  return s ? Object.freeze({ kind: s.kind, uid: s.uid, sid: s.sid }) : null;
}

/** A token session's pinned realm ('all' or a 24-hex id), or null for an account session. */
export function tokenRealmOf(page: PageIdentity | null): string | null {
  if (!page || page.kind !== 'token') return null;
  const s = shared().storedSession();
  return s && s.kind === 'token' && typeof s.realm === 'string' ? s.realm : null;
}

function accessToken(): string | null {
  const s = shared();
  if (s.readAccessToken) return s.readAccessToken();
  try { return globalThis.localStorage.getItem('access_token'); } catch { return null; }
}

/**
 * Storage holds exactly identity `id`: its access token names the same uid and sid (a removed access
 * token ends the account session, as it always has); a token identity, the stored record's owner and sid.
 */
export function holds(id: PageIdentity | null): boolean {
  if (!id) return false;
  if (id.kind === 'token') return shared().holdsIdentity(id);
  if (id.kind !== 'account') return false;
  const tok = accessToken();
  const s = shared();
  return s.sessionTokenUid(tok) === id.uid && s.sessionTokenSid(tok) === id.sid;
}

/** The user the stored session belongs to: a token page's own uid while held, else the access token's. */
export function sessionUid(page: PageIdentity | null): string | null {
  if (page && page.kind === 'token') return shared().holdsIdentity(page) ? page.uid : null;
  return shared().sessionTokenUid(accessToken());
}

/** https://<r>.<realm API domain>/api/v1 for a 24-hex r on a page that names that domain, else API_BASE. */
export function hubApiBase(realm: string | null | undefined): string {
  const d = shared().realmApiDomain();
  return d && RE24.test(realm || '') ? 'https://' + realm + '.' + d + API_BASE : API_BASE;
}

export function realmDomain(): string {
  return shared().realmApiDomain();
}

export function isFramed(): boolean {
  return shared().isFramedPage();
}

/** The only sign-out purge (shared.js purgeAuthStorage through clearAuthTokens). */
export function clearAuthTokens(): void {
  shared().clearAuthTokens();
}

/** shared.js purgeOutgoingSession, as it is: purges only while storage still holds session `s` (null: only while no
 *  session is stored), so a view drawn for one session never ends another tab's newer one. 'kept': another session is
 *  stored, nothing removed; 'failed': a credential is still stored afterwards. `reason` goes to the purge hooks
 *  (shared.js default 'expiry'; 'signout' only for the person's own sign-out). */
export function purgeOutgoingSession(s: PageIdentity | null, opts?: { reason?: 'signout' | 'expiry' }): 'purged' | 'kept' | 'failed' {
  return shared().purgeOutgoingSession(s, opts);
}

/** Every purge runs `fn` first, whatever path called it. */
export function onBeforeAuthPurge(fn: (info?: AuthPurgeInfo) => void): void {
  shared().onBeforeAuthPurge(fn);
}

/** The storage registry entry for a key, or null: a key with no entry must not be written. */
export function storageEntry(area: 'local' | 'session', key: string): StorageEntry | null {
  return shared().authStorageEntry(area, key);
}
