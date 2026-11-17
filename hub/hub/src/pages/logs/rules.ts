// The Logs page's data rules, without UI and without I/O.
// rules.test.ts pins it.
//
// Contract:
//   - A view is one predicate set P (`predicate`), frozen when the query starts. Every read of the view
//     sends exactly P: the newest page, older and newer pages, stats, problem groups and the export walk.
//     Nothing is filtered client-side after paging, so an empty page means "nothing matches"; only live
//     stream rows, which the logs API filters by level and service alone, pass the live tail's `matches` (live.ts).
//     A filter a source cannot carry is refused, never dropped; Everything leaves out Changes for such a
//     filter and `parts` says so.
//   - Paths, query keys and body keys are built here and declared as routes in routes.ts: core refuses a
//     read whose keys the route does not list, so the two files are checked against each other in
//     rules.test.ts.
//   - The scheduler is a client estimate of the kit's rate limit (10 tokens, 0.5/s per computer and kit).
//     Server answers stay authoritative: a 429 empties the bucket, a quota answer stops the computer's
//     reads until the user retries.
//   - The export walk never states completeness it cannot prove: any sign that kept rows moved while it
//     ran, or that the window starts where rows are no longer kept, sets `gap`.
import { HubLogsScrub as S } from './scrub';

const KIB = 1024;
const MIB = 1024 * KIB;
const MIN = 60000;
const HOUR = 60 * MIN;

export const LIMITS = {
  pageRows: 200, kitMaxRows: 1000, minRetryRows: 25, exportPageRows: 500, exportRows: 8000,
  windowRows: 2000, windowBytes: 8 * MIB, searchLen: 200, changesPage: 500, accountPage: 100,
  scriptsPage: 100, programLines: 10000, rowBytes: 64 * KIB, execLines: 10000, execReadLines: 200, helperPage: 500, helperExportRows: 8000,
} as const;

const WINDOWS = { '15m': 15 * MIN, '1h': HOUR, '24h': 24 * HOUR, '7d': 168 * HOUR } as const;
export type WindowKey = keyof typeof WINDOWS;
/** A preset window, or a span of 5 minutes either side of a moment. */
export type WindowSpec = WindowKey | { around: number };

const AROUND_MS = 5 * MIN;
const AGE_MARGIN_MS = 15 * MIN;

export type Source = 'everything' | 'visits' | 'bots' | 'execVisits' | 'decisions' | 'changes' | 'scripts' | 'programs' | 'account' | 'helper';
export type Severity = 'all' | 'problems' | 'failed';

interface KitFilter { source: string; kind?: string; serviceName?: string; excludeService?: string }
interface SourceDef {
  kit?: KitFilter;
  /** How "How it went" is expressed: a status range, a level list, an exec status, or none. */
  sev: 'status' | 'level' | 'exec' | null;
  search?: boolean;
  botUrl?: boolean;
  parts?: readonly string[];
}

const EDGE: KitFilter = { source: 'edge', kind: 'request' };
// Each source class: the logs-kit predicate it adds (kit), how "How it went" is expressed, whether search and
// the Bot URL filter apply. Visits and Bot calls are both edge request rows. execVisits are the exec
// program's visits: what Scripts falls back to while exec keeps no per-script logs. The AI helper is the agent's own log
// (/logs): its search is the agent's literal `text` filter.
const SOURCES: Record<Source, SourceDef> = {
  everything: { kit: EDGE, sev: 'status', search: true, parts: ['kit', 'changes'] },
  visits: { kit: { source: 'edge', kind: 'request', excludeService: 'bots' }, sev: 'status', search: true },
  bots: { kit: { source: 'edge', kind: 'request', serviceName: 'bots' }, sev: 'level', search: true, botUrl: true },
  execVisits: { kit: { source: 'edge', kind: 'request', serviceName: 'exec' }, sev: 'status', search: true },
  decisions: { kit: { source: 'backend' }, sev: 'level', search: true },
  changes: { sev: null, parts: ['changes'] },
  scripts: { sev: 'exec' },
  programs: { sev: null },
  account: { sev: 'status' },
  helper: { sev: 'level', search: true },
};
export const SOURCE_IDS = Object.keys(SOURCES) as Source[];

const SEVERITY: Record<Severity, 1> = { all: 1, problems: 1, failed: 1 };
const METHOD = /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/;
const BOT_URL_ID = /^bu_[0-9a-f]{24}$/;
const CID = /^[0-9a-f]{24}$/;
const PROGRAM = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const EXECUTION_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The logs-kit filter keys both /_logs and /_logs/stats take. The Bot URL filter's wire key is `botUrl`. */
export const FILTER_KEYS = ['source', 'kind', 'serviceName', 'excludeService', 'level', 'minStatus', 'path', 'status', 'traceId', 'method', 'botUrl', 'sinceMs', 'untilMs'] as const;

/** Error classes; the codes a refusal is shown by. */
const CODES: Record<string, 1> = { rate_limited: 1, quota: 1, private: 1, blocked: 1, unreachable: 1, unavailable: 1, bad_request: 1, too_large: 1, aborted: 1, stale: 1, unfinished: 1 };

function own(o: object | null | undefined, k: string): boolean { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
export function isId(v: unknown): v is number { return typeof v === 'number' && Math.floor(v) === v && v >= 1 && v <= 9007199254740991; }
export function isNat(v: unknown): v is number { return typeof v === 'number' && Math.floor(v) === v && v >= 0 && v <= 9007199254740991; }
function clamp(v: unknown, lo: number, hi: number): number {
  const n = Math.floor(Number(v));
  return Number.isNaN(n) ? lo : Math.max(lo, Math.min(hi, n));
}
type Pair = [string, string | number];
function qs(pairs: readonly Pair[]): string {
  return pairs.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v))).join('&');
}
function iso(ms: number): string { return new Date(ms).toISOString(); }

/** A refusal before anything was sent. */
export interface Refusal { code: string; notSent: true }
export function refusal(code: string): Refusal { return { code, notSent: true }; }

/** One row of any source, as the page keeps it. The fields below are the ones the page reads. */
export interface Row {
  id?: number;
  seq?: number;
  tsMs?: number;
  tsIso?: string;
  status?: number;
  level?: string;
  method?: string;
  url?: string;
  serviceName?: string;
  serviceIndex?: number | string;
  traceId?: string;
  clientIp?: string;
  durationMs?: number;
  bytesSent?: number;
  source?: string;
  kind?: string;
  data?: Record<string, unknown>;
  truncated?: boolean;
  [k: string]: unknown;
}

// ── search ──────────────────────────────────────────────────────────

export type SearchSpec =
  | { kind: 'none' }
  | { kind: 'invalid'; code: 'search_too_long' }
  | { kind: 'traceId'; value: string }
  | { kind: 'status'; value: number }
  | { kind: 'path'; value: string };

/** Hex >= 16 or a UUID is a request ID; 3 digits 100-599 a status; anything else a literal, case-insensitive address substring that the server matches with an escaped LIKE. */
export function search(text: unknown): SearchSpec {
  const s = String(text == null ? '' : text).replace(/^\s+|\s+$/g, '');
  if (!s) return { kind: 'none' };
  if (s.length > LIMITS.searchLen) return { kind: 'invalid', code: 'search_too_long' };
  if (/^[0-9a-fA-F]{16,}$/.test(s) || /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s)) return { kind: 'traceId', value: s.toLowerCase() };
  if (/^[1-5][0-9]{2}$/.test(s)) return { kind: 'status', value: Number(s) };
  return { kind: 'path', value: s };
}

// ── predicate set ───────────────────────────────────────────────────

export interface ViewInput {
  source: Source | string;
  severity?: Severity | string | null;
  window?: WindowSpec | string | null;
  search?: string | null;
  method?: string | null;
  botUrl?: string | null;
}

export interface Predicate {
  readonly source: Source;
  readonly severity: Severity;
  readonly sinceMs: number;
  readonly untilMs: number | null;
  readonly search: Readonly<{ kind: 'traceId' | 'status' | 'path'; value: string | number }> | null;
  readonly method: string | null;
  readonly botUrl: string | null;
}

