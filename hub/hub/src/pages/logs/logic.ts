// Pure functions of the logs page (no React, no I/O): the view as URL state, what a row says, and the
// summary sentence (outcome, title, meta, techRows, supportLine,
// sentence, error classes). Rows come from the window
// already scrubbed (rules.norm); nothing here reads the network.
import { computerHandle, isStandalone, servedHubUrl } from '@core';
import { matchesSearch } from '@kit';
import { formatNumber } from '@kit/pure';
import * as R from './rules';
import * as X from './export';
import { HubLogsScrub as S } from './scrub';

/** Looks a string up by key; the page passes its `t` (one cast at the edge, see view.tsx). */
export type Tx = (key: string, vars?: Record<string, string | number>) => string;

// ── the view ──────────────────────────────────────────────────────────────────────────

export interface ViewState {
  source: R.Source;
  severity: R.Severity;
  window: R.WindowSpec;
  search: string;
  program: string | null;
  script: string | null;
  chan: 'stdout' | 'stderr';
  port: number | null;
  /** A run to open when its row arrives (Scripts hand-off). */
  exec: string | null;
}

export const DEFAULT_VIEW: ViewState = { source: 'everything', severity: 'all', window: '1h', search: '', program: null, script: null, chan: 'stdout', port: null, exec: null };

/** Sources whose rows come from the computer's logs kit (Live and the problem groups apply). */
export const KIT: Readonly<Record<string, true>> = { everything: true, visits: true, bots: true, decisions: true, execVisits: true };
export const MAIN: readonly R.Source[] = ['everything', 'visits', 'bots', 'changes', 'scripts', 'programs'];
export const MORE: readonly R.Source[] = ['account', 'helper', 'decisions'];

/** The source control's items: the main sources, plus the chosen source when it is not one of them (a More source,
 *  or a hand-off source such as Script visits), so the one selected item is always in the group (
 *  never a highlighted Everything beside another chosen source). */
export function sourceItems(source: R.Source): R.Source[] {
  return MAIN.includes(source) ? [...MAIN] : [...MAIN, source];
}
export const SEVERITIES: readonly R.Severity[] = ['all', 'problems', 'failed'];
export const WINDOW_KEYS: readonly R.WindowKey[] = ['15m', '1h', '24h', '7d'];

export const isKit = (s: string): boolean => KIT[s] === true;
export const sevFor = (src: string): boolean => src !== 'changes' && src !== 'programs';
/** 'text' (address, status, request ID), 'program' (find in the output) or null (search is off). */
export function searchKind(src: string): 'text' | 'program' | null {
  return KIT[src] || src === 'helper' ? 'text' : src === 'programs' ? 'program' : null;
}

/** A view the controller can run: a source that cannot take a severity or search loses it, a program source has no window. */
export function normalizeView(v: ViewState): ViewState {
  const out = { ...v };
  if (!sevFor(out.source)) out.severity = 'all';
  if (!searchKind(out.source)) out.search = '';
  if (out.source !== 'programs') { out.port = null; }
  if (out.source !== 'scripts') { out.script = null; out.exec = null; }
  return out;
}

export function sameView(a: ViewState, b: ViewState): boolean {
  const wa = a.window, wb = b.window;
  const sameWindow = typeof wa === 'string' || typeof wb === 'string' ? wa === wb : wa.around === wb.around;
  return sameWindow && a.source === b.source && a.severity === b.severity && a.search === b.search && a.program === b.program && a.script === b.script && a.chan === b.chan && a.port === b.port && a.exec === b.exec;
}

/** Is any filter off its default (source, how it went, when, search, program, script, channel, port)? A run hand-off
 *  (exec) opens one row once and is not a filter. Clear all shows exactly then. */
export function filtersOff(v: ViewState): boolean {
  return !sameView({ ...v, exec: null }, DEFAULT_VIEW);
}

