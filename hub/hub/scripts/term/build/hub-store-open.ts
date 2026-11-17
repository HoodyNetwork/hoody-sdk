// Opening an account's local store for a `hoody hub` start (host side). hub-store.ts is the engine (files, lock, journal);
// this file is what a launcher calls once
// before the mount and hands on as `LiveWiring.area` (src/term/app/live-wire.ts):
//
//   const s = openAccountStore({ home, apiOrigin, uid, tryLock });     // never throws
//   s.area      the store (HubStore), or null: nothing is kept and changes are off (live-records.ts storeModeOf 'none')
//   s.notice    null, or why the store is not what the person expects; storeNoticeText(s.notice) is the sentence
//   s.close()   at the end of the mount (compacts, releases the lock)
//
// Rules, each with a test in hub-store-open.term.test.ts:
//  - a store file that cannot be read (damaged, or written by something else: another shape or version) is renamed
//    aside, kept for a person, and that file starts EMPTY; the notice says which file and where it was kept. Only the
//    unreadable file is set aside: damaged preferences never cost the record of open changes, or the other way round;
//  - a file is set aside only while this process holds the store's lock. With another Hub open nothing is moved: no
//    store for this start (two Hubs never rename each other's files);
//  - a temporary file left by a Hub that died between its write and its rename is removed (under the lock), so the
//    name is free when the same process id comes round again. The file it was replacing is whole: old value;
//  - a second Hub for the same account gets the store read-only (hub-store.ts) and a notice saying so;
//  - `term.resume` (store.json; a host key like `term.boot_keys`, never written through the Hub's storage seam): the
//    page and realm of the last run, so the next start opens there. Read with a shape check, written only when it
//    changed and the store is writable.
import nodeFs from 'node:fs';
import path from 'node:path';
import { HubStoreError, hubStoreDir, openHubStore, type HubStore, type StoreIo, type TryLock } from './hub-store';

export type StoreFile = 'store.json' | 'journal.jsonl';
export type StoreNoticeReason =
  /** No usable home directory: there is nowhere to keep anything. */
  | 'no-home'
  /** The directory or a file is not a private plain file of this user (hub-store.ts checks): not used, not changed. */
  | 'unsafe'
  /** A file could not be read and another Hub is open (or it could not be moved): left alone, not used. */
  | 'unreadable'
  /** The store could not be opened for another reason (a disk error, a full disk): not used, not changed. */
  | 'failed'
  /** A file could not be read: set aside, started empty. The store is in use. */
  | 'reset'
  /** Another Hub is open for this account: this one reads the store and writes nothing. */
  | 'busy';
export interface StoreNotice {
  readonly reason: StoreNoticeReason;
  /** The store directory, when there is one. */
  readonly dir: string | null;
  /** 'reset': each file that was set aside and the name it is kept under (in `dir`). 'unreadable': the file, kept as it was. */
  readonly files: ReadonlyArray<{ readonly file: StoreFile; readonly keptAs: string | null }>;
  /** 'reset' only: another Hub took the lock right after the file was set aside, so this one reads and writes nothing. */
  readonly busy?: true;
}
export interface OpenedStore {
  readonly area: HubStore | null;
  /** When this process opened the store (LiveWiring.storeOpenedAt). */
  readonly openedAt: number;
  readonly notice: StoreNotice | null;
  close(): void;
}
export interface OpenAccountStoreOptions {
  /** The user's home directory (the launcher passes os.homedir()); undefined or unusable: no store. */
  home: string | undefined;
  apiOrigin: string;
  /** The account uid (HoodyClient.identity.uid). */
  uid: string;
  tryLock: TryLock;
  now?: () => number;
  pid?: number;
  io?: Partial<StoreIo>;
}

/** How many set-aside copies of one file are kept; older ones are removed when a new one is made. */
export const KEPT_ASIDE_MAX = 3;
const ASIDE = /^(store\.json|journal\.jsonl)\.unreadable-(\d+)$/;
const TEMP = /^(store\.json|journal\.jsonl)\.\d+\.tmp$/;

const fsyncDir = (dir: string): void => {
  const fd = nodeFs.openSync(dir, nodeFs.constants.O_RDONLY | nodeFs.constants.O_DIRECTORY);
  try { nodeFs.fsyncSync(fd); } finally { nodeFs.closeSync(fd); }
};

