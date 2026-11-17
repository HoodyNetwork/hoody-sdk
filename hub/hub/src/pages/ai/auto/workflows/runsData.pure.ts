// Workflow runs' routes, chat refs and the Resume-hold table (split out of runsData.ts so the terminal build shares
// them; the notes are at the top of runsData.ts). One resumeHolds list, never copied or replaced (changed in place: runsData.ts holds the same array). runsData.ts re-exports the public
// names and keeps the reads (useRuns: tab visibility), useRunLeases, adoptResumeHold and resetResumeHolds (they own the
// owners/shown lets). keyOf and resumeHolds are for runsData.ts.
import { defineRoute, streamComputer, type useCurrentComputer } from '@core';
import type { LeaseHandle, LeaseRef } from '@kit';
import type { Run } from './runs';

export const runRoutes = {
  // limit 0 is the agent's "no pagination": the whole snapshot in one answer. Rows carry their realm.
  list: defineRoute({ method: 'GET', path: '/workflows/runs', scope: 'agent', realm: 'list', query: ['page', 'limit'] }),
} as const;

type Computer = NonNullable<ReturnType<typeof useCurrentComputer>>;
/** The lease address of a run's chat on the computer shown, and its key (the lease manager's own). */
export const refOf = (run: Run, target: Computer): LeaseRef => ({ computer: streamComputer(target), realm: run.realm, sid: run.sid, target });
export const keyOf = (ref: LeaseRef): string => `${ref.computer}|${ref.realm}|${ref.sid}`;

/** How long a Resume's hold waits for a run resumed from it to be listed before it lets go. */
export const RESUME_HOLD_MAX_MS = 10 * 60_000;
interface ResumeHold { readonly key: string; readonly from: string; readonly known: readonly string[]; readonly computer: string; readonly h: LeaseHandle; readonly at: number }
/** The Resume holds this page keeps, one per Resume attempt: two attempts on the same chat each keep their own (an
 *  earlier attempt's resume may still be queued or running when a later one is handed over). */
export const resumeHolds: ResumeHold[] = [];
/** Takes these holds off the list, in place. */
function forget(gone: (x: ResumeHold) => boolean): void {
  for (let i = resumeHolds.length - 1; i >= 0; i--) if (gone(resumeHolds[i]!)) resumeHolds.splice(i, 1);
}
/** Ends the Resume holds whose job is done (see the header), after the page's own pins were updated. `now`: when `runs`
 *  was read (the ten-minute rule counts only reads made after it ran out). */
export function settleResumeHolds(runs: readonly Run[] | undefined, pinned: ReadonlySet<string>, computer: string | null, now = Date.now(), skipped = 0): void {
  for (const x of [...resumeHolds]) {
    // A listing with rows it could not read may hide the resumed run: it settles only pins and computer changes.
    const children = runs && skipped === 0 ? runs.filter((r) => r.resumedFrom === x.from && !x.known.includes(r.id)) : null;
    const done = pinned.has(x.key) || x.computer !== computer
      || (children !== null && children.length > 0 && !children.some((r) => r.state === 'running'))
      || (children !== null && children.length === 0 && now - x.at > RESUME_HOLD_MAX_MS);
    if (done) { x.h.close(); forget((y) => y === x); }
  }
}
/** Ends the hold of a Resume that handed it over and then got a refusal back. */
export function dropResumeHold(h: LeaseHandle): void {
  for (const x of [...resumeHolds]) if (x.h === h) x.h.close();
  forget((x) => x.h === h);
}
/** Tests: the chats whose Resume hold the page keeps. */
export function resumeHoldKeys(): string[] { return resumeHolds.map((x) => x.key); }
