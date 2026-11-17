// The settings an agent keeps only in its file: the lines between the two `---` at its top that no agent route sets on
// their own (temperature, reply format, the two limits and the wait for an answer). Pure: no React, no requests.
//
// The Hub edits one such line and saves the whole file (source.ts: checked against the revision it was read at). The
// agent's save checks only a few of these lines and its loader ignores a value it cannot use without saying so, so
// the Hub checks every value before it writes one, and says so when the file already holds one the agent ignores.
//
//   - The split is the agent's own for a rewrite: the first line is exactly `---` (a trailing CR allowed) and a later
//     line is too. A file without both is never edited here.
//   - A line is `key: value`, cut at its first colon, both sides trimmed (the agent's line scan). A key written on two
//     lines is not edited here (the agent takes the last one; the person decides which to keep, in the file).
//   - A write changes one line and nothing else: every other byte, the body and each line's own ending stay as read.
//     Setting a key that has no line adds it right before the closing `---`; clearing a key removes its line.
//   - What may be written is narrower than what the agent reads: plain decimals and whole numbers within the agent's
//     own authoring bounds. What is read is judged by the loader's rules, so a value the agent uses never reads as ignored.

export const FILE_KEYS = ['temperature', 'response_format', 'max_steps_per_turn', 'compaction_max_tokens', 'ask_timeout'] as const;
export type FileKey = (typeof FILE_KEYS)[number];

/** The agent's bounds (step limit, compaction cap, helper gates, model settings). */
export const TEMPERATURE_MAX = 2;
export const MAX_STEPS_LIMIT = 1_000_000;
export const COMPACTION_MIN = 8192;
export const COMPACTION_MAX = 1_000_000_000;
export const ASK_TIMEOUT_MAX_S = 24 * 60 * 60;
export const REPLY_JSON = 'json_object';
/** The longest value read or written for one of these lines. */
const VALUE_MAX = 64;

export type Split =
  | { ok: true; lines: readonly string[]; close: number }
  /** `none`: the file does not start with `---`. `unclosed`: no later `---` line. */
  | { ok: false; why: 'none' | 'unclosed' };

const isDelim = (line: string): boolean => (line.endsWith('\r') ? line.slice(0, -1) : line) === '---';

/** The file as lines and the index of the closing `---`. */
export function splitFile(content: string): Split {
  const lines = content.split('\n');
  if (!isDelim(lines[0] ?? '')) return { ok: false, why: 'none' };
  for (let i = 1; i < lines.length; i++) if (isDelim(lines[i]!)) return { ok: true, lines, close: i };
  return { ok: false, why: 'unclosed' };
}

/** A settings line's key and value (cut at the first colon, trimmed), or null when the line has no colon or no key. */
function kv(line: string): { key: string; value: string } | null {
  const at = line.indexOf(':');
  if (at < 0) return null;
  const key = line.slice(0, at).trim();
  return key === '' ? null : { key, value: line.slice(at + 1).trim() };
}

export type KeyRead =
  | { state: 'absent' }
  | { state: 'set'; raw: string; line: number }
  /** The key is on more than one line. */
  | { state: 'twice' };

/** Where `key` is set in the file's settings block. */
export function readKey(split: Extract<Split, { ok: true }>, key: FileKey): KeyRead {
  let found: KeyRead = { state: 'absent' };
  for (let i = 1; i < split.close; i++) {
    const p = kv(split.lines[i]!);
    if (!p || p.key !== key) continue;
    if (found.state !== 'absent') return { state: 'twice' };
    found = { state: 'set', raw: p.value, line: i };
  }
  return found;
}

// ── values ──

const DECIMAL = /^[0-9]+(?:\.[0-9]+)?$/;
const WHOLE = /^[0-9]+$/;
// What the agent's number parsers take beyond a plain decimal: a sign and an exponent.
const FLOAT = /^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;
const INT = /^[+-]?[0-9]+$/;
// A duration as the agent's parser reads it: one or more number-and-unit parts ("1h30m", "1.5h", "90s").
const DURATION = /^[+-]?(?:(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:ns|us|µs|μs|ms|s|m|h))+$/;
const PART = /([0-9]+\.?[0-9]*|\.[0-9]+)(ns|us|µs|μs|ms|s|m|h)/g;
const UNIT_S: Readonly<Record<string, number>> = { ns: 1e-9, us: 1e-6, 'µs': 1e-6, 'μs': 1e-6, ms: 1e-3, s: 1, m: 60, h: 3600 };

/** A wait as seconds: a duration ("10m", "1h30m") or a whole number of seconds; null when it is neither. */
export function durationSeconds(text: string): number | null {
  const v = text.trim();
  if (v === '' || v.length > VALUE_MAX) return null;
  if (INT.test(v)) return Number(v);
  if (!DURATION.test(v)) return null;
  let total = 0;
  for (const m of v.matchAll(PART)) total += Number(m[1]) * UNIT_S[m[2]!]!;
  return v.startsWith('-') ? -total : total;
}

