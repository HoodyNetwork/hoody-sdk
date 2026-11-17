// Claude Code sign-in and settings copies: the plain part, kept apart from the drawers so every rule
// is tested without a browser. The agent plans a copy (a preview: what it would write, and what the target already holds,
// with a single-use token valid for ten minutes) and applies only that plan. Rules here:
//   - A preview answer is read defensively: anything that is not a whole plan is no plan (nothing can be applied). A
//     sign-in plan names the path it writes on the target: consent to replace is never asked without it.
//   - An apply needs the plan's token, a token that has not expired, and the person's consent for every file the target
//     already holds (or that could not be checked). Consent is per path: only the ticked paths of the plan go in overwrite.
//   - An apply's answer: done; a stale plan or a target that changed (nothing written; preview again); a refusal of the
//     request or the source (nothing written); or pending (C9: the copy may have written part or all of it, so the next step
//     is a new preview, which shows the target as it is now; the apply is never sent again). A 200 is done only as a whole
//     receipt: a login that says it imported, files whose lists agree with their count. Any other 200 proves nothing, so it
//     is pending too (never a refusal, never an invented zero-file success).
import type { Settled } from '../../types';

export type TargetState = 'absent' | 'present' | 'unknown';

/** Where the files are read from: the computer this agent runs on, or another computer of the realm. */
export type Source = { kind: 'host' } | { kind: 'container'; id: string };

interface PlanBase {
  token: string;
  /** Unix ms. */
  expiresMs: number;
}

export interface LoginPlan extends PlanBase {
  targetPath: string;
  targetState: TargetState;
  bytes: number;
  /** The agent's masked outline of the file: field names and a fingerprint, never a value. */
  outline: string;
}

export interface FilePlanRow {
  path: string;
  size: number;
  targetState: TargetState;
}

export interface FilesPlan extends PlanBase {
  mode: 'file' | 'dir';
  totalBytes: number;
  files: FilePlanRow[];
}

const STATES: readonly TargetState[] = ['absent', 'present', 'unknown'];
const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);
const state = (v: unknown): TargetState | null => (STATES.includes(v as TargetState) ? (v as TargetState) : null);
const token = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' && v.length <= 512 ? v : null);

/** A credential import preview, or null when the answer is not a whole plan. */
export function loginPlanOf(body: unknown): LoginPlan | null {
  const b = rec(body);
  if (!b) return null;
  const tk = token(b.preview_token);
  const exp = count(b.expires_ms);
  const st = state(b.target_state);
  const bytes = count(b.bytes);
  const where = typeof b.target_path === 'string' && b.target_path.trim() !== '' ? b.target_path : null;
  if (tk === null || exp === null || st === null || bytes === null || where === null || typeof b.preview !== 'string') return null;
  return { token: tk, expiresMs: exp, targetState: st, bytes, outline: b.preview, targetPath: where };
}

/** A file sync preview, or null when the answer is not a whole plan (a row that cannot be read spoils the plan: a consent
 *  list built from part of it could miss a file the apply would replace). */
export function filesPlanOf(body: unknown): FilesPlan | null {
  const b = rec(body);
  if (!b) return null;
  const tk = token(b.preview_token);
  const exp = count(b.expires_ms);
  const total = count(b.total_bytes);
  const mode = b.mode === 'file' || b.mode === 'dir' ? b.mode : null;
  if (tk === null || exp === null || total === null || mode === null || !Array.isArray(b.files)) return null;
  const files: FilePlanRow[] = [];
  const seen = new Set<string>();
  for (const x of b.files) {
    const r = rec(x);
    const size = r ? count(r.size) : null;
    const st = r ? state(r.target_state) : null;
    if (!r || typeof r.path !== 'string' || r.path === '' || seen.has(r.path) || size === null || st === null) return null;
    seen.add(r.path);
    files.push({ path: r.path, size, targetState: st });
  }
  if (count(b.file_count) !== files.length) return null;
  return { token: tk, expiresMs: exp, mode, totalBytes: total, files };
}

/** The plan can no longer be applied: its token has run out (a little early, so a press at the edge is not refused). */
export const EXPIRY_MARGIN_MS = 5_000;
export function expired(plan: { expiresMs: number }, now: number): boolean {
  return now >= plan.expiresMs - EXPIRY_MARGIN_MS;
}

