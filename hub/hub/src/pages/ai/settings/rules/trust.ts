// What the person reviews before hooks are trusted, and the body of the acknowledgement.
// The agent holds hooks it has not been told to trust (listHooks trust.state 'pending') and runs none of them. Trusting one
// reviewed set sends THAT set's hash: the hash the dialog showed, never one read later, so a set that changed in between is
// refused by the agent and by the page. `high_risk` is exactly "the reviewed set has unverifiable targets": the agent requires it
// then and refuses it otherwise, so it is derived from the reviewed list and never chosen.
import { asWritten, cleanAgentText as clean } from '@kit';
import type { HookRow, HooksBlock } from './hooks';

/** A hook as the review shows it: its command as written (asWritten: what a screen would hide or change is marked, ⟨ESC⟩, ⟨U+200B⟩),
 *  bounded, `marked` when a mark was added; and whether it is off. */
export interface ReviewHook { event: string; matcher: string; command: string; off: boolean; marked: boolean }
/** The set the person is asked to trust. */
export interface Review {
  /** The trust hash read with this set. */
  hash: string;
  /** Targets the agent cannot check; non-empty makes the ack a high-risk one. */
  unverifiable: readonly string[];
  /** The same targets as shown: as written with marks, bounded, in the agent's order. */
  targets: readonly string[];
  hooks: readonly ReviewHook[];
  /** False when a command or target is too long to show whole: the person is asked to trust exactly what is shown, so such a set is
   *  shown but cannot be trusted from here. Read on the text as written: the kit's bound counts only what
   *  shows, so a command padded with characters that never show is within it, and is still not one to trust from here. */
  complete: boolean;
  /** A command or target holds what a screen would hide or change: the agent runs it as written, and sh reads an
   *  escape or control as an ordinary byte, so a cleaned reading can show `echo hi ` for a command that also runs `curl … | sh`. The
   *  review shows the marked text, and Trust waits for the person to say they read it: never one tap. */
  hidden: boolean;
}

export const COMMAND_SHOWN = 2000;
export const TARGET_SHOWN = 2000;

const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** The set the agent holds for review now, or null when none is held (state not pending, or no hash to name it by). */
export function reviewOf(block: HooksBlock): Review | null {
  const t = block.trust;
  if (t.state !== 'pending' || t.hash === '') return null;
  let complete = true, hidden = false;
  // As written, then bounded: the marks count toward the bound, so a text padded with what can't be seen is too long, never shown short.
  // Marked is read on the raw text and on what clean() would make of it, so nothing clean() drops or changes can go unmarked.
  const shown = (x: string, max: number): { text: string; marked: boolean } => {
    const w = asWritten(x);
    const c = clean(w.text, max, { code: true });
    const marked = w.marked || clean(x, undefined, { code: true }).text !== x;
    // Longer raw than the bound is incomplete too, whatever the cut counted (a budget for kept invisibles).
    if (c.cut > 0 || c.text !== w.text || x.length > max) complete = false;
    if (marked) hidden = true;
    return { text: c.text, marked };
  };
  const hooks = block.hooks.map((h: HookRow): ReviewHook => {
    const c = shown(h.command, COMMAND_SHOWN);
    return { event: h.event, matcher: h.matcher, command: c.text, off: h.disabled, marked: c.marked };
  });
  const targets = t.unverifiable.map((x) => shown(x, TARGET_SHOWN).text);
  return { hash: t.hash, unverifiable: t.unverifiable, targets, hooks, complete, hidden };
}

/** Whether a fresh read still holds exactly the set that was reviewed: pending, the same hash, the same unverifiable targets. */
export function sameReview(r: Review, block: HooksBlock): boolean {
  const t = block.trust;
  return t.state === 'pending' && t.hash === r.hash && same(t.unverifiable, r.unverifiable);
}

/** The body of the acknowledgement. `high_risk` is always sent, true exactly when the reviewed set had unverifiable targets. */
export function ackBody(a: { sessionId: string; review: Review }) {
  return { session_id: a.sessionId, hash: a.review.hash, high_risk: a.review.unverifiable.length > 0 };
}
