// The terminal Hub's local store, host side: the files of one account on one
// platform, under the CLI's data directory. Hub code never reaches this module (no node:fs in the bundle): the CLI
// opens the store and hands the mount a small synchronous area (src/term/env/persist.ts decides WHAT may be kept).
//
//   <home>/.hoody/hub/<store id>/        0700     store id = first 32 hex of sha256(apiOrigin NUL account uid)
//     lock                               0600     flock, held for the life of a mount (the web's cross-tab lock)
//     store.json                         0600     {v:1, keys:{k: string}}: replaced whole (temp, fsync, rename, dir fsync)
//     journal.jsonl                      0600     append-only, one line per write, each with a sum; fsync per line
//
// Rules this file holds, each with a test in hub-store.term.test.ts:
//  - nothing is used unless every ancestor up to the home directory is a real directory of this user (or root) that
//    group and others cannot write, and the store directory and each file are this user's, real, single-link, and
//    have exactly the modes above. File checks are made on the OPENED descriptor (O_NOFOLLOW), never on the path;
//  - a temp file is created O_EXCL: a name that already exists is refused, never reused;
//  - a journal write is durable only after write + fsync returned. After ANY failed write, fsync or rename the store
//    is failed for the rest of the mount: every later write throws (an error is never retried into "durable");
//  - at open, ONLY a last journal line without a newline is dropped (its write never returned). A bad sum, a gap in
//    the sequence or malformed content anywhere else makes the store unusable: nothing is repaired, the file is kept;
//  - a second opener finds the lock held and gets a read-only store that writes nothing;
//  - bounds: a value over 256 KiB or a store over 8 MiB refuses the write.
// A value read back comes from this process's copy, which changes only AFTER the write and its fsync returned.
import crypto from 'node:crypto';
import nodeFs from 'node:fs';
import path from 'node:path';
import { nodeFfi } from './node-ffi';

export type HubStoreCode = 'TERM_STORE_UNSAFE' | 'TERM_STORE_CORRUPT' | 'TERM_STORE_FAILED' | 'TERM_STORE_READ_ONLY' | 'TERM_STORE_TOO_LARGE';
export class HubStoreError extends Error {
  /** `file`: which store file a TERM_STORE_CORRUPT is about (hub-store-open.ts sets that one aside and starts it empty). */
  constructor(readonly code: HubStoreCode, what: string, readonly file?: 'store.json' | 'journal.jsonl') {
    super(`${code}: ${what}`);
    this.name = 'HubStoreError';
  }
}

export const VALUE_MAX = 256 * 1024;
export const STORE_MAX = 8 * 1024 * 1024;
export const COMPACT_AT = 1024 * 1024;
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

/** The file calls the store makes (tests replace one to make it fail). */
export type StoreIo = Pick<typeof nodeFs, 'openSync' | 'closeSync' | 'writeSync' | 'fsyncSync' | 'renameSync' | 'fstatSync' | 'lstatSync' | 'mkdirSync' | 'readFileSync' | 'ftruncateSync' | 'unlinkSync'>;
/** Takes an exclusive advisory lock on an open descriptor without waiting: false when another process holds it. */
export type TryLock = (fd: number) => boolean;

export const storeIdOf = (apiOrigin: string, uid: string): string => crypto.createHash('sha256').update(`${apiOrigin}\0${uid}`).digest('hex').slice(0, 32);
/** Where an account's store lives, or null without a usable home directory. Never under a config file's directory. */
export function hubStoreDir(home: string | undefined, apiOrigin: string, uid: string): string | null {
  if (!home || !path.isAbsolute(home) || home === '/') return null;
  return path.join(home, '.hoody', 'hub', storeIdOf(apiOrigin, uid));
}

