// transcriptCache.ts: a saved copy of a chat's finished transcript, so a chat opened again shows
// what it showed last time while its computer is read. Encrypted per account, purged at sign-out,
// account switch and "Remove all local data", only finished blocks, never merged with what the computer answers and never
// sent anywhere.
//
// Contract:
//   - One row per (account, computer, realm, chat) in IndexedDB 'hoody-hub-chats' (store 'transcripts'). The row's address
//     holds the account id, the computer's handle, the realm id and the chat id in the clear (as the pref store's rows do;
//     every row goes at sign-out and session end), and the transcript sealed for that account and chat (core sealBlob: AES-GCM
//     under a key derived from the account's base key, the chat bound into it), so another account's key, or another
//     chat's slot, never opens it.
//   - writeCached() keeps the blocks of a settled chat only: the source calls it when the computer's answer is read, no
//     turn runs, no gate is open and nothing is unsure (source.ts cacheable). It keeps at most CACHE_MAX chats per account
//     (the oldest written goes) and a copy of at most CACHE_BYTES; a larger one is not kept at all (an earlier copy of the
//     chat is removed: a copy is never cut, and never older than what the chat showed).
//   - readCached() answers the shown account's copy, or null. A copy that does not open (a rotated or forgotten key, or an
//     account still opening) reads as none and is left for the next write, the cap or a purge to replace or remove. It is shown only until the computer answers; nothing merges it with the answer.
//   - Purges: every auth purge (sign-out, an ended session) removes every row; "Forget on this browser" removes the
//     account's; a read or write under another account first removes every row of the others (an account switch). "Remove
//     all local data" deletes the database with every other one (core/local-wipe.ts lists them all). A write that a purge
//     overtook is removed again once stored.
//   - Fails closed and quiet: no IndexedDB, a refused call or an account that is not open here keep nothing and show none.
import { capture, hostEnv, onAuthPurge, onCryptForget, openBlob, sealBlob } from '@core';
import type { ConvBlock, ConvRef, FileView, StepView } from '@kit/agent/source';
import { scrubSecrets } from './code';

/** The slot key the seal binds (it is not a storage key: the rows live in IndexedDB, never in localStorage). */
export const CACHE_SLOT = 'hub_chat_transcript_v1';
export const CACHE_MAX = 20;
export const CACHE_BYTES = 512 * 1024;
const DB = 'hoody-hub-chats';
const STORE = 'transcripts';

export interface CacheRow { readonly id: string; readonly uid: string; readonly at: number; readonly env: unknown }
/** The rows' store: IndexedDB here, a map in tests. Every method rejects when the store cannot answer. */
export interface CacheStore {
  get(id: string): Promise<CacheRow | null>;
  put(row: CacheRow): Promise<void>;
  /** Every row's address (no envelope). */
  list(): Promise<Array<{ id: string; uid: string; at: number }>>;
  del(ids: readonly string[]): Promise<void>;
  clear(): Promise<void>;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('IDB_FAILED'));
  });
}

/** The IndexedDB store over `factory` (none: every call answers IDB_UNAVAILABLE). The connection opens on first use and
 *  again after a failure or a version change. No default argument: a default would read the global even when a caller
 *  passes undefined on purpose (the terminal), so the caller always names the factory. */
export function idbCacheStore(factory: IDBFactory | undefined): CacheStore {
  let conn: Promise<IDBDatabase> | null = null;
  const db = (): Promise<IDBDatabase> => {
    if (!factory) return Promise.reject(new Error('IDB_UNAVAILABLE'));
    if (!conn) {
      conn = new Promise<IDBDatabase>((resolve, reject) => {
        let o: IDBOpenDBRequest;
        try { o = factory.open(DB, 1); } catch (e) { reject(e); return; }
        o.onupgradeneeded = () => { if (!o.result.objectStoreNames.contains(STORE)) o.result.createObjectStore(STORE, { keyPath: 'id' }); };
        o.onsuccess = () => {
          const d = o.result;
          d.onversionchange = () => { d.close(); conn = null; };
          d.onclose = () => { conn = null; };
          resolve(d);
        };
        o.onerror = () => reject(o.error || new Error('IDB_FAILED'));
        o.onblocked = () => reject(new Error('IDB_BLOCKED'));
      });
      conn.catch(() => { conn = null; });
    }
    return conn;
  };
  const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => Promise<T>): Promise<T> => {
    const t = (await db()).transaction([STORE], mode);
    const done = new Promise<void>((resolve, reject) => { t.oncomplete = () => resolve(); t.onabort = t.onerror = () => reject(t.error || new Error('IDB_FAILED')); });
    done.catch(() => {});
    let out: T;
    try { out = await fn(t.objectStore(STORE)); } catch (e) { try { t.abort(); } catch { /* already finished */ } throw e; }
    await done;
    return out;
  };
  return {
    get: (id) => tx('readonly', async (s) => rowOf(await req(s.get(id)))),
    put: (row) => tx('readwrite', async (s) => { await req(s.put(row)); }),
    list: () => tx('readonly', async (s) => ((await req(s.getAll())) as unknown[]).map(rowOf).filter((r): r is CacheRow => r !== null).map((r) => ({ id: r.id, uid: r.uid, at: r.at }))),
    del: (ids) => tx('readwrite', async (s) => { for (const id of ids) await req(s.delete(id)); }),
    clear: () => tx('readwrite', async (s) => { await req(s.clear()); }),
  };
}

