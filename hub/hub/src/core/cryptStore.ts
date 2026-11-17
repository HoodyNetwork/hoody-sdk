// cryptStore.ts: encrypted per-account preferences, the store under prefs.ts accountPref.
//
// Contract, in plain words:
//   - cryptPartitioned(key, o) is kit-io's partitioned() with every value sealed: the same registered key, the same
//     document {v:1, a:{<account>: value | {<part>: value}}} and caps (8 accounts, 32 parts; 16/64 for a key kept
//     at sign-out), and like it no read ever deletes: a foreign layout reads with reset 'foreign', a malformed own
//     entry with reset 'malformed', a value that does not open as status() 'locked', and all of them stay until the
//     user writes that slot. The only write a read starts is the one-time migration of this account's own plaintext
//     (same value, sealed). Rotation and migration replace this account's own leaves in place: they never evict,
//     reorder or touch another account, and never write over a document they cannot read. Each value is an
//     envelope {v:1, k, iv, ct} (crypt/envelope.ts: AES-256-GCM, a key per account, part and pref key, derived by
//     HKDF from this browser's base key for the account; the account and part stay readable as the slot address).
//     A value is at most VALUE_MAX bytes of JSON (sealed, it must still fit kit-io's 64 KiB): a larger one is refused
//     whole (set() false, status() 'oversized' until a set() is accepted, another account is shown, the account ends,
//     or it is forgotten: the ends at which prefs drops its page copy of the value; a reopen of the same account, after
//     a new sign-in id or failed rechecks, keeps it), never cut.
//   - get() is synchronous: it answers from a cache decrypted when the account was opened. The shown account is
//     opened by itself (ctx subscription) when it appears; cryptReady() lets boot wait for that before the first
//     render. A value another tab wrote is decrypted in the background; until then the last value stands, and
//     onCryptChange(key) fires once it is open.
//   - set() is synchronous too: the value is cached at once and sealed and stored in the background, in write order,
//     the newest value of a slot winning. It answers false (prefs then keeps the value for this page only: 'page')
//     when this browser cannot keep encrypted settings (no vault, WebCrypto or Web Locks, or the vault refused),
//     while the account is still opening (status() 'loading': a value built from defaults must not replace the saved
//     one), when no account is shown, or when the value is not JSON or too large. A background store that the browser
//     refuses leaves status() 'unsaved', and is tried again with the same value on a storage event of the key and
//     on a read (at most every 10 s per slot). remove() also cancels a write of the slot still on its way. A write
//     belongs to the account it was made under; a sign-out purge in between drops the write of a purged key, so a
//     late write never brings a purged value back. A write of a key kept at sign-out, accepted before sign-out
//     started, still lands, sealed for its account; logout() waits for it (cryptWritesSettled, at most 3 s), whose
//     outcome says 'unsaved' when such a write was not stored after all (unsavedAtSignOut counts them) and 'timeout'
//     when one was still on its way. Key reads after another tab's rotation have the KEYS_DEADLINE_MS deadline too.
//   - Sign-out and an ended account: from the moment sign-out starts (or the account ends), no account is shown here
//     though the identity stays until the page leaves: every get() gives its default, set() is refused, and the
//     teardown does not open the account again.
//   - Opening: values decrypted while the account opens show only once it is open (its keys confirmed). An opening
//     that fails keeps none of them. A rotation heard while it opens reads the keys again, at most 3 times and each
//     read within KEYS_DEADLINE_MS (2 s); past either, the opening fails (closed: defaults, nothing written).
//   - A stored value that does not open (its key was forgotten or rotated away, another slot's envelope, tampering,
//     a vault that cannot be read) reads as null, so the pref shows its default, status() is 'locked', and nothing
//     writes over it until the user sets a new value.
//   - Old plaintext values are read once and migrated: the first read on an open account starts the migration of
//     the key (all parts of the account at once: sealed in place, then the key is recorded as migrated). Plaintext is
//     never read while the account opens or cannot open, under a key migrated by any tab, next to a sealed value of
//     the account, after its migration started in this page (the page keeps the copy it read), or over VALUE_MAX
//     (status 'oversized'; its bytes stay until the account ends). A refused migration reads as status 'unsaved'
//     and the next page retries. When the account ends while shown, its old plaintext under keys kept at sign-out is
//     sealed for it (sealAtSignOut, within SEAL_DEADLINE_MS, inside sign-out's 3 s wait). On a sign-out the person
//     asked for (logout() calls signOutAsked(), after hub-shell's confirm), no plaintext of the account stays at
//     rest: what could not be sealed (over VALUE_MAX, refused, no keys, past the deadline) is counted beforehand by
//     pendingPrefWrites() (the confirm names it) and afterwards by unsavedAtSignOut(), and is then removed, any
//     size, every pref key this page knows, that account only. Which keys are kept at sign-out is declared at load
//     with the keys (declareCryptKeys), so a key whose page never ran is counted too. When the browser refuses that
//     removal (another account's entry in the same document needs a rewrite), cryptWritesSettled() answers
//     'plaintext-left' and logout() shows the purge-failed panel, whose Try again runs it again
//     (clearSignOutPlaintext); another account's entry is never touched. Any other end (a token session ending,
//     expiry, another tab, the account lost) removes only plaintext over VALUE_MAX (it can never be sealed),
//     uncounted: the rest stays and is migrated at the account's next open, so nobody loses a value they were not
//     warned about. A teardown that does not end the account (suspension) does the same and leaves the account's
//     sign-out to come whole.
//     Plaintext is also migrated without being read: at each open, under every pref key this browser's store has
//     used (recorded in the vault), and when a page first declares a key. Keys only kit-io's plain partitioned()
//     uses are never touched (this store cannot tell their layout from its own).
//   - Rotation: at each new sign-in (a session id the vault has not rotated for) the account gets a new base key.
//     Every value that opens is resealed under it, then the vault's active key is switched, then every other key is
//     deleted. A crash at any step leaves every value under a key that still exists; the next open finishes the job
//     (reseals what is left under the active key, then deletes the rest). A rotation that could not read every
//     stored document, or could not reseal every value that opens, deletes no key. Writes and rotations of an
//     account run one at a time across tabs (the host env's locks: Web Locks on the web, the mount session's lock
//     table in the terminal; a host without them opens no account: defaults show).
//   - forgetThisBrowser() deletes the account's keys: every saved value of the account on this browser stops opening
//     at once. The next open starts a new key; values set after that are readable again. Other tabs hear it
//     (BroadcastChannel) and drop their keys and values; the vault's forget epoch changes too, so a tab that missed
//     the message stores nothing more from what it held, and no write of this page begun before it stores. It also
//     deletes the account's old plaintext under every pref key the store has used (no history left behind). The key
//     delete and the new epoch are one vault transaction. onCryptForget() tells prefs.ts to drop its page-only
//     copies of the account. A tab checks the vault again when it shows (visibilitychange, pageshow), so one that
//     missed the message closes then; a check refused, or not answered within KEYS_DEADLINE_MS, locks every opened
//     value until a later check answers (0.5/2/8 s), then the account closes. Until a check answers, nothing opens:
//     a decrypt on its way, a changed leaf read again or a conflict's winner reads 'locked' (the verification fence). A rotation is announced too: other tabs drop the old key handles, and values
//     opened from a copy whose key it deleted lock once the vault's keys are read again; a read refused, or not
//     answered within KEYS_DEADLINE_MS, locks every opened value and is retried (0.5/2/8 s), then the account closes.
// Nothing here logs: keys, IVs and values never reach a log line, and there is no telemetry.
import { capture, loggingOut, subscribe as onCore } from './ctx';
import * as E from './crypt/envelope';
import type { AccountRecord, Vault } from './crypt/vault';
import { hostEnv, registrationGroup, type HostLocks, type KeyValueStore } from './host-env';
import { partitioned, type Partitioned, type StorePut, type StoreReset, type StoreScope } from './kit-io';
import { accountEnded, onTeardown } from './realm';
import { onBeforeAuthPurge, shared, storageEntry } from './session';
import { isPlainRecord } from './shape';

const UID = /^(?!__proto__$)[A-Za-z0-9_-]{1,64}$/;
const PART = /^[A-Za-z0-9_.:-]{1,64}$/;
// kit-io's store limits (a key kept at sign-out keeps more): the same document must stay readable by it.
const STORE_MAX = 65536, STORE_ACCOUNTS = 8, STORE_PARTS = 32, KEPT_ACCOUNTS = 16, KEPT_PARTS = 64;
/** The largest value (UTF-8 bytes of its JSON) that still fits STORE_MAX once sealed and base64-encoded. */
export const VALUE_MAX = 48000;

/** How a slot reads: 'ok'; 'loading' (the account is being opened, or another tab's value is opening); 'locked' (a
 *  saved value that does not open on this browser: the default shows); 'unsaved' (the browser refused to store the
 *  last value: it lives in this page); 'oversized' (the last value set was over VALUE_MAX: refused whole, never cut;
 *  set() said false); 'saving' (a write is on its way: get() shows it, not a stored value); 'conflict' (another tab
 *  stored the slot first: this page's accepted write was not stored and theirs shows, until the next write). */
export type CryptRead = 'ok' | 'loading' | 'locked' | 'unsaved' | 'oversized' | 'saving' | 'conflict';

/** What peek() answers: the value get() would show now (null: nothing stored, or the default), and whether this
 *  read can tell. known false: the account is not shown or not open yet, the fence holds, the browser refused the
 *  storage read, old plaintext waits for its migration, or another tab's sealed value is still opening with nothing
 *  shown before it; value is then null. A saved value that does not open reads as get() has it: null, known (status()
 *  says 'locked'). */
export interface CryptPeek { readonly value: unknown; readonly known: boolean }

export interface CryptPartitioned extends Omit<Partitioned, 'readTri' | 'update'> {
  status(part?: string): CryptRead;
  /** get() for a reader that only looks: it never starts a write (no retry of a refused store, no plaintext
   *  migration, no cache change) and says when the browser refused the read. A sealed value not opened yet is
   *  opened in the background, as get() does (a read, no write). */
  peek(part?: string): CryptPeek;
}

type Doc = { v: 1; a: Record<string, unknown> };
interface Entry {
  /** The stored leaf's JSON this entry answers for (null: nothing stored yet). */
  sealed: string | null;
  value: unknown;
  locked: boolean;
  /** Set while a write of this value is on its way: the write's sequence number. */
  dirty?: number;
  /** While dirty: the JSON of the value the write was made from (null: none or one that did not open). */
  base?: string | null;
  /** While dirty: the stored leaf's JSON the write was made against (null: nothing stored). */
  expect?: string | null;
  unsaved?: boolean;
  /** This page's accepted write was not stored: another tab stored the slot first, and its value shows (status
   *  'conflict' until the next write or a newer stored value). */
  conflict?: boolean;
}
interface Account {
  readonly uid: string;
  /** The vault this account opened with: every operation of the account uses it, also one that lands after the host's
   *  vault changed (web: another IndexedDB factory). The next account opening reads the host's vault again. */
  readonly vault: Vault;
  readonly sid: string | null;
  readonly gen: number;
  /** 'closed': opened, then no longer shown (its writes still store, see persist()). */
  phase: 'loading' | 'open' | 'closed' | 'unavailable';
  active: string | null;
  bases: Map<string, CryptoKey>;
  migrated: Set<string>;
  rec: AccountRecord;
  /** The vault's forget epoch when the account was opened: a write finding another one stores nothing. */
  epoch: string | null;
  ready: Promise<void>;
  /** A rotation was heard while the account opened: load() reads the key handles again before it opens. */
  rotatedWhileLoading?: boolean;
  /** The verification fence: moves when a vault check fails (lockOpened); a check that answers sets cleared to it.
   *  While they differ the vault's state is unknown and nothing of the account opens. */
  fence: number;
  cleared: number;
}
const unverified = (a: Account) => a.fence !== a.cleared;

