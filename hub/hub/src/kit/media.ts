// Media and measured-size hooks for the kit and the shell: one media-query hook (no component keeps its own matchMedia
// listener), the toolbar fold steps, and the content-width readers.
import { type RefObject, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

/** Matches a media query and follows it; false where there is no window (tests without one). */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
      const m = window.matchMedia(query);
      m.addEventListener('change', onChange);
      return () => m.removeEventListener('change', onChange);
    },
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}

/** The width a row needs to draw its current step whole. */
export type RowNeed = (el: HTMLElement) => number;

/** A no-wrap row whose controls keep their least widths needs its scroll width. */
const scrollNeed: RowNeed = (el) => el.scrollWidth;

/**
 * A row with a title that gives up width before anything overflows (an ellipsis title beside actions): it needs its
 * scroll width plus what its title ([data-hub-title]) lacks of its full width, counted only up to `floor` px. A long
 * name that keeps at least `floor` px stays cut on one line; a title squeezed below that (or below its own width,
 * when shorter) makes the row step down.
 */
export function titledRowNeed(floor: number): RowNeed {
  return (el) => {
    let lack = 0;
    el.querySelectorAll<HTMLElement>('[data-hub-title]').forEach((title) => {
      lack += Math.max(0, Math.min(title.scrollWidth, floor) - title.clientWidth);
    });
    return el.scrollWidth + lack;
  };
}

/** What a header row holds (title, meta, actions, by element count and text): a useRowFit `sig` for rows that only
 * restyle between steps. */
export const rowContentSig = (el: HTMLElement): string => `${el.querySelectorAll('*').length}|${el.textContent ?? ''}`;

/** The row needs more than its box (see RowNeed). */
function overflows(el: HTMLElement, need: RowNeed = scrollNeed): boolean {
  return el.clientWidth > 0 && need(el) > el.clientWidth + 1;
}

/** A popup opened from inside the row is showing (its trigger says aria-expanded): the row must not change shape. */
function popupOpen(el: HTMLElement): boolean {
  return el.querySelector('[aria-expanded="true"]') !== null;
}

/**
 * Which step of a row's fit to draw (0 = the most generous, `last` = the tightest). The row (`ref`, laid out without
 * wrapping) measures itself: after each render, while it is wider than its box, the next step is drawn before the
 * browser paints. When the row's own box grows, it goes back up to the most generous step whose measured width fits.
 * Content changes (`key`) start again from step 0 only when what the row holds changes, never on a value change.
 * While a popup opened from the row is showing (a filter menu, the view menu), the step holds: a change would unmount
 * it from under its user. The change waits until the popup closes. The row element may come and go (an empty table
 * draws none); whichever element `ref` holds after a render is the one watched. 0 where nothing can be measured.
 * `need` says how wide the row must be (default: its scroll width; titledRowNeed for a header with a shrinking title).
 * `sig` reads, from the row after each render, what changes its width without a change of `key` (actions coming and
 * going, a status pill): when it changes the measured widths are dropped and the fit starts again from step 0 before
 * the browser paints, so a stale width never holds a tighter step. Only for rows whose content is the same at every
 * step (a header that only restyles); a popup open from the row holds it like any change.
 */
