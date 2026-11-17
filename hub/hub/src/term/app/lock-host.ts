// The passcode host of a live terminal mount. The live boot does not install it (the session's `passcodeLock` is
// false); installing it means setting `passcodeLock` from `capable()`, feeding `state()` into the policy's row 1 and
// routing the lock view's Enter through `tryUnlock`.
//
// The engine is the web's (core/applock.ts, DOM-free); this file is only its host:
//   - Record: `hub_lock:<uid>` in the store's store.json (group c), through `lockStorage`, never through the registry
//     seam (persist.ts keeps no prefix rows). Reads come from the store's verified copy; a write goes to disk (temp,
//     fsync, rename) or THROWS: never a memory fallback, so a wrong try that was not kept is never counted as kept.
//     Only the account's own key; a value that is not a valid record is refused.
//   - No area: `noStore: 'absent'` (no store directory: first run, no home) has
//     nothing to protect: the engine reads an empty, unwritable store, the mount opens unlocked (read-only by row 6).
//     Anything else (a store directory that exists but cannot be used, or no reason given) gives the engine no storage:
//     it reads "malformed" and starts locked; Forget cannot work there, so `notice()` hands the lock view the path and
//     the reason to name, with the repair by hand. A store that fails mid-mount keeps reading its verified copy (a
//     lock stays a lock) and refuses every unlock try ('no-store'); `notice()` then names it too. A try-limit forget
//     that could not finish (a corrupt `hub.v3.changes`, a failed write) keeps the account on the lock view at every
//     start (fail closed); `notice()` names it as 'forget-failed' so the view can give the move-aside repair.
//   - Lock: the engine's own hold (`hub-lock:<uid>`) on the session's lock manager; across processes the store's flock
//     stands in (only the read-write mount writes). Locked at start when a record exists (`bootGate`, called here, so
//     before the first page draws); on the menu's Lock; after idle (the record's own minutes; only INPUT counts:
//     `input()`, never output); on resume from suspend (`resume()`). Idle never ends the mount.
//   - Every lock and every unlock moves the policy generation (`bump`): an Admission minted before it is void, and
//     `state()` is 'locked' (row 1, TERM_LOCKED) until unlock. A lock also wipes shown secrets (`wipe`).
//   - Unlock: only a read-write mount (`tryUnlock`). Every other refuses each try without verifying, as it cannot keep
//     the try count (`refused`): 'other-hub' (a second mount: "unlock in the Hub that is already open"),
//     'read-only-choice' (opened read-only by choice: "reopen without read-only to unlock"), 'no-store'.
//   - The wrong-try limit (MAX_TRIES) runs the terminal path: `forgetAccountData` deletes this account's Hub data from
//     the store, pending records included (as on the web), the record LAST (a forget cut short keeps
//     `out`, so the next start runs it again). Kept, as obligations rather than data: group (d) (tokens still to
//     revoke) and every held boot-token mint record (`term.direct.boot-token-mint:<op>` in hub.v3.changes: the only
//     trace of a token that may exist; the boot-token recovery revokes it by its name). Then `leave`.
//     A forget that could not finish leaves the lock view up (the engine re-reads `out`).
//   - Token session (`uid()` null): inert, as on the web. `capable()` (the `passcodeLock` capability) is true only for an
//     account session on a read-write store.
import { bootGate, checkIdle, checkPasscode, configureAppLock, isLocked, leaveTab, lockNow, lockTab, LOCK_PREFIX, noteInput, onLockChange, validRecord, type CheckResult, type LockEnv } from '../../core/applock';
import { IDLE_TICK_MS } from '../../core/applock-host.pure';
import { ATTEMPT_PREFIX, CHANGE_STORE_KEY } from '../../core/change-store';
import type { HostLocks } from '../../core/host-env';
import type { PersistArea } from '../env/persist';
import { BOOT_MINT_LOCK_PREFIX } from './live-direct';
import { storeModeOf } from './live-records';

export { IDLE_TICK_MS };

/** Obligations, not Hub data. Forgetting them would leave live tokens nobody revokes. */
export const KEPT_ON_FORGET: readonly string[] = Object.freeze(['term.boot_keys', 'term.new_key']);

type LockArea = Pick<PersistArea, 'readOnly' | 'failed' | 'get' | 'set' | 'del'>;
type StorageLike = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

const parses = (v: string): unknown => { try { return JSON.parse(v) as unknown; } catch { return undefined; } };

