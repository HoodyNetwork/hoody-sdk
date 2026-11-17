// prefs.ts: per-account preferences and browser settings in localStorage, typed and subscribable.
//
// Contract, in plain words:
//   - Every key is a key of shared.js AUTH_STORAGE_REGISTRY (the one list clearAuthTokens purges from):
//     a key that is not registered, or whose registered sign-out rule differs from the one asked for, is
//     refused when it is declared (STORE_UNREGISTERED). Sign-out removes exactly the registered purge keys; the
//     others ("kept") stay on this browser.
//   - accountPref(key, parse, o) / useAccountPref(key, parse, o): one value per account (and, for scope
//     account+realm / account+computer, per part), stored in the key's document {v:1, a:{<account>: value}}
//     (kit-io partitioned: at most 8 accounts, 32 parts, 64 KiB per value). The account is the one this page
//     shows; with none known, get() gives parse(null) and set() stores nothing. Another account's value is never
//     read. parse turns whatever is stored (null when nothing) into a valid value, its default for anything
//     malformed: it fails closed. A parse that throws reads as parse(null).
//   - localSetting(key, o) / useLocalSetting(setting): one string under a registered key. o.account puts the
//     shown account into the key at '{uid}' (no account known → get() null, set() false).
//   - set() answers false when the browser refused to store (quota, blocked storage). The value then lives for
//     this page only and wins over an older stored value, until a later set() stores or the account leaves.
//     Page-only values (kept keys' too) are not read once sign-out begins, and are dropped when the account ends
//     (sign-out, any purge) and when another account is shown; pendingPrefWrites() counts the kept ones first.
//   - Subscribers hear their own page's sets, another tab's write of the key (storage events), and a change of
//     the shown account.
//   - Account preferences are stored encrypted (cryptStore.ts): get() reads the values decrypted when the account
//     was opened; status(part) is 'locked' when a saved value does not open on this browser (the default shows and
//     nothing writes over it until the user sets a value), 'loading' while the account opens, 'unsaved' when the
//     browser refused a background store (set() already answered true: usePrefStatus() shows it), 'oversized',
//     'saving' while a write is on its way, 'conflict' when another tab stored the slot first (theirs shows). set()
//     answers false (then 'page') when this browser cannot keep encrypted settings, and while the account opens.
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { capture, loggingOut, subscribe as onCore } from './ctx';
import { countPageOnly, cryptPartitioned, declareCryptKeys, onCryptChange, onCryptForget, type CryptPartitioned, type CryptRead } from './cryptStore';
import { type StorePut, type StoreReset, type StoreScope } from './kit-io';
import { hostEnv, localStore } from './host-env';
import { accountEnded, onTeardown } from './realm';
import { storageEntry } from './session';

const UID = /^(?!__proto__$)[A-Za-z0-9_-]{1,64}$/;
const PART = /^(?!__proto__$)[A-Za-z0-9_.:-]{1,64}$/;

function refusedKey(): Error {
  const err = new Error('STORE_UNREGISTERED') as Error & { code: string };
  err.code = 'STORE_UNREGISTERED';
  return err;
}

function account(): string | null {
  try { const a = capture().account; return a != null && UID.test(String(a)) ? String(a) : null; } catch { return null; }
}

// ---- page-only values and notifications (shared by both kinds) ----

interface Overlay { value: unknown; purge: boolean }
const overlays = new Map<string, Overlay>();
const listeners = new Map<string, Set<() => void>>();

function notify(storageKey: string): void {
  for (const l of [...(listeners.get(storageKey) || [])]) { try { l(); } catch { /* the listener's own */ } }
}

