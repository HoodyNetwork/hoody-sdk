// The focus box before the first key. Code moves focus to a page title or a drawer heading when a page loads, and a
// browser with no input yet reports that focus as :focus-visible, so a person who has only used the mouse would see the
// box. Until this page's first keydown the root carries FIRST_KEY_ATTR, and kit/base.css draws no focus box under it on
// a heading (h1-h6) held by tabindex="-1"; every other element, controls and panels included, keeps its ring. The focus
// itself moves as it always did. A mouse press does not lift it: a control that keeps focus where it was when pressed
// would otherwise draw the box on the title for a mouse user. A key pressed inside a program's iframe does not reach this
// window, so after typing only there, a heading focused by code shows no box until the next key here.
export const FIRST_KEY_ATTR = 'data-hx-no-key';

/** Called once, before anything renders. Capture on window, so no handler that stops the key can keep it from being seen. */
export function installFirstKeyMark(): void {
  const root = document.documentElement;
  root.setAttribute(FIRST_KEY_ATTR, '');
  window.addEventListener('keydown', () => root.removeAttribute(FIRST_KEY_ATTR), { capture: true, once: true });
}