const own = Object.hasOwn;
const bytes = (text: string) => new TextEncoder().encode(text).length;
/** Whether set() refuses this value for size (over VALUE_MAX bytes of its JSON; status 'oversized'). */
export function overValueMax(value: unknown): boolean { let t: string | undefined; try { t = JSON.stringify(value); } catch { return false; } return typeof t === 'string' && bytes(t) > VALUE_MAX; }

/** Tests only (resetCryptForTests): a vault in place of the host env's. */
let vaultImpl: Vault | null = null;
/** A vault that refuses every call (`why`): the host has none, or reading it failed. */
function refusingVault(why: unknown): Vault {
  const no = () => Promise.reject(why);
  return { keys: no, putKey: no, deleteKeys: no, account: no, putAccount: no, forget: no };
}
/** The host env's vault (web: IndexedDB; the terminal Hub: its mount session's), read when an account opens (it is
 *  then that account's, Account.vault) and never kept in module state. Never throws: a host with no vault, or one whose
 *  env cannot be read now, answers a vault that refuses (the account fails closed, as without IndexedDB). */
function vault(): Vault {
  if (vaultImpl) return vaultImpl;
  try { return hostEnv().vault ?? refusingVault(new Error('VAULT_UNAVAILABLE')); } catch (e) { return refusingVault(e); }
}

let acct: Account | null = null;
let gen = 0;
let writeSeq = 0;
const cache = new Map<string, Entry>();
/** Moves whenever key handles are revoked (a rotation heard, Forget, close): an open or a key fetch begun before is
 *  not used. */
let keyGen = 0;
const decrypting = new Set<string>();
const migrating = new Set<string>();
/** The newest write of each slot (account, key, part), by sequence number. */
const latest = new Map<string, number>();
/** Moves at every sign-out purge (and every teardown other than a realm switch). */
let purgeGen = 0;
const hookedShared = new WeakSet<object>();
let busy = 0;
/** Writes accepted and still being sealed or stored (cryptWritesSettled). */
let writing = 0;
const writeWaiters = new Set<() => void>();
/** The count unsavedAtSignOut() reports. */
let lostKept = 0;
/** Of those, writes of keys kept at sign-out (pendingPrefWrites). */
let writingKept = 0;
/** The person asked for this sign-out (logout(), after the confirm): only then does unsealed plaintext go. */
let askedSignOut = false;
const changeListeners = new Set<(key: string) => void>();
const known = new Set<string>();
/** Slots (account, key, part) whose last set() was refused as over VALUE_MAX, until a set() is accepted, another account
 *  is shown, the account ends or is forgotten: the ends at which prefs drops its page copy of that value (prefs.ts
 *  overlays), so the stored value reads again. A close() that reopens the same account keeps them: the copy stays. */
const oversized = new Set<string>();
/** The account whose marks are kept (the shown one, also while it is going: prefs' account()). */
let markedUid: string | null = null;
function dropMarks(uid: string | null): void {
  for (const m of [...oversized]) if (uid === null || m.startsWith(uid + '\n')) oversized.delete(m);
}
/** Keys kept at sign-out (kit-io's larger caps); a key not declared here yet uses the smaller ones. */
const keptKeys = new Set<string>();
/** Pref keys (of the open account) whose plaintext migration was tried in this page and refused: status 'unsaved'. */
const unmigrated = new Set<string>();
/** Forgets of each account in this page (moved inside Forget's turn): a write begun before one stores nothing. */
const forgets = new Map<string, number>();
/** Pref keys declared in this page, with whether they are split in parts (see AccountRecord.declared). */
const declaredKeys = new Map<string, boolean>();
/** When a refused store of a slot was last tried again (see retryUnsaved). */
const retriedAt = new Map<string, number>();
const RETRY_MS = 10_000;
/** The real setTimeout, taken at load: cryptIdleForTests waits on real time even under a test's fake timers. */
const realTimeout: typeof setTimeout = globalThis.setTimeout.bind(globalThis);
/** Per declared key: tries a refused store of one of its slots again. */
const unsavedRetry = new Map<string, (a: Account, part: string, force: boolean) => void>();
/** Where the host has no locks, run one at a time within this page (a real browser without them fails closed). Set by resetCryptForTests (see exclusive()). */
let tabLocks = false;

function notify(key: string): void {
  for (const l of [...changeListeners]) { try { l(key); } catch { /* the listener's own */ } }
}
function notifyAll(): void { for (const k of known) notify(k); }

/** Hears a pref key whose value changed in the background (decrypted, opened, locked, unsaved). */
export function onCryptChange(fn: (key: string) => void): () => void {
  changeListeners.add(fn);
  return () => { changeListeners.delete(fn); };
}

// ---- the stored document (explicit account: a background write never follows whoever is shown by then) ----

function box(): KeyValueStore | null { try { return hostEnv().local; } catch { return null; } }

/** A key's stored document: 'absent', 'failed' (the browser refused the read: nothing is known), 'foreign' (bytes
 *  that are not this layout), 'newer' (a later version of this layout, written by a newer deploy: as kit-io, never
 *  written over or removed here, so an older tab never wipes every account's entries of a newer one), or the document. */
type Found = { state: 'absent' | 'failed' | 'foreign' | 'newer' } | { state: 'doc'; doc: Doc };
function readKey(key: string): Found {
  const b = box();
  if (!b) return { state: 'failed' };
  let raw: string | null;
  try { raw = b.getItem(key); } catch { return { state: 'failed' }; }
  if (raw == null) return { state: 'absent' };
  try {
    const d = JSON.parse(raw);
    if (isPlainRecord(d) && d.v === 1 && isPlainRecord(d.a)) return { state: 'doc', doc: d as Doc };
    return { state: isPlainRecord(d) && typeof d.v === 'number' && d.v > 1 ? 'newer' : 'foreign' };
  } catch { return { state: 'foreign' }; }
}
function readDoc(key: string): Doc | null {
  const f = readKey(key);
  return f.state === 'doc' ? f.doc : null;
}

/** The stored leaf of a slot, undefined when there is none. part '' = an account-wide pref. */
function leafIn(d: Doc | null, uid: string, part: string): unknown {
  if (!d || !own(d.a, uid)) return undefined;
  const v = d.a[uid];
  if (part === '') return v;
  return isPlainRecord(v) && own(v, part) ? v[part] : undefined;
}

/**
 * Writes leaves of one account into a key's document. A user's write ('user') works as kit-io's put(): the entry
 * becomes the newest, the caps evict the least recently written, and a foreign layout is replaced (a newer one never
 * is). Upkeep ('upkeep':
 * rotation, plaintext migration) only replaces this account's leaves in place: it never evicts, reorders or touches
 * another account, and never writes over a document it cannot read. No read calls this.
 */
function writeLeaves(key: string, uid: string, leaves: ReadonlyArray<{ part: string; leaf: unknown }>, mode: 'user' | 'upkeep'): boolean {
  const kept = keptKeys.has(key), maxAccounts = kept ? KEPT_ACCOUNTS : STORE_ACCOUNTS, maxParts = kept ? KEPT_PARTS : STORE_PARTS;
  const b = box();
  if (!b || (loggingOut() && !kept)) return false; // a sign-out's purge is never undone by a late write; kept keys stay the account's
  try {
    const f = readKey(key);
    if (f.state === 'newer') return false;
    const found = f.state === 'doc' ? f.doc : null;
    if (mode === 'upkeep' && (!found || !own(found.a, uid))) return false;
    const d: Doc = found || { v: 1, a: {} };
    const a = d.a;
    for (const { part, leaf } of leaves) {
      if (JSON.stringify(leaf).length > STORE_MAX) return false;
      const cur = a[uid];
      if (mode === 'upkeep') {
        if (part === '') a[uid] = leaf;
        else if (isPlainRecord(cur) && !E.looksSealed(cur) && own(cur, part)) cur[part] = leaf;
        else return false;
        continue;
      }
      delete a[uid];
      if (part === '') a[uid] = leaf;
      else {
        const m: Record<string, unknown> = isPlainRecord(cur) && !E.looksSealed(cur) ? cur : {};
        delete m[part];
        m[part] = leaf;
        for (let ks = Object.keys(m); ks.length > maxParts;) delete m[ks.shift() as string];
        a[uid] = m;
      }
    }
    if (mode === 'user') for (let ks = Object.keys(a); ks.length > maxAccounts;) delete a[ks.shift() as string];
    b.setItem(key, JSON.stringify(d));
    return true;
  } catch { return false; }
}

/**
 * Every sealed leaf of an account in the registered documents of this browser. complete is false when any of it
 * could not be read (no storage, a refused listing or read, a registry that cannot answer): rotation then deletes no
 * key, since a value it did not see would lose its key. A key the registry does not know is skipped: every value is
 * written under a registered key (cryptPartitioned refuses others) and the registry is shared.js's fixed list, so
 * only a key dropped from it could hold one, and nothing reads that key any more. A foreign layout is not ours to read.
 */
function sealedLeaves(uid: string): { leaves: Array<{ key: string; part: string; leaf: unknown }>; complete: boolean } {
  const b = box(), out: Array<{ key: string; part: string; leaf: unknown }> = [];
  if (!b) return { leaves: out, complete: false };
  const keys: string[] = [];
  try { for (let i = 0; i < b.length; i++) { const k = b.key(i); if (k !== null) keys.push(k); } } catch { return { leaves: out, complete: false }; }
  let complete = true;
  for (const key of keys) {
    let reg: unknown = null;
    try { reg = storageEntry('local', key); } catch { complete = false; continue; }
    if (!reg) continue;
    const f = readKey(key);
    if (f.state === 'failed' || f.state === 'newer') { complete = false; continue; } // a newer layout may hold sealed values
    if (f.state !== 'doc') continue;
    const v = own(f.doc.a, uid) ? f.doc.a[uid] : undefined;
    if (v === undefined) continue;
    if (E.looksSealed(v)) out.push({ key, part: '', leaf: v });
    else if (isPlainRecord(v)) for (const p of Object.keys(v)) if (PART.test(p) && E.looksSealed(v[p])) out.push({ key, part: p, leaf: v[p] });
  }
  return { leaves: out, complete };
}

function holdsSealed(d: Doc | null, uid: string): boolean {
  const v = d && own(d.a, uid) ? d.a[uid] : undefined;
  if (E.looksSealed(v)) return true;
  return isPlainRecord(v) && Object.values(v).some((x) => E.looksSealed(x));
}

// ---- one at a time per account ----

// Locks are required (hostEnv().locks: every browser the Hub supports has Web Locks in a secure context, where WebCrypto
// lives too; the terminal host has its session's lock table): without them two tabs could rotate at once and one
// delete the key the other just sealed with, so the account opens as unavailable (defaults, writes refused) instead.
// Host locks always win; tabLocks is the fallback where the host has none: one at a time in this page. It is set by
// resetCryptForTests, which tests call and the terminal's disposeCoreSession runs too (resetCoreSteps), so after a
// terminal mount ends the fallback is on, though a live mount's session always has locks.
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  let locks: HostLocks | null;
  try { locks = hostEnv().locks; } catch { locks = null; } // a host that cannot answer has none: fail closed below
  const has = !!locks && typeof locks.request === 'function';
  const run = () => (has ? (locks as HostLocks).request('hoody-hub-crypt:' + uid, {}, fn) : tabLocks ? fn() : Promise.reject(new Error('LOCKS_UNAVAILABLE')));
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

