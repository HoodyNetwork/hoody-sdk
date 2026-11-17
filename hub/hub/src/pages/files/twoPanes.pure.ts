// The two panes' sizing rule, shared by the page (when two panes fit side by side), TwoPanes on the web and its
// terminal sibling (the same bounds for the same room, so the splitter steps alike on both).

/** A pane stays usable from this width: its computer picker, the table's search and its columns. */
export const PANE_MIN = 420;

/** The split's bounds, in percent of the room both panes share: each pane keeps PANE_MIN, within 25-75. Unknown
 *  room (not measured yet) keeps 25-75; room too small for two minima holds the split at 50. */
export function splitBounds(room: number): readonly [number, number] {
  if (!(room > 0)) return [25, 75];
  const lo = Math.max(25, Math.ceil((100 * PANE_MIN) / room));
  return lo >= 50 ? [50, 50] : [lo, 100 - lo];
}
