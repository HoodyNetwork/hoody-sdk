// New program, Advanced (a program kept only): working folder, description, environment, startsecs, logs. Only the
// daemon's own create rules are mirrored (its checks of a path, of an environment name and value,
// of a value that opens an INI comment, of quotes and of expansions; its checks of a new
// program and the program's stored shape): what the Hub cannot see (the folder exists, the account
// does) is the daemon's 400. A program keeps its environment values in its configuration, so a value is never put
// in a problem, and a daemon text that holds one is withheld (withoutValues). No React, no I/O.
import type { AddForm } from './addform';
import { envReason, type EnvReason, type ProgramFacts } from './form';

export interface EnvRow {
  name: string;
  value: string;
}

export interface Advanced {
  description: string;
  directory: string;
  env: EnvRow[];
  /** delay_seconds, which supervisord reads as startsecs: how long a start must keep running to count. */
  startSecs: string;
  logs: boolean;
  logSizeMb: string;
  logBackups: string;
}

export const EMPTY_ADVANCED: Advanced = { description: '', directory: '', env: [], startSecs: '', logs: true, logSizeMb: '', logBackups: '' };

export type AdvField = 'directory' | 'env' | 'startSecs' | 'logSizeMb' | 'logBackups';
export type AdvCode =
  | 'pathAbsolute'
  | 'pathTraversal'
  | 'pathChars'
  | 'envName'
  | 'envDup'
  | 'envLine'
  | 'envComment'
  | 'envQuotes'
  | 'envQuoteEnd'
  | 'envExpansion'
  | `sbEnv.${Exclude<EnvReason, 'name'>}`
  | 'number'
  | 'logSizeMax';
export interface AdvProblem {
  field: AdvField;
  code: AdvCode;
  /** env: the row, and its variable name (never its value). */
  row?: number;
  name?: string;
}