/** The target holds this file already, or could not be checked: replaced only with the person's consent. */
export const needsConsent = (st: TargetState): boolean => st !== 'absent';

/** The overwrite list an apply sends: the consented paths the plan showed as present or unknown, in the plan's order. A
 *  consent for a path the plan does not hold, or holds as absent, is never sent (the agent refuses it). */
export function overwriteOf(plan: FilesPlan, consent: ReadonlySet<string>): string[] {
  return plan.files.filter((f) => needsConsent(f.targetState) && consent.has(f.path)).map((f) => f.path);
}

/** How many files the apply would write: the absent ones plus the consented ones. */
export function writesOf(plan: FilesPlan, consent: ReadonlySet<string>): number {
  return plan.files.filter((f) => !needsConsent(f.targetState) || consent.has(f.path)).length;
}

/** The paths an apply of this plan may write: the absent ones plus the consented ones (what stays unknown if its answer is lost). */
export function writtenPathsOf(plan: FilesPlan, consent: ReadonlySet<string>): string[] {
  return plan.files.filter((f) => !needsConsent(f.targetState) || consent.has(f.path)).map((f) => f.path);
}

/** A copy whose outcome is not known yet (C9), with the target paths it may have written. `out`: its answer has not come
 *  back; `unknown`: the answer was lost or unreadable; `settled`: a definite answer, or later reads covered every path. */
export interface UnknownCopy {
  id: number;
  op: 'login' | 'files';
  /** The target computer's id, and the realm the copy was sent in (captured at send). */
  to: string;
  realm: string;
  paths: string[];
  unreadable: boolean;
  state: 'out' | 'unknown' | 'settled';
}

/** A successful preview of `to`: each row's path on the target and what the target holds there. */
export interface TargetRead { op: 'login' | 'files'; to: string; realm: string; rows: ReadonlyArray<{ path: string; targetState: TargetState }> }

/** The copies a preview of `to` may settle, taken when the preview is SENT: those of its kind to that computer already
 *  unknown then. A copy still out (its answer not in) may write after the read, so a read never settles it. */
export function eligibleOf(copies: readonly UnknownCopy[], op: UnknownCopy['op'], to: string, realm: string): ReadonlySet<number> {
  return new Set(copies.filter((c) => c.state === 'unknown' && c.op === op && c.to === to && c.realm === realm).map((c) => c.id));
}

/** What a successful preview settles: of the copies eligible when it was sent (eligibleOf) and still unknown, only the
 *  paths the read shows with a known target state (absent or present). A path the read did not cover, or could not check,
 *  stays unknown; a copy is settled only when no path is left. */
export function settleCopies<C extends UnknownCopy>(copies: readonly C[], read: TargetRead, eligible: ReadonlySet<number>): C[] {
  const known = new Set(read.rows.filter((r) => r.targetState !== 'unknown').map((r) => r.path));
  return copies.map((c) => {
    if (!eligible.has(c.id) || c.state !== 'unknown' || c.op !== read.op || c.to !== read.to || c.realm !== read.realm) return c;
    const left = c.paths.filter((p) => !known.has(p));
    if (left.length === c.paths.length) return c;
    return left.length ? { ...c, paths: left } : { ...c, paths: [], state: 'settled' };
  });
}

/** Whether Copy may be pressed: a plan, not expired, and for a login the target's consent when it needs one. */
export function loginApplyable(plan: LoginPlan | null, consent: boolean, now: number): boolean {
  return !!plan && !expired(plan, now) && (!needsConsent(plan.targetState) || consent);
}
export function filesApplyable(plan: FilesPlan | null, consent: ReadonlySet<string>, now: number): boolean {
  return !!plan && !expired(plan, now) && writesOf(plan, consent) > 0;
}

