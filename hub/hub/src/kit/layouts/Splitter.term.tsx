// A pane divider in the terminal (percentages; the board's panes): a one-cell rule, Tab-reachable. ←/→ (↑/↓ when the
// panes stack) step 5 points, Enter equalises; a mouse drag reports cell positions as px (×8 across, ×16 down), the
// same unit the web's pointer gives, so a page's own ratio maths works unchanged.
import { useRef } from 'react';
import type * as Web from './Splitter';
import { Box, useFocusable } from '../../term/prim';
import { TableMark } from '../../term/prim/TableMark';
import { useFocusSem } from './termParts';

export type { SplitterProps } from './Splitter';

const STEP = 5;

export const Splitter: typeof Web.Splitter = ({ orientation, value, label, controls, onStep, onEqualise, onDragStart, onDrag, onDragEnd }) => {
  const dragging = useRef(false);
  const vertical = orientation === 'vertical';
  const f = useFocusable({
    onKey: (k) => {
      const [less, more] = vertical ? ['left', 'right'] : ['up', 'down'];
      if (k.name === less || k.name === more) { onStep(k.name === more ? STEP : -STEP); return true; }
      if (k.name === 'return' || k.name === 'linefeed') { onEqualise(); return true; }
      return false;
    },
  });
  const end = () => { if (dragging.current) { dragging.current = false; onDragEnd?.(); } };
  const colour = f.focused ? 'focus' : 'line';
  const ref = useFocusSem(f, { role: 'separator', name: label, value: `${value} %`, ...(controls ? { controls } : {}) });
  return (
    <Box dir={vertical ? 'column' : 'row'} boxRef={ref} shrink={0} {...(vertical ? { width: 1 } : { height: 1 })}
      // The drag starts at the press itself (mouse down). A Box onPress fires on the release, and this box's own
      // onMouseUp replaced that release handler: no press ever reached it, so a drag never started and a click never
      // focused the divider.
      raw={{
        onMouseDown: (e: { button: number; stopPropagation(): void }) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          f.focus();
          if (!dragging.current) { dragging.current = true; onDragStart?.(); }
        },
        onMouseDrag: (e: { x: number; y: number }) => { if (dragging.current) onDrag?.(e.x * 8, e.y * 16); },
        onMouseDragEnd: end,
        onMouseUp: end,
      }}>
      <Box grow={1} border={vertical ? ['left'] : ['top']} borderColour={colour} />
      {/* The mark is left out of the engine's text selection: a press on a selectable text starts a selection, which
          takes the drag and the release away from the divider (no resize, no onDragEnd). */}
      {f.focused && <TableMark colour="focus" bold>{vertical ? '⇔' : '⇕'}</TableMark>}
    </Box>
  );
};
