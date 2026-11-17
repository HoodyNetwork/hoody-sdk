// Running an upload batch (upload.ts rules, core sendFile), one press, in the background.
//
// Contract, in plain words:
//   - start(c, folder, picks) admits the batch's own durable hold (core holdAttempt, data.ts uploadLock: one per
//     computer, across tabs) before anything is sent, reads again that no Files change is held or out on the
//     computer and changes are on (data.ts uploadGate; refused HELD_OVERLAP or CHANGES_OFF, the hold freed,
//     nothing sent), then sends.
//   - The picked files stay in this tab's memory: after a reload or in another tab only the hold's meta is known,
//     and files never sent read "not sent: pick them again" (meta.left).
//   - Up to PER_COMPUTER files go at once (core queues the rest per computer anyway). Before each file the gate is
//     read again. Each file's SHA-256 is stored in the hold (phase sending) before its PUT leaves (sendFile's
//     beforeSend: a write that does not land sends nothing); a known answer removes it; an unknown one keeps it as
//     unknown and stops the batch (by default the batch stops at the first unknown); files not sent then read
//     "not sent". Continue sends them later from this tab, never while MAX_UNKNOWN outcomes are unknown. The cap
//     is checked inside that one-at-a-time write, counting every file the hold keeps (sending or unknown), so
//     workers at once never pass it.
//   - Meta writes are one at a time (a compare-and-set on the hold's version each). The hold carries this tab's
//     sending stamp while the batch runs, so no tab offers Check again for a file that is still being sent.
//   - The batch ends: nothing unknown and nothing left → the hold is freed. Files only left → the hold stays and
//     holds nothing back (a reload says "pick them again"). Unknown left → the hold stays (every Files change on
//     the computer waits) until Check again (reads only: the folder, then the SHA-256) settles each, or the person's
//     warned Stop tracking frees it.
//   - Cancel cuts every send: a file not sent yet is not sent; one whose request had left is unknown (fetch cannot
//     tell whether its body was complete, so it is never shown as not uploaded).
import { attemptFor, holdAttempt, mergeStoredChanges, PER_COMPUTER, sendFile, type AttemptHold } from '@core';
import { useSyncExternalStore } from 'react';
import { freshHash, freshListing, refreshFolders, UPLOAD_BY, uploadBlocks, uploadCall, uploadGate, uploadLock, uploadsOn, type FilesComputer, type HeldUpload } from './data';
import { joinPath, partsOf } from './logic';
import { checkOf, MAX_UNKNOWN, verdictOf, type UploadEntry, type UploadMeta } from './upload';

export type ItemState = 'queued' | 'hashing' | 'sending' | 'done' | 'taken' | 'refused' | 'unknown' | 'notSent';
export interface Item {
  readonly i: number;
  /** The name it is sent as (the Keep-both name for a taken one). */
  readonly as: string;
  readonly size: number;
  readonly state: ItemState;
  /** notSent/refused: why (STOPPED, CANCELLED, HELD_OVERLAP, NOT_THERE, a kit code...). */
  readonly code?: string;
}
export type BatchPhase = 'running' | 'paused' | 'ended' | 'notSent';
export interface Batch {
  readonly id: string;
  readonly computer: string;
  readonly computerName: string;
  readonly folder: string;
  readonly items: readonly Item[];
  readonly phase: BatchPhase;
  /** notSent: why nothing was sent. */
  readonly code?: string;
}
/** What a Check again found for one file, kept for the page until dismissed (this tab only). */
export interface CheckNote { readonly key: string; readonly computer: string; readonly path: string; readonly found: 'absent' | 'uploaded' | 'other' }

