// Workflow runs' reads and leases, on the computer's agent in the
// realm shown. Reads only: a start (runApi.ts) and Cancel and Resume (runActions.ts) are sent elsewhere; Resume holds
// its run's chat open with refOf, as the pins below do, and hands that hold to this page (adoptResumeHold, below).
//   - The snapshot (listWorkflowRuns, the whole listing with limit 0) is read every 5 s while a run is going and every
//     30 s otherwise, only while the page is shown. Every row passes parseRun (runs.ts).
//   - A run that is running keeps its chat open while this page is open (the lease manager's `pinned` hold, kit/agent/
//     lease.ts): the agent closes a chat nobody holds about 5 minutes after it goes idle, and a chat that waits on a
//     question is idle to it. At most PIN_CAP chats; one hold per chat; the hold is closed when the run leaves `running`,
//     its row is no longer listed, the computer changes or the page unmounts. Runs of other accounts are not listed.
//   - A Resume's hold: the run detail hands the hold it took on the run's
//     chat to the page as soon as the Resume went out (or may have). The page keeps it until its own pin holds that chat
//     (the listing shows the resumed run running and within PIN_CAP), a run resumed from it is listed and none of those is
//     running (it ended), no such run is listed by a read made after RESUME_HOLD_MAX_MS (it most likely never
//     started), the computer shown changes, or the page unmounts. Runs resumed from it that were listed before this Resume
//     (an earlier Resume's) never count for it. Every successful read settles, also one with the same rows; a failed read
//     settles nothing, and a read with rows it could not read settles only pins and computer changes (the resumed run's
//     row may be one of them). That holds for any unreadable row, also another workflow's (a name over the length cap):
//     while the realm lists one, every Resume hold stays until a pin, a computer change or the page unmounting (accepted:
//     a hold only keeps a chat open). Each Resume attempt keeps its own hold, also two on the same chat (a later one never closes an
//     earlier one's). A hold handed over for a computer the page no longer shows, or with no page, is closed at once. A
//     resumed run past PIN_CAP keeps this hold while it runs (one chat over the cap). The hold only keeps a chat open: it
//     sends nothing, and its end never offers an action again. A realm switch is not a computer change: the realm's
//     listing no longer shows the run, so its hold waits for the RESUME_HOLD_MAX_MS rule (or the page unmounting).
//     `known` is the attempt's own snapshot of the action store's read right before the send (ResumeOpts.sending in
//     runActions.ts, taken before the answer can name its run), plus the listing the detail showed. Never read it from the
//     store at handoff (ActionStore.known() is for tests): a Stop tracking in between moves it.
import { runRoutes, refOf, keyOf, resumeHolds, settleResumeHolds } from './runsData.pure';
export { runRoutes, refOf, RESUME_HOLD_MAX_MS, settleResumeHolds, dropResumeHold, resumeHoldKeys } from './runsData.pure';
import { coreSource, useCurrentComputer, streamComputer, type SourceError } from '@core';
import { leases, usePageShown, type LeaseHandle, type LeaseManager, type LeaseRef } from '@kit';
import { useTabVisible } from './runsData.web';
import { useEffect, useMemo, useRef, useState } from 'react';
import { anyRunning, parseRuns, pinsOf, RUNS_FAST_MS, RUNS_SLOW_MS, type Pins, type Run, type RunList } from './runs';

const source = coreSource('ai', {
  reads: {
    'wf.runs': {
      route: runRoutes.list,
      input: (realm?: string | null) => ({ realm: realm ?? undefined, query: { limit: 0 } }),
      select: (r: unknown) => parseRuns(r),
    },
  },
});

export interface RunsRead {
  readonly list: RunList | undefined;
  readonly isPending: boolean;
  readonly error: SourceError | null;
  readonly refetch: () => void;
  /** When the listing was last read whole (0: never): every successful read moves it, also one with the same rows. */
  readonly readAt?: number;
}