export type PredicateResult = { ok: true; P: Predicate } | { ok: false; code: string };

/** The predicate of a view at `nowMs`, or why it has none. A preset window is open at the newest end (newer pages and live rows stay inside it); its start is fixed here. */
export function predicate(view: ViewInput | null | undefined, nowMs: number): PredicateResult {
  const v = view || ({} as ViewInput);
  if (!own(SOURCES, v.source)) return { ok: false, code: 'source_invalid' };
  const source = v.source as Source, src = SOURCES[source];
  const sev = v.severity == null ? 'all' : v.severity;
  if (!own(SEVERITY, sev)) return { ok: false, code: 'severity_invalid' };
  if (sev !== 'all' && !src.sev && source !== 'everything') return { ok: false, code: 'severity_unsupported' };
  const w = v.window == null ? '1h' : v.window;
  let since: number;
  let until: number | null = null;
  if (typeof w === 'string' && own(WINDOWS, w)) since = nowMs - WINDOWS[w as WindowKey];
  else if (w && typeof w === 'object' && isNat(w.around)) { since = w.around - AROUND_MS; until = w.around + AROUND_MS; }
  else return { ok: false, code: 'window_invalid' };
  const s = search(v.search);
  if (s.kind === 'invalid') return { ok: false, code: s.code };
  if (s.kind !== 'none' && !src.search) return { ok: false, code: 'search_unsupported' };
  const method = v.method == null || v.method === '' ? null : String(v.method);
  if (method !== null && !METHOD.test(method)) return { ok: false, code: 'method_invalid' };
  if (method !== null && !src.kit && source !== 'account') return { ok: false, code: 'method_unsupported' };
  const botUrl = v.botUrl == null || v.botUrl === '' ? null : String(v.botUrl);
  if (botUrl !== null && !BOT_URL_ID.test(botUrl)) return { ok: false, code: 'bot_url_invalid' };
  if (botUrl !== null && !src.botUrl) return { ok: false, code: 'bot_url_unsupported' };
  return {
    ok: true,
    P: Object.freeze({
      source, severity: sev as Severity, sinceMs: Math.max(0, since), untilMs: until,
      search: s.kind === 'none' ? null : Object.freeze({ kind: s.kind, value: s.value }),
      method, botUrl,
    }),
  };
}

export interface Parts { parts: string[]; skipped: { source: string; reason: string }[] }

/** The sources one read of P covers. Changes carries no severity, search or method, so Everything with any of them reads the logs kit alone and names what it left out. */
export function parts(P: Predicate): Parts {
  const src = SOURCES[P.source];
  if (P.source !== 'everything') return { parts: src.kit ? ['kit'] : (src.parts || [P.source]).slice(), skipped: [] };
  const why = P.severity !== 'all' ? 'severity' : P.search ? 'search' : P.method ? 'method' : null;
  return why ? { parts: ['kit'], skipped: [{ source: 'changes', reason: why }] } : { parts: ['kit', 'changes'], skipped: [] };
}

/** What both /_logs and /_logs/stream filter server-side: the source's kit keys and a level list. null for a source the logs kit does not hold. */
export function basePairs(P: Predicate): Pair[] | null {
  const src = SOURCES[P.source], k = src.kit, out: Pair[] = [];
  if (!k) return null;
  for (const n of ['source', 'kind', 'serviceName', 'excludeService'] as const) {
    const v = k[n];
    if (v) out.push([n, v]);
  }
  if (P.severity !== 'all' && src.sev === 'level') out.push(['level', P.severity === 'failed' ? 'error' : 'warn,error']);
  return out;
}
function kitPairs(P: Predicate): Pair[] | null {
  const out = basePairs(P);
  if (!out) return null;
  if (P.severity !== 'all' && SOURCES[P.source].sev !== 'level') out.push(['minStatus', P.severity === 'failed' ? 500 : 400]);
  if (P.search) out.push([P.search.kind, P.search.value]);
  if (P.method) out.push(['method', P.method]);
  if (P.botUrl) out.push(['botUrl', P.botUrl]);
  out.push(['sinceMs', P.sinceMs]);
  if (P.untilMs !== null) out.push(['untilMs', P.untilMs]);
  return out;
}

export interface Cursor { beforeId?: number; afterId?: number }

/** /_logs for P: cursorless (newest first), {beforeId} (older, newest first) or {afterId} (newer, ascending). Never offset or last. null for a source the logs kit does not hold. */
export function kitPath(P: Predicate, cursor: Cursor | null, limit: number): string | null {
  const pairs = kitPairs(P);
  if (!pairs) return null;
  if (cursor && own(cursor, 'beforeId') && own(cursor, 'afterId')) throw new Error('one cursor at most');
  if (cursor && own(cursor, 'beforeId')) pairs.push(['beforeId', cursor.beforeId as number]);
  if (cursor && own(cursor, 'afterId')) pairs.push(['afterId', cursor.afterId as number]);
  pairs.push(['limit', clamp(limit, 1, LIMITS.kitMaxRows)]);
  return '/_logs?' + qs(pairs);
}

/** Bucket width for the spike notice: about 60 buckets over the window, whole minutes, at least 60 s. */
export function bucketMs(P: Predicate, nowMs?: number): number {
  const span = P.untilMs !== null ? P.untilMs - P.sinceMs : (nowMs == null ? HOUR : nowMs - P.sinceMs);
  return Math.max(MIN, Math.ceil(span / 60 / MIN) * MIN);
}
export function statsPath(P: Predicate, nowMs?: number): string | null {
  const pairs = kitPairs(P);
  if (!pairs) return null;
  pairs.push(['bucketMs', bucketMs(P, nowMs)]);
  return '/_logs/stats?' + qs(pairs);
}

export function changesPath(P: Predicate, containerId: string, o: { limit?: number; offset?: number } = {}): string | null {
  if (!CID.test(String(containerId))) return null;
  const pairs: Pair[] = [['computer_id', containerId], ['start_date', iso(P.sinceMs)]];
  if (P.untilMs !== null) pairs.push(['end_date', iso(P.untilMs)]);
  pairs.push(['sort_by', 'created_at'], ['sort_order', 'desc'], ['limit', clamp(o.limit, 1, LIMITS.changesPage)], ['offset', clamp(o.offset, 0, 9007199254740991)]);
  return '/events?' + qs(pairs);
}

export function accountPath(P: Predicate, o: { page?: number; limit?: number } = {}): string {
  const pairs: Pair[] = [['page', clamp(o.page, 1, 10001)], ['limit', clamp(o.limit, 1, LIMITS.accountPage)], ['start_date', iso(P.sinceMs)]];
  if (P.untilMs !== null) pairs.push(['end_date', iso(P.untilMs)]);
  if (P.severity !== 'all') pairs.push(['min_status', P.severity === 'failed' ? 500 : 400]);
  if (P.method) pairs.push(['method', P.method]);
  return '/users/auth/activity?' + qs(pairs);
}

/** A script path as the Scripts source keys it: relative, no '..' segment, no backslash, printable, at most 512. */
export function scriptOk(s: unknown): s is string {
  return typeof s === 'string' && s.length >= 1 && s.length <= 512 && s.charAt(0) !== '/' && !/[\\\u0000-\u001f\u007f]/.test(s) && s.split('/').indexOf('..') === -1;
}
export function scriptsPath(P: Predicate, o: { script?: string; limit?: number; before?: string | null }): string | null {
  if (!scriptOk(o.script)) return null;
  const pairs: Pair[] = [['scriptPath', o.script], ['status', P.severity === 'all' ? 'all' : 'failed'], ['since', iso(P.sinceMs)]];
  if (P.untilMs !== null) pairs.push(['until', iso(P.untilMs)]);
  pairs.push(['limit', clamp(o.limit, 1, LIMITS.scriptsPage)]);
  if (o.before != null && o.before !== '') pairs.push(['before', String(o.before)]);
  return '/api/v1/exec/logs/executions?' + qs(pairs);
}

