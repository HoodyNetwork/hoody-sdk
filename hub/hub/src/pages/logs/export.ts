// The Logs export: the browser port of the agent's log export writer
// (entries, the end line and the file name) plus the record
// mapping for every non-agent source. export.test.ts holds it byte-equal to the agent's Go-generated goldens
// when the agent's source tree is present. Where a plain JavaScript port would differ from Go:
//   - JSON is Go's HTML-safe encoding: < > & U+2028 U+2029 as \u escapes, \b and \f named, other C0
//     controls as lowercase \u00xx, DEL and C1 raw, keys in UTF-8 byte order;
//   - attr numbers are full decimals with no exponent (1e21 -> 1000000000000000000000);
//   - the txt level is upper-cased one code point at a time without special casing (ß stays), and
//     %-5s / %-8s pad by code points;
//   - sanitize.Label drops escape sequences as Go scans them byte by byte. Every sequence it recognises
//     ends on an ASCII byte, and the bytes a 2-byte escape leaves behind are invalid UTF-8 that Go drops,
//     so the scrubber's plain() code-point scan gives the same text.
// Every record is scrubbed whole (stripDeep), then comp, message and each attribute value are cut to 16,384 UTF-16
// units (time, level, source and attribute keys are not cut). For txt, each field is
// also normalized as the line will show it (sanitize.Label, the level upper-cased) and scrubbed again
// before the cut: dropping an escape can join the two halves of a secret. Hub records never carry
// session_id, run_id, turn_id or ref.
// The AI helper's export is the agent's own file (`helperExport`): downloaded as it is, kept only when it
// ends with a valid end line.
import { helperExportPath, LIMITS as READ_LIMITS, type Predicate, type Row } from './rules';
import { HubLogsScrub as S } from './scrub';

export const LIMITS = { rows: 8000, bytes: 8 * 1024 * 1024, field: 16384, reserve: 256 } as const;
export const NOTE = 'recent output, may be incomplete';

/** A logexport Entry: what the writer takes. attrs values are any JSON. */
export interface Entry {
  seq?: number;
  time: string;
  level: string;
  source: string;
  comp?: string;
  message: string;
  attrs?: Record<string, unknown>;
}
interface Prepared {
  seq?: number; time: string; level: string; source: string; comp: string; message: string; attrs?: Record<string, string>;
}

function str(v: unknown): string { return v == null ? '' : String(v); }
function hex4(c: number): string { return '\\u' + ('000' + c.toString(16)).slice(-4); }
const NAMED: Record<string, string> = { '"': '\\"', '\\': '\\\\', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t' };
function q(s: unknown): string {
  return '"' + str(s).replace(/[\u0000-\u001f"\\<>&\u2028\u2029]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, (c) => {
    const n = c.charCodeAt(0);
    return NAMED[c] || (n >= 0xd800 && n <= 0xdfff ? '\\ufffd' : hex4(n));
  }) + '"';
}
/** Go json.Marshal of a decoded JSON value (float64 numbers format like JavaScript's, except -0). */
export function goJSON(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return q(v);
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return '[' + v.map(goJSON).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).sort(S.byteCompare).map((k) => q(k) + ':' + goJSON(o[k])).join(',') + '}';
}
/** strconv.FormatFloat(x, 'f', -1, 64): the shortest digits, never an exponent. */
export function num(x: number): string {
  if (x === 0) return Object.is(x, -0) ? '-0' : '0';
  let s = String(Math.abs(x));
  const m = /^(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(s);
  if (m) {
    const d = (m[1] as string) + (m[2] || ''), e = Number(m[3]);
    s = e >= 0 ? d + '0'.repeat(e - d.length + 1) : '0.' + '0'.repeat(-e - 1) + d;
  }
  return (x < 0 ? '-' : '') + s;
}
/** One source value as an attr string; null and undefined mean "no attr". */
export function attrString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return num(v);
  if (typeof v === 'boolean') return String(v);
  return goJSON(v);
}

/** sanitize.Label: the scrubber's plain() (escapes dropped, \t -> space, other C0, DEL, C1, bidi controls and invalid text dropped) with \n -> space too. */
export function label(s: unknown): string { return S.plain(s).replace(/\n/g, ' '); }
/** strings.ToUpper: simple case mapping per code point, so ß and ﬁ stay as they are. */
export function upper(s: unknown): string {
  return Array.from(str(s), (c) => { const u = c.toUpperCase(); return Array.from(u).length === 1 ? u : c; }).join('');
}
export function pad(s: string, n: number): string { return s + ' '.repeat(Math.max(0, n - Array.from(s).length)); }