// The URL: /logs?src=&sev=&win=&at=&q=&program=&port=&chan=&script=&exec=. Only checked values come back.
const SOURCE_PARAM = new Set<string>(R.SOURCE_IDS);
const PARAM_KEYS = ['src', 'sev', 'win', 'at', 'q', 'program', 'computer', 'port', 'chan', 'script', 'exec'] as const;

/** Does the URL name a view at all? A bare /logs is the default view. */
export function hasViewParams(search: Readonly<Record<string, string>>): boolean {
  return PARAM_KEYS.some((k) => search[k] !== undefined);
}

export function viewFromSearch(search: Readonly<Record<string, string>>, base: ViewState = DEFAULT_VIEW): ViewState {
  const v = { ...base };
  if (search.src && SOURCE_PARAM.has(search.src)) v.source = search.src as R.Source;
  if (search.sev && SEVERITIES.includes(search.sev as R.Severity)) v.severity = search.sev as R.Severity;
  if (search.win && WINDOW_KEYS.includes(search.win as R.WindowKey)) v.window = search.win as R.WindowKey;
  if (search.at !== undefined && /^\d{1,16}$/.test(search.at) && R.isNat(Number(search.at))) v.window = { around: Number(search.at) };
  if (search.q !== undefined) v.search = search.q.slice(0, R.LIMITS.searchLen);
  if (R.plain(search.program)) { v.program = search.program as string; if (!search.src) v.source = 'programs'; }
  if (search.port !== undefined && /^\d{1,5}$/.test(search.port) && Number(search.port) >= 1 && Number(search.port) <= 65535) v.port = Number(search.port);
  if (search.chan === 'err') v.chan = 'stderr';
  if (search.script !== undefined && R.scriptOk(search.script) && R.plain(search.script, 'script')) v.script = search.script;
  if (R.plain(search.exec, 'executionId')) v.exec = search.exec as string;
  // A script or a run named without a source is the Scripts source (normalize would otherwise wipe both).
  if (!search.src && (v.script || v.exec) && v.source === base.source) v.source = 'scripts';
  return normalizeView(v);
}

/** The search parameters of a view; defaults are left out so the URL stays short. The search text is never one of
 *  them (what someone typed can hold a secret; it lives in the page's data view, view.q). `share` also leaves out
 *  the run and the port (a link never carries an id). A link's ?q= still opens a search (viewFromSearch); the data view
 *  adopts it and takes it out of the address. */
export function searchFromView(v: ViewState, o: { share?: boolean } = {}): Record<string, string> {
  const out: Record<string, string> = {};
  if (v.source !== 'everything') out.src = v.source;
  if (v.severity !== 'all') out.sev = v.severity;
  if (typeof v.window === 'object') out.at = String(v.window.around);
  else if (v.window !== '1h') out.win = v.window;
  if (v.program && v.source === 'programs') out.program = v.program;
  if (!o.share && v.port !== null) out.port = String(v.port);
  if (v.chan === 'stderr') out.chan = 'err';
  if (v.script) out.script = v.script;
  if (!o.share && v.exec) out.exec = v.exec;
  return out;
}

/** What a copied link carries: the shared view and the computer it shows (its handle), so the link opens that computer's
 *  logs whatever computer the reader had chosen. */
export function shareSearch(v: ViewState, handle: string): Record<string, string> {
  return { ...searchFromView(v, { share: true }), ...(handle ? { computer: handle } : {}) };
}

/** The outer parameters a shared link keeps: the Hub switch and preview, nothing else of the address ("?hub=v3", or ""). */
/** The address a copied view opens: this page with the kept search and the view's route in its hash. The one-file standalone
 *  Hub's own place (another site, a file) holds no Hub, so there it is the served Hub's page; '' while no Hoody is chosen. */
export function shareLink(route: string, at: { origin: string; pathname: string; search: string }): string {
  return isStandalone() ? servedHubUrl(route) : `${at.origin}${at.pathname}${keptSearch(at.search)}#${route}`;
}