export type JournalOp = 'set' | 'del';
interface Line { v: 1; n: number; t: number; key: string; op: JournalOp; value: string }
const sumOf = (body: string): string => crypto.createHash('sha256').update(body).digest('hex').slice(0, 16);
/** One journal line (with its newline): the fields in a fixed order, then the sum of everything before it. */
export function journalLine(l: Line): string {
  const body = JSON.stringify({ v: 1, n: l.n, t: l.t, key: l.key, op: l.op, value: l.value });
  return `${body.slice(0, -1)},"sum":"${sumOf(body)}"}\n`;
}
function parseLine(text: string): Line | null {
  let o: unknown;
  try { o = JSON.parse(text); } catch { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  if (Object.keys(r).join() !== 'v,n,t,key,op,value,sum') return null;
  if (r.v !== 1 || !Number.isSafeInteger(r.n) || !Number.isSafeInteger(r.t) || typeof r.key !== 'string' || (r.op !== 'set' && r.op !== 'del') || typeof r.value !== 'string') return null;
  const l: Line = { v: 1, n: r.n as number, t: r.t as number, key: r.key, op: r.op, value: r.value };
  return journalLine(l) === text + '\n' ? l : null;
}

export interface HubStore {
  /** Why nothing can be written, or null. 'busy': another Hub holds the lock. */
  readonly readOnly: null | 'busy';
  /** True when the journal ended in a line whose write never returned (it was dropped). */
  readonly droppedTail: boolean;
  /** Group (a): the journal. */
  journalGet(key: string): string | null;
  journalKeys(): string[];
  /** Durable when it returns; throws HubStoreError otherwise (and the store stays failed). */
  journalSet(key: string, value: string): void;
  journalDel(key: string): void;
  /** Groups (b)-(d): store.json. */
  get(key: string): string | null;
  keys(): string[];
  set(key: string, value: string): void;
  del(key: string): void;
  /** True once a write, fsync or rename failed: every later write throws. */
  failed(): boolean;
  /** A busy mount only (another Hub holds the lock and writes): reads store.json again under the open's checks and
   *  replaces this mount's copy of groups (b)-(d). False (the copy kept) when not busy, closed, or the file is gone or
   *  cannot be read (never a looser copy than the one it had). The journal is never re-read. */
  refresh(): boolean;
  /** Orderly leave: compacts the journal (unless failed or read-only), releases the lock. */
  close(): void;
}

export interface OpenStoreOptions { home: string; uid?: number; io?: Partial<StoreIo>; tryLock: TryLock; now?: () => number; pid?: number; /** Tests only: smaller bounds. */ limits?: { valueMax?: number; storeMax?: number; compactAt?: number } }

const unsafe = (what: string): never => { throw new HubStoreError('TERM_STORE_UNSAFE', what); };

/** Every directory from `dir` up to `home`: real, this user's or root's, not writable by group or others. Missing ones below home are made 0700, parent fsynced. */
function checkedDirs(io: StoreIo, dir: string, home: string, uid: number): void {
  if (!path.isAbsolute(dir) || !path.isAbsolute(home) || path.resolve(dir) !== dir || path.resolve(home) !== home) unsafe('the store path is not absolute');
  const rel = path.relative(home, dir);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) unsafe('the store is not under the home directory');
  const chain = [home];
  for (const part of rel.split(path.sep)) chain.push(path.join(chain[chain.length - 1]!, part));
  chain.forEach((d, i) => {
    let st: nodeFs.Stats | null = null;
    try { st = io.lstatSync(d); } catch { st = null; }
    if (!st) {
      if (i === 0) unsafe('the home directory is missing');
      try { io.mkdirSync(d, { mode: DIR_MODE }); } catch (e) { if ((e as { code?: string }).code !== 'EEXIST') unsafe('a store directory cannot be created'); }
      fsyncDir(io, chain[i - 1]!);
      st = io.lstatSync(d);
    }
    if (!st.isDirectory()) unsafe('an ancestor of the store is not a real directory');
    if (st.uid !== uid && st.uid !== 0) unsafe('an ancestor of the store belongs to another user');
    if ((st.mode & 0o022) !== 0) unsafe('an ancestor of the store can be written by others');
    if (i === chain.length - 1 && (st.uid !== uid || (st.mode & 0o777) !== DIR_MODE)) unsafe('the store directory is not private to this user');
  });
}
function fsyncDir(io: StoreIo, dir: string): void {
  const fd = io.openSync(dir, nodeFs.constants.O_RDONLY | nodeFs.constants.O_DIRECTORY | nodeFs.constants.O_NOFOLLOW);
  try { io.fsyncSync(fd); } finally { io.closeSync(fd); }
}
/** Opens a store file and checks the DESCRIPTOR: this user's, a regular file, one link, mode 0600. */
function openChecked(io: StoreIo, file: string, flags: number, uid: number): number {
  let fd: number;
  try { fd = io.openSync(file, flags | nodeFs.constants.O_NOFOLLOW, FILE_MODE); } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'ENOENT') throw e;
    return unsafe(code === 'EEXIST' ? 'a temporary file of the store already exists' : 'a store file cannot be opened as a plain file');
  }
  const st = io.fstatSync(fd);
  if (!st.isFile() || st.nlink !== 1 || st.uid !== uid || (st.mode & 0o777) !== FILE_MODE) { io.closeSync(fd); unsafe('a store file is not a private plain file of this user'); }
  return fd;
}

