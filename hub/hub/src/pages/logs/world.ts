// The fixture backend of the Logs page's network seam: a `World` (JSON, in fixtures.ts) answered
// through the in-memory logs kit, so hub:dev, shots and tests run the page's real code. Only
// data.ts reaches it, behind the fixtures flag; production builds never include it.
import { utf8Bytes } from '@core/pure';
import { fakeLogsDb, matchesFilters, type Row as FakeRow } from './fake-kit';
import { PROGRAM_LOGS, split, type CallOpts, type LogsApi } from './api';
import type { CoreStream } from './live';

/** What a fixture computer holds: the rows of every source and how each read goes. All JSON. */
export interface World {
  /** The logs kit's table (ids ascending). */
  kit: FakeRow[];
  retention?: { hours: number; maxRows: number; maxBytes: number };
  changes?: Record<string, unknown>[];
  account?: Record<string, unknown>[];
  helper?: Record<string, unknown>[];
  programs?: { id: string | number; name: string; port_range?: { start: number; end: number }; hoody_kit?: boolean }[];
  /** Program output by `<id>:<stdout|stderr>`. */
  programLogs?: Record<string, string>;
  /** Runs of a script, newest first, by script path. */
  runs?: Record<string, Record<string, unknown>[]>;
  runOutput?: Record<string, { lines: string[]; totalLines: number }>;
  models?: unknown;
  agents?: unknown;
  /** The completion answer: the answer body, or a rejection to throw. */
  complete?: unknown;
  /** A read that fails: `<read>` is logs, stats, programs, runs, output, helper, changes, account, models, agents, complete, download. */
  faults?: Record<string, unknown>;
  /** Reads that never answer. */
  hang?: string[];
  /** Delay of every read in ms (default 120). */
  delayMs?: number;
  /** Live: a new row about every N ms; 0 or absent: a quiet tail. */
  liveEveryMs?: number;
  /** Stop adding live rows after this many (shots need a page that comes to rest). */
  liveMax?: number;
  /** The exec kit does not know /logs/executions (an older computer). */
  noRuns?: boolean;
  /** The agent's export, as text. */
  helperExport?: string;
  /** The logs kit is an older one: its stats answer lacks the features the page needs. */
  oldKit?: boolean;
  /** A read that starts failing after n reads of it (an export that dies half way). */
  failAfter?: Record<string, number>;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const stop = () => { clearTimeout(t); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); };
    const t = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, ms);
    if (signal?.aborted) stop();
    else signal?.addEventListener('abort', stop, { once: true });
  });
}
const never = (signal?: AbortSignal): Promise<never> => new Promise((_, reject) => {
  const stop = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
  if (signal?.aborted) stop();
  else signal?.addEventListener('abort', stop, { once: true });
});

const slice = <T,>(list: readonly T[], from: number, n: number): T[] => list.slice(from, from + n);