/** The engine's storage over the store: the account's own record only; a write is on disk when it returns, or throws. */
export function lockStorage(area: LockArea | null, uid: () => string | null, readOnlyChoice = false, absent = false): StorageLike | null {
  if (!area) {
    if (!absent) return null;
    const none = (): never => { throw new Error('there is no store here'); };
    return { getItem: () => null, setItem: none, removeItem: none };
  }
  const own = (k: string): boolean => { const u = uid(); return !!u && k === LOCK_PREFIX + u; };
  const writable = (): void => { if (storeModeOf(area, readOnlyChoice) !== 'rw') throw new Error('the store is not writable here'); };
  return {
    getItem: (k) => (own(String(k)) ? area.get(String(k)) : null),
    setItem(k, v) {
      const key = String(k), value = String(v);
      if (!own(key) || !validRecord(parses(value))) throw new Error('not the lock record of this account');
      writable();
      area.set(key, value);
    },
    removeItem(k) {
      const key = String(k);
      if (!own(key)) throw new Error('not the lock record of this account');
      writable();
      area.del(key);
    },
  };
}

/** A held boot-token mint record (core attempts.ts record whose lock is `term.direct.boot-token-mint:<op>`). The storage
 *  seam (live-wire.ts seamArea) keeps them through Remove all local data by the same two functions. */
export const bootMintRecord = (r: unknown): boolean => {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
  const o = r as { id?: unknown; meta?: { base?: unknown } | null };
  return typeof o.id === 'string' && o.id.startsWith(ATTEMPT_PREFIX) && typeof o.meta?.base === 'string' && o.meta.base.startsWith(BOOT_MINT_LOCK_PREFIX);
};
/** The held boot-mint records of a hub.v3.changes value, as stored (an unreadable value: null, so nothing is dropped). */
export function bootMintRecords(text: string | null): unknown[] | null {
  if (text === null) return [];
  const list = parses(text);
  return Array.isArray(list) ? list.filter(bootMintRecord) : null;
}

/** The terminal path's Forget: the held boot-mint records are kept (hub.v3.changes rewritten with only them), every
 *  other journal key goes, then every store.json key but group (d), the lock record last. An unreadable changes value
 *  is not dropped (it may hold a mint record): the forget fails and the lock view stays. */
export function forgetAccountData(area: PersistArea | null, uid: string, readOnlyChoice = false): 'purged' | 'failed' {
  if (!area || storeModeOf(area, readOnlyChoice) !== 'rw') return 'failed';
  const record = LOCK_PREFIX + uid;
  const mints = bootMintRecords(area.journalGet(CHANGE_STORE_KEY));
  if (mints === null) return 'failed';
  const kept = mints.length ? JSON.stringify(mints) : null;
  try {
    if (kept !== null) { if (area.journalGet(CHANGE_STORE_KEY) !== kept) area.journalSet(CHANGE_STORE_KEY, kept); }
    for (const k of area.journalKeys()) if (!(kept !== null && k === CHANGE_STORE_KEY)) area.journalDel(k);
    for (const k of area.keys()) if (k !== record && !KEPT_ON_FORGET.includes(k)) area.del(k);
    area.del(record);
  } catch {
    return 'failed';
  }
  const journalLeft = area.journalKeys();
  const journalOk = kept === null ? journalLeft.length === 0 : journalLeft.length === 1 && journalLeft[0] === CHANGE_STORE_KEY && area.journalGet(CHANGE_STORE_KEY) === kept;
  return journalOk && area.keys().every((k) => KEPT_ON_FORGET.includes(k)) ? 'purged' : 'failed';
}

/** What the lock view names when the store cannot be used (the path, when known, and the reason; the repair by hand
 *  is the view's own sentence: move the directory aside or fix its owner and modes, then start again). */
export interface StoreNotice { readonly path: string | null; readonly reason: string }

export interface TermLockDeps {
  /** The store (null: none could be opened; `noStore` says why). `refresh`: a second Hub's re-read of store.json
   *  (hub-store.ts HubStore.refresh), so a passcode the first Hub set after this one opened still locks it. */
  readonly area: (PersistArea & { refresh?(): boolean }) | null;
  /** Why `area` is null: 'absent' (no store directory) or the unusable store's path and reason. Not given: unusable,
   *  path and reason unknown (fail closed). */
  readonly noStore?: 'absent' | StoreNotice;
  /** The store directory (named by `notice()` when the store fails mid-mount). */
  readonly storePath?: string;
  /** Read-only by the person's choice (as row 6 reads it). */
  readonly readOnlyChoice?: boolean;
  /** The account's uid; null in a token session (inert). */
  uid(): string | null;
  /** The mount still holds the session it started with. */
  sessionOk(): boolean;
  /** The session's lock manager. */
  readonly locks: HostLocks;
  /** Moves the policy generation (LivePolicy.bump). */
  bump(): void;
  /** Hides and drops every secret on screen. */
  wipe(): void;
  /** Ends the mount after the terminal path forgot the account's data. */
  leave(reason: 'locked_out'): void;
  /** setInterval stand-in (tests). */
  every?(fn: () => void, ms: number): () => void;
  now?(): number;
  mono?(): number;
}

