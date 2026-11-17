// Pure rules of the schedules page: presets, labels, masking, the per-source row adapters, the merged
// list and the summary. No DOM, no network. Words leave as keys ({k, ...}); words.ts turns them into text.
// Listed next runs are the kit's; the editor's preview of a cron expression is computed here (nextRuns).
import { stringOrEmpty as str } from '@core';
import { cleanAgentText, shownText } from '@kit';
import { cronRecognise as recognise, cronToExpr as toExpr, type CronKit as Kit, type CronPreset as Preset } from '@kit/pure';
import { routeName, toHandoff } from '../scripts/links';

// ── Raw shapes (what the kits answer; only the fields read here) ─────────────────────────────

export interface RawCronEntry {
  user: string;
  id: string;
  name?: string | null;
  command?: string;
  schedule: string;
  schedule_human?: string;
  enabled?: boolean;
  expired?: boolean;
  tz_override?: boolean;
  warnings?: string[];
  next_runs?: string[];
  run_reports?: boolean;
  revision?: string;
  last_run?: RawCronRun | null;
}
export interface RawCronRun {
  run_id: string;
  status: 'running' | 'finished' | 'lost';
  started_at: string;
  finished_at?: string;
  exit_code?: number;
}
export interface RawHandLine {
  user: string;
  line: number;
  schedule: string;
  schedule_human?: string;
  command: string;
}
export interface RawExec {
  scriptRel: string;
  /** The path trigger and history send; only a listed one is ever sent. */
  scriptPath?: string;
  expression: string;
  enabled?: boolean;
  nextFire?: string | number | null;
  lastFireAt?: string | number | null;
  lastFireStatus?: string | null;
}
export interface RawCurl {
  id: string;
  name?: string;
  cron: string;
  enabled?: boolean;
  next_run?: string | number | null;
  last_run?: string | number | null;
  last_status?: string;
  request: { url?: string; method?: string };
}
export interface RawLoop {
  id: string;
  session_id: string;
  session_title?: string;
  interval_ms: number;
  state: string;
  run_count?: number;
  stop_reason?: string;
  last_error?: string;
  last_run_at?: string | number | null;
  next_run_at?: string | number | null;
  last_fire?: { outcome: string; started_at?: string; ended_at?: string } | null;
}

/** How a source answered. `ok` is the only state that lists rows. */
export type SourceState = 'ok' | 'private' | 'old' | 'failed' | 'down' | 'off' | 'stopped' | 'signed_out' | 'not_checked' | 'absent';

