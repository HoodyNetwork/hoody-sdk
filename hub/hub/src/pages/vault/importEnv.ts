// Import: the pure rules of a .env file or a pasted KEY=VALUE list (no DOM, no core). The parse splits what it
// reads in two: rows (line numbers, names and statuses, safe to keep in React state and show) and values (a plain
// array aligned with the rows, which the dialog keeps in a ref only). Nothing here keeps, logs or measures a value.
//
// The format (dotenv-like, never expanded):
//   - a leading BOM is dropped; CRLF reads as LF; blank lines and lines starting with # are skipped;
//   - one `export ` prefix is dropped; NAME=VALUE with spaces allowed around =;
//   - unquoted: trimmed, and whitespace then # starts a comment; no escapes;
//   - single quotes: literal, may span lines;
//   - double quotes: may span lines; \n \r \t \" \\ are escapes, any other backslash is kept as written;
//   - a quote not closed before the end refuses the WHOLE import (it would swallow every later line);
//   - after a closing quote only whitespace and a # comment may follow; other text refuses that row;
//   - ${VAR} is kept literally in any value, quoted or not (reported once, so the person knows it was not expanded);
//   - names must pass the environment-name rule ENV_NAME first (so hoody.* fails on its dot), then the vault's keyProblem;
//   - a key-material line (base64 with + or /, or ending ==) is refused as part of a value; but NAME= followed only by =
//     signs (`A==`, `TOKEN==`) is an ordinary entry whose value is those = signs when NAME is a .env name shorter than 16
//     characters, or an upper-case one (A-Z, 0-9, _) of at most 64 (a
//     base64 or base64url body is mixed case, so it stays material, refused and cutting). Right after an open unquoted
//     value it is material anyway when that value looks like a base64 body (16+ base64/base64url characters, no space)
//     or its name mixes upper and lower case (the short last line of a wrapped body, `dGVzdA==`);
//   - an unquoted value is refused as likely cut when the next line that is not blank or a comment may be more of it:
//     a line without =, key material, or a line whose text before = fails the environment-name rule.
//     A line with a valid .env name and = is its own row and never cuts, even refused (empty, duplicate, vault-refused);
//     except an empty unquoted `NAME=` (or one too long for a name) right after a value that looks like a base64 body,
//     when the two can be one padded base64 value (whole length a multiple of 4, a canonical one-= pad character): it
//     is then that body's last line (`QUI=`), so the value is refused as cut;
//   - an empty value is refused per row (the API refuses one); like text after a closing quote, it still takes part in
//     last-wins below, so a later refused line of a name replaces an earlier good one and nothing of that name is sent;
//   - the same name twice: the last one wins, earlier sendable lines are reported as replaced by it;
//   - only a row that can be sent or was replaced shows its name: every refused row is shown by line number and reason
//     only, since what stands before its = may be part of a value.
// Caps: the text at 64 KB (refused before parsing), 200 rows of any status (refused with the count).
import { utf8Bytes } from '@core/pure';
import { keyProblem, type KeyProblem } from './logic';

export const IMPORT_MAX_BYTES = 64 * 1024;
export const IMPORT_MAX_ROWS = 200;
/** The vault's write rate (writes a minute): the expected duration of a run is read from it. */
export const IMPORT_WRITES_PER_MIN = 20;
/** A .env name: letters, digits and _, not starting with a digit (and a vault key too: keyProblem). */
export const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/**
 * A line of key material (PEM body, base64): what an unquoted multi-line value leaves on its next lines. Base64 only,
 * and either ending == (a "name" followed by == alone) or 16+ characters holding + or /. A NAME= line (an empty value)
 * is not one.
 */
const material = (line: string): boolean =>
  /^[A-Za-z0-9+/]+={0,2}$/.test(line) && (line.endsWith('==') || (line.length >= 16 && /[+/]/.test(line)));
