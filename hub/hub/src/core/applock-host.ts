// applock-host.ts: the passcode gate's DOM side.
//
// Contract:
//   - installLockHost() creates `#hub-lock-host` (a body child, outside every React root) and mirrors the engine's
//     isLocked() onto `body[data-hub-locked]` synchronously (onLockChange is synchronous), so the base.css rule hides
//     every other body child, portals made later included. While locked, every other body child is also `inert`
//     (new ones too: a MutationObserver on body's child list), and the host keeper removes `inert`/`aria-hidden` from
//     the host as soon as a background modal sets them, and at lock start. Only the inert marks the host set are
//     removed at unlock.
//   - A modal open after unlock (React Aria hid only what was not hidden already, so a modal opened while locked hid
//     nothing the host had marked): the host keeps its marks on the background while one predicate holds, recomputed
//     from the DOM at every unlock and on every body mutation (subtree child list; `hidden`, `aria-hidden`, `style`,
//     `open`): a [role=dialog|alertdialog] that is connected, outside the app root and the host, not aria-modal="false"
//     and not hidden (no `hidden`/aria-hidden ancestor, no display:none or visibility:hidden; a closed <dialog> is display:none).
//     The Hub's React Aria dialogs carry no aria-modal and the Hub has no non-modal overlay, so such a dialog is a
//     modal. The marks on the dialog's own body child go at unlock and its dialog takes focus; every other mark goes
//     the moment the predicate is false (then focus left on the body goes to the fallback).
//   - The host is a React Aria top layer (`data-react-aria-top-layer`, as kit toasts are): a background modal's
//     ariaHideOutside leaves it visible, its FocusScope lets focus move into it, and a press in the lock screen is not an
//     interaction outside that modal, so typing the passcode never dismisses a dialog (and its form) left open behind.
//   - Focus: the element focused when the lock started gets focus back at unlock if it is still connected, else
//     `fallbackFocus` (the shell's page title).
//   - Leave: `visibilitychange` to hidden, `pagehide` and `freeze` call leaveTab() (CANCEL always; lock when "lock when
//     I leave" is on). Back: `visibilitychange` to visible, `focus` and `pageshow` run checkIdle(); a persisted
//     `pageshow` (bfcache) runs it synchronously in the handler, before any React work.
//   - Idle: checkIdle every 15 s while visible, with `frameFocus` when a Board frame (an IFRAME) holds focus; pointer,
//     key, wheel and touch input (capture, passive) is noteInput().
//   - Returns the uninstall (tests). A second install replaces the first.
import { checkIdle, isLocked, leaveTab, noteInput, onLockChange } from './applock';
import { LOCK_HOST_ID, LOCKED_ATTR, IDLE_TICK_MS, APP_ROOT_ID, MODAL_WATCH } from './applock-host.pure';
export { LOCK_HOST_ID, LOCKED_ATTR, IDLE_TICK_MS, APP_ROOT_ID, MODAL_WATCH } from './applock-host.pure';
export type { LockHostOptions } from './applock-host.pure';
import type { LockHostOptions } from './applock-host.pure';

/** React Aria's marker for content above every overlay (focus may move there; a press there is not "outside"). */
const TOP_LAYER = 'data-react-aria-top-layer';
/** A dialog that, open, keeps the background out of reach (see the contract: the Hub's dialogs carry no aria-modal). */
const MODAL = ':is([role="dialog"], [role="alertdialog"]):not([aria-modal="false"])';

function hiddenFrom(el: Element, body: Element): boolean {
  const win = el.ownerDocument.defaultView;
  for (let e: Element | null = el; e && e !== body; e = e.parentElement) {
    if (e.hasAttribute('hidden') || e.getAttribute('aria-hidden') === 'true') return true;
    const cs = win?.getComputedStyle(e); // a closed <dialog> is display:none (the UA style)
    if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return true;
  }
  return false;
}

let uninstall: (() => void) | null = null;

/** The lock host element (created by installLockHost), or null before it. */
export function lockHost(doc: Document = document): HTMLElement | null {
  return doc.getElementById(LOCK_HOST_ID);
}

/** Tests: remove the listeners and observers of the installed host. */
export function uninstallLockHost(): void {
  uninstall?.();
}