/** One program, one channel (stdout|stderr), lines at most 10,000; port only for port-range programs. An id with a '..' run gets no path: the kit refuses such a path before matching. */
export function programPath(o: { id: string; channel: string; lines: number; port?: number | null }): string | null {
  if (!PROGRAM.test(String(o.id)) || String(o.id).indexOf('..') !== -1 || (o.channel !== 'stdout' && o.channel !== 'stderr')) return null;
  const lines = Math.floor(Number(o.lines));
  if (!(lines >= 1)) return null;
  const pairs: Pair[] = [['type', o.channel], ['lines', Math.min(lines, LIMITS.programLines)]];
  if (o.port != null) {
    if (!(Math.floor(o.port) === o.port && o.port >= 1 && o.port <= 65535)) return null;
    pairs.push(['port', o.port]);
  }
  return '/api/v1/daemon/programs/' + o.id + '/logs?' + qs(pairs);
}

/** The AI helper (agent /logs): the window as RFC3339, the search box as `text`, "How it went" as min_level. null for any other source. */
function helperPairs(P: Predicate): Pair[] | null {
  if (P.source !== 'helper') return null;
  const pairs: Pair[] = [['since', iso(P.sinceMs)]];
  if (P.untilMs !== null) pairs.push(['until', iso(P.untilMs)]);
  if (P.search) pairs.push(['text', String(P.search.value)]);
  if (P.severity !== 'all') pairs.push(['min_level', P.severity === 'failed' ? 'error' : 'warn']);
  return pairs;
}
/** One page, newest first; o.before_seq (the oldest seq the last page returned) pages back. */
export function helperPath(P: Predicate, o: { before_seq?: number | null; limit?: number } = {}): string | null {
  const pairs = helperPairs(P);
  if (!pairs) return null;
  if (isId(o.before_seq)) pairs.push(['before_seq', o.before_seq]);
  pairs.push(['limit', clamp(o.limit == null ? LIMITS.pageRows : o.limit, 1, LIMITS.helperPage)]);
  return '/logs?' + qs(pairs);
}
/** The agent's export of P: 8,000 rows at most, txt unless jsonl is asked for. */
export function helperExportPath(P: Predicate, o?: { format?: string }): string | null {
  const pairs = helperPairs(P);
  if (!pairs) return null;
  pairs.push(['limit', LIMITS.helperExportRows], ['format', o && o.format === 'jsonl' ? 'jsonl' : 'txt']);
  return '/logs/export?' + qs(pairs);
}
/** The before_seq for the next older page: the oldest seq this one returned, or null when the page came back short of `limit` (nothing older matches). */
export function helperNext(reply: { entries?: unknown } | null | undefined, limit: number): number | null {
  const list = reply && Array.isArray(reply.entries) ? (reply.entries as Row[]) : [];
  let min: number | null = null;
  for (const e of list) if (e && isId(e.seq) && (min === null || e.seq < min)) min = e.seq;
  return list.length < limit ? null : min;
}

/** Exec POST logs/read for one execution: exec's id rule, lines 1-10,000, 200 by default. exec answers the last `lines` lines. */
export function execReadBody(o: { executionId?: unknown; lines?: number } = {}): { executionId: string; lines: number } | null {
  if (typeof o.executionId !== 'string' || !EXECUTION_ID.test(o.executionId)) return null;
  return { executionId: o.executionId, lines: clamp(o.lines == null ? LIMITS.execReadLines : o.lines, 1, LIMITS.execLines) };
}

export interface ExecOutput { label: 'recent_output'; partial: true; lines: string[]; text: string; returned: number; total: number; more: boolean }
/** The reply as shown: a snapshot, made plain and scrubbed whole with the window-edge rules, then split; always "may be incomplete" (exec cannot say whether the file began earlier). null without a lines list. */
export function execOutput(reply: { lines?: unknown; totalLines?: unknown } | null | undefined): ExecOutput | null {
  if (!reply || !Array.isArray(reply.lines)) return null;
  const got = (reply.lines as unknown[]).map((l) => (l == null ? '' : String(l)));
  const text = got.length ? scrubSnapshot(got.join('\n')) : '';
  const total = isNat(reply.totalLines) && reply.totalLines > got.length ? reply.totalLines : got.length;
  return { label: 'recent_output', partial: true, lines: got.length ? text.split('\n') : [], text, returned: got.length, total, more: total > got.length };
}

// ── error classes ──────────────────────────────────────────────

export interface Problem { code: string; status?: number; notSent?: boolean; pending?: boolean; retryAfterMs?: number }

interface RawError {
  kind?: string; code?: string; status?: number; name?: string; stale?: boolean; notSent?: boolean; pending?: boolean;
  retryAfterMs?: number | null; data?: { errorCode?: string; error?: string } | null;
}

/** A kit rejection is read by its kind; otherwise the seam's codes pass through and raw answers are classed by status. No answer (status 0 / TypeError) is 'blocked' while the computer shows as running, else 'unreachable'; a refused preflight is 'blocked' outright. Other 4xx, redirects and refusals before send are 'failed' with their status, keeping notSent / pending. */
export function problem(err: unknown, o?: { running?: boolean }): Problem {
  const e = (err || {}) as RawError;
  const ra = typeof e.retryAfterMs === 'number' && e.retryAfterMs >= 0 ? e.retryAfterMs : undefined;
  const k = e.kind;
  let code: unknown = e.code || (e.data && (e.data.errorCode || e.data.error));
  const s = e.status, status = typeof s === 'number' ? s : 0;
  if (e.stale || k === 'stale') return { code: 'stale' };
  if (e.name === 'AbortError' || k === 'aborted') return { code: 'aborted' };
  if (k === 'preflight_refused') return { code: 'blocked' };
  if (k === 'unreachable') return { code: o && o.running ? 'blocked' : 'unreachable' };
  if (e.notSent || k === 'not_sent') return { code: 'failed', status, notSent: true };
  if (e.pending || k === 'pending') return { code: 'failed', status, pending: true };
  if (k === 'refused' || k === 'redirected') return { code: 'failed', status };
  if (k !== undefined && own(CODES, k)) code = k;
  if (code === 'audit_quota_exceeded') return { code: 'quota', retryAfterMs: ra };
  if (typeof code === 'string' && own(CODES, code)) return code === 'rate_limited' || code === 'quota' ? { code, retryAfterMs: ra } : { code };
  if (s === 429) return { code: 'rate_limited', retryAfterMs: ra };
  if (s === 401 || s === 403) return { code: 'private' };
  if (s === 400) return { code: 'bad_request' };
  if (s === 502 || s === 503 || s === 504) return { code: 'unavailable' };
  if (s === 0 || e.name === 'TypeError') return { code: o && o.running ? 'blocked' : 'unreachable' };
  return { code: 'failed', status };
}

// ── page overflow ───────────────────────────────────────────────────

export type PageResult<R> = { reply: R; limit: number; skipped?: undefined } | { skipped: true; limit: number; reply?: undefined };

/** fetchPage(limit) -> Promise<reply>. A reply over the byte bound (too_large) is read once more at limit/4 (at least 25); a second overflow skips the page. Resolves {reply, limit} or {skipped: true, limit}; any other refusal rejects unchanged. */
export function readPage<R>(fetchPage: (limit: number) => Promise<R>, limit: number): Promise<PageResult<R>> {
  const big = (e: unknown): boolean => !!e && (e as { code?: string }).code === 'too_large';
  return fetchPage(limit).then((reply): PageResult<R> => ({ reply, limit }), (e: unknown): Promise<PageResult<R>> => {
    if (!big(e)) throw e;
    const smaller = Math.max(LIMITS.minRetryRows, Math.floor(limit / 4));
    if (smaller >= limit) return Promise.resolve({ skipped: true, limit });
    return fetchPage(smaller).then((reply): PageResult<R> => ({ reply, limit: smaller }), (e2: unknown): PageResult<R> => {
      if (big(e2)) return { skipped: true, limit: smaller };
      throw e2;
    });
  });
}

// ── scheduler ───────────────────────────────────────────────────────