function attrKeys(e: { attrs?: Record<string, unknown> }): string[] { return e.attrs ? Object.keys(e.attrs).sort(S.byteCompare) : []; }
export function entryJSON(e: Prepared): string {
  const keys = attrKeys(e), a = e.attrs || {};
  return '{' + (e.seq ? '"seq":' + num(e.seq) + ',' : '') + '"time":' + q(e.time) + ',"level":' + q(e.level) +
    ',"source":' + q(e.source) + (e.comp ? ',"comp":' + q(e.comp) : '') + ',"message":' + q(e.message) +
    (keys.length ? ',"attrs":{' + keys.map((k) => q(k) + ':' + q(a[k])).join(',') + '}' : '') + '}\n';
}
export function textLine(e: Prepared): string {
  const keys = attrKeys(e), a = e.attrs || {};
  return label(e.time) + ' ' + pad(label(upper(e.level)), 5) + ' ' + pad(label(e.source), 8) +
    (e.comp ? ' [' + label(e.comp) + ']' : '') + ' ' + label(e.message) +
    (keys.length ? '  ·' + keys.map((k) => ' ' + label(k) + '=' + label(a[k])).join('') : '') + '\n';
}

export type Format = 'jsonl' | 'txt';
export interface EndSummary { rows: number; gap: boolean; partial: boolean }
export function endLine(format: Format, s: Partial<EndSummary>): string {
  const r = num(s.rows || 0), g = String(!!s.gap), p = String(!!s.partial);
  return format === 'txt' ? '# export: rows=' + r + ' gap=' + g + ' partial=' + p + '\n'
    : '{"_hoody_export":{"rows":' + r + ',"gap":' + g + ',"partial":' + p + ',"complete":true}}\n';
}
const END_RE: Record<Format, RegExp> = {
  jsonl: /^\{"_hoody_export":\{"rows":(0|[1-9]\d*),"gap":(true|false),"partial":(true|false),"complete":true\}\}$/,
  txt: /^# export: rows=(0|[1-9]\d*) gap=(true|false) partial=(true|false)$/,
};
/** The agent export: accepted only when it ends with a valid end line whose rows equals the lines before it. Lines split on \n only (txt keeps U+2028/U+2029 raw). Returns the summary or null. */
export function validateEnd(text: unknown, format: Format): EndSummary | null {
  if (typeof text !== 'string' || text.slice(-1) !== '\n' || !END_RE[format]) return null;
  const lines = text.slice(0, -1).split('\n'), m = END_RE[format].exec(lines.pop() as string);
  if (!m || Number(m[1]) !== lines.length) return null;
  return { rows: lines.length, gap: m[2] === 'true', partial: m[3] === 'true' };
}
/** The same end line, checked on the bytes the kit's download hands its validateEnd (the last 64 KiB): the last line, its bytes read as Latin-1 (an end line is ASCII, so nothing else can match). */
export function tailEnd(format: Format): (bytes: Uint8Array) => boolean {
  return (bytes) => {
    const end = bytes.length - 1;
    let start = end;
    if (!END_RE[format] || bytes[end] !== 10) return false;
    while (start > 0 && bytes[start - 1] !== 10) start--;
    return END_RE[format].test(String.fromCharCode(...bytes.subarray(start, end)));
  };
}
function pad2(n: number): string { return (n < 10 ? '0' : '') + n; }
/** FilenameFor: hoody-logs[-token]-YYYYMMDD-HHMMSS.ext in UTC; the token keeps [a-z0-9-] of the lower-cased source. */
export function filename(source: unknown, format: string, nowMs: number): string {
  const d = new Date(nowMs), tok = str(source).toLowerCase().replace(/[^a-z0-9-]/g, '');
  return 'hoody-logs' + (tok ? '-' + tok : '') + '-' + d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) +
    '-' + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + '.' + (format === 'txt' ? 'txt' : 'jsonl');
}

export function utf8Len(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i++; } else n += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
  }
  return n;
}

/** Scrub the whole record, encode attrs, then cut comp, message and each attribute value; a cut record says attrs.cut. With format 'txt', every field is label()led and scrubbed again first; attr keys that become equal keep both values (#2, #3... in key order). */
export function prepare(e: Entry, format?: Format): Prepared {
  const txt = format === 'txt', x = S.stripDeep(e) as Entry;
  const t = (v: unknown): string => (txt ? S.strip(label(v)) : str(v));
  const out: Prepared = {
    seq: x.seq, time: t(str(x.time)), level: txt ? S.strip(label(upper(str(x.level)))) : str(x.level), source: t(str(x.source)), comp: t(str(x.comp)), message: t(str(x.message)),
  };
  const attrs: Record<string, string> = {};
  let cut = false, any = false;
  const c = (v: string): string => { const r = S.cut(v, LIMITS.field); cut = cut || r.cut; return r.text; };
  out.comp = c(out.comp);
  out.message = c(out.message);
  const xa = x.attrs || {};
  for (const k of Object.keys(xa)) {
    const v = attrString(xa[k]);
    let name = t(k), n = 2;
    if (v === null) continue;
    while (Object.prototype.hasOwnProperty.call(attrs, name)) name = t(k) + '#' + n++;
    S.put(attrs, name, c(t(v)));
    any = true;
  }
  if (cut) { attrs.cut = 'true'; any = true; }
  if (any) out.attrs = attrs;
  return out;
}

