// The Logs page's controller: one object per computer shown, no React. It owns the query (the
// scheduler, the history window, Live, the side sources, the program output, Export) and publishes
// immutable snapshots the view reads with useSyncExternalStore. Its rules:
//   - Every answer checks a ticket first: a dead controller (dispose) or a newer query drops it unseen.
//   - Rows reach a snapshot only through rules.norm (scrubbed whole, then cut).
//   - A new query aborts the old one: its rows, groups, marks and Live go.
//   - Reads go through LogsApi only (declared routes); the Hub never asks the person to loosen a
//     computer's access rules.
//   - C9: an export or an Explain request that was sent is never resent; Live never reconnects blindly.
import { formatNumber } from '@kit/pure';
import type { LogsApi } from './api';
import * as X from './export';
import * as L from './live';
import * as R from './rules';
import { HubLogsScrub as S } from './scrub';
import {
  DEFAULT_VIEW, isData, isKit, normalizeView, sameView, entryFor, errOf, servedOnlyOf, servedRoute,
  type DataItem, type ErrState, type ItemKind, type ListItem, type StatsView, type Tx, type ViewState,
} from './logic';

const PAGE = 200;
const MAX_SIDE = 2000;
const SNAP_LINES = 2000;
const FRESH_MS = 1200;
const HELD_MAX = 500;
const SAVED_MAX = 10;

export interface Computer {
  id: string;
  projectId: string;
  name: string;
  running: boolean;
  /** The computer's colour as the shell reads it (ComputerMark normalises it; anything else draws no mark). */
  color?: string;
}

/** The record kept for this account and computer (hub_logs_v1): enumerated fields only. */
export interface Prefs {
  saved?: R.Storable[];
  /** The problem strip is collapsed. */
  strip?: 'closed';
}
/** `write` answers whether the browser kept it (a refused write is false). */
export interface PrefStore { read(): Prefs; write(p: Prefs): boolean }

export interface ProgramEntry { id: string; name: string; range: { start: number; end: number } | null; /** A Hoody system program (the daemon's hoody_kit). */ system?: boolean }
export type SnapState = { busy: true } | { big: true } | { text: string; at: number } | null;
export interface ProgramsState { list: ProgramEntry[]; current: ProgramEntry | null; snap: SnapState }

export type OutState = { busy: true } | { err: 'failed' | 'needs_update' | 'gone' } | { out: R.ExecOutput };

export interface TextLine { key: string; vars?: Record<string, string | number> }
export type ExportState =
  | { status: 'idle' }
  | { status: 'working'; rows: number }
  | { status: 'done'; lines: TextLine[]; saved: boolean }
  | { status: 'error'; key: string };

export interface Snapshot {
  v: ViewState;
  items: ListItem[];
  loading: boolean;
  err: ErrState | null;
  /** A one-off note (a string key), e.g. the hand-off could not be reopened. */
  note: string | null;
  stats: StatsView | null;
  groups: R.Groups | null;
  spike: { ms: number; count: number } | null;
  tooBig: boolean;
  chgFailed: boolean;
  skippedChanges: boolean;
  liveOn: boolean;
  liveNote: 'paused' | 'idle' | 'hidden' | 'private' | null;
  held: boolean;
  asOf: number | null;
  /** Live rows waiting behind "Jump to newest". */
  newCount: number;
  moreOlder: boolean;
  moreNewer: boolean;
  olderBusy: boolean;
  /** Rows shown (not dividers) and whether more exist. */
  rows: number;
  moreRows: boolean;
  programs: ProgramsState | null;
  outs: Readonly<Record<string, OutState>>;
  exporting: ExportState;
  /** Counts up on "Jump to newest": the list scrolls to the top. */
  jump: number;
  saved: R.Storable[];
  stripClosed: boolean;
  running: boolean;
}

export interface Deps {
  api: LogsApi;
  computer: Computer;
  initial?: ViewState;
  prefs: PrefStore;
  t: Tx;
  clock?: R.Clock;
  now?: () => number;
  visible?: () => boolean;
  online?: () => boolean;
  /** The page was opened from a file (data.web fileOriginPage); absent = never. */
  fileOrigin?: () => boolean;
}

export interface Logs {
  get(): Snapshot;
  subscribe(fn: () => void): () => void;
  /** The view from the URL; a changed one starts a new query at once. */
  setView(v: ViewState): void;
  refresh(): void;
  around(ms: number): void;
  older(): void;
  newer(): void;
  startLive(): void;
  stopLive(why?: Snapshot['liveNote']): void;
  toggleLive(): void;
  /** The list is scrolled or a row is open: new Live rows wait behind the pill. */
  setReading(reading: boolean): void;
  jumpToNewest(): void;
  /** Reads a run's recent output when its row opens. */
  loadOutput(it: DataItem): void;
  setStrip(closed: boolean): void;
  /** 'name' when the name is empty, 'kept' when the browser refused the write (nothing saved). */
  saveView(name: string): true | 'name' | 'kept';
  clearViews(): boolean;
  startExport(o: { format: X.Format; all: boolean; ips: boolean }): void;
  cancelExport(): void;
  resetExport(): void;
  /** What Explain reads for the given rows (newest first), as export entries. */
  explainEntries(items: DataItem[]): X.Entry[];
  readonly api: LogsApi;
  readonly computer: Computer;
  dispose(): void;
}