// ---- keys ----

const slotKeys = new Map<string, Promise<CryptoKey>>();
function slotKey(base: CryptoKey, keyId: string, s: E.Slot): Promise<CryptoKey> {
  const id = keyId + '\n' + JSON.stringify([s.account, s.part, s.key]);
  let k = slotKeys.get(id);
  if (!k) { k = E.deriveSlotKey(base, s); slotKeys.set(id, k); k.catch(() => slotKeys.delete(id)); }
  return k;
}

async function openLeaf(bases: Map<string, CryptoKey>, s: E.Slot, leaf: unknown): Promise<{ text: string } | null> {
  const env = E.asEnvelope(leaf);
  const base = env && bases.get(env.k);
  if (!env || !base) return null;
  const text = await E.unseal(await slotKey(base, env.k, s), s, env);
  return text === null ? null : { text };
}

/**
 * Reseals every leaf of the account that opens and is not under `target`, one document write per key. False when a
 * write was refused: nothing is switched or deleted then, so every value keeps a key that exists.
 */
async function consolidate(uid: string, bases: Map<string, CryptoKey>, target: string): Promise<boolean> {
  const base = bases.get(target);
  if (!base) return false;
  const byKey = new Map<string, Array<{ part: string; leaf: unknown; was: string }>>();
  const scan = sealedLeaves(uid);
  if (!scan.complete) return false; // something unseen might need a key we would delete
  for (const l of scan.leaves) {
    const env = E.asEnvelope(l.leaf);
    if (!env || env.k === target) continue;
    const s: E.Slot = { account: uid, part: l.part, key: l.key };
    const opened = await openLeaf(bases, s, l.leaf);
    if (!opened) continue; // already unreadable: it stays so
    const fresh = await E.seal(await slotKey(base, target, s), s, target, opened.text);
    let list = byKey.get(l.key);
    if (!list) byKey.set(l.key, list = []);
    list.push({ part: l.part, leaf: fresh, was: JSON.stringify(l.leaf) });
  }
  let ok = true;
  for (const [key, leaves] of byKey) {
    // Only leaves still stored as read: one removed or replaced meanwhile (this tab's remove()) stays as it is now.
    const d = readDoc(key), still = leaves.filter((l) => JSON.stringify(leafIn(d, uid, l.part)) === l.was);
    if (still.length && !writeLeaves(key, uid, still, 'upkeep')) ok = false;
  }
  return ok;
}

// ---- opening an account ----

// Once sign-out starts or the account ends, no account is shown here, though the identity stays until the page leaves:
// nothing of the account reads (every getter gives its default) and the teardown does not open it again.
function currentUid(): string | null {
  try {
    if (loggingOut() || accountEnded()) return null;
    const a = capture().account;
    return a != null && UID.test(String(a)) ? String(a) : null;
  } catch { return null; }
}
/** The account the page showed, also while it is going (teardown: what to clean up for). */
function endedUid(): string | null {
  try { const a = capture().account; return a != null && UID.test(String(a)) ? String(a) : null; } catch { return null; }
}
function currentSid(): string | null {
  try { const p = capture().page; return p && typeof p.sid === 'string' && p.sid ? p.sid : null; } catch { return null; }
}

/** Kept keys' writes of the open account that the browser refused and that no write is retrying now ('unsaved'). */
function unsavedKept(): number {
  const a = acct;
  if (!a) return 0;
  let n = 0;
  for (const [id, e] of cache) if (e.unsaved && e.dirty !== undefined && keptKeys.has(id.slice(0, id.indexOf('\n'))) && !latest.has(a.uid + '\n' + id)) n++;
  return n;
}

function close(): void {
  // Sign-out (or the account's end) loses a refused kept write with the cache: reported (a write still on its way is
  // counted when it ends). Its old plaintext is sealed while sign-out waits, then endPlaintext deals with the rest.
  if (loggingOut() || accountEnded()) {
    lostKept += unsavedKept();
    if (acct) sealAtSignOut(acct);
  }
  gen++;
  keyGen++;
  acct = null;
  cache.clear();
  decrypting.clear();
  migrating.clear();
  unmigrated.clear();
  slotKeys.clear();
}

let watching = false;
function watch(): void {
  if (watching) return;
  watching = true;
  onCore(sync);
  onTeardown((reason) => {
    if (reason === 'switch') return;
    purgeGen++;
    dropMarks(null); // prefs drops every page copy of an account value at such a teardown
    const uid = endedUid(), ending = loggingOut() || accountEnded();
    // Not a sign-out the person asked for: plaintext over VALUE_MAX goes now, before the seal starts (the page may
    // leave before that seal ends); the rest is the seal's, then stays.
    if (uid && ending && !askedSignOut) dropAccountPlaintext(uid);
    close(); // starts sealAtSignOut when the account was still shown and is ending
    if (uid && ending && !sealing.has(uid) && !plaintextEnded.has(uid)) endPlaintext(uid); // no seal ran or runs for it
    // A teardown that does not end the account (suspension: it opens again): only plaintext over VALUE_MAX goes, and
    // nothing is marked done, so its sign-out later seals, counts and removes as usual.
    else if (uid && !ending) dropAccountPlaintext(uid);
    sync(); notifyAll();
  });
  // Each registration is its own try, as each listener was: one the host cannot attach skips only itself.
  const own = (fn: () => void) => { try { registrationGroup(fn, () => { /* the host has none */ }); } catch { /* the host has none */ } };
  own(() => {
    hostEnv().onExternalChange((_area, k) => { // another context wrote storage (web: the 'storage' event; any area, as before)
      const a = acct;
      if (!a) return;
      for (const [id, e] of cache) {
        const cut = id.indexOf('\n'), key = id.slice(0, cut);
        if (e.unsaved && (k === null || k === key)) unsavedRetry.get(key)?.(a, id.slice(cut + 1), true);
      }
    });
  }); // none: reads still retry
  own(() => {
    hostEnv().channel(CHANNEL)?.onMessage((m) => {
      if (!isPlainRecord(m) || typeof m.uid !== 'string') return;
      if (m.type === 'forget') forgotten(m.uid);
      else if (m.type === 'rotate') rotated(m.uid);
    });
  }); // no channel (the terminal host has no other tab): the vault epoch still stops this tab's writes
  // A tab that missed a message (frozen, in the back/forward cache) checks the vault when it shows again.
  const recheck = () => { void recheckVault(); };
  own(() => { hostEnv().onVisibilityChange(() => { let shows = true; try { shows = hostEnv().visible(); } catch { /* no document */ } if (shows) recheck(); }); });
  own(() => { hostEnv().onLifecycle('pageshow', recheck); });
}

/** Hears "forget on this browser" of an account (this tab's, another tab's, or found by a write or a recheck). */
export function onCryptForget(fn: (uid: string) => void): () => void {
  forgetListeners.add(fn);
  return () => { forgetListeners.delete(fn); };
}
const forgetListeners = new Set<(uid: string) => void>();

/** Another tab (or this one) forgot the account on this browser: drop its keys and values and open it again. */
function forgotten(uid: string): void {
  for (const l of [...forgetListeners]) { try { l(uid); } catch { /* the listener's own */ } }
  dropMarks(uid); // prefs drops the account's page copies on the same message
  if (!acct || acct.uid !== uid) return;
  close();
  sync();
  notifyAll();
}

/** Another tab rotated the account's key: drop the key handles held here (an old copy must not open with them). */
function rotated(uid: string, verified: number | null = null): void {
  const a = acct;
  if (!a || a.uid !== uid) return;
  const kg = ++keyGen;
  if (a.phase === 'loading') { a.rotatedWhileLoading = true; return; }
  if (a.phase !== 'open') return;
  a.bases = new Map();
  slotKeys.clear();
  refreshKeys(a, kg, 0, verified);
}

/** After a rotation: the vault's key handles now, then values opened from a copy whose key went are locked. A vault
 *  that refuses, or does not answer within KEYS_DEADLINE_MS, locks every opened value (none is confirmed while the keys are unknown) and is asked again
 *  (RECHECK_BACKOFF_MS); still silent, the account closes and opens again, which fails closed. Once the keys are
 *  known, values locked only for the wait open again. */
function refreshKeys(a: Account, kg: number, attempt: number, verified: number | null = null): void {
  busy++;
  void withDeadline(a.vault.keys(a.uid), KEYS_DEADLINE_MS).then((b) => {
    if (!live(a) || keyGen !== kg) return;
    a.bases = b;
    // Found by a vault check that answered (recheckVault): the fence raised before that check lifts now that the
    // keys are known. A rotation another tab announced proves nothing about a missed Forget: it lifts nothing.
    if (verified !== null && a.cleared < verified) { const was = unverified(a); a.cleared = verified; if (was && !unverified(a)) notifyAll(); }
    // An announcement may have superseded the refresh a check started (its verification went with it): the fence
    // still up, the vault is checked again now, instead of at the next show.
    else if (verified === null && unverified(a)) void recheckVault();
    lockRevoked(a);
    for (const [id, e] of cache) {
      if (!e.locked || e.dirty || e.sealed === null) continue;
      let env: ReturnType<typeof E.asEnvelope> = null;
      try { env = E.asEnvelope(JSON.parse(e.sealed)); } catch { env = null; }
      const cut = id.indexOf('\n');
      if (env && b.has(env.k)) scheduleDecrypt(a, id.slice(0, cut), id.slice(cut + 1));
    }
  }, () => {
    if (!live(a) || keyGen !== kg) return;
    lockRevoked(a); // no handles held: every opened value whose stored copy is unchanged is locked
    if (attempt < RECHECK_BACKOFF_MS.length) setTimeout(() => { if (live(a) && keyGen === kg) refreshKeys(a, kg, attempt + 1, verified); }, RECHECK_BACKOFF_MS[attempt]);
    else { close(); sync(); notifyAll(); }
  }).finally(() => { busy--; });
}

/** Values this page opened from a stored copy sealed under a key no longer held are shown no more (the copy still in
 *  storage is an old one: a current value was resealed under the new key, and opens again from that). */
function lockRevoked(a: Account): void {
  const stale = new Set<string>();
  for (const [id, e] of cache) {
    if (e.dirty || e.locked || e.sealed === null) continue;
    let env: ReturnType<typeof E.asEnvelope> = null;
    try { env = E.asEnvelope(JSON.parse(e.sealed)); } catch { env = null; }
    if (!env || a.bases.has(env.k)) continue;
    const cut = id.indexOf('\n'), key = id.slice(0, cut);
    if (JSON.stringify(leafIn(readDoc(key), a.uid, id.slice(cut + 1)) ?? null) !== e.sealed) continue; // being opened again
    e.value = null;
    e.locked = true;
    stale.add(key);
  }
  for (const k of stale) notify(k);
}

/** The vault's state for the shown account, checked again: a missed Forget closes it, a missed rotation drops keys.
 *  A vault that refuses, or does not answer within KEYS_DEADLINE_MS, locks every opened value at once (a Forget it
 *  missed must not leave them readable while it is asked again) and is asked again (RECHECK_BACKOFF_MS); still silent,
 *  the account closes and opens again, which fails closed. When it answers with the same epoch, the values locked for
 *  the wait open again. */