export function keptSearch(search: string): string {
  const from = new URLSearchParams(search);
  const out = new URLSearchParams();
  if (from.get('hub') === 'v3') out.set('hub', 'v3');
  if (from.get('preview') === '1') out.set('preview', '1');
  const q = out.toString();
  return q ? `?${q}` : '';
}

export function hrefFor(path: string, params: Readonly<Record<string, string | undefined>>): string {
  const q = Object.keys(params).filter((k) => params[k] !== undefined && params[k] !== '').map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k] as string)).join('&');
  return q ? `${path}?${q}` : path;
}

// ── the rows ──────────────────────────────────────────────────────────────────────────

export type ItemKind = 'kit' | 'changes' | 'account' | 'script' | 'helper';
export interface DataItem {
  kind: ItemKind;
  /** The key in the list and in the URL (?sel=): a kind letter and the row's own id. */
  k: string;
  row: R.Row;
  /** The row's time (ms). */
  t: number;
  /** The real id (a run's id for a script row). */
  id?: string | number;
  /** Arrived live a moment ago. */
  fresh?: boolean;
}
export interface DividerItem { kind: 'div'; k: string; div: 'gap' | 'reset' | 'overflow' | 'day'; t?: number }
export type ListItem = DataItem | DividerItem;

export const isData = (i: ListItem | null | undefined): i is DataItem => !!i && i.kind !== 'div';

export type Outcome = 'failed' | 'problem' | 'ok' | 'neutral' | 'notFound' | 'refused' | 'tooMany' | 'turned';

export function outcomeOf(it: DataItem): Outcome {
  const r = it.row;
  const code = typeof r.status === 'number' ? r.status : typeof r.status_code === 'number' ? r.status_code : null;
  if (it.kind === 'script') return r.outcome === 'failed' ? 'failed' : r.outcome === 'turned_away' ? 'turned' : 'ok';
  if (it.kind === 'helper') return r.level === 'error' ? 'failed' : r.level === 'warn' ? 'problem' : 'neutral';
  if (it.kind === 'changes') return 'neutral';
  if (it.kind === 'kit' && (r.source === 'backend' || r.serviceName === 'bots')) return R.outcome(r, 'bots');
  if (code === null) return 'neutral';
  return code >= 500 ? 'failed' : code === 404 ? 'notFound' : code === 401 || code === 403 ? 'refused' : code === 429 ? 'tooMany' : code >= 400 ? 'problem' : 'ok';
}

export type Tone = 'danger' | 'warn' | 'ok' | 'neutral';
export function toneOf(o: Outcome): Tone {
  return o === 'failed' ? 'danger' : o === 'ok' ? 'ok' : o === 'neutral' ? 'neutral' : 'warn';
}

const VERB: Record<string, string> = { GET: 'opened', HEAD: 'opened', POST: 'sent', PUT: 'changed', PATCH: 'changed', DELETE: 'removed' };
const verb = (m: unknown): string => VERB[String(m)] || 'sent';
/** The verb of a row: what happened, or what was tried when the row did not go well (a failed write may still have changed something, so it is never worded as done). */
const did = (it: DataItem): string => { const o = outcomeOf(it); return (o === 'ok' || o === 'neutral' ? 'verb.' : 'verb.tried.') + verb(it.row.method); };
export function cap(s: unknown): string { const x = String(s || ''); return x.charAt(0).toUpperCase() + x.slice(1); }
const words = (s: unknown): string => String(s || '').replace(/[._]+/g, ' ');
/** Known abbreviations in an event name keep their capitals ("ssh_key.replaced" reads "SSH key replaced"). */
const abbrev = (s: string): string => s.replace(/\b(ssh|api|ip|dns|url|vm|tls|https?|ai|id)\b/gi, (m) => m.toUpperCase());
export function scriptName(p: string): string { const a = String(p).split('/'); return a[a.length - 1] || p; }

