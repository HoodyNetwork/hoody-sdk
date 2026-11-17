// Whether a held send's banner shows (split out of Attempt.tsx so the terminal build shares it; Attempt.tsx re-exports it).
import type { HeldAttempt } from '@core';

/** Whether a held send's banner shows. Not while this tab's own request is out: nothing is unknown yet, and every normal
 *  send would flash "may have gone through" until its answer. Another tab's send, a reloaded attempt and a lost answer
 *  show it. The hold still locks the draft whichever way this answers. */
export const answerOwed = (held: HeldAttempt): boolean => held.inFlight !== 'here';