async function recheckVault(attempt = 0): Promise<void> {
  const a = acct;
  if (!a || a.phase !== 'open') return;
  busy++;
  const fence = a.fence; // what this check answers for
  try {
    const rec = await withDeadline(a.vault.account(a.uid), KEYS_DEADLINE_MS);
    if (!live(a)) return;
    if ((rec?.epoch ?? null) !== a.epoch) { forgotten(a.uid); return; }
    if (rec && rec.active !== a.active && rec.active !== null && !a.bases.has(rec.active)) { rotated(a.uid, fence); return; }
    reopenLocked(a);
  } catch {
    if (!live(a)) return;
    lockOpened(a);
    if (attempt < RECHECK_BACKOFF_MS.length) setTimeout(() => { if (live(a)) void recheckVault(attempt + 1); }, RECHECK_BACKOFF_MS[attempt]);
    else { close(); sync(); notifyAll(); }
  } finally { busy--; }
}
/** Every value this page opened is shown no more (its stored copy stays): the vault's state is unknown, and nothing
 *  opens until a check answers (the fence). */
function lockOpened(a: Account): void {
  a.fence++;
  for (const e of cache.values()) {
    if (e.dirty || e.locked || e.sealed === null) continue;
    e.value = null;
    e.locked = true;
  }
  // Every key hears it, not only those of the values it locked: status() and peek() of any slot (an empty one too)
  // change with the fence.
  notifyAll();
}
/** Values locked while the vault's state was unknown open again from their stored copy, when its key is held. */
function reopenLocked(a: Account): void {
  const was = unverified(a);
  a.cleared = a.fence; // a check answered: the fence lifts
  if (was) notifyAll(); // status() and peek() of every slot change with it (an empty slot opens nothing to say so)
  for (const [id, e] of cache) {
    if (!e.locked || e.dirty || e.sealed === null) continue;
    let env: ReturnType<typeof E.asEnvelope> = null;
    try { env = E.asEnvelope(JSON.parse(e.sealed)); } catch { env = null; }
    const cut = id.indexOf('\n');
    if (env && a.bases.has(env.k)) scheduleDecrypt(a, id.slice(0, cut), id.slice(cut + 1));
  }
}
const RECHECK_BACKOFF_MS = [500, 2000, 8000];
/** How long a key read after a rotation may take before it counts as refused (the values it would confirm lock). */
const KEYS_DEADLINE_MS = 2000;
/** Rotations heard while an account opens: at most this many key reads again, then the opening fails (closed). */
const OPEN_REFRESH_ROUNDS = 3;
/** p, or a rejection after ms (p's late answer is dropped). */
function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('VAULT_TIMEOUT')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e: unknown) => { clearTimeout(t); reject(e); });
  });
}

const CHANNEL = 'hoody-hub-crypt';
function announce(type: 'forget' | 'rotate', uid: string): void {
  try {
    const ch = hostEnv().channel(CHANNEL);
    if (!ch) return;
    try { ch.post({ type, uid }); } finally { ch.close(); }
  } catch { /* other tabs still find the vault's state at their next write or recheck */ }
}

/** Hears shared.js purges (installed per shared.js instance). */
function hookPurge(): void {
  try {
    const sh = shared();
    if (hookedShared.has(sh)) return;
    hookedShared.add(sh);
    onBeforeAuthPurge(() => { purgeGen++; });
  } catch { /* shared.js not installed yet */ }
}

/** Opens the shown account (or closes when none is shown, or when the sign-in changed: then it reopens). */
function sync(): void {
  hookPurge();
  // Another account shown: the one before loses its marks, as prefs drops its page copies (prefs.ts onCore).
  const shown = endedUid();
  if (shown !== markedUid) { if (markedUid !== null) dropMarks(markedUid); markedUid = shown; }
  const uid = currentUid(), sid = currentSid();
  if (acct && acct.uid === uid && (acct.sid === sid || sid === null)) return;
  if (acct) close();
  if (!uid) return;
  const a: Account = { uid, sid, vault: vault(), gen: ++gen, phase: 'loading', active: null, bases: new Map(), migrated: new Set(), rec: { account: uid, active: null, signIn: null, migrated: [] }, epoch: null, ready: Promise.resolve(), fence: 0, cleared: 0 };
  acct = a;
  a.ready = load(a).catch(() => {
    if (acct !== a) return;
    a.phase = 'unavailable';
    a.bases = new Map();
    a.active = null;
    // What the opening decrypted before it failed is not confirmed: none of it stays readable.
    cache.clear();
    decrypting.clear();
    slotKeys.clear();
  })
    .finally(() => { if (acct === a) notifyAll(); });
}

const live = (a: Account) => acct === a && a.gen === gen;

async function load(a: Account): Promise<void> {
  const v = a.vault;
  if (!globalThis.crypto || !globalThis.crypto.subtle) throw new Error('CRYPTO_UNAVAILABLE');
  const sidHash = a.sid ? await E.digest('hoody-hub/signin\n' + a.uid + '\n' + a.sid) : null;
  // The vault part finishes even when the account is no longer shown: writes made under it still need its key.
  await exclusive(a.uid, async () => {
    let rec = (await v.account(a.uid)) || { account: a.uid, active: null, signIn: null, migrated: [] };
    const bases = await v.keys(a.uid);
    const usable = rec.active !== null && bases.has(rec.active);
    const rotate = usable && sidHash !== null && rec.signIn !== sidHash;
    const stray = [...bases.keys()].some((id) => id !== rec.active);
    let target: string | null = null;
    if (!usable || rotate) {
      target = E.newKeyId();
      const base = await E.newBaseKey();
      await v.putKey(a.uid, target, base);
      bases.set(target, base);
    } else if (stray) target = rec.active;
    if (target !== null) {
      const ok = await consolidate(a.uid, bases, target);
      if (ok || !usable) {
        rec = { ...rec, active: target, signIn: target !== rec.active ? sidHash : rec.signIn };
        await v.putAccount(rec);
        if (ok) {
          const old = [...bases.keys()].some((id) => id !== target);
          await v.deleteKeys(a.uid, target);
          for (const id of [...bases.keys()]) if (id !== target) bases.delete(id);
          if (old) announce('rotate', a.uid); // other tabs drop the old key handles they hold
        }
      }
    }
    a.rec = rec;
    a.active = rec.active;
    a.bases = bases;
    a.migrated = new Set(rec.migrated);
    a.epoch = rec.epoch ?? null;
  });
  if (!live(a)) { a.phase = 'closed'; return; }
  // Decrypt everything of the account now, so the first render reads opened values.
  for (const l of sealedLeaves(a.uid).leaves) {
    const s: E.Slot = { account: a.uid, part: l.part, key: l.key };
    const opened = await openLeaf(a.bases, s, l.leaf);
    if (!live(a)) { a.phase = 'closed'; return; }
    known.add(l.key);
    const id = l.key + '\n' + l.part;
    if (cache.get(id)?.dirty) continue;
    let value: unknown = null, locked = !opened;
    if (opened) { try { value = JSON.parse(opened.text); } catch { value = null; locked = true; } }
    cache.set(id, { sealed: JSON.stringify(l.leaf), value, locked });
  }
  // A rotation heard while opening: the handles read above may hold the deleted old key, and an old copy must not
  // open with it. What they opened is current; an entry whose stored copy changes is opened again with these.
  // Read again while another rotation came during the read: that read may still hold a key it deleted.
  for (let round = 0; a.rotatedWhileLoading; round++) {
    if (round >= OPEN_REFRESH_ROUNDS) throw new Error('ROTATING'); // rotations keep coming: fails closed
    a.rotatedWhileLoading = false;
    const fresh = await withDeadline(a.vault.keys(a.uid), KEYS_DEADLINE_MS);
    if (!live(a)) { a.phase = 'closed'; return; }
    a.bases = fresh;
    slotKeys.clear();
    lockRevoked(a);
  }
  a.phase = 'open';
  scheduleSweep(a);
}

/** Changes to keys kept at sign-out (a Board change, the guide) that sign-out could lose: accepted writes still being
 *  sealed or stored (sign-out waits for them at most 3 s), accepted writes the browser then refused (status 'unsaved'),
 *  and values the browser would not store that live only in this page (prefs.ts, countPageOnly). A sign-out confirm
 *  reads this first and says so when it is not 0. Purged keys are not counted: sign-out removes them anyway. */
export function pendingPrefWrites(): number {
  let n = 0;
  try { n = pageOnly(); } catch { n = 0; }
  const a = acct;
  return writingKept + (loggingOut() || accountEnded() || !a ? 0 : unsavedKept() + plaintextLeaves(a.uid)) + n;
}
let pageOnly: () => number = () => 0;
/** prefs.ts: how many page-only values of kept keys the shown account has (they go at sign-out). */
export function countPageOnly(fn: () => number): void { pageOnly = fn; }

/** How accepted writes ended for sign-out: 'stored' (all stored, or refused only for purged keys), 'unsaved' (a write of
 *  a key kept at sign-out was not stored once sign-out began: unsavedAtSignOut() counts them), 'plaintext-left' (on a
 *  sign-out the person asked for, the browser refused to remove the account's unsealed plaintext: logout() does not
 *  leave, see clearSignOutPlaintext), 'timeout' (still on their way after timeoutMs). Sign-out waits for it before the
 *  page leaves, so an accepted kept write is not abandoned. */
export type WritesOutcome = 'stored' | 'unsaved' | 'plaintext-left' | 'timeout';
export function cryptWritesSettled(timeoutMs = 3000): Promise<WritesOutcome> {
  const outcome = (): WritesOutcome => (plaintextLeft() ? 'plaintext-left' : lostKept > 0 ? 'unsaved' : 'stored');
  if (!writing) return Promise.resolve(outcome());
  return new Promise<WritesOutcome>((resolve) => {
    const done = (r: WritesOutcome) => { clearTimeout(t); writeWaiters.delete(w); resolve(r); };
    const w = () => done(outcome());
    const t = setTimeout(() => done('timeout'), timeoutMs);
    writeWaiters.add(w);
  });
}
/** Writes of keys kept at sign-out that ended not stored after sign-out began (or the account ended), in this page. */
export function unsavedAtSignOut(): number { return lostKept; }
/** logout() calls this before the account ends: a sign-out the person asked for (hub-shell's confirm named what
 *  pendingPrefWrites() counted). Only then is the account's plaintext that could not be sealed removed. One way. */
export function signOutAsked(): void { askedSignOut = true; }
/** logout()'s check before the page leaves, and its Try again: the unsealed plaintext of each account that ended in a
 *  sign-out the person asked for is removed again (the browser may have refused it). true when none is left as far as
 *  storage can tell; false keeps the page on the purge-failed panel. Another account's entry is never touched. */
export function clearSignOutPlaintext(): boolean {
  for (const uid of askedEnded) if (!sealing.has(uid)) retireHeldWrites(uid);
  for (const uid of askedEnded) if (!sealing.has(uid)) dropAccountPlaintext(uid);
  // Strict: a slot a write still holds, or an account whose seal still runs, counts as left. The page is about to
  // leave, so neither can remove the plaintext after it; Try again judges once they ended.
  for (const uid of askedEnded) if (plaintextLeftOf(uid, true)) return false;
  if (askedSignOut) for (const uid of sealing) if (plaintextLeftOf(uid, true)) return false;
  return true;
}

/** Writes of an account that ended in an asked sign-out, still on their way when the page is about to leave (its seal
 *  ended: past its deadline), over a slot that still holds old plaintext at rest: such a write may never settle (a lock
 *  or vault read that never answers), and while it holds the slot the plaintext cannot be removed. It is retired: its
 *  slot is no longer held (the removal then takes the plaintext), it stores nothing when it settles (persist's
 *  `latest` checks: a retired write returns as superseded), and a kept write's loss is counted here, once. A write
 *  over a slot with no plaintext keeps its bounded wait (sign-out leaves without it, as before). */
