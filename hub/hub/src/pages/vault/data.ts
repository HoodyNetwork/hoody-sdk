// The vault page's data: its reads and changes, declared once over core (defineQuery, defineMutation, api,
// holdSecret) and the routes in routes.ts. Live in the Hub, core's fixture transport in dev, shots and tests.
// The pure rules are in logic.ts, the envelope in crypto.ts.
//
// Values:
//   - The list and the stats are metadata only. A value is read only when the person asks (readValue), through
//     core's api() with a scrub that copies it out and nulls it in the answer, then held by holdSecret for the
//     context it was read in (wiped on realm switch, sign-out, view change). It never enters the TanStack cache.
//   - Writes go through MutationDef.run(vars) only, never the hook: the hook keeps its variables in TanStack's
//     mutation cache while it runs, and a PUT's variables hold the value. The PUT answer echoes the value, so
//     its scrub nulls it.
//   - Nothing here logs; errors keep only status, code and Retry-After.
//
// C9 (held unless proven):
//   - PUT, DELETE and Clear share one lock ('vault.partition') keyed by the partition: one change per
//     partition at a time, whatever its kind. Each has its own name, so the sender core records survives a
//     reload. What core keeps of a held change is its safe identity (logic.ts HeldIdentity): never a value, a
//     password, an envelope or a digest of one.
//   - No definition declares `reads`, so core never judges a held change with another partition's answer.
//     The page proves a held PUT itself (checkHold): a fresh list of ITS partition showing its write id
//     completes exactly the hold shown. DELETE and Clear are never proved by a read (an empty read can come
//     before a queued delete still runs); only the person's warned Dismiss frees them.
import {
  alive,
  api,
  capture,
  defineMutation,
  defineQuery,
  heldChanges,
  holdSecret,
  newKey,
  onBump,
  outcomeOf,
  useCan,
  useChangesVersion,
  type Ctx,
  type HeldChange,
  type HeldFrom,
  type HeldSecret,
  type HubError,
  type MutationResult,
  type Outcome,
} from '@core';
import { encrypt, isEncrypted, VaultCryptoError, type VaultCryptoErrorKind } from './crypto';
import { heldIdentity, isHoodyKey, metadataWrite, partitionQuery, putProved, rowsOf, type HeldIdentity, type Partition, type VaultRow } from './logic';
import { routes } from './routes';

export const PAGE = 'vault';
export const LOCK = 'vault.partition';

// ── reads ──────────────────────────────────────────────────────────────────────────────