/** Whether the agent uses `raw` as the value of `key` (its loader's rules); a value it cannot use is ignored by it. */
export function agentUses(key: FileKey, raw: string): boolean {
  const v = raw.trim();
  if (v === '' || v.length > VALUE_MAX) return false;
  switch (key) {
    case 'temperature': {
      if (!FLOAT.test(v)) return false;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 && n <= TEMPERATURE_MAX;
    }
    case 'response_format':
      return v === REPLY_JSON;
    case 'max_steps_per_turn':
      return INT.test(v) && Number.isSafeInteger(Number(v)) && Number(v) >= 1;
    case 'compaction_max_tokens':
      return INT.test(v) && Number.isSafeInteger(Number(v)) && Number(v) >= COMPACTION_MIN;
    case 'ask_timeout': {
      const s = durationSeconds(v);
      return s !== null && s > 0 && s <= ASK_TIMEOUT_MAX_S;
    }
  }
}

/** Why a typed value is not written. */
export type InputProblem = 'notNumber' | 'notWhole' | 'tooLow' | 'tooHigh' | 'notDuration' | 'notChoice';
export type Checked =
  /** `value` null: the line is removed (the agent's default applies). */
  | { ok: true; value: string | null }
  | { ok: false; why: InputProblem };

const whole = (v: string, min: number, max: number): Checked => {
  if (!WHOLE.test(v)) return { ok: false, why: /^-[0-9]+$/.test(v) ? 'tooLow' : DECIMAL.test(v) ? 'notWhole' : 'notNumber' };
  // Leading zeros are dropped; a number too long to be exact is over every bound here.
  const n = v.length > 15 ? Infinity : Number(v);
  if (n < min) return { ok: false, why: 'tooLow' };
  if (n > max) return { ok: false, why: 'tooHigh' };
  return { ok: true, value: String(n) };
};

/** What the Hub writes for `key` from what the person typed or chose. Empty means "no line". */
export function checkInput(key: FileKey, text: string): Checked {
  const v = text.trim();
  if (v === '') return { ok: true, value: null };
  if (v.length > VALUE_MAX) return { ok: false, why: key === 'ask_timeout' ? 'notDuration' : key === 'response_format' ? 'notChoice' : 'notNumber' };
  switch (key) {
    case 'temperature': {
      if (!DECIMAL.test(v)) return { ok: false, why: /^-/.test(v) && FLOAT.test(v) ? 'tooLow' : 'notNumber' };
      const n = Number(v);
      if (n > TEMPERATURE_MAX) return { ok: false, why: 'tooHigh' };
      return { ok: true, value: String(n) };
    }
    case 'response_format':
      return v === REPLY_JSON ? { ok: true, value: REPLY_JSON } : { ok: false, why: 'notChoice' };
    case 'max_steps_per_turn':
      return whole(v, 1, MAX_STEPS_LIMIT);
    case 'compaction_max_tokens':
      return whole(v, COMPACTION_MIN, COMPACTION_MAX);
    case 'ask_timeout': {
      const s = durationSeconds(v);
      if (s === null) return { ok: false, why: 'notDuration' };
      if (s <= 0) return { ok: false, why: 'tooLow' };
      if (s > ASK_TIMEOUT_MAX_S) return { ok: false, why: 'tooHigh' };
      return { ok: true, value: v };
    }
  }
}

/** One setting as the file holds it. */
export type FileValue =
  /** No line: the agent's default. */
  | { state: 'default' }
  | { state: 'set'; raw: string }
  /** A line whose value the agent ignores. */
  | { state: 'ignored'; raw: string }
  | { state: 'twice' };

/** Every file-only setting of a file, or why the file's settings cannot be read line by line. */
export function fileValues(content: string): { ok: true; values: Record<FileKey, FileValue> } | { ok: false; why: 'none' | 'unclosed' } {
  const split = splitFile(content);
  if (!split.ok) return split;
  const values = {} as Record<FileKey, FileValue>;
  for (const key of FILE_KEYS) {
    const r = readKey(split, key);
    values[key] = r.state === 'absent' ? { state: 'default' } : r.state === 'twice' ? { state: 'twice' } : { state: agentUses(key, r.raw) ? 'set' : 'ignored', raw: r.raw.length > VALUE_MAX ? `${r.raw.slice(0, VALUE_MAX - 1)}…` : r.raw };
  }
  return { ok: true, values };
}

export type Written =
  | { ok: true; content: string }
  /** Nothing is written: the file has no settings block (`none`, `unclosed`), names the key twice (`twice`), or the
   *  value is not one the Hub writes (`value`). */
  | { ok: false; why: 'none' | 'unclosed' | 'twice' | 'value' };

/** `content` with `key` set to `value` (null: its line removed) and every other byte as it was. `value` must be one
 *  checkInput returned: a value with a line break, or one the agent would ignore, is refused. */
export function writeKey(content: string, key: FileKey, value: string | null): Written {
  if (value !== null && (/[\r\n]/.test(value) || value !== value.trim() || !agentUses(key, value))) return { ok: false, why: 'value' };
  const split = splitFile(content);
  if (!split.ok) return split;
  const at = readKey(split, key);
  if (at.state === 'twice') return { ok: false, why: 'twice' };
  const lines = [...split.lines];
  if (at.state === 'set') {
    const cr = lines[at.line]!.endsWith('\r') ? '\r' : '';
    if (value === null) lines.splice(at.line, 1);
    else lines[at.line] = `${key}: ${value}${cr}`;
  } else if (value !== null) {
    // The new line ends as the closing `---` does.
    const cr = lines[split.close]!.endsWith('\r') ? '\r' : '';
    lines.splice(split.close, 0, `${key}: ${value}${cr}`);
  }
  return { ok: true, content: lines.join('\n') };
}
