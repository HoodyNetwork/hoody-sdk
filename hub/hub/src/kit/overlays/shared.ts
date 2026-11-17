// Behaviour shared by the kit overlays: the phone breakpoint; the open-overlay stack (at most one of each modal kind:
// drawer, dialog, phone sheet, phone menu tray; an open ActionMenu closes when a drawer, dialog or sheet opens, a
// Popover or InfoTip does not); focus return when the invoker is gone; the token that lets a deliberate close pass the
// dirty-drawer navigation guard; and the keyboard reach of a body that scrolls (Drawer, Dialog). Dialog, Drawer, Sheet
// (a Popover's phone sheet included) and the menu tray join the stack, return focus and close on a context end.
import { useRouter } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { onBump } from '@core';
import { useHiddenNow } from '../navhold';
import { useMedia } from '../media';
import { afterFrames } from './shared.dom';

export { afterFrames, pageTitle, useFocusReturn, useScrollReach } from './shared.dom';

/** Overlays switch to their phone form below a 600 px viewport. */
export const PHONE_QUERY = '(width < 600px)';

export function useIsPhone(): boolean {
  // Through the kit's one media hook (no window read here): the web follows matchMedia as before; the terminal answers
  // from its own width (media.term.ts), so a shared component asking never touches `window` there.
  return useMedia(PHONE_QUERY);
}

// ── Stack ────────────────────────────────────────────────────────────────────────────

export type OverlayKind = 'drawer' | 'dialog' | 'sheet' | 'tray';

const open: Record<OverlayKind, number> = { drawer: 0, dialog: 0, sheet: 0, tray: 0 };

/** How many overlays of a kind are open now (tests and the dev warning read it). */
export function openCount(kind: OverlayKind): number {
  return open[kind];
}

const STACK_HINT: Record<OverlayKind, string> = {
  drawer: 'kit Drawer: a drawer never opens a second drawer. Replace the body and pass onBack instead.',
  dialog: 'kit Dialog: only one dialog at a time. Close the first before opening another.',
  sheet: 'kit Sheet: only one sheet at a time. Replace its body instead of opening a second.',
  tray: 'kit ActionMenu: only one phone menu tray at a time.',
};

/**
 * An open overlay belongs to the context it was opened in: when that context ends without a reload (a
 * realm fallback or removal, a switch, sign-out) it closes, with no ask (what it held is for a context
 * that is gone; core keeps any pending change's lock for when the page opens again). A late answer
 * ('late') ends nothing on screen.
 */
export function useCloseOnContextEnd(isOpen: boolean, close: () => void): void {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!isOpen) return;
    return onBump((reason) => {
      if (reason !== 'late') closeRef.current();
    });
  }, [isOpen]);
}

/**
 * Told when a kit overlay (Dialog, Drawer, Sheet) has finished closing: its exit is over and the hiding attributes it put
 * on the page (inert, aria-hidden) are removed. The FAQ landing waits on it. Returns the unsubscribe.
 */
const overlayClosed = new Set<() => void>();
export function onOverlayClosed(fn: () => void): () => void {
  overlayClosed.add(fn);
  return () => void overlayClosed.delete(fn);
}
/** Fires the subscribers (the overlays call it once per close, after the exit; see OverlayClosedNotice). */
export function notifyOverlayClosed(): void {
  for (const fn of [...overlayClosed]) {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  }
}

/**
 * The kit modals mounted now (their exit included: React Aria lifts the inert / aria-hidden it put on the page when the exit
 * starts, but the modal's focus scope holds focus until it unmounts and gives it back to the opener a frame later), and the
 * closes whose focus restore may still be on its way. Content that takes focus (the FAQ landing) waits while either is so.
 */
let mountedOverlays = 0;
let settling = 0;
export const overlaysBusy = (): boolean => mountedOverlays > 0 || settling > 0;