export interface WriterSummary extends EndSummary { parts: string[]; bytes: number }
export interface Writer {
  add(e: Entry): boolean;
  finish(s?: { gap?: boolean; partial?: boolean }): WriterSummary;
  readonly rows: number;
  readonly full: boolean;
}
/** A bounded export file: 8,000 rows or 8 MiB including the header and the end line, which is always written. add() returns false once the file is full (partial). */
export function createWriter(format: Format, o: { maxRows?: number; maxBytes?: number; header?: string } = {}): Writer {
  const parts: string[] = [], maxRows = o.maxRows || LIMITS.rows, room = (o.maxBytes || LIMITS.bytes) - LIMITS.reserve;
  let rows = 0, bytes = 0, full = false;
  if (format === 'txt' && o.header) { parts.push('# ' + o.header + '\n'); bytes = utf8Len(parts[0] as string); }
  return {
    add(e) {
      if (full) return false;
      const line = format === 'txt' ? textLine(prepare(e, 'txt')) : entryJSON(prepare(e)), n = utf8Len(line);
      if (rows >= maxRows || bytes + n > room) { full = true; return false; }
      parts.push(line);
      rows++;
      bytes += n;
      return true;
    },
    finish(s = {}) {
      const sum = { rows, gap: !!s.gap, partial: full || !!s.partial };
      parts.push(endLine(format, sum));
      return { ...sum, parts, bytes: bytes + utf8Len(parts[parts.length - 1] as string) };
    },
    get rows() { return rows; },
    get full() { return full; },
  };
}

// The record mapping. Each returns an unscrubbed Entry with source-valued attrs.
function words(a: unknown[]): string { return a.filter((x) => x != null && x !== '').join(' '); }
function ms(v: unknown): string | null { return typeof v === 'number' ? num(v) + 'ms' : null; }
function levelByStatus(s: unknown): string { return typeof s === 'number' && s >= 500 ? 'error' : typeof s === 'number' && s >= 400 ? 'warn' : 'info'; }
const BOT_FIELDS = ['bot_exposure', 'bot_label', 'bot_caller', 'bot_caller_name', 'bot_door', 'bot_result', 'bot_limit'];
// The column a downloaded file shows for a field, when it differs from the row's field name.
const BOT_COLUMN: Record<string, string> = { bot_exposure: 'bot_url' };

export interface AccountRow { created_at?: string; status_code?: number; method?: string; path?: string; [k: string]: unknown }
export interface ChangeRow { created_at?: string; resource_type?: string; event_type?: string; resource_id?: string; [k: string]: unknown }
export interface ScriptRow { receivedAt?: string; status?: number; error?: unknown; method?: string; durationMs?: number; executionId?: string; path?: string; [k: string]: unknown }

export const map = {
  /** A logs-kit visit; o.program(serviceName) names the program, o.ips adds the visitor address. */
  visit(row: Row, o: { program?: (name: unknown) => string; ips?: boolean } = {}): Entry {
    const idx = row.serviceIndex;
    const a: Record<string, unknown> = { path: row.url, status: row.status, method: row.method, duration_ms: row.durationMs, bytes: row.bytesSent, request_id: row.traceId };
    if (o.ips) a.ip = row.clientIp;
    const name = o.program ? o.program(row.serviceName) : str(row.serviceName).replace(/^./, (c) => c.toUpperCase());
    return {
      seq: row.id, time: str(row.tsIso), level: str(row.level), source: 'web', comp: str(row.serviceName) + (idx != null && idx !== '' ? '-' + idx : ''),
      message: words([name, row.method, row.status, ms(row.durationMs)]), attrs: a,
    };
  },
  /** A logs-kit Bot call: the allowlisted fields only. */
  bot(row: Row, o?: { ips?: boolean }): Entry {
    const d = row.data || {}, a: Record<string, unknown> = { status: row.status, duration_ms: row.durationMs, request_id: row.traceId };
    for (const k of BOT_FIELDS) if (d[k] != null) a[BOT_COLUMN[k] ?? k] = d[k];
    if (o && o.ips) a.ip = row.clientIp;
    return { seq: row.id, time: str(row.tsIso), level: str(row.level), source: 'bots', comp: 'bots', message: words([d.bot_door, d.bot_result]), attrs: a };
  },
  /** An /events row; o.sentence(row) gives the fixed sentence. */
  change(row: ChangeRow, o?: { sentence?: (row: ChangeRow) => string }): Entry {
    return {
      time: str(row.created_at), level: 'info', source: 'changes', comp: row.resource_type,
      message: o && o.sentence ? o.sentence(row) : str(row.event_type), attrs: { event_type: row.event_type, resource_id: row.resource_id },
    };
  },
  /** One execution of the script at o.scriptPath. */
  script(row: ScriptRow, o?: { scriptPath?: string }): Entry {
    return {
      time: str(row.receivedAt), level: (typeof row.status === 'number' && row.status >= 500) || row.error ? 'error' : 'info', source: 'scripts', comp: o && o.scriptPath,
      message: words([row.method, row.status, ms(row.durationMs)]), attrs: { execution_id: row.executionId, path: row.path, status: row.status, error: row.error },
    };
  },
  /** A /users/auth/activity row. */
  account(row: AccountRow): Entry {
    return { time: str(row.created_at), level: levelByStatus(row.status_code), source: 'account', message: words([row.method, row.status_code]), attrs: { path: row.path, status: row.status_code } };
  },
};