function retireHeldWrites(uid: string): void {
  for (const [wid, seq] of [...latest]) {
    if (!wid.startsWith(uid + '\n')) continue;
    const rest = wid.slice(uid.length + 1), cut = rest.indexOf('\n'), key = rest.slice(0, cut), part = rest.slice(cut + 1);
    const leaf = leafIn(readDoc(key), uid, part);
    if (leaf === undefined || E.looksSealed(leaf)) continue;
    latest.delete(wid);
    retired.add(wid + '\n' + seq);
    if (keptKeys.has(key)) lostKept++;
  }
}
/** Writes retired by retireHeldWrites (account, slot and seq): their own end does not count them again. */
const retired = new Set<string>();

/** Resolves once the shown account is opened (or after timeoutMs): boot awaits it before the first render. */
export function cryptReady(timeoutMs = 2000): Promise<void> {
  watch();
  sync();
  const a = acct;
  if (!a || a.phase !== 'loading') return Promise.resolve();
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, timeoutMs);
    void a.ready.then(() => { clearTimeout(t); resolve(); });
  });
}

/** Makes every saved preference of the shown account unreadable on this browser by deleting its keys. */
export async function forgetThisBrowser(): Promise<boolean> {
  watch();
  sync();
  const a = acct;
  if (!a) return false;
  const v = a.vault;
  try {
    await exclusive(a.uid, async () => {
      forgets.set(a.uid, (forgets.get(a.uid) ?? 0) + 1); // a write of this page begun before stores nothing
      const rec = (await v.account(a.uid)) || a.rec;
      // No history left: old plaintext of the account under every pref key this store used goes first. Any left
      // (storage refused the write) and the keys stay too, and Forget says it failed: forgetting them anyway would
      // let the next open seal that plaintext under the new key.
      let left = false;
      for (const [key, parted] of Object.entries({ ...(rec.declared ?? {}), ...Object.fromEntries(declaredKeys) })) if (!dropPlaintext(key, a.uid, parted)) left = true;
      if (left) throw new Error('PLAINTEXT_LEFT');
      // Keys deleted and a new epoch in one transaction: a tab that opened the account before this stores nothing
      // more, even under the next key; an interrupted Forget changes nothing more.
      await v.forget(a.uid, E.newKeyId());
    });
  } catch { return false; } finally {
    forgotten(a.uid);
    announce('forget', a.uid); // other tabs drop their keys and values too
  }
  return true;
}

// ---- sealed blobs (a store outside the pref documents) ----

/** One sealed blob of the shown account: the account it was sealed for and its envelope. */
export interface SealedBlob { readonly uid: string; readonly env: E.Envelope }

/**
 * Seals `text` for the shown account under its active key, for a store that keeps its own rows (ask's transcript cache).
 * The slot (`key`, `part`) is bound into the key and the envelope, so the blob opens only for this account and slot.
 * Null when no account is open here (loading, closed, unverified, forgotten) or the key cannot be read: the caller
 * stores nothing. Nothing is written by this call. A blob is never resealed by a rotation: once its key is deleted it
 * stops opening, which a cache reads as a miss.
 */
export async function sealBlob(key: string, part: string, text: string): Promise<SealedBlob | null> {
  const a = acct;
  if (!a || a.phase !== 'open' || unverified(a)) return null;
  const fg = forgets.get(a.uid) ?? 0;
  try {
    const k = await exclusive(a.uid, () => currentActive(a));
    if (!k || !live(a) || a.phase !== 'open' || unverified(a) || (forgets.get(a.uid) ?? 0) !== fg) return null;
    const s: E.Slot = { account: a.uid, part, key };
    const env = await E.seal(await slotKey(k.base, k.id, s), s, k.id, text);
    // The account must still be the one shown and open once sealed: a blob of an account that ended is not handed out.
    return live(a) && a.phase === 'open' && !unverified(a) && (forgets.get(a.uid) ?? 0) === fg ? { uid: a.uid, env } : null;
  } catch { return null; }
}

/** Opens a blob sealed by sealBlob for the same slot. Null unless `uid` is the shown, open account and one of its keys
 *  here still opens the envelope (another account's blob, another slot's, a forgotten or rotated-away key: null). */
export async function openBlob(uid: string, key: string, part: string, env: unknown): Promise<string | null> {
  const a = acct;
  if (!a || a.uid !== uid || a.phase !== 'open' || unverified(a)) return null;
  try {
    const opened = await openLeaf(a.bases, { account: uid, part, key }, env);
    return opened && live(a) && a.phase === 'open' && !unverified(a) ? opened.text : null;
  } catch { return null; }
}

// ---- background work on a slot ----

function scheduleDecrypt(a: Account, key: string, part: string): void {
  const id = key + '\n' + part;
  if (decrypting.has(id)) return;
  decrypting.add(id);
  busy++;
  void (async () => {
    try {
      await a.ready;
      for (let round = 0; round < 3 && live(a); round++) {
        const leaf = leafIn(readDoc(key), a.uid, part);
        if (leaf === undefined || !E.looksSealed(leaf)) return;
        const text = JSON.stringify(leaf);
        const s: E.Slot = { account: a.uid, part, key };
        const kg = keyGen; // a rotation or Forget heard while this opens: its result is not used, it opens again
        let opened = a.phase === 'open' ? await openLeaf(a.bases, s, leaf) : null;
        const env = E.asEnvelope(leaf);
        if (!opened && env && a.phase === 'open' && !a.bases.has(env.k) && keyGen === kg) {
          // Another tab rotated: take the keys the vault has now.
          try { const b = await withDeadline(a.vault.keys(a.uid), KEYS_DEADLINE_MS); if (keyGen === kg) a.bases = b; } catch { /* refused or past its deadline: stays locked */ }
          if (!live(a)) return;
          opened = await openLeaf(a.bases, s, leaf);
        }
        if (!live(a)) return;
        if (keyGen !== kg) continue;
        if (JSON.stringify(leafIn(readDoc(key), a.uid, part)) !== text) continue;
        const e = cache.get(id);
        if (e?.dirty) return;
        let value: unknown = null, locked = !opened;
        if (opened) { try { value = JSON.parse(opened.text); } catch { value = null; locked = true; } }
        if (unverified(a)) { value = null; locked = true; } // the fence: opened again by reopenLocked once a check answers
        cache.set(id, { sealed: text, value, locked });
        notify(key);
        return;
      }
    } finally { decrypting.delete(id); busy--; }
  })();
}

/**
 * The leaves one write stores for a key: the old plaintext of the account in that document, sealed (all its parts at
 * once, while the key is not migrated yet), plus the slot being written. The key is recorded as migrated only after
 * that write (a crash between keeps the sealed copies, and a sealed value next to plaintext already stops plaintext
 * being read).
 */
async function sealedWrite(a: Account, active: { id: string; base: CryptoKey }, key: string, parted: boolean, slot: { part: string; text: string } | null): Promise<Array<{ part: string; leaf: unknown; text: string }>> {
  const texts = new Map<string, string>();
  if (!a.migrated.has(key)) {
    const d = readDoc(key), v = d && own(d.a, a.uid) ? d.a[a.uid] : undefined;
    if (!holdsSealed(d, a.uid) && v !== undefined) {
      if (!parted) texts.set('', JSON.stringify(v));
      else if (isPlainRecord(v)) for (const p of Object.keys(v)) if (PART.test(p)) texts.set(p, JSON.stringify(v[p]));
    }
    // An old value over VALUE_MAX is not sealed (it would not fit once sealed): it stays as it is, unread (status
    // 'oversized'), until the user writes that slot.
    for (const [p, t] of [...texts]) if (bytes(t) > VALUE_MAX) texts.delete(p);
  }
  if (slot) { texts.delete(slot.part); texts.set(slot.part, slot.text); }
  const out: Array<{ part: string; leaf: unknown; text: string }> = [];
  for (const [part, text] of texts) {
    const s: E.Slot = { account: a.uid, part, key };
    out.push({ part, leaf: await E.seal(await slotKey(active.base, active.id, s), s, active.id, text), text });
  }
  return out;
}

/** Migrates a key's old plaintext for the account (see sealedWrite). */
function scheduleMigrate(a: Account, key: string, parted: boolean): void {
  if (migrating.has(key)) return;
  migrating.add(key);
  busy++;
  void (async () => {
    try {
      await a.ready;
      if (!live(a) || a.phase !== 'open') return;
      let leaves: Array<{ part: string; leaf: unknown; text: string }> = [];
      const done = await exclusive(a.uid, async () => {
        if (!live(a)) return null;
        const before = JSON.stringify(readDoc(key));
        const active = await currentActive(a); // also learns keys another tab migrated meanwhile
        if (!live(a)) return null;
        if (a.migrated.has(key)) return 'migrated';
        if (!active) return false;
        leaves = await sealedWrite(a, active, key, parted, null);
        if (!live(a)) return null;
        if (JSON.stringify(readDoc(key)) !== before) return null; // changed meanwhile: the next read retries
        if (leaves.length && !writeLeaves(key, a.uid, leaves, 'upkeep')) return false;
        await markMigrated(a, key, parted);
        return true;
      }).catch(() => false as const);
      if (done === null || !live(a)) return;
      if (done === 'migrated') {
        // Another tab migrated it: the plaintext this page read is not used.
        for (const [id, e] of cache) if (id.startsWith(key + '\n') && !e.dirty && e.sealed !== null && !E.looksSealed(JSON.parse(e.sealed))) { e.value = null; e.locked = true; }
      } else {
        // Every part read for the migration is this page's copy now (storage plaintext is not read again here);
        // refused, it is marked unsaved and the next page tries again.
        if (done === false) unmigrated.add(key);
        // The fence (a check failed while this ran): nothing opens; a sealed copy opens again when a check answers
        // (reopenLocked), a refused one is retried by the next page.
        const f = unverified(a);
        for (const l of leaves) {
          const id = key + '\n' + l.part, e = cache.get(id);
          if (e && e.dirty) continue;
          let value: unknown = null;
          try { value = f ? null : JSON.parse(l.text); } catch { value = null; }
          cache.set(id, done ? { sealed: JSON.stringify(l.leaf), value, locked: f } : { sealed: e ? e.sealed : null, value, locked: f, unsaved: true });
        }
      }
      notify(key);
    } finally { migrating.delete(key); busy--; }
  })();
}

async function markMigrated(a: Account, key: string, parted: boolean): Promise<void> {
  if (a.migrated.has(key)) return;
  // An old part over VALUE_MAX is not sealed (sealedWrite): while it stays as plaintext the key is not marked
  // migrated, so the open's sweep and Forget still find it; the user's write of that slot replaces it.
  if (oversizedPlaintext(key, a.uid, parted)) return;
  a.migrated.add(key);
  const v = a.vault;
  const rec = (await v.account(a.uid)) || a.rec;
  unmigrated.delete(key);
  if (rec.migrated.includes(key)) return;
  a.rec = { ...rec, migrated: [...rec.migrated, key] };
  await v.putAccount(a.rec);
}

/** The vault's active key now (another tab may have rotated since this one opened). Call inside exclusive(). */
async function currentActive(a: Account): Promise<{ id: string; base: CryptoKey } | null> {
  const v = a.vault;
  const rec = await v.account(a.uid);
  if (rec && (rec.epoch ?? null) !== a.epoch) {
    // Forgotten on this browser since this page opened the account: nothing more is stored from it.
    if (live(a)) forgotten(a.uid);
    return null;
  }
  if (rec) for (const k of rec.migrated) a.migrated.add(k);
  if (!rec || !rec.active) return null;
  if (!a.bases.has(rec.active)) a.bases = await v.keys(a.uid);
  const base = a.bases.get(rec.active);
  if (!base) return null;
  a.active = rec.active;
  return { id: rec.active, base };
}

