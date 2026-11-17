// The schedules page's data: its routes, queries and mutations, declared in one place.
// Under the fixture transport (hub:dev, hub:shots, tests) the hooks read and write through core's pageFixtures; live, they
// call the computer's own endpoints (live.ts, live-act.ts), with the same names and types.
import { api, capture, fixtureModeActive, recordOrEmpty, useCore, useCurrentComputer, version, pageFixtures } from '@core';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useShellData } from '@kit';
import type { OutcomeKind } from '@kit';
import { type Call, loadSchedules } from './live';
import type { Act, RawSchedules, SchedRow } from './logic';
import { liveAct, liveHold, liveHoldSave, liveSave, liveSettle, liveSettleSave } from './live-act';

export { routes } from './routes';
import { routes } from './routes';

// ── The computer the page shows ──────────────────────────────────────────────────────

export interface Computer {
  name: string;
  /** 'running' | 'stopped' | ... as the platform reports it. */
  status: string;
  /** IANA name of the computer's time zone when known. */
  tz?: string;
}

// Fixture build only: the ship build (__HUB_FIXTURES__ false) holds no fixture module. Every read of `source` runs under
// fixtureModeActive(), which needs __HUB_FIXTURES__; the mutation hooks are registered only in fixture MODE: a fixture
// build on a live transport (a terminal live mount, live tests) has no fixture side loaded, and asking it throws
// FIXTURES_NOT_INSTALLED. Both conditions are fixed for the life of a page (a build constant, and the transport mode, as
// useComputer below), so the hook order never changes between renders.
const source = __HUB_FIXTURES__ ? pageFixtures('schedules')! : null;
const useFxMutation = <T, V>(key: string) => (__HUB_FIXTURES__ && fixtureModeActive() ? source!.useMutation<T, V>(key) : null);

/** The id of the selected computer ('' when none): what ends every held change when it changes. */
export function useComputerKey(): string {
  return useCurrentComputer()?.container.id ?? '';
}

/** The selected computer. `data` null: none chosen. With none chosen, `read` says whether that is known (C9: a computer
 *  list not known never reads as none): 'loading' while the list is read, 'unknown' when the read failed, absent once
 *  the list is known. `retry` reads it again (the person's Try again); its promise settles when that read ends. */
export interface ComputerRead {
  data: Computer | null;
  read?: 'loading' | 'unknown';
  retry?: () => Promise<unknown> | void;
}

/** Fixtures: the page's own state. A pending or failed read stands for the shell's list not known, with no computer
 *  chosen, as live. */
function useComputerFixture(): ComputerRead {
  const q = source!.useQuery<Computer | null>('computer');
  if (q.data !== undefined) return { data: q.data };
  return { data: null, read: q.isFetching || !q.error ? 'loading' : 'unknown', retry: () => q.refetch() };
}
/** Live: the shell's own list, and its read state when no computer is chosen. */
function useComputerLive(): ComputerRead {
  const target = useCurrentComputer();
  const shell = useShellData();
  if (!target) {
    const read = shell.computersRead;
    return { data: null, ...(read ? { read } : {}), ...(read && shell.retryComputers ? { retry: shell.retryComputers } : {}) };
  }
  const id = target.container.id;
  const row = shell.computers.find((c) => c.id === id);
  if (row) return { data: { name: row.name, status: row.running === false ? 'stopped' : 'running' } };
  // Chosen but not in the shell's list (yet): no name, assumed running. The live path reads no fixture, so a live
  // transport with fixtures compiled in (a terminal live mount, tests) never names a fixture computer.
  return { data: { name: '', status: 'running' } };
}
// The transport mode is fixed for the life of a page, so the branch never changes between renders.
export function useComputer(): ComputerRead {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return fixtureModeActive() ? useComputerFixture() : useComputerLive();
}

// ── Reads ─────────────────────────────────────────────────────────────�

const READ = {
  overview: routes.overview, health: routes.health, info: routes.info, entries: routes.entries, userEntries: routes.userEntries,
  runs: routes.runs, execList: routes.execList, curlList: routes.curlList, loops: routes.loops,
} as const;

