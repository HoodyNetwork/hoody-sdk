// Test and fixture support for the Logs page: a manual clock with timers and an in-memory
// logs kit that answers the logs read shape (newest-first cursorless reads, `beforeId` newest
// first, `afterId` ascending, `sinceMs`/`untilMs`, and the reply fields `newestId`,
// `retained:{oldestId, oldestTsMs}` and `retention`). The watermarks cover the whole scope, not
// the predicates, and are null when it is empty. Tests prune the table between pages to play
// age and row eviction; fixtures use it to answer every path the page builds.

export const T0 = 1_760_000_000_000;

/** A manual clock with timers; `drive` advances it until the promise settles. */
export function fakeClock(start = T0) {
  let now = start;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void; n: number }>();
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  const clock = {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => { const id = ++seq; timers.set(id, { at: now + Math.max(0, ms || 0), fn, n: id }); return id; },
    clearTimeout: (id: number) => { timers.delete(id); },
    pending: () => timers.size,
    /** Moves time forward by ms, running every timer that falls due, in order. */
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        await flush();
        let next: { at: number; fn: () => void; n: number } | null = null;
        let nid = 0;
        for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next.at || (t.at === next.at && t.n < next.n))) { next = t; nid = id; }
        if (!next) break;
        timers.delete(nid);
        now = Math.max(now, next.at);
        next.fn();
      }
      now = end;
      await flush();
    },
    /** Runs timers as they fall due until `p` settles (or `limitMs` of fake time passes). */
    async drive<X>(p: Promise<X>, limitMs = 3_600_000): Promise<X> {
      let done = false;
      const out = p.then((v) => { done = true; return v; }, (e) => { done = true; throw e; });
      const stop = now + limitMs;
      while (!done && now < stop) {
        await flush();
        if (done) break;
        let at = Infinity;
        for (const t of timers.values()) at = Math.min(at, t.at);
        if (at === Infinity) { await flush(); if (!done) throw new Error('drive: no timer left and the promise is still pending'); break; }
        await clock.advance(Math.max(0, at - now));
      }
      return out;
    },
  };
  return clock;
}


export function query(path: string | null | undefined): Record<string, string> {
  if (!path) throw new Error("no path");
  const i = path.indexOf("?");
  const out: Record<string, string> = {};
  if (i < 0) return out;
  for (const kv of path.slice(i + 1).split('&')) {
    if (!kv) continue;
    const j = kv.indexOf('=');
    const k = decodeURIComponent(j < 0 ? kv : kv.slice(0, j));
    if (k in out) throw new Error('repeated query key ' + k);
    out[k] = j < 0 ? '' : decodeURIComponent(kv.slice(j + 1));
  }
  return out;
}

export type Row = {
  id: number; tsMs: number; tsIso?: string; level?: string; status?: number; serviceName?: string; source?: string; kind?: string; url?: string;
  method?: string; traceId?: string; clientIp?: string; durationMs?: number; data?: Record<string, unknown>; truncated?: boolean;
};

/** The server-side filters of /_logs and /_logs/stats (the page's FILTER_KEYS) over one row. */
export function matchesFilters(r: Row, q: Record<string, string>): boolean {
  if (q.sinceMs && r.tsMs < Number(q.sinceMs)) return false;
  if (q.untilMs && r.tsMs > Number(q.untilMs)) return false;
  if (q.source && r.source !== q.source) return false;
  if (q.kind && r.kind !== q.kind) return false;
  if (q.serviceName && r.serviceName !== q.serviceName) return false;
  if (q.excludeService && r.serviceName === q.excludeService) return false;
  if (q.level && !q.level.split(',').includes(String(r.level))) return false;
  if (q.minStatus && !(typeof r.status === 'number' && r.status >= Number(q.minStatus))) return false;
  if (q.path && !String(r.url || '').toLowerCase().includes(q.path.toLowerCase())) return false;
  if (q.status && r.status !== Number(q.status)) return false;
  if (q.traceId && String(r.traceId || '').toLowerCase() !== q.traceId.toLowerCase()) return false;
  if (q.method && r.method !== q.method) return false;
  if (q.botUrl && (r.data || {}).exposure_id !== q.botUrl) return false;
  return true;
}

