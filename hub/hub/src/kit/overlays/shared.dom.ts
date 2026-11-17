// The DOM half of the overlays' shared behaviour: the frames a close waits out, focus return when the invoker is gone,
// and the keyboard reach of a body that scrolls. The terminal has its own (shared.dom.term.ts): its overlays restore
// focus themselves and its scroll regions take the keys.
import { useCallback, useEffect, useRef, useState } from 'react';

/** Two animation frames and a task: past the focus restore of the overlay that just closed (React Aria's own runs in a frame). */
export function afterFrames(run: () => void): () => void {
  let timer = 0;
  let second = 0;
  const first = window.requestAnimationFrame(() => {
    second = window.requestAnimationFrame(() => {
      timer = window.setTimeout(run, 0);
    });
  });
  return () => {
    window.cancelAnimationFrame(first);
    window.cancelAnimationFrame(second);
    window.clearTimeout(timer);
  };
}

// ── Focus return ─────────────────────────────────────────────────────────────────────

/** Inside a page the shell keeps loaded but hidden behind the page shown: never a focus target. */
function inHiddenPage(el: Element): boolean {
  return el.closest('[data-hub-page-hidden]') !== null;
}

/** Where focus goes when the invoker no longer exists: the shown page's title (kit PageHeader h1). */
export function pageTitle(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-hub-title]')).find((el) => !inHiddenPage(el)) ?? null;
}

/** Inside an inert or hidden subtree, or not drawn: never a focus target. */
function shut(el: Element): boolean {
  return el.closest('[inert], [hidden], [aria-hidden="true"]') !== null || inHiddenPage(el) || el.getClientRects().length === 0 || getComputedStyle(el).visibility === 'hidden';
}

/** An invoker that cannot have focus back now: inside an inert or hidden subtree, or not visible. Its box is not judged
 *  here (jsdom draws none); a focus() the browser refuses (display: none) is caught after the call instead. */
function closedOff(el: Element): boolean {
  return el.closest('[inert], [hidden], [aria-hidden="true"]') !== null || getComputedStyle(el).visibility === 'hidden';
}

/** Focus on an item of an open menu stands for the menu's trigger (React Aria names the menu in its aria-controls): the
 *  item goes with the menu, so an overlay its choice opens returns focus to the trigger, as the menu's own close does. */
function menuInvoker(el: Element | null): Element | null {
  const id = el?.closest('[role="menu"]')?.id;
  if (!id) return el;
  return Array.from(document.querySelectorAll('[aria-controls]')).find((t) => t.getAttribute('aria-controls')?.split(' ').includes(id)) ?? el;
}

function focusLost(): boolean {
  const a = document.activeElement;
  return a === null || a === document.body || !a.isConnected;
}

/**
 * React Aria returns focus to the invoker on close. When the invoker is gone (the row was deleted),
 * focus would fall to <body>; this sends it to `fallback()` (the next row, say) or the page title.
 * The invoker is captured while rendering the opening frame, before any child takes focus; an overlay opened from a
 * menu item takes the menu's trigger as its invoker (the item goes with the menu).
 * It runs on close and also when the page unmounts the open overlay (a URL-kept editor rendered only
 * while open), and checks again until the overlay's own focus restore has surely landed: its exit
 * animation can outlast a single check under load, and that restore drops focus to <body>.
 * An invoker that is inert, hidden or aria-hidden never gets focus back, nor keeps it where the overlay's restore put
 * it (until a key or pointer press: then focus there is the person's): under inert or aria-hidden (the closing
 * overlay's own, lifted when it goes) it waits for a later check, and still shut at the last check, or hidden, or
 * refusing focus, it is treated as gone.
 *
 * `prefer()` names where focus goes instead of the invoker after a close that took the person elsewhere on the page
 * (AI Connect's Claude Code tile jumps to its section): a programmatic target (tabindex), focused without a scroll
 * while the page's own jump runs, also where the overlay's restore has already put focus on the invoker. A target
 * still under the closing overlay's inert waits for a later check; one that is gone, hidden or not focusable, or still
 * shut at the last check, leaves the return as it is without `prefer`. Focus the person placed elsewhere is kept.
 */
