// Download from a link: sending, holding and following a link download.
//
// Contract, in plain words:
//   - send(c, folder, link, filename) makes the download's id (a fresh UUID) and stores a hold for it in core's
//     change store (holdAttempt, lock files.link:<id>, sender files:link) BEFORE the request leaves: the hold carries
//     the computer, folder, file name, id and phase, never the link. Nothing is sent without a stored hold, and while
//     changes are off nothing is held or sent (CHANGES_OFF, read live at each send).
//   - The link lives only in this tab's memory (every pasted link is secret), so only this tab can send
//     it again, and only with the same id.
//   - The request answers 202 once the computer has recorded the download: the hold is freed and the download is
//     followed by its id (GET /api/v1/downloads/{id}) while this tab lives. 409 DOWNLOAD_ID_EXISTS also proves the
//     request arrived: it is read by id. 429 JOB_COUNT_LIMIT recorded nothing: the same id is sent again after a
//     wait (BUSY_WAITS_MS), the hold kept with phase 'waiting', then the person is told and the hold freed. A
//     refusal made before any effect (logic.ts verdictOf) frees the hold and says why. Anything else, no answer
//     included, keeps the hold with phase 'unknown': "This may have gone through".
//   - check(c, held) reads first (GET /api/v1/downloads/{id}) and may send the same request again. Found: it is this download,
//     the hold is freed and the download followed. Not found: within RESEND_MAX_MS and while this tab still has the
//     link, the same id is sent again (DOWNLOAD_ID_EXISTS proves arrival; any other refusal of that resend stays
//     unknown); without the link (another tab, a reload) it says so and the hold stays; past RESEND_MAX_MS it is
//     never sent again. A hold whose last answer was a 429 recorded nothing (phase 'waiting', no send out): it reads
//     as not sent. Only the person's warned Stop tracking frees a hold that may have gone through.
//   - Following: each accepted download of this tab is read by id every 2 s while the page shows it, every 10 s after
//     a minute (reads pause in a hidden tab). An end status settles it: completed is done only when a
//     fresh listing of its folder holds the file; failed and cancelled say so in fixed words,
//     never the program's text. cancel(c, id) asks the computer to stop it; the record decides what happened (a
//     completed record means the cancel lost the race).
//   - useKitReady(c, enabled): GET /api/v1/version lists download_client_id (older Hoody Kits get the action off).
import { api, attemptFor, can, coreSource, heldAttempts, holdAttempt, useAttemptsVersion, type AttemptHold, type HeldAttempt } from '@core';
import { useSyncExternalStore } from 'react';
import { freshListing, refreshFolders, type FilesComputer } from '../data';
import { partsOf } from '../logic';
import { BUSY_WAITS_MS, LINK_TIMEOUT_S, RESEND_MAX_MS, hasLinkFeature, recordOf, recordsOf, savedStateOf, verdictOf, type LinkRecord, type SendVerdict } from './logic';
import { cancelRoute, downloadRoute, downloadsRoute, linkRoute, versionRoute } from './routes';

export const LINK_BY = 'files:link';
const LOCK_PREFIX = 'files.link:';
const linkLock = (id: string) => LOCK_PREFIX + id;

export type LinkPhase = 'sending' | 'waiting' | 'unknown';
/** A link download's hold meta: plain data, never the link. */
export interface LinkMeta {
  readonly v: 1;
  readonly computer: string;
  /** The computer's name when it was sent. */
  readonly name: string;
  readonly folder: string;
  readonly filename: string;
  readonly id: string;
  readonly phase: LinkPhase;
  /** An answer was lost at least once: a later refusal of a resend proves nothing. */
  readonly lost: boolean;
  /** When the first send began (this client's clock). */
  readonly at: number;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function metaOf(raw: unknown): LinkMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const ok = m.v === 1 && typeof m.computer === 'string' && !!m.computer && typeof m.name === 'string' && typeof m.folder === 'string' && m.folder.startsWith('/')
    && typeof m.filename === 'string' && typeof m.id === 'string' && UUID.test(m.id) && (m.phase === 'sending' || m.phase === 'waiting' || m.phase === 'unknown')
    && typeof m.lost === 'boolean' && typeof m.at === 'number' && Number.isFinite(m.at);
  return ok ? (m as unknown as LinkMeta) : null;
}