/** Renames `file` aside under the store's lock. The new name, or null when the lock is held elsewhere or the move failed (nothing changed). */
function setAside(dir: string, file: StoreFile, tryLock: TryLock, now: () => number): string | null {
  const C = nodeFs.constants;
  let lockFd = -1;
  try {
    // openHubStore already checked this directory and its lock file before it read (and refused) the store file.
    lockFd = nodeFs.openSync(path.join(dir, 'lock'), C.O_RDWR | C.O_NOFOLLOW);
    if (!tryLock(lockFd)) return null;
    const old = nodeFs.readdirSync(dir).map((f) => ASIDE.exec(f)).filter((m): m is RegExpExecArray => !!m && m[1] === file)
      .sort((a, b) => Number(a[2]) - Number(b[2])).map((m) => m[0]);
    let stamp = Math.max(0, Math.floor(now()));
    while (nodeFs.existsSync(path.join(dir, `${file}.unreadable-${stamp}`))) stamp += 1;
    const keptAs = `${file}.unreadable-${stamp}`;
    nodeFs.renameSync(path.join(dir, file), path.join(dir, keptAs));
    for (const f of old.slice(0, Math.max(0, old.length - (KEPT_ASIDE_MAX - 1)))) { try { nodeFs.unlinkSync(path.join(dir, f)); } catch { /* an older copy stays */ } }
    fsyncDir(dir);
    return keptAs;
  } catch {
    return null;
  } finally {
    if (lockFd >= 0) { try { nodeFs.closeSync(lockFd); } catch { /* closing releases the lock */ } }
  }
}

/** Removes temp files a dead Hub left. Only called by the lock's holder, before its own first write. */
function sweepTemps(dir: string): void {
  let swept = false;
  try {
    for (const f of nodeFs.readdirSync(dir)) if (TEMP.test(f)) { try { nodeFs.unlinkSync(path.join(dir, f)); swept = true; } catch { /* hub-store.ts refuses the name if it is ever needed */ } }
    if (swept) fsyncDir(dir);
  } catch { /* nothing swept */ }
}

/** Opens (creating if needed) the account's store. Never throws: a store that cannot be used is `area: null` with a notice. */
export function openAccountStore(o: OpenAccountStoreOptions): OpenedStore {
  const now = o.now ?? Date.now;
  const openedAt = now();
  const dir = hubStoreDir(o.home, o.apiOrigin, o.uid);
  const none = (reason: StoreNoticeReason, files: StoreNotice['files'] = []): OpenedStore => ({ area: null, openedAt, notice: { reason, dir, files }, close() {} });
  if (!dir || !o.home) return none('no-home');
  const reset: Array<{ file: StoreFile; keptAs: string }> = [];
  // At most one set-aside per file, then the open must succeed.
  for (let round = 0; round < 3; round++) {
    let store: HubStore;
    try {
      store = openHubStore(dir, { home: o.home, tryLock: o.tryLock, now, ...(o.pid !== undefined ? { pid: o.pid } : {}), ...(o.io ? { io: o.io } : {}) });
    } catch (e) {
      if (!(e instanceof HubStoreError) || e.code !== 'TERM_STORE_CORRUPT') return none(e instanceof HubStoreError && e.code === 'TERM_STORE_UNSAFE' ? 'unsafe' : 'failed');
      const file = e.file;
      if (!file || reset.some((r) => r.file === file)) return none('unreadable', file ? [{ file, keptAs: null }] : []);
      const keptAs = setAside(dir, file, o.tryLock, now);
      if (keptAs === null) return none('unreadable', [{ file, keptAs: null }]);
      reset.push({ file, keptAs });
      continue;
    }
    if (store.readOnly === null) sweepTemps(dir);
    const notice: StoreNotice | null = reset.length ? { reason: 'reset', dir, files: reset, ...(store.readOnly === 'busy' ? { busy: true as const } : {}) }
      : store.readOnly === 'busy' ? { reason: 'busy', dir, files: [] } : null;
    return { area: store, openedAt, notice, close: () => { store.close(); } };
  }
  return none('unreadable');
}