/** What happened, in words: "Files: opened", "Bot call: support", "Proxy decision". */
export function titleOf(it: DataItem, t: Tx): string {
  const r = it.row;
  if (r.truncated) return t('row.big');
  if (it.kind === 'changes') return cap(abbrev(words(r.event_type))) || t('src.changes');
  if (it.kind === 'account') return t('row.account') + ': ' + t(did(it));
  if (it.kind === 'script') return scriptName(String(r.path || '')) + ': ' + t('verb.ran');
  if (it.kind === 'helper') return (r.component || r.comp ? cap(r.component || r.comp) + ': ' : '') + String(r.msg || r.message || '').slice(0, 300);
  if (r.source === 'backend') return t('row.decision');
  if (r.serviceName === 'bots') return t('row.bot') + (r.data && typeof r.data.bot_label === 'string' ? ': ' + r.data.bot_label.slice(0, 80) : '');
  return (r.serviceName ? cap(r.serviceName) : t('row.web')) + ': ' + t(did(it));
}

export function durationOf(it: DataItem): number | null {
  const r = it.row;
  return typeof r.durationMs === 'number' ? Math.round(r.durationMs) : null;
}

/** The program a row belongs to, for the Source column ("Visits", "Bots", "Changes"). */
export function sourceOf(it: DataItem): 'visits' | 'bots' | 'decisions' | 'changes' | 'scripts' | 'account' | 'helper' {
  if (it.kind === 'kit') return it.row.source === 'backend' ? 'decisions' : it.row.serviceName === 'bots' ? 'bots' : 'visits';
  return it.kind === 'changes' ? 'changes' : it.kind === 'script' ? 'scripts' : it.kind === 'account' ? 'account' : 'helper';
}

/** Sources whose rows can carry a visitor address: the proxy's visits, Bot calls and decisions, and account activity. */
export function sourceHasVisitor(source: R.Source): boolean {
  return source === 'everything' || source === 'visits' || source === 'bots' || source === 'execVisits' || source === 'decisions' || source === 'account';
}

/** The visitor address a list row shows (screen only: Export asks for addresses itself and Explain never gets them), or '' when the row has none. */
export function visitorOf(it: DataItem): string {
  const r = it.row;
  const ip = it.kind === 'kit' ? r.clientIp : it.kind === 'account' ? r.ip_address || r.ip : null;
  return typeof ip === 'string' ? ip : '';
}

/** The request a proxy visit or an account row records, as the list leads with it. */
export interface Lead { method: string; status: number | null; path: string }

/**
 * The method, status and path of a visit or an account row, or null when the row names no request (Bot calls, proxy
 * decisions, changes, the AI helper, script runs, truncated stubs). The path loses its query string and fragment: they
 * can carry tokens, and the Inspector keeps the whole scrubbed address.
 */
