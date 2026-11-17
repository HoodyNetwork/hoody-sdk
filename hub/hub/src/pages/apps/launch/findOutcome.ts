// findOutcome: what the Launch an app search may say when its list is empty. One pure predicate, so
// "Nothing found" is said only for the words that were sent, once every place they were sent to answered in full.
//   - idle:       no words; the catalogue's own empty state.
//   - short:      fewer than FIND_MIN characters, sent, and the catalogue (the only place asked) answered.
//   - looking:    the words are not sent yet (the catalogue and the search are for the words before the last key, or
//                 no search exists for long words), or a place (a source, or the catalogue) has not answered yet.
//                 Checked before short, so a short edit never reads an older query's answer.
//   - unanswered: every place ended, but one (a source, or the catalogue) did not answer: it was not searched.
//   - partial:    every place answered, but one gave only part of its list or is still getting ready.
//   - none:       every place answered in full, and nothing matched.
import { FIND_MIN } from '../logic';

export type FindOutcome = 'idle' | 'short' | 'looking' | 'unanswered' | 'partial' | 'none';

export interface FindOutcomeInput {
  /** The words in the box now. */
  q: string;
  /** The words the catalogue and the search were sent for (the debounced copy). */
  sent: string;
  /** Whether a search of the sources exists for the sent words (long words only). */
  searched: boolean;
  catalog: { failed: boolean; pending: boolean };
  /** Each source's state for the sent words. */
  sources: readonly { state: string; partial: boolean }[];
}

export function findOutcome({ q, sent, searched, catalog, sources }: FindOutcomeInput): FindOutcome {
  const words = q.trim();
  if (!words) return 'idle';
  if (sent.trim() !== words || catalog.pending) return 'looking';
  if (words.length < FIND_MIN) return catalog.failed ? 'unanswered' : 'short';
  if (!searched || sources.some((x) => x.state === 'searching')) return 'looking';
  if (catalog.failed || sources.some((x) => x.state === 'failed')) return 'unanswered';
  if (sources.some((x) => x.state === 'warming' || x.partial)) return 'partial';
  return 'none';
}