/** The same seam over a fixture world (see the header). */
export function fixtureApi(world: World): LogsApi {
  const db = fakeLogsDb(world.kit, world.retention);
  const delay = world.delayMs ?? 120;
  let liveId = db.rows.length ? (db.rows[db.rows.length - 1] as FakeRow).id : 0;
  const LIVE0 = liveId;
  const reads: Record<string, number> = {};
  const read = async <T,>(name: string, o: CallOpts | undefined, f: () => T): Promise<T> => {
    if (world.hang?.includes(name)) return never(o?.signal);
    await wait(delay, o?.signal);
    reads[name] = (reads[name] || 0) + 1;
    if (world.faults && name in world.faults) throw world.faults[name];
    if (world.failAfter && name in world.failAfter && reads[name] > (world.failAfter[name] as number)) throw { status: 500, code: 'internal_error' };
    return f();
  };
  const kit: LogsApi['kit'] = (k, path, o) => {
    const { pathname, query: q } = split(path);
    if (k === 'logs') return read(pathname === '/_logs/stats' ? 'stats' : 'logs', o, () => (pathname === '/_logs/stats' ? (world.oldKit ? { total: db.rows.length } : db.stats(path)) : db.answer(path)));
    if (k === 'daemon') {
      if (pathname === '/api/v1/daemon/programs') return read('programs', o, () => ({ programs: world.programs || [] }));
      const m = PROGRAM_LOGS.exec(pathname);
      return read('programs', o, () => {
        const id = decodeURIComponent((m && m[1]) || '');
        const text = (world.programLogs || {})[`${id}:${q.type || 'stdout'}`] ?? '';
        const lines = text.split('\n');
        return { logs: lines.slice(-Number(q.lines || 1000)).join('\n') };
      });
    }
    return read('runs', o, () => {
      if (world.noRuns) throw { status: 404, code: 'not_found' };
      const all = (world.runs || {})[q.scriptPath || ''] || [];
      const failedOnly = q.status === 'failed';
      const list = all.filter((r) => !failedOnly || r.outcome === 'failed');
      const at = q.before ? list.findIndex((r) => r.executionId === q.before) + 1 : 0;
      const n = Math.min(100, Number(q.limit || 100));
      const executions = slice(list, at, n);
      const more = at + n < list.length;
      return { data: { executions, next: more ? (executions[executions.length - 1] || {}).executionId : null } };
    });
  };
  const side: LogsApi['side'] = (scope, path, o) => {
    const { query: q } = split(path);
    if (scope === 'realm') {
      return read('changes', o, () => {
        const rows = world.changes || [];
        return { data: slice(rows, Number(q.offset || 0), Number(q.limit || 500)) };
      });
    }
    return read('account', o, () => {
      const rows = (world.account || []).filter((r) => !q.min_status || Number(r.status_code) >= Number(q.min_status));
      const n = Number(q.limit || 100);
      return { data: slice(rows, (Number(q.page || 1) - 1) * n, n) };
    });
  };
  const stream: CoreStream = (path, h) => {
    const { query: q } = split(path);
    let alive = true;
    const timer = world.liveEveryMs
      ? setInterval(() => {
        if (!alive || (world.liveMax !== undefined && liveId - LIVE0 >= world.liveMax)) return;
        const src = db.rows.filter((r) => matchesFilters(r, { ...q, afterId: '' })).slice(-1)[0] || (db.rows[db.rows.length - 1] as FakeRow);
        const row: FakeRow = { ...src, id: ++liveId, tsMs: Date.now(), url: `/live/${liveId}`, traceId: `live${String(liveId).padStart(12, '0')}` };
        db.rows.push(row);
        if (matchesFilters(row, { ...q, sinceMs: '' })) h.onEvent('row', JSON.stringify({ ...row, tsIso: new Date(row.tsMs).toISOString() }), String(row.id));
      }, world.liveEveryMs)
      : null;
    queueMicrotask(() => alive && h.onState({ state: 'open', status: 200 }));
    return { close: () => { alive = false; if (timer) clearInterval(timer); } };
  };
  return {
    kit,
    side,
    helper: (path, o) => {
      const { query: q } = split(path);
      return read('helper', o, () => {
        const rows = (world.helper || []).filter((r) => !q.before_seq || Number(r.seq) < Number(q.before_seq)).filter((r) => !q.min_level || (q.min_level === 'error' ? r.level === 'error' : r.level === 'error' || r.level === 'warn'));
        return { entries: slice(rows, 0, Number(q.limit || 500)) };
      });
    },
    execRead: (body, o) => read('output', o, () => {
      const out = (world.runOutput || {})[body.executionId];
      if (!out) throw { status: 404, code: 'not_found' };
      return { lines: out.lines.slice(-body.lines), totalLines: out.totalLines };
    }),
    call: async (method, path, _body, extra) => {
      const name = path === '/completions' ? 'complete' : path === '/models' ? 'models' : 'agents';
      void method;
      return read(name, { signal: extra.signal }, () => (name === 'complete' ? world.complete : name === 'models' ? world.models : world.agents));
    },
    stream,
    download: async (path, o) => {
      const { query: q } = split(path);
      await read('download', o, () => null);
      const text = world.helperExport ?? '';
      const blob = new Blob([text]);
      void q;
      return { parts: [blob], bytes: utf8Bytes(text) };
    },
    save: (name, parts, o) => {
      let n = 0;
      for (const p of parts) n += typeof p === 'string' ? utf8Bytes(p) : (p as Blob).size || 0;
      return n > o.maxBytes ? { refused: 'TOO_LARGE' } : { ok: true, name, bytes: n };
    },
  };
}