/**
 * Seals and stores one write. A write belongs to the account it was made under: it is stored for that account even
 * when another account is shown by then, unless a newer write of the slot supersedes it, or, for a key purged at
 * sign-out, a purge (sign-out) came in between: a late write never brings a purged value back.
 */
function persist(a: Account, key: string, parted: boolean, purge: boolean, part: string, seq: number, text: string, expect: string | null, base: string | null): void {
  const id = key + '\n' + part, wid = a.uid + '\n' + id, pg = purgeGen, fg = forgets.get(a.uid) ?? 0;
  latest.set(wid, seq);
  busy++;
  writing++;
  if (!purge) writingKept++;
  void (async () => {
    let stored = false;
    try {
      await a.ready;
      if (a.phase === 'open' || a.phase === 'closed') {
        stored = await exclusive(a.uid, async () => {
          // A newer write stores it, or sign-out retired this one (retireHeldWrites: it stores nothing, its loss is
          // counted there). Also below.
          if (latest.get(wid) !== seq) return true; // a newer write stores it
          const stale = () => (purge && purgeGen !== pg) || (forgets.get(a.uid) ?? 0) !== fg;
          if (stale()) return false;
          const active = await currentActive(a);
          if (!active) return false;
          const leaves = await sealedWrite(a, active, key, parted, { part, text });
          if (latest.get(wid) !== seq) return true; // superseded or retired
          if (stale()) return false;
          // Another tab stored (or removed) the slot after this write was made: it is not written over. The state the
          // write was made against travels with it (an account switch clearing this page's cache does not lose it).
          // Only a reseal of the same value (another tab's rotation) lets the write through; otherwise the stored
          // value wins, this page takes it, and status says 'conflict' (a page that merges, like Board, merges and
          // writes again). Checked again right before the store: nothing between the last check and it awaits.
          const s: E.Slot = { account: a.uid, part, key };
          let checked: string | null = null, verdict: 'store' | 'lost' | null = null, taken: { value: unknown; locked: boolean } | null = null;
          for (let round = 0; round < 3 && verdict === null; round++) {
            const now = leafIn(readDoc(key), a.uid, part), nowText = now === undefined ? null : JSON.stringify(now);
            if (nowText === expect || (now !== undefined && !E.looksSealed(now))) { checked = nowText; verdict = 'store'; break; }
            let opened: { text: string } | null = null;
            if (now !== undefined) {
              const kg = keyGen;
              opened = await openLeaf(a.bases, s, now);
              if (!opened || keyGen !== kg) { try { const b = await withDeadline(a.vault.keys(a.uid), KEYS_DEADLINE_MS); a.bases = b; opened = await openLeaf(a.bases, s, now); } catch { opened = null; } }
            }
            if (latest.get(wid) !== seq) return true; // superseded or retired
            if (JSON.stringify(leafIn(readDoc(key), a.uid, part) ?? null) !== JSON.stringify(now ?? null)) continue; // changed meanwhile
            if (opened && opened.text === base) { checked = nowText; verdict = 'store'; break; }
            let value: unknown = null, locked = now !== undefined && !opened;
            if (opened) { try { value = JSON.parse(opened.text); } catch { value = null; locked = true; } }
            checked = nowText;
            taken = { value, locked };
            verdict = 'lost';
          }
          if (verdict === null) return false; // kept changing: unsaved, retried later
          if (verdict === 'lost') {
            const e = cache.get(id);
            if (live(a) && taken && (!e || e.dirty === seq)) { const f = unverified(a); cache.set(id, { sealed: checked, value: f ? null : taken.value, locked: taken.locked || f, conflict: true }); notify(key); }
            return true;
          }
          if (stale() || JSON.stringify(leafIn(readDoc(key), a.uid, part) ?? null) !== JSON.stringify(checked === null ? null : JSON.parse(checked))) return false;
          if (!writeLeaves(key, a.uid, leaves, 'user')) return false;
          if (live(a)) {
            const e = cache.get(id);
            let filled = !!(e && e.unsaved);
            for (const l of leaves) {
              const lid = key + '\n' + l.part, o = cache.get(lid);
              if (o && (o === e ? o.dirty === seq : !o.dirty)) { o.sealed = JSON.stringify(l.leaf); if (o !== e) o.unsaved = false; }
              else if (!o) {
                // A part this write migrated that the page has not read yet: its value is known, so no read in
                // between shows (or a write starts from) an empty default.
                // The fence (a check failed while this ran): nothing opens; its sealed copy opens again when a
                // check answers (reopenLocked).
                const f = unverified(a);
                let value: unknown = null;
                try { value = f ? null : JSON.parse(l.text); } catch { value = null; }
                cache.set(lid, { sealed: JSON.stringify(l.leaf), value, locked: f });
                filled = true;
              }
            }
            if (e && e.dirty === seq) { delete e.dirty; e.unsaved = false; e.locked = false; filled = true; } // 'saving' ends
            if (filled) notify(key);
          }
          await markMigrated(a, key, parted).catch(() => {});
          return true;
        });
      }
    } catch { stored = false; } finally {
      busy--;
      if (!purge) writingKept--;
      // A kept key's write that sign-out was waiting for and that was not stored: its loss is reported (no status
      // shows it any more: the account is gone).
      if (!retired.delete(wid + '\n' + seq) && !stored && !purge && (loggingOut() || accountEnded())) lostKept++;
      if (latest.get(wid) === seq) latest.delete(wid);
      // A purge came while this write was on its way: the removal left its slot to it; if it did not replace the old
      // plaintext there, the removal runs again now (unless sign-out's seal still runs: it removes when it ends).
      if (purgeGen !== pg) dropAccountPlaintext(a.uid);
      if (--writing === 0) for (const w of [...writeWaiters]) w();
    }
    if (!live(a)) return;
    const e = cache.get(id);
    if (!stored && e && e.dirty === seq && !e.unsaved) { e.unsaved = true; notify(key); }
  })();
}

/**
 * A refused store is tried again with the same value (the user's own write; a newer set() supersedes it): on a
 * storage event of the key (space may have been freed) and on a read, at most every RETRY_MS per slot.
 */
function retryUnsaved(a: Account, key: string, parted: boolean, purge: boolean, part: string, force: boolean): void {
  const id = key + '\n' + part, wid = a.uid + '\n' + id, e = cache.get(id);
  if (!e || !e.unsaved || !e.dirty || latest.has(wid) || !live(a) || a.phase !== 'open') return;
  const now = Date.now();
  if (!force && now - (retriedAt.get(wid) ?? -Infinity) < RETRY_MS) return;
  retriedAt.set(wid, now);
  let text: string;
  try { text = JSON.stringify(e.value); } catch { return; }
  persist(a, key, parted, purge, part, e.dirty, text, e.expect ?? null, e.base ?? null);
}

/** Deletes this account's old plaintext leaves in a key's document (sealed ones stay). Forget only. true only when
 *  none is left as far as storage can tell: false when the browser refused the write or a read (unknown is not clean). */
function dropPlaintext(key: string, uid: string, parted: boolean): boolean {
  let reg: unknown = null;
  try { reg = storageEntry('local', key); } catch { return false; }
  if (!reg) return true; // an unregistered key is never written or read
  const b = box(), f = readKey(key);
  if (!b || f.state === 'failed') return false;
  if (f.state !== 'doc') return true; // nothing stored, or not this layout (a newer one is never written)
  const d = f.doc;
  if (!plaintextIn(d, uid, parted)) return true;
  const v = d.a[uid];
  if (!parted) delete d.a[uid];
  else if (isPlainRecord(v)) {
    for (const p of Object.keys(v)) if (!E.looksSealed(v[p])) delete v[p];
    if (!Object.keys(v).length) delete d.a[uid];
  } else delete d.a[uid]; // malformed (not an object): see plaintextLeaves
  try { if (Object.keys(d.a).length) b.setItem(key, JSON.stringify(d)); else b.removeItem(key); } catch { /* checked below */ }
  const g = readKey(key);
  if (g.state === 'failed') return false;
  return g.state !== 'doc' || !plaintextIn(g.doc, uid, parted);
}

/** Old plaintext leaves of an account under keys kept at sign-out, any size, not counting a slot a write of the
 *  account is on (that write replaces it). What sign-out would remove: pendingPrefWrites() counts it beforehand.
 *  A malformed entry under a split key (a string, number, array or null where the account's parts belong) is not
 *  counted and never sealed: no page can read it, and any later save replaces it. An asked sign-out (and Forget)
 *  removes it for that account, uncounted, like plaintext over VALUE_MAX at any end. */
function plaintextLeaves(uid: string): number {
  let n = 0;
  for (const [key, parted] of declaredKeys) {
    if (!keptKeys.has(key)) continue;
    const d = readDoc(key);
    if (!d || !own(d.a, uid)) continue;
    const v = d.a[uid];
    if (!parted) { if (!E.looksSealed(v) && !latest.has(uid + '\n' + key + '\n')) n++; }
    else if (isPlainRecord(v) && !E.looksSealed(v)) for (const p of Object.keys(v)) if (!E.looksSealed(v[p]) && !latest.has(uid + '\n' + key + '\n' + p)) n++;
  }
  return n;
}

/** Accounts whose old plaintext is being sealed at their end; and those whose plaintext was dealt with at their end in
 *  this page (the teardown does not count it twice). */
const sealing = new Set<string>();
const plaintextEnded = new Set<string>();
/** Accounts that ended in a sign-out the person asked for: their unsealed plaintext must not stay at rest. */
const askedEnded = new Set<string>();
/** How long the seal of old plaintext at the account's end may take (inside cryptWritesSettled's 3 s). */
const SEAL_DEADLINE_MS = 2000;

/**
 * Sign-out began, or the account ended, while it was shown: its old plaintext under keys kept at sign-out (a Board
 * never migrated) is sealed for it now, with the keys the page still holds, one key at a time under the account's
 * lock (counted as a kept write: sign-out waits for it). Within SEAL_DEADLINE_MS; then endPlaintext deals with what
 * is still plaintext. Without keys (the account never opened) nothing is sealed.
 */
function sealAtSignOut(a: Account): void {
  const uid = a.uid;
  if (sealing.has(uid) || plaintextEnded.has(uid) || !plaintextLeaves(uid)) return;
  sealing.add(uid);
  busy++;
  writing++;
  writingKept++;
  void (async () => {
    try {
      if (a.phase === 'open') {
        await withDeadline(exclusive(uid, async () => {
          const active = await currentActive(a);
          if (!active) return;
          for (const [key, parted] of declaredKeys) {
            if (!sealing.has(uid)) return; // past the deadline: endPlaintext deals with the rest
            if (!keptKeys.has(key) || !hasPlaintext(key, uid, parted)) continue;
            const before = JSON.stringify(readDoc(key));
            const leaves = (await sealedWrite(a, active, key, parted, null)).filter((l) => !latest.has(uid + '\n' + key + '\n' + l.part));
            if (!leaves.length || !sealing.has(uid) || JSON.stringify(readDoc(key)) !== before) continue;
            writeLeaves(key, uid, leaves, 'upkeep');
          }
        }), SEAL_DEADLINE_MS);
      }
    } catch { /* refused, or past its deadline: endPlaintext deals with what is still plaintext */ } finally {
      sealing.delete(uid);
      endPlaintext(uid);
      busy--;
      writingKept--;
      if (--writing === 0) for (const w of [...writeWaiters]) w();
    }
  })();
}

