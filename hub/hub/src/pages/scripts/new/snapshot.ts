// What goes live: the final bytes are built before Check, the check is bound to exactly those bytes
// on the bound computer and folder, and Make it live sends exactly the checked bytes. Any change (code, schedule, computer,
// folder; the computer is its project and container, as container ids repeat across projects) gives another snapshot,
// and a verdict of another snapshot never holds: a stale verdict cannot unlock Make it live.
import { sha256Hex } from '@core';
import { withSchedule, type Verdict } from '../logic';

export interface Snapshot {
  /** The bytes sent to Check and, unchanged, to Make it live. */
  readonly bytes: string;
  /** SHA-256 of `bytes` (UTF-8), lowercase hex. */
  readonly hash: string;
  readonly project: string;
  readonly compId: string;
  readonly exec: number;
}

/** A check's answer bound to the snapshot it was made of. */
export interface SnapshotVerdict {
  readonly hash: string;
  readonly project: string;
  readonly compId: string;
  readonly exec: number;
  readonly verdict: Verdict;
}

export { sha256Hex };

export type SnapshotResult = { ok: true; snapshot: Snapshot } | { ok: false; why: 'bad_schedule' | 'unplaceable' };

/** The final bytes: the code with the Hub-owned schedule line (withSchedule; null removes any schedule the code had). */
export async function snapshotOf(code: string, schedule: string | null, at: { project: string; compId: string; exec: number }): Promise<SnapshotResult> {
  const placed = withSchedule(code, schedule);
  if ('error' in placed) return { ok: false, why: placed.error };
  return { ok: true, snapshot: { bytes: placed.text, hash: await sha256Hex(placed.text), project: at.project, compId: at.compId, exec: at.exec } };
}

/** The check of `s` (validate run on s.bytes on s's computer and folder). */
export const verdictFor = (s: Snapshot, verdict: Verdict): SnapshotVerdict => ({ hash: s.hash, project: s.project, compId: s.compId, exec: s.exec, verdict });

/** Make it live is open only for a ready verdict of this very snapshot. */
export function verdictHolds(v: SnapshotVerdict | null | undefined, s: Snapshot | null | undefined): boolean {
  return !!v && !!s && v.verdict.verdict === 'ready' && v.hash === s.hash && v.project === s.project && v.compId === s.compId && v.exec === s.exec;
}

/** The bytes Make it live may send: the snapshot's own, and only after proving they still hash to the verdict's hash. */
export async function bytesToSend(v: SnapshotVerdict | null | undefined, s: Snapshot | null | undefined): Promise<string | null> {
  if (!s || !verdictHolds(v, s)) return null;
  return (await sha256Hex(s.bytes)) === v!.hash ? s.bytes : null;
}
