// The section the reader is in: the last one whose top has passed 30 % of the content viewport,
// and the last section once the scroll reaches its end. A jump (index click, j/k, a #hash link)
// scrolls the heading 24 px under the top, moves focus to it and marks it current at once; the
// spy ignores the scroll animation so the index never flickers through the sections in between.
// The Guide keeps no scroll room under its last section, so a jump to a section near the
// end stops at the end of the scroll with that section below the line: it stays current there
// (`held`). The hold lasts while the jump's scroll is on its way (it can outlast the lock) and,
// once that scroll rests at the end, until the scroll moves off that rest. It ends at once when
// the section reaches the top (the jump arrived where any section can: the line decides from then
// on), when the reader scrolls by hand (wheel, touch, a press, or a scroll back up: a jump's own
// scroll to a section that cannot reach the top only goes down, to the end, so a scroll key or a
// drag that moves up is the reader's), when the section leaves the list, and HOLD_MS after the
// jump if its scroll has not come to rest at the end by then. Keys are read from the scroll they
// make, never from a document keydown listener (page keys go through usePageShortcuts).
// The hold takes a move for the reader's only when the scroll position and where the held section
// shows (its top in the scroller's view) agree: a scroll up by the reader lowers the one and moves
// the section down the view. Scroll anchoring (the browser keeping the view still when content
// above it changes size) moves only the scroll position, and content changing size between the
// anchor and the section moves only the section: such a move ends nothing, and the hold measures
// from where things then are.
// A jump scrolls only the page's own scroller (#hub-main): a document-level scrollIntoView also
// scrolled the shell's overflow-hidden frame and pushed the top bar out of view.
import { scrollSettingsSection } from '@kit';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import { currentSection, type SectionId } from '../logic';

const READ_LINE = 0.3;
const JUMP_LOCK_MS = 900;
const HOLD_MS = 4000;
// A jump puts the heading 24 px under the top (scroll-margin, --sp-6); within this much of the top it has arrived.
const ARRIVED_PX = 32;

function scroller(from: Element | null): HTMLElement | null {
  for (let el = from?.parentElement ?? null; el; el = el.parentElement) {
    const y = getComputedStyle(el).overflowY;
    if ((y === 'auto' || y === 'scroll') && el.scrollHeight > el.clientHeight) return el;
  }
  return null;
}

