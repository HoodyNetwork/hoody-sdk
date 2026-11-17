// A chat's shell jobs from its session stream: read only. Shell jobs are not tasks and
// have no stop of their own over HTTP; they stop with the chat's Stop (or Stop all), and their rows say so.
//
// Two events carry them, both free-form until the agent publishes the shapes, so every field is read defensively:
// - event.bash_job_list {jobs: [{id, command?, running, interactive, exit?}] | null}: a whole snapshot of the attachable
//   jobs (null when there are none: the agent sends its empty list so), sent only when some client asks for it. It
//   replaces the set: a known id keeps the time it was first seen, an id missing from it drops out.
// - event.bash_job_output {job_id, data? (base64 pty bytes), gap?, eof?, exit?}: a chunk for an attached viewer. It only
//   updates a job the last list named (a row is never made up from output). Chunks split anywhere (inside a character,
//   an escape sequence or a line), so each job keeps the unfinished line raw and the bytes of an unfinished character
//   until the next chunk; a line is cleaned only once it is whole or is the newest text. eof finishes the job.
// No start time is sent, so a row's age is how long this page has seen the job.
import { stringOrEmpty as str } from '@core';
import { clean } from './code';

/** The reducer's own state for a job's output; not for display. */
export interface ShellJobStream {
  /** The newest line so far, raw (escapes included), not yet ended by a newline. */
  carry: string;
  /** The bytes of a character the last chunk ended inside (0-3, one char per byte). */
  utf8: string;
  /** The carry's start was cut (a chunk or line past the bounds): its text is not trusted until the next line. */
  cut: boolean;
}

export interface ShellJobRow {
  id: string;
  /** The command, cleaned and capped; '' when the agent sent none. */
  name: string;
  running: boolean;
  /** The exit text once finished ('' while running or when none was sent). */
  exit: string;
  /** When this page first saw the job (ms). */
  seenAt: number;
  /** The output's last non-empty line, cleaned and capped ('' until output arrives). */
  lastLine: string;
  stream: ShellJobStream;
}

export const MAX_SHELL_JOBS = 50;
const NAME_MAX = 200;
const LINE_MAX = 200;
/** The most of one chunk read, in base64 characters (a multiple of 4): 256 KiB of bytes, the agent's own most for one
 *  chunk, so a real chunk is never cut. More (input no agent sends) is cut from the front. */
export const CHUNK_B64_MAX = 349_528;
/** The longest unfinished line kept raw; past it the carry is compacted (compact()). */
const CARRY_MAX = 8_192;
const EMPTY: ShellJobStream = { carry: '', utf8: '', cut: false };

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
/** A raw line's last visible text: cleaning turns a lone carriage return (a progress redraw) into a line end too. */
function visible(raw: string): string {
  const parts = clean(raw).text.split('\n');
  for (let i = parts.length - 1; i >= 0; i--) {
    const l = (parts[i] ?? '').trim();
    if (l) return l;
  }
  return '';
}

/** Whether a following character would be read as part of an escape sequence still open at the end of `raw`: it adds
 *  nothing to the cleaned text then (the text may itself end in that character, so the lengths are compared). */
const isOpen = (raw: string) => clean(`${raw}X`).text.length === clean(raw).text.length;
const lastIntro = (s: string, from: number) => Math.max(s.lastIndexOf('\u001b', from), s.lastIndexOf('\u009b', from));
/** The most introducers tried when looking for where an open sequence starts (each try cleans the line once). */
const OPEN_TRIES = 32;

/**
 * Where the escape sequence still open at the end of `carry` starts: -1 when none is open, -2 when its start is more than
 * CARRY_MAX back or past OPEN_TRIES introducers (an introducer inside an open OSC's payload is part of it, not a start).
 * A start is an introducer whose text before it leaves nothing open, read with the cleaner's own context.
 */
function openStart(carry: string): number {
  if (!isOpen(carry)) return -1;
  let e = lastIntro(carry, carry.length);
  for (let n = 0; e >= 0 && carry.length - e <= CARRY_MAX && n < OPEN_TRIES; n++, e = lastIntro(carry, e - 1)) {
    if (e === 0 || !isOpen(carry.slice(0, e))) return e;
  }
  return -2;
}

/** The last `max` characters of `s`, never starting inside a surrogate pair. */
function tailOf(s: string, max: number): string {
  const t = s.slice(-max);
  const c = t.charCodeAt(0);
  return c >= 0xdc00 && c <= 0xdfff ? t.slice(1) : t;
}

/**
 * An unfinished line past CARRY_MAX, made small without losing what it shows: everything before its escape sequence that
 * is still open is cleaned now, with its whole context, and only its newest visible part is kept (with a redraw mark when
 * more followed it, so the next text starts a new part; trailing blanks are kept up to LINE_MAX so later text stays
 * apart); the open sequence stays raw so the next chunk can finish it. An open sequence whose start is too far back (no
 * agent output) is cleaned away with the rest (the cleaner hides an unfinished sequence) and the line marked cut.
 */