/** The runs in the realm shown (`realm` null) or the one named; nothing is read while `enabled` is false. */
export function useRuns(realm: string | null, enabled = true): RunsRead {
  const pageShown = usePageShown();
  const tabShown = useTabVisible();
  const on = enabled && pageShown && tabShown;
  const [fast, setFast] = useState(false);
  const q = source.useQuery<RunList, string | null>('wf.runs', realm, { enabled: on, refetchInterval: on ? (fast ? RUNS_FAST_MS : RUNS_SLOW_MS) : false });
  const going = anyRunning(q.data?.runs);
  useEffect(() => setFast(going), [going]);
  return { list: q.data, isPending: q.isPending, error: q.error ?? null, refetch: () => void q.refetch(), readAt: q.dataUpdatedAt };
}
/** Mounted useRunLeases callers: with none, nothing can take a hold over, so a handed-over hold is closed at once. */
let owners = 0;
/** The computer the page shows now (its lease address), set by useRunLeases: a hold for another one is not kept. */
let shown: string | null = null;

/** The run detail hands over the hold it took on `ref` (the chat of run `from`) once its Resume went out or may have.
 *  `known`: the runs resumed from `from` that the listing showed before this Resume (an earlier one's), which never
 *  stand for this one. A hold for a computer the page no longer shows is closed at once. */
export function adoptResumeHold(ref: LeaseRef, from: string, h: LeaseHandle, known: readonly string[] = [], now = Date.now()): void {
  if (owners === 0 || ref.computer !== shown) { h.close(); return; }
  if (resumeHolds.some((x) => x.h === h)) return;
  resumeHolds.push({ key: keyOf(ref), from, known, computer: ref.computer, h, at: now });
}
/** Tests: forgets every Resume hold and owner without closing anything. */
export function resetResumeHolds(): void { resumeHolds.length = 0; owners = 0; shown = null; }

/** Keeps the chats of the running runs open while the caller is mounted (see the header). Returns which runs it keeps
 *  and how many running ones it does not. `manager`: the lease manager (tests); default the page's. `readAt`: when
 *  `runs` was read (RunsRead.readAt), so a read with the same rows still settles the Resume holds; 0 = now. */
export function useRunLeases(runs: readonly Run[] | undefined, manager?: LeaseManager, readAt = 0, skipped = 0): Pins {
  const target = useCurrentComputer();
  const pins = useMemo(() => pinsOf(runs), [runs]);
  const held = useRef(new Map<string, LeaseHandle>());
  const refs = useMemo(() => (target ? pins.pinned.map((r) => refOf(r, target)) : []), [pins, target]);
  // Ids only: a changed list with the same running chats changes nothing.
  const wanted = refs.map(keyOf).join('\n');
  const mgr = manager ?? leases();
  useEffect(() => {
    const want = new Map(refs.map((ref) => [keyOf(ref), ref]));
    for (const [k, h] of held.current) {
      if (!want.has(k)) { h.close(); held.current.delete(k); }
    }
    for (const [k, ref] of want) {
      if (!held.current.has(k)) held.current.set(k, mgr.track(ref, { pinned: true }));
    }
    // `wanted` stands for refs: the same chats on the same computer change nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, mgr]);
  // After the pins above (same commit, declared after): a Resume hold ends only once the page's own pin holds its chat.
  const here = target ? streamComputer(target) : null;
  useEffect(() => {
    shown = here;
    settleResumeHolds(runs, new Set(held.current.keys()), here, readAt || Date.now(), skipped);
  }, [runs, wanted, here, readAt, skipped]);
  useEffect(() => {
    const mine = held.current;
    owners++;
    return () => {
      for (const h of mine.values()) h.close();
      mine.clear();
      owners--;
      if (owners === 0) { for (const x of [...resumeHolds]) x.h.close(); resumeHolds.length = 0; shown = null; }
    };
  }, []);
  return pins;
}