/** store.json's keys, read through a checked descriptor; throws ENOENT (no file), TERM_STORE_UNSAFE or TERM_STORE_CORRUPT. */
function readStoreJson(io: StoreIo, file: string, uid: number): Map<string, string> {
  const fd = openChecked(io, file, nodeFs.constants.O_RDONLY, uid);
  let text: string;
  try { text = io.readFileSync(fd, 'utf8'); } finally { io.closeSync(fd); }
  const kv = new Map<string, string>();
  let ok = false;
  try {
    const j = JSON.parse(text) as { v?: unknown; keys?: unknown };
    if (j && j.v === 1 && j.keys && typeof j.keys === 'object' && !Array.isArray(j.keys) && Object.keys(j).join() === 'v,keys') {
      ok = Object.values(j.keys).every((v) => typeof v === 'string');
      if (ok) for (const [k, v] of Object.entries(j.keys as Record<string, string>)) kv.set(k, v);
    }
  } catch { ok = false; }
  if (!ok) throw new HubStoreError('TERM_STORE_CORRUPT', 'the stored preferences cannot be read', 'store.json');
  return kv;
}

/**
 * Opens (creating if needed) the store in `dir`. Throws HubStoreError TERM_STORE_UNSAFE or TERM_STORE_CORRUPT when
 * it must not be used: the caller then mounts read-only and tells the lock engine the store is unreadable.
 */