let watching = false;
function watch(): void {
  if (watching) return;
  watching = true;
  // Another context wrote localStorage (web: the window 'storage' event; the terminal host has no other context).
  hostEnv().onExternalChange((area, key) => {
    if (area !== 'local') return;
    if (key === null) { for (const k of listeners.keys()) notify(k); return; }
    if (listeners.has(key)) notify(key);
  });
  onCryptChange(notify);
  // "Forget on this browser" (this tab's or another's): this page's copies of the account's values go too, so none
  // is shown or stored again under the account's next key.
  onCryptForget((uid) => {
    for (const k of [...overlays.keys()]) if (k.split('\n')[1] === uid) overlays.delete(k);
    forgets++;
    for (const f of [...forgetSubs]) f();
    for (const k of listeners.keys()) notify(k);
  });
  // The account ended (sign-out, any purge): every page-only account preference goes, kept keys' too, so none is read
  // again in this page (a sign-out confirm said so first: pendingPrefWrites counts them); browser settings' as before.
  onTeardown((reason) => {
    if (reason === 'switch') return;
    for (const [k, o] of [...overlays]) if (o.purge || k.includes('\n')) overlays.delete(k);
    for (const k of listeners.keys()) notify(k);
  });
  // Another account shown: the page-only values of the one before go.
  let shown = account();
  onCore(() => {
    const now = account();
    if (now === shown) return;
    const was = shown;
    shown = now;
    if (was !== null) for (const k of [...overlays.keys()]) if (k.split('\n')[1] === was) overlays.delete(k);
  });
  countPageOnly(() => {
    const u = account();
    let n = 0;
    if (u !== null) for (const [k, o] of overlays) if (!o.purge && k.split('\n')[1] === u) n++;
    return n;
  });
}

function listen(storageKey: string, fn: () => void): () => void {
  watch();
  let set = listeners.get(storageKey);
  if (!set) { set = new Set(); listeners.set(storageKey, set); }
  set.add(fn);
  const offCore = onCore(fn);
  return () => { set.delete(fn); offCore(); };
}

// ---- account preferences ----

export interface AccountPrefOptions {
  /** 'account' (default), or one value per realm / computer: pass the part to get/set. */
  scope?: StoreScope;
  /** The key's registered sign-out rule: false = removed at sign-out (default), true = kept on this browser. */
  keepAtSignOut?: boolean;
}

/** What a write did: 'stored'; 'page' (the browser refused: kept for this page); 'moved' (made for an account that
 *  is no longer shown, or after sign-out began: nothing written, nothing kept, nothing to warn about); 'refused'
 *  (no account, a bad part, or the account's saved preferences are still opening: nothing kept, the saved value
 *  shows once open). */
export type PrefWrite = 'stored' | 'page' | 'moved' | 'refused';

export interface AccountPref<T> {
  readonly key: string;
  get(part?: string): T;
  /** false: not stored (no account, a bad part, or the browser refused; then kept for this page). */
  set(value: T, part?: string): boolean;
  /** set() for the account `forAccount` only: when another account (or none) is shown now, nothing is written. */
  write(forAccount: string | null, value: T, part?: string): PrefWrite;
  /** write() with what the store did to other entries: least-recently-written accounts or parts evicted under the
   *  caps, or a stored value of another layout replaced. The page says so (no silent loss). */
  report(forAccount: string | null, value: T, part?: string): PrefReport;
  /** Why the shown account's stored value (this part) could not be used, so get() gave the default: 'foreign',
   *  'malformed' or 'oversized' (kit-io StoreReset); null when nothing was stored or it was used. The bytes stay
   *  until this account writes its own entry. */
  reset(part?: string): StoreReset | null;
  /** How the stored value reads on this browser (cryptStore.ts CryptRead): 'locked' = a saved value that does not
   *  open here (the default shows), 'unsaved' = the browser refused the last background store. */
  status(part?: string): CryptRead;
  /** get() for a reader that only looks (a count, a badge): it never starts a write (no retry of a refused store, no
   *  plaintext migration) and says whether the read can tell: known false when no account is shown or its saved
   *  preferences are not open yet, the browser refused the storage read, or an old or another tab's value is not
   *  readable yet; value is then parse(null). A saved value that does not open is known, as get() shows it (status()
   *  says 'locked'). The same answer object while nothing changes (useSyncExternalStore). */
  peek(part?: string): PrefPeek<T>;
  /** true while get() shows this page's own copy (a write the store refused, kept for this page: set() false,
   *  write() 'page'), not a stored value. It goes with an accepted write, another account shown, the account's end
   *  and Forget; once the account is going, none is shown. */
  pageCopy(part?: string): boolean;
  subscribe(fn: () => void): () => void;
}
export type { CryptRead };
export interface PrefPeek<T> { readonly value: T; readonly known: boolean }
export interface PrefReport { result: PrefWrite; evicted: StorePut['evicted']; replacedForeign: boolean }