/** A line that is a .env-shaped name followed only by = signs (`A==`, a base64 or base64url body ending ==): the name. */
const equalsOnlyName = (line: string): string | null => /^([A-Za-z_][A-Za-z0-9_]*)=(=+)$/.exec(line)?.[1] ?? null;
/**
 * Such a line is an entry (value: the = signs) only when its name is shorter than 16 characters, or upper case (A-Z, 0-9,
 * _) and at most 64. Every other one is taken as a base64 or base64url body (mixed case), so it is key material: fail
 * safe, a long camelCase name is refused rather than a body read as a name.
 */
function equalsEntry(name: string): boolean {
  return name.length < 16 || (/^[A-Z_][A-Z0-9_]*$/.test(name) && name.length <= 64);
}
/** An open unquoted value that looks like a base64 or base64url body: 16+ such characters, no space. */
const looksLikeBody = (open: string): boolean => /^[A-Za-z0-9+/_-]{16,}$/.test(open);
/**
 * `NAME=` with nothing after it can be the one-= last line of the base64 body `open` only when the two make a padded
 * base64 value: the whole length (open + name + the =) is a multiple of 4, and the character before the = carries the
 * two zero pad bits every encoder writes (one of AEIMQUYcgkosw048). Exact for a two-line body: a longer body's middle
 * line already cut the value. Keeps an ordinary token (UUID, hex, sk-proj-, ghp_) before an empty placeholder sent
 * in most cases.
 */
const canBeTail = (open: string, name: string): boolean =>
  looksLikeBody(open) && (open.length + name.length + 1) % 4 === 0 && /[AEIMQUYcgkosw048]$/.test(name);
/**
 * Right after an open unquoted value, such a line is key material anyway (refused, and it cuts that value) when the
 * open value looks like a base64 body (16+ base64 or base64url characters, no space: the short last
 * line of a wrapped body such as `dGVzdA==`), or when its name mixes upper and lower case (a base64 tail
 * like `aGVsbG8gd29ybGQ==` after any value). After a line refused as part of a value (a body of three or more lines), it
 * is key material whatever its name (parseImport's inBody).
 */
function equalsMaterialAfter(name: string, open: string): boolean {
  return looksLikeBody(open) || (/[a-z]/.test(name) && /[A-Z]/.test(name));
}

export type RowStatus =
  /** A name and a value to send. */
  | 'ok'
  /** No `=` on the line: shown by line number only. */
  | 'no_equals'
  /** The name is not one the vault and .env take (problem says why). */
  | 'invalid'
  /** A key-material line (part of a value cut over lines). */
  | 'continuation'
  /** An unquoted value whose next line (`next`) is refused and may be more of it: refused rather than cut. */
  | 'continued'
  /** The value is empty. */
  | 'empty'
  /** Text follows the closing quote on its line (other than whitespace and a # comment). */
  | 'trailing'
  /** A later line with the same name replaces this one. */
  | 'replaced';

export interface ImportRow {
  /** The line the entry starts on (1-based). */
  readonly line: number;
  /** The name as written, only for 'ok' and 'replaced'; '' for every refused row (shown by line number only). */
  readonly key: string;
  readonly status: RowStatus;
  /** status 'invalid': why ('env': not an environment-variable name). */
  readonly problem?: NameProblem;
  /** status 'replaced': the line that wins. */
  readonly replacedBy?: number;
  /** status 'continued': the refused line that may be more of this value. */
  readonly next?: number;
}

export type ImportParse =
  | {
      readonly ok: true;
      readonly rows: readonly ImportRow[];
      /** values[i] belongs to rows[i] ('' for a row that is not 'ok'). Never put in state. */
      readonly values: readonly string[];
      /** Some value holds `${`: kept as written. */
      readonly interpolation: boolean;
    }
  | { readonly ok: false; readonly why: 'size'; readonly bytes: number }
  | { readonly ok: false; readonly why: 'quote'; readonly line: number }
  | { readonly ok: false; readonly why: 'rows'; readonly count: number }
  | { readonly ok: false; readonly why: 'nothing' };

export type NameProblem = Exclude<KeyProblem, 'reserved'> | 'env';

/** Why a name cannot be imported: the .env rule first, then the vault's own (hoody.* never gets past the .env rule). */
function nameProblem(key: string): NameProblem | null {
  if (!key) return 'empty';
  if (!ENV_NAME.test(key)) return 'env';
  const p = keyProblem(key);
  return p === 'reserved' ? 'env' : p;
}

