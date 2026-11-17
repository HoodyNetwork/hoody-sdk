// Arriving at New chat (/ai, /ai/new) puts focus in its composer, once per arrival, and only when nothing
// else holds it. The shell focuses the new page's title on every route change (shell/pageHost focusShownTitle, a frame
// after the route moves) so a screen reader says where it is; the composer takes focus after that, two frames after
// mount, and the caller says the page's name through a polite live region (`said`), so the announcement is kept.
//
// Never: when this arrival was already used (`arrival`: a ref owned by the route's own component holding the last arrival
// tried, keyed by the path: a re-render or a computer change never takes focus again; /ai -> /ai/new, the rail's New chat,
// keeps the same component and is a new arrival), on a coarse pointer (a phone's keyboard would open uninvited), while a
// dialog, drawer or menu is open or the composer is under an inert region, or when focus is anywhere but the page's
// title, its main region, <body> or what had it at mount (the link or button that brought the person here), or when the
// person pressed or typed anything before the try.
import { useEffect, useState, type MutableRefObject, type RefObject } from 'react';

const coarse = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

const overlayOpen = (): boolean => document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;

/** Whether focus is free to take: nothing chosen since the arrival. */
function free(at: Element | null): boolean {
  const a = document.activeElement;
  const title = a instanceof HTMLElement && a.matches('h1[data-hub-title]');
  return !a || a === document.body || a === document.getElementById('hub-main') || title || (at !== null && a === at);
}

/** Focus `input` on this arrival; true once the composer took focus on it (the caller then says the page's name in a polite
 *  live region). */
export function useArrivalFocus(arrival: MutableRefObject<string | null>, at: string, input: RefObject<HTMLTextAreaElement | null>): boolean {
  const [said, setSaid] = useState(false);
  useEffect(() => {
    if (arrival.current === at || coarse()) return;
    setSaid(false); // a new arrival's name is said again (a live region speaks a change)
    const from = document.activeElement;
    let second = 0;
    // Anything the person does before the try (a press, a key: a selection starts with one) is theirs: the try is dropped.
    let acted = false;
    const act = () => {
      acted = true;
    };
    const opts = { capture: true, passive: true } as const;
    const listen = (on: boolean) => {
      for (const type of ['pointerdown', 'keydown'] as const) (on ? document.addEventListener : document.removeEventListener).call(document, type, act, opts);
    };
    listen(true);
    // The arrival is spent when the try runs, not when it is scheduled: a mount undone before its frames (React's
    // development double effect, or the view leaving at once) leaves it for the next mount of the same arrival.
    const take = () => {
      arrival.current = at;
      listen(false);
      if (acted) return;
      const el = input.current;
      if (!el?.isConnected || el.disabled || el.closest('[inert]') || overlayOpen()) return;
      if (!free(from)) return;
      el.focus({ preventScroll: true });
      // Said whenever the composer took focus: the shell's title focus may have run before (focus left the title) or not
      // at all yet (it then leaves focus where the page put it), so the page's name is spoken either way.
      if (document.activeElement === el) setSaid(true);
    };
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(take);
    });
    return () => {
      window.cancelAnimationFrame(first);
      window.cancelAnimationFrame(second);
      listen(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one try per arrival (the path)
  }, [at]);
  return said;
}