const prefs = new Map<string, { store: CryptPartitioned; purge: boolean; scope: StoreScope }>();

/**
 * Every account preference key the Hub uses, with the options its accountPref call passes. The encrypted store
 * learns them at load, so opening an account migrates their old plaintext and "Forget on this browser" deletes it
 * even before the page that uses a key has run. A new accountPref key is added here (prefs.test checks the pages).
 * Plain kit-io partitioned() keys (hub_logs_v1, hub_apps_recent_v2, the ask store) are not account preferences
 * and stay out: they are not encrypted.
 */
export const ACCOUNT_PREF_KEYS: Readonly<Record<string, Readonly<{ scope: StoreScope; keepAtSignOut: boolean }>>> = Object.freeze({
  hub_home_v1: { scope: 'account', keepAtSignOut: false },
  hub_guide_v1: { scope: 'account', keepAtSignOut: true },
  hub_qcmd_v1: { scope: 'account+computer', keepAtSignOut: false },
  hub_ai_v1: { scope: 'account+realm', keepAtSignOut: false },
  hub_notes_v1: { scope: 'account+realm', keepAtSignOut: false },
  hub_homew_v1: { scope: 'account+realm', keepAtSignOut: false },
  hub_boards_v1: { scope: 'account+realm', keepAtSignOut: true },
  hub_boards_closed_v1: { scope: 'account+realm', keepAtSignOut: true },
  hub_openwith_v1: { scope: 'account+computer', keepAtSignOut: false },
  hub_files_routes_v1: { scope: 'account', keepAtSignOut: false },
  hub_ai_new_v1: { scope: 'account', keepAtSignOut: false },
  hub_models_v1: { scope: 'account', keepAtSignOut: false },
});
/** Declares ACCOUNT_PREF_KEYS to the encrypted store, with the keys kept at sign-out (at load; tests after a reset). */
export function declareAccountPrefKeys(): void {
  const all = Object.entries(ACCOUNT_PREF_KEYS);
  declareCryptKeys(Object.fromEntries(all.map(([k, o]) => [k, o.scope !== 'account'])), all.filter(([, o]) => o.keepAtSignOut).map(([k]) => k));
}
declareAccountPrefKeys();

function prefStore(key: string, o: AccountPrefOptions) {
  const scope = o.scope || 'account', purge = !o.keepAtSignOut;
  const id = key + '\n' + scope + '\n' + purge;
  let p = prefs.get(id);
  if (!p) {
    const store = cryptPartitioned(key, { scope, purge });
    p = { store, purge, scope };
    prefs.set(id, p);
  }
  return p;
}

// The shown account is going: sign-out began (logout, endTokenSession), or the account ended by any other purge
// (clearAuthTokens on a 401 or a failed refresh, superseded by another tab: endAccount). Until the page leaves,
// account() may still name it, so nothing is written for it any more (a kept key would outlive the purge).
const accountGoing = (): boolean => loggingOut() || accountEnded();