export function useFocusReturn(isOpen: boolean, fallback?: () => HTMLElement | null | undefined, prefer?: () => HTMLElement | null | undefined): void {
  const invoker = useRef<Element | null>(null);
  const was = useRef(false);
  // An overlay opened by URL has no invoker: focus sat on <body>, which is not a place to return to.
  if (isOpen && !was.current && typeof document !== 'undefined') invoker.current = document.activeElement === document.body ? null : menuInvoker(document.activeElement);
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const preferRef = useRef(prefer);
  preferRef.current = prefer;
  // Each check acts only while focus is lost, or sits on a shut invoker where the overlay's own restore put it (before any
  // key or pointer press since the close), so a later one never moves focus the person placed. Returns the cancel.
  const schedule = useCallback((): (() => void) => {
    // A key or pointer press after the close: focus on the invoker from then on is the person's (they may Tab back to an
    // aria-hidden one), never an automatic restore to correct.
    let acted = false;
    const mark = () => {
      acted = true;
    };
    const doc = typeof document === 'undefined' ? null : document;
    doc?.addEventListener('keydown', mark, true);
    doc?.addEventListener('pointerdown', mark, true);
    const unlisten = () => {
      if (typeof document === 'undefined') return; // torn down: nothing left to listen to
      doc?.removeEventListener('keydown', mark, true);
      doc?.removeEventListener('pointerdown', mark, true);
    };
    // Set once the preferred target took focus in this close: from then on a later check never moves focus again (the
    // person may have gone back to the invoker on purpose).
    let placed = false;
    // true: the preferred target has focus, or will at a later check; false: the return goes on as without it.
    const preferred = (last: boolean): boolean => {
      const target = typeof document === 'undefined' ? null : preferRef.current?.();
      if (!(target instanceof HTMLElement) || !target.isConnected || !target.hasAttribute('tabindex')) return false;
      const active = document.activeElement;
      if (active === target) return true;
      if (placed || (!focusLost() && active !== invoker.current)) return false;
      if (shut(target)) return !last && target.closest('[inert]') !== null && !inHiddenPage(target);
      target.focus({ preventScroll: true });
      // A focus the browser refused leaves the return as it is without prefer.
      placed = document.activeElement === target;
      return placed;
    };
    const check = (last: boolean) => {
      // A check that outlives the page's environment (a test file's jsdom torn down after an unmount: no document, no
      // HTMLElement) has nothing to do.
      if (typeof document === 'undefined' || typeof HTMLElement === 'undefined') return;
      if (preferred(last)) return;
      // The preferred target took focus in this close and the person has moved on from it: theirs to keep.
      if (placed && !focusLost()) return;
      const inv = invoker.current instanceof HTMLElement && invoker.current.isConnected && !inHiddenPage(invoker.current) ? invoker.current : null;
      const onInvoker = !acted && inv !== null && document.activeElement === inv;
      if (!focusLost() && !onInvoker) return;
      if (inv && !closedOff(inv)) {
        if (!onInvoker) inv.focus();
        if (document.activeElement === inv) return;
      } else if (inv && !last && inv.closest('[inert], [aria-hidden="true"]') !== null) return;
      (fallbackRef.current?.() ?? pageTitle())?.focus();
    };
    const timers = RETURN_CHECKS_MS.map((ms, i) =>
      window.setTimeout(() => {
        const last = i === RETURN_CHECKS_MS.length - 1;
        try {
          check(last);
        } finally {
          if (last) unlisten();
        }
      }, ms),
    );
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      unlisten();
    };
  }, []);
  useEffect(() => {
    if (isOpen) {
      was.current = true;
      return;
    }
    if (!was.current) return;
    was.current = false;
    return schedule();
  }, [isOpen, schedule]);
  // Unmounted while open: the checks run without a cancel (they act only while focus is lost).
  useEffect(
    () => () => {
      if (was.current) schedule();
    },
    [schedule],
  );
}

/** When the focus-return checks run after a close (ms): at once, after the exit animation, and late. */
const RETURN_CHECKS_MS = [0, 300, 800];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** True while the element is open, scrolls, and holds nothing a keyboard can reach (its own tabindex aside). */
export function useScrollReach(ref: { readonly current: HTMLElement | null }, isOpen: boolean): boolean {
  const [reach, setReach] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!isOpen || !el) {
      setReach(false);
      return;
    }
    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const inside = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).some((x) => x.getAttribute('aria-disabled') !== 'true');
        setReach(el.scrollHeight > el.clientHeight && !inside);
      });
    };
    measure();
    const watch = new MutationObserver(measure);
    watch.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled', 'tabindex', 'href'] });
    const size = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    size?.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      window.cancelAnimationFrame(frame);
      watch.disconnect();
      size?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref, isOpen]);
  return reach;
}
