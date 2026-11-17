// Landing on a Get-notified section (`#kinds` and friends): the page scrolls that section to the top once, on arrival.
// Web: the section element by its `data-section` mark. The terminal's sibling (landSection.term.ts) does nothing.

/** Scrolls the section marked `data-section="<section>"` into view; nothing when it is not on the page. */
export function landOnSection(section: string): void {
  document.querySelector<HTMLElement>(`[data-section="${section}"]`)?.scrollIntoView({ block: 'start' });
}
