// Creating a workflow: the name rules, what a create's answer means, and what a lost
// create's Check again can prove. No UI here: the New workflow drawer builds on it.
//   - A name is checked before anything is sent (sendCreate refuses a name with a problem, sending nothing): not blank, no space at either end, at most NAME_MAX characters, no
//     control character (the agent refuses those), no `/`, `\` or `%` (they would change the request's path), not `.` or
//     `..`, and not exactly "runs" (reserved: GET /workflows/runs is the run list; "Runs" is a usable name).
//   - A name already in the list is advice only (`nameTaken`): the agent decides, and refuses with already_exists before
//     writing anything. A match that differs only in case is told apart, since both may exist.
//   - The answer (createOutcome): `created` only on an affirmative envelope (is_error === false with its output); a 2xx
//     without one (an empty body, no is_error) proves nothing and is `unknown`; already_exists is `exists`; the other listed refusals, and
//     anything core did not send, are `refused` (nothing was written); an answer that was lost, or an error that may have
//     come after the write, is `unknown`. Unknown is never sent again (C9).
//   - Check again (checkCreate) only reads. Only a read showing a workflow of that name that holds exactly what was sent
//     (holdsSent, the agent's own input rules) proves the create; anything else (another workflow, none yet, a failed read)
//     proves nothing, and the create stays unknown with what was seen. A create the read does not show may still land.
import { holdsSent, sourceOf } from './source';
import type { Settled } from './sourceApi';

/** The longest name taken here (characters). */
export const NAME_MAX = 64;

export type NameProblem = 'empty' | 'spaces' | 'long' | 'control' | 'chars' | 'dots' | 'reserved';

// C0, DEL and C1 controls (the agent's firstControlChar refuses them), and the line and paragraph separators.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const PATH_CHARS = /[/\\%]/;

/** What is wrong with `name`, or null when it can be sent. */
export function nameProblem(name: string): NameProblem | null {
  if (name.trim() === '') return 'empty';
  if (name !== name.trim()) return 'spaces';
  if ([...name].length > NAME_MAX) return 'long';
  if (CONTROL.test(name)) return 'control';
  if (PATH_CHARS.test(name)) return 'chars';
  if (name === '.' || name === '..') return 'dots';
  if (name === 'runs') return 'reserved';
  return null;
}

/** Advice only: `name` is in the list (`same`), or a name differing only in case is (`case`). */
export function nameTaken(name: string, listed: readonly string[]): 'same' | 'case' | null {
  if (listed.includes(name)) return 'same';
  const low = name.toLowerCase();
  return listed.some((n) => n.toLowerCase() === low) ? 'case' : null;
}

export type CreateOutcome =
  | { k: 'created' }
  | { k: 'exists' }
  | { k: 'refused'; code: string; reason?: string }
  | { k: 'unknown' };

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The agent's own word that the create ran: a tool envelope with is_error === false and its output. */
export function affirmative(body: unknown): boolean {
  return obj(body) && body.is_error === false && typeof body.output === 'string';
}

/** What a create's answer means. */
export function createOutcome(s: Settled): CreateOutcome {
  if (s.ok) return affirmative(s.body) ? { k: 'created' } : { k: 'unknown' };
  const e = s.err;
  if (e.notApplied && e.code === 'already_exists') return { k: 'exists' };
  if (e.notApplied || e.kind === 'not_sent' || e.kind === 'stale' || e.kind === 'failed') {
    return { k: 'refused', code: e.notApplied || e.kind === 'failed' ? e.code : e.kind, ...(e.reason ? { reason: e.reason } : {}) };
  }
  return { k: 'unknown' };
}

export type CheckResult = { k: 'created' } | { k: 'unknown'; seen: 'other' | 'none' | 'unread' };

/** What a Check again read (`read`, the workflow with its revision) proves about the create that sent `sent`. */
export function checkCreate(read: Settled, sent: Record<string, unknown>): CheckResult {
  if (!read.ok) return { k: 'unknown', seen: read.err.status === 404 || read.err.code === 'not_found' ? 'none' : 'unread' };
  const doc = sourceOf(read.body);
  if (!doc) return { k: 'unknown', seen: 'unread' };
  return holdsSent(doc.content, sent) ? { k: 'created' } : { k: 'unknown', seen: 'other' };
}