function compact(carry: string): { carry: string; cut: boolean } {
  const e = openStart(carry);
  const tail = e >= 0 ? carry.slice(e) : '';
  const head = e >= 0 ? carry.slice(0, e) : carry;
  const parts = clean(head).text.split('\n');
  let k = parts.length - 1;
  while (k >= 0 && !(parts[k] ?? '').trim()) k--;
  let seg = '';
  if (k >= 0) {
    const part = parts[k] ?? '';
    const text = part.trimEnd();
    seg = tailOf(text, LINE_MAX) + part.slice(text.length, text.length + LINE_MAX);
  }
  return { carry: seg + (k >= 0 && k < parts.length - 1 ? '\r' : '') + tail, cut: e === -2 };
}

/** How many of the last bytes (chars 0-255) start a UTF-8 character the bytes end inside. */
function unfinished(bin: string): number {
  for (let k = 1; k <= Math.min(3, bin.length); k++) {
    const c = bin.charCodeAt(bin.length - k);
    if ((c & 0xc0) === 0x80) continue; // a continuation byte: look further back
    const need = c >= 0xf0 ? 4 : c >= 0xe0 ? 3 : c >= 0xc0 ? 2 : 1;
    return need > k ? k : 0;
  }
  return 0;
}

function toBytes(bin: string): Uint8Array {
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

/** The stream after one chunk, and the newest visible line in it ('' when none); null when the chunk is not base64. */
function feed(st: ShellJobStream, b64: string, gap: boolean): { stream: ShellJobStream; line: string } | null {
  let cut = false;
  let enc = b64;
  if (enc.length > CHUNK_B64_MAX) {
    enc = enc.slice(enc.length - CHUNK_B64_MAX);
    cut = true;
  }
  let bin: string;
  try {
    bin = atob(enc);
  } catch {
    return null;
  }
  // A gap (the viewer fell behind) or a cut front: what came before is not continued.
  const from: ShellJobStream = gap || cut ? { carry: '', utf8: '', cut: true } : st;
  const all = from.utf8 + bin;
  const keep = unfinished(all);
  const text = new TextDecoder('utf-8', { fatal: false }).decode(toBytes(all.slice(0, all.length - keep)));
  const lines = (from.carry + text).split('\n');
  let carry = lines.pop() ?? '';
  // The first piece continues the carry: when its start was cut, its front is not known, so it is never shown. That
  // piece is the carry itself while no newline came, else the first finished line.
  const hideCarry = from.cut && lines.length === 0;
  const firstCut = from.cut && lines.length > 0;
  // nextCut carries forward: the line's start is not known (hideCarry), or compaction dropped an open sequence whose rest
  // will arrive as text. The latter still shows what came before that sequence now.
  let nextCut = hideCarry;
  if (carry.length > CARRY_MAX) {
    const c = compact(carry);
    carry = c.carry;
    nextCut = nextCut || c.cut;
  }
  let line = hideCarry ? '' : visible(carry);
  for (let i = lines.length - 1; i >= (firstCut ? 1 : 0) && !line; i--) line = visible(lines[i] ?? '');
  return { stream: { carry, utf8: all.slice(all.length - keep), cut: nextCut }, line: line ? clean(line, LINE_MAX).text : '' };
}

/** The rows after one stream event; any other event, or a payload that does not read, returns `rows` unchanged. */
export function reduceShellJobs(rows: readonly ShellJobRow[], ev: unknown, now: number): readonly ShellJobRow[] {
  if (!isObj(ev) || !isObj(ev.data)) return rows;
  const d = ev.data;
  if (ev.type === 'event.bash_job_list') {
    // null is the agent's empty list; any other non-array does not read.
    const jobs = d.jobs === null ? [] : d.jobs;
    if (!Array.isArray(jobs)) return rows;
    const known = new Map(rows.map((r) => [r.id, r]));
    const next: ShellJobRow[] = [];
    const seen = new Set<string>();
    for (const j of jobs) {
      if (next.length >= MAX_SHELL_JOBS) break;
      if (!isObj(j)) continue;
      const id = str(j.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const was = known.get(id);
      const running = j.running === true;
      next.push({
        id,
        name: clean(str(j.command), NAME_MAX).text.trim(),
        running,
        exit: running ? '' : clean(str(j.exit), 40).text,
        seenAt: was ? was.seenAt : now,
        lastLine: was ? was.lastLine : '',
        stream: was ? was.stream : EMPTY,
      });
    }
    return next;
  }
  if (ev.type === 'event.bash_job_output') {
    const id = str(d.job_id);
    const i = rows.findIndex((r) => r.id === id);
    if (!id || i < 0) return rows;
    const r = rows[i]!;
    const gap = d.gap === true;
    const fed = typeof d.data === 'string' && d.data ? feed(r.stream, d.data, gap) : null;
    const done = d.eof === true;
    // A gap with no bytes still ends what came before: the next text starts a line whose start is not known.
    const reset = gap && !fed;
    if (!fed && !done && !reset) return rows;
    const next = rows.slice();
    next[i] = {
      ...r,
      stream: fed ? fed.stream : reset ? { carry: '', utf8: '', cut: true } : r.stream,
      lastLine: fed?.line || r.lastLine,
      running: done ? false : r.running,
      exit: done ? clean(str(d.exit), 40).text : r.exit,
    };
    return next;
  }
  return rows;
}