const idleWaiters = new Set<() => void>();
/** Told once, the next time no kit modal is mounted or settling; a waiter that throws never stops the rest. */
export function onOverlaysIdle(fn: () => void): () => void {
  idleWaiters.add(fn);
  return () => void idleWaiters.delete(fn);
}
function flushIdle(): void {
  if (overlaysBusy()) return;
  for (const fn of [...idleWaiters]) {
    idleWaiters.delete(fn);
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  }
}

/**
 * Rendered inside a kit overlay's modal (Dialog, Drawer, Sheet): React Aria keeps the modal mounted while it exits and
 * unmounts it when the exit is over (its own `isOpen` false already lifted the inert / aria-hidden it put on the page), or
 * at once when the page unmounts an open overlay (the hiding is lifted by the same teardown). So this unmounting is the
 * close. The notice goes out in a microtask, after every cleanup of that teardown has run, and once per mount: a
 * development double-run of the effect (mount, cleanup, mount) cancels it. A throwing subscriber never stops the rest.
 * The close stays "settling" (`overlaysBusy`) for two frames and a task after the unmount, and the idle waiters go then.
 */
export function OverlayClosedNotice(): null {
  const gone = useRef(false);
  useEffect(() => {
    gone.current = false;
    mountedOverlays += 1;
    return () => {
      mountedOverlays -= 1;
      settling += 1;
      gone.current = true;
      queueMicrotask(() => {
        if (!gone.current) {
          settling -= 1;
          return;
        }
        afterFrames(() => {
          settling -= 1;
          flushIdle();
        });
        notifyOverlayClosed();
      });
    };
  }, []);
  return null;
}

/** Told when a kit Dialog, Drawer or Sheet opens: an open menu closes first, so no dialog ever sits under a tray. */
const stackOpened = new Set<() => void>();

/** Registers an open overlay; a second one of the same kind is a page bug, reported in dev. A tray is a menu itself,
 *  so its opening closes no other menu (React Aria keeps one menu open). */
export function useOverlayStack(kind: OverlayKind, isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen) return;
    if (kind !== 'tray') for (const tell of [...stackOpened]) tell();
    open[kind] += 1;
    if (open[kind] > 1 && import.meta.env.DEV) {
      console.error(STACK_HINT[kind]);
    }
    return () => {
      open[kind] -= 1;
    };
  }, [kind, isOpen]);
}

/** The history entry a location state names (TanStack's own key); '' when the history gives none. */
const entryOf = (state: unknown): string => {
  const st = state as { __TSR_key?: string; key?: string } | undefined;
  return st?.__TSR_key ?? st?.key ?? '';
};

/**
 * An open menu closes when the person leaves it without choosing, through `close` (the caller's
 * onOpenChange(false), so a controlled caller's state closes too): a new history entry is committed (any navigation, Back
 * included: a menu pushes no entry of its own), its kept page hides (an Activity runs effect cleanups, not effects, and
 * useHiddenNow reads true then), or a kit Dialog or Drawer opens. A re-render, and an unload, close nothing. Needs no
 * router: without one only the page hide and the overlay stack apply.
 */
export function useCloseOnLeave(isOpen: boolean, close: () => void): void {
  const closeRef = useRef(close);
  closeRef.current = close;
  const router = useRouter({ warn: false });
  const hiddenNow = useHiddenNow();
  useEffect(() => {
    if (!isOpen) return;
    const tell = () => closeRef.current();
    const at = router ? entryOf(router.history.location.state) : '';
    const offHistory = router?.history.subscribe(() => {
      if (entryOf(router.history.location.state) !== at) tell();
    });
    stackOpened.add(tell);
    return () => {
      offHistory?.();
      stackOpened.delete(tell);
      if (hiddenNow()) tell();
    };
  }, [isOpen, router, hiddenNow]);
}

// ── Deliberate closes ────────────────────────────────────────────────────────────────

let allowUntil = 0;

/** The navigation about to happen (useDrawerParam's close stepping back) is a deliberate close. */
export function allowNextNavigation(): void {
  allowUntil = Date.now() + 250;
}

/** Consumes the token: true once when a deliberate close is under way. */
export function takeAllowedNavigation(): boolean {
  if (Date.now() > allowUntil) return false;
  allowUntil = 0;
  return true;
}