interface Mark { k: string; at: number; div: 'gap' | 'reset' | 'overflow' }

export function createLogs(d: Deps): Logs {
  const { api, computer } = d;
  const clock = d.clock || R.defaultClock();
  const now = d.now || (() => Date.now());
  const SCHED = R.createScheduler({ clock });
  const cid = computer.id;
  const fns = new Set<() => void>();
  const timers: unknown[] = [];
  let dead = false;
  let q = 0;
  let qac: AbortController | null = null;
  let seq = 0;
  let loaded = false;

  // ── the state of the current query ─────────────────────────────────────────────────
  let v: ViewState = normalizeView(d.initial || DEFAULT_VIEW);
  let P: R.Predicate | null = null;
  let win: R.LogWindow | null = null;
  let side: DataItem[] = [];
  let sideMore = false;
  /** Runs of this query were left out at the list's cap: the list, and an export of it, are not the whole range. Reset with the query. */
  let sideCut = false;
  let sidePage = 0;
  let more: string | number | null = null;
  let marks: Mark[] = [];
  let stats: StatsView | null = null;
  let groups: R.Groups | null = null;
  let spikeAt: { ms: number; count: number } | null = null;
  let err: ErrState | null = null;
  let note: string | null = null;
  let loading = false;
  let tooBig = false;
  let chgFailed = false;
  let parts: R.Parts | null = null;
  let olderBusy = false;
  let progs: ProgramEntry[] | null = null;
  let programs: ProgramsState | null = null;
  let wantProg: string | null = null;
  let outs: Record<string, OutState> = {};
  let exporting: ExportState = { status: 'idle' };
  let exportAc: AbortController | null = null;
  let jump = 0;
  // Live
  let live: L.Live | null = null;
  let liveOn = false;
  let liveNote: Snapshot['liveNote'] = null;
  let held = false;
  let asOf: number | null = null;
  let reading = false;
  let buffered: R.Row[] = [];
  const fresh = new Map<string, number>();
  let freshTimer: unknown = null;
  let snap: Snapshot | null = null;
  let itemsMemo: { key: unknown; items: ListItem[] } | null = null;
  const tokens = new WeakMap<R.Row, string>();

  const running = computer.running;
  const prefs = (): Prefs => { try { return d.prefs.read() || {}; } catch { return {}; } };
  // A record from before URL-only views may still hold a last view: it is never read, and the controller's next write drops it.
  const savePrefs = (p: Prefs): boolean => { delete (p as Prefs & { last?: unknown }).last; try { return d.prefs.write(p); } catch { return false; } };

  const alive = (t?: number): boolean => !dead && (t === undefined || t === q);
  function emit(): void {
    if (dead) return;
    snap = null;
    for (const f of [...fns]) f();
  }
  function later(ms: number, f: () => void): unknown {
    const id = clock.setTimeout(() => { const i = timers.indexOf(id); if (i >= 0) timers.splice(i, 1); if (alive()) f(); }, ms);
    timers.push(id);
    return id;
  }

  // ── reads ──────────────────────────────────────────────────────────────────────────
  function kget(kit: 'logs' | 'exec' | 'daemon', prio: R.Prio, path: string | null, sig?: AbortSignal): Promise<unknown> {
    if (path === null) return Promise.reject({ code: 'failed', notSent: true });
    return SCHED.run(cid + '|' + kit, prio, (sg) => api.kit(kit, path, { signal: sg }), { signal: sig });
  }
  const aget = (scope: 'realm' | 'base', path: string | null, sig?: AbortSignal): Promise<unknown> => (path === null ? Promise.reject({ code: 'failed', notSent: true }) : api.side(scope, path, { signal: sig }));

  // ── a new query ────────────────────────────────────────────────────────────────────
  function stopLiveQuiet(): void {
    if (live) { live.stop(); live = null; }
    liveOn = false;
    held = false;
    buffered = [];
  }

  function run(): void {
    if (dead) return;
    stopLiveQuiet();
    liveNote = null;
    if (qac) qac.abort();
    qac = new AbortController();
    const my = ++q;
    const sig = qac.signal;
    const view = v;
    win = R.createWindow();
    side = []; sideMore = false; sideCut = false; sidePage = 0; more = null; marks = []; outs = {};
    stats = null; groups = null; spikeAt = null; err = null; parts = null; loading = true; tooBig = false; chgFailed = false; olderBusy = false; asOf = null;
    programs = view.source === 'programs' ? programs : null;
    P = null;
    const pr = view.source === 'programs' ? { ok: true as const, P: null } : R.predicate({ source: view.source, severity: view.severity, window: view.window, search: view.search }, now());
    if (!pr.ok) { loading = false; err = { code: pr.code === 'search_too_long' ? 'tooLong' : 'failed' }; emit(); return; }
    P = pr.P;
    emit();
    if (d.online && d.online() === false) { loading = false; err = { code: 'offline' }; emit(); return; }
    const needs = isKit(view.source) || view.source === 'programs' || view.source === 'scripts' || view.source === 'helper';
    if (needs && !running) { loading = false; err = { code: 'stopped' }; emit(); return; }
    const job = isKit(view.source) ? loadKit(my, sig) : view.source === 'changes' ? loadSide(my, 'changes') : view.source === 'account' ? loadSide(my, 'account')
      : view.source === 'programs' ? loadPrograms(my, sig) : view.source === 'scripts' ? loadScripts(my, sig) : loadHelper(my, sig);
    // A kit source's job rejects only from its logs-service list read (loadKit keeps a failed Changes read as chgFailed).
    job.then(() => { if (alive(my)) { loading = false; emit(); } }, (e) => fail(my, e, isKit(view.source)));
  }

  /** `logsRead`: the failed read was the computer's logs service's (only that can be the served-Hub hand-off). */
  function fail(my: number, e: unknown, logsRead = false): void {
    if (!alive(my)) return;
    const c = errOf(e, running);
    if (!c) return;
    loading = false;
    err = logsRead ? servedOnlyOf(c, v.source, !!d.fileOrigin && d.fileOrigin(), servedRoute(v, computer)) : c;
    emit();
  }

  function loadKit(my: number, sig: AbortSignal): Promise<unknown> {
    const p = P as R.Predicate;
    parts = R.parts(p);
    const list = R.readPage((l) => kget('logs', 'list', R.kitPath(p, null, l), sig), PAGE).then((r) => {
      if (!alive(my)) return;
      if (r.skipped) { tooBig = true; return; }
      const reply = r.reply as R.KitReply;
      (win as R.LogWindow).reset(reply.entries, { limit: r.limit, ...(typeof reply.total === 'number' ? { total: reply.total } : {}) });
      emit();
    });
    chgFailed = false;
    const chg = parts.parts.includes('changes') ? loadSide(my, 'changes').then(undefined, (e) => {
      const c = R.problem(e);
      if (alive(my) && c.code !== 'aborted' && c.code !== 'stale') { chgFailed = true; emit(); }
    }) : Promise.resolve();
    kget('logs', 'stats', R.statsPath(p, now()), sig).then((r) => readStats(my, r as Record<string, unknown>, sig), () => { /* the list says what failed */ });
    return Promise.all([list, chg]);
  }

  function readStats(my: number, r: Record<string, unknown>, sig: AbortSignal): void {
    if (!alive(my)) return;
    const f = r && Array.isArray(r.features) ? (r.features as string[]) : [];
    if (['filters2', 'beforeId', 'buckets', 'retention'].some((x) => !f.includes(x))) { err = { code: 'update' }; loading = false; emit(); return; }
    const lv = v.source === 'bots' || v.source === 'decisions';
    const c = ((lv ? r.byLevel : r.byStatusClass) || {}) as Record<string, number>;
    const failed = (lv ? c.error : c['5xx']) || 0;
    stats = { total: Number(r.total) || 0, failed, problems: failed + ((lv ? c.warn : c['4xx']) || 0), retention: r.retention };
    const ser = R.series(r, P as R.Predicate);
    const sp = R.spike(ser.map((b) => b.problems));
    const at = sp ? ser[sp.index] : undefined;
    spikeAt = sp && at && typeof at.startMs === 'number' ? { ms: at.startMs, count: sp.count } : null;
    emit();
    if (!stats.problems || v.severity !== 'all') return;
    const g = R.predicate({ source: v.source, severity: 'problems', window: v.window, search: v.search }, now());
    if (!g.ok) return;
    R.readPage((l) => kget('logs', 'stats', R.kitPath(g.P, null, l), sig), 1000).then((rp) => {
      if (!alive(my) || rp.skipped) return;
      groups = R.groups(rp.reply as R.KitReply, g.P);
      emit();
    }, () => { /* groups are a bonus */ });
  }

  // Changes (realm host, offset pages) and account activity (base host, pages), newest first.
  function loadSide(my: number, kind: 'changes' | 'account'): Promise<void> {
    const p = P as R.Predicate;
    const page = sidePage;
    const path = kind === 'changes' ? R.changesPath(p, cid, { limit: PAGE, offset: page * PAGE }) : R.accountPath(p, { page: page + 1, limit: 100 });
    return aget(kind === 'changes' ? 'realm' : 'base', path, qac ? qac.signal : undefined).then((r) => {
      if (!alive(my)) return;
      const w = r as { data?: unknown } | null;
      const dd = (w && w.data !== undefined ? w.data : r) as unknown;
      const rows: R.Row[] = Array.isArray(dd) ? dd : dd && Array.isArray((dd as { events?: R.Row[] }).events) ? (dd as { events: R.Row[] }).events
        : dd && Array.isArray((dd as { activities?: R.Row[] }).activities) ? (dd as { activities: R.Row[] }).activities : [];
      const seen = new Set<unknown>(side.map((x) => x.id));
      for (const raw of rows) {
        if (!raw || raw.id == null || seen.has(raw.id) || side.length >= MAX_SIDE) continue;
        seen.add(raw.id);
        const x = R.norm(raw);
        const t = Date.parse(String(x.created_at));
        if (t === t) side.push({ k: (kind === 'changes' ? 'c' : 'a') + String(raw.id), kind, row: x, t, id: raw.id as string | number });
      }
      sideMore = rows.length >= (kind === 'changes' ? PAGE : 100) && side.length < MAX_SIDE;
      sidePage = page + 1;
      emit();
    });
  }

  function older(): void {
    if (!alive() || olderBusy) return;
    const my = q, src = v.source, sig = (qac as AbortController).signal, jobs: Promise<unknown>[] = [];
    // Each job rejects with its read's error and whether that read was the logs service's: the first failure decides.
    const from = (logsRead: boolean) => (e: unknown): Promise<never> => Promise.reject({ e, logsRead });
    olderBusy = true;
    emit();
    if (isKit(src) && win && win.state().moreOlder) {
      const anchor = win.beforeId();
      jobs.push(R.readPage((l) => kget('logs', 'older', R.kitPath(P as R.Predicate, { beforeId: anchor as number }, l), sig), PAGE).then((r) => {
        if (!alive(my)) return;
        if (r.skipped) { tooBig = true; return; }
        (win as R.LogWindow).older((r.reply as R.KitReply).entries, { limit: r.limit, anchor });
      }).then(undefined, from(true)));
    }
    if (sideMore) jobs.push((src === 'scripts' ? loadScripts(my, sig) : src === 'helper' ? loadHelper(my, sig) : loadSide(my, src === 'account' ? 'account' : 'changes')).then(undefined, from(false)));
    Promise.all(jobs).then(() => { if (alive(my)) { olderBusy = false; emit(); } }, (x: { e: unknown; logsRead: boolean }) => { if (alive(my)) { olderBusy = false; fail(my, x.e, x.logsRead); } });
  }

  function newer(): void {
    if (!alive() || !win) return;
    const my = q, a = win.afterId();
    R.readPage((l) => kget('logs', 'list', R.kitPath(P as R.Predicate, { afterId: a as number }, l), (qac as AbortController).signal), PAGE).then((r) => {
      if (!alive(my) || r.skipped) return;
      (win as R.LogWindow).newer((r.reply as R.KitReply).entries, { limit: r.limit, anchor: a });
      emit();
    }, (e) => fail(my, e, true));
  }

  // ── programs, scripts, the AI helper ───────────────────────────────────────────────
  function loadPrograms(my: number, sig: AbortSignal): Promise<void> {
    const list = progs ? Promise.resolve(progs) : kget('daemon', 'list', '/api/v1/daemon/programs', sig).then((r) => {
      const rr = r as { programs?: unknown } | null;
      return (progs = (rr && Array.isArray(rr.programs) ? (rr.programs as Record<string, unknown>[]) : []).filter((x) => x && (typeof x.id === 'number' || typeof x.id === 'string') && R.plain(String(x.id))).map((x) => {
        const pr = x.port_range as { start?: unknown; end?: unknown } | undefined;
        return { id: String(x.id), name: R.norm({ n: String(x.name || x.id) }).n.slice(0, 80), range: pr && typeof pr.start === 'number' && typeof pr.end === 'number' ? { start: pr.start, end: pr.end } : null, system: x.hoody_kit === true };
      }));
    });
    return list.then((l) => {
      if (!alive(my)) return;
      if (!l.length) { err = { code: 'noPrograms' }; return; }
      // The exact ID wins. A name is a fallback only for a choice kept from before, never for a hand-off.
      const want = v.program;
      const cur = l.find((x) => x.id === want) || (wantProg === null ? l.find((x) => x.name === want) : null) || (l[0] as ProgramEntry);
      if (wantProg !== null) { if (cur.id !== wantProg) note = 'prog.gone'; wantProg = null; }
      v = { ...v, program: cur.id };
      if (cur.range && !(v.port !== null && v.port >= cur.range.start && v.port <= cur.range.end)) v = { ...v, port: cur.range.start };
      if (!cur.range) v = { ...v, port: null };
      programs = { list: l, current: cur, snap: null };
      return snapshotOf(my, sig, cur, SNAP_LINES);
    });
  }

  function snapshotOf(my: number, sig: AbortSignal, cur: ProgramEntry, lines: number): Promise<void> {
    programs = { list: programs ? programs.list : progs || [], current: cur, snap: { busy: true } };
    emit();
    return kget('daemon', 'list', R.programPath({ id: cur.id, channel: v.chan, lines, port: v.port }), sig).then((r) => {
      if (!alive(my)) return;
      const text = S.stripSnapshot(String((r as { logs?: unknown } | null)?.logs || ''));
      programs = { list: (programs as ProgramsState).list, current: cur, snap: { text, at: now() } };
      emit();
    }, (e) => {
      if (!alive(my) || R.problem(e).code !== 'too_large') throw e;
      if (lines > 500) return snapshotOf(my, sig, cur, Math.floor(lines / 4));
      programs = { list: (programs as ProgramsState).list, current: cur, snap: { big: true } };
      emit();
    });
  }

  function loadScripts(my: number, sig: AbortSignal): Promise<void> {
    if (!v.script) { err = { code: 'scriptPick' }; return Promise.resolve(); }
    const path = R.scriptsPath(P as R.Predicate, { script: v.script, limit: 100, before: more === null ? null : String(more) });
    return kget('exec', 'list', path, sig).then((r) => {
      if (!alive(my)) return;
      const w = r as { data?: { executions?: unknown; next?: unknown } } | { executions?: unknown; next?: unknown } | null;
      const dd = ((w && 'data' in w && w.data ? w.data : w) || {}) as { executions?: unknown; next?: unknown };
      const rows = Array.isArray(dd.executions) ? (dd.executions as R.Row[]) : [];
      for (const raw of rows) {
        if (!raw || typeof raw.executionId !== 'string') continue;
        const x = R.norm(raw);
        const t = Date.parse(String(x.receivedAt));
        if (t !== t) continue;
        // A run the list has no room for is remembered as left out: the paging goes on, and nothing may call the list complete.
        if (side.length >= MAX_SIDE) { sideCut = true; continue; }
        side.push({ k: 'x' + raw.executionId, kind: 'script', row: x, t, id: raw.executionId });
      }
      more = typeof dd.next === 'string' && dd.next ? dd.next : null;
      sideMore = more !== null;
      emit();
    }, (e) => {
      const c = R.problem(e);
      if (c.code === 'failed' && (c.status === 404 || c.status === 405)) { err = { code: 'scriptUpdate' }; return; }
      throw e;
    });
  }

  /** The agent's own log (the AI helper), already scrubbed by the agent, newest first by seq. */
  function loadHelper(my: number, sig: AbortSignal): Promise<void> {
    const path = R.helperPath(P as R.Predicate, { before_seq: typeof more === 'number' ? more : null, limit: PAGE });
    if (!path) return Promise.reject({ code: 'failed' });
    return api.helper(path, { signal: sig }).then((r) => {
      if (!alive(my)) return;
      const rr = r as { entries?: unknown } | null;
      for (const raw of rr && Array.isArray(rr.entries) ? (rr.entries as R.Row[]) : []) {
        if (!raw || typeof raw.seq !== 'number' || side.length >= MAX_SIDE) continue;
        const x = R.norm(raw);
        const t = Date.parse(String(x.time || x.ts));
        if (t === t) side.push({ k: 'h' + raw.seq, kind: 'helper', row: x, t, id: raw.seq });
      }
      more = R.helperNext(rr, PAGE);
      sideMore = more !== null;
      emit();
    });
  }

  /** One run's recent output, read when its row opens: scrubbed by rules.execOutput and always labelled "may be incomplete". */
  function loadOutput(it: DataItem): void {
    if (!alive() || it.kind !== 'script' || typeof it.id !== 'string') return;
    const cur = outs[it.k];
    if (cur && ('busy' in cur || 'out' in cur)) return;
    const my = q;
    const body = R.execReadBody({ executionId: it.id });
    if (!body) { outs = { ...outs, [it.k]: { err: 'gone' } }; emit(); return; }
    outs = { ...outs, [it.k]: { busy: true } };
    emit();
    api.execRead(body, { signal: (qac as AbortController).signal }).then((r) => {
      const out = R.execOutput(r as { lines?: unknown; totalLines?: unknown });
      outs = { ...outs, [it.k]: out ? { out } : { err: 'failed' } };
    }, (e) => {
      const c = R.problem(e);
      if (c.code === 'aborted' || c.code === 'stale') return;
      outs = { ...outs, [it.k]: { err: (e as { status?: number })?.status === 404 || (e as { status?: number })?.status === 405 ? 'needs_update' : 'failed' } };
    }).then(() => { if (alive(my)) emit(); });
  }

  // ── Live ───────────────────────────────────────────────────────────────────────────
  function flushRows(rows: R.Row[]): void {
    const w = win as R.LogWindow;
    const r = w.live(rows);
    held = !!r.held;
    const at = now();
    if (!r.held) for (const row of rows) { const k = keyOf(row); fresh.set(k, at); }
    if (fresh.size && freshTimer === null) freshTimer = later(FRESH_MS + 50, () => { freshTimer = null; const cut = now() - FRESH_MS; for (const [k, t] of fresh) if (t <= cut) fresh.delete(k); itemsMemo = null; emit(); });
    itemsMemo = null;
  }
  function onLiveRows(rows: R.Row[]): void {
    if (!alive() || !win) return;
    if (reading) buffered = buffered.concat(rows).slice(-HELD_MAX);
    else flushRows(rows);
    emit();
  }

  function startLive(): void {
    if (!alive() || !isKit(v.source) || !win || liveOn || !P) return;
    const my = q;
    liveOn = true; liveNote = null; asOf = null;
    emit();
    const ev = (n: L.LiveEvent): void => {
      if (!alive(my)) return;
      if (n === 'gap' || n === 'reset' || n === 'overflow') marks.push({ k: 'd' + ++seq, at: live ? live.dbId : (win as R.LogWindow).afterId() || 0, div: n === 'gap' ? 'gap' : n });
      if (n === 'paused' || n === 'idle' || n === 'private' || n === 'hidden') stopLive(n);
      if (n === 'private') asOf = now();
      itemsMemo = null;
      emit();
    };
    live = L.createLive({
      P, dbId: win.afterId() || 0,
      get: (path) => kget('logs', 'list', path, (qac as AbortController).signal) as Promise<{ entries?: unknown }>,
      stream: L.hubStream(api.stream),
      rows: onLiveRows,
      event: ev,
      lost: () => !alive(my),
      visible: () => (d.visible ? d.visible() : true),
      clock,
    });
    void live.start();
  }
  function stopLive(why?: Snapshot['liveNote']): void {
    const was = liveOn;
    if (live) { live.stop(); live = null; }
    liveOn = false;
    held = false;
    liveNote = was ? why ?? null : null;
    emit();
  }

  // ── export ────────────────────────────────────────────────────────────────────
  const STOPS: Record<string, string> = { cap: 'cut', too_large: 'tooLarge', quota: 'quota', failed: 'failed', cancelled: 'cancelled', needs_update: 'update' };
  function doneLine(r: R.DoneLine): TextLine {
    if (r.line === 'not_kept') {
      const h = r.hours ?? 0, days = Math.round(h / 24);
      return { key: 'done.notKept', vars: { span: h >= 48 ? d.t('days', { count: days, n: String(days) }) : d.t('hours', { count: h, n: String(h) }) } };
    }
    if (r.line === 'incomplete') return { key: 'done.stopped', vars: { why: d.t('stop.' + (STOPS[r.stop] || 'failed')) } };
    return { key: 'done.' + ({ complete: 'complete', removed: 'removed', pruned: 'pruned' } as Record<string, string>)[r.line] };
  }

  function startExport(o: { format: X.Format; all: boolean; ips: boolean }): void {
    if (!alive() || exporting.status === 'working') return;
    const my = q;
    if (exportAc) exportAc.abort();
    const myAc = exportAc = new AbortController();
    exporting = { status: 'working', rows: 0 };
    emit();
    const lost = (): boolean => !alive(my) || myAc.signal.aborted;
    exportRun(o, myAc.signal, my, lost).then((res) => {
      if (exportAc !== myAc) return;
      exportAc = null;
      exporting = res ? { status: 'done', lines: res, saved: true } : { status: 'idle' };
      emit();
    }, (e: unknown) => {
      if (exportAc !== myAc) return;
      exportAc = null;
      const code = (e as { code?: string } | null)?.code;
      exporting = { status: 'error', key: code === 'unfinished' ? 'lbl.export_unfinished' : code === 'too_large' ? 'ex.tooBig' : 'ex.failed' };
      emit();
    });
  }

  async function exportRun(o: { format: X.Format; all: boolean; ips: boolean }, signal: AbortSignal, my: number, lost: () => boolean): Promise<TextLine[] | null> {
    const src = v.source, at = now(), w = X.createWriter(o.format);
    const progress = (): void => { if (alive(my) && exporting.status === 'working') { exporting = { status: 'working', rows: w.rows }; emit(); } };
    const entry = (it: DataItem): X.Entry => entryFor(it, { ips: o.ips, scriptPath: v.script, t: d.t });
    const sink = (kind: ItemKind) => (rows: R.Row[]): boolean => {
      const ok = rows.every((r) => w.add(entry({ kind, k: '', row: r, t: 0 })));
      progress();
      return ok;
    };
    function keep(p: { parts: unknown[]; rows: number }, name: string, lines: TextLine[]): TextLine[] | null {
      if (lost()) return null;
      const r = api.save(name, p.parts, { maxBytes: X.LIMITS.bytes + 4096 });
      if ('refused' in r) throw { code: r.refused };
      return lines.concat({ key: 'ex.saved', vars: { name: r.name, count: p.rows, n: formatNumber(p.rows) } });
    }
    if (src === 'programs') {
      const cur = programs && programs.current;
      if (!cur) throw { code: 'failed' };
      try {
        const r = await kget('daemon', 'export', R.programPath({ id: cur.id, channel: v.chan, lines: R.LIMITS.programLines, port: v.port }), signal);
        const sum = X.programExport(String((r as { logs?: unknown } | null)?.logs || ''), { format: o.format, program: cur.name, port: v.port, channel: v.chan, nowMs: at });
        return keep(sum, sum.filename, [{ key: 'done.program' }]);
      } catch (e) {
        // Nothing was saved: the dialog says the export failed, never "done".
        if (R.problem(e).code === 'too_large') throw { code: 'too_large' };
        throw e;
      }
    }
    if (src === 'helper') {
      const r = await X.helperExport(P as R.Predicate, { format: o.format, download: api.download, signal, alive: () => !lost(), nowMs: at });
      return keep({ parts: r.parts, rows: r.rows }, r.name, [{ key: r.partial || r.gap ? 'done.partial' : 'done.complete' }]);
    }
    if (src === 'scripts') {
      // Written oldest first: a file that fills must lose the OLDEST runs, never the newest. Count how many fit, newest first.
      const probe = X.createWriter(o.format);
      let fit = 0;
      while (fit < side.length && probe.add(entry(side[fit] as DataItem))) fit++;
      side.slice(0, fit).reverse().every((x) => w.add(entry(x)));
      const part = fit < side.length || w.full || sideMore || sideCut;
      // Runs left out at the list's cap cannot be loaded by showing older rows: say so, never "everything".
      const line: TextLine = sideCut ? { key: 'done.capped', vars: { n: formatNumber(MAX_SIDE) } } : { key: part ? 'done.loaded' : 'done.complete' };
      return keep(w.finish({ partial: part }), X.filename(src, o.format, at), [line]);
    }
    const EP = o.all ? (R.predicate({ source: 'everything', window: v.window }, at) as { P: R.Predicate }).P : (P as R.Predicate);
    const pp = R.parts(EP);
    const lines: TextLine[] = [];
    let gap = false, partial = false;
    if (pp.parts.includes('kit')) {
      const res = await R.drainKit({ P: EP, nowMs: at, lost, sink: sink('kit'), get: (path) => kget('logs', 'export', path, signal) });
      gap = gap || res.gap;
      partial = partial || res.partial;
      for (const l of R.doneLines(res)) if (l.line !== 'complete') lines.push(doneLine(l));
    }
    for (const k of ['changes', 'account'] as const) {
      if (!pp.parts.includes(k) || lost()) continue;
      const res = await R.drainPages({ kind: k, P: EP, containerId: cid, lost, sink: sink(k), get: (path) => aget(k === 'changes' ? 'realm' : 'base', path, signal) });
      partial = partial || res.partial;
      if (res.stop !== 'done') lines.push({ key: 'done.stoppedIn', vars: { part: d.t('src.' + k), why: d.t('stop.' + (STOPS[res.stop] || 'failed')) } });
    }
    if (lost()) return null;
    if (!lines.length) lines.push({ key: partial || gap ? 'done.partial' : 'done.complete' });
    return keep(w.finish({ gap, partial }), X.filename(EP.source, o.format, at), lines);
  }

  // ── the list ───────────────────────────────────────────────────────────────────────
  function keyOf(r: R.Row): string {
    let k = tokens.get(r);
    if (!k) { k = 'k' + String(r.id); tokens.set(r, k); }
    return k;
  }

  function buildItems(): ListItem[] {
    const kit: DataItem[] = win ? win.rows().map((r) => ({ kind: 'kit' as const, k: keyOf(r), row: r, t: typeof r.tsMs === 'number' ? r.tsMs : 0, id: r.id as number })) : [];
    const all = kit.concat(side).sort((a, b) => b.t - a.t);
    const ms = marks.slice().sort((a, b) => b.at - a.at);
    const out: ListItem[] = [];
    let m = 0;
    let day = '';
    for (const it of all) {
      while (m < ms.length && it.kind === 'kit' && (it.row.id as number) <= (ms[m] as Mark).at) { out.push({ kind: 'div', k: (ms[m] as Mark).k, div: (ms[m] as Mark).div }); m++; }
      const dk = new Date(it.t).toDateString();
      if (day && dk !== day) out.push({ kind: 'div', k: 'day' + it.t, div: 'day', t: it.t });
      day = dk;
      out.push(fresh.has(it.k) ? { ...it, fresh: true } : it);
    }
    return out;
  }

  function build(): Snapshot {
    const key = [win && win.rows().length, win && win.afterId(), side.length, marks.length, fresh.size, held];
    if (!itemsMemo || itemsMemo.key === null || (itemsMemo.key as unknown[]).some((x, i) => x !== key[i])) itemsMemo = { key, items: buildItems() };
    const items = itemsMemo.items;
    const ws = win ? win.state() : null;
    const rows = items.filter(isData).length;
    const p = prefs();
    return {
      v, items, loading, err, note, stats, groups, spike: spikeAt, tooBig, chgFailed, skippedChanges: !!(parts && parts.skipped.length),
      liveOn, liveNote, held, asOf, newCount: buffered.length,
      moreOlder: !!(ws && ws.moreOlder) || sideMore, moreNewer: !!(ws && ws.moreNewer), olderBusy,
      rows, moreRows: sideMore || !!(ws && ws.moreOlder),
      programs, outs, exporting, jump,
      saved: Array.isArray(p.saved) ? p.saved.map((x) => R.storable(x as Record<string, unknown>)).filter((x) => x.name) : [],
      stripClosed: p.strip === 'closed', running,
    };
  }

  // ── the controller ─────────────────────────────────────────────────────────────────
  return {
    api, computer,
    get: () => snap || (snap = build()),
    subscribe(fn) { fns.add(fn); return () => { fns.delete(fn); }; },
    setView(next) {
      if (dead) return;
      const n = normalizeView(next);
      if (loaded && sameView(n, v)) return;
      const switched = n.source !== v.source;
      if (switched && n.source !== 'programs') programs = null;
      if (n.source === 'programs' && n.program && n.program !== v.program) wantProg = n.program;
      v = n;
      if (switched) note = null;
      loaded = true;
      run();
    },
    // Try again after a quota stop sends a new read: the stopped bucket is let go first.
    refresh() { for (const k of ['logs', 'exec', 'daemon']) SCHED.resume(cid + '|' + k); run(); },
    around(ms) {
      if (!alive()) return;
      v = normalizeView({ ...v, window: { around: Math.max(0, Math.round(ms)) }, source: v.source === 'programs' ? 'everything' : v.source });
      run();
    },
    older, newer,
    startLive,
    stopLive: (why) => stopLive(why),
    toggleLive() { if (liveOn) stopLive(); else startLive(); },
    setReading(r) {
      if (reading === r) return;
      reading = r;
      if (!r && buffered.length && win) { const b = buffered; buffered = []; flushRows(b); emit(); }
    },
    jumpToNewest() {
      if (!alive()) return;
      if (held) { const was = liveOn; run(); if (was) startLive(); jump++; return; }
      const b = buffered;
      buffered = [];
      if (b.length && win) flushRows(b);
      jump++;
      emit();
    },
    loadOutput,
      setStrip(closed) { const p = prefs(); if (closed) p.strip = 'closed'; else delete p.strip; savePrefs(p); emit(); },
    saveView(name) {
      const x = R.storable({ name: name.trim(), source: v.source, severity: v.severity, window: typeof v.window === 'string' ? v.window : null, program: v.program, script: v.script });
      if (!x.name) return 'name';
      const p = prefs();
      const l = (Array.isArray(p.saved) ? p.saved : []).filter((s) => s && s.name !== x.name);
      l.unshift(x);
      p.saved = l.slice(0, SAVED_MAX);
      if (!savePrefs(p)) return 'kept';
      emit();
      return true;
    },
    clearViews() { const p = prefs(); delete p.saved; const ok = savePrefs(p); if (ok) emit(); return ok; },
    startExport,
    cancelExport() { if (exportAc) { exportAc.abort(); exportAc = null; } exporting = { status: 'idle' }; emit(); },
    resetExport() { if (exporting.status !== 'working') { exporting = { status: 'idle' }; emit(); } },
    explainEntries: (items) => items.slice(0, 200).map((it) => entryFor(it, { ips: false, scriptPath: v.script, t: d.t })),
    dispose() {
      if (dead) return;
      dead = true;
      if (qac) qac.abort();
      if (exportAc) exportAc.abort();
      if (live) live.stop();
      timers.forEach((t) => clock.clearTimeout(t));
      win = null; side = []; fns.clear();
    },
  };
}