export interface Source<T> {
  state: SourceState;
  /** Every row was read (not cut by a page limit or a missing user). */
  complete: boolean;
  items: T[];
}
export interface RawSchedules {
  /** Fetch time, epoch ms. */
  now: number;
  /** The computer's own offset from UTC in seconds, when known. */
  utcOffset: number | null;
  cron: Source<RawCronEntry> & { hand: RawHandLine[]; caps: Caps };
  exec: Source<RawExec>;
  curl: Source<RawCurl>;
  loop: Source<RawLoop> & { caps: Caps };
  programsRunning: number;
  /** The computer these were read from (stamped by the loader). */
  computer?: string;
}
export interface Caps {
  runs?: boolean;
  run_now?: boolean;
  loop_receipts?: boolean;
  loop_list_titles?: boolean;
  trigger_receipts?: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────────────

const M = 60000;
const H = 3600000;
const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** RFC 3339 text or epoch ms to epoch ms; null when it is neither. */
export function ms(v: unknown): number | null {
  const t = typeof v === 'string' ? Date.parse(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(t) ? t : null;
}

// ── Presets and the preview: kit/cron.ts through @kit/pure, re-exported under the names
// this page has always used ──

export { CRON_EVERY as EVERY, cronNextRuns as nextRuns, cronRecognise as recognise, cronToExpr as toExpr, type CronField, type CronKit as Kit, type CronPreset as Preset, type CronPreview as Preview } from '@kit/pure';

// ── Names and masking ───────────────────────────────────────────────────────────────────

const TIMER = /^hoody-timer-([a-z0-9][a-z0-9-]{0,31})$/;
const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;

export const timerName = (name: unknown): string | null => TIMER.exec(str(name))?.[1] ?? null;

export type Label = { k: 'timer'; name: string } | { k: 'name'; name: string } | { k: 'cmd'; name: string } | { k: 'unnamed' } | { k: 'script'; name: string } | { k: 'web'; method: string; host: string } | { k: 'loop'; every: number };

/** A command's label: the timer name, its own name, else the basename of its first plain word. Never more. */
export function label(name: unknown, command: unknown): Label {
  const t = timerName(name);
  const n = str(name).trim();
  if (t) return { k: 'timer', name: t };
  if (n) return { k: 'name', name: n };
  for (const w of str(command).trim().split(/\s+/)) {
    if (ASSIGN.test(w)) continue;
    const b = /[:@$'"`=]/.test(w) ? '' : w.replace(/^.*\//, '');
    return /^[A-Za-z0-9._+-]{1,40}$/.test(b) ? { k: 'cmd', name: b } : { k: 'unnamed' };
  }
  return { k: 'unnamed' };
}

const DOTS = '••••';
// A value stops at a control: masking as written must never cut an escape in two (what it left of the value, the readings below take).
// A control in a value costs that output its colours, nothing else.
const CTRL = String.raw`\u0000-\u0008\u000e-\u001f\u007f-\u009f`;
const VAL = `("[^"${CTRL}]*"|'[^'${CTRL}]*'|[^\\s'"&;|${CTRL}]+)`;
const MASKS: [RegExp, string][] = [
  // From each `://`, not from each letter: a start per letter was quadratic (80k characters of hex took 6 s, and it froze the tab).
  [new RegExp(`(?<=[a-z0-9+.-]://)[^\\s/@'"${CTRL}]+@`, 'gi'), `${DOTS}@`],
  // A value is never exactly the scheme word: when the token after it starts with an escape, the value stops there, and masking the
  // scheme instead would leave the token for no reading to find. Only the whole word, where a value would end: a value
  // that merely starts with one (token-abc123, Basic-dXNl…, basic:abc) is masked.
  [new RegExp(`\\b((?:proxy-)?authorization|x-api-key|api[-_]key)(\\s*[:=]\\s*)((?:bearer|basic|token)\\s+)?(?!(?:bearer|basic|token)(?:[\\s'"&;|${CTRL}]|$))${VAL}`, 'gi'), `$1$2$3${DOTS}`],
  [new RegExp(`\\b(bearer)\\s+[^\\s'"${CTRL}]+`, 'gi'), `$1 ${DOTS}`],
  [new RegExp(`\\b((?:access_)?token|password|passwd|secret|api[-_]?key)=${VAL}`, 'gi'), `$1=${DOTS}`],
  [new RegExp(`(--(?:password|passwd|token|secret|api[-_]key))(=|\\s+)${VAL}`, 'gi'), `$1$2${DOTS}`],
  [new RegExp(`(^|[\\s;&|(])([A-Z_][A-Z0-9_]*)=${VAL}`, 'g'), `$1$2=${DOTS}`],
];

function applyMasks(text: string): string {
  let s = text;
  for (const [re, to] of MASKS) s = s.replace(re, to);
  return s;
}

// The two readings this text is checked as: CodeBlock's terminal reading, and the cleaner's. It is also shown raw (Detail's command
// block and copy, the fail line), where an escape is invisible and nothing reads it: a value with an escape right before one of its
// characters, which no reading masks, shows there. Accepted as best effort.
const READINGS: ReadonlyArray<(s: string) => string> = [shownText, (s) => shownText(cleanAgentText(s).text)];
// A reader takes a control out and the word break with it: `note\u0007password=` reads as one word, where no name can start. So the text
// is also read with a mark before each control: the readers keep it, it breaks a word, and a value reads across it. Before the lone
// controls only, a name an escape splits stays whole; before every control, a name right after an escape gets its break. BEL stays
// where it is: it ends a title sequence.
const BREAK = '\ufffc';
const LONE = new RegExp(`[\u0000-\u0008\u000e-\u001a\u001c-\u001f\u007f]`, 'g');
const ANY = new RegExp(`[${CTRL}]`, 'g');
const PASSES: ReadonlyArray<(s: string) => string> = [(s) => s, (s) => s.replace(LONE, `${BREAK}$&`), (s) => s.replace(ANY, `${BREAK}$&`)];

/** Best effort (the screen says so): shown only behind Advanced, never in a row, toast or URL. The masks read the text as written,
 *  then as each reader shows it, so an escape or invisible character inside a name cannot hide its value. Output with nothing more
 *  to mask keeps its bytes and colours; output that had is shown as that reading, without them. */
export function mask(text: unknown): string {
  const written = applyMasks(str(text));
  for (const read of READINGS) {
    for (const pass of PASSES) {
      const seen = read(pass(written));
      const masked = applyMasks(seen).replaceAll(BREAK, '');
      if (masked !== seen.replaceAll(BREAK, '')) return masked;
    }
  }
  return written;
}

/** A web request is named by method and host only: never userinfo, path, query or headers. */
export function curlTarget(req: { url?: string; method?: string } | undefined): { method: string; host: string } {
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/?#@]*@)?([^/?#:]+|\[[^\]]+\])/i.exec(str(req?.url));
  const meth = str(req?.method).toUpperCase() || 'GET';
  return { method: /^[A-Z]{1,10}$/.test(meth) ? meth : 'GET', host: m?.[1]?.toLowerCase() ?? '' };
}

// ── Rows ────────────────────────────────────────────────────────────────────────────────

export type SrcKind = 'timer' | 'cron' | 'raw' | 'exec' | 'curl' | 'loop';
export type KindFilter = 'commands' | 'scripts' | 'web' | 'loops';

export type Next = { at: number } | { k: 'paused' | 'expired' | 'reboot' | 'tz' | 'never' | 'needs' | 'none' | 'off' | 'unknown' | 'scheduled' | 'running' | 'error' | 'ended' | 'stopped' };
export interface Last {
  k: string;
  at?: number | null;
  n?: number | null;
  why?: string | undefined;
}
export interface Can {
  pause?: boolean;
  edit?: boolean;
  del?: boolean;
  run?: boolean;
  history?: boolean;
  change?: boolean;
  open?: boolean;
}
export interface SchedRow {
  src: SrcKind;
  kind: KindFilter;
  key: string;
  label: Label;
  /** Expression kept for the tooltip and Advanced; words come from preset. */
  sched: { expr?: string; human?: string; zone?: 'system' | 'utc'; preset?: Preset; every?: number };
  next: Next;
  /** The kit's next runs (up to five); empty when it gives none. */
  upcoming: number[];
  last: Last;
  paused: boolean;
  attention: boolean;
  can: Can;
  /** Why Run now is missing, as a words key suffix. */
  runWhy?: string;
  /** A loop's state word. */
  state?: { k: string; n?: number | undefined; why?: string | null };
  /** Loop run needs a confirm: resume or once. */
  confirm?: 'resume' | 'once' | undefined;
  /** What a write needs to name the entry. */
  ref: Record<string, string | number | null | undefined>;
}

function base(src: SrcKind, kind: KindFilter, id: string, lab: Label, extra: Partial<SchedRow>): SchedRow {
  return { src, kind, key: `${src}:${id}`, label: lab, sched: {}, next: { k: 'unknown' }, upcoming: [], last: { k: 'unknown' }, paused: false, attention: false, can: {}, ref: {}, ...extra };
}

const lastRun = (rs: RawCronRun[]): RawCronRun | null => rs.find((r) => r.status !== 'running') ?? null;

export interface CronCtx {
  runs: RawCronRun[];
  caps: Caps;
}

/** Commands and agent timers. Timers never read Worked and offer no Run now and no Edit. */
function cronRow(e: RawCronEntry, c: CronCtx): SchedRow {
  const timer = timerName(e.name) !== null;
  const runs = e.last_run && !c.runs.some((x) => x.run_id === e.last_run?.run_id) ? [...c.runs, e.last_run] : c.runs;
  const caps = c.caps;
  const r = base(timer ? 'timer' : 'cron', 'commands', `${e.user}/${e.id}`, label(e.name, e.command), {
    sched: { expr: str(e.schedule), human: str(e.schedule_human), zone: 'system', preset: recognise('cron', e.schedule) },
    ref: { user: e.user, entry: e.id, revision: typeof e.revision === 'string' ? e.revision : null },
  });
  const running = runs.filter((x) => x.status === 'running').length;
  const lr = lastRun(runs);
  if (e.run_reports === false) r.last = { k: 'no_reports' };
  else if (!caps.runs) r.last = { k: 'needs_cron' };
  else if (running) r.last = { k: 'running', n: running };
  else if (lr?.status === 'lost') r.last = { k: 'lost', at: ms(lr.started_at) };
  else if (lr) r.last = lr.exit_code === 0 ? { k: timer ? 'chat' : 'worked', at: ms(lr.finished_at) } : { k: 'failed', n: lr.exit_code ?? null, at: ms(lr.finished_at) };
  else r.last = { k: 'none_since' };
  const nx = e.next_runs;
  const first = ms(nx?.[0]);
  r.next = e.enabled === false ? { k: 'paused' }
    : e.expired ? { k: 'expired' }
    : e.schedule === '@reboot' ? { k: 'reboot' }
    : e.tz_override ? { k: 'tz' }
    : e.warnings?.length ? { k: 'never' }
    : nx === undefined ? { k: 'needs' }
    : first !== null ? { at: first }
    : { k: 'none' };
  r.upcoming = e.enabled === false ? [] : (nx ?? []).flatMap((x) => ms(x) ?? []).slice(0, 5);
  r.paused = e.enabled === false;
  r.attention = ['failed', 'lost'].includes(r.last.k);
  r.can = { pause: true, del: true, history: true, edit: !timer, run: !timer && !!caps.run_now && e.enabled !== false && !e.expired };
  if (!timer && !caps.run_now) r.runWhy = 'needs_cron';
  return r;
}

/** A hand-written crontab line the kit parsed: read-only, no results. */
export function rawRow(j: RawHandLine, i: number): SchedRow {
  return base('raw', 'commands', `${str(j.user)}/raw${j.line > 0 ? j.line : i}`, label(null, j.command), {
    sched: { expr: str(j.schedule), human: str(j.schedule_human), zone: 'system', preset: recognise('cron', j.schedule) },
    next: { k: 'unknown' },
    last: { k: 'no_reports' },
  });
}

const EXEC_LAST: Record<string, string> = { ok: 'worked', error: 'failed', timeout: 'timeout', disabled: 'skipped', skipped_overload: 'skipped', load_error: 'load_error', incompatible: 'incompatible' };
// A dynamic or catch-all script is named as the Scripts page names it, never by its bracket file name (`[id]`).
const scriptName = (p: string): string => routeName(p) ?? p.replace(/^.*\//, '').replace(/\.(?:ts|js)$/, '');

/** Scripts (exec @schedule): no switch, no Delete; Run now runs it the way its timer does. */
export function execRow(s: RawExec): SchedRow {
  const rel = str(s.scriptRel);
  const st = s.lastFireStatus;
  const k = st == null ? 'not_yet' : own(EXEC_LAST, st) ? (EXEC_LAST[st] ?? 'problem') : 'problem';
  const next = ms(s.nextFire);
  const r = base('exec', 'scripts', rel, { k: 'script', name: scriptName(rel) }, {
    sched: { expr: str(s.expression), zone: 'utc', preset: recognise('exec', s.expression) },
    next: s.enabled === false ? { k: 'off' } : next !== null ? { at: next } : { k: 'none' },
    last: { k, at: ms(s.lastFireAt), why: st === 'disabled' ? 'off' : st === 'skipped_overload' ? 'busy' : undefined },
    ref: { script: rel, handoff: toHandoff(rel), path: typeof s.scriptPath === 'string' ? s.scriptPath : null },
  });
  r.attention = k === 'failed' || k === 'timeout' || k === 'load_error';
  r.can = { run: true, history: true, change: true };
  return r;
}

const CURL_LAST: Record<string, string> = { completed: 'worked', failed: 'failed', running: 'running', pending: 'running' };

/** Web requests: last_run is when a job was submitted, never a result, unless the kit gives last_status. */
function curlRow(j: RawCurl): SchedRow {
  const t = curlTarget(j.request);
  const n = str(j.name).trim();
  const at = ms(j.last_run);
  const next = ms(j.next_run);
  const ls = j.last_status;
  const r = base('curl', 'web', j.id, n ? { k: 'name', name: n } : { k: 'web', method: t.method, host: t.host }, {
    sched: { expr: str(j.cron), zone: 'utc', preset: recognise('curl', j.cron) },
    next: j.enabled === false ? { k: 'paused' } : next !== null ? { at: next } : { k: 'none' },
    last: ls !== undefined && own(CURL_LAST, ls) ? { k: CURL_LAST[ls] ?? 'unknown', at } : at !== null ? { k: 'started', at } : { k: 'not_started' },
    ref: { job: j.id },
  });
  r.paused = j.enabled === false;
  r.attention = r.last.k === 'failed';
  r.can = { pause: true, edit: true, del: true, history: ls !== undefined };
  return r;
}

const STOP: Record<string, string> = { stop_when: 'met', max_cost_usd: 'cost', max_wall_clock_ms: 'time', predicate_error: 'check' };
const LSTATE: Record<string, string> = { running: 'scheduled', firing: 'running', error: 'error', ended: 'ended', stopped: 'stopped', paused: 'paused', expired: 'expired' };
const LOOP_OUT: Record<string, string> = { ok: 'worked', error: 'failed', skipped: 'skipped' };
const LOOP_ERR = /^(?:loop turn reported an error|auto-paused after \d+ consecutive errors)$/;

/** Agent loops: state, last result and next run are three separate facts, never derived from the prompt. */
export function loopRow(l: RawLoop, c: { caps: Caps; now: number }): SchedRow {
  const caps = c.caps;
  const st = str(l.state);
  const s: NonNullable<SchedRow['state']> = { k: own(LSTATE, st) ? (LSTATE[st] ?? 'unknown') : 'unknown' };
  if (st === 'ended') s.n = l.run_count;
  if (st === 'stopped') s.why = (l.stop_reason && STOP[l.stop_reason]) || null;
  const lf = l.last_fire;
  const le = str(l.last_error);
  let last: Last;
  if (caps.loop_receipts) last = { k: (lf && LOOP_OUT[lf.outcome]) || 'not_yet', at: lf ? (ms(lf.ended_at) ?? ms(lf.started_at)) : null };
  else if (LOOP_ERR.test(le)) last = { k: 'failed', at: ms(l.last_run_at) };
  else if (le.startsWith('skipped: ')) last = { k: 'skipped' };
  else if (le) last = { k: 'problem' };
  else last = ms(l.last_run_at) !== null ? { k: 'ended_at', at: ms(l.last_run_at) } : { k: 'not_yet' };
  const title = caps.loop_list_titles ? str(l.session_title).trim() : '';
  const na = ms(l.next_run_at);
  const r = base('loop', 'loops', `${str(l.session_id)}/${str(l.id)}`, title ? { k: 'name', name: title } : { k: 'loop', every: l.interval_ms }, {
    state: s,
    last,
    next: s.k !== 'scheduled' ? ({ k: s.k } as Next) : na !== null ? { at: na } : { k: 'none' },
    sched: { every: l.interval_ms },
    ref: { sid: str(l.session_id), loop: str(l.id) },
  });
  const ended = ['ended', 'expired', 'stopped'].includes(st);
  const ok = /^loop_[0-9a-f]{8}$/.test(str(l.id));
  r.paused = st === 'paused' || st === 'error';
  r.attention = st === 'error' || last.k === 'failed';
  const go = ok && !ended && s.k !== 'unknown';
  r.can = { run: go, pause: go, del: ok, open: true };
  if (ended) r.runWhy = st;
  r.confirm = st === 'error' ? 'resume' : st === 'paused' ? 'once' : undefined;
  return r;
}

// ── List and summary ────────────────────────────────────────────────────────────────────

const nameOf = (r: SchedRow): string => ('name' in r.label ? r.label.name : 'host' in r.label ? r.label.host : '');

/** One list sorted by next run (rows with a time first), then name, then key. */
export function merge(rows: readonly SchedRow[]): SchedRow[] {
  const at = (r: SchedRow): number | null => ('at' in r.next ? r.next.at : null);
  return [...rows].sort((a, b) => {
    const x = at(a);
    const y = at(b);
    if ((x !== null) !== (y !== null)) return x !== null ? -1 : 1;
    if (x !== null && y !== null && x !== y) return x - y;
    return nameOf(a).localeCompare(nameOf(b)) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  });
}

export type SourceKey = 'cron' | 'exec' | 'curl' | 'loop';
export const SOURCE_KEYS: readonly SourceKey[] = ['cron', 'exec', 'curl', 'loop'];

export interface Model {
  rows: SchedRow[];
  /** Per source: how it answered. */
  sources: Record<SourceKey, { state: SourceState; complete: boolean; count: number }>;
  total: number;
  /** Some source did not answer completely: every count is "at least". */
  atLeast: boolean;
  unchecked: SourceKey[];
  next: SchedRow | null;
  failedToday: number;
  programsRunning: number;
  /** Rows the kit parsed but cannot be edited here. */
  empty: boolean;
}

/** Builds the merged model from the raw sources. Rows of a source that did not answer are absent. */
export function model(raw: RawSchedules): Model {
  const { now } = raw;
  const rows: SchedRow[] = [];
  const cronRows = raw.cron.items.map((e) => cronRow(e, { runs: [], caps: raw.cron.caps }));
  rows.push(...cronRows, ...raw.cron.hand.map(rawRow));
  rows.push(...raw.exec.items.map(execRow));
  rows.push(...raw.curl.items.map(curlRow));
  rows.push(...raw.loop.items.map((l) => loopRow(l, { caps: raw.loop.caps, now })));
  for (const r of rows) if (!r.upcoming.length && 'at' in r.next) r.upcoming = [r.next.at];
  const merged = merge(rows);
  if (raw.computer) for (const r of merged) r.ref = { ...r.ref, computer: raw.computer };
  const sources = {} as Model['sources'];
  const unchecked: SourceKey[] = [];
  for (const k of SOURCE_KEYS) {
    const s = raw[k];
    sources[k] = { state: s.state, complete: s.complete, count: s.items.length + (k === 'cron' ? raw.cron.hand.length : 0) };
    if (!s.complete) unchecked.push(k);
  }
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const failedToday = merged.filter((r) => r.attention && (r.last.at ?? 0) >= day.getTime()).length;
  const first = merged[0];
  return {
    rows: merged,
    sources,
    total: merged.length,
    atLeast: unchecked.length > 0,
    unchecked,
    next: first && 'at' in first.next ? first : null,
    failedToday,
    programsRunning: raw.programsRunning,
    empty: unchecked.length === 0 && merged.length === 0,
  };
}

/** The two chip groups of the list: what kind of schedule, and which need a look. */
export const KIND_FILTERS = ['commands', 'scripts', 'web', 'loops'] as const;
export const SHOW_FILTERS = ['paused', 'attention'] as const;

/** The status chips a row answers to. */
export const statusOf = (r: SchedRow): ('paused' | 'attention')[] => [...(r.paused ? (['paused'] as const) : []), ...(r.attention ? (['attention'] as const) : [])];

/** When a row runs next, for sorting: soonest first, rows without a time last. */
export const nextAt = (r: SchedRow): number => ('at' in r.next ? r.next.at : Number.MAX_SAFE_INTEGER);

/** Failing rows sort first, then the paused ones, then the rest. */
export const attentionRank = (r: SchedRow): number => (r.attention ? 0 : r.paused ? 2 : 1);

/** What a row's search matches on: its name, its schedule in words and its kind, never a command. */
export const searchWords = (r: SchedRow, words: string): string[] => [words, r.src];

// ── Time words ──────────────────────────────────────────────────────────────────────────

export type Rel = { n: number; u: 'min' | 'h' | 'd' };

/** Relative time: u is min under an hour, h under 48 hours, else d. n < 0 is in the past. */
export function relative(at: number, now: number): Rel {
  const d = at - now;
  const a = Math.abs(d);
  const sign = d < 0 ? -1 : 1;
  if (a < H) return { n: sign * Math.max(1, Math.round(a / M)), u: 'min' };
  if (a < 48 * H) return { n: sign * Math.round(a / H), u: 'h' };
  return { n: sign * Math.round(a / (24 * H)), u: 'd' };
}

/** Clock text in an IANA zone, 'utc', or a fixed offset in seconds east of UTC. null when the zone is unknown here. */
export function clock(at: number, zone: string | number, lang: string, withDate: boolean): string | null {
  const o: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: typeof zone === 'string' && zone !== 'utc' ? zone : 'UTC' };
  if (withDate) {
    o.month = 'short';
    o.day = 'numeric';
  }
  try {
    return new Intl.DateTimeFormat(lang, o).format(typeof zone === 'number' ? at + zone * 1000 : at);
  } catch {
    return null;
  }
}

/** Whether Run now needs a keyed retry or only a read-back after an unconfirmed outcome. */
const RETRY_CONTENT = new Set(['create', 'edit', 'pause', 'del', 'curl.pause', 'curl.edit', 'curl.del', 'loop.pause', 'loop.del']);
export type Act = 'create' | 'edit' | 'pause' | 'del' | 'run' | 'exec.run' | 'curl.pause' | 'curl.edit' | 'curl.del' | 'loop.pause' | 'loop.run' | 'loop.del';

/** After an unconfirmed outcome: 'try' repeats the same request (a repeat cannot do it twice), else only 'check'. */
export function retry(act: Act, caps?: Caps): 'try' | 'check' {
  if (RETRY_CONTENT.has(act)) return 'try';
  if (act === 'run') return caps?.run_now ? 'try' : 'check';
  if (act === 'exec.run') return caps?.trigger_receipts ? 'try' : 'check';
  if (act === 'loop.run') return caps?.loop_receipts ? 'try' : 'check';
  return 'check';
}

/** The act a row's own source uses for a pause, run or delete. */
export function actFor(row: SchedRow, verb: 'pause' | 'run' | 'del' | 'edit'): Act {
  if (row.src === 'curl') return verb === 'run' ? 'run' : (`curl.${verb}` as Act);
  if (row.src === 'loop') return `loop.${verb === 'edit' ? 'pause' : verb}` as Act;
  if (row.src === 'exec') return 'exec.run';
  return verb;
}

// ── Hand-off from Scripts ───────────────────────────────────────────────────────────────

// One implementation for every page that links to Scripts (scripts/links.ts, the only import allowed from there).
export { fromHandoff, normRel, toHandoff } from '../scripts/links';

// ── Editor ──────────────────────────────────────────────────────────────────────────────

export const MAX_NAME = 120;
export const MAX_COMMAND = 4096;
export const oneLine = (s: string): boolean => !/[\r\n]/.test(s);

export interface Draft {
  name: string;
  command: string;
  kind: Preset['k'];
  every: number;
  minute: number;
  hour: number;
  days: number[];
  dom: number;
  custom: string;
  runAs: 'user' | 'root';
}

export const emptyDraft = (): Draft => ({ name: '', command: '', kind: 'daily', every: 15, minute: 0, hour: 8, days: [1], dom: 1, custom: '', runAs: 'user' });

/** A draft that starts from a saved preset (the command is never loaded on edit). */
export function draftFrom(row: SchedRow, name: string): Draft {
  const d = { ...emptyDraft(), name };
  const p = row.sched.preset;
  if (!p) return d;
  d.kind = p.k;
  if (p.k === 'every') d.every = p.n;
  if (p.k === 'hourly') d.minute = p.m;
  if (p.k === 'daily' || p.k === 'weekdays' || p.k === 'weekly' || p.k === 'monthly') {
    d.hour = p.h;
    d.minute = p.m;
  }
  if (p.k === 'weekly') d.days = p.days;
  if (p.k === 'monthly') d.dom = p.d;
  if (p.k === 'custom') d.custom = p.expr;
  return d;
}

export function draftExpr(kit: Kit, d: Draft): string | null {
  switch (d.kind) {
    case 'custom': return d.custom.trim() || null;
    case 'every': return toExpr(kit, { k: 'every', n: d.every });
    case 'hourly': return toExpr(kit, { k: 'hourly', m: d.minute });
    case 'daily': return toExpr(kit, { k: 'daily', h: d.hour, m: d.minute });
    case 'weekdays': return toExpr(kit, { k: 'weekdays', h: d.hour, m: d.minute });
    case 'weekly': return toExpr(kit, { k: 'weekly', h: d.hour, m: d.minute, days: d.days });
    case 'monthly': return toExpr(kit, { k: 'monthly', d: d.dom, h: d.hour, m: d.minute });
    case 'reboot': return toExpr(kit, { k: 'reboot' });
  }
}

export type DraftProblem = 'name' | 'command' | 'when' | 'curl';

/** What stops a save, if anything. Editing keeps a saved command when the field is left empty. */
export function problem(kit: Kit, d: Draft, creating: boolean): DraftProblem | null {
  if (d.name.length > MAX_NAME || !oneLine(d.name)) return 'name';
  if (kit !== 'curl' && ((creating && !d.command.trim()) || d.command.length > MAX_COMMAND || !oneLine(d.command))) return 'command';
  const expr = draftExpr(kit, d);
  if (expr === null) return 'when';
  if (kit === 'curl' && d.kind === 'custom' && !/^\S+( \S+){5,6}$/.test(expr)) return 'curl';
  return null;
}

/** What a fresh read of the list says about a change whose answer was lost. */
export type Proof = 'proven' | 'unproven' | 'unreadable';

const SOURCE_OF: Partial<Record<Act, SourceKey>> = {
  pause: 'cron', del: 'cron', run: 'cron', edit: 'cron', create: 'cron', 'exec.run': 'exec', 'curl.pause': 'curl', 'curl.edit': 'curl', 'curl.del': 'curl', 'loop.pause': 'loop', 'loop.run': 'loop', 'loop.del': 'loop',
};

/**
 * Only a read that is ok and complete proves anything: a source that is down answers an empty list,
 * which must never read as "deleted". A run cannot be proven by reading the list; 'unproven' ends in the
 * person's Dismiss, which releases the lock (a repeat replays the same key).
 */
export function proofOf(fresh: Model, row: SchedRow, op: { act: Act; enabled?: boolean; expr?: string }): Proof {
  const k = SOURCE_OF[op.act];
  const src = k ? fresh.sources[k] : undefined;
  if (!src || src.state !== 'ok' || !src.complete) return 'unreadable';
  const after = fresh.rows.find((r) => r.key === row.key);
  if (op.act === 'del' || op.act === 'curl.del' || op.act === 'loop.del') return after ? 'unproven' : 'proven';
  if (op.enabled !== undefined && after) return after.paused === !op.enabled ? 'proven' : 'unproven';
  if (op.expr !== undefined && after) return after.sched.expr === op.expr ? 'proven' : 'unproven';
  return 'unproven';
}

/**
 * Whether a fresh, complete read shows the edit that was sent. Every field sent must read back: the schedule, the
 * name (a command's), and the entry's revision must have moved when one was sent. A typed command is never read
 * back, so without a revision to move it cannot be proven. `after` is the entry as the fresh read shows it.
 */
export function editProven(sent: { row: SchedRow; name: string; command: string; schedule: string }, after: SchedRow | undefined): boolean {
  if (!after || after.sched.expr !== sent.schedule) return false;
  if (sent.row.src === 'curl') return true;
  const named = 'name' in after.label ? after.label.name : '';
  if (named !== sent.name) return false;
  const was = typeof sent.row.ref.revision === 'string' ? sent.row.ref.revision : '';
  const now = typeof after.ref.revision === 'string' ? after.ref.revision : '';
  if (was) return !!now && now !== was;
  return !sent.command.trim();
}

/**
 * The baseline of a create: how many matching entries a FRESH read (taken just before the send) shows. null when that
 * read could not be taken or cannot prove anything; then no later read can prove the create.
 */
export function createBaseline(fresh: RawSchedules | null | undefined, a: { user: string; schedule: string; command: string; name: string }): number | null {
  return fresh ? countCreated(fresh, a) : null;
}

/** A create is proven only by a complete read showing more matching entries than the baseline did. */
export const createProven = (before: number | null, now: number | null): boolean => before !== null && now !== null && now > before;

/**
 * How many commands in the cron list read as this create (same user, schedule and command, and the same name
 * when one was given). null when the list cannot prove anything (the source did not answer completely, or an
 * entry hides its command). A create is proven by this count rising above the count before it was sent.
 */
export function countCreated(raw: RawSchedules, a: { user: string; schedule: string; command: string; name: string }): number | null {
  if (raw.cron.state !== 'ok' || !raw.cron.complete) return null;
  let n = 0;
  for (const e of raw.cron.items) {
    if (e.user !== a.user || e.schedule !== a.schedule) continue;
    if (typeof e.command !== 'string') return null;
    if (e.command === a.command && (!a.name || e.name === a.name)) n++;
  }
  return n;
}

/** Whether an open Run now / Delete question still fits its row: a loop's question (turn it back on, or run once)
 *  stands only while the row still asks that same one; a poll that changes it closes the dialog instead of rewording it. */
export function confirmStands(asked: { kind: 'delete' | 'loop'; variant?: SchedRow['confirm'] }, row: SchedRow): boolean {
  return asked.kind !== 'loop' || (row.confirm !== undefined && row.confirm === asked.variant);
}