/** The account's end, for its old plaintext. A sign-out the person asked for: what is left is counted (lost: the
 *  confirm named it) and removed. Any other end: only what is over VALUE_MAX goes, uncounted; the rest stays for the
 *  next open's migration. */
function endPlaintext(uid: string): void {
  plaintextEnded.add(uid);
  if (askedSignOut) { lostKept += plaintextLeaves(uid); askedEnded.add(uid); }
  dropAccountPlaintext(uid);
  if (askedSignOut && plaintextLeftOf(uid)) retryDrop(uid, DROP_RETRIES);
}

/** A removal the browser refused (a rewrite: another account's entry is in the document) is tried again, `n` times
 *  DROP_RETRY_MS apart, inside sign-out's wait (counted as a write); what is still left then takes logout() to the
 *  purge-failed panel (clearSignOutPlaintext). Never by removing the whole key: another account's entry stays. */
const DROP_RETRIES = 3;
const DROP_RETRY_MS = 250;
function retryDrop(uid: string, n: number): void {
  busy++;
  writing++;
  setTimeout(() => {
    try {
      dropAccountPlaintext(uid);
      if (n > 1 && plaintextLeftOf(uid)) retryDrop(uid, n - 1);
    } finally {
      busy--;
      if (--writing === 0) for (const w of [...writeWaiters]) w();
    }
  }, DROP_RETRY_MS);
}

/** An account that ended in an asked sign-out still has unsealed plaintext in storage (or a document cannot be read:
 *  unknown is not clean). A slot a write of the account is still on is left to that write (it removes again when it
 *  ends); while the account's seal runs, nothing is judged yet. Only the check before the page leaves is strict
 *  (clearSignOutPlaintext): there, both count as left. */
function plaintextLeft(): boolean {
  for (const uid of askedEnded) if (!sealing.has(uid) && plaintextLeftOf(uid)) return true;
  return false;
}
function plaintextLeftOf(uid: string, strict = false): boolean {
  const held = (key: string, part: string) => !strict && latest.has(uid + '\n' + key + '\n' + part);
  for (const [key, parted] of declaredKeys) {
    const f = readKey(key);
    if (f.state === 'failed') return true;
    if (f.state !== 'doc' || !own(f.doc.a, uid)) continue;
    const v = f.doc.a[uid];
    if (!parted) { if (!E.looksSealed(v) && !held(key, '')) return true; }
    else if (isPlainRecord(v) && !E.looksSealed(v)) { for (const p of Object.keys(v)) if (!E.looksSealed(v[p]) && !held(key, p)) return true; }
    else if (!E.looksSealed(v)) return true;
  }
  return false;
}

/** The account ended: on a sign-out the person asked for (signOutAsked), its old plaintext of any size is removed
 *  from every pref key this page knows, kept keys too, that account only, so none stays at rest after sign-out; on any
 *  other end only plaintext over VALUE_MAX is (it can never be sealed; the rest migrates at the next open). The seal
 *  ran first (sealAtSignOut; while it runs, this waits for it). One read of the document is tested and
 *  written back (nothing awaits in between). A slot with a write of this account on its way is left to that write (it
 *  replaces the plaintext; removing it first would read as another tab's removal and lose the write); the write runs
 *  this again when it ends. */
function dropAccountPlaintext(uid: string | null): void {
  if (!uid || sealing.has(uid)) return;
  const b = box();
  if (!b) return;
  const writingTo = (key: string, part: string) => latest.has(uid + '\n' + key + '\n' + part);
  const goes = (x: unknown) => !E.looksSealed(x) && (askedSignOut || bytes(JSON.stringify(x)) > VALUE_MAX);
  for (const [key, parted] of declaredKeys) {
    const f = readKey(key);
    if (f.state !== 'doc' || !own(f.doc.a, uid)) continue;
    const d = f.doc, v = d.a[uid];
    let changed = false;
    if (!parted) {
      if (goes(v) && !writingTo(key, '')) { delete d.a[uid]; changed = true; }
    } else if (isPlainRecord(v) && !E.looksSealed(v)) {
      for (const p of Object.keys(v)) if (goes(v[p]) && !writingTo(key, p)) { delete v[p]; changed = true; }
      if (changed && !Object.keys(v).length) delete d.a[uid];
    } else if (!isPlainRecord(v) && goes(v)) { delete d.a[uid]; changed = true; } // malformed (not an object): see plaintextLeaves
    if (!changed) continue;
    try { if (Object.keys(d.a).length) b.setItem(key, JSON.stringify(d)); else b.removeItem(key); } catch { /* the browser refused: it stays (counted already) */ }
  }
}

/** True when the account has old plaintext in a key's document. */
function plaintextIn(d: Doc, uid: string, parted: boolean): boolean {
  const v = own(d.a, uid) ? d.a[uid] : undefined;
  if (v === undefined || E.looksSealed(v)) return false;
  if (!parted) return true;
  return isPlainRecord(v) ? Object.values(v).some((x) => !E.looksSealed(x)) : true;
}

/** True when the account has an old plaintext leaf over VALUE_MAX under a key. */
function oversizedPlaintext(key: string, uid: string, parted: boolean): boolean {
  const d = readDoc(key), v = d && own(d.a, uid) ? d.a[uid] : undefined;
  if (v === undefined || E.looksSealed(v)) return false;
  const big = (x: unknown) => !E.looksSealed(x) && bytes(JSON.stringify(x)) > VALUE_MAX;
  return !parted ? big(v) : isPlainRecord(v) && Object.values(v).some(big);
}

/** True when the account has old plaintext under a key. */
function hasPlaintext(key: string, uid: string, parted: boolean): boolean {
  const d = readDoc(key), v = d && own(d.a, uid) ? d.a[uid] : undefined;
  if (v === undefined || E.looksSealed(v)) return false;
  if (!parted) return true;
  return isPlainRecord(v) && Object.values(v).some((x) => !E.looksSealed(x));
}

/**
 * Migrates the account's old plaintext under every pref key this browser's store has used (recorded in the vault,
 * so a key is swept at open even before its page runs), and records keys newly declared in this page.
 */
function scheduleSweep(a: Account): void {
  busy++;
  void (async () => {
    try {
      await a.ready;
      if (!live(a) || a.phase !== 'open') return;
      const keys = await exclusive(a.uid, async () => {
        const v = a.vault;
        const rec = (await v.account(a.uid)) || a.rec;
        const all: Record<string, boolean> = { ...(rec.declared ?? {}) };
        let grew = false;
        for (const [k, parted] of declaredKeys) if (all[k] !== parted) { all[k] = parted; grew = true; }
        if (grew && live(a)) { a.rec = { ...rec, declared: all }; await v.putAccount(a.rec); }
        return all;
      }).catch(() => ({ ...Object.fromEntries(declaredKeys) }));
      if (!live(a) || a.phase !== 'open') return;
      for (const [key, parted] of Object.entries(keys)) {
        if (a.migrated.has(key) || !hasPlaintext(key, a.uid, parted)) continue;
        let reg: unknown = null;
        try { reg = storageEntry('local', key); } catch { reg = null; }
        if (reg) scheduleMigrate(a, key, parted);
      }
    } finally { busy--; }
  })();
}

/**
 * Declares the pref keys the Hub uses (prefs.ts's fixed list) before any page asks for them, so the open migrates
 * the account's old plaintext under each and Forget deletes it, whether or not its page has run yet. The value says
 * whether the key is split in parts (a scope other than 'account'). `kept` names the keys kept at sign-out, so sign-out
 * seals, counts and removes their plaintext even when their page never ran. A key the storage registry does not list
 * is never written (the sweep and Forget check); migration writes in place only, so the sign-out caps do not apply.
 */
export function declareCryptKeys(keys: Readonly<Record<string, boolean>>, kept: readonly string[] = []): void {
  for (const key of kept) if (own(keys, key)) keptKeys.add(key);
  let grew = false;
  for (const [key, parted] of Object.entries(keys)) {
    if (declaredKeys.get(key) !== parted) { declaredKeys.set(key, parted); grew = true; }
  }
  if (grew && acct && acct.phase === 'open') scheduleSweep(acct);
}

// ---- the store ----

/** peek()'s answer when the read cannot tell (one frozen object, so a subscriber sees no change). */
const UNKNOWN: CryptPeek = Object.freeze({ value: null, known: false });

