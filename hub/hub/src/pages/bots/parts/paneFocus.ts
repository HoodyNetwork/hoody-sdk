// The bot pane's keyboard rules on the web page: who holds the keyboard (an overlay, a field, a frame, focus outside the
// page), focus that fell off, the header's ⋯ and the details panel, and document focus watching. Moved out of BotPane.tsx
// so the terminal (paneFocus.term.ts) answers them from its own focus system.

// Who holds the keyboard, by the shell's own rule (shell/keygate.ts typing, frameOwnsKeys, overlayOpen, hiddenByPage),
// which pages cannot import; keep the two in step.
const OVERLAYS = '[role="dialog"], [role="alertdialog"], [role="menu"], [data-trigger] [role="listbox"], [data-hub-overlay]';
export const hiddenByPage = (el: Element) => el.closest('[data-hub-page-hidden], [style*="display: none"]') !== null;
/** An open overlay owns the keys wherever focus is (a Select's portaled list, a drawer with focus fallen to the body);
 *  a toast (an alertdialog in the toast region) and a hidden page's overlay do not. */
export const overlayOpen = () =>
  Array.from(document.querySelectorAll(OVERLAYS)).some((el) => !(el.getAttribute('role') === 'alertdialog' && el.closest('[role="region"]')) && !hiddenByPage(el));

/** The person holds the keyboard, so the card must not take it: an open overlay, a field they type in, a program frame,
 *  or focus outside this page (the Ask dock, the top bar, the side nav). Focus on the body or anywhere else in the
 *  page (the list row or title the list handed on) is free. */
export function keyboardHeld(card: HTMLElement): boolean {
  if (overlayOpen()) return true;
  const a = document.activeElement;
  if (!(a instanceof HTMLElement) || a === document.body) return false;
  if (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT|IFRAME)$/.test(a.tagName)) return true;
  if (a.closest('[contenteditable=""], [contenteditable="true"], [data-hub-keys="frame"]') !== null) return true;
  const page = card.closest('[data-hub-page]');
  return page !== null && !page.contains(a);
}

/** Focus fell off: the element that held it left the page (a replaced card), so nobody holds it. */
export const focusLost = () => document.activeElement === null || document.activeElement === document.body;
/** The header's ⋯ (More actions): the header's last menu button (the meta's own buttons come before the actions). */
export const moreTrigger = (root: HTMLElement | null) => [...(root?.querySelector('header')?.querySelectorAll<HTMLElement>('button[aria-haspopup]') ?? [])].at(-1) ?? null;

/** Where the keyboard is now as an opener to hand it back to (null when it is on the body). */
export const openerNow = (): Element | null => (document.activeElement === document.body ? null : document.activeElement);
/** The keyboard is inside `el`. */
export const holdsFocus = (el: Element): boolean => el.contains(document.activeElement);
/** The details panel and its toggle in the pane (the ⋯ when the toggle is folded away). */
export const detailsPanel = (root: HTMLElement): HTMLElement | null => root.querySelector<HTMLElement>('[data-details-panel]');
export const detailsToggle = (root: HTMLElement): HTMLElement | null => root.querySelector<HTMLElement>('[data-details-toggle]') ?? moreTrigger(root);
/** Watches focus moving anywhere in the document (focusin, and focusout when given); returns the stop. */
export function onDocumentFocus(on: (e: FocusEvent) => void, off?: (e: FocusEvent) => void): () => void {
  document.addEventListener('focusin', on);
  if (off) document.addEventListener('focusout', off);
  return () => {
    document.removeEventListener('focusin', on);
    if (off) document.removeEventListener('focusout', off);
  };
}
