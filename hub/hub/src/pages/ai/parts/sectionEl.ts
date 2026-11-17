// The element of a settings section (`data-section`), for the web's scroll and focus helpers. The terminal sibling
// (sectionEl.term.ts) answers null: a terminal Hub reaches a section through `?section=` (its SettingsPage follows it).
export function sectionEl(id: string, inner = ''): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-section="${CSS.escape(id)}"]${inner ? ' ' + inner : ''}`);
}