function rowOf(v: unknown): CacheRow | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Partial<CacheRow>;
  return typeof r.id === 'string' && typeof r.uid === 'string' && typeof r.at === 'number' && Number.isFinite(r.at) ? { id: r.id, uid: r.uid, at: r.at, env: r.env } : null;
}

let store: CacheStore | null = null;
// IndexedDB only on a browser page; a terminal Hub keeps no transcript cache (the store answers unavailable, reads go to
// the agent) and never reads the global.
const theStore = (): CacheStore => (store ??= idbCacheStore(hostEnv().browserPage === true ? globalThis.indexedDB : undefined));
/** Moves at every purge: a write begun before one stores nothing that stays. */
let purges = 0;

/** The account core shows now ('' when none). */
function shown(): string {
  try { const a = capture().account; return a == null ? '' : String(a); } catch { return ''; }
}
const partOf = (r: ConvRef): string => JSON.stringify([r.computer, r.realm, r.sid]);
const idOf = (uid: string, r: ConvRef): string => uid + '\n' + partOf(r);

const quiet = (p: Promise<unknown>): void => { p.catch(() => {}); };
function purgeAll(): void { purges++; quiet(theStore().clear()); }
function purgeAccount(uid: string): void {
  purges++;
  quiet(theStore().list().then((rows) => theStore().del(rows.filter((r) => r.uid === uid).map((r) => r.id))));
}
onAuthPurge(() => purgeAll());
onCryptForget((uid) => purgeAccount(uid));

/** Removes every row of another account than `uid` (an account switch); true when the store answered. */
async function dropOthers(uid: string): Promise<Array<{ id: string; uid: string; at: number }> | null> {
  const rows = await theStore().list();
  const others = rows.filter((r) => r.uid !== uid).map((r) => r.id);
  if (others.length) await theStore().del(others);
  return rows.filter((r) => r.uid === uid);
}