/** A typed per-account preference over a registered key. Throws STORE_UNREGISTERED. */
export function accountPref<T>(key: string, parse: (raw: unknown) => T, o: AccountPrefOptions = {}): AccountPref<T> {
  const p = prefStore(key, o);
  watch();
  const parted = p.scope !== 'account';
  const slot = (part?: string): string | null => {
    const u = account();
    if (!u) return null;
    if (!parted) return u;
    return typeof part === 'string' && PART.test(part) ? u + '\n' + part : null;
  };
  const okParse = (raw: unknown): T => { try { return parse(raw); } catch { return parse(null); } };
  // Same stored value, same object: what useSyncExternalStore needs.
  const cache = new Map<string, { text: string; value: T }>();
  // Forget on this browser: the parsed values of that account go from memory too (also unshown slots).
  onCryptForget((uid) => { for (const s of [...cache.keys()]) if (s === uid || s.startsWith(uid + '\n')) cache.delete(s); });
  function get(part?: string): T {
    const s = slot(part);
    // No slot (no account shown, or no valid part): the default, as one stable object (a parse that builds a new
    // object or array each call would loop useSyncExternalStore).
    if (!s) {
      const hit = cache.get('');
      if (hit) return hit.value;
      const value = okParse(null);
      cache.set('', { text: '', value });
      return value;
    }
    // Once the account is going (sign-out began, or it ended), no page-only value of it is read.
    const ov = accountGoing() ? undefined : overlays.get(key + '\n' + s);
    let raw: unknown;
    try { raw = ov ? ov.value : p.store.get(parted ? part : undefined); } catch { raw = null; }
    let text: string;
    try { text = (ov ? 'o' : 's') + JSON.stringify(raw ?? null); } catch { text = '?'; }
    const hit = cache.get(s);
    if (hit && hit.text === text) return hit.value;
    const value = okParse(raw ?? null);
    cache.set(s, { text, value });
    return value;
  }
  // peek(): one answer object per slot while its text, known and value stay the same. The value is get()'s memo
  // entry when that holds the same stored text (one object for both); without one, peek parses it and may start
  // that memo; a memo of other text is never replaced from here (get() keeps its object), the value stays peek's own.
  const peeked = new Map<string, { text: string; known: boolean; answer: PrefPeek<T> }>();
  onCryptForget((uid) => { for (const k of [...peeked.keys()]) if (k === uid || k.startsWith(uid + '\n')) peeked.delete(k); });
  function peek(part?: string): PrefPeek<T> {
    const s = slot(part) ?? '';
    let raw: unknown = null, known = false, text: string;
    if (s) {
      const ov = accountGoing() ? undefined : overlays.get(key + '\n' + s);
      if (ov) { raw = ov.value; known = true; }
      else {
        try { const r = p.store.peek(parted ? part : undefined); raw = r.value; known = r.known; } catch { raw = null; known = false; }
      }
      try { text = (ov ? 'o' : 's') + JSON.stringify(raw ?? null); } catch { text = '?'; }
    } else text = '';
    const hit = peeked.get(s), c = cache.get(s), same = hit && hit.text === text && hit.known === known ? hit : null;
    let value: T;
    if (c && c.text === text) value = c.value;
    else if (same) value = same.answer.value;
    else {
      value = okParse(raw ?? null);
      if (!c) cache.set(s, { text, value });
    }
    if (same && same.answer.value === value) return same.answer;
    const answer: PrefPeek<T> = Object.freeze({ value, known });
    peeked.set(s, { text, known, answer });
    return answer;
  }
  const none = (result: PrefWrite): PrefReport => ({ result, evicted: { accounts: 0, parts: 0 }, replacedForeign: false });
  function put(value: T, part?: string): PrefReport {
    const s = slot(part);
    if (!s) return none('refused');
    if (accountGoing()) return none('moved');
    // While the account's saved preferences open, no page copy: one built from the default would hide the saved
    // value once it opens, and the next edit would store it over that value.
    let st: CryptRead = 'ok';
    try { st = p.store.status(parted ? part : undefined); } catch { st = 'ok'; }
    if (st === 'loading') return none('refused');
    let r: StorePut | null = null;
    try { r = p.store.put(value, parted ? part : undefined); } catch { r = null; }
    const ok = !!r && r.ok;
    if (ok) overlays.delete(key + '\n' + s);
    else overlays.set(key + '\n' + s, { value, purge: p.purge });
    notify(key);
    return ok && r ? { result: 'stored', evicted: r.evicted, replacedForeign: r.replacedForeign } : none('page');
  }
  const set = (value: T, part?: string): boolean => put(value, part).result === 'stored';
  function report(forAccount: string | null, value: T, part?: string): PrefReport {
    const now = account();
    // Once sign-out began, or the account ended by another purge, a late flush writes nothing (a kept key would
    // outlive it).
    if (accountGoing()) return none(forAccount === null ? 'refused' : 'moved');
    if (forAccount === null || now === null) return none(now === forAccount ? 'refused' : 'moved');
    return now === forAccount ? put(value, part) : none('moved');
  }
  const write = (forAccount: string | null, value: T, part?: string): PrefWrite => report(forAccount, value, part).result;
  function reset(part?: string): StoreReset | null {
    const s = slot(part);
    if (!s || overlays.has(key + '\n' + s)) return null;
    try { return p.store.read(parted ? part : undefined).reset; } catch { return null; }
  }
  const status = (part?: string): CryptRead => { try { return p.store.status(parted ? part : undefined); } catch { return 'ok'; } };
  // The same overlay get() reads (and the same going-account rule).
  const pageCopy = (part?: string): boolean => { const s = slot(part); return !!s && !accountGoing() && overlays.has(key + '\n' + s); };
  return Object.freeze({ key, get, set, write, report, reset, status, pageCopy, peek, subscribe: (fn: () => void) => listen(key, fn) });
}