/** kit-io partitioned() over sealed values. Throws STORE_UNREGISTERED like it. */
export function cryptPartitioned(key: string, o: { scope: StoreScope; purge?: unknown }): CryptPartitioned {
  partitioned(key, { scope: o.scope, area: 'local', purge: o.purge }); // the registration check, nothing else
  known.add(key);
  if (o.purge === false) keptKeys.add(key);
  const parted = o.scope !== 'account', purge = o.purge !== false;
  if (declaredKeys.get(key) !== parted) {
    declaredKeys.set(key, parted);
    watch();
    if (acct && acct.phase === 'open') scheduleSweep(acct);
  }
  unsavedRetry.set(key, (a, part, force) => retryUnsaved(a, key, parted, purge, part, force));
  const partOf = (part?: string): string | null => (!parted ? '' : typeof part === 'string' && PART.test(part) ? part : null);
  function here(part?: string): { a: Account; p: string } | null {
    watch();
    sync();
    const uid = currentUid(), p = partOf(part);
    return acct && uid && acct.uid === uid && p !== null ? { a: acct, p } : null;
  }
  function get(part?: string): unknown {
    const h = here(part);
    if (!h) return null;
    const { a, p } = h;
    if (a.phase !== 'open') return null; // opening (keys not yet confirmed) or unavailable: nothing shows
    const id = key + '\n' + p;
    const e = cache.get(id);
    if (e && e.dirty) { if (e.unsaved) retryUnsaved(a, key, parted, purge, p, false); return e.value; }
    const d = readDoc(key);
    const leaf = leafIn(d, a.uid, p);
    if (leaf === undefined) { if (e && !e.unsaved && !e.conflict) cache.delete(id); return e && e.unsaved ? e.value : null; }
    const text = JSON.stringify(leaf);
    if (e && e.sealed === text) return e.locked ? null : e.value;
    if (E.looksSealed(leaf)) {
      scheduleDecrypt(a, key, p);
      return e && !e.locked ? e.value : null;
    }
    // Old plaintext: read once, on an open account whose key is not migrated, and that read starts its migration.
    // It is never read while the account opens (its migrated keys are not known yet: 'loading') or cannot open
    // ('locked'), once the key is migrated or holds a sealed value, after its migration started in this page (the
    // page then reads its own copy), or over VALUE_MAX (it could not be sealed: 'oversized').
    if (a.phase !== 'open') return null;
    if (a.migrated.has(key) || holdsSealed(d, a.uid) || bytes(text) > VALUE_MAX) {
      cache.set(id, { sealed: text, value: null, locked: true });
      return null;
    }
    if (migrating.has(key) || unmigrated.has(key)) return e && !e.locked ? e.value : null;
    if (unverified(a)) return null; // the fence: a missed Forget would have removed it
    let value: unknown = null;
    try { value = JSON.parse(text); } catch { value = null; }
    cache.set(id, { sealed: text, value, locked: false });
    scheduleMigrate(a, key, parted);
    return value;
  }
  function set(value: unknown, part?: string): boolean {
    const h = here(part);
    // Refused while the account opens too: a value built from defaults would replace the saved one (prefs keeps it
    // for this page: 'page'; status() says 'loading').
    if (!h || h.a.phase !== 'open') return false;
    let text: string | undefined;
    try { text = JSON.stringify(value); } catch { text = undefined; }
    const id = key + '\n' + h.p, big = h.a.uid + '\n' + id;
    if (typeof text !== 'string') return false;
    if (bytes(text) > VALUE_MAX) { oversized.add(big); notify(key); return false; }
    if (readKey(key).state === 'newer') return false; // kept for this page (prefs: 'page'); the newer layout stays
    oversized.delete(big);
    const prev = cache.get(id);
    if (!prev || !prev.dirty) {
      // A value stored by another tab that this page has not opened yet: a write now would be built on the older
      // value and replace it (kit-io read storage synchronously; here opening is async). Refused while it opens
      // (status 'loading', no page copy); subscribers hear it once open, and a page that merges writes again then.
      const leaf = leafIn(readDoc(key), h.a.uid, h.p);
      // Old plaintext the open's sweep is migrating and this page has not read: a write now would be built on the
      // default and land after the migration, over the saved value. Refused until it is sealed (status 'loading').
      if (leaf !== undefined && !E.looksSealed(leaf) && migrating.has(key) && (!prev || prev.locked)) return false;
      if (leaf !== undefined && E.looksSealed(leaf) && JSON.stringify(leaf) !== (prev ? prev.sealed : null)) {
        scheduleDecrypt(h.a, key, h.p);
        return false;
      }
    }
    const base = prev ? (prev.dirty ? (prev.base ?? null) : prev.locked ? null : JSON.stringify(prev.value)) : null;
    const seq = ++writeSeq;
    // The stored state this write is made against: the one the page shows (or the first pending write's).
    const stored = leafIn(readDoc(key), h.a.uid, h.p);
    const expect = prev ? (prev.dirty ? (prev.expect ?? null) : prev.sealed) : stored === undefined ? null : JSON.stringify(stored);
    cache.set(id, { sealed: prev ? prev.sealed : null, value: JSON.parse(text), locked: false, dirty: seq, base, expect });
    persist(h.a, key, parted, purge, h.p, seq, text, expect, base);
    return true;
  }
  function remove(part?: string): boolean {
    const h = here(part);
    if (!h) return false;
    // A write of the slot still on its way stores nothing now (it would bring the removed value back).
    const id = key + '\n' + h.p, wid = h.a.uid + '\n' + id;
    if (latest.has(wid)) latest.set(wid, ++writeSeq);
    cache.delete(id);
    const b = box(), d = readDoc(key);
    if (!b || !d || !own(d.a, h.a.uid)) return false;
    try {
      if (h.p === '') delete d.a[h.a.uid];
      else {
        const m = d.a[h.a.uid];
        if (isPlainRecord(m)) { delete m[h.p]; if (!Object.keys(m).length) delete d.a[h.a.uid]; }
      }
      if (Object.keys(d.a).length) b.setItem(key, JSON.stringify(d)); else b.removeItem(key);
    } catch { return false; }
    return true;
  }
  function status(part?: string): CryptRead {
    const h = here(part);
    if (!h) return 'ok';
    if (oversized.has(h.a.uid + '\n' + key + '\n' + h.p)) return 'oversized';
    if (h.a.phase === 'loading') return 'loading';
    const e = cache.get(key + '\n' + h.p);
    if (e && e.unsaved) return 'unsaved';
    if (e && e.dirty) return 'saving';
    if (h.a.phase === 'open' && unverified(h.a)) return 'locked'; // the fence: get() shows nothing until a check answers
    if (e && e.conflict) return e.locked ? 'locked' : 'conflict'; // a winner that does not open is never written over
    const d = readDoc(key), leaf = leafIn(d, h.a.uid, h.p);
    if (leaf === undefined) return 'ok';
    const text = JSON.stringify(leaf);
    if (!E.looksSealed(leaf)) {
      // Old plaintext (see get()).
      if (bytes(text) > VALUE_MAX) return 'oversized';
      if (h.a.phase !== 'open' || h.a.migrated.has(key) || holdsSealed(d, h.a.uid)) return 'locked';
      if (unmigrated.has(key)) return 'unsaved';
      if (migrating.has(key) && (!e || e.locked)) return 'loading'; // being sealed; not read by this page
    }
    if (e && e.sealed === text) return e.locked ? 'locked' : 'ok';
    // A sealed value this page has not opened yet (another tab's write): 'loading' until it is, writes refused.
    if (E.looksSealed(leaf)) {
      if (h.a.phase !== 'open') return 'locked';
      scheduleDecrypt(h.a, key, h.p); // a page may ask status() (prefs' write does) before any get() or storage event
      return 'loading';
    }
    return 'ok';
  }
  /** get() with kit-io's layout reason when bytes are stored but not usable (a value that does not open is
   *  status() 'locked', not a reset). */
  function read(part?: string): { value: unknown; reset: StoreReset | null } {
    const value = get(part);
    const h = here(part);
    if (!h) return { value, reset: null };
    let raw: string | null = null;
    try { raw = box()?.getItem(key) ?? null; } catch { raw = null; }
    const f = readKey(key), d = f.state === 'doc' ? f.doc : null;
    if (f.state === 'newer') return { value: null, reset: 'newer' };
    if (raw !== null && !d) return { value: null, reset: 'foreign' };
    const v = d && own(d.a, h.a.uid) ? d.a[h.a.uid] : undefined;
    if (parted && v !== undefined && (!isPlainRecord(v) || E.looksSealed(v))) return { value: null, reset: 'malformed' };
    // Old plaintext over VALUE_MAX is never read (it could not be sealed): kit-io's 'oversized', bytes kept.
    const leaf = leafIn(d, h.a.uid, h.p);
    if (leaf !== undefined && !E.looksSealed(leaf) && bytes(JSON.stringify(leaf)) > VALUE_MAX) return { value: null, reset: 'oversized' };
    return { value, reset: null };
  }
  /** set() with what the write will do to other entries, as kit-io reports it (counted now; stored in the background). */
  function put(value: unknown, part?: string): StorePut {
    const evicted = { accounts: 0, parts: 0 };
    let raw: string | null = null;
    try { raw = box()?.getItem(key) ?? null; } catch { raw = null; }
    const d = readDoc(key), foreign = raw !== null && !d;
    const h = here(part);
    if (!set(value, part) || !h) return { ok: false, evicted, replacedForeign: false };
    const kept = keptKeys.has(key);
    const a = d ? d.a : {}, others = Object.keys(a).filter((u) => u !== h.a.uid).length;
    evicted.accounts = Math.max(0, others + 1 - (kept ? KEPT_ACCOUNTS : STORE_ACCOUNTS));
    if (parted) {
      // The parts stored, plus those whose write is still on its way (they land before this one).
      const m = a[h.a.uid], names = new Set<string>(isPlainRecord(m) && !E.looksSealed(m) ? Object.keys(m) : []);
      const pre = h.a.uid + '\n' + key + '\n';
      for (const w of latest.keys()) if (w.startsWith(pre) && cache.get(key + '\n' + w.slice(pre.length))?.dirty) names.add(w.slice(pre.length));
      names.delete(h.p);
      evicted.parts = Math.max(0, names.size + 1 - (kept ? KEPT_PARTS : STORE_PARTS));
    }
    return { ok: true, evicted, replacedForeign: foreign };
  }
  function peek(part?: string): CryptPeek {
    // The shown account as the lifecycle opened it, never opened from here (sync() would start the opening's vault
    // writes and its migration sweep): another or no account, or a new sign-in not synced yet, is not known.
    const uid = currentUid(), sid = currentSid(), p = partOf(part), a = acct;
    if (!a || !uid || a.uid !== uid || (a.sid !== sid && sid !== null) || p === null || !live(a)) return UNKNOWN;
    if (a.phase !== 'open') return UNKNOWN;
    const e = cache.get(key + '\n' + p);
    if (e && e.dirty) return { value: e.value, known: true }; // this page's own write, as get(); a refused one is not retried here
    if (unverified(a)) return UNKNOWN; // the fence: no stored value is shown until a check answers
    const f = readKey(key);
    if (f.state === 'failed') return UNKNOWN;
    const d = f.state === 'doc' ? f.doc : null;
    const leaf = leafIn(d, a.uid, p);
    if (leaf === undefined) return { value: e && e.unsaved ? e.value : null, known: true };
    const text = JSON.stringify(leaf);
    if (e && e.sealed === text) return { value: e.locked ? null : e.value, known: true };
    if (E.looksSealed(leaf)) {
      scheduleDecrypt(a, key, p);
      return e && !e.locked ? { value: e.value, known: true } : UNKNOWN;
    }
    // Old plaintext (see get()): never read here. What get() would show without reading it: nothing for one it never
    // reads, this page's copy while its migration runs or was refused; otherwise unknown.
    if (a.migrated.has(key) || holdsSealed(d, a.uid) || bytes(text) > VALUE_MAX) return { value: null, known: true };
    if ((migrating.has(key) || unmigrated.has(key)) && e && !e.locked) return { value: e.value, known: true };
    return UNKNOWN;
  }
  return Object.freeze({ get, read, set, put, remove, status, peek });
}

/** Tests only: a fresh store over `v` (default: the host env's vault). tabLocks (default true): without Web Locks (happy-dom),
 *  run one at a time within the page; false = as a real browser without them (fails closed). newPage: also forget
 *  which keys were declared kept at sign-out. */
export function resetCryptForTests(v: Vault | null = null, o: { tabLocks?: boolean; newPage?: boolean } = {}): void {
  close();
  vaultImpl = v;
  known.clear();
  oversized.clear();
  markedUid = null;
  if (o.newPage) { keptKeys.clear(); declaredKeys.clear(); unsavedRetry.clear(); } // as a new page: nothing declared yet
  lostKept = 0; plaintextEnded.clear(); sealing.clear(); askedEnded.clear(); retired.clear(); askedSignOut = false; // every page starts with no sign-out
  retriedAt.clear();
  tabLocks = o.tabLocks ?? true;
  chain = Promise.resolve();
}

/** Tests only: what is stored for the shown account in a slot, opened (null: nothing, or it does not open).
 *  part: omit for an account-wide pref. Reads storage, not this page's cache. */
export async function storedForTests(key: string, part = ''): Promise<unknown> {
  await cryptIdleForTests();
  const a = acct;
  if (!a) return null;
  const leaf = leafIn(readDoc(key), a.uid, part);
  if (leaf === undefined) return null;
  const opened = await openLeaf(a.bases, { account: a.uid, part, key }, leaf);
  return opened ? JSON.parse(opened.text) : null;
}

/** Tests only: stores `value` sealed for the shown account as another tab would (storage only, no event). */
export async function writeSealedForTests(key: string, part: string, value: unknown): Promise<void> {
  await cryptIdleForTests();
  const a = acct;
  if (!a || !a.active) throw new Error('no open account');
  const base = a.bases.get(a.active) as CryptoKey, s: E.Slot = { account: a.uid, part, key };
  const env = await E.seal(await slotKey(base, a.active, s), s, a.active, JSON.stringify(value));
  if (!writeLeaves(key, a.uid, [{ part, leaf: env }], 'user')) throw new Error('storage refused');
}

/** Tests only: settles once the account is opened and every background read and write has finished. */
/** Tests only: the vault this store uses (a page test plays another tab's rotation with it). */
export function vaultForTests(): Vault { return acct ? acct.vault : vault(); }

/** Tests only: a migration of the key is running in this page. */
export function migratingForTests(key: string): boolean { return migrating.has(key); }

export async function cryptIdleForTests(): Promise<void> {
  for (let i = 0; i < 200; i++) {
    await acct?.ready;
    await chain;
    await new Promise((r) => realTimeout(r, 0)); // real time even under a test's fake timers
    if (!busy && (!acct || acct.phase !== 'loading')) return;
  }
  throw new Error('crypt store never settled');
}