export function openHubStore(dir: string, o: OpenStoreOptions): HubStore {
  const io: StoreIo = { ...nodeFs, ...o.io } as StoreIo;
  const uid = o.uid ?? process.getuid?.() ?? -1;
  const now = o.now ?? Date.now;
  const pid = o.pid ?? process.pid;
  const C = nodeFs.constants;
  const valueMax = o.limits?.valueMax ?? VALUE_MAX, storeMax = o.limits?.storeMax ?? STORE_MAX, compactAt = o.limits?.compactAt ?? COMPACT_AT;
  if (uid < 0) unsafe('this platform has no user ids');
  checkedDirs(io, dir, o.home, uid);
  const at = (name: string): string => path.join(dir, name);

  const lockFd = openChecked(io, at('lock'), C.O_RDWR | C.O_CREAT, uid);
  const busy = !o.tryLock(lockFd);

  // store.json
  const kv = new Map<string, string>();
  try {
    for (const [k, v] of readStoreJson(io, at('store.json'), uid)) kv.set(k, v);
  } catch (e) {
    if ((e as { code?: string }).code !== 'ENOENT') { io.closeSync(lockFd); throw e; }
  }

  // journal.jsonl
  const journal = new Map<string, string>();
  let seq = 0;
  let journalBytes = 0;
  let droppedTail = false;
  let jfd = -1;
  let fresh = false;
  try {
    jfd = openChecked(io, at('journal.jsonl'), busy ? C.O_RDONLY : C.O_RDWR | C.O_APPEND, uid);
  } catch (e) {
    if ((e as { code?: string }).code !== 'ENOENT') { io.closeSync(lockFd); throw e; }
    if (!busy) { jfd = openChecked(io, at('journal.jsonl'), C.O_RDWR | C.O_APPEND | C.O_CREAT | C.O_EXCL, uid); fresh = true; }
  }
  if (jfd >= 0) {
    try {
      if (fresh) { io.fsyncSync(jfd); fsyncDir(io, dir); }
      const text = io.readFileSync(jfd, 'utf8');
      const cut = text.lastIndexOf('\n') + 1;
      const whole = text.slice(0, cut);
      droppedTail = cut < text.length;
      let first = true;
      for (const raw of whole === '' ? [] : whole.slice(0, -1).split('\n')) {
        const l = parseLine(raw);
        if (!l || (!first && l.n !== seq + 1) || l.n < 1) throw new HubStoreError('TERM_STORE_CORRUPT', 'the record of open changes cannot be read', 'journal.jsonl');
        first = false;
        seq = l.n;
        if (l.op === 'set') journal.set(l.key, l.value); else journal.delete(l.key);
      }
      journalBytes = Buffer.byteLength(whole);
      // The dropped tail's write never returned: it is cut off so the next line starts on its own (nothing else is repaired).
      if (droppedTail && !busy) { io.ftruncateSync(jfd, journalBytes); io.fsyncSync(jfd); }
    } catch (e) {
      io.closeSync(jfd);
      io.closeSync(lockFd);
      throw e;
    }
  }

  let isFailed = false;
  let closed = false;
  const writable = (): void => {
    if (closed) throw new HubStoreError('TERM_STORE_FAILED', 'the store is closed');
    if (busy) throw new HubStoreError('TERM_STORE_READ_ONLY', 'another Hub is open for this account');
    if (isFailed) throw new HubStoreError('TERM_STORE_FAILED', 'an earlier write to the store failed');
  };
  /** Runs file work; any error marks the store failed for good. */
  const durable = <T>(work: () => T): T => {
    try { return work(); } catch (e) {
      isFailed = true;
      if (e instanceof HubStoreError) throw e;
      throw new HubStoreError('TERM_STORE_FAILED', 'a write to the store failed');
    }
  };
  const sizeOk = (key: string, value: string, extra: number): void => {
    if (Buffer.byteLength(value) > valueMax) throw new HubStoreError('TERM_STORE_TOO_LARGE', 'a value is too large to keep');
    let total = extra + Buffer.byteLength(key);
    for (const [k, v] of journal) if (k !== key) total += Buffer.byteLength(k) + Buffer.byteLength(v);
    for (const [k, v] of kv) if (k !== key) total += Buffer.byteLength(k) + Buffer.byteLength(v);
    if (total > storeMax) throw new HubStoreError('TERM_STORE_TOO_LARGE', 'the store is full');
  };
  /** Writes `text` to a new private file and renames it over `name` (temp, fsync, rename, directory fsync). A write the
   *  kernel cut short is a failure: nothing is renamed, the old file stays, and the temp file is removed. */
  const replace = (name: string, text: string): number => {
    const tmp = at(`${name}.${pid}.tmp`);
    const fd = openChecked(io, tmp, C.O_WRONLY | C.O_CREAT | C.O_EXCL, uid);
    const size = Buffer.byteLength(text);
    let renamed = false;
    try {
      try {
        if (io.writeSync(fd, text) !== size) throw new HubStoreError('TERM_STORE_FAILED', 'a write to the store was cut short');
        io.fsyncSync(fd);
      } finally { io.closeSync(fd); }
      io.renameSync(tmp, at(name));
      renamed = true;
    } finally {
      if (!renamed) { try { io.unlinkSync(tmp); } catch { /* the store is failed either way; a later mount refuses the name, never reuses it */ } }
    }
    fsyncDir(io, dir);
    return size;
  };
  const compact = (): void => {
    let n = seq;
    const text = [...journal].map(([key, value]) => journalLine({ v: 1, n: ++n, t: now(), key, op: 'set', value })).join('');
    journalBytes = replace('journal.jsonl', text);
    seq = n;
    io.closeSync(jfd);
    jfd = openChecked(io, at('journal.jsonl'), C.O_RDWR | C.O_APPEND, uid);
  };
  const append = (key: string, op: JournalOp, value: string): void => {
    writable();
    if (op === 'set') sizeOk(key, value, Buffer.byteLength(value));
    durable(() => {
      const line = journalLine({ v: 1, n: seq + 1, t: now(), key, op, value });
      const wrote = io.writeSync(jfd, line);
      if (wrote !== Buffer.byteLength(line)) throw new HubStoreError('TERM_STORE_FAILED', 'a write to the store was cut short');
      io.fsyncSync(jfd);
      seq += 1;
      journalBytes += wrote;
      if (op === 'set') journal.set(key, value); else journal.delete(key);
      // Inside this one call, between appends: no append interleaves with a compaction. The line above is already
      // durable, so a compaction that fails latches the store failed (every later write refuses) but does NOT fail this
      // write: refusing it would leave a change "not sent" that the next mount reads back as held.
      if (journalBytes > compactAt) { try { compact(); } catch { isFailed = true; } }
    });
  };
  const writeKv = (next: Map<string, string>): void => {
    durable(() => { replace('store.json', JSON.stringify({ v: 1, keys: Object.fromEntries(next) })); });
    kv.clear();
    for (const [k, v] of next) kv.set(k, v);
  };

  return {
    readOnly: busy ? 'busy' : null,
    droppedTail,
    journalGet: (key) => journal.get(key) ?? null,
    journalKeys: () => [...journal.keys()],
    journalSet: (key, value) => { append(key, 'set', value); },
    journalDel: (key) => { if (journal.has(key)) append(key, 'del', ''); else writable(); },
    get: (key) => kv.get(key) ?? null,
    keys: () => [...kv.keys()],
    set(key, value) { writable(); sizeOk(key, value, Buffer.byteLength(value)); writeKv(new Map(kv).set(key, value)); },
    del(key) { writable(); if (!kv.has(key)) return; const next = new Map(kv); next.delete(key); writeKv(next); },
    failed: () => isFailed,
    refresh() {
      if (!busy || closed) return false;
      let next: Map<string, string>;
      try { next = readStoreJson(io, at('store.json'), uid); } catch { return false; }
      kv.clear();
      for (const [k, v] of next) kv.set(k, v);
      return true;
    },
    close() {
      if (closed) return;
      try { if (!busy && !isFailed && jfd >= 0 && journalBytes > 0) durable(compact); } catch { /* the journal stays as it is: every line in it is whole */ }
      closed = true;
      if (jfd >= 0) { try { io.closeSync(jfd); } catch { /* closing */ } }
      try { io.closeSync(lockFd); } catch { /* closing releases the lock */ }
    },
  };
}

/** The lock call of the platform's C library (`flock`, exclusive, no wait): what the CLI passes as `tryLock`. Through
 *  bun:ffi in the release binary, through node:ffi under Node (the npm package); throws without either. */
export async function systemTryLock(): Promise<TryLock> {
  const name = process.platform === 'darwin' ? 'libSystem.B.dylib' : 'libc.so.6';
  const LOCK_EX = 2, LOCK_NB = 4;
  if (typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined') {
    const { dlopen } = await import('bun:ffi');
    const lib = dlopen(name, { flock: { args: ['i32', 'i32'], returns: 'i32' } });
    return (fd) => lib.symbols.flock(fd, LOCK_EX | LOCK_NB) === 0;
  }
  const ffi = nodeFfi();
  if (!ffi) throw new Error('TERM_HUB_NODE_FFI: no node:ffi in this Node');
  const flock = ffi.dlopen(name, { flock: { arguments: ['i32', 'i32'], return: 'i32' } }).functions.flock!;
  return (fd) => flock(fd, LOCK_EX | LOCK_NB) === 0;
}