const hookPrefs = new Map<string, AccountPref<unknown>>();
const hookId = (key: string, o: AccountPrefOptions): string => key + '\n' + (o.scope || 'account') + '\n' + !o.keepAtSignOut;
/** The one accountPref the hooks share for a key and its options (the parser of the first call stays). */
function hookPref<T>(key: string, parse: (raw: unknown) => T, o: AccountPrefOptions): AccountPref<T> {
  const id = hookId(key, o);
  let pref = hookPrefs.get(id) as AccountPref<T> | undefined;
  if (!pref) { pref = accountPref(key, parse, o); hookPrefs.set(id, pref as AccountPref<unknown>); }
  return pref;
}

/**
 * The React form: [value, set, write]. The parser is fixed by the first call for this key and options (declare it at
 * module level). part: the realm or computer for scoped preferences. Both setters are bound to the account this
 * render showed: a debounced or unmount-flushed call made after the account changed writes nothing (write() says
 * 'moved'; set() answers true, since there is nothing to warn "unsaved" about). set() is false only when the
 * value was not stored for the shown account (quota, no account).
 */
export function useAccountPref<T>(key: string, parse: (raw: unknown) => T, o: AccountPrefOptions & { part?: string } = {}): [T, (v: T) => boolean, (v: T) => PrefWrite] {
  const pr = hookPref(key, parse, o), part = o.part;
  const value = useSyncExternalStore(pr.subscribe, () => pr.get(part), () => pr.get(part));
  const bound = account();
  const write = useCallback((v: T) => pr.write(bound, v, part), [pr, part, bound]);
  const set = useCallback((v: T) => { const w = write(v); return w === 'stored' || w === 'moved'; }, [write]);
  return [value, set, write];
}

const statusPrefs = new Map<string, AccountPref<unknown>>();
/**
 * How a pref's stored value reads on this browser, live (cryptStore.ts CryptRead). The store runs in the
 * background, after set() answered true: a page shows its "not saved" notice from 'unsaved' here, not from set().
 */
export function usePrefStatus(key: string, o: AccountPrefOptions & { part?: string } = {}): CryptRead {
  const id = key + '\n' + (o.scope || 'account') + '\n' + !o.keepAtSignOut;
  let pref = statusPrefs.get(id);
  if (!pref) { pref = accountPref(key, (raw: unknown) => raw, o); statusPrefs.set(id, pref); }
  const pr = pref, part = o.part;
  return useSyncExternalStore(pr.subscribe, () => pr.status(part), () => pr.status(part));
}