/** `refused`: no try was made ('other-hub': a second mount; 'read-only-choice': read-only by choice; 'no-store': a store
 *  that failed, or none). */
export type UnlockResult = CheckResult | { k: 'refused'; why: 'other-hub' | 'read-only-choice' | 'no-store' };

export interface TermLockHost {
  /** True when the mount starts locked (a record exists): draw the lock view, not a page. */
  readonly startLocked: boolean;
  /** Row 1's lock part: 'locked' while locked. */
  state(): 'live' | 'locked';
  /** The `passcodeLock` capability: an account session on a read-write store. */
  capable(): boolean;
  /** The menu's Lock. True when it locked (a passcode is set). */
  lock(): boolean;
  /** A key or mouse event from the person (output never calls it). */
  input(): void;
  /** The process is being suspended (SIGTSTP): checks in progress are cancelled. */
  suspend(): void;
  /** The process resumed (SIGCONT): a set passcode locks. */
  resume(): boolean;
  /** The store problem the lock view names (path, reason), or null when the store is usable or absent. */
  notice(): StoreNotice | null;
  /** The lock view's Enter. */
  tryUnlock(pass: string): Promise<UnlockResult>;
  /** Stops the idle tick and the lock listener. */
  stop(): void;
}

export function installTermLock(d: TermLockDeps): TermLockHost {
  const ro = d.readOnlyChoice === true;
  let forgetFailed = false;
  configureAppLock({
    storage: () => lockStorage(d.area, d.uid, ro, !d.area && d.noStore === 'absent'),
    locks: () => d.locks as unknown as ReturnType<LockEnv['locks']>,
    uid: () => d.uid(),
    sessionOk: () => d.sessionOk(),
    visible: () => true,
    post: () => { /* one process, one mount: no other tab to tell */ },
    listen: () => () => { /* no other tab */ },
    terminal: () => {
      const uid = d.uid();
      if (!uid) return;
      // A forget that cannot finish on a WRITABLE store is the one the repair sentence is for; on a read-only mount (a
      // second Hub, or read-only by choice) it never runs, and that store must not be moved aside.
      if (forgetAccountData(d.area, uid, ro) === 'purged') { forgetFailed = false; d.leave('locked_out'); } else forgetFailed = storeModeOf(d.area, ro) === 'rw';
    },
    ...(d.now ? { now: d.now } : {}),
    ...(d.mono ? { mono: d.mono } : {}),
  });
  let was = isLocked();
  const offLock = onLockChange(() => {
    const now = isLocked();
    if (now === was) return;
    was = now;
    d.bump();
    if (now) d.wipe();
  });
  const startLocked = bootGate();
  const every = d.every ?? ((fn: () => void, ms: number) => { const t = setInterval(fn, ms); (t as { unref?: () => void }).unref?.(); return () => clearInterval(t); });
  // A second Hub reads the lock record from a copy made at open: re-read it from disk before each idle check, menu
  // Lock and resume, so a passcode set by the first Hub after this one opened locks this one too.
  const reread = (): void => { if (d.area && d.area.readOnly === 'busy' && typeof d.area.refresh === 'function') d.area.refresh(); };
  const stopTick = every(() => { reread(); checkIdle(); }, IDLE_TICK_MS);
  return {
    startLocked,
    state: () => (isLocked() ? 'locked' : 'live'),
    capable: () => d.uid() !== null && storeModeOf(d.area, ro) === 'rw',
    notice: () => {
      if (d.area) return d.area.failed() ? { path: d.storePath ?? null, reason: 'failed' } : forgetFailed ? { path: d.storePath ?? null, reason: 'forget-failed' } : null;
      if (d.noStore === 'absent') return null;
      return d.noStore ? { path: d.noStore.path, reason: d.noStore.reason } : { path: d.storePath ?? null, reason: 'unknown' };
    },
    lock: () => { reread(); return lockNow(); },
    input: () => { noteInput(); },
    suspend: () => { leaveTab(); },
    resume: () => { reread(); return lockTab(); },
    tryUnlock: async (pass) => {
      const mode = storeModeOf(d.area, ro);
      if (mode === 'rw') return checkPasscode(pass);
      return { k: 'refused', why: mode === 'none' ? 'no-store' : d.area!.readOnly !== null ? 'other-hub' : 'read-only-choice' };
    },
    stop: () => { stopTick(); offLock(); },
  };
}
