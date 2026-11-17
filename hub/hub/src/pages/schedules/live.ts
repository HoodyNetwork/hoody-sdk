// The live read of the schedules page: one load over the four sources (cron, exec, curl, agent loops),
// in this order. The daemon overview comes first; exec is read whatever it says; curl and
// the agent are read only when the overview says they run. A source that fails answers its own state, never
// blocks the others. `call` and `version` are injected so the load is testable without a core session.
import { type Rec, recordOrEmpty } from '@core';
import { agentSignedOut } from '@kit';
import type { Caps, RawCronEntry, RawCronRun, RawCurl, RawExec, RawHandLine, RawLoop, RawSchedules, Source, SourceState } from './logic';

export type Call = (name: ReadName, input?: { query?: Record<string, string | number>; params?: Record<string, string> }) => Promise<unknown>;
export type ReadName = 'overview' | 'health' | 'info' | 'entries' | 'userEntries' | 'runs' | 'execList' | 'curlList' | 'loops';

const PAGE = 200;
const USERS = ['user', 'root'] as const;
const RE_USER = /^[A-Za-z0-9_.][A-Za-z0-9_.-]{0,31}$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const arr = (v: unknown): Rec[] => (Array.isArray(v) ? (v as Rec[]) : []);
const status = (e: unknown): number | null => (typeof recordOrEmpty(e).status === 'number' ? (recordOrEmpty(e).status as number) : null);
const priv = (e: unknown): boolean => recordOrEmpty(e).kind === 'forbidden' || status(e) === 403 || status(e) === 401;
// Core's ways of saying an answer belongs to a context that is gone: stale or not sent, aborted, or superseded (a
// 401 for an account session that ended, with or without kind 'stale'). None of them is the computer's answer.
const stale = (e: unknown): boolean => {
  const r = recordOrEmpty(e);
  return r.stale === true || r.notSent === true || r.kind === 'aborted' || r.superseded === true;
};
/** A stale, aborted or superseded call ends the whole load: its answer must not show. */
function soft<T>(fallback: T) {
  return (e: unknown): T => {
    if (stale(e)) throw e;
    return fallback;
  };
}
const flags = (list: unknown, words: string): Record<string, boolean> => {
  const l = Array.isArray(list) ? list : [];
  return Object.fromEntries(words.split(' ').map((w) => [w, l.includes(w)]));
};
const empty = <T>(state: SourceState, complete = false): Source<T> => ({ state, complete, items: [] });

interface Prog { name?: unknown; status?: unknown; states_known?: unknown }
type ProgState = 'running' | 'stopped' | 'absent' | 'unknown' | null;
function progState(programs: Prog[] | null, name: string): ProgState {
  if (!programs) return null;
  const p = programs.find((x) => x.name === name);
  if (!p) return 'absent';
  return p.status === 'running' ? 'running' : p.states_known === true && p.status !== 'starting' ? 'stopped' : 'unknown';
}

async function cronSource(call: Call): Promise<Source<RawCronEntry> & { hand: RawHandLine[]; caps: Caps }> {
  const out = { ...empty<RawCronEntry>('ok'), hand: [] as RawHandLine[], caps: {} as Caps };
  try {
    await call('health');
  } catch (e) {
    if (stale(e)) throw e;
    return { ...out, state: priv(e) ? 'private' : status(e) === 404 ? 'old' : 'down' };
  }
  const info = recordOrEmpty(await call('info').catch(soft(null)));
  const feat = flags(info.features, 'entries_all next_runs history_persisted run_now entry_revision describe raw_parse');
  const caps: Caps = { runs: false, run_now: feat.run_now };
  const runsP = call('runs', { query: { limit: PAGE } }).then(
    (r) => {
      caps.runs = true;
      return arr(recordOrEmpty(r).runs);
    },
    (e) => {
      if (stale(e)) throw e;
      return [] as Rec[];
    },
  );
  const managed: Rec[] = [];
  const jobs: Rec[] = [];
  let hidden = 0;
  let unreadable = 0;
  let full = feat.entries_all === true;
  const take = (l: Rec, user: string | null) => {
    for (const e of arr(l.entries)) {
      const u = typeof e.user === 'string' ? e.user : user;
      const c = { ...e, user: u };
      if (!u || !RE_USER.test(u)) hidden++;
      else if ((e.type === 'managed' || (e.type == null && e.id)) && typeof e.id === 'string' && RE_UUID.test(e.id)) managed.push(c);
      else if (feat.raw_parse && !e.id && typeof e.schedule === 'string' && typeof e.command === 'string') jobs.push(c);
      else hidden++;
    }
  };
  const pages = async (name: 'entries' | 'userEntries', user: string | null): Promise<void> => {
    for (let n = 1; n <= 10; n++) {
      const l = recordOrEmpty(await call(name, { query: { page: n, limit: PAGE }, ...(user ? { params: { user } } : {}) }));
      take(l, user);
      hidden += Number(l.job_lines) || 0;
      unreadable += arr(l.unreadable_users).length;
      if (n * PAGE >= (Number(l.total) || 0)) return;
    }
    full = false;
  };
  const entriesP = feat.entries_all ? pages('entries', null) : Promise.all(USERS.map((u) => pages('userEntries', u).catch(soft(undefined))));
  // Both reads run at once and both outcomes are awaited, so neither rejection is left unhandled. runsP rejects only
  // when stale; a stale answer from either read ends the load before an entries failure can say "down".
  const [ent, run] = await Promise.allSettled([entriesP, runsP]);
  if (run.status === 'rejected') throw run.reason;
  if (ent.status === 'rejected') {
    if (stale(ent.reason)) throw ent.reason;
    return { ...out, state: 'down' };
  }
  const runs = run.value;
  const lastOf = (e: Rec): RawCronRun | null => {
    const mine = runs.filter((r) => r.entry_id === e.id && r.user === e.user);
    return (mine[0] as unknown as RawCronRun | undefined) ?? null;
  };
  const items = managed.map((e) => ({ ...e, last_run: lastOf(e) ?? (e.last_run as RawCronRun | null | undefined) ?? null })) as unknown as RawCronEntry[];
  const hand = jobs.map((j, i) => ({ user: String(j.user), line: Number(j.line) || i + 1, schedule: String(j.schedule), schedule_human: typeof j.schedule_human === 'string' ? j.schedule_human : undefined, command: String(j.command) }));
  return { state: 'ok', complete: full && !hidden && !unreadable, items, hand, caps };
}