export function useScrollSpy(order: readonly SectionId[]): [SectionId | undefined, (id: SectionId, smooth?: boolean) => void] {
  const [current, setCurrent] = useState<SectionId | undefined>(order[0]);
  const lockUntil = useRef(0);
  // The section the last jump went to (see the header): `until` ends a hold whose scroll never got to the end, `at` is
  // the scroll position and where the section showed when that scroll came to rest at the end; `far` is the furthest
  // down the scroll went and `high` the highest the section showed while the hold stood, from the jump on (a scroll
  // back up is measured from there, so a slow drag up in small steps, or one before the jump's own scroll is first
  // read, still ends the hold). Where the section shows is its top in the scroller's view.
  const held = useRef<{ id: SectionId; until: number; at?: { scroll: number; y: number }; far?: number; high?: number } | undefined>(undefined);
  // The re-read after a jump: one at a time (a new jump replaces it), cleared when the Guide unmounts.
  const reread = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The re-read runs the latest read: the Guide's sections as they are then, not as they were at the jump.
  const readNow = useRef<() => void>(() => {});

  const read = useCallback(() => {
    const locked = Date.now() < lockUntil.current;
    // During the lock only a standing hold is read: a scroll back up is the reader's (see the header).
    if (locked && !held.current) return;
    const els: [SectionId, HTMLElement][] = [];
    for (const id of order) {
      const el = document.getElementById(`guide-${id}`);
      if (el) els.push([id, el]);
    }
    const box = scroller(els[0]?.[1] ?? null);
    const top = box ? box.getBoundingClientRect().top : 0;
    const h0 = held.current;
    const heldEl = h0 && els.find(([id]) => id === h0.id)?.[1];
    if (h0 && box && heldEl) {
      const y = heldEl.getBoundingClientRect().top - top;
      const scroll = box.scrollTop;
      const back = h0.far !== undefined && scroll < h0.far - 2;
      const lower = h0.high !== undefined && y > h0.high + 2;
      if (back && lower) held.current = undefined;
      else if (back || lower) {
        // Only one moved: the layout did, not the reader. Measure from here on.
        h0.far = scroll;
        h0.high = y;
      } else {
        h0.far = Math.max(h0.far ?? scroll, scroll);
        h0.high = Math.min(h0.high ?? y, y);
      }
    }
    if (locked) return;
    const tops = new Map<SectionId, number>();
    for (const [id, el] of els) tops.set(id, el.getBoundingClientRect().top);
    const height = box ? box.clientHeight : window.innerHeight;
    const atEnd = box ? box.scrollTop + box.clientHeight >= box.scrollHeight - 2 && box.scrollTop > 0 : false;
    const atStart = box ? box.scrollTop <= 2 : window.scrollY <= 2;
    const line = top + height * READ_LINE;
    const h = held.current;
    if (h) {
      // Where the held section shows; a section in the list but not on the page is not held.
      const hy = tops.get(h.id);
      if (!box || !order.includes(h.id) || hy === undefined || hy <= top + ARRIVED_PX) held.current = undefined;
      else if (h.at === undefined) {
        if (Date.now() > h.until) held.current = undefined;
        else if (atEnd) h.at = { scroll: box.scrollTop, y: hy - top };
      } else {
        // Off the rest by a scroll down (content grew below the end): both move. Only one moved: the layout did.
        const on = box.scrollTop > h.at.scroll + 2;
        const up = hy - top < h.at.y - 2;
        if (on && up) held.current = undefined;
        else if (on || up) h.at = { scroll: box.scrollTop, y: hy - top };
      }
    }
    // Only the sections on the page: one in the list but not shown is never marked (not even as the last at the end).
    // None found (no section on the page yet): the list as it is, as before.
    const shown = order.filter((id) => tops.has(id));
    setCurrent(currentSection(tops, shown.length > 0 ? shown : order, line, atEnd, atStart, held.current?.id));
  }, [order]);
  // Set before any timer can run after a commit (a passive effect may still be pending when the re-read fires).
  useLayoutEffect(() => {
    readNow.current = read;
  }, [read]);

  // A layout cleanup: it runs in the commit that removes the Guide, so no timer can fire between that and the clear.
  useLayoutEffect(() => () => clearTimeout(reread.current), []);

  // The reader takes the scroll over: the hold ends, the next read goes by the line. A press comes before the click
  // of an index entry, so a new jump still sets its own hold.
  useEffect(() => {
    const release = () => {
      held.current = undefined;
    };
    document.addEventListener('wheel', release, { capture: true, passive: true });
    document.addEventListener('touchstart', release, { capture: true, passive: true });
    document.addEventListener('pointerdown', release, { capture: true });
    return () => {
      document.removeEventListener('wheel', release, { capture: true });
      document.removeEventListener('touchstart', release, { capture: true });
      document.removeEventListener('pointerdown', release, { capture: true });
    };
  }, []);

  useEffect(() => {
    read();
    // The shell's content area scrolls, not the window: listen in the capture phase on the document.
    document.addEventListener('scroll', read, { capture: true, passive: true });
    window.addEventListener('resize', read);
    return () => {
      document.removeEventListener('scroll', read, { capture: true });
      window.removeEventListener('resize', read);
    };
  }, [read]);

  const jump = useCallback(
    (id: SectionId, smooth = true) => {
      const el = document.getElementById(`guide-${id}`);
      if (!el) return;
      lockUntil.current = Date.now() + JUMP_LOCK_MS;
      // Where the section shows before the jump's scroll starts.
      const box = scroller(el);
      const high = box ? el.getBoundingClientRect().top - box.getBoundingClientRect().top : undefined;
      held.current = { id, until: Date.now() + HOLD_MS, far: box?.scrollTop, high };
      setCurrent(id);
      scrollSettingsSection(el, smooth);
      // Arriving by link only scrolls; a jump the reader made moves focus to the heading too.
      if (smooth) {
        // The section's own heading (the kit's strict section draws it without a tab stop).
        const heading = el.querySelector<HTMLElement>('[data-hub-heading]');
        if (heading) {
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
        }
      }
      clearTimeout(reread.current);
      reread.current = setTimeout(() => readNow.current(), JUMP_LOCK_MS + 50);
    },
    [],
  );

  return [current, jump];
}

/**
 * Goes to the section the URL names (`id`): on arrival, once it exists (`ready`: the data loaded; and the section is
 * drawn), and again on every later change while the page stays open. `followed` is the page's record of the section it
 * last jumped to for the URL (a pick sets it, so the hash the pick writes moves nothing more).
 */
export function useFollowSection(
  id: SectionId | undefined,
  ready: boolean,
  followed: MutableRefObject<SectionId | null>,
  jump: (id: SectionId, smooth?: boolean) => void,
  visible: readonly SectionId[],
): void {
  useEffect(() => {
    if (id === followed.current) return;
    // The URL names another section (or none): the one jumped to before no longer counts, even while the data loads,
    // so a later return to it jumps again.
    followed.current = null;
    // Not yet: the data still loads, or the section is not drawn (Topics before it loads); retried when that changes.
    if (!id || !ready || !document.getElementById(`guide-${id}`)) return;
    // Followed once the jump runs: a change before the frame (a pick, another hash) cancels it and decides afresh.
    const frame = requestAnimationFrame(() => {
      followed.current = id;
      jump(id, false);
    });
    return () => cancelAnimationFrame(frame);
  }, [id, ready, followed, jump, visible]);
}