export function installLockHost(o: LockHostOptions = {}, doc: Document = document): HTMLElement {
  uninstall?.();
  const win = doc.defaultView ?? window;
  const body = doc.body;
  let host = lockHost(doc);
  if (!host) {
    host = doc.createElement('div');
    host.id = LOCK_HOST_ID;
    body.appendChild(host);
  }
  const h = host;
  if (!h.hasAttribute(TOP_LAYER)) h.setAttribute(TOP_LAYER, ''); // a new host, or one a script stripped
  const madeInert = new Set<Element>();
  let before: Element | null = null;
  let shown = false;

  const inertOthers = (): void => {
    for (const el of Array.from(body.children)) {
      if (el === h || el.hasAttribute('inert')) continue;
      el.setAttribute('inert', '');
      madeInert.add(el);
    }
  };
  const freeHost = (): void => {
    if (h.hasAttribute('inert')) h.removeAttribute('inert');
    if (h.hasAttribute('aria-hidden')) h.removeAttribute('aria-hidden');
  };

  // The open modals (the predicate in the contract), read from the DOM each time.
  const openModals = (): HTMLElement[] => {
    const root = doc.getElementById(APP_ROOT_ID);
    return Array.from(body.querySelectorAll<HTMLElement>(MODAL)).filter((d) => d.isConnected && !h.contains(d) && !root?.contains(d) && !hiddenFrom(d, body));
  };
  const release = (els: Iterable<Element>): void => {
    for (const el of [...els]) { el.removeAttribute('inert'); madeInert.delete(el); }
  };
  // Unlocked with marks kept (only the keeper calls it, and only while unlocked): they all go once no modal is open.
  const settle = (): void => {
    if (!madeInert.size || openModals().length) return;
    release(madeInert);
    if (!doc.activeElement || doc.activeElement === body) o.fallbackFocus?.();
  };

  const apply = (): void => {
    const locked = isLocked();
    if (locked === shown) { if (locked) { inertOthers(); freeHost(); } return; }
    shown = locked;
    if (locked) {
      const a = doc.activeElement;
      before = a && a !== body && !h.contains(a) ? a : null;
      body.setAttribute(LOCKED_ATTR, '');
      inertOthers();
      freeHost();
      return;
    }
    body.removeAttribute(LOCKED_ATTR);
    const back = before;
    before = null;
    const modals = openModals();
    if (!modals.length) {
      release(madeInert);
      focusBack(back);
      return;
    }
    // A modal is open: its own body child is freed, the rest stays marked until settle() finds none open.
    release([...madeInert].filter((el) => modals.some((d) => el.contains(d))));
    modals[modals.length - 1]!.focus({ preventScroll: true });
  };
  const focusBack = (back: Element | null): void => {
    if (back && back.isConnected && typeof (back as HTMLElement).focus === 'function') (back as HTMLElement).focus({ preventScroll: true });
    // Gone, or still there but unable to take focus (disabled, hidden in a kept page, inert): the page title.
    if (!back || doc.activeElement !== back) o.fallbackFocus?.();
  };

  const bodyKeeper = new MutationObserver(() => { if (shown) inertOthers(); else settle(); });
  bodyKeeper.observe(body, MODAL_WATCH);
  const hostKeeper = new MutationObserver(() => { if (shown) freeHost(); });
  hostKeeper.observe(h, { attributes: true, attributeFilter: ['inert', 'aria-hidden'] });
  const offLock = onLockChange(apply);

  const visible = (): boolean => doc.visibilityState !== 'hidden';
  const frameFocus = (): boolean => visible() && doc.activeElement?.tagName === 'IFRAME';
  const idle = (): void => { checkIdle({ frameFocus: frameFocus() }); };
  const onVisibility = (): void => { if (visible()) idle(); else leaveTab(); };
  const onPageShow = (e: Event): void => { if ((e as PageTransitionEvent).persisted) checkIdle({ frameFocus: frameFocus() }); else idle(); };
  const onInput = (): void => { noteInput(); };
  const inputs = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

  doc.addEventListener('visibilitychange', onVisibility);
  doc.addEventListener('freeze', leaveTab);
  win.addEventListener('pagehide', leaveTab);
  win.addEventListener('pageshow', onPageShow);
  win.addEventListener('focus', idle);
  for (const t of inputs) win.addEventListener(t, onInput, { capture: true, passive: true });
  const every = o.every ?? ((fn, ms) => { const t = win.setInterval(fn, ms); return () => win.clearInterval(t); });
  const stopTick = every(() => { if (visible()) idle(); }, IDLE_TICK_MS);

  apply();

  const off = (): void => {
    offLock();
    bodyKeeper.disconnect();
    hostKeeper.disconnect();
    stopTick();
    doc.removeEventListener('visibilitychange', onVisibility);
    doc.removeEventListener('freeze', leaveTab);
    win.removeEventListener('pagehide', leaveTab);
    win.removeEventListener('pageshow', onPageShow);
    win.removeEventListener('focus', idle);
    for (const t of inputs) win.removeEventListener(t, onInput, { capture: true });
    if (uninstall === off) uninstall = null;
  };
  uninstall = off;
  return h;
}