/** A link download held on a computer: its hold and its meta (null when the meta does not read back whole). */
export interface HeldLink { readonly hold: HeldAttempt; readonly meta: LinkMeta | null }
const computerOfHold = (h: HeldAttempt, m: LinkMeta | null): string => m?.computer ?? String((h.identity as { computer?: unknown } | null)?.computer ?? '');
/** Every link download held in this account (computer '' when even the identity does not name one). */
export function heldLinks(): HeldLink[] {
  return heldAttempts().filter((h) => h.by === LINK_BY && h.lock.startsWith(LOCK_PREFIX)).map((hold) => ({ hold, meta: metaOf(hold.meta) }));
}
const heldLinkComputer = (h: HeldLink): string => computerOfHold(h.hold, h.meta);
export function useHeldLinks(computer?: string): readonly HeldLink[] {
  useAttemptsVersion();
  const all = heldLinks();
  return computer === undefined ? all : all.filter((h) => heldLinkComputer(h) === computer);
}

// ── This tab's link downloads ─────────────────────────────────────────────────────────────────────────────────
export type LinkState =
  | 'sending' | 'waiting' | 'unknown' // a hold is kept
  | 'accepted' // recorded on the computer: followed by its id
  | 'done' | 'missing' | 'unchecked' | 'failed' | 'cancelled' // ended (completed: in the folder / not there / folder unread)
  | 'refused' | 'busy' | 'notSent'; // nothing was started
export interface LinkEntry {
  readonly id: string;
  readonly computer: string;
  readonly computerName: string;
  readonly folder: string;
  readonly filename: string;
  readonly state: LinkState;
  /** refused / notSent: the code (CHANGES_OFF, FILE_PATH_BUSY, HELD, …), or the status as a string. */
  readonly code?: string;
  /** done / missing / unchecked: the name the computer saved it as (it adds -N when the name is taken). */
  readonly savedAs?: string;
  /** When this tab first knew it (ordering). */
  readonly at: number;
}