/** A path for a file sync: below the home folder, no leading /, no `..` or empty segment, no NUL (the agent checks again). */
export function pathOk(p: string): boolean {
  const v = p.trim();
  if (v === '' || v.length > 1024 || v.startsWith('/') || v.startsWith('~') || v.includes('\0')) return false;
  return v.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

/** `p` without one trailing "/" (a folder picked from the path field's list ends in one). */
const dropSlash = (p: string): string => (p.endsWith('/') ? p.slice(0, -1) : p);

/** The path a "file or folder" copy asks for, as the path field holds it: a folder's one trailing "/" is dropped; a file's is
 *  kept, so pathOk refuses it. */
export function askedPath(kind: 'file' | 'dir', p: string): string {
  return kind === 'dir' ? dropSlash(p) : p;
}

/** A file path ending in one "/" after folders that are all fine: a folder on the way to the file (picked from the list), not
 *  yet a path to send, and not a wrong one. */
export function onTheWay(kind: 'file' | 'dir', p: string): boolean {
  return kind === 'file' && p.endsWith('/') && pathOk(dropSlash(p));
}

export type ApplyResult<T> =
  | { kind: 'done'; body: T }
  /** Nothing was written: the plan no longer holds (expired, unknown, changed) or the target changed since. Preview again. */
  | { kind: 'stale'; why: 'expired' | 'unknown' | 'changed' | 'target' }
  /** Nothing was written: the agent refused the request or the source. `reason` is the agent's details.reason. */
  | { kind: 'refused'; code: string; reason: string }
  /** The copy may have written part or all of it (C9): the answer was lost, or (`unreadable`) a 200 that is not a whole
   *  receipt. Preview again to see the target. */
  | { kind: 'pending'; unreadable?: true }
  /** The page's context ended while it ran: show nothing. */
  | { kind: 'gone' };

export interface LoginDone { overwrote: boolean; ownerOnly: boolean }
export interface FilesDone { written: string[]; skipped: string[]; bytes: number }

/** A whole list of strings, or null (one element that is not a string spoils it). */
const strings = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null);

/** An apply's answer. A 200 is done only when `done` reads it as a whole receipt; any other 200 proves nothing about what
 *  was written, so it is pending (the token is spent; the next step is a new preview, never a resend). */
export function applyResultOf<T>(r: Settled<unknown>, done: (body: Record<string, unknown>) => T | null): ApplyResult<T> {
  if (r.ok) {
    const b = rec(r.body);
    const d = b ? done(b) : null;
    return d === null ? { kind: 'pending', unreadable: true } : { kind: 'done', body: d };
  }
  const e = r.err;
  if (e.kind === 'stale') return { kind: 'gone' };
  if (e.kind === 'pending') return { kind: 'pending' };
  if (e.code === 'preview_stale') {
    const why = e.details.reason === 'expired' || e.details.reason === 'unknown' ? e.details.reason : 'changed';
    return { kind: 'stale', why };
  }
  if (e.code === 'target_exists') return { kind: 'stale', why: 'target' };
  return { kind: 'refused', code: e.code, reason: e.details.reason ?? '' };
}

/** A credential import's receipt: it says imported, and says whether it replaced a file and made it owner-only. */
export function loginDoneOf(b: Record<string, unknown>): LoginDone | null {
  if (b.imported !== true || typeof b.overwrote !== 'boolean' || typeof b.owner_only !== 'boolean') return null;
  return { overwrote: b.overwrote, ownerOnly: b.owner_only };
}

/** A file sync's receipt: both lists whole, and the written count is the written list's length. */
export function filesDoneOf(b: Record<string, unknown>): FilesDone | null {
  const written = strings(b.written);
  const skipped = strings(b.skipped);
  const bytes = count(b.bytes);
  if (written === null || skipped === null || bytes === null || count(b.files_written) !== written.length) return null;
  return { written, skipped, bytes };
}

/** The words key for a refusal (of a preview or an apply): the agent's reason when the page knows it, else its code. */
const REASONS = new Set(['source_empty', 'source_read_failed', 'source_too_large', 'cap_exceeded', 'walk_incomplete', 'credential_requires_import', 'path_unsafe', 'not_remote', 'cross_realm', 'overwrite_not_planned']);
export function refusalKey(code: string, reason: string): string {
  if (REASONS.has(reason)) return `why.${reason}`;
  if (code === 'admin_required' || code === 'forbidden') return 'why.notAllowed';
  return 'why.other';
}