export interface ProgramExport extends WriterSummary { filename: string }

/** program output: one snapshot, made plain and scrubbed as one text (stripSnapshot: window-edge rules included), one record per line, never timed; it always ends partial.
 *  Lines are written oldest first, so a file that fills would lose the NEWEST ones: more lines than the cap keeps the newest, and a file that
 *  fills by size is refused whole (throws `{ code: 'too_large' }`: nothing is saved). txt opens with a header line, JSONL carries the note on the first record. */
export function programExport(snapshot: string, o: { format: Format; program: string; port?: number | null; channel: string; nowMs: number }): ProgramExport {
  const text = S.stripSnapshot(snapshot), lines = text === '' ? [] : text.split('\n'), comp = str(o.program) + (o.port ? ':' + o.port : '');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  if (lines.length > READ_LIMITS.programLines) lines.splice(0, lines.length - READ_LIMITS.programLines);
  // The read asks for the program's last programLines lines: the file holds as many, so none of the newest is cut.
  const w = createWriter(o.format, { header: NOTE, maxRows: READ_LIMITS.programLines });
  lines.every((line, i) => {
    const attrs: Record<string, unknown> = { channel: o.channel };
    if (i === 0 && o.format !== 'txt') attrs.note = NOTE;
    return w.add({ time: '', level: '', source: 'program', comp, message: line, attrs });
  });
  if (w.full) throw { code: 'too_large' };
  const sum = w.finish({ partial: true });
  return { ...sum, filename: filename('program-' + comp + '-' + str(o.channel), o.format, o.nowMs) };
}

export interface HelperExport { parts: Blob[]; bytes: number; name: string; rows: number; gap: boolean; partial: boolean; format: Format }

/** The kit's bounded download, injected (core's download in the page): resolves {parts, bytes}. */
export type Download = (path: string, o: { maxBytes: number; validateEnd: (tail: Uint8Array) => boolean; signal?: AbortSignal }) => Promise<{ parts: Blob[]; bytes: number }>;

/** the AI helper's export of P (helperExportPath): the bounded download (8 MiB) as caller logs. Kept only when the download ends with a valid end line (tailEnd) and its rows equal the lines before it (validateEnd on the whole file); otherwise, or past the bound, it rejects {code: 'unfinished'} and no file is made. Other refusals pass through. Once o.alive is false or o.signal aborts - during the download or while the file is read - it rejects {code: 'cancelled'} and nothing is kept. */
export async function helperExport(P: Predicate, o: { format?: string; download: Download; signal?: AbortSignal; alive?: () => boolean; nowMs?: number }): Promise<HelperExport> {
  const format: Format = o.format === 'jsonl' ? 'jsonl' : 'txt';
  const path = helperExportPath(P, { format });
  if (!path) throw { code: 'ROUTE_NOT_ALLOWED', notSent: true };
  const dead = (): boolean => !!(o.signal && o.signal.aborted) || (typeof o.alive === 'function' && !o.alive());
  if (dead()) throw { code: 'cancelled' };
  let r: { parts: Blob[]; bytes: number };
  try {
    r = await o.download(path, { maxBytes: LIMITS.bytes, validateEnd: tailEnd(format), signal: o.signal });
  } catch (e) {
    throw dead() ? { code: 'cancelled' } : e && (e as { kind?: string }).kind === 'too_large' ? { code: 'unfinished' } : e;
  }
  const first = r.parts[0];
  const text = first ? await first.text() : '';
  if (dead()) throw { code: 'cancelled' };
  const sum = validateEnd(text, format);
  if (!sum) throw { code: 'unfinished' };
  return { parts: r.parts, bytes: r.bytes, name: filename('helper', format, o.nowMs ?? Date.now()), rows: sum.rows, gap: sum.gap, partial: sum.partial, format };
}