// ---- this tab's batches (the page's view) ----
const batches = new Map<string, Batch>();
const files = new Map<string, readonly Blob[]>();
const notes: CheckNote[] = [];
const subs = new Set<() => void>();
let version = 0;
const bump = () => { version += 1; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const put = (b: Batch) => { batches.set(b.id, b); bump(); };
const setItem = (id: string, i: number, patch: Partial<Item>) => {
  const b = batches.get(id);
  if (!b) return;
  put({ ...b, items: b.items.map((x) => (x.i === i ? { ...x, ...patch } : x)) });
};
/** This tab's batches on a computer, oldest first. */
export function useBatches(computer: string | undefined): readonly Batch[] {
  useSyncExternalStore(subscribe, () => version);
  return computer ? [...batches.values()].filter((b) => b.computer === computer) : [];
}
export function useBatch(id: string | undefined): Batch | undefined {
  return useSyncExternalStore(subscribe, () => (id ? batches.get(id) : undefined));
}
export function useCheckNotes(computer: string): readonly CheckNote[] {
  useSyncExternalStore(subscribe, () => version);
  return notes.filter((n) => n.computer === computer);
}
export function forgetNote(key: string): void { const i = notes.findIndex((n) => n.key === key); if (i >= 0) { notes.splice(i, 1); bump(); } }
/** Tests only. */
export function resetUploads(): void { batches.clear(); files.clear(); notes.length = 0; runs.clear(); cancelledEarly.clear(); bump(); }

// ---- one batch's run ----
interface Run {
  hold: AttemptHold;
  meta: UploadMeta;
  v: number;
  chain: Promise<unknown>;
  stop: string | null;
  ac: AbortController;
  /** When each send's computer slot is freed (core sendFile `released`): a cut send's worker may still be sending
   *  until then, so the batch's sending stamp ends only after all of them. */
  freed: Promise<void>[];
}
const runs = new Map<string, Run>();
/** Batches cancelled while their hold was still being admitted (no run yet): they send nothing. */
const cancelledEarly = new Set<string>();

const newId = (): string => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from({ length: 4 }, () => Math.random().toString(16).slice(2, 10)).join('-'));

/** One meta write at a time: a compare-and-set on the hold's version. False: nothing written (`next` answering
 *  null writes nothing). */
function write(r: Run, next: (m: UploadMeta) => UploadMeta | null, sending: boolean): Promise<boolean> {
  const p = r.chain.then(async () => {
    const m = next(r.meta);
    if (!m) return false;
    const ok = await r.hold.update(m, r.v, sending ? { sending: true } : undefined);
    if (ok) { r.v += 1; r.meta = m; }
    return ok;
  });
  r.chain = p.then(() => undefined, () => undefined);
  return p.then((x) => x, () => false);
}
const without = (id: string) => (m: UploadMeta): UploadMeta => ({ ...m, files: m.files.filter((f) => f.id !== id) });

async function sendOne(c: FilesComputer, b: Batch, r: Run, item: Item, file: Blob): Promise<void> {
  const path = joinPath(b.folder, item.as);
  const gate = uploadGate(c.id);
  if (gate) { r.stop = r.stop ?? gate; setItem(b.id, item.i, { state: 'notSent', code: gate }); return; }
  const call = uploadCall(c, path);
  if (!call) { setItem(b.id, item.i, { state: 'refused', code: 'NOT_ADDRESSABLE' }); return; }
  const entry = `${b.id}:${item.i}:${newId().slice(0, 8)}`;
  let recorded = false;
  // Set when the gate refused inside beforeSend (changes turned off or a Files change came while the file hashed):
  // nothing is sent and the item says why.
  let gatedBy: string | null = null;
  const gateNow = () => { const g = uploadGate(c.id); if (g) { gatedBy = g; r.stop = r.stop ?? g; throw new Error(g); } };
  const o = await sendFile(call.route, {
    file,
    create: true,
    target: call.target,
    params: call.params,
    signal: r.ac.signal,
    // 'queued' in this batch means not taken by a worker yet: core's own queue (a slot on the computer) keeps the
    // item taken, so only hashing and sending are shown.
    onPhase: (p) => { if (p === 'hashing' || p === 'sending') setItem(b.id, item.i, { state: p }); },
    released: (done) => { r.freed.push(done); },
    beforeSend: async ({ sha256, size }) => {
      // Hashing may take long: the gate is read again before the record and after it lands, right before the PUT.
      gateNow();
      // The hard cap, inside the one-at-a-time write: every file the hold keeps (sending or unknown) counts, so
      // workers running at once never take the computer past MAX_UNKNOWN files of unknown outcome.
      let capped = false;
      const ok = await write(r, (m) => {
        if (m.files.length >= MAX_UNKNOWN) { capped = true; return null; }
        return { ...m, files: [...m.files, { id: entry, path, size, sha256, phase: 'sending' }], left: Math.max(0, m.left - 1) };
      }, true);
      if (capped) { r.stop = r.stop ?? 'TOO_MANY_UNKNOWN'; throw new Error('TOO_MANY_UNKNOWN'); }
      if (!ok) throw new Error('NOT_DURABLE');
      recorded = true;
      gateNow();
    },
  });
  const v = verdictOf(o);
  if (v.at === 'unknown') {
    // Kept as unknown; a write that does not land leaves it 'sending', which every tab reads as unknown too once
    // this batch's stamp ends.
    if (recorded) await write(r, (m) => ({ ...m, files: m.files.map((f) => (f.id === entry ? { ...f, phase: 'unknown' } : f)) }), true);
    r.stop = r.stop ?? 'UNKNOWN';
    setItem(b.id, item.i, { state: 'unknown' });
    return;
  }
  // A known answer, or nothing sent: this file no longer matters after this tab (a removal that does not land
  // leaves it held, read as unknown, and Check again settles it).
  if (recorded) await write(r, without(entry), true);
  if (v.at === 'done') setItem(b.id, item.i, { state: 'done' });
  else if (v.at === 'taken') setItem(b.id, item.i, { state: 'taken' });
  else if (v.at === 'refused') setItem(b.id, item.i, { state: 'refused', code: v.code });
  else {
    // Cut (a cancel, a realm switch, the account ending) or refused before it left: the rest is not sent either.
    if (v.code === 'aborted' || v.code === 'stale') r.stop = r.stop ?? (v.code === 'aborted' ? 'CANCELLED' : 'STALE');
    setItem(b.id, item.i, { state: 'notSent', code: gatedBy ?? (r.stop === 'TOO_MANY_UNKNOWN' && !recorded ? 'TOO_MANY_UNKNOWN' : v.code) });
  }
}