export function useRowFit(ref: RefObject<HTMLElement | null>, last: number, key: string, enabled = true, need: RowNeed = scrollNeed, sig?: (el: HTMLElement) => string): number {
  const [step, setStep] = useState(0);
  // widths[n]: the width the row needed at step n, measured when step n did not fit.
  const widths = useRef<number[]>([]);
  const needRef = useRef(need);
  needRef.current = need;
  const stepRef = useRef(step);
  stepRef.current = step;
  const lastRef = useRef(last);
  lastRef.current = last;
  const lastKey = useRef(key);
  if (lastKey.current !== key) {
    lastKey.current = key;
    widths.current = [];
    if (step !== 0) setStep(0);
  }
  const clamped = Math.min(step, last);
  const watch = useRef<{ el: HTMLElement; stop: () => void } | null>(null);
  const lastSig = useRef<string | undefined>(undefined);
  // After every render (a chip's value, a count or a page control may have grown the row, or the row itself may have
  // appeared or been replaced): two layout reads, and a state change only when the row does not fit, which stops at
  // `last`. Then the watch is moved to the element now in `ref` if it changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately runs after every render, see above
  useLayoutEffect(() => {
    const el = enabled ? ref.current : null;
    let restarted = false;
    if (el && sig && !popupOpen(el)) {
      const now = sig(el);
      if (lastSig.current !== undefined && now !== lastSig.current) {
        widths.current = [];
        if (clamped !== 0) {
          setStep(0);
          restarted = true;
        }
      }
      lastSig.current = now;
    }
    if (el && !restarted && clamped < last && !popupOpen(el) && overflows(el, need)) {
      widths.current[clamped] = need(el);
      setStep(clamped + 1);
    }
    if (watch.current?.el === el) return;
    watch.current?.stop();
    watch.current = el ? { el, stop: watchRow(el) } : null;
  });
  useEffect(
    () => () => {
      watch.current?.stop();
      watch.current = null;
    },
    [],
  );

  /** Follows one row element: its box (ResizeObserver) and its popups closing (a held change is then made). */
  function watchRow(el: HTMLElement): () => void {
    let width = el.clientWidth;
    const fit = (grew: boolean) => {
      const cur = Math.min(stepRef.current, lastRef.current);
      if (popupOpen(el)) return;
      if (cur < lastRef.current && overflows(el, needRef.current)) {
        widths.current[cur] = needRef.current(el);
        setStep(cur + 1);
        return;
      }
      if (!grew) return;
      // The most generous step whose measured width fits, even past a tighter one that does not: steps need not narrow
      // the row in order (one filter chip is narrower than the Filters button with its words, so a table toolbar can
      // need more at step 1 than at step 0). Walking up only through steps that fit would unfold later than it folded
      // (by 26 px on the kit's Data view); this way both happen at the same width, with
      // the same 1 px allowance as overflows.
      const w = el.clientWidth;
      let n = 0;
      while (n < cur && (widths.current[n] ?? Number.POSITIVE_INFINITY) > w + 1) n++;
      if (n !== cur) setStep(n);
    };
    // A row that was replaced while compact (or appeared after the last change of width) may have room now.
    fit(true);
    const stops: Array<() => void> = [];
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        const w = el.clientWidth;
        if (w !== width) fit(w > width);
        width = w;
      });
      ro.observe(el);
      stops.push(() => ro.disconnect());
    }
    if (typeof MutationObserver !== 'undefined') {
      // A popup closing: whatever was held (either way) is decided now.
      const mo = new MutationObserver(() => {
        if (!popupOpen(el)) fit(true);
      });
      mo.observe(el, { attributes: true, attributeFilter: ['aria-expanded'], subtree: true });
      stops.push(() => mo.disconnect());
    }
    return () => stops.forEach((s) => s());
  }
  return enabled ? clamped : 0;
}

/**
 * The attribute every element whose CSS makes it the `content` container carries (`container: content / inline-size`:
 * the shell's page region, the AI tab's main region), so code can find the container a `@container content` rule
 * there measures. media.content.test.ts holds the list of those CSS files.
 */
export const CONTENT_CONTAINER = 'data-hub-content';

/** The size a container query reads: the content box's inline size, without the padding or a scrollbar. */
function contentBoxWidth(el: HTMLElement): number {
  const cs = getComputedStyle(el);
  return el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
}

/**
 * True while the `content` container around an element is narrower than `px`. It is the same container and the same
 * size that a `@container content (width < px)` rule beside the element reads: the nearest ancestor marked
 * CONTENT_CONTAINER (else #hub-main), content box. Put the returned ref on the element. False until measured, and
 * where there is no ResizeObserver.
 */
export function useContentNarrow(px: number): [(el: Element | null) => void, boolean] {
  const [anchor, setAnchor] = useState<Element | null>(null);
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    if (!anchor) return;
    const el = anchor.parentElement?.closest<HTMLElement>(`[${CONTENT_CONTAINER}]`) ?? document.getElementById('hub-main');
    if (!el) return;
    const judge = (w: number) => setNarrow(w > 0 && w < px);
    // The first read is whole pixels (clientWidth); the observer, which reports once at the start too, gives the
    // fractional content box a container query compares (599.6 px is narrow).
    judge(contentBoxWidth(el));
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.contentBoxSize?.[0];
      judge(box ? box.inlineSize : contentBoxWidth(el));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchor, px]);
  return [setAnchor, narrow];
}

/**
 * True while a container is narrower than `px`: the element `ref` names, else the page region
 * (#hub-main). For a page that swaps to compact forms by the room it has, not by the viewport (the
 * dock and the sidebar take width too). False until measured, and where there is no ResizeObserver.
 */
export function useContainerNarrow(px: number, ref?: RefObject<HTMLElement | null>): boolean {
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const el = ref ? ref.current : document.getElementById('hub-main');
    if (!el) return;
    const measure = () => setNarrow(el.clientWidth > 0 && el.clientWidth < px);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [px, ref]);
  return narrow;
}

/**
 * Coming back to the tab calls `reload`: a provider signed out in another tab shows up without a manual reload.
 * At most one call per `gapMs`, so focus and visibility firing together call once. The model chooser uses 10 s;
 * the AI page keeps its 3 s default.
 */
export function useReloadOnReturn(reload: () => void, gapMs = 3000): void {
  const latest = useRef(reload);
  latest.current = reload;
  useEffect(() => {
    let last = 0;
    const back = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (last !== 0 && now - last < gapMs) return;
      last = now;
      latest.current();
    };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => {
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('focus', back);
    };
  }, [gapMs]);
}