const ESCAPES: Readonly<Record<string, string>> = { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' };

/** The text's size in UTF-8 bytes. */
export function importBytes(text: string): number {
  return utf8Bytes(text);
}

/** Tests: the parser's work, one step per line it visits and per character a quoted value reads (linear in the text). */
export interface ParseWork {
  steps: number;
}

/** Reads a quoted value that opens at first[0] (line i's text from its opening quote, so lines[i] itself is never read);
 *  null when it is never closed. `rest`: the text after the closing quote on its line. Each character is read once, so the
 *  whole parse stays linear in the text. */
function quoted(lines: readonly string[], i: number, first: string, q: "'" | '"', work?: ParseWork): { value: string; endLine: number; rest: string } | null {
  let out = '';
  for (let l = i; l < lines.length; l++) {
    const s = l === i ? first : lines[l]!;
    for (let c = l === i ? 1 : 0; c < s.length; c++) {
      if (work) work.steps++;
      const ch = s[c]!;
      if (q === '"' && ch === '\\' && c + 1 < s.length) {
        const next = s[c + 1]!;
        out += ESCAPES[next] ?? `\\${next}`;
        c++;
        continue;
      }
      if (ch === q) return { value: out, endLine: l, rest: s.slice(c + 1) };
      out += ch;
    }
    out += '\n';
  }
  return null;
}

/** The value of an unquoted right-hand side: up to whitespace-then-#, trimmed. */
function unquoted(rhs: string): string {
  const m = /\s#/.exec(rhs);
  return (m ? rhs.slice(0, m.index) : rhs).trim();
}

export function parseImport(text: string, work?: ParseWork): ImportParse {
  const bytes = importBytes(text);
  if (bytes > IMPORT_MAX_BYTES) return { ok: false, why: 'size', bytes };
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const rows: ImportRow[] = [];
  const values: string[] = [];
  let interpolation = false;
  // The row of an unquoted value ending on the last line that was not blank or a comment (it may be cut if this line,
  // refused, goes on with it).
  let openUnquoted = -1;
  // The last line that was not blank or a comment was refused as part of a value (continuation or no_equals): a wrapped
  // body of three or more lines goes on from there.
  let inBody = false;
  for (let i = 0; i < lines.length; i++) {
    if (work) work.steps++;
    let s = lines[i]!.trimStart();
    if (!s || s.startsWith('#')) continue;
    const prevOpen = openUnquoted;
    openUnquoted = -1;
    const prevBody = inBody;
    inBody = false;
    /** This line (`at`) is refused: the unquoted value right before it may be cut, so it is refused too. */
    const goesOn = (at: number): void => {
      if (prevOpen >= 0 && rows[prevOpen]!.status === 'ok') {
        rows[prevOpen] = { line: rows[prevOpen]!.line, key: rows[prevOpen]!.key, status: 'continued', next: at };
        values[prevOpen] = '';
      }
    };
    const line = s.trimEnd();
    const eqName = equalsOnlyName(line);
    const open = prevOpen >= 0 && rows[prevOpen]!.status === 'ok' ? values[prevOpen]! : null;
    const eqMaterial = eqName !== null && (!equalsEntry(eqName) || prevBody || (open !== null && equalsMaterialAfter(eqName, open)));
    if (eqName !== null ? eqMaterial : material(line)) {
      goesOn(i + 1);
      inBody = true;
      rows.push({ line: i + 1, key: '', status: 'continuation' });
      values.push('');
      continue;
    }
    const ex = /^export[ \t]+/.exec(s);
    if (ex && s.slice(ex[0].length).includes('=') && !/^export[ \t]*=/.test(s)) s = s.slice(ex[0].length);
    const eq = s.indexOf('=');
    if (eq < 0) {
      goesOn(i + 1);
      inBody = true;
      rows.push({ line: i + 1, key: '', status: 'no_equals' });
      values.push('');
      continue;
    }
    const key = s.slice(0, eq).trim();
    const after = s.slice(eq + 1);
    const rhs = after.trimStart();
    const start = i;
    let value: string;
    let trailing = false;
    const quotedRhs = rhs.startsWith("'") || rhs.startsWith('"');
    if (quotedRhs) {
      const q = rhs[0] as "'" | '"';
      const r = quoted(lines, i, rhs, q, work);
      if (!r) return { ok: false, why: 'quote', line: start + 1 };
      value = r.value;
      i = r.endLine;
      trailing = !/^\s*(?:#.*)?$/.test(r.rest);
      if (value.includes('${')) interpolation = true;
    } else {
      value = unquoted(after);
      if (value.includes('${')) interpolation = true;
      openUnquoted = rows.length;
    }
    const problem = nameProblem(key);
    const status: RowStatus = problem ? 'invalid' : trailing ? 'trailing' : !value ? 'empty' : 'ok';
    // Not a name (fails the .env rule, or none before =): this line may be more of the unquoted value before it.
    if (problem === 'env' || problem === 'empty') goesOn(start + 1);
    // An empty unquoted `NAME=` (or a name too long) that can be the one-= last line of the base64-looking value
    // before it (canBeTail): that value is refused as cut, never sent as its first line alone.
    // Fails safe: the few token values that pass both base64 checks read refused.
    else if ((status === 'empty' || (problem === 'too_long' && !value)) && !quotedRhs && open !== null && canBeTail(open, key))
      goesOn(start + 1);
    // A name that fails keeps no text from here on: what stands before its = may be part of a value.
    rows.push({ line: start + 1, key: problem ? '' : key, status, ...(problem ? { problem } : {}) });
    values.push(status === 'ok' ? value : '');
  }
  // The last line of a name wins (a refused one too: then nothing of that name is sent); every earlier sendable line is
  // replaced by it. An earlier refused line keeps its own reason.
  const last = new Map<string, number>();
  rows.forEach((r, n) => {
    if (r.key) last.set(r.key, n);
  });
  for (let n = 0; n < rows.length; n++) {
    const r = rows[n]!;
    if (r.status !== 'ok') continue;
    const w = last.get(r.key)!;
    if (w !== n) {
      rows[n] = { line: r.line, key: r.key, status: 'replaced', replacedBy: rows[w]!.line };
      values[n] = '';
    }
  }
  // Only a row that can be sent or was replaced shows its name; a refused row is its line number and reason only.
  for (let n = 0; n < rows.length; n++) {
    const r = rows[n]!;
    if (r.status !== 'ok' && r.status !== 'replaced' && r.key) rows[n] = { ...r, key: '' };
  }
  if (rows.length === 0) return { ok: false, why: 'nothing' };
  // 200 rows of any status: the preview lists every row, so the cap bounds what it renders too.
  const count = rows.length;
  if (count > IMPORT_MAX_ROWS) return { ok: false, why: 'rows', count };
  return { ok: true, rows, values, interpolation };
}

/** Minutes a run of `writes` writes is expected to take at the vault's write rate (0: under a minute). */
export function expectedMinutes(writes: number): number {
  return writes <= IMPORT_WRITES_PER_MIN ? 0 : Math.ceil(writes / IMPORT_WRITES_PER_MIN);
}

/**
 * What one import holds between the parse and the last send: its values (aligned with its rows) and the one password.
 * Never React state: the dialog keeps it in a ref. dropImport empties it and forgets it; a dropped holder reads as
 * empty, so a late reader sends nothing it should not.
 */
export interface ImportHeld {
  values: string[];
  password: string;
}

const live = new Set<ImportHeld>();

export function holdImport(values: readonly string[]): ImportHeld {
  const h: ImportHeld = { values: [...values], password: '' };
  live.add(h);
  return h;
}

export function dropImport(h: ImportHeld | null | undefined): void {
  if (!h) return;
  h.values.fill('');
  h.values.length = 0;
  h.password = '';
  live.delete(h);
}

/** Tests: what every live holder still keeps (counts only). */
export function importHeldForTests(): { values: number; passwords: number } {
  let values = 0;
  let passwords = 0;
  for (const h of live) {
    values += h.values.filter((v) => v !== '').length;
    if (h.password) passwords++;
  }
  return { values, passwords };
}