/** What a copy holds: the blocks a settled chat showed, with nothing that names a request, a file or an action. */
export function cacheBlocks(blocks: readonly ConvBlock[]): ConvBlock[] {
  const out: ConvBlock[] = [];
  for (const b of blocks) {
    // A message keeps its note (Not sent, did not take, not delivered: the copy never shows an undelivered message as
    // delivered) and its files' facts (kind, name, size line), never their address or any request or action.
    if (b.k === 'user') out.push({ k: 'user', key: b.key, text: b.text, at: b.at,
      ...(b.files?.length ? { files: b.files.map((x) => ({ id: x.id, kind: x.kind, name: x.name, ...(x.meta !== undefined ? { meta: x.meta } : {}) })) } : {}),
      ...(b.note ? { note: { text: b.note.text, ...(b.note.bad ? { bad: true } : {}) } } : {}) });
    // Every finished reply, an earlier part of a turn (final false) too: the chat is settled, so none is still streaming.
    else if (b.k === 'reply') { if (!b.streaming) out.push({ k: 'reply', key: b.key, text: b.text, streaming: false, final: b.final, cost: b.cost, at: b.at, ...(b.cut ? { cut: b.cut } : {}) }); }
    else if (b.k === 'steps') { if (b.state !== 'running' && b.rows.every((r) => r.state !== 'running')) out.push({ k: 'steps', key: b.key, label: b.label, state: b.state, rows: b.rows.map((r) => ({ ...r })) }); }
    else if (b.k === 'decided') out.push({ k: 'decided', key: b.key, d: { ...b.d } });
    else if (b.k === 'summary') out.push({ k: 'summary', key: b.key, text: b.text });
    else if (b.key !== 'reach' && b.key !== 'dormant') out.push({ k: 'line', key: b.key, text: b.text, tone: b.tone });
  }
  return out;
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const optStr = (v: unknown): boolean => v === undefined || typeof v === 'string';
type DecidedKind = Extract<ConvBlock, { k: 'decided' }>['d']['kind'];
const DECIDED = new Set<string>(['once', 'session', 'deny', 'answered', 'declined', 'elsewhere', 'ended'] satisfies DecidedKind[]);
const STEP = new Set<string>(['ok', 'failed', 'unknown']);
/** A stored step row (never one still running), or null. What it says (the step's words, why it failed) is shown with its keys
 *  hidden, as the source hides them now: a copy written before that may still hold one. */
function stepOf(v: unknown): StepView | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (!isStr(r.id) || !isStr(r.verb) || !STEP.has(r.state as string) || !optStr(r.summary) || !optStr(r.time) || !optStr(r.note)) return null;
  return { id: r.id, state: r.state as StepView['state'], verb: r.verb, ...(isStr(r.summary) ? { summary: scrubSecrets(r.summary) } : {}), ...(isStr(r.time) ? { time: r.time } : {}), ...(isStr(r.note) ? { note: scrubSecrets(r.note) } : {}) };
}
/** A stored block as the view draws it, or null: a copy holding one that is not is shown not at all. */
function blockOf(v: unknown): ConvBlock | null {
  if (!v || typeof v !== 'object') return null;
  const b = v as Record<string, unknown>;
  if (!isStr(b.key)) return null;
  switch (b.k) {
    case 'user': {
      if (!isStr(b.text) || typeof b.at !== 'number') return null;
      const n = b.note as Record<string, unknown> | undefined;
      if (n !== undefined && (!n || typeof n !== 'object' || !isStr(n.text) || !(n.bad === undefined || n.bad === true))) return null;
      let files: FileView[] | undefined;
      if (b.files !== undefined) {
        if (!Array.isArray(b.files)) return null;
        files = [];
        for (const v of b.files as unknown[]) {
          const x = v as Record<string, unknown> | null;
          if (!x || typeof x !== 'object' || !isStr(x.id) || !(x.kind === 'image' || x.kind === 'text') || !isStr(x.name) || !optStr(x.meta)) return null;
          files.push({ id: x.id, kind: x.kind, name: x.name, ...(isStr(x.meta) ? { meta: x.meta } : {}) });
        }
      }
      return { k: 'user', key: b.key, text: b.text, at: b.at, ...(files ? { files } : {}), ...(n ? { note: { text: n.text as string, ...(n.bad ? { bad: true } : {}) } } : {}) };
    }
    case 'reply': return isStr(b.text) && typeof b.final === 'boolean' && (b.cost === null || typeof b.cost === 'number') && (b.at === null || typeof b.at === 'number')
      ? { k: 'reply', key: b.key, text: b.text, streaming: false, final: b.final, cost: b.cost as number | null, at: b.at as number | null, ...(isStr(b.cut) ? { cut: b.cut } : {}) } : null;
    case 'steps': {
      if (!(b.state === 'ok' || b.state === 'failed' || b.state === 'unknown') || !isStr(b.label) || !Array.isArray(b.rows)) return null;
      const rows: StepView[] = [];
      for (const r of b.rows as unknown[]) { const x = stepOf(r); if (!x) return null; rows.push(x); }
      return { k: 'steps', key: b.key, label: b.label, state: b.state, rows };
    }
    case 'decided': {
      const d = b.d as Record<string, unknown> | null;
      return d && typeof d === 'object' && DECIDED.has(d.kind as string) && isStr(d.tool) && isStr(d.text) && optStr(d.answer) && (d.typed === undefined || d.typed === true)
        && (d.more === undefined || (Number.isSafeInteger(d.more) && (d.more as number) > 0))
        ? { k: 'decided', key: b.key, d: { kind: d.kind as DecidedKind, tool: d.tool, text: d.text, ...(isStr(d.answer) ? { answer: d.answer } : {}), ...(d.typed ? { typed: true as const } : {}), ...(d.more !== undefined ? { more: d.more as number } : {}) } } : null;
    }
    case 'summary': return isStr(b.text) ? { k: 'summary', key: b.key, text: b.text } : null;
    case 'line': return isStr(b.text) && (b.tone === 'muted' || b.tone === 'bad' || b.tone === 'info') ? { k: 'line', key: b.key, text: b.text, tone: b.tone } : null;
    default: return null;
  }
}