/** Every source of the selected computer, read again every 30 s while shown (live), or the page's fixtures. */
function useSchedulesLive() {
  const s = useCore();
  const target = useCurrentComputer();
  const id = target?.container.id ?? null;
  // The context the page shows now: account, realm, generation and computer (the account can change without a
  // generation bump, core/query.ts). The state carries the context it was read for, and rows of another context are never
  // returned, not even on the render before the effect below clears them.
  const key = `${s.account ?? ''}\u0001${s.realm}\u0001${s.gen}\u0001${id ?? ''}`;
  const [state, setState] = useState<{ key: string; data: RawSchedules | undefined; error: unknown; pending: boolean }>({ key, data: undefined, error: null, pending: !!id });
  // The page's read in flight, with the `load` that started it (cleared when it ends).
  const ac = useRef<{ owner: unknown; ctl: AbortController } | null>(null);
  // Each context gets its own `load` (a change of any part of the key makes a new one, and so does coming back to an
  // earlier context: A → B → A). An action that awaited across a switch still holds an older `load`:
  // its read is detached. It answers its own caller with its own computer's rows (a check proves a change against the
  // computer it was sent to), but it neither cancels the current read nor puts its rows on the page. A read that started
  // current and ends after the page moved on is checked again when it ends, so its rows stay off too. `loadNow` moves
  // only when a context is committed (a render React discards never moves it).
  const loadNow = useRef<(() => Promise<{ data?: RawSchedules }>) | null>(null);
  const load = useCallback(function thisLoad(): Promise<{ data?: RawSchedules }> {
    if (!target) return Promise.resolve({});
    const current = loadNow.current === thisLoad;
    if (current) ac.current?.ctl.abort();
    const ctl = new AbortController();
    if (current) ac.current = { owner: thisLoad, ctl };
    const shows = () => current && loadNow.current === thisLoad && !ctl.signal.aborted;
    const ended = () => { if (ac.current?.ctl === ctl) ac.current = null; };
    const ctx = capture(target);
    const call: Call = (name, input = {}) => api(READ[name], { ...input, index: 1, ctx, signal: ctl.signal } as never);
    return loadSchedules(call, () => version(target, { ctx, signal: ctl.signal })).then(
      (loaded) => { ended(); const data: RawSchedules = { ...loaded, computer: id ?? '' }; if (shows()) setState({ key, data, error: null, pending: false }); return { data }; },
      (error: unknown) => { ended(); if (shows()) setState((p) => ({ key, data: p.key === key ? p.data : undefined, error, pending: false })); return {} as { data?: RawSchedules }; },
    );
  // The key's parts are the deps: a change of any starts a fresh load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.account, s.realm, s.gen, id]);
  useLayoutEffect(() => {
    loadNow.current = load;
  }, [load]);
  useEffect(() => {
    // A refetch of this context made after the commit, before this effect, is its first read: it stands.
    if (ac.current?.owner !== load) {
      setState({ key, data: undefined, error: null, pending: !!id });
      void load();
    }
    const t = setInterval(() => void load(), 30000);
    // Aborts only this context's read (the next context's refetch may already have started one) and lets it go, so a
    // setup that follows (StrictMode's replay) starts a fresh read.
    return () => {
      clearInterval(t);
      if (ac.current?.owner !== load) return;
      ac.current.ctl.abort();
      ac.current = null;
    };
  // `key` changes exactly when `load` does.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, id]);
  const shown = state.key === key ? state : { data: undefined, error: null, pending: !!id };
  return { data: shown.data, isPending: shown.pending, error: shown.data ? null : shown.error, refetch: load };
}
const useSchedulesFixture = () => source!.useQuery<RawSchedules>('schedules');
export function useSchedules(): { data: RawSchedules | undefined; isPending: boolean; error: unknown; refetch: () => Promise<{ data?: RawSchedules | undefined }> } {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return fixtureModeActive() ? useSchedulesFixture() : useSchedulesLive();
}

export interface HistoryRun {
  id: string;
  at: number;
  result: 'ok' | 'failed' | 'running' | 'lost' | 'skipped' | 'timeout';
  exit?: number | null;
  tookMs?: number | null;
  /** The run's output, when the kit kept it. */
  output?: string;
}

/** Past runs of the selected schedule, newest first. */
function useHistoryFixture(row: SchedRow) {
  // One answer per schedule; live, the row's own run list is read (useHistoryLive).
  return source!.useQuery<{ runs: HistoryRun[]; partial?: boolean }>(`history:${row.key}`);
}

const ms = (v: unknown): number => (typeof v === 'string' ? Date.parse(v) : typeof v === 'number' ? v : NaN);
const recs = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

/** One schedule's past runs from its own kit: cron runs, exec history, curl jobs. Loops keep only their last fire. */
export async function readHistory(row: SchedRow, target: ReturnType<typeof useCurrentComputer>): Promise<{ runs: HistoryRun[]; partial?: boolean }> {
  const ctx = capture(target);
  const call = (route: Parameters<typeof api>[0], input: Record<string, unknown>) => api(route, { index: 1, ctx, ...input } as never);
  const r = row.ref;
  if (row.src === 'cron' || row.src === 'timer') {
    const l = recordOrEmpty(await call(routes.runs, { query: { user: String(r.user), entry_id: String(r.entry), limit: 20 } }));
    return {
      runs: recs(l.runs).map((x) => ({
        id: String(x.run_id),
        at: ms(x.started_at),
        result: x.status === 'running' ? 'running' : x.status === 'lost' ? 'lost' : x.exit_code === 0 ? 'ok' : 'failed',
        exit: typeof x.exit_code === 'number' ? x.exit_code : null,
        tookMs: Number.isFinite(ms(x.finished_at)) ? ms(x.finished_at) - ms(x.started_at) : null,
      })),
    };
  }
  if (row.src === 'exec' && typeof r.path === 'string' && r.path) {
    const h = recordOrEmpty(await call(routes.execHistory, { query: { scriptPath: r.path, limit: 20 } }));
    return {
      runs: recs(h.entries).map((x, i) => ({
        id: `e${i}`,
        at: ms(x.ts),
        result: x.status === 'ok' ? 'ok' : x.status === 'timeout' ? 'timeout' : x.status === 'disabled' || x.status === 'skipped_overload' ? 'skipped' : 'failed',
        ...(typeof x.error === 'string' && x.error ? { output: x.error.slice(0, 500) } : {}),
      })),
    };
  }
  if (row.src === 'curl') {
    const l = recordOrEmpty(await call(routes.curlJobs, { query: { schedule_id: String(r.job), limit: 20 } }));
    return { runs: recs(l.items ?? l.jobs).map((j, i) => ({ id: `c${i}`, at: ms(j.created_at), result: j.status === 'completed' ? 'ok' : j.status === 'failed' ? 'failed' : 'running' })) };
  }
  return { runs: [], partial: true };
}

function useHistoryLive(row: SchedRow) {
  const target = useCurrentComputer();
  const s = useCore();
  // Each answer names the row and generation it was read for: on the render after a row switch the old answer is not
  // this row's, so it reads as pending, never as this row's runs (the effect clears it only after that render).
  const owner = `${s.gen}\u0001${row.key}`;
  const [st, setSt] = useState<{ owner: string; data?: { runs: HistoryRun[]; partial?: boolean }; error: unknown; pending: boolean }>({ owner, error: null, pending: true });
  const [again, setAgain] = useState(0);
  useEffect(() => {
    let alive = true;
    setSt({ owner, error: null, pending: true });
    readHistory(row, target).then(
      (data) => alive && setSt({ owner, data, error: null, pending: false }),
      (error: unknown) => alive && setSt({ owner, error, pending: false }),
    );
    return () => {
      alive = false;
    };
  // A row's identity is its key; the account, realm and computer are in the core generation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, again]);
  if (st.owner !== owner) return { data: undefined, isPending: true, error: null, refetch: () => setAgain((n) => n + 1) };
  return { data: st.data, isPending: st.pending, error: st.error, refetch: () => setAgain((n) => n + 1) };
}

export function useHistory(row: SchedRow): { data: { runs: HistoryRun[]; partial?: boolean } | undefined; isPending: boolean; error: unknown; refetch: () => unknown } {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return fixtureModeActive() ? useHistoryFixture(row) : useHistoryLive(row);
}

// ── Advanced: the exact text, read on request ────────────────────────────────────────

export interface Revealed {
  /** The text exactly as saved. The page masks it for display and keeps this for Copy exactly. */
  text: string;
}

/** Reads the command behind a schedule. Resolves null when it can't be read (loops and web requests keep theirs out of the list). */
export function useReveal(): (row: SchedRow) => Promise<Revealed | null> {
  const m = useFxMutation<Revealed, SchedRow>('reveal');
  const live = !fixtureModeActive();
  return async (row) => {
    try {
      if (live) {
        if (row.src !== 'cron' && row.src !== 'timer') return null;
        const e = recordOrEmpty(await api(routes.entryGet, { index: 1, ctx: capture(null), params: { user: String(row.ref.user), id: String(row.ref.entry) } } as never));
        return typeof e.command === 'string' ? { text: e.command } : null;
      }
      const res = await m!.mutateAsync(row);
      return res.outcome === 'done' && res.data ? res.data : null;
    } catch {
      return null;
    }
  };
}

// ── Preview (POST schedule/describe) ─────────────────────────────────────────────────

export interface Preview {
  /** Epoch ms of the next runs in the kit's own words. */
  next: number[];
  /** The kit refused the expression. */
  error?: string;
  /** The expression is valid and may never fire. */
  never?: boolean;
}

export function useDescribe(): (expr: string) => Promise<Preview | null> {
  const m = useFxMutation<Preview, string>('describe');
  const live = !fixtureModeActive();
  return async (expr) => {
    try {
      if (live) {
        const d = recordOrEmpty(await api(routes.describe, { index: 1, ctx: capture(null), body: { schedule: expr }, recovers: true } as never));
        if (typeof d.error === 'string') return { next: [], error: d.error };
        const next = (Array.isArray(d.next_runs) ? d.next_runs : []).map(ms).filter(Number.isFinite);
        return { next, ...(next.length === 0 ? { never: true } : {}) };
      }
      const res = await m!.mutateAsync(expr);
      return res.outcome === 'done' && res.data ? res.data : null;
    } catch {
      return null;
    }
  };
}

// ── Changes (C9: one request per press, never resent) ────────────────────────────────

export interface ActArgs {
  act: Act;
  row: SchedRow;
  /** pause: the value asked for (true = on). */
  enabled?: boolean;
}
export interface SaveArgs {
  /** The row being edited; none creates a command. */
  row: SchedRow | null;
  name: string;
  /** Empty on edit keeps the saved command. */
  command: string;
  schedule: string;
  runAs: 'user' | 'root';
  computer?: string;
}
export interface ActResult {
  outcome: OutcomeKind;
  code?: string;
  /** Pending (or READ_BACK_FIRST): the hold of the send that is held, for the settle of its proof. */
  hold?: string;
}

async function settle<V>(m: { mutateAsync: (v: V) => Promise<{ outcome: OutcomeKind; code?: string }> }, args: V): Promise<ActResult> {
  try {
    const res = await m.mutateAsync(args);
    return { outcome: res.outcome, ...(res.code ? { code: res.code } : {}) };
  } catch {
    return { outcome: 'not_sent' };
  }
}

/** Sends one action. Resolves with the C9 outcome; never throws. */
export function useAct(): (args: ActArgs) => Promise<ActResult> {
  const m = useFxMutation<unknown, ActArgs>('act');
  return (args) => (fixtureModeActive() ? settle(m!, args) : liveAct(args.act, args.row, args.enabled));
}

/** Creates or edits a command or a web request's time. */
export function useSave(): (args: SaveArgs) => Promise<ActResult> {
  const m = useFxMutation<unknown, SaveArgs>('save');
  return (args) => (fixtureModeActive() ? settle(m!, args) : liveSave(args));
}

/** The realm shown now, read when called (not at the last render): a loop change acts in the realm it was sent in. */
export const realmNow = (): string => capture().realm;

/** The hold of the action held now (undefined in fixture mode): taken before a proving read when the answer named none. */
export function holdAct(args: ActArgs): Promise<string | undefined> {
  return fixtureModeActive() ? Promise.resolve(undefined) : liveHold(args.act, args.row, args.enabled);
}

/** The hold of the save held now (undefined in fixture mode): taken before a proving read when the answer named none. */
export function holdSave(args: SaveArgs): Promise<string | undefined> {
  return fixtureModeActive() ? Promise.resolve(undefined) : liveHoldSave(args);
}

/** Releases core's lock on a pending action: the send `hold` names, after a fresh read proved that send; without a
 *  hold, the one held now, when the person dismisses it (no proof). */
export function settleAct(args: ActArgs, hold?: string): void {
  if (!fixtureModeActive()) liveSettle(args.act, args.row, args.enabled, hold);
}

/** Releases core's lock on a pending save: the send `hold` names, after a fresh read proved that send; without a hold,
 *  the one held now, when the person allows another try (no proof). */
export function settleSave(args: SaveArgs, hold?: string): void {
  if (!fixtureModeActive()) liveSettleSave(args, hold);
}