async function pump(c: FilesComputer, id: string): Promise<Batch> {
  const r = runs.get(id)!;
  const start = batches.get(id)!;
  put({ ...start, phase: 'running', code: undefined });
  const blobs = files.get(id) ?? [];
  const next = (): Item | undefined => {
    if (r.stop || r.meta.files.length >= MAX_UNKNOWN) return undefined;
    const b = batches.get(id)!;
    const it = b.items.find((x) => x.state === 'queued');
    if (it) setItem(id, it.i, { state: 'hashing' });
    return it;
  };
  const worker = async () => {
    for (let it = next(); it; it = next()) {
      const blob = blobs[it.i];
      if (!blob) { setItem(id, it.i, { state: 'notSent', code: 'NOT_PICKED' }); continue; }
      await sendOne(c, batches.get(id)!, r, it, blob);
    }
  };
  await Promise.all(Array.from({ length: PER_COMPUTER }, worker));
  // Files the batch did not send: not sent (they stay in this tab's memory for Continue).
  const why = r.stop === 'UNKNOWN' || !r.stop ? (r.meta.files.length >= MAX_UNKNOWN ? 'TOO_MANY_UNKNOWN' : 'STOPPED') : r.stop;
  let b = batches.get(id)!;
  b = { ...b, items: b.items.map((x) => (x.state === 'queued' || x.state === 'hashing' ? { ...x, state: 'notSent' as const, code: why } : x)) };
  put(b);
  const left = b.items.filter((x) => x.state === 'notSent').length;
  await write(r, (m) => ({ ...m, left }), false);
  await r.chain;
  // A cut send's worker may still be sending: the stamp (every tab reads the batch as sending, so Check again proves
  // nothing absent) stays until each send's slot is freed.
  await Promise.all(r.freed);
  r.hold.sent();
  runs.delete(id);
  // Nothing unknown: the hold goes when nothing is left either, or the person cancelled (the files stay in this
  // tab for Continue). Otherwise it stays: unknown files hold the computer; files only left (no unknown) are
  // remembered for a reload ("pick them again") and hold nothing back (data.ts uploadBlocks).
  if (!r.meta.files.length && (!left || why === 'CANCELLED')) {
    await r.hold.free('done', { metaVersion: r.v });
    b = { ...batches.get(id)!, phase: 'ended' };
  } else {
    b = { ...batches.get(id)!, phase: 'paused', code: why };
  }
  put(b);
  refreshFolders(c.id);
  return b;
}