async function execSource(call: Call): Promise<Source<RawExec>> {
  try {
    const l = recordOrEmpty(await call('execList'));
    return { state: 'ok', complete: true, items: arr(l.schedules) as unknown as RawExec[] };
  } catch (e) {
    if (stale(e)) throw e;
    return empty(priv(e) ? 'private' : status(e) === 503 ? 'off' : status(e) === 404 ? 'old' : 'failed', status(e) === 503);
  }
}

async function curlSource(call: Call, st: ProgState): Promise<Source<RawCurl>> {
  if (st === 'absent') return empty('absent', true);
  if (st !== 'running') return empty(st === 'stopped' ? 'stopped' : 'not_checked');
  try {
    const l = recordOrEmpty(await call('curlList'));
    return { state: 'ok', complete: true, items: arr(l.items).filter((j) => typeof j.id === 'string' && RE_UUID.test(j.id)) as unknown as RawCurl[] };
  } catch (e) {
    if (stale(e)) throw e;
    return empty(priv(e) ? 'private' : status(e) === 404 ? 'off' : 'failed', status(e) === 404);
  }
}

async function loopSource(call: Call, version: () => Promise<{ supported: readonly string[] }>, st: ProgState): Promise<Source<RawLoop> & { caps: Caps }> {
  const caps: Caps = {};
  if (st === 'stopped' || st === 'absent') return { ...empty('stopped', true), caps };
  if (st !== 'running') return { ...empty('not_checked'), caps };
  try {
    const v = await version().catch(soft(null));
    Object.assign(caps, flags(v?.supported, 'loop_receipts loop_list_titles'));
    const l = recordOrEmpty(await call('loops'));
    return { state: 'ok', complete: true, items: arr(l.items) as unknown as RawLoop[], caps };
  } catch (e) {
    if (stale(e)) throw e;
    return { ...empty(agentSignedOut(e) ? 'signed_out' : priv(e) ? 'private' : 'failed'), caps };
  }
}

/** Reads every source of the selected computer. `utcOffset` comes from the cron kit's info when it names one. */
export async function loadSchedules(call: Call, version: () => Promise<{ supported: readonly string[] }>, now: () => number = Date.now): Promise<RawSchedules> {
  let programs: Prog[] | null = null;
  let running = 0;
  try {
    const o = recordOrEmpty(await call('overview'));
    programs = arr(o.programs) as Prog[];
    running = programs.filter((p) => p.status === 'running').length;
  } catch (e) {
    if (stale(e)) throw e;
  }
  const [cron, exec, curl, loop] = await Promise.all([
    cronSource(call),
    execSource(call),
    curlSource(call, progState(programs, 'hoody-curl')),
    loopSource(call, version, progState(programs, 'hoody-agent')),
  ]);
  const off = await call('info').then((i) => recordOrEmpty(i).utc_offset_seconds, soft(null));
  return { now: now(), utcOffset: typeof off === 'number' ? off : null, cron, exec, curl, loop, programsRunning: running };
}
