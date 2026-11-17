// ask.web.ts: the browser part of the Ask dock's state (ask.ts): the phone width question and the search for the
// dock's first control in the document. The terminal's sibling (ask.web.term.ts) answers both without a document, so
// ask.ts itself is shared.
import { hostEnv } from '../core/host-env';

/** Below 768 px the shell draws the dock as a full-screen sheet (shell/AppShell.tsx dockMode). */
export function phoneNow(): boolean {
  try {
    return hostEnv().browserPage === true && typeof window.matchMedia === 'function' && window.matchMedia('(width < 768px)').matches;
  } catch {
    return false;
  }
}

/** Focus the dock's first drawn control (a link, button, input or textarea, or a tabbable element; never a disabled
 *  one, also when it has a tabindex, and never the resize grip, hidden on a phone), else the dock itself (the shell
 *  marks it data-hub-dock). */
export function focusDockControl(): void {
  if (hostEnv().browserPage !== true || typeof document === 'undefined') return;
  const dock = document.querySelector<HTMLElement>('[data-hub-dock]');
  const first = Array.from(dock?.querySelectorAll<HTMLElement>('button:not(:disabled), [href]:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"]):not([role="separator"]):not(:disabled)') ?? []).find(
    (e) => e.getClientRects().length > 0 || e.offsetParent !== null,
  );
  (first ?? dock)?.focus({ preventScroll: true });
}

/** Runs `fn` once the dock is drawn: on a web page after the next animation frame, elsewhere at once. */
export function afterDockDrawn(fn: () => void): void {
  if (hostEnv().browserPage === true) requestAnimationFrame(fn);
  else fn();
}
