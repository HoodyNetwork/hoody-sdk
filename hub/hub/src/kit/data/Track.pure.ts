// Track's rule that draws nothing, shared by the web track and its terminal sibling.

/** done: finished; now: needs the person; later: not yet; wait: an outcome the Hub watches for; unknown: the Hub
 *  cannot tell (never drawn as done). */
export type TrackState = 'done' | 'now' | 'later' | 'wait' | 'unknown';

/** The step a track opens by itself: the first one that needs the person, else none. */
export function firstNowStep(steps: readonly { id: string; state: TrackState }[]): string | null {
  return steps.find((x) => x.state === 'now')?.id ?? null;
}