/** The logs read over an in-memory table (ids ascending). */
export function fakeLogsDb(rows: Row[], retention = { hours: 168, maxRows: 50000, maxBytes: 100_000_000 }) {
  const db = {
    rows: rows.slice(),
    retention: { ...retention },
    reads: [] as Record<string, string>[],
    answer(path: string) {
      const q = query(path);
      db.reads.push(q);
      const limit = Math.min(1000, Number(q.limit || 100));
      const m = db.rows.filter((r) => matchesFilters(r, q));
      let entries: Row[];
      if (q.afterId !== undefined) entries = m.filter((r) => r.id > Number(q.afterId)).slice(0, limit);
      else if (q.beforeId !== undefined) entries = m.filter((r) => r.id < Number(q.beforeId)).reverse().slice(0, limit);
      else entries = m.slice().reverse().slice(0, limit);
      // getWatermarks: the scope's largest id and oldest stored row, whatever the predicates;
      // an empty scope is newestId null and retained null.
      const oldest = db.rows[0];
      const newest = db.rows.length ? (db.rows[db.rows.length - 1] as Row).id : null;
      return {
        entries: entries.map((r) => ({ ...r, tsIso: r.tsIso || new Date(r.tsMs).toISOString() })),
        total: m.length, limit, offset: 0,
        newestId: newest,
        retained: oldest ? { oldestId: oldest.id, oldestTsMs: oldest.tsMs } : null,
        retention: { ...db.retention },
      };
    },
    /** /_logs/stats: totals by level and status class and one bucket per bucketMs from sinceMs. */
    stats(path: string) {
      const q = query(path);
      db.reads.push(q);
      const m = db.rows.filter((r) => matchesFilters(r, q));
      const byLevel: Record<string, number> = {};
      const byStatusClass: Record<string, number> = {};
      const width = Math.max(1, Number(q.bucketMs || 60000));
      const start = Number(q.sinceMs || (m[0] ? m[0].tsMs : 0));
      const buckets = new Map<number, { startMs: number; byLevel: Record<string, number>; byStatusClass: Record<string, number> }>();
      const bump = (o: Record<string, number>, k: string) => { o[k] = (o[k] || 0) + 1; };
      for (const r of m) {
        const cls = typeof r.status === 'number' ? Math.floor(r.status / 100) + 'xx' : null;
        if (r.level) bump(byLevel, r.level);
        if (cls) bump(byStatusClass, cls);
        const i = Math.max(0, Math.floor((r.tsMs - start) / width));
        let b = buckets.get(i);
        if (!b) { b = { startMs: start + i * width, byLevel: {}, byStatusClass: {} }; buckets.set(i, b); }
        if (r.level) bump(b.byLevel, r.level);
        if (cls) bump(b.byStatusClass, cls);
      }
      const last = untilIndex(q, start, width, m);
      const list = [];
      for (let i = 0; i <= last; i++) list.push(buckets.get(i) || { startMs: start + i * width, byLevel: {}, byStatusClass: {} });
      return { features: ['filters2', 'beforeId', 'buckets', 'retention'], total: m.length, byLevel, byStatusClass, buckets: list, retention: { ...db.retention } };
    },
    /** Row pruning: deletes the n smallest ids. */
    pruneRows(n: number) { db.rows.splice(0, n); },
    /** Age pruning: deletes rows older than cutoff (ts_ms), whatever their id. */
    pruneAge(cutoffMs: number) { db.rows = db.rows.filter((r) => r.tsMs >= cutoffMs); },
  };
  return db;
}

function untilIndex(q: Record<string, string>, start: number, width: number, m: Row[]): number {
  const end = q.untilMs ? Number(q.untilMs) : m.length ? (m[m.length - 1] as Row).tsMs : start;
  return Math.max(0, Math.min(500, Math.floor((end - start) / width)));
}

/** n rows one second apart ending at `endMs`, ids from `firstId`. */
export function rowsEvery(n: number, endMs: number, firstId = 1, stepMs = 1000, extra: Partial<Row> = {}): Row[] {
  const out: Row[] = [];
  for (let i = 0; i < n; i++) out.push({ id: firstId + i, tsMs: endMs - (n - 1 - i) * stepMs, level: 'info', status: 200, source: 'edge', kind: 'request', serviceName: 'files', url: '/f/' + (firstId + i), ...extra });
  return out;
}
