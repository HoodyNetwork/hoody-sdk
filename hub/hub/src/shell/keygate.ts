// Who owns the keyboard right now: a field being typed in, a program frame, or an open overlay. Shared by the
// global keys (keys.ts) and the page keys (pageShortcuts.ts), so both stand aside in the same cases.

export function typing(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.closest('[contenteditable=""], [contenteditable="true"]') !== null;
}

/**
 * A program frame owns the keyboard: the key's target is an iframe, or sits inside an element a
 * page marks data-hub-keys="frame" (the Board's entered program tile, its wrapper and header included). Its keys are
 * the program's: no global key and no page key runs, except a page chord marked whileTyping (the Board's way out).
 * Keys typed inside a cross-origin frame never reach the Hub at all; this gate covers the keys that do, from the
 * marked element's own controls. The page sets the mark only while the program holds the keys and removes it when
 * focus leaves (a menu portaled out of the tile is outside it). The mark must sit in the light DOM: closest() does
 * not cross a shadow root.
 */
export function frameOwnsKeys(el: EventTarget | null): boolean {
  if (!(el instanceof Element) || hiddenByPage(el)) return false;
  return el.tagName === 'IFRAME' || el.closest('[data-hub-keys="frame"]') !== null;
}

/**
 * An overlay owns the keyboard while open: a dialog, drawer or sheet, a menu, the palette, a Select or
 * ComboBox list (React Aria marks its popover with data-trigger), or the phone More drawer (the shell
 * sets data-hub-overlay while it is open). A toast is not one: React Aria draws each toast as an
 * alertdialog inside the toast region, and a sticky error or unknown toast must not hold every key.
 */
export function overlayOpen(): boolean {
  return Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"], [data-trigger] [role="listbox"], [data-hub-overlay]')).some(liveOverlay);
}

/** A dialog open now outside `except` (the phone's Ask sheet asks about dialogs above it): the same rule as
 *  overlayOpen, so a toast or a dialog of a page kept hidden is not one. */
export function dialogOpen(except: Element | null): boolean {
  return Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).some((el) => !except?.contains(el) && liveOverlay(el));
}

/** An overlay element that owns the keyboard: not a toast, not inside a page kept hidden. */
function liveOverlay(el: Element): boolean {
  return !(el.getAttribute('role') === 'alertdialog' && el.closest('[role="region"]')) && !hiddenByPage(el);
}

/**
 * Inside a page the shell keeps loaded but hidden behind the page shown (shell/pageHost.tsx): in its
 * slot, or in a portal it opened (a drawer, dialog or menu), which React's hidden Activity sets display: none. Such an
 * element owns no key and takes no focus.
 */
export function hiddenByPage(el: Element): boolean {
  return el.closest('[data-hub-page-hidden], [style*="display: none"]') !== null;
}