export function leadOf(it: DataItem): Lead | null {
  const r = it.row;
  if (r.truncated) return null;
  let method: unknown, status: unknown, path: unknown;
  if (it.kind === 'kit' && r.source !== 'backend' && r.serviceName !== 'bots') { method = r.method; status = r.status; path = r.url; }
  else if (it.kind === 'account') { method = r.method; status = r.status_code; path = r.path; }
  else return null;
  if (typeof method !== 'string' || !/^[A-Z]{3,7}$/.test(method) || typeof path !== 'string') return null;
  const clean = (path.split(/[?#]/)[0] as string).slice(0, 200);
  return clean ? { method, status: typeof status === 'number' ? status : null, path: clean } : null;
}

/** One technical field: a label key and the value (a short string; nothing nested). */
export interface TechRow { key: string; value: string }

export function techRows(it: DataItem): TechRow[] {
  const r = it.row;
  const out: TechRow[] = [];
  const add = (key: string, v: unknown) => { if (v != null && v !== '' && typeof v !== 'object') out.push({ key, value: String(v).slice(0, 2048) }); };
  add('time', new Date(it.t).toISOString());
  if (it.kind === 'kit') {
    add('address', r.url); add('method', r.method); add('status', r.status); add('request', r.traceId); add('ip', r.clientIp);
    add('program', r.serviceName ? r.serviceName + (r.serviceIndex != null && r.serviceIndex !== '' ? '-' + r.serviceIndex : '') : null); add('level', r.level);
  } else if (it.kind === 'changes') { add('event', r.event_type); add('item', r.resource_id); add('kind', r.resource_type); }
  else if (it.kind === 'account') { add('address', r.path); add('method', r.method); add('status', r.status_code); add('ip', r.ip_address || r.ip); }
  else if (it.kind === 'script') { add('address', r.path); add('method', r.method); add('status', r.status); add('exec', r.executionId); add('error', r.error); }
  else { add('level', r.level); add('part', r.component || r.comp); add('message', r.msg || r.message); }
  return out;
}

/** One fact of a Bot call: `id` marks a 24-hex id the Inspector shows masked (IdChip) and copies whole. */
export interface BotRow extends TechRow { id?: true }

const HEX24 = /^[0-9a-f]{24}$/i;

/**
 * The Bot call facts the Inspector adds for a Bot row: door, caller, Bot URL, result and limit, from the same allowlist
 * of `row.data` keys Export ships (export.ts BOT_FIELDS) and nothing else. Scalars only, scrubbed and cut at 200; a limit
 * object becomes its scope, kind, maximum and retry time as separate facts, never shown as JSON. Empty for any other row.
 */
export function botRows(it: DataItem): BotRow[] {
  const r = it.row;
  if (it.kind !== 'kit' || r.serviceName !== 'bots' || r.source === 'backend') return [];
  const d = r.data || {};
  const out: BotRow[] = [];
  const text = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? S.strip(String(v)).slice(0, 200) : '');
  const add = (key: string, v: unknown) => { const value = text(v); if (value) out.push({ key, value }); };
  add('door', d.bot_door);
  const caller = typeof d.bot_caller === 'string' ? d.bot_caller : '';
  if (typeof d.bot_caller_name === 'string' && d.bot_caller_name) add('caller', d.bot_caller_name);
  else if (HEX24.test(caller)) out.push({ key: 'caller', value: caller, id: true });
  else add('caller', caller);
  add('bot_url', d.bot_exposure);
  add('result', d.bot_result);
  const l = d.bot_limit;
  if (l && typeof l === 'object' && !Array.isArray(l)) {
    const o = l as Record<string, unknown>;
    add('limit_scope', o.scope); add('limit_kind', o.kind); add('limit_max', o.max); add('limit_retry', o.retry_at);
  } else add('limit', l);
  return out;
}

/** The technical fields in the blocks the Inspector shows: the request itself, a Bot call's own facts, then the rest of what the row records. */
export interface TechGroup { id: 'request' | 'bot' | 'details'; rows: BotRow[] }

const REQUEST_KEYS: ReadonlySet<string> = new Set(['time', 'address', 'method', 'status', 'request', 'ip', 'program', 'exec']);

/**
 * techRows split in two (request, details), order kept: every row lands in exactly one of them, and a group with no rows
 * is left out. A Bot row adds its botRows between them; those are shown in the Inspector only (never in the copied support
 * line or Explain).
 */
export function techGroups(it: DataItem): TechGroup[] {
  const rows = techRows(it);
  const groups: TechGroup[] = [
    { id: 'request', rows: rows.filter((r) => REQUEST_KEYS.has(r.key)) },
    { id: 'bot', rows: botRows(it) },
    { id: 'details', rows: rows.filter((r) => !REQUEST_KEYS.has(r.key)) },
  ];
  return groups.filter((g) => g.rows.length > 0);
}

/** The scrubbed one-line text a support request needs: time, outcome, then the raw fields. */
export function supportLine(it: DataItem, t: Tx): string {
  const o = outcomeOf(it);
  const f = [new Date(it.t).toISOString(), titleOf(it, t), o !== 'neutral' ? t('out.' + o) : '', ...(durationOf(it) !== null ? [t('row.ms', { n: String(durationOf(it)) })] : [])];
  for (const p of techRows(it)) f.push(t('det.' + p.key) + '=' + p.value);
  return S.strip(f.filter(Boolean).join(' · '));
}

/** One shown row as an export Entry: what Export writes and Explain reads. Visitor addresses only when asked (Export); Explain never gets them. */
export function entryFor(it: DataItem, o: { ips: boolean; scriptPath?: string | null; t: Tx }): X.Entry {
  const r = it.row;
  if (it.kind === 'kit') return r.serviceName === 'bots' ? X.map.bot(r, { ips: o.ips }) : X.map.visit(r, { ips: o.ips, program: () => cap(r.serviceName) || o.t('row.web') });
  if (it.kind === 'changes') return X.map.change(r, { sentence: (x) => cap(words(x.event_type)) });
  if (it.kind === 'account') return X.map.account(r);
  if (it.kind === 'script') return X.map.script(r, { scriptPath: o.scriptPath || undefined });
  return { seq: r.seq, time: String(r.time || ''), level: String(r.level || ''), source: 'agent', comp: (r.component || r.comp) as string | undefined, message: String(r.msg || r.message || '') };
}

// ── the sentence ──────────────────────────────────────────────────────────────────────

export interface StatsView { total: number; failed: number; problems: number; retention?: unknown }

export function noun(src: string, n: number, t: Tx): string {
  return t('noun.' + (src === 'programs' ? 'everything' : src), { count: n });
}

function whenOf(w: R.WindowSpec, t: Tx, clock: (ms: number) => string): string {
  return typeof w === 'object' ? t('when.around', { time: clock(w.around) }) : t('when.' + w);
}

/** The header's one-line answer: how many, of what, when, and how many kinds of problem. */
export function sentence(o: {
  v: ViewState; err: boolean; loading: boolean; stats: StatsView | null; kinds: number | null; rows: number; moreRows: boolean; t: Tx; clock: (ms: number) => string;
  /** A narrowing the view state does not hold (a computer, program or script chip). */
  narrowed?: boolean;
}): string {
  const { v, t } = o;
  const src = v.source, w = whenOf(v.window, t, o.clock);
  const num = formatNumber;
  // A search or a filter with no match does not say nothing happened: only that nothing matches.
  const none = v.search !== '' || v.severity !== 'all' || o.narrowed ? 'sum.noneMatching' : 'sum.none';
  if (src === 'programs') return t('prog.title');
  // A failed read that still shows rows (kept from before, or another source's) says only part could be read.
  if (o.err) return t(o.rows ? 'sum.errSome' : 'sum.err');
  if (o.loading && !o.stats) return t('st.loading');
  if (o.stats) {
    const x = o.stats, kinds = o.kinds ? ' ' + t('kinds', { count: o.kinds, n: num(o.kinds) }) : '';
    if (!x.total) return t(none, { what: noun(src, 2, t), when: w });
    if (x.failed) return t('sum.failed', { count: num(x.failed), what: noun(src, x.failed, t), when: w }) + kinds;
    if (x.problems) return t('sum.problems', { count: num(x.total), what: noun(src, x.total, t), when: w, problems: num(x.problems) });
    return t('sum.good', { count: num(x.total), what: noun(src, x.total, t), when: w });
  }
  if (!o.rows) return t(none, { what: noun(src, 2, t), when: w });
  return t('sum.rows', { count: num(o.rows) + (o.moreRows ? '+' : ''), what: noun(src, o.moreRows ? 2 : o.rows, t), when: w });
}

/** Live narrows what it shows (search, a severity on a status source, an around window): the note says so. */
export function liveFiltered(v: ViewState): boolean {
  return !!(v.search || (v.severity !== 'all' && v.source !== 'bots' && v.source !== 'decisions') || typeof v.window === 'object');
}

// ── errors ────────────────────────────────────────────────────────────────────────────

/** The class of a refusal and the words that describe it; `fix` is what the page offers beside it. */
export type ErrCode = 'stopped' | 'offline' | 'tooLong' | 'update' | 'private' | 'blocked' | 'noPrograms' | 'scriptPick' | 'scriptUpdate'
  | 'rate_limited' | 'quota' | 'unavailable' | 'unreachable' | 'failed' | 'servedOnly';
export interface ErrState { code: ErrCode; retryAfterMs?: number; /** servedOnly: the served Hub's route that shows the same records (servedRoute). */ route?: string }

export function errKey(code: ErrCode): string {
  const k: Record<string, string> = { rate_limited: 'rate', quota: 'quota', unavailable: 'unavailable', unreachable: 'unreachable' };
  return 'st.' + (k[code] || (code === 'private' || code === 'blocked' || code === 'stopped' || code === 'noPrograms' || code === 'offline' || code === 'tooLong' || code === 'update' || code === 'servedOnly' ? code : 'failed'));
}

/** On the one-file Hub opened from a file (its requests carry `Origin: null`), a logs-service read the browser could
 *  not complete is the hand-off to the served Hub, never "could not reach": the same read answers there. Decided by
 *  the read failing, so a logs service that answers such a page shows its rows here. Every other failure, and every
 *  source read from the computer's programs, the Agent or the API, keeps its own words. The caller passes only a
 *  failed read OF the logs service (a Changes read beside Everything is the API's and keeps its own failure). */
export function servedOnlyOf(c: ErrState, source: string, fileOrigin: boolean, route = '/logs'): ErrState {
  return fileOrigin && isKit(source) && c.code === 'blocked' ? { code: 'servedOnly', route } : c;
}

/** The served Hub's Logs route for a view on a computer: the computer's handle and the view's parameters
 *  (searchFromView: never the search text), so the hand-off opens the same records on the same computer there. */
export function servedRoute(v: ViewState, computer: { id: string; name: string }): string {
  return hrefFor('/logs', { computer: computerHandle(computer), ...searchFromView(v) });
}

/** What a failed read becomes on screen, or null to say nothing (aborted, stale). */
export function errOf(e: unknown, running: boolean): ErrState | null {
  let c = R.problem(e, { running });
  if (c.code === 'aborted' || c.code === 'stale') return null;
  // The scheduler rejects with a problem already classed without the running state.
  if (c.code === 'unreachable' && running) c = { code: 'blocked' };
  if (c.code === 'bad_request') return { code: 'update' };
  const known: ErrCode[] = ['rate_limited', 'quota', 'unavailable', 'unreachable', 'private', 'blocked'];
  const code: ErrCode = (known as string[]).includes(c.code) ? (c.code as ErrCode) : 'failed';
  return c.retryAfterMs !== undefined ? { code, retryAfterMs: c.retryAfterMs } : { code };
}

/** "in 2 minutes" for a Retry-After. */
export function waitText(ms: number | undefined, t: Tx): string {
  if (ms === undefined) return '';
  const s = Math.max(1, Math.ceil(ms / 1000));
  return s < 90 ? t('wait.seconds', { count: s, n: String(s) }) : t('wait.minutes', { count: Math.ceil(s / 60), n: String(Math.ceil(s / 60)) });
}

/** The lines of a program's output that hold `q` (a plain, case-insensitive substring); all of them without one. */
export function findLines(lines: readonly string[], q: string): string[] {
  return lines.filter((x) => matchesSearch([x], q));
}
