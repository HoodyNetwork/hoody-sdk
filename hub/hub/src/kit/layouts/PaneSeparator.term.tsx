// The handle between two panes in the terminal: a one-column rule. Tab reaches it; ←/→ move it by 16 px (2 columns),
// Home/End to the range's ends, Enter back to the default; a mouse drag moves it a column per cell. The width is the
// web's (px), remembered in the same store under the same key (paneWidth.ts).
import { useEffect, useRef, useState } from 'react';
import type * as Web from './PaneSeparator';
import { Box, useFocusable, usePaneSize } from '../../term/prim';
import { TableMark } from '../../term/prim/TableMark';
import { useFocusSem } from './termParts';
import { clampPane, readPaneWidth, writePaneWidth } from './paneWidth';

export type { PaneRange, PaneSeparatorProps } from './PaneSeparator';

const STEP = 16;
const CELL_PX = 8;

export const usePaneWidth: typeof Web.usePaneWidth = (key, kind, range) => {
  const [w, setW] = useState(() => readPaneWidth(key, kind, range));
  useEffect(() => writePaneWidth(key, kind, w), [key, kind, w]);
  return [w, setW];
};

/** A ref reaches no element in a terminal: the element's width is the room of the nearest measured pane (prim PaneSize),
 * in px, while `on`. It follows terminal resizes and pane changes. */
export const useElementWidth: typeof Web.useElementWidth = (_ref, on) => {
  const { cols } = usePaneSize();
  return on ? cols * CELL_PX : undefined;
};

export const PaneSeparator: typeof Web.PaneSeparator = ({ value, range, onChange, dir, label }) => {
  const drag = useRef<{ x: number; w: number } | null>(null);
  const f = useFocusable({
    onKey: (k) => {
      const step = k.name === 'left' ? -1 : k.name === 'right' ? 1 : 0;
      if (step !== 0) onChange(clampPane(range, value + step * STEP * dir));
      else if (k.name === 'return' || k.name === 'linefeed') onChange(range.def);
      else if (k.name === 'home') onChange(range.min);
      else if (k.name === 'end') onChange(range.max);
      else return false;
      return true;
    },
  });
  const ref = useFocusSem(f, { role: 'separator', name: label, value: String(Math.round(value)) });
  return (
    <Box dir="column" width={1} shrink={0} boxRef={ref}
      // The drag starts at the press itself (mouse down). A Box onPress fires on the release, and this box's own
      // onMouseUp replaced that release handler: no press ever reached it, so a drag never started and a click never
      // focused the handle.
      raw={{
        onMouseDown: (e: { button: number; x: number; stopPropagation(): void }) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          f.focus();
          drag.current = { x: e.x, w: value };
        },
        onMouseDrag: (e: { x: number }) => { const d = drag.current; if (d) onChange(clampPane(range, d.w + (e.x - d.x) * CELL_PX * dir)); },
        onMouseDragEnd: () => { drag.current = null; },
        onMouseUp: () => { drag.current = null; },
      }}>
      {/* The rule: the line colour at rest; the focus colour and a ⇔ mark while it has the focus (reads in mono too).
          The mark is left out of the engine's text selection: a press on a selectable text starts a selection, which
          takes the drag and the release away from the handle. */}
      {f.focused && <TableMark colour="focus" bold>⇔</TableMark>}
      <Box grow={1} border={['left']} borderColour={f.focused ? 'focus' : 'line'} />
    </Box>
  );
};