// ---- changes as functions of the stored value (usePrefUpdate) ----

/** Updates made in one scope (pref key and options, account, part, Forget count) not yet known stored: one per scope,
 *  shared by every hook of it, driven by the store's notices (so it outlives the component that made it). */
interface Pending {
  readonly pr: AccountPref<unknown>;
  readonly account: string;
  readonly part: string | undefined;
  readonly forgets: number;
  /** Every update since the last stored value, composed in order (null: none). */
  fn: ((v: unknown) => unknown) | null;
  /** The value the page last asked to store (what onUnsaved hears): every pending change, over the value it read. */
  wanted: unknown;
  rounds: number;
  told: boolean;
  /** Refused while another tab's value (or the account) was opening: applied once it is open. */
  waitOpen: boolean;
  said: ((wanted: unknown | null) => void) | undefined;
  off: (() => void) | null;
  queued: boolean;
}
const pendingUpdates = new Map<string, Pending>();
const MAX_REAPPLY = 3;

function tellPending(e: Pending, wanted: unknown): void {
  if (e.told) return;
  e.told = true;
  try { e.said?.(wanted); } catch { /* the page's own */ }
}
function dropPending(scope: string, e: Pending): void {
  e.fn = null;
  e.off?.();
  e.off = null;
  if (pendingUpdates.get(scope) === e) pendingUpdates.delete(scope);
}
/** Writes the composed updates over the value stored now; false (said, dropped) when it is not stored. */
function reapply(scope: string, e: Pending): void {
  const fn = e.fn;
  if (!fn) return;
  const wanted = fn(e.pr.get(e.part));
  e.wanted = wanted;
  const w = e.pr.write(e.account, wanted, e.part);
  if (w !== 'stored') { tellPending(e, wanted); dropPending(scope, e); }
}
/** What the store says now about a scope with pending updates (run after each notice, never inside one). */
function drivePending(scope: string, e: Pending): void {
  e.queued = false;
  if (!e.fn || pendingUpdates.get(scope) !== e) return;
  // The scope ended (another account, sign-out, Forget): its updates are never applied anywhere else.
  if (account() !== e.account || accountForgets() !== e.forgets || loggingOut()) { tellPending(e, e.wanted); dropPending(scope, e); return; }
  const st = e.pr.status(e.part);
  if (st === 'ok') {
    if (!e.waitOpen) { dropPending(scope, e); return; } // stored
    e.waitOpen = false;
    reapply(scope, e);
    return;
  }
  if (st === 'conflict') {
    if (e.rounds >= MAX_REAPPLY) { tellPending(e, e.fn(e.pr.get(e.part))); dropPending(scope, e); return; }
    e.rounds++;
    reapply(scope, e);
    return;
  }
  if (st === 'unsaved') { tellPending(e, e.pr.get(e.part)); return; } // kept: the store tries again, then 'ok' or 'conflict'
  if (st === 'locked' || st === 'oversized') { tellPending(e, e.wanted); dropPending(scope, e); } // nothing writes over it
  // 'loading', 'saving': wait for the next notice.
}

/**
 * Changes as functions of the stored value, for a pref that holds something a person or a send depends on (holds,
 * layout). update(fn) writes fn(the value as this page knows it now: its own writes not yet rendered included), so
 * updates in one batch, and from several components of the same pref, compose. Until stored:
 *   - another tab stored first ('conflict'): every update since the last stored value is applied again, in order, to
 *     that tab's value, at most 3 times in a row; then it is given up and onUnsaved runs;
 *   - the browser refused the store (set false now, or status 'unsaved' later): onUnsaved runs once with the value
 *     the page wanted; it runs again only after a store succeeds or the page writes again;
 *   - made while another tab's value (or the account) is still opening: applied once it is open, never lost;
 *   - the stored value stops opening ('locked'), or the scope ends (another account or part, sign-out, Forget on
 *     this browser): the updates are dropped and onUnsaved runs; none is ever applied in another scope.
 * An update made inside a store notice, before the notice's own driver ran (an effect of the render the notice
 * caused), first takes what the notice said (a stored value ends the changes it held, a conflict or a value now open
 * gets them applied again), so it composes onto exactly what is still pending.
 * An update called through a callback kept from an earlier render whose scope has changed is not applied: it
 * answers false, its change is never worked out, and the onUnsaved of that render runs with null (nothing of the
 * earlier scope's value reaches the page). update() answers false when the change was not kept.
 */