const WHAT: Record<StoreFile, string> = { 'store.json': 'preferences', 'journal.jsonl': 'the list of changes still open' };
/** The notice as one or two plain sentences, for the launcher's terminal (before the Hub draws, and again after it leaves). */
export function storeNoticeText(n: StoreNotice | null): string | null {
  if (!n) return null;
  switch (n.reason) {
    case 'no-home': return 'hoody hub: no home directory was found, so nothing is kept between runs and changes are off.';
    case 'unsafe': return `hoody hub: the saved Hub data in ${n.dir ?? 'your home directory'} is not private to you (owner or permissions), so it is not used. Nothing is kept between runs and changes are off.`;
    case 'failed': return `hoody hub: the saved Hub data in ${n.dir ?? 'your home directory'} could not be opened (a disk error, or the disk is full), so it is not used. Nothing is kept between runs and changes are off.`;
    case 'busy': return 'hoody hub: another Hub is open for this account, so changes are off in this one.';
    case 'unreadable': return `hoody hub: the saved Hub data in ${n.dir ?? 'your home directory'} could not be read${n.files.length ? ` (${n.files.map((f) => f.file).join(', ')})` : ''} and was left as it is. Nothing is kept between runs and changes are off. Close any other Hub and start again.`;
    case 'reset': {
      const what = n.files.map((f) => WHAT[f.file]).join(' and ');
      const kept = n.files.map((f) => path.join(n.dir ?? '', f.keptAs ?? f.file)).join(', ');
      const lost = n.files.some((f) => f.file === 'journal.jsonl') ? ' A change that was still open when the Hub last closed is no longer listed: check it yourself.' : '';
      const busy = n.busy ? ' Another Hub is open for this account, so changes are off in this one.' : '';
      return `hoody hub: the saved ${what} could not be read and started again empty. The old file is kept as ${kept}.${lost}${busy}`;
    }
  }
}

const TITLE: Record<StoreNoticeReason, string> = {
  'no-home': 'Nothing is kept between runs', unsafe: 'Saved Hub data is not used', unreadable: 'Saved Hub data could not be read',
  failed: 'Saved Hub data could not be opened', reset: 'Saved Hub data started again empty', busy: 'Another Hub is open',
};
/** The notice for the Hub itself (a toast at start: HubTermOptions.store.notice): a short title, and the same sentence
 *  the terminal gets, without the command's name. */
export function storeNoticeToast(n: StoreNotice | null): { title: string; body: string } | null {
  const text = storeNoticeText(n);
  if (!n || text === null) return null;
  const body = text.replace(/^hoody hub: /, '');
  return { title: TITLE[n.reason], body: body.charAt(0).toUpperCase() + body.slice(1) };
}

/** store.json key of the last run's place. A host key: the Hub's storage seam (src/term/env/persist.ts) never sees it. */
export const RESUME_KEY = 'term.resume';
export interface Resume { readonly page?: string; readonly realmId?: string }
const PAGE = /^[a-z][a-z0-9-]{0,31}$/;
const REALM = /^(?:all|[0-9a-f]{24})$/;
const cleanResume = (v: unknown): Resume => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const r = v as Record<string, unknown>;
  return { ...(typeof r.page === 'string' && PAGE.test(r.page) ? { page: r.page } : {}), ...(typeof r.realmId === 'string' && REALM.test(r.realmId) ? { realmId: r.realmId } : {}) };
};
/** The last run's page id and realm ('all' or an id), each only when it is stored in the right shape. */
export function readResume(area: Pick<HubStore, 'get'> | null): Resume {
  if (!area) return {};
  try { return cleanResume(JSON.parse(area.get(RESUME_KEY) ?? 'null')); } catch { return {}; }
}
/** Keeps the place for the next start (fields of another shape are left out). False: not kept (no store, read-only, failed). */
export function writeResume(area: Pick<HubStore, 'get' | 'set' | 'readOnly' | 'failed'> | null, r: Resume): boolean {
  if (!area || area.readOnly !== null || area.failed()) return false;
  const text = JSON.stringify(cleanResume(r));
  try {
    if (area.get(RESUME_KEY) !== text) area.set(RESUME_KEY, text);
    return true;
  } catch { return false; }
}
