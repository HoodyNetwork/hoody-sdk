// A dialog's body scrolls when it is taller than the screen (80x24). An outcome note that appears in it after the
// action was pressed (a refused confirm: "Nothing was removed") is drawn at the end of the body, which can be wholly
// below the fold: the press then looked as if it did nothing. When the dialog's primary action fires, the dialog arms
// its body scroll; a note that mounts inside an armed scroll brings itself into view once it is laid out. A note that
// is there when the dialog opens, or that arrives by itself before any press, moves nothing (a surface opens at its
// top). A page's own scroll is never armed: a note on a page moves nothing.
// One press shows one note: the note that reveals itself disarms the scroll, so a banner that mounts later for another
// reason moves nothing (the next press arms it again). A press while the last shown note is still there shows it
// again (the same refusal does not mount twice; the person may have scrolled back up).
import { useEffect } from 'react';

const ARMED = 'hxRevealsOutcome';
const LAST = 'hxRevealedNote';
type Node = { parent?: Node | null; isDestroyed?: boolean; scrollChildIntoView?: (n: unknown, o: { align: 'nearest' }) => void } & Record<string, unknown>;

const inside = (n: Node, scroll: Node): boolean => {
  if (n.isDestroyed === true) return false;
  for (let p = n.parent ?? null; p; p = p.parent ?? null) if (p === scroll) return true;
  return false;
};
// 'nearest' shows a note taller than the view from its first row (pinned: dialogReveal test 'taller than the view').
function show(scroll: Node, n: Node): void {
  try { scroll.scrollChildIntoView?.(n, { align: 'nearest' }); } catch { /* gone mid-scroll */ }
}

/** Called by a dialog when its primary action fires, with its body scroll. */
export const armReveal = (scroll: unknown): void => {
  if (!scroll) return;
  const s = scroll as Node;
  s[ARMED] = true;
  const last = s[LAST] as Node | undefined;
  if (last && inside(last, s)) setTimeout(() => { if (inside(last, s)) show(s, last); }, 0);
};

/** Brings `box` into view once, after it mounts, when its nearest scroll is the body of a dialog whose action has fired. */
export function useRevealInDialog(box: { current: unknown }): void {
  useEffect(() => {
    const id = setTimeout(() => {
      const n = box.current as Node | null;
      if (!n) return;
      for (let p = n.parent ?? null; p; p = p.parent ?? null) {
        if (typeof p.scrollChildIntoView !== 'function') continue;
        if (p[ARMED] === true) {
          p[ARMED] = false;
          p[LAST] = n;
          show(p, n);
        }
        return;
      }
    }, 0);
    return () => clearTimeout(id);
  }, [box]);
}
