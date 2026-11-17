// Small pieces of the Bots page's text markup, as render functions (the page's anatomy reads them where they are
// written). Their .term sibling draws the same words in the terminal.
import type { ReactNode } from 'react';

/** A sentence added after another in the same note, in its own element: it comes and goes on its own (and a test or a
 *  screen reader finds it whole). */
export function ownSentence(text: string): ReactNode {
  return <span>{text}</span>;
}

/** An address that follows what the person types: a change is announced, never interrupting, and its direction is
 *  its own (an isolate). */
export function livePreview(text: string): ReactNode {
  return <bdi aria-live="polite">{text}</bdi>;
}