export interface VaultStats {
  readonly totalKeys: number;
  readonly totalBytes: number;
  /** Account-wide (every partition): the quota and how much of it is used. */
  readonly limitMb: number;
  readonly usedPercent: number;
  readonly remainingMb: number;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function statsOf(answer: unknown): VaultStats | null {
  const d = (answer as { data?: unknown } | null)?.data;
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  return { totalKeys: num(o.total_keys), totalBytes: num(o.total_size_bytes), limitMb: num(o.limit_mb), usedPercent: num(o.used_percentage), remainingMb: num(o.remaining_mb) };
}

const listQ = defineQuery<unknown, VaultRow[], Partition>(routes.list, { input: (p) => ({ query: partitionQuery(p) }), select: rowsOf });
const statsQ = defineQuery<unknown, VaultStats | null, Partition>(routes.stats, { input: (p) => ({ query: partitionQuery(p) }), select: statsOf });

export function useVaultList(p: Partition, enabled = true) {
  return listQ.use(p, { enabled });
}

export function useVaultStats(p: Partition, enabled = true) {
  return statsQ.use(p, { enabled });
}

/** The vault opens only in an account session: core refuses /vault under an access key (TOKEN_SESSION_REFUSED). */
export function useIsAccount(): boolean {
  return useCan('account');
}

/** A fresh list of one partition (a network answer from after the call began), or null. */
export async function freshList(p: Partition): Promise<VaultRow[] | null> {
  return (await listQ.readFresh(p))?.data ?? null;
}

export type ListRead = { kind: 'rows'; rows: VaultRow[] } | { kind: 'error'; error: HubError } | { kind: 'stale' };

/**
 * A fresh list of one partition that keeps the failure: the HubError (status, code, request id; never a value: the list
 * carries names and metadata only) for a Details panel. 'stale' when the context ended or the view moved on during the
 * read: the dialog that asked is closed or showing another partition, so its caller drops the answer and shows nothing.
 * Read outside the query cache: the answer is used once and never kept.
 */
export async function readListFresh(p: Partition): Promise<ListRead> {
  const ctx = capture();
  const ended = (): boolean => !alive(ctx) || capture().vgen !== ctx.vgen;
  let answer: unknown;
  try {
    answer = await api(routes.list, { query: partitionQuery(p), ctx });
  } catch (e) {
    return ended() ? { kind: 'stale' } : { kind: 'error', error: e as HubError };
  }
  if (ended()) return { kind: 'stale' };
  try {
    return { kind: 'rows', rows: rowsOf(answer) };
  } catch (e) {
    return { kind: 'error', error: e as HubError };
  }
}

async function refreshAfterChange(): Promise<void> {
  await Promise.all([listQ.invalidate(), statsQ.invalidate()]);
}

// ── errors in plain categories (status first: a base route keeps only listed codes) ─────────────

export type Problem =
  | { kind: 'rate'; retryAfter: number }
  | { kind: 'forbidden' }
  | { kind: 'quota' }
  | { kind: 'gone' }
  | { kind: 'invalid' }
  | { kind: 'token' }
  | { kind: 'network' }
  | { kind: 'server' };

/** What went wrong, from a HubError's status, code and Retry-After only. */
export function problemOf(e: HubError | undefined | null): Problem {
  const status = typeof e?.status === 'number' ? e.status : 0;
  const code = typeof e?.code === 'string' ? e.code : '';
  if (code === 'TOKEN_SESSION_REFUSED') return { kind: 'token' };
  if (status === 429) {
    const s = typeof e?.retryAfter === 'number' && e.retryAfter > 0 ? Math.ceil(e.retryAfter) : 60;
    return { kind: 'rate', retryAfter: Math.min(s, 3600) };
  }
  if (status === 403) return { kind: 'forbidden' };
  if (code === 'VAULT_LIMIT_EXCEEDED') return { kind: 'quota' };
  if (status === 404) return { kind: 'gone' };
  if (status === 400 || status === 422) return { kind: 'invalid' };
  if (status === 0 && e?.kind !== 'pending') return { kind: 'network' };
  return { kind: 'server' };
}

// ── reading one value ──────────────────────────────────────────────────────────────────

export type ReadResult =
  | { ok: true; held: HeldSecret; encrypted: boolean; ctx: Ctx }
  | { ok: false; problem: Problem | { kind: 'empty' } | { kind: 'stale' }; error?: unknown };

const valueOf = (r: unknown): string => {
  const v = (r as { data?: { value?: unknown } } | null)?.data?.value;
  return typeof v === 'string' ? v : '';
};
/** Nulls the value an answer echoes (GET and PUT); the answer is otherwise kept as it came. */
const dropValue = (r: unknown): void => {
  const d = (r as { data?: { value?: unknown } } | null)?.data;
  if (d && typeof d === 'object') d.value = null;
};
/** A read's scrub: copies the value out of the answer and nulls it there (core keeps the answer as scrubbed). */
export const takeValue = (r: unknown): string => {
  const v = valueOf(r);
  dropValue(r);
  return v;
};

/**
 * Reads one entry's value on the person's explicit action. The value is copied out at the response boundary
 * and nulled in the answer, then held for the context the read began in: a realm switch, a sign-out or another
 * view wipes it before anyone sees it. `signal`: the page's attempt; an aborted one is answered as stale (core reads it
 * as a liveness check, so the page still checks its own generation on every answer).
 */
export async function readValue(p: Partition, key: string, signal?: AbortSignal): Promise<ReadResult> {
  const ctx = capture();
  let raw = '';
  // A context that ended, a view that moved on or an abort during the read: whatever came back (an answer or a
  // rejection) belongs to a read nobody is waiting for, so it is stale. holdSecret refuses the first two as well, but
  // answers null for them as for an empty value, which would say "this entry has no value".
  const ended = (): boolean => !alive(ctx) || capture().vgen !== ctx.vgen || signal?.aborted === true;
  try {
    await api(routes.read, {
      params: { key },
      query: partitionQuery(p),
      ctx,
      signal,
      scrub: (r: unknown) => {
        raw = takeValue(r);
      },
    });
  } catch (e) {
    raw = '';
    return ended() ? { ok: false, problem: { kind: 'stale' } } : { ok: false, problem: problemOf(e as HubError), error: e };
  }
  if (ended()) {
    raw = '';
    return { ok: false, problem: { kind: 'stale' } };
  }
  const encrypted = isEncrypted(raw);
  const held = holdSecret(raw, ctx);
  raw = '';
  return held ? { ok: true, held, encrypted, ctx } : { ok: false, problem: { kind: 'empty' } };
}

// ── changes ────────────────────────────────────────────────────────────────────────────

interface PutVars {
  readonly partition: Partition;
  readonly key: string;
  /** What is stored: the plain value or the envelope (never kept by core: the identity leaves it out). */
  readonly value: string;
  readonly metadata: Record<string, unknown>;
  readonly write_id: string;
}
interface DeleteVars {
  readonly partition: Partition;
  readonly key: string;
}
interface ClearVars {
  readonly partition: Partition;
}

const lockKey = (v: { partition: Partition }) => ({ partition: v.partition });

const putM = defineMutation<PutVars>(routes.put, {
  lock: LOCK,
  name: 'vault.put',
  page: PAGE,
  lockKey,
  identity: (v) => ({ partition: v.partition, op: 'put', key: v.key, write_id: v.write_id }),
  input: (v) => ({ params: { key: v.key }, query: partitionQuery(v.partition), body: { value: v.value, metadata: v.metadata }, scrub: dropValue }),
});
const deleteM = defineMutation<DeleteVars>(routes.remove, {
  lock: LOCK,
  name: 'vault.delete',
  page: PAGE,
  lockKey,
  identity: (v) => ({ partition: v.partition, op: 'delete', key: v.key }),
  input: (v) => ({ params: { key: v.key }, query: partitionQuery(v.partition) }),
});
const clearM = defineMutation<ClearVars>(routes.clear, {
  lock: LOCK,
  name: 'vault.clear',
  page: PAGE,
  lockKey,
  identity: (v) => ({ partition: v.partition, op: 'clear' }),
  input: (v) => ({ query: partitionQuery(v.partition) }),
});

/** A change's end as the page shows it. */
export type Change =
  /** `writeId`: a PUT's own write id (savePut), the one proof a read-back accepts (logic.ts putProved). */
  | { outcome: 'done'; writeId?: string }
  /** May have gone through: held until proved or dismissed. `hold` is the send to act on. */
  | { outcome: 'pending'; hold?: string }
  /** Nothing was sent: another change of this partition is held (or being sent). */
  | { outcome: 'held' }
  /** `error`: the rejection behind it, for the band's Details (never shown as text). */
  | { outcome: 'failed'; problem: Problem; error?: unknown }
  | { outcome: 'not_sent'; why: NotSent }
  | { outcome: 'stale' };

export type NotSent =
  | 'unread' // the fresh list (duplicate check, metadata) could not be read
  | 'exists' // New: the name is taken
  | 'reserved' // a hoody.* name: Hoody's own, read-only here
  | 'gone' // Replace: the entry is no longer there
  | 'empty' // the API refuses an empty value
  | 'metadata' // the metadata would pass the API's 256 KB limit
  | 'unwritable' // the entry's kept metadata nests too deeply for this browser to write out (Replace, box off)
  | 'unwritableOwn' // the metadata from the form nests too deeply for this browser to write out
  | 'moved' // the partition or the form changed while it got ready
  | 'busy' // this form is already sending
  | { crypto: VaultCryptoErrorKind };

function changeOf(r: MutationResult<unknown>): Change {
  if (r.outcome === 'done') return { outcome: 'done' };
  const code = r.error?.code;
  // Refused by core's lock: nothing went out from here. READ_BACK_FIRST, BUSY and HELD_BY_OTHER all mean a
  // change of this partition is held or being sent; it shows in the hold list.
  if (code === 'READ_BACK_FIRST' || code === 'BUSY' || code === 'HELD_BY_OTHER') return { outcome: 'held' };
  if (r.outcome === 'pending') return { outcome: 'pending', ...(r.hold ? { hold: r.hold } : {}) };
  if (r.outcome === 'stale') return { outcome: 'stale' };
  if (r.outcome === 'not_sent') return { outcome: 'failed', problem: problemOf(r.error), error: r.error };
  return { outcome: 'failed', problem: problemOf(r.error), error: r.error };
}

/** True while a change of this partition is held (any kind, any sender). */
function partitionHeld(p: Partition): boolean {
  return heldChanges(LOCK).some((h) => heldIdentity(h.identity)?.partition === p);
}

/**
 * The page's own operation epoch: moved by a partition change, a drawer closing and every context bump. A
 * write that began under one epoch sends nothing once it moved (checked after every await before run()).
 */
let epoch = 0;
const epochWatchers = new Set<() => void>();
export const currentEpoch = (): number => epoch;
export const moveEpoch = (): void => {
  epoch++;
  for (const w of [...epochWatchers]) w();
};
onBump(moveEpoch);
/**
 * The report of an import whose dialog was gone when its result came (the person left the page mid-run): the same
 * sentence the page band shows, names of rows that may have gone through and counts only, never a value. One taker,
 * the mounted view: a report goes to it at once, also when it arrives after the view came back; with no view mounted
 * it waits here, each report on its own, and the view takes them when it mounts (cleared on take). It belongs to the run's context: a write from a
 * dead context (a realm switch, an account change, a sign-out since the run began) is refused, every context bump
 * clears a waiting report, and one whose context ended otherwise is dropped at take.
 */
// Each run's report waits on its own (two runs can overlap: one settling after the person came back while another
// was started and closed), so a late report never replaces one not yet shown. Handed over in the order the runs
// settled (the order the reports came), which need not be the order the runs started.
let leftImportReports: { text: string; ctx: Ctx }[] = [];
let leftImportTaker: ((text: string) => void) | null = null;
onBump(() => {
  leftImportReports = [];
});
export function keepLeftImportReport(text: string, ctx: Ctx): void {
  if (!alive(ctx)) return;
  if (leftImportTaker) leftImportTaker(text);
  else leftImportReports.push({ text, ctx });
}
/** The view registers as the taker while mounted: the waiting reports are handed over now, in the order they came,
 *  later ones as they come. Returns the unregister. */
export function takeLeftImportReports(take: (text: string) => void): () => void {
  leftImportTaker = take;
  const waiting = leftImportReports;
  leftImportReports = [];
  for (const r of waiting) if (alive(r.ctx)) take(r.text);
  return () => {
    if (leftImportTaker === take) leftImportTaker = null;
  };
}
/** Tests only: whether a report waits in the module. */
export const leftImportReportHeldForTests = (): boolean => leftImportReports.length > 0;

/** Calls `w` after every epoch move (an import drops its password at once); returns the unsubscribe. */
export function onEpochMove(w: () => void): () => void {
  epochWatchers.add(w);
  return () => {
    epochWatchers.delete(w);
  };
}

export interface PutRequest {
  readonly partition: Partition;
  readonly key: string;
  readonly mode: 'new' | 'replace';
  /** The value as typed. */
  readonly value: string;
  /** Encrypt with this password first (empty: store as typed). */
  readonly password: string;
  /** The person's metadata from the form: an object, null for none; absent keeps the entry's current metadata. */
  readonly metadata?: Readonly<Record<string, unknown>> | null;
  /** The epoch the form was opened under (currentEpoch()). */
  readonly epoch: number;
}

/**
 * New or Replace, sent once. Checks, in order: the partition is not held; a fresh list of the partition (the
 * duplicate check and the metadata to keep; unread → nothing sent); New refuses a taken or hoody.* name,
 * Replace an entry that is gone; then the value is encrypted when a password is given; the epoch is checked
 * again; then one run. The value and the password live only in this call.
 */
export async function savePut(req: PutRequest): Promise<Change> {
  if (!req.value) return { outcome: 'not_sent', why: 'empty' };
  if (isHoodyKey(req.key)) return { outcome: 'not_sent', why: 'reserved' };
  if (partitionHeld(req.partition)) return { outcome: 'held' };
  const ctx = capture();
  const moved = () => req.epoch !== epoch || !alive(ctx);
  const rows = await freshList(req.partition);
  if (moved()) return { outcome: 'not_sent', why: 'moved' };
  if (!rows) return { outcome: 'not_sent', why: 'unread' };
  const existing = rows.find((r) => r.key === req.key);
  if (req.mode === 'new' && existing) return { outcome: 'not_sent', why: 'exists' };
  if (req.mode === 'replace' && !existing) return { outcome: 'not_sent', why: 'gone' };
  let stored: string;
  try {
    stored = req.password ? await encrypt(req.value, req.password) : req.value;
  } catch (e) {
    return { outcome: 'not_sent', why: { crypto: e instanceof VaultCryptoError ? e.kind : 'unavailable' } };
  }
  if (moved()) return { outcome: 'not_sent', why: 'moved' };
  const write_id = newKey();
  const w = metadataWrite(existing?.metadata ?? null, write_id, stored, req.metadata);
  if (!w.ok) return { outcome: 'not_sent', why: w.why === 'size' ? 'metadata' : req.metadata === undefined ? 'unwritable' : 'unwritableOwn' };
  const { metadata } = w;
  const c = changeOf(await putM.run({ partition: req.partition, key: req.key, value: stored, metadata, write_id }));
  if (c.outcome === 'done') await refreshAfterChange();
  return c.outcome === 'done' ? { outcome: 'done', writeId: write_id } : c;
}

// ── import: one savePut per row ─────────────────────────────────────────────────────────

export interface ImportStep {
  readonly key: string;
  readonly mode: 'new' | 'replace';
}

/**
 * How one row of an import ended. `stopped`: no PUT of it ever went out (Stop, a close, a realm switch or an earlier row's
 * end). `refused_busy`: a PUT of it went out and came back 429 (refused, nothing saved), and the run ended during the wait
 * before it was sent again: it was sent, so it is never `stopped`.
 */
export type ImportEnd = Change | { outcome: 'stopped' } | { outcome: 'refused_busy' };

export interface ImportHooks {
  /** The value of step i, read at the moment it is sent (the caller keeps the values; this module keeps none). */
  value: (i: number) => string;
  /** The password every value is encrypted with ('' for none), read at each send. */
  password: () => string;
  /** True once the person stopped the run (checked before every send and every second of a wait). */
  stopped: () => boolean;
  onRow: (i: number, end: ImportEnd) => void;
  /** A 429 on step i: the run waits until `until` (ms), then sends the same row again; null when the wait ends. */
  onWait: (i: number, until: number | null) => void;
  /** Tests: the wait's tick (default 250 ms). */
  tickMs?: number;
}

/** Whether a row's end stops the rest: anything that says the next send would be refused, held or unknown. */
function endsRun(c: Change): boolean {
  if (c.outcome === 'pending' || c.outcome === 'held' || c.outcome === 'stale') return true;
  if (c.outcome === 'not_sent') return c.why === 'moved' || c.why === 'unread' || c.why === 'busy' || typeof c.why === 'object';
  if (c.outcome === 'failed') return c.problem.kind !== 'invalid' && c.problem.kind !== 'gone';
  return false;
}

/**
 * Sends the steps in order, one savePut at a time, under the epoch the run began in. A 429 (nothing applied) waits
 * its Retry-After and sends the same row again. A pending row (it may have gone through: the partition is held now)
 * stops the run at once; so does Stop, a moved epoch and any end that would refuse the next row. Every row not sent
 * is reported `stopped`, never unknown. Returns whether the loop stopped early (true) or went through every row
 * (false), whatever each row's own end: a refused or vanished row does not stop it.
 */
export async function runImport(p: Partition, steps: readonly ImportStep[], epochAtStart: number, h: ImportHooks): Promise<boolean> {
  const tick = h.tickMs ?? 250;
  let i = 0;
  // Row i's last PUT came back 429: if the run ends before row i is answered again, row i ends refused_busy.
  let refused429 = -1;
  const stopRest = (from: number): true => {
    let n = from;
    if (refused429 === n) h.onRow(n++, { outcome: 'refused_busy' });
    for (; n < steps.length; n++) h.onRow(n, { outcome: 'stopped' });
    return true;
  };
  while (i < steps.length) {
    if (h.stopped() || epochAtStart !== epoch) return stopRest(i);
    const s = steps[i]!;
    const c = await savePut({ partition: p, key: s.key, mode: s.mode, value: h.value(i), password: h.password(), epoch: epochAtStart });
    if (c.outcome === 'failed' && c.problem.kind === 'rate') {
      refused429 = i;
      const until = Date.now() + c.problem.retryAfter * 1000;
      h.onWait(i, until);
      while (Date.now() < until && !h.stopped() && epochAtStart === epoch) await new Promise((r) => setTimeout(r, tick));
      h.onWait(i, null);
      continue;
    }
    // Moved while it got ready: this send never went out, so the row reads as never sent, like the rows after it.
    // After an earlier PUT of the row came back 429, an end saying this resend never went out (moved, stale, held or
    // another not_sent but "added meanwhile") is refused_busy: a PUT of it did go out.
    const unsent = c.outcome === 'stale' || c.outcome === 'held' || (c.outcome === 'not_sent' && c.why !== 'exists');
    const moved = c.outcome === 'not_sent' && c.why === 'moved';
    h.onRow(i, refused429 === i && unsent ? { outcome: 'refused_busy' } : moved ? { outcome: 'stopped' } : c);
    refused429 = -1;
    i++;
    // An end that stops the run stops it only when rows remain: on the last row the pass went through every row. A Stop
    // (or a realm or partition move) while the last row got ready is still a stop: that row never went out.
    if (moved || (endsRun(c) && i < steps.length)) return stopRest(i);
  }
  return false;
}

/** Deletes one entry (the view asked its confirm, and the extra one for hoody.*). */
export async function deleteEntry(p: Partition, key: string): Promise<Change> {
  if (partitionHeld(p)) return { outcome: 'held' };
  const c = changeOf(await deleteM.run({ partition: p, key }));
  if (c.outcome === 'done') await refreshAfterChange();
  return c;
}

/** Deletes every entry of one partition (the view asked the typed confirm naming it). */
export async function clearPartition(p: Partition): Promise<Change> {
  if (partitionHeld(p)) return { outcome: 'held' };
  const c = changeOf(await clearM.run({ partition: p }));
  if (c.outcome === 'done') await refreshAfterChange();
  return c;
}

export type ReadBackResult = { kind: 'ok'; confirmed: ReadonlySet<string> } | { kind: 'error'; error: HubError } | { kind: 'stale' };

/**
 * An import's read-back: one fresh list of the partition, and the names whose entry carries the write id this
 * import sent (putProved). A failed read keeps its error and calls nothing confirmed.
 */
export async function importReadBack(p: Partition, written: readonly { key: string; writeId: string }[]): Promise<ReadBackResult> {
  const got = await readListFresh(p);
  if (got.kind !== 'rows') return got;
  const rows = got.rows;
  return { kind: 'ok', confirmed: new Set(written.filter((w) => putProved({ partition: p, op: 'put', key: w.key, write_id: w.writeId }, rows)).map((w) => w.key)) };
}

// ── held changes: shown, checked, dismissed ───────────────────────────────────────────────

export interface VaultHold {
  readonly change: HeldChange;
  readonly id: HeldIdentity;
  /** This page's own (one of the three definitions here sent it, or nobody recorded a sender). */
  readonly own: boolean;
  readonly from: HeldFrom | null;
}

type AnyDef = typeof putM | typeof deleteM | typeof clearM;
const DEFS = { put: putM, delete: deleteM, clear: clearM } as const;

/** The definition that sent a held change; for one that records no sender, the one of its kind (Dismiss only). */
function defOf(h: HeldChange, id: HeldIdentity): { def: AnyDef; own: boolean } {
  for (const d of [putM, deleteM, clearM] as AnyDef[]) if (d.heldBy(h) === 'self') return { def: d, own: true };
  const nobody = h.by === undefined;
  return { def: DEFS[id.op], own: nobody };
}

/** Variables that name a held change's lock without its value (the lock is the partition alone). */
function safeVars(id: HeldIdentity): PutVars & DeleteVars & ClearVars {
  return { partition: id.partition, key: id.op === 'clear' ? '' : id.key, value: '', metadata: {}, write_id: id.op === 'put' ? id.write_id : '' };
}

/** Every held vault change (any partition), oldest first. Re-renders on every change of core's holds. */
export function useVaultHolds(): VaultHold[] {
  useChangesVersion();
  const out: VaultHold[] = [];
  for (const h of heldChanges(LOCK)) {
    const id = heldIdentity(h.identity);
    if (!id) continue;
    out.push({ change: h, id, own: defOf(h, id).own, from: h.from });
  }
  return out;
}

export type CheckResult = 'applied' | 'unproven' | 'unread' | 'not_own' | 'moved';

/**
 * Check again, for a held PUT: a fresh list of its partition; its write id on the entry completes exactly the
 * hold shown. Anything else proves nothing and it stays held. DELETE and Clear: 'unproven' without a read.
 */
export async function checkHold(hold: VaultHold): Promise<CheckResult> {
  const { id, change } = hold;
  const { def, own } = defOf(change, id);
  if (!own || def !== putM || !change.hold) return own ? 'unproven' : 'not_own';
  const ctx = capture();
  const rows = await freshList(id.partition);
  if (!alive(ctx)) return 'moved';
  if (!rows) return 'unread';
  if (!putProved(id, rows)) return 'unproven';
  const freed = await putM.complete(safeVars(id), change.hold);
  if (freed) await refreshAfterChange();
  return freed ? 'applied' : 'moved';
}

/** The person's warned Dismiss ("it may have gone through"): frees exactly the hold shown. */
export async function dismissHold(hold: VaultHold): Promise<boolean> {
  const { id, change } = hold;
  const { def, own } = defOf(change, id);
  if (!own || !change.hold) return false;
  const freed = await def.dismiss(safeVars(id), change.hold);
  if (freed) await refreshAfterChange();
  return freed;
}

/** For tests: the definitions (never used by the view). */
export const defsForTests = { putM, deleteM, clearM, listQ, statsQ, takeValue, dropValue };
export type { Outcome };
export { outcomeOf };