const CAP = 10, RATE = 0.5, RESERVE = 3, EXPORT_GAP_MS = 2000, RETRY_MS = 2000;
const PRIO = { list: 0, stats: 1, older: 2, export: 3 } as const;
export type Prio = keyof typeof PRIO;

export interface Clock {
  now(): number;
  setTimeout(f: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}
export function defaultClock(): Clock {
  return {
    now: () => Date.now(),
    setTimeout: (f, ms) => globalThis.setTimeout(f, ms),
    clearTimeout: (id) => globalThis.clearTimeout(id as number),
  };
}

interface Job {
  prio: number; n: number; fn: (signal?: AbortSignal) => unknown; signal?: AbortSignal;
  resolve: (v: unknown) => void; reject: (e: unknown) => void; running: boolean; retried: boolean;
}
interface Bucket {
  tokens: number; at: number; until: number; stopped: { code: 'quota'; retryAfterMs?: number } | null; queue: Job[]; timer: unknown; lastExport: number | null;
}

export interface Scheduler {
  run<T>(key: string, prio: Prio, fn: (signal?: AbortSignal) => Promise<T> | T, opts?: { signal?: AbortSignal }): Promise<T>;
  state(key: string): { tokens: number; queued: number; waitMs: number; stopped: boolean };
  resume(key: string): void;
}

/** run(key, prio, fn, {signal}) -> Promise: fn(signal) runs when the (computer, kit) bucket has a token. key is `<computer>|<kit>`. It rejects with the error class of `problem`; a queued job whose signal aborts rejects {aborted, notSent}. */
export function createScheduler(o?: { clock?: Clock }): Scheduler {
  const clock = (o && o.clock) || defaultClock();
  const buckets: Record<string, Bucket> = Object.create(null);
  let seq = 0;
  function bucket(key: string): Bucket {
    let b = buckets[key];
    if (!b) b = buckets[key] = { tokens: CAP, at: clock.now(), until: 0, stopped: null, queue: [], timer: null, lastExport: null };
    return b;
  }
  function refill(b: Bucket): void {
    const t = clock.now();
    b.tokens = Math.min(CAP, b.tokens + Math.max(0, t - b.at) * RATE / 1000);
    b.at = t;
  }
  function waitFor(b: Bucket, job: Job): number {
    const t = clock.now();
    let w = Math.max(0, b.until - t);
    const need = job.prio === PRIO.export ? 1 + RESERVE : 1;
    if (b.tokens < need) w = Math.max(w, Math.ceil((need - b.tokens) * 1000 / RATE));
    if (job.prio === PRIO.export && b.lastExport !== null) w = Math.max(w, b.lastExport + EXPORT_GAP_MS - t);
    return w;
  }
  function insert(b: Bucket, job: Job): void {
    let i = 0;
    while (i < b.queue.length && ((b.queue[i] as Job).prio < job.prio || ((b.queue[i] as Job).prio === job.prio && (b.queue[i] as Job).n < job.n))) i++;
    b.queue.splice(i, 0, job);
  }
  function pump(key: string): void {
    const b = buckets[key] as Bucket;
    if (b.timer !== null) { clock.clearTimeout(b.timer); b.timer = null; }
    while (b.queue.length) {
      refill(b);
      const job = b.queue[0] as Job, w = waitFor(b, job);
      if (w > 0) { b.timer = clock.setTimeout(() => { b.timer = null; pump(key); }, w); return; }
      b.queue.shift();
      b.tokens -= 1;
      if (job.prio === PRIO.export) b.lastExport = clock.now();
      start(key, b, job);
    }
  }
  function start(key: string, b: Bucket, job: Job): void {
    job.running = true;
    let p: Promise<unknown>;
    try { p = Promise.resolve(job.fn(job.signal)); } catch (e) { p = Promise.reject(e); }
    p.then(job.resolve, (e: unknown) => {
      const c = problem(e);
      if (c.code === 'rate_limited') {
        refill(b);
        b.tokens = 0;
        b.until = clock.now() + (c.retryAfterMs === undefined ? RETRY_MS : c.retryAfterMs);
        if (!job.retried && !(job.signal && job.signal.aborted)) { job.retried = true; job.running = false; insert(b, job); pump(key); return; }
      } else if (c.code === 'quota') {
        stop(b, c);
      }
      if (e && (e as { notSent?: boolean }).notSent) c.notSent = true;
      job.reject(c);
    });
  }
  function stop(b: Bucket, c: Problem): void {
    b.stopped = { code: 'quota', retryAfterMs: c.retryAfterMs };
    const q = b.queue.splice(0);
    if (b.timer !== null) { clock.clearTimeout(b.timer); b.timer = null; }
    for (const j of q) j.reject({ code: 'quota', notSent: true, retryAfterMs: c.retryAfterMs });
  }
  function run<T>(key: string, prio: Prio, fn: (signal?: AbortSignal) => Promise<T> | T, opts?: { signal?: AbortSignal }): Promise<T> {
    const k = String(key), b = bucket(k), sig = opts && opts.signal;
    if (b.stopped) return Promise.reject({ code: 'quota', notSent: true, retryAfterMs: b.stopped.retryAfterMs });
    if (sig && sig.aborted) return Promise.reject({ code: 'aborted', notSent: true });
    return new Promise<T>((resolve, reject) => {
      const job: Job = {
        prio: own(PRIO, prio) ? PRIO[prio] : PRIO.list, n: ++seq, fn, signal: sig,
        resolve: resolve as (v: unknown) => void, reject, running: false, retried: false,
      };
      if (sig && typeof sig.addEventListener === 'function') {
        sig.addEventListener('abort', () => {
          const i = b.queue.indexOf(job);
          if (i !== -1) { b.queue.splice(i, 1); reject({ code: 'aborted', notSent: !job.retried }); pump(k); }
        });
      }
      insert(b, job);
      pump(k);
    });
  }
  function state(key: string): { tokens: number; queued: number; waitMs: number; stopped: boolean } {
    const b = bucket(String(key));
    refill(b);
    return { tokens: Math.floor(b.tokens), queued: b.queue.length, waitMs: Math.max(0, b.until - clock.now()), stopped: !!b.stopped };
  }
  /** The user pressed Retry after a quota stop. */
  function resume(key: string): void { const b = bucket(String(key)); b.stopped = null; b.until = 0; }
  return { run, state, resume };
}

export interface Slot {
  submit<T>(fn: (signal: AbortSignal) => Promise<T> | T): Promise<T>;
  cancel(): void;
}

/** A filter slot: submit(fn) waits delayMs, then runs fn(signal). A newer submit (or cancel) aborts the one before, queued or in flight, and rejects it {code: 'aborted'}. */
export function createSlot(o?: { clock?: Clock; delayMs?: number }): Slot {
  const clock = (o && o.clock) || defaultClock(), delay = o && typeof o.delayMs === 'number' ? o.delayMs : 400;
  interface Cur { ac: AbortController; timer: unknown; reject: (e: unknown) => void }
  let cur: Cur | null = null;
  function end(): void {
    if (!cur) return;
    const c = cur;
    cur = null;
    if (c.timer !== null) clock.clearTimeout(c.timer);
    c.ac.abort();
    c.reject({ code: 'aborted' });
  }
  function submit<T>(fn: (signal: AbortSignal) => Promise<T> | T): Promise<T> {
    end();
    return new Promise<T>((resolve, reject) => {
      const c: Cur = { ac: new AbortController(), timer: null, reject };
      cur = c;
      c.timer = clock.setTimeout(() => {
        c.timer = null;
        let p: Promise<T>;
        try { p = Promise.resolve(fn(c.ac.signal)); } catch (e) { p = Promise.reject(e); }
        p.then((v) => { if (cur === c) { cur = null; resolve(v); } }, (e: unknown) => { if (cur === c) { cur = null; reject(e); } });
      }, delay);
    });
  }
  return { submit, cancel: end };
}

// ── display boundary ───────────────────────────────────────────────

/** Estimated retained size: 2 x the UTF-16 length of every string and key, plus 16 for each value (the containers and numbers around them). */
export function estimateBytes(v: unknown, depth = 0): number {
  if (typeof v === 'string') return 16 + 2 * v.length;
  if (!v || typeof v !== 'object' || depth > 16) return 16;
  let n = 16;
  if (Array.isArray(v)) for (const x of v) n += estimateBytes(x, depth + 1);
  else for (const k in v) if (own(v, k)) n += 2 * k.length + estimateBytes((v as Record<string, unknown>)[k], depth + 1);
  return n;
}

/** Every row the section keeps, groups or shows passes norm first: each string, keys included, is scrubbed whole (stripDeep) before anything cuts it. A row still over rowBytes becomes a bounded placeholder {truncated: true} that keeps its id, time, status and, scrubbed and short, the fields the view filters and labels by. */
export function norm<T>(e: T): T {
  if (!e || typeof e !== 'object') return e;
  const raw = e as Record<string, unknown>;
  const x = S.stripDeep(raw);
  if (estimateBytes(x) <= LIMITS.rowBytes) return x as T;
  const out: Record<string, unknown> = {};
  for (const k of ['id', 'tsMs', 'status']) if (typeof raw[k] === 'number') out[k] = raw[k];
  for (const k of ['level', 'method', 'source', 'kind', 'serviceName']) {
    const v = x[k];
    if (typeof v === 'string' && v.length <= 64) out[k] = v;
  }
  out.truncated = true;
  return out as T;
}
function scrubText(s: unknown): string { return S.strip(String(s == null ? '' : s)); }
/** A program or exec output window: plain text, window-edge rules, the port. */
function scrubSnapshot(s: string): string { return S.stripSnapshot(s); }

// ── history window ────────────────────────────────────────────

export interface WindowAdd { added: number; malformed: number; evicted: { newest: number; oldest: number }; held?: boolean }
export interface WindowState { moreOlder: boolean; moreNewer: boolean; rows: number; bytes: number }
export interface PageMeta { limit?: number; total?: number; anchor?: number | null }

export interface LogWindow {
  reset(entries: unknown, meta?: PageMeta): WindowAdd;
  older(entries: unknown, meta?: PageMeta): WindowAdd;
  newer(entries: unknown, meta?: PageMeta): WindowAdd;
  live(entries: unknown): WindowAdd;
  rows(): Row[];
  beforeId(): number | null;
  afterId(): number | null;
  bytes(): number;
  state(): WindowState;
}

/** Rows newest first by id, each through norm. older() takes a beforeId page, newer() an afterId page, live() rows from the stream. Past maxRows or maxBytes the far end goes (the newest end when reading older, the oldest when reading newer); the anchor row never goes: the incoming end is trimmed instead and stays fetchable (moreOlder / moreNewer). */
export function createWindow(o: { maxRows?: number; maxBytes?: number; sizeOf?: (e: Row) => number } = {}): LogWindow {
  const maxRows = o.maxRows || LIMITS.windowRows, maxBytes = o.maxBytes || LIMITS.windowBytes, sizeOf = o.sizeOf || estimateBytes;
  let rows: Row[] = [], bytes = 0;
  let seen: Record<number, number> = {};
  const more = { older: false, newer: false };
  function take(entries: unknown): { added: Row[]; malformed: number } {
    const added: Row[] = [];
    let malformed = 0;
    for (const raw of Array.isArray(entries) ? (entries as Row[]) : []) {
      if (!raw || !isId(raw.id)) { malformed++; continue; }
      if (own(seen, String(raw.id))) continue;
      const e = norm(raw);
      seen[e.id as number] = sizeOf(e);
      added.push(e);
    }
    return { added, malformed };
  }
  function drop(i: number): void {
    const r = rows.splice(i, 1)[0] as Row;
    bytes -= seen[r.id as number] as number;
    delete seen[r.id as number];
  }
  function settle(far: 'newest' | 'oldest', anchor: number | null | undefined): { newest: number; oldest: number } {
    const ev = { newest: 0, oldest: 0 };
    while (rows.length > maxRows || (bytes > maxBytes && rows.length > 1)) {
      let front = far === 'newest';
      let i = front ? 0 : rows.length - 1;
      if (anchor != null && (rows[i] as Row).id === anchor) {
        front = !front;
        i = front ? 0 : rows.length - 1;
        if ((rows[i] as Row).id === anchor) break;
      }
      drop(i);
      if (front) { ev.newest++; more.newer = true; } else { ev.oldest++; more.older = true; }
    }
    return ev;
  }
  function add(entries: unknown, far: 'newest' | 'oldest', anchor: number | null | undefined): WindowAdd {
    const t = take(entries);
    for (const e of t.added) { rows.push(e); bytes += seen[e.id as number] as number; }
    rows.sort((a, b) => (b.id as number) - (a.id as number));
    return { added: t.added.length, malformed: t.malformed, evicted: settle(far, anchor) };
  }
  function full(entries: unknown, meta?: PageMeta): boolean {
    return (Array.isArray(entries) ? entries.length : 0) >= ((meta && meta.limit) || Infinity);
  }
  return {
    reset(entries, meta) {
      rows = []; seen = {}; bytes = 0;
      more.newer = false;
      more.older = full(entries, meta) || (!!meta && typeof meta.total === 'number' && meta.total > (Array.isArray(entries) ? entries.length : 0));
      return add(entries, 'oldest', null);
    },
    older(entries, meta) {
      more.older = full(entries, meta);
      return add(entries, 'newest', meta && meta.anchor);
    },
    newer(entries, meta) {
      more.newer = full(entries, meta);
      return add(entries, 'oldest', meta && meta.anchor);
    },
    live(entries) {
      if (more.newer) return { added: 0, malformed: 0, held: true, evicted: { newest: 0, oldest: 0 } };
      const r = add(entries, 'oldest', null);
      r.held = false;
      return r;
    },
    rows: () => rows.slice(),
    beforeId: () => (rows.length ? (rows[rows.length - 1] as Row).id as number : null),
    afterId: () => (rows.length ? (rows[0] as Row).id as number : null),
    bytes: () => bytes,
    state: () => ({ moreOlder: more.older, moreNewer: more.newer, rows: rows.length, bytes }),
  };
}

// ── export walk and loss marking ────────────────────────────────────

interface Retention { hours: number; maxRows?: number; maxBytes?: number }
interface KitReply {
  entries?: Row[]; total?: number; newestId?: number | null; retained?: { oldestId?: unknown; oldestTsMs?: unknown } | null; retention?: unknown;
}

function retentionOf(r: KitReply | null | undefined): Retention | null {
  const x = r && (r.retention as Partial<Retention> | undefined);
  return x && typeof x === 'object' && typeof x.hours === 'number' && x.hours > 0 ? { hours: x.hours, maxRows: x.maxRows, maxBytes: x.maxBytes } : null;
}
function sameRetention(a: Retention, b: Retention | null): boolean { return !!b && a.hours === b.hours && a.maxRows === b.maxRows && a.maxBytes === b.maxBytes; }
function retainedOf(r: KitReply | null | undefined): { oldestId: number | null; oldestTsMs: number | null } {
  const x = r && r.retained;
  return { oldestId: x && isNat(x.oldestId) ? x.oldestId : null, oldestTsMs: x && isNat(x.oldestTsMs) ? x.oldestTsMs : null };
}

export type Stop = 'done' | 'cap' | 'too_large' | 'quota' | 'failed' | 'cancelled' | 'needs_update';

/** A refused read as a drain stop: cancelled (aborted, stale), quota, or failed with its class. */
function failStop(e: unknown): [Stop, Problem?] {
  const c = problem(e);
  return c.code === 'aborted' || c.code === 'stale' ? ['cancelled'] : [c.code === 'quota' ? 'quota' : 'failed', c];
}

export interface DrainResult {
  rows: number; newestId: number; gap: boolean; partial: boolean; reasons: string[]; stop: Stop; retentionHours: number | null; error?: Problem;
}

/** o: {P, get(path) -> Promise<reply>, sink(rows) -> false to stop, nowMs, lost?() -> true when the ticket died, maxRows?, pageRows?}. A snapshot read (P, cursorless, limit 1) fixes the watermark newestId and the retention policy; the walk reads ascending afterId pages from sinceMs and drops rows past the watermark. Loss reasons (each sets gap):
 *   a  kept rows the walk had not reached were removed (retained.oldestId past cursor + 1, or the prefix the window starts in was pruned before the first page);
 *   b  the window starts within 15 minutes of the age cutoff, so rows near it can age out mid-walk (age pruning goes by time, not id);
 *   c  the retention policy changed during the walk;
 *   d  the window starts before what the policy keeps;
 *   e  a page stayed over the byte bound at limit/4: the walk stops there, partial, and never skips past it;
 *   f  rows were pruned before the walk began: the oldest kept row is inside the window and is not id 1 (a computer that never pruned stays complete).
 * A page whose scope watermark vanished (the logs API's empty scope: newestId and retained null) or fell below the snapshot's is a clear or a deletion mid-walk: reason a. Rows count once the sink took them; a refusing sink stops the walk (cap). partial is set by every stop but done. */
export function drainKit(o: {
  P: Predicate; get: (path: string | null) => Promise<unknown>; sink: (rows: Row[]) => boolean | void; nowMs: number;
  lost?: () => boolean; maxRows?: number; pageRows?: number;
}): Promise<DrainResult> {
  const P = o.P, maxRows = o.maxRows || LIMITS.exportRows, pageRows = o.pageRows || LIMITS.exportPageRows;
  const reasons: Record<string, 1> = {};
  const res: DrainResult = { rows: 0, newestId: 0, gap: false, partial: false, reasons: [], stop: 'done', retentionHours: null };
  const lost = (): boolean => typeof o.lost === 'function' && o.lost() === true;
  function finish(stop: Stop, err?: Problem): DrainResult {
    res.stop = stop;
    if (err) res.error = err;
    res.reasons = Object.keys(reasons).sort();
    res.gap = res.reasons.length > 0;
    res.partial = stop !== 'done';
    return res;
  }
  const fail = (e: unknown): DrainResult => { const f = failStop(e); return finish(f[0], f[1]); };
  const page = (cursor: Cursor | null, limit: number): Promise<KitReply> => o.get(kitPath(P, cursor, limit)) as Promise<KitReply>;
  if (lost()) return Promise.resolve(finish('cancelled'));
  return readPage((l) => page(null, l), 1).then((snap) => {
    if (snap.skipped) { reasons.e = 1; return finish('too_large'); }
    const r = snap.reply, ret = retentionOf(r);
    // The logs API answers an empty scope with newestId and retained both null; anything else needs both.
    const empty = !!r && r.newestId === null && r.retained === null;
    if (!r || !ret || !(empty || (isId(r.newestId) && r.retained && typeof r.retained === 'object'))) return finish('needs_update');
    res.retentionHours = ret.hours;
    const cutoff = o.nowMs - ret.hours * HOUR;
    if (P.sinceMs < cutoff + AGE_MARGIN_MS) reasons.b = 1;
    if (P.sinceMs < cutoff) reasons.d = 1;
    if (empty) return finish('done');
    res.newestId = r.newestId as number;
    const kept0 = retainedOf(r);
    // (f) Rows were pruned before the export began (row or byte cap, or a clear): ids start at 1, so an oldest
    // kept id past 1 whose time is inside the window means the start may be missing. A computer that never
    // pruned stays complete.
    if (kept0.oldestTsMs !== null && kept0.oldestTsMs > P.sinceMs && (kept0.oldestId as number) > 1) reasons.f = 1;
    // The first page has a known starting point only when the window reaches back to the oldest kept row:
    // then the walk starts at that row and any pruning past it is loss.
    let cursor = 0, real = kept0.oldestId !== null && kept0.oldestTsMs !== null && kept0.oldestTsMs >= P.sinceMs;
    if (real) cursor = Math.max(0, (kept0.oldestId as number) - 1);
    const next = (): Promise<DrainResult> | DrainResult => {
      if (lost()) return finish('cancelled');
      const from = cursor;
      return readPage((l) => page({ afterId: from }, l), pageRows).then((pg) => {
        if (lost()) return finish('cancelled');
        if (pg.skipped) { reasons.e = 1; return finish('too_large'); }
        const rp = pg.reply || ({} as KitReply), entries = Array.isArray(rp.entries) ? rp.entries : [];
        const kept = retainedOf(rp), rt = retentionOf(rp);
        if (!sameRetention(ret, rt)) reasons.c = 1;
        if (rp.newestId === null || rp.retained === null || (isId(rp.newestId) && rp.newestId < res.newestId)) reasons.a = 1;
        if (real && kept.oldestId !== null && kept.oldestId > from + 1) reasons.a = 1;
        if (!real && kept0.oldestTsMs !== null && kept.oldestTsMs !== null && kept.oldestTsMs > P.sinceMs) reasons.a = 1;
        let rows: Row[] = [], end = entries.length < pg.limit;
        for (const e of entries) {
          if (!e || !isId(e.id) || e.id <= from) continue;
          if (e.id > res.newestId) { end = true; continue; }
          rows.push(e);
        }
        const room = maxRows - res.rows, capped = rows.length > room;
        if (capped) rows = rows.slice(0, room);
        if (rows.length) cursor = (rows[rows.length - 1] as Row).id as number;
        real = true;
        const more = rows.length ? o.sink(rows) !== false : true;
        if (!more) return finish('cap');
        res.rows += rows.length;
        if (capped) return finish('cap');
        if (end || cursor >= res.newestId || !rows.length) return finish('done');
        if (res.rows >= maxRows) return finish('cap');
        return next();
      }, fail);
    };
    return next();
  }, fail);
}

export type DoneLine = { line: 'removed' } | { line: 'not_kept'; hours: number | null } | { line: 'pruned' } | { line: 'incomplete'; stop: Stop } | { line: 'complete' };

/** Done lines from a walk result: removed while exporting (a, c, e), not kept (b, d), pruned earlier (f, only when b/d do not already say the start may be missing), then incomplete {stop} for any stop but done, a partial result, or a gap no line names. "complete" only for stop done, not partial, no gap. The plan never states "no earlier activity". */
export function doneLines(res: Pick<DrainResult, 'reasons' | 'stop' | 'partial' | 'gap' | 'retentionHours'> | null | undefined): DoneLine[] {
  const r = (res && res.reasons) || [], out: DoneLine[] = [];
  const has = (k: string): boolean => r.indexOf(k) !== -1;
  if (has('a') || has('c') || has('e')) out.push({ line: 'removed' });
  if (has('b') || has('d')) out.push({ line: 'not_kept', hours: res ? res.retentionHours : null });
  else if (has('f')) out.push({ line: 'pruned' });
  if (!res || res.stop !== 'done' || res.partial || (res.gap && !out.length)) out.push({ line: 'incomplete', stop: (res && res.stop) || 'failed' });
  return out.length ? out : [{ line: 'complete' }];
}

// ── rows ───────────────────────────────────────────────────────────────────

export type RowOutcome = 'failed' | 'problem' | 'ok' | 'neutral';

/** A row's outcome by the same rule its view filters with: status for visits and Everything, level for Bot calls and proxy decisions; Changes are neutral. */
export function outcome(e: Row | null | undefined, source: Source | string): RowOutcome {
  const sev = (SOURCES as Record<string, SourceDef | undefined>)[source]?.sev;
  const r = e || {};
  if (sev === 'level') return r.level === 'error' ? 'failed' : r.level === 'warn' ? 'problem' : 'ok';
  if (sev === 'status' && typeof r.status === 'number') return r.status >= 500 ? 'failed' : r.status >= 400 ? 'problem' : 'ok';
  return 'neutral';
}

export function timeOf(row: Row | null | undefined): number | null {
  if (row && typeof row.tsMs === 'number') return row.tsMs;
  const t = Date.parse(String(row && (row.created_at || row.receivedAt || row.timestamp)));
  return Number.isNaN(t) ? null : t;
}

/** Merge sources newest first by time; equal times keep the order the parts were given in. Rows without a readable time are left out. */
export function merge(groups: { src: string; rows: Row[] }[]): { src: string; row: Row; t: number }[] {
  const all: { src: string; row: Row; t: number; g: number; i: number }[] = [];
  (groups || []).forEach((g, gi) => {
    (g.rows || []).forEach((row, ri) => {
      const t = timeOf(row);
      if (t !== null) all.push({ src: g.src, row, t, g: gi, i: ri });
    });
  });
  all.sort((a, b) => b.t - a.t || a.g - b.g || a.i - b.i);
  return all.map((x) => ({ src: x.src, row: x.row, t: x.t }));
}

export interface PageDrain { rows: number; partial: boolean; stop: Stop; error?: Problem }

/** Changes (offset pages of 500) and account activity (pages of 100) for export, at most 8 pages; a full 8th page stops with partial. Rows are deduplicated by id across pages (offsets shift when new rows land). A refusing sink (sink(rows) === false) stops at once as cap; rows count once the sink took them. */
export function drainPages(o: {
  kind: 'changes' | 'account'; P: Predicate; containerId?: string; get: (path: string | null) => Promise<unknown>; sink: (rows: Row[]) => boolean | void; lost?: () => boolean;
}): Promise<PageDrain> {
  const res: PageDrain = { rows: 0, partial: false, stop: 'done' };
  const seen = new Set<unknown>(), size = o.kind === 'changes' ? LIMITS.changesPage : LIMITS.accountPage;
  const lost = (): boolean => typeof o.lost === 'function' && o.lost() === true;
  function finish(stop: Stop, err?: Problem): PageDrain { res.stop = stop; res.partial = stop !== 'done'; if (err) res.error = err; return res; }
  function step(i: number): Promise<PageDrain> | PageDrain {
    if (lost()) return finish('cancelled');
    if (i === 8) return finish('cap');
    const path = o.kind === 'changes' ? changesPath(o.P, o.containerId as string, { limit: size, offset: i * size }) : accountPath(o.P, { page: i + 1, limit: size });
    return o.get(path).then((r) => {
      if (lost()) return finish('cancelled');
      const wrap = r as { data?: unknown } | null;
      const d = (wrap && wrap.data !== undefined ? wrap.data : r) as unknown;
      const list: Row[] = Array.isArray(d) ? d : d && Array.isArray((d as { events?: Row[] }).events) ? (d as { events: Row[] }).events : [];
      const rows = list.filter((x) => {
        const k = x && x.id;
        if (k == null || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (rows.length && o.sink(rows) === false) return finish('cap');
      res.rows += rows.length;
      return list.length < size ? finish('done') : step(i + 1);
    }, (e: unknown) => { const f = failStop(e); return finish(f[0], f[1]); });
  }
  return Promise.resolve().then(() => step(0));
}

// ── smart features ────────────────────────────────────────────────────

/** A path as a template: digits become :n, hex ids, UUIDs and long mixed tokens :id; the query goes; the whole is scrubbed before its 200-unit cut. */
export function pathTemplate(url: unknown): string {
  return (scrubText(url).split(/[?#]/)[0] as string).split('/').map((g) => (
    /^\d+$/.test(g) ? ':n' : /^[0-9a-f]{8,}$/i.test(g) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(g) || /^(?=.*\d)[A-Za-z0-9_-]{16,}$/.test(g) ? ':id' : g
  )).join('/').slice(0, 200);
}

export interface ProblemGroup { key: string; program: string; method: string; path: string; cls: string; count: number; newest: Row }
export interface Groups { groups: ProblemGroup[]; read: number; total: number; exact: boolean }

/** Problem groups from one read (P + Problems, newest first, limit 1000): program + method + path template + status class, from rows through norm. Exact when the reply's total is no more than the rows read. */
export function groups(reply: KitReply | null | undefined, P: Predicate): Groups {
  const list = reply && Array.isArray(reply.entries) ? reply.entries : [], by: Record<string, ProblemGroup> = Object.create(null), out: ProblemGroup[] = [];
  for (const raw of list) {
    const e = norm(raw), o = outcome(e, P.source);
    if (o !== 'problem' && o !== 'failed') continue;
    const program = e.serviceName || '', method = e.method || '', path = pathTemplate(e.url), cls = typeof e.status === 'number' ? Math.floor(e.status / 100) + 'xx' : o;
    const key = program + ' ' + method + ' ' + path + ' ' + cls;
    let g = by[key];
    if (!g) { g = { key, program, method, path, cls, count: 0, newest: e }; by[key] = g; out.push(g); }
    g.count++;
  }
  out.sort((a, b) => b.count - a.count);
  const total = reply && isNat(reply.total) ? reply.total : list.length;
  return { groups: out, read: list.length, total, exact: total <= list.length };
}

const nat = (v: unknown): number => (isNat(v) ? v : 0);

export interface Bucketed { startMs?: number; byLevel?: Record<string, number>; byStatusClass?: Record<string, number> }

/** Logs API stats buckets -> per-bucket problem and failed counts by the view's rule: status classes (4xx, 5xx) for status sources, levels (warn, error) for level sources. */
export function series(reply: { buckets?: unknown } | null | undefined, P: Predicate): { startMs: number | undefined; failed: number; problems: number }[] {
  const lv = SOURCES[P.source].sev === 'level';
  return (reply && Array.isArray(reply.buckets) ? (reply.buckets as (Bucketed | null)[]) : []).map((b) => {
    const c = (lv ? b && b.byLevel : b && b.byStatusClass) || {}, f = nat(c[lv ? 'error' : '5xx']);
    return { startMs: b ? b.startMs : undefined, failed: f, problems: f + nat(c[lv ? 'warn' : '4xx']) };
  });
}

/** Spike: the newest bucket at or above max(5, 4 x the median of the 12 before it); none with fewer than 13 buckets. */
export function spike(counts: number[]): { index: number; count: number; threshold: number } | null {
  for (let i = counts.length - 1; i >= 12; i--) {
    const prev = counts.slice(i - 12, i).sort((a, b) => a - b), at = Math.max(5, 2 * ((prev[5] as number) + (prev[6] as number)));
    if ((counts[i] as number) >= at) return { index: i, count: counts[i] as number, threshold: at };
  }
  return null;
}

// ── hand-off, links, storage ──────────────────────────────────

const REALM = /^(?:global|[0-9a-f]{24})$/;
/** MODEL: a catalogue spec, provider/model, in the characters the catalogue uses ('@' and '~' in the model part). */
const MODEL = /^[A-Za-z0-9._-]{1,64}\/[A-Za-z0-9._:@~/-]{1,200}$/;
function is(re: RegExp, v: unknown): v is string { return typeof v === 'string' && re.test(v); }
/** Also refuses an empty segment or one that starts with '.', so a spec can never be a path step. */
function modelOk(v: unknown): v is string { return is(MODEL, v) && v.split('/').every((g) => g !== '' && g.charAt(0) !== '.'); }

// Routing values pass only in their real shape (a daemon program's name; hoody-exec's exec id; a run ID of at
// most 64; a script path of at most 10 segments, no '..', no '%', no backslash), untouched by the scrubber and
// holding no secret it knows anywhere (strip also finds the credential formats inside a word): a key or token is
// refused, never sent or kept redacted.
const SHAPE = { program: PROGRAM, execId: /^[a-z0-9]{1,64}$/, executionId: /^[A-Za-z0-9_-]{1,64}$/ };
const SEG = /^[A-Za-z0-9_.[\]()@+~ -]{1,100}$/;
function scriptShape(v: string): boolean {
  const g = v.split('/');
  if (g.length > 1 && g[g.length - 1] === '') g.pop();
  return g.length <= 10 && g.every((x) => SEG.test(x) && x !== '..');
}
export type PlainKind = 'program' | 'script' | 'execId' | 'executionId';
export function plain(v: unknown, kind: PlainKind = 'program'): boolean {
  return typeof v === 'string' && (kind === 'script' ? scriptShape(v) : SHAPE[kind].test(v)) && S.strip(v) === v;
}

export interface HandoffContext { realm: string; computers?: { projectId: string; containerId: string }[] }
export interface ScriptsHandoff {
  source: 'scripts'; computer: { projectId: string; containerId: string }; realm: string; script: string; execId: string;
  severity: Severity; executionId: string | null; window: WindowKey | null;
}
export interface ProgramsHandoff { source: 'programs'; computer: { projectId: string; containerId: string }; realm: string; program: string; port: number | null }
export type Handoff = ScriptsHandoff | ProgramsHandoff | { error: 'reopen' };

const PROG_ID = /^[0-9]{1,10}$/;
const PROG_KEYS: Record<string, 1> = { from: 1, source: 1, computer: 1, realm: 1, program: 1, port: 1 };
const REOPEN = { error: 'reopen' } as const;

interface HandoffState {
  from?: string; source?: string; computer?: { projectId?: unknown; containerId?: unknown }; realm?: unknown; script?: unknown; execId?: unknown;
  executionId?: unknown; status?: unknown; window?: unknown; program?: unknown; port?: unknown;
}

/** Scripts -> Logs and Programs -> Logs. ctx: {realm, computers: [{projectId, containerId}]}. Returns the record (Scripts: the session record), or {error: 'reopen'} ("Open this from Scripts/Programs again"), also when a value is out of shape or holds a secret. */
export function handoff(state: HandoffState | null | undefined, ctx?: HandoffContext | null): Handoff {
  const st = state || {}, cx = ctx || ({} as HandoffContext), c = st.computer || {};
  if (st.from === 'programs') return progHandoff(st, cx, c);
  if (st.source !== 'exec' || st.from !== 'scripts' || !is(CID, c.projectId) || !is(CID, c.containerId) || !is(REALM, st.realm) || st.realm !== cx.realm) return REOPEN;
  if (!scriptOk(st.script) || !plain(st.script, 'script') || !plain(st.execId, 'execId') || (st.executionId != null && !plain(st.executionId, 'executionId'))) return REOPEN;
  if ((st.status != null && st.status !== 'all' && st.status !== 'failed') || (st.window != null && !own(WINDOWS, String(st.window)))) return REOPEN;
  if (!(cx.computers || []).some((x) => x && x.projectId === c.projectId && x.containerId === c.containerId)) return REOPEN;
  return {
    source: 'scripts', computer: { projectId: c.projectId, containerId: c.containerId }, realm: st.realm, script: st.script, execId: st.execId as string,
    severity: st.status === 'failed' ? 'failed' : 'all', executionId: (st.executionId as string | null | undefined) || null, window: (st.window as WindowKey | null | undefined) || null,
  };
}
/** Programs: {from: 'programs', source: 'programs', computer, realm, program: a daemon program id as a decimal string, port?: 1-65535}; a key outside these is refused too. The panel snaps a port outside the program's range. realm is the Hub's own realm, or 'all' only while the Hub itself is on all realms (Programs opened from the all-realms list). */
function progHandoff(st: HandoffState, ctx: HandoffContext, c: { projectId?: unknown; containerId?: unknown }): Handoff {
  for (const k in st) if (own(st, k) && !own(PROG_KEYS, k)) return REOPEN;
  const allRealms = st.realm === 'all' && ctx.realm === 'all';
  if (st.source !== 'programs' || !is(CID, c.projectId) || !is(CID, c.containerId) || (!allRealms && (!is(REALM, st.realm) || st.realm !== ctx.realm))) return REOPEN;
  if (!is(PROG_ID, st.program) || !plain(st.program)) return REOPEN;
  if (st.port != null && !(typeof st.port === 'number' && Math.floor(st.port) === st.port && st.port >= 1 && st.port <= 65535)) return REOPEN;
  if (!(ctx.computers || []).some((x) => x && x.projectId === c.projectId && x.containerId === c.containerId)) return REOPEN;
  return { source: 'programs', computer: { projectId: c.projectId, containerId: c.containerId }, realm: st.realm as string, program: st.program, port: st.port == null ? null : st.port };
}
/** A record read back from this tab's session storage, rebuilt through handoff: every field (both run IDs, realm and computer) is checked again and only the rebuilt record is used; null when anything is out of shape. */
export function restore(rec: Record<string, unknown> | null | undefined, ctx?: HandoffContext | null): ScriptsHandoff | null {
  const r = rec || {};
  const x = r.source === 'scripts'
    ? handoff({ source: 'exec', from: 'scripts', computer: r.computer as HandoffState['computer'], realm: r.realm, script: r.script, execId: r.execId, executionId: r.executionId, status: r.severity, window: r.window }, ctx)
    : null;
  return x && !('error' in x) && x.source === 'scripts' ? x : null;
}
/** While exec keeps no per-script logs: the hand-off record as Visits of exec, with the note that says why. */
export function execFallback(rec: { source?: string; severity?: Severity; window?: string | null } | null | undefined): { view: ViewInput; note: 'scripts_need_update' } | null {
  if (!rec || rec.source !== 'scripts') return null;
  return { view: { source: 'execVisits', severity: rec.severity, window: rec.window || '1h' }, note: 'scripts_need_update' };
}

// Share link: the computer id and enumerated values only (#c=...&s=...&b=...&t=...).
const LINK = { s: ['source', SOURCES], b: ['severity', { problems: 1, failed: 1 }], t: ['window', WINDOWS] } as const;
type LinkKey = keyof typeof LINK;
export interface LinkView { computer?: string; source?: string; severity?: string; window?: WindowSpec | string | null }
export function linkFor(v: LinkView | null | undefined): string {
  const view = (v || {}) as Record<string, unknown>;
  if (!is(CID, view.computer)) return '';
  const pairs: Pair[] = [['c', view.computer]];
  for (const k of Object.keys(LINK) as LinkKey[]) {
    const [field, table] = LINK[k], val = view[field];
    if (typeof val === 'string' && own(table, val)) pairs.push([k, val]);
  }
  return '#' + qs(pairs);
}
export function parseLink(hash: unknown): { computer: string; source?: string; severity?: string; window?: string } | null {
  const out: Record<string, string> = {};
  String(hash || '').replace(/^#/, '').split('&').forEach((p) => {
    const i = p.indexOf('='), k = p.slice(0, i), v = p.slice(i + 1);
    if (k === 'c' && CID.test(v)) out.computer = v;
    else if (own(LINK, k) && own(LINK[k as LinkKey][1], v)) out[LINK[k as LinkKey][0]] = v;
  });
  return out.computer ? (out as { computer: string }) : null;
}

export interface Storable {
  name?: string; source?: Source; severity?: Severity; window?: WindowKey; program?: string; script?: string; status?: { min: number; max: number }; model?: string;
}
/** What hub_logs_v1 may persist: enumerated or shape-checked fields only. Free search text, request IDs and IPs are never kept, nor a program or script path that plain() refuses. */
export function storable(v: Record<string, unknown> | null | undefined): Storable {
  const x = v || {}, out: Storable = {}, st = x.status as { min?: unknown; max?: unknown } | null | undefined;
  if (typeof x.name === 'string' && x.name.length <= 40 && /\S/.test(x.name) && !/[\u0000-\u001f\u007f-\u009f]/.test(x.name)) out.name = x.name;
  if (typeof x.source === 'string' && own(SOURCES, x.source)) out.source = x.source as Source;
  if (typeof x.severity === 'string' && own(SEVERITY, x.severity)) out.severity = x.severity as Severity;
  if (typeof x.window === 'string' && own(WINDOWS, x.window)) out.window = x.window as WindowKey;
  if (plain(x.program)) out.program = x.program as string;
  if (scriptOk(x.script) && plain(x.script, 'script')) out.script = x.script;
  if (st && isNat(st.min) && isNat(st.max) && st.min >= 100 && st.min <= st.max && st.max <= 599) out.status = { min: st.min, max: st.max };
  if (modelOk(x.model)) out.model = x.model;
  return out;
}

/** The kit's logs list answer, as the page reads it. */
export type { KitReply };