export function usePrefUpdate<T>(key: string, parse: (raw: unknown) => T, o: AccountPrefOptions & { part?: string; onUnsaved?: (wanted: T | null) => void } = {}): { value: T; update: (fn: (v: T) => T) => boolean; status: CryptRead } {
  const { onUnsaved, ...po } = o;
  const [value] = useAccountPref(key, parse, po);
  const status = usePrefStatus(key, po);
  const pr = hookPref(key, parse, po), part = po.part;
  const bound = account(), fg = useAccountForgets();
  const scope = hookId(key, po) + '\n' + (bound ?? '') + '\n' + (part ?? '') + '\n' + fg;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const said = useRef(onUnsaved);
  said.current = onUnsaved;
  const update = useMemo(() => {
    // The handler of the render that made this callback: a notice about a callback of this scope goes to it.
    const sayHere = said.current;
    return (fn: (v: T) => T): boolean => {
      const say = said.current as ((wanted: unknown | null) => void) | undefined;
      // A callback from an earlier render (another account or part, or before a Forget or sign-out): not applied, and
      // its change is not worked out (it would read the earlier scope's value): only that it was not kept is said.
      if (scopeRef.current !== scope || account() !== bound || accountForgets() !== fg || loggingOut() || bound === null) {
        try { sayHere?.(null); } catch { /* the page's own */ }
        return false;
      }
      let e = pendingUpdates.get(scope);
      // What the store said since its last notice comes first: the driver that notice queued may not have run yet.
      if (e?.fn) { drivePending(scope, e); e = pendingUpdates.get(scope); }
      if (!e) {
        e = { pr: pr as AccountPref<unknown>, account: bound, part, forgets: fg, fn: null, wanted: undefined, rounds: 0, told: false, waitOpen: false, said: undefined, off: null, queued: false };
        pendingUpdates.set(scope, e);
      }
      const entry = e;
      entry.said = say;
      const prev = entry.fn, f = fn as (v: unknown) => unknown;
      entry.fn = prev ? (v: unknown) => f(prev(v)) : f;
      entry.rounds = 0;
      entry.told = false;
      if (!entry.off) entry.off = pr.subscribe(() => { if (!entry.queued) { entry.queued = true; queueMicrotask(() => drivePending(scope, entry)); } });
      const next = fn(pr.get(part));
      entry.wanted = next;
      const w = pr.write(bound, next, part);
      if (w === 'stored') return true;
      if (w === 'refused' && pr.status(part) === 'loading') { // applied once open
        entry.waitOpen = true;
        try { entry.wanted = entry.fn(pr.get(part)); } catch { /* the page's own */ }
        return true;
      }
      tellPending(entry, next);
      dropPending(scope, entry);
      return false;
    };
  }, [scope, pr, part, bound, fg]);
  return { value, update, status };
}

/** The pending preference updates dropped (resetPrefs; tests). */
export function resetPrefUpdates(): void {
  for (const [scope, e] of [...pendingUpdates]) dropPending(scope, e);
}