/** The shown account's copy of the chat, or null. */
export async function readCached(ref: ConvRef): Promise<{ blocks: ConvBlock[]; at: number } | null> {
  const uid = shown();
  if (!uid) return null;
  try {
    if (!(await dropOthers(uid))) return null;
    const id = idOf(uid, ref);
    const row = await theStore().get(id);
    if (!row || row.uid !== uid) return null;
    const text = await openBlob(uid, CACHE_SLOT, partOf(ref), row.env);
    // Not opened: a key rotated or forgotten, or an account still opening here (boot waits for it only so long). Either way it
    // reads as none and stays: the chat's next write replaces it, the cap or a purge removes it.
    if (text === null) return null;
    const doc = JSON.parse(text) as { v?: unknown; at?: unknown; blocks?: unknown };
    if (doc.v !== 1 || typeof doc.at !== 'number' || !Array.isArray(doc.blocks)) return null;
    const blocks = doc.blocks.map(blockOf);
    if (!blocks.length || blocks.some((b) => b === null)) return null;
    return shown() === uid ? { blocks: blocks as ConvBlock[], at: doc.at } : null;
  } catch { return null; }
}

/** The account a copy would be kept for now ('' for none): the source captures it when a view settles. */
export function cacheAccount(): string { return shown(); }

/** One write at a time, in the order asked (the cap is judged on what the earlier writes left; an older copy never lands after
 *  a newer one). Every step that can wait long (the seal, behind the account's crypt lock in another tab; a store call, behind
 *  another tab's transaction) is bounded (STEP_WAIT_MS): a write whose step does not answer in time ends there and starts no
 *  later step, so one stuck write never holds the rest. A step it had already started may still finish: IndexedDB runs
 *  overlapping read-write transactions in the order they were made, so it lands before any later write's, never after. */
let writing: Promise<unknown> = Promise.resolve();
let stepWaitMs = 10_000;
let seal: typeof sealBlob = sealBlob;
const enc = new TextEncoder();

class Stuck extends Error {}
/** `p`'s answer within the step wait; Stuck otherwise (the write ends, its late answer is dropped). */
function step<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Stuck()), stepWaitMs); })]).finally(() => clearTimeout(timer));
}

/** Keeps `blocks` (a settled chat's, source.ts cacheable) as the chat's copy for `expect` (the account shown when it settled),
 *  only while that account is still shown. Resolves true when the copy was stored. */
export function writeCached(ref: ConvRef, blocks: readonly ConvBlock[], now = Date.now(), expect = shown()): Promise<boolean> {
  const run = writing.then(() => writeOne(ref, blocks, now, expect)).catch(() => false);
  writing = run;
  return run;
}

/** True only when the copy was stored (the source keeps trying an unchanged view otherwise). */
async function writeOne(ref: ConvRef, blocks: readonly ConvBlock[], now: number, expect: string): Promise<boolean> {
  const uid = shown();
  if (!uid || uid !== expect) return false;
  const pg = purges, id = idOf(uid, ref);
  try {
    const all = await step(theStore().list());
    const others = all.filter((r) => r.uid !== uid).map((r) => r.id);
    if (others.length) await step(theStore().del(others));
    const kept = cacheBlocks(blocks);
    const text = kept.length ? JSON.stringify({ v: 1, at: now, blocks: kept }) : '';
    // The cap is on the encoded plaintext's bytes (UTF-8), not its UTF-16 length.
    if (!text || enc.encode(text).length > CACHE_BYTES) { await step(theStore().del([id])); return false; }
    const sealed = await step(seal(CACHE_SLOT, partOf(ref), text));
    if (!sealed || sealed.uid !== uid || shown() !== uid || purges !== pg) return false;
    await step(theStore().put({ id, uid, at: now, env: sealed.env }));
    // A purge that ran while this was stored: the row goes again.
    if (purges !== pg || shown() !== uid) { await step(theStore().del([id])); return false; }
    // The cap, on the store as it is after the put (another tab may have written meanwhile); when that listing does not answer in
    // time or fails, on the listing this write began with plus this row (writes of this page are serial), so the eviction is never skipped.
    // Newest first by write time (this write first among equals); everything past CACHE_MAX goes, this one too when it is the
    // oldest (a clock that went back). An issued delete runs even if it answers late (the step only stops waiting).
    const fresh = await step(theStore().list()).catch(() => null);
    const rows = fresh ? fresh.filter((r) => r.uid === uid) : [...all.filter((r) => r.uid === uid && r.id !== id), { id, uid, at: now }];
    const over = rows.sort((a, b) => b.at - a.at || (a.id === id ? -1 : b.id === id ? 1 : 0)).slice(CACHE_MAX).map((r) => r.id);
    if (over.length) await step(theStore().del(over));
    return !over.includes(id);
  } catch { return false; }
}

/** Tests: how long one step may take, and the seal itself (null: the real one). */
export function setSealForTests(ms: number, fn: typeof sealBlob | null = null): void { stepWaitMs = ms; seal = fn ?? sealBlob; }

/** Tests: the rows' store (null: IndexedDB again). */
export function setCacheStoreForTests(s: CacheStore | null): void { store = s; purges++; }