/** Admit a batch's hold on `c`, read the gate again, and run it. */
async function admit(c: FilesComputer, id: string, folder: string, left: number): Promise<{ ok: true; run: Run } | { ok: false; code: string }> {
  const first = uploadGate(c.id);
  if (first) return { ok: false, code: first };
  // A batch that only remembers files it never sent (no unknown, no send out) is superseded by a new pick.
  for (const u of uploadsOn(c.id)) {
    if (uploadBlocks(u)) continue;
    const old = attemptFor(u.hold.id, UPLOAD_BY);
    if (!old || (await old.free('dismissed', { metaVersion: u.hold.metaVersion })) !== 'freed') return { ok: false, code: 'HELD_OVERLAP' };
  }
  const meta: UploadMeta = { v: 1, batch: id, computer: c.id, computerName: c.name, folder, files: [], left };
  const h = await holdAttempt(uploadLock(c.id), { by: UPLOAD_BY, meta, identity: { computer: c.id } });
  if (!h.ok) return { ok: false, code: h.code === 'HELD' ? 'HELD_OVERLAP' : h.code };
  // Read again after this hold is stored: a Files change admitted meanwhile reads this hold and refuses, or this
  // read finds it (both may refuse; never both send). The stored changes are merged first: another tab's change
  // stored before this hold may not have reached this tab's memory yet (its storage event comes later; :995). A
  // store that does not read clean proves no absence: refused.
  const again = mergeStoredChanges() ? uploadGate(c.id) : 'STORE_UNREADABLE';
  if (again) {
    // holdAttempt started this tab's sending stamp: end it first, or core refuses the free and the stamp beats on.
    h.hold.sent();
    await h.hold.free('done', { metaVersion: 0 });
    return { ok: false, code: again };
  }
  return { ok: true, run: { hold: h.hold, meta, v: 0, chain: Promise.resolve(), stop: null, ac: new AbortController(), freed: [] } };
}

export interface Pick { readonly as: string; readonly file: Blob }

