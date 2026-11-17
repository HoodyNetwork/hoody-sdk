// New script's Settings step, the pure part (split out of StepSettings.tsx so the terminal build shares it; the notes
// are at the top of StepSettings.tsx): the settings fields, the print reply, edits, the verified text, comments and
// putInCode. StepSettings.tsx re-exports the public names; labelOf and categoryOf are for StepSettings.tsx.
import { sha256Hex, type MutationResult } from '@core';
import { patchOf, type Draft, type Field, type Problem, type Schema } from '../magic';
import strings from '../strings.en.json';

const table = strings as Record<string, string>;
export const labelOf = (key: string): string => table[`magic.f.${key}`] ?? key;
export const categoryOf = (c: string): string => table[`magic.cat.${c}`] ?? c;

/** Step 2 owns the schedule; secrets are never typed into a header from here. */
const ELSEWHERE = new Set(['schedule']);
export const settingsFields = (schema: Schema): Field[] => schema.fields.filter((x) => x.kind !== 'secret' && x.kind !== 'readonly' && !ELSEWHERE.has(x.key));

// ── print's answer, mirrored ────────────────────────────────────────────────────────────

export type PrintEdit =
  | { op: 'replace'; line: number; column: number; text: string }
  | { op: 'delete'; line: number }
  | { op: 'insert'; line: number; text: string };
export interface PrintReply {
  edits: PrintEdit[];
  verify: { lines: number; sha256?: string };
}

const rec = (x: unknown): Record<string, unknown> | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const int = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);

/** print's answer, or null when it is not one. */
export function printReplyOf(x: unknown): PrintReply | null {
  const o = rec(x);
  const v = rec(o?.verify);
  if (!o || !Array.isArray(o.edits) || !v || !int(v.lines)) return null;
  const edits: PrintEdit[] = [];
  for (const e of o.edits) {
    const r = rec(e);
    if (!r || !int(r.line)) return null;
    if (r.op === 'replace' && int(r.column) && r.column >= 0 && typeof r.text === 'string') edits.push({ op: 'replace', line: r.line, column: r.column, text: r.text });
    else if (r.op === 'insert' && typeof r.text === 'string') edits.push({ op: 'insert', line: r.line, text: r.text });
    else if (r.op === 'delete') edits.push({ op: 'delete', line: r.line });
    else return null;
  }
  return { edits, verify: { lines: v.lines, ...(typeof v.sha256 === 'string' ? { sha256: v.sha256 } : {}) } };
}

/**
 * The edits applied to the text they were made for, as exec documents it: split on "\n", by posted line (an insert at L
 * goes after line L, 0 = the top; a line's replace or delete comes before its inserts), join with "\n". A line ending's
 * "\r" is kept. null when an edit is outside the text or a line has two.
 */
export function applyEdits(text: string, edits: readonly PrintEdit[]): string | null {
  const posted = text.split('\n');
  const changes = new Map<number, PrintEdit>();
  const inserts = new Map<number, string[]>();
  for (const e of edits) {
    const min = e.op === 'insert' ? 0 : 1;
    if (e.line < min || e.line > posted.length) return null;
    if (e.op === 'insert') inserts.set(e.line, [...(inserts.get(e.line) ?? []), e.text]);
    else if (changes.has(e.line)) return null;
    else changes.set(e.line, e);
  }
  const out: string[] = [];
  const cr = (i: number) => ((posted[i] ?? '').endsWith('\r') ? '\r' : '');
  const after = (line: number) => {
    for (const t of inserts.get(line) ?? []) out.push(t + cr(Math.max(line - 1, 0)));
  };
  after(0);
  posted.forEach((line, i) => {
    const e = changes.get(i + 1);
    if (e === undefined) out.push(line);
    else if (e.op === 'replace') {
      const end = cr(i);
      const body = end ? line.slice(0, -1) : line;
      out.push(body.slice(0, e.column) + e.text + end);
    }
    after(i + 1);
  });
  return out.join('\n');
}

/** The text with print's edits, or null when the result is not the one exec made (its line count, and its digest when sent). */
export async function verifiedText(text: string, reply: PrintReply | null): Promise<string | null> {
  if (!reply) return null;
  const out = applyEdits(text, reply.edits);
  if (out === null || out.split('\n').length !== reply.verify.lines) return null;
  if (reply.verify.sha256 !== undefined && (await sha256Hex(out)) !== reply.verify.sha256) return null;
  return out;
}

/** parse's answer as the values the code's header sets now (only lines exec applies; nothing from a line naming a secret). */
export function commentsOf(x: unknown): Record<string, unknown> | null {
  const o = rec(x);
  if (!o || !Array.isArray(o.directives)) return null;
  const out: Record<string, unknown> = {};
  for (const d of o.directives) {
    const r = rec(d);
    if (!r || typeof r.key !== 'string' || r.in_force !== true || r.redacted || r.secret || !('value' in r)) continue;
    out[r.key] = r.value;
  }
  return out;
}

export type PutNote = 'refused' | 'unknown' | 'mismatch' | 'moved';
export type Put = { text: string } | { problems: Record<string, Problem> } | { note: PutNote; key: string | null };
type Run = (text: string, set: Record<string, unknown>) => Promise<MutationResult<unknown> | null>;

const keyOf = (r: MutationResult<unknown>): string | null => {
  const d = rec(r.error?.details) ?? rec(r.error?.data);
  const k = typeof d?.directive === 'string' ? d.directive.replace(/^@/, '') : null;
  return k && /^[a-z][a-z0-9-]*$/.test(k) ? k : null;
};

/** The draft written into the code by print. Only an answered refusal says "refused"; any other non-answer is unknown. */
export async function putInCode(code: string, schema: Schema, draft: Draft, print: Run): Promise<Put> {
  const built = patchOf(schema, draft);
  if ('problems' in built) return built;
  const r = await print(code, built.patch).catch(() => null);
  if (!r || r.outcome !== 'done') return { note: r?.outcome === 'failed' ? 'refused' : 'unknown', key: r ? keyOf(r) : null };
  const text = await verifiedText(code, printReplyOf(r.data));
  return text === null ? { note: 'mismatch', key: null } : { text };
}