const U32_MAX = 4294967295;
const MB = 1048576;
// The largest log size the Hub sends exactly: 2^33 MB is 2^53 bytes. The daemon's field is a u64, but core sends the
// body as JSON from a JS number, which prints larger byte counts with other trailing digits than the size typed.
const LOG_MB_MAX = 2 ** 33;
const PATH_CHARS = /^[a-zA-Z0-9/_.\- \t]+$/;
const ENV_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
// Rust char::is_whitespace (Unicode White_Space).
const WS = /[\t\n\u000b\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/;
// supervisord's own expansion names besides ENV_<variable> (the daemon's own list).
const EXPANSION_NAMES = ['program_name', 'group_name', 'host_node_name', 'process_num', 'numprocs', 'here'];

/** The rows that are sent: a row with neither name nor value is an empty line of the editor. */
export const envRows = (rows: readonly EnvRow[]): { row: EnvRow; at: number }[] =>
  rows.map((row, at) => ({ row, at })).filter(({ row }) => row.name !== '' || row.value !== '');

function whole(v: string, max: number): number | null {
  const s = v.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n <= max ? n : null;
}

function pathCode(raw: string): AdvCode | null {
  if (raw.split('/').some((c) => c === '..')) return 'pathTraversal';
  if (!raw.startsWith('/')) return 'pathAbsolute';
  if (!PATH_CHARS.test(raw)) return 'pathChars';
  return null;
}

/** env_value_opens_ini_comment: whitespace then ; or #, as the INI writer writes it (LF, CR and NUL dropped). */
function opensComment(v: string): boolean {
  let prevSpace = false;
  for (const c of v.replace(/[\n\r\u0000]/g, '')) {
    if (prevSpace && (c === ';' || c === '#')) return true;
    prevSpace = WS.test(c);
  }
  return false;
}

/** supervisord_expansion_at: `%(` KEY `)` (balanced), flags, width, precision, length, one conversion; or null. */
export function expansionAt(s: string): { len: number; name: string; conv: string } | null {
  if (!s.startsWith('%(')) return null;
  const tail = s.slice(2);
  let depth = 1;
  let close = -1;
  for (let i = 0; i < tail.length; i++) {
    if (tail[i] === '(') depth++;
    else if (tail[i] === ')' && --depth === 0) {
      close = i;
      break;
    }
  }
  if (close < 0) return null;
  const name = tail.slice(0, close);
  const spec = tail.slice(close + 1);
  let i = 0;
  while (i < spec.length && '#0- +'.includes(spec[i] as string)) i++;
  while (i < spec.length && /[0-9]/.test(spec[i] as string)) i++;
  if (spec[i] === '.') {
    i++;
    while (i < spec.length && /[0-9]/.test(spec[i] as string)) i++;
  }
  if (spec[i] === 'h' || spec[i] === 'l' || spec[i] === 'L') i++;
  const conv = spec[i];
  if (conv === undefined || !'diouxXeEfFgGcrsa'.includes(conv)) return null;
  return { len: 2 + close + 1 + i + 1, name, conv };
}

/** check_requested_expansions for one value: an unknown name, or a text value converted as a number. */
function badExpansion(v: string): boolean {
  let rest = v;
  for (;;) {
    const at = rest.indexOf('%');
    if (at < 0) return false;
    rest = rest.slice(at);
    if (rest.startsWith('%%')) {
      rest = rest.slice(2);
      continue;
    }
    const x = expansionAt(rest);
    if (!x) {
      rest = rest.slice(1);
      continue;
    }
    if (!x.name.startsWith('ENV_') && !EXPANSION_NAMES.includes(x.name)) return true;
    if (x.name !== 'process_num' && x.name !== 'numprocs' && 'diouxXeEfFgG'.includes(x.conv)) return true;
    rest = rest.slice(x.len);
  }
}

/** The first daemon refusal of one value (a program kept, never a terminal one: every quote rule applies). */
function valueCode(v: string): AdvCode | null {
  if (/[\n\r]/.test(v)) return 'envLine';
  if (opensComment(v)) return 'envComment';
  if (v.includes('"') && v.includes("'")) return 'envQuotes';
  if (/^["']|["']$/.test(v)) return 'envQuoteEnd';
  if (badExpansion(v)) return 'envExpansion';
  return null;
}

/** The checks the Hub can make. `sandboxed`: the draft carries a sandbox block that restricts something, so the
 *  sandbox's environment rules (form.ts envReason) apply too. */
export function checkAdvanced(a: Advanced, sandboxed: boolean): AdvProblem[] {
  const out: AdvProblem[] = [];
  const dir = a.directory.trim();
  if (dir) {
    const c = pathCode(dir);
    if (c) out.push({ field: 'directory', code: c });
  }
  const seen = new Set<string>();
  for (const { row, at } of envRows(a.env)) {
    const name = row.name.trim();
    const shown = name.replace(/[\u0000-\u001f\u007f-\u009f]/g, '?').slice(0, 128);
    const add = (code: AdvCode) => out.push({ field: 'env', code, row: at, name: shown });
    if (!name || name.length > 128 || !ENV_NAME.test(name)) add('envName');
    else if (seen.has(name)) add('envDup');
    else {
      seen.add(name);
      const c = valueCode(row.value);
      const sb = !c && sandboxed ? envReason(name, row.value) : null;
      if (c) add(c);
      else if (sb && sb !== 'name') add(`sbEnv.${sb}`);
    }
  }
  if (a.startSecs.trim() && whole(a.startSecs, U32_MAX) === null) out.push({ field: 'startSecs', code: 'number' });
  if (a.logs) {
    if (a.logSizeMb.trim() && whole(a.logSizeMb, LOG_MB_MAX) === null) out.push({ field: 'logSizeMb', code: /^\d+$/.test(a.logSizeMb.trim()) ? 'logSizeMax' : 'number' });
    if (a.logBackups.trim() && whole(a.logBackups, U32_MAX) === null) out.push({ field: 'logBackups', code: 'number' });
  }
  return out;
}

/** What Advanced adds to the add body (ProgramInput): only what was set; values as typed, names trimmed. */
export function advancedBody(a: Advanced): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (a.description.trim()) body.description = a.description.trim();
  if (a.directory.trim()) body.directory = a.directory.trim();
  const rows = envRows(a.env);
  if (rows.length) body.environment = Object.fromEntries(rows.map(({ row }) => [row.name.trim(), row.value]));
  const secs = whole(a.startSecs, U32_MAX);
  if (a.startSecs.trim() && secs !== null) body.delay_seconds = secs;
  if (!a.logs) body.logs_enabled = false;
  else {
    const mb = whole(a.logSizeMb, LOG_MB_MAX);
    if (a.logSizeMb.trim() && mb !== null) body.log_max_bytes = mb * MB;
    const b = whole(a.logBackups, U32_MAX);
    if (a.logBackups.trim() && b !== null) body.log_backups = b;
  }
  return body;
}

function port(v: string): number | null {
  const n = whole(v, 65535);
  return n !== null && n >= 1 ? n : null;
}

/** The program the draft describes, as the sandbox checks read a stored one (form.ts check). Environment values
 *  stay here: only a refused name and its reason go out. */
export function draftFacts(f: AddForm, a: Advanced): ProgramFacts {
  const env: ProgramFacts['env'] = [];
  for (const { row } of envRows(a.env)) {
    const why = envReason(row.name.trim(), row.value);
    if (why) env.push({ name: row.name.trim().replace(/[\u0000-\u001f\u007f-\u009f]/g, '?').slice(0, 128), reason: why });
  }
  const a0 = port(f.rangeStart);
  const b0 = port(f.rangeEnd);
  return {
    enabled: true,
    boot: f.boot,
    lazy: false,
    kit: false,
    root: f.user.trim() === 'root',
    terminal: false,
    portRange: f.ports === 'range' && a0 !== null && b0 !== null ? { start: a0, end: b0 } : null,
    readyPort: f.ports === 'one' ? port(f.port) : null,
    directory: a.directory.trim() || null,
    display: false,
    displayLiteral: true,
    env,
  };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The daemon's text, or null when it holds an entered environment value (the caller shows a fixed line instead).
 *  A value of 4 characters or more counts anywhere; a shorter one only as a word of its own, so DEBUG=1 does not
 *  withhold "program 12" or "port 8001". */
export function withoutValues(text: string, rows: readonly EnvRow[]): string | null {
  for (const { row } of envRows(rows)) {
    const v = row.value;
    if (!v) continue;
    if (v.length >= 4 ? text.includes(v) : new RegExp(`(^|[^A-Za-z0-9])${escapeRe(v)}($|[^A-Za-z0-9])`).test(text)) return null;
  }
  return text;
}

/** The cleaned daemon text (data.ts daemonText) to show for a send that carried `rows`, or null to withhold it: when
 *  the raw answer or the cleaned text holds a value, as typed or as the cleaning would print it (control runs as one
 *  space), before any cut. */
export function shownText(raw: string, clean: string, rows: readonly EnvRow[]): string | null {
  const printed = envRows(rows).map(({ row }) => ({ ...row, value: row.value.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').trim() }));
  if (withoutValues(raw, rows) === null || withoutValues(clean, rows) === null || withoutValues(clean, printed) === null) return null;
  return clean;
}