/** Start, continue, cancel and check upload batches (one press each). */
export function useUpload() {
  return {
    /** Upload `picks` (already planned: names checked, Skip left out) into `folder` on `c`. */
    async start(c: FilesComputer, folder: string, picks: readonly Pick[]): Promise<Batch> {
      const id = newId();
      const items: Item[] = picks.map((p, i) => ({ i, as: p.as, size: p.file.size, state: 'queued' }));
      files.set(id, picks.map((p) => p.file));
      put({ id, computer: c.id, computerName: c.name, folder, items, phase: 'running' });
      const a = await admit(c, id, folder, items.length);
      const early = cancelledEarly.delete(id);
      if (a.ok && early) {
        // Cancelled while the hold was being admitted: nothing was sent, so the hold goes (its stamp ended first).
        a.run.hold.sent();
        await a.run.hold.free('done', { metaVersion: 0 });
      }
      if (!a.ok || early) {
        const code = a.ok ? 'CANCELLED' : a.code;
        const b: Batch = { ...batches.get(id)!, phase: 'notSent', code, items: items.map((x) => ({ ...x, state: 'notSent', code })) };
        put(b);
        return b;
      }
      runs.set(id, a.run);
      return pump(c, id);
    },
    /** Send this tab's files a batch did not send (stopped, cancelled, proved not there), under its hold (admitted
     *  again when Check again freed it). Never while MAX_UNKNOWN outcomes are unknown on the computer. */
    async resume(c: FilesComputer, id: string): Promise<Batch | undefined> {
      const b = batches.get(id);
      if (!b || b.phase === 'running' || runs.has(id) || b.computer !== c.id) return b;
      const again = b.items.filter((x) => x.state === 'notSent' && x.code !== 'NOT_PICKED');
      if (!again.length) return b;
      put({ ...b, items: b.items.map((x) => (again.includes(x) ? { ...x, state: 'queued' as const, code: undefined } : x)) });
      const refuse = (code: string) => {
        const back = batches.get(id)!;
        put({ ...back, phase: 'paused', code, items: back.items.map((x) => (x.state === 'queued' ? { ...x, state: 'notSent' as const, code } : x)) });
        return batches.get(id);
      };
      // This batch's own hold, still held (its unknown files not all settled): go on under it.
      const cur = uploadsOn(c.id)[0];
      if (cur) {
        const m = cur.meta;
        const h = attemptFor(cur.hold.id, UPLOAD_BY);
        if (!m || !h || m.batch !== id || cur.hold.inFlight) return refuse('HELD_OVERLAP');
        if (m.files.length >= MAX_UNKNOWN) return refuse('TOO_MANY_UNKNOWN');
        const g = uploadGate(c.id);
        if (g) return refuse(g);
        const r: Run = { hold: h, meta: m, v: cur.hold.metaVersion, chain: Promise.resolve(), stop: null, ac: new AbortController(), freed: [] };
        // The sending stamp lands before any file is taken (from then on every Files change reads this hold as
        // blocking); each file's own gate read (sendOne) comes after it, so a change admitted before the stamp
        // landed is seen there and nothing is sent. A stamp that does not land sends nothing (and starts no beat:
        // core starts it only once the write lands).
        if (!(await write(r, (x) => ({ ...x, left: again.length }), true))) return refuse('HELD_OVERLAP');
        // As admit's re-read: another tab's Files change stored before the stamp landed may not be in memory yet
        // (:995). Refused, the stamp ends (the hold stays: its unknown files still hold the computer).
        const g2 = mergeStoredChanges() ? uploadGate(c.id) : 'STORE_UNREADABLE';
        if (g2) { r.hold.sent(); return refuse(g2); }
        runs.set(id, r);
        return pump(c, id);
      }
      const a = await admit(c, id, b.folder, again.length);
      if (!a.ok) return refuse(a.code);
      runs.set(id, a.run);
      return pump(c, id);
    },
    /** Cut every send of a running batch (see the contract). */
    cancel(id: string): void {
      const r = runs.get(id);
      if (!r) { if (batches.get(id)?.phase === 'running') cancelledEarly.add(id); return; }
      r.stop = 'CANCELLED';
      try { r.ac.abort(); } catch { /* done */ }
    },
    /** Check again for a held batch's files whose outcome is unknown: reads only (the folder, then each SHA-256).
     *  Each file a read settles leaves the hold; the hold goes when none is left and no file is left unsent. False: nothing could be decided
     *  (a read failed, or another tab moved the hold). */
    async check(c: FilesComputer, held: HeldUpload): Promise<boolean> {
      const m = held.meta;
      const h = attemptFor(held.hold.id, UPLOAD_BY);
      if (!m || !h || m.computer !== c.id || held.hold.inFlight) return false;
      const listing = await freshListing(c, m.folder);
      const settled: { e: UploadEntry; found: 'absent' | 'uploaded' | 'other' }[] = [];
      for (const e of m.files) {
        let k = checkOf(e, listing, undefined);
        if (k.at === 'reading' && k.hash) k = checkOf(e, listing, await freshHash(c, e.path));
        if (k.at === 'absent' || k.at === 'uploaded' || k.at === 'other') settled.push({ e, found: k.at });
      }
      if (!settled.length) return false;
      const rest = m.files.filter((f) => !settled.some((s) => s.e.id === f.id));
      // Files never sent (left) keep a hold that holds nothing back, so a reload still says "pick them again".
      const ok = rest.length || m.left > 0
        ? await h.update({ ...m, files: rest }, held.hold.metaVersion)
        : (await h.free('proved', { metaVersion: held.hold.metaVersion })) === 'freed';
      if (!ok) return false;
      for (const s of settled) {
        notes.push({ key: `${s.e.id}:check`, computer: c.id, path: s.e.path, found: s.found });
        // This tab still has the file: one proved not there can be sent again (Continue).
        const b = batches.get(m.batch);
        const name = partsOf(s.e.path).at(-1);
        const it = b?.items.find((x) => x.as === name && x.state === 'unknown');
        if (b && it) setItem(b.id, it.i, s.found === 'uploaded' ? { state: 'done' } : s.found === 'absent' ? { state: 'notSent', code: 'NOT_THERE' } : { state: 'taken' });
      }
      bump();
      refreshFolders(c.id);
      return true;
    },
    /** The person's warned Stop tracking: frees the hold (only the version shown, never while a send is out). */
    async stopTracking(held: HeldUpload): Promise<boolean> {
      const h = attemptFor(held.hold.id, UPLOAD_BY);
      return !!h && (await h.free('dismissed', { metaVersion: held.hold.metaVersion })) === 'freed';
    },
  };
}