/** `lost`: an answer was lost at least once, known in this tab even when the hold's meta could not record it. */
interface Mem { link: string; hold: AttemptHold; meta: LinkMeta; version: number; lost: boolean }
/** The link and hold handle of each download this tab sent: memory only. */
const mem = new Map<string, Mem>();
const entries = new Map<string, LinkEntry>();
let version = 0;
const subs = new Set<() => void>();
const bump = () => { version++; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const put = (e: LinkEntry) => { entries.set(e.id, e); bump(); };
const patch = (id: string, p: Partial<LinkEntry>) => { const e = entries.get(id); if (e) put({ ...e, ...p }); };

/** This tab's link downloads on a computer (all computers without one), newest first. */
export function useLinkEntries(computer?: string): readonly LinkEntry[] {
  useSyncExternalStore(subscribe, () => version, () => version);
  return [...entries.values()].filter((e) => computer === undefined || e.computer === computer).sort((a, b) => b.at - a.at);
}
/** Forget an ended entry (its line's Dismiss). Never one that still holds or runs. */
export function forget(id: string): void {
  const e = entries.get(id);
  if (e && !HOLDING.has(e.state) && e.state !== 'accepted') { entries.delete(id); bump(); }
}
const HOLDING: ReadonlySet<LinkState> = new Set(['sending', 'waiting', 'unknown']);
/** This tab is working on this hold now (sending, or waiting to send it again): its own line shows it. */
export const ownsHold = (id: string): boolean => { const e = entries.get(id); return !!e && (e.state === 'sending' || e.state === 'waiting'); };

type Target = { project: { id: string }; container: { id: string; server_name: string } };
const targetOf = (c: Pick<FilesComputer, 'id' | 'project_id' | 'server_name'>): Target => ({ project: { id: c.project_id }, container: { id: c.id, server_name: c.server_name } });
const errOf = (e: unknown) => (e && typeof e === 'object' ? (e as { status?: unknown; code?: unknown }) : {});
const codeOf = (e: unknown): string => { const x = errOf(e); return typeof x.code === 'string' && x.code ? x.code : typeof x.status === 'number' ? String(x.status) : 'REFUSED'; };
// The 429 waits that are out now, each with its timer: a test ends them itself (endBusyWaitsForTest) or drops them
// (resetLinksForTest) instead of racing a real clock.
const waiting = new Map<() => void, ReturnType<typeof setTimeout>>();
const wait = (ms: number) => new Promise<void>((r) => {
  const done = () => { waiting.delete(done); r(); };
  waiting.set(done, setTimeout(done, ms));
});
/** Tests: every 429 wait that is out ends now, as if its time had passed. */
export function endBusyWaitsForTest(): void {
  for (const [done, id] of [...waiting]) { clearTimeout(id); done(); }
}
/** Tests: the waits between 429 resends (null: BUSY_WAITS_MS). */
let busyWaits: readonly number[] | null = null;
export function setBusyWaitsForTest(w: readonly number[] | null): void { busyWaits = w; }

/** A changed meta written over the version this tab holds (a compare-and-set); false: nothing written. */
async function rewrite(m: Mem, next: Partial<LinkMeta>, sending = false): Promise<boolean> {
  const meta = { ...m.meta, ...next };
  const ok = await m.hold.update(meta, m.version, sending ? { sending: true } : undefined);
  if (ok) { m.meta = meta; m.version += 1; }
  return ok;
}

export interface SendResult { readonly id: string | null; readonly state: LinkState; readonly code?: string }

/** Send a link download into `folder` on `c` (see the contract). */
export async function send(c: FilesComputer, folder: string, link: string, filename: string): Promise<SendResult> {
  if (!can('computers.actions.exec')) return { id: null, state: 'refused', code: 'CHANGES_OFF' };
  const id = crypto.randomUUID();
  const meta: LinkMeta = { v: 1, computer: c.id, name: c.name, folder, filename, id, phase: 'sending', lost: false, at: Date.now() };
  const held = await holdAttempt(linkLock(id), { by: LINK_BY, meta, identity: { kind: 'link', computer: c.id, name: c.name, folder, filename } });
  if (!held.ok) return { id: null, state: 'notSent', code: held.code };
  mem.set(id, { link, hold: held.hold, meta, version: 0, lost: false });
  put({ id, computer: c.id, computerName: c.name, folder, filename, state: 'sending', at: meta.at });
  // The press answers at the first answer: a 429's waits and resends go on in the background, its line says so.
  return firstOf(attempt(c, id), id);
}

/** The attempt's result, or 'waiting' as soon as it starts waiting to send again (whichever comes first). */
function firstOf(run: Promise<SendResult>, id: string): Promise<SendResult> {
  return new Promise((resolve) => {
    const onChange = () => { if (entries.get(id)?.state === 'waiting') { subs.delete(onChange); resolve({ id, state: 'waiting' }); } };
    subs.add(onChange);
    void run.then((r) => { subs.delete(onChange); resolve(r); });
  });
}

/** One send of a held link download, and its 429 resends; the hold is stamped as sending while it is out. */
async function attempt(c: FilesComputer, id: string): Promise<SendResult> {
  const m = mem.get(id)!;
  const waits = busyWaits ?? BUSY_WAITS_MS;
  for (let tries = 0; ; tries++) {
    // Checked again at each send: the session's capabilities may have changed since the press.
    const resent = m.lost || m.meta.lost;
    if (!can('computers.actions.exec')) return resent ? stayUnknown(m) : settleUnsent(m, 'refused', 'CHANGES_OFF');
    // Never sent again past RESEND_MAX_MS, an automatic 429 resend after a long sleep included: a lost answer
    // stays unknown (Check again says it is too old); after a 429 nothing was recorded.
    if ((tries > 0 || resent) && Date.now() - m.meta.at > RESEND_MAX_MS) return resent ? stayUnknown(m) : settleUnsent(m, 'busy', 'JOB_COUNT_LIMIT');
    let verdict: SendVerdict;
    let err: unknown = null;
    try {
      await api(linkRoute as never, {
        target: targetOf(c), params: { path: partsOf(m.meta.folder) }, recovers: true,
        query: { download_from: m.link, filename: m.meta.filename, id, timeout: LINK_TIMEOUT_S },
      });
      m.hold.sent();
      return accepted(c, m);
    } catch (e) {
      m.hold.sent();
      err = e;
      verdict = verdictOf(e);
    }
    if (verdict === 'arrived') return readArrived(c, m);
    // After a lost answer a refusal of the resend proves nothing about the first send: it stays unknown.
    if (verdict === 'refused') return resent ? stayUnknown(m) : settleUnsent(m, 'refused', codeOf(err));
    if (verdict === 'busy' && !resent) {
      if (tries >= waits.length) return settleUnsent(m, 'busy', 'JOB_COUNT_LIMIT');
      // Nothing was recorded: say so in the hold before waiting, then stamp it sending again before the resend.
      if (!(await rewrite(m, { phase: 'waiting' }))) return lostTrack(m);
      patch(id, { state: 'waiting' });
      await wait(waits[tries]!);
      if (!(await rewrite(m, { phase: 'sending' }, true))) return lostTrack(m);
      patch(id, { state: 'sending' });
      continue;
    }
    // Unknown (a 429 after a lost answer included: the first may still arrive).
    return stayUnknown(m);
  }
}

/** It may have gone through: the hold stays, marked unknown (a lost answer), for Check again. */
async function stayUnknown(m: Mem): Promise<SendResult> {
  m.hold.sent();
  m.lost = true;
  await rewrite(m, { phase: 'unknown', lost: true });
  patch(m.meta.id, { state: 'unknown' });
  return { id: m.meta.id, state: 'unknown' };
}

/** The hold's meta could not be written (another tab freed it, storage refused): stop; the hold says what it says. */
function lostTrack(m: Mem): SendResult {
  m.hold.sent();
  patch(m.meta.id, { state: 'unknown' });
  return { id: m.meta.id, state: 'unknown' };
}

/** Nothing was started: the hold is freed (only when the state checked is still stored) and the reason kept. */
async function settleUnsent(m: Mem, state: 'refused' | 'busy', code: string): Promise<SendResult> {
  m.hold.sent();
  await m.hold.free('done', { metaVersion: m.version });
  mem.delete(m.meta.id);
  patch(m.meta.id, { state, code });
  return { id: m.meta.id, state, code };
}

function accepted(c: FilesComputer, m: Mem): SendResult {
  m.hold.release();
  mem.delete(m.meta.id);
  follow(c, m.meta);
  return { id: m.meta.id, state: 'accepted' };
}

/** 409 DOWNLOAD_ID_EXISTS: the download reached the computer. Read it by id; until a read finds it, it stays held. */
async function readArrived(c: FilesComputer, m: Mem): Promise<SendResult> {
  const r = await readOne(c, m.meta.id);
  if (r && r !== 'none') return accepted(c, m);
  return stayUnknown(m);
}

/** One download read by id now: its record, 'none' (404: no record), or null (the read failed). */
async function readOne(c: Pick<FilesComputer, 'id' | 'project_id' | 'server_name'>, id: string): Promise<LinkRecord | 'none' | null> {
  try {
    const r = recordOf(await api(downloadRoute as never, { target: targetOf(c), params: { id } }));
    return r && r.id === id ? r : null;
  } catch (e) {
    return errOf(e).status === 404 ? 'none' : null;
  }
}

function follow(c: FilesComputer, m: Pick<LinkMeta, 'id' | 'folder' | 'filename' | 'at'>): void {
  const was = entries.get(m.id);
  put({ id: m.id, computer: c.id, computerName: c.name, folder: m.folder, filename: m.filename, state: 'accepted', at: was?.at ?? m.at });
}

export type CheckResult = 'found' | 'resent' | 'notFound' | 'tooOld' | 'failed' | 'busy' | 'unsent';

/** Check again for a held link download (see the contract): reads by id; resends the same id only from this tab. */
export async function check(c: FilesComputer, held: HeldLink): Promise<CheckResult> {
  const m = held.meta;
  if (!m || held.hold.inFlight) return 'failed';
  const handle = attemptFor(held.hold.id, LINK_BY);
  if (!handle) return 'failed';
  // A hold whose last answer was a 429 (nothing recorded, no answer lost before it): it never started.
  if (m.phase === 'waiting' && !m.lost) {
    const r = await handle.free('proved', { metaVersion: held.hold.metaVersion });
    if (r !== 'freed') return 'failed';
    mem.delete(m.id);
    put({ id: m.id, computer: m.computer, computerName: m.name, folder: m.folder, filename: m.filename, state: 'busy', code: 'JOB_COUNT_LIMIT', at: entries.get(m.id)?.at ?? m.at });
    return 'unsent';
  }
  const r = await readOne(c, m.id);
  if (r === null) return 'failed';
  if (r !== 'none') {
    if ((await handle.free('proved', { metaVersion: held.hold.metaVersion })) !== 'freed') return 'failed';
    mem.delete(m.id);
    follow(c, m);
    return 'found';
  }
  if (Date.now() - m.at > RESEND_MAX_MS) return 'tooOld';
  const own = mem.get(m.id);
  if (!own || own.version !== held.hold.metaVersion) return 'notFound';
  // Not found, within the program's memory of ids, and this tab still has the link: the same id again.
  // The resend carries the lost answer in the hold before it leaves; unwritten, nothing is sent.
  own.lost = true;
  if (!(await rewrite(own, { phase: 'sending', lost: true }, true))) return 'failed';
  patch(m.id, { state: 'sending' });
  const s = await attempt(c, m.id);
  return s.state === 'accepted' ? 'found' : s.state === 'busy' ? 'busy' : 'resent';
}

/** The person's warned Stop tracking: frees the hold (only the version shown, never while a send is out). */
export async function stopTracking(held: HeldLink): Promise<boolean> {
  const handle = attemptFor(held.hold.id, LINK_BY);
  if (!handle || held.hold.inFlight) return false;
  const r = await handle.free('dismissed', { metaVersion: held.hold.metaVersion });
  if (r !== 'freed') return false;
  const id = held.meta?.id;
  if (id) { mem.delete(id); if (entries.get(id) && HOLDING.has(entries.get(id)!.state)) { entries.delete(id); bump(); } }
  return true;
}

/** Ask the computer to stop a running download. The record decides what happened. */
export async function cancel(c: FilesComputer, id: string): Promise<boolean> {
  // A cancel is a change: read live at the press, so nothing is sent once changes are off.
  if (!can('computers.actions.exec')) return false;
  try { await api(cancelRoute as never, { target: targetOf(c), params: { id } }); return true; } catch (e) { return errOf(e).status === 404; }
}

/** Follow a download this tab did not send (Transfers' Cancel): its record now decides its line here (running,
 *  then done / missing / unchecked / failed / cancelled), as for one this tab sent. Memory only, like every entry. */
export function followRunning(c: FilesComputer, rec: LinkRecord): void {
  if (!entries.has(rec.id)) follow(c, { id: rec.id, folder: rec.directory || '/', filename: rec.filename || 'download', at: Date.now() });
}

/** A followed download's record ended: settle its entry. Completed is done only when its folder lists the file. */
const settling = new Set<string>();
export async function settle(c: FilesComputer, rec: LinkRecord): Promise<void> {
  const e = entries.get(rec.id);
  if (!e || e.state !== 'accepted' || rec.status === 'downloading' || settling.has(rec.id)) return;
  if (rec.status === 'failed' || rec.status === 'cancelled') { patch(rec.id, { state: rec.status }); return; }
  refreshFolders(c.id);
  const name = rec.filename || e.filename;
  settling.add(rec.id);
  const listed = await freshListing(c, e.folder).finally(() => settling.delete(rec.id));
  const state: LinkState = savedStateOf(listed, name);
  patch(rec.id, { state, savedAs: name });
}

// ── Reads through core ────────────────────────────────────────────────────────────────────────────────────────
interface P { readonly id: string; readonly project: string; readonly server: string; readonly download?: string }
const where = (p: P) => (p.id && p.project && p.server ? { target: { project: { id: p.project }, container: { id: p.id, server_name: p.server } } } : {});
const source = coreSource('files', {
  reads: {
    linkVersion: { route: versionRoute, input: (p: P) => where(p), select: (raw: unknown) => hasLinkFeature(raw), staleTime: 5 * 60_000 },
    linkOne: {
      route: downloadRoute, input: (p: P) => ({ ...where(p), params: { id: p.download ?? '' } }), staleTime: 0,
      select: (raw: unknown, p: P) => { const r = recordOf(raw); if (!r || r.id !== p.download) throw new Error('NOT_A_RECORD'); return r; },
    },
    linkRunning: { route: downloadsRoute, input: (p: P) => where(p), select: (raw: unknown) => recordsOf(raw), staleTime: 0 },
  },
});
const pOf = (c: FilesComputer | undefined, download?: string): P => ({ id: c?.id ?? '', project: c?.project_id ?? '', server: c?.server_name ?? '', ...(download ? { download } : {}) });
const placed = (c: FilesComputer | undefined) => !!c && !!c.project_id && !!c.server_name;

/** Whether the computer's files program takes the Hub's id: true, false (an older Hoody Kit), undefined while it is
 *  read, 'failed' when the read failed (`error` holds that rejection). */
export function useKitReady(c: FilesComputer | undefined, enabled: boolean): { readonly ready: boolean | 'failed' | undefined; readonly error: unknown; retry(): void } {
  const q = source.useQuery<boolean, P>('linkVersion', pOf(c), { enabled: enabled && placed(c) });
  return { ready: q.isError ? 'failed' : q.data, error: q.error, retry: () => void q.refetch() };
}

/** The records of this tab's followed downloads on a computer, read by id (2 s, 10 s after a minute). */
export function useFollowed(c: FilesComputer | undefined, ids: readonly string[], fast: boolean) {
  return source.useQueries<LinkRecord, P>('linkOne', ids.map((id) => pOf(c, id)), { enabled: placed(c) && ids.length > 0, refetchInterval: fast ? 2_000 : 10_000 });
}

/** The downloads running on a computer now (every caller's), read while `enabled`. */
export function useRunning(c: FilesComputer | undefined, enabled: boolean) {
  return source.useQuery<readonly LinkRecord[], P>('linkRunning', pOf(c), { enabled: enabled && placed(c), refetchInterval: 5_000 });
}

/** Tests only: forget this tab's memory. */
export function resetLinksForTest(): void {
  // A wait left out by the last test never ends: its send belongs to a page that is gone.
  for (const id of waiting.values()) clearTimeout(id);
  waiting.clear();
  mem.clear(); entries.clear(); busyWaits = null; bump();
}