// "Forget on this browser" happened (in this tab or another): a page that keeps its own copy of a pref (Board's
// working state, undo) drops it when this changes, and stores nothing made before it.
let forgets = 0;
const forgetSubs = new Set<() => void>();
/** How many times an account was forgotten on this browser since this page loaded. */
export function accountForgets(): number {
  watch();
  return forgets;
}
/** accountForgets() for React. */
export function useAccountForgets(): number {
  return useSyncExternalStore((fn) => { watch(); forgetSubs.add(fn); return () => { forgetSubs.delete(fn); }; }, () => forgets, () => forgets);
}

// ---- browser settings (one string under a registered key) ----

export interface LocalSettingOptions {
  /** The key holds '{uid}', filled with the shown account. */
  account?: boolean;
  /** The key's registered sign-out rule: true = kept on this browser; false (default) = removed at sign-out. */
  keepAtSignOut?: boolean;
}

export interface LocalSetting {
  readonly key: string;
  get(): string | null;
  /** null removes. false: not stored (no account for an account key, or the browser refused; then kept for this page). */
  set(v: string | null): boolean;
  subscribe(fn: () => void): () => void;
}

/** A string setting under a registered localStorage key. Throws STORE_UNREGISTERED. */
export function localSetting(key: string, o: LocalSettingOptions = {}): LocalSetting {
  const purge = !o.keepAtSignOut;
  const holds = key.includes('{uid}');
  if (!!o.account !== holds || (holds && key.indexOf('{uid}') !== key.lastIndexOf('{uid}'))) throw refusedKey();
  const sample = holds ? key.replace('{uid}', 'u0') : key;
  const reg = storageEntry('local', sample);
  if (!reg || reg.purge !== purge) throw refusedKey();
  watch();
  const full = (): string | null => {
    if (!holds) return key;
    const u = account();
    return u ? key.replace('{uid}', u) : null;
  };
  function get(): string | null {
    const k = full();
    if (!k) return null;
    // The account is going (sign-out began, or it ended): its account keys read nothing, as account preferences.
    if (holds && accountGoing()) return null;
    const ov = overlays.get(k);
    if (ov) return ov.value as string | null;
    try { return localStore().getItem(k); } catch { return null; }
  }
  function set(v: string | null): boolean {
    const k = full();
    if (!k || (v !== null && typeof v !== 'string')) return false;
    // The account is going: an account key, or one removed at sign-out, is not written (it would outlive it).
    if ((holds || purge) && accountGoing()) return false;
    let ok = false;
    try {
      const s = localStore();
      if (v === null) s.removeItem(k); else s.setItem(k, v);
      ok = true;
    } catch { ok = false; }
    if (ok) overlays.delete(k); else overlays.set(k, { value: v, purge });
    notify(k);
    return ok;
  }
  // Subscriptions follow the full key of the account shown when the account changes (ctx subscribe re-reads).
  function subscribe(fn: () => void): () => void {
    let k = full();
    let off = k ? listen(k, fn) : onCore(fn);
    const offAcct = holds ? onCore(() => {
      const n = full();
      if (n === k) return;
      off(); k = n; off = k ? listen(k, fn) : () => {};
    }) : () => {};
    return () => { off(); offAcct(); };
  }
  return Object.freeze({ key, get, set, subscribe });
}

/** The React form of a localSetting: [value, set]. */
export function useLocalSetting(s: LocalSetting): [string | null, (v: string | null) => boolean] {
  const value = useSyncExternalStore(s.subscribe, s.get, s.get);
  return [value, s.set];
}

let prefsGen = 0;
/** Which preference session this is: raised by every resetPrefs (a disposed terminal session, a new boot). A page that
 *  keeps its own accountPref object across calls rebuilds it when this changed, as core's own caches are dropped then
 *  (an object kept from an earlier session reads that session's store: the terminal Board stayed "Loading…"). */
export function prefsGeneration(): number { return prefsGen; }

/** The preference caches and pending updates forgotten (session disposal, dispose.ts; tests). */
export function resetPrefs(): void {
  prefsGen++;
  overlays.clear();
  prefs.clear();
  hookPrefs.clear();
  statusPrefs.clear();
  resetPrefUpdates();
}
