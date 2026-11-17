// Two Files panes side by side in the terminal. The web holds the split in an inline grid style, which the terminal
// Hub does not read; here the two slots are boxes that grow by the two shares, so a Splitter step (←/→, Enter evens)
// moves the panes by the share it announces. The bounds are the web's for the same room: the row's width less the
// splitter's cell and the two gaps, in px as a px question reads a cell here (8 px a column).
import { Splitter, useStrings } from '@kit';
import { Box, useBoxSize } from '@term/prim';
import { useState } from 'react';
import { splitBounds } from './twoPanes.pure';
import strings from './strings.en.json';
import type * as Web from './twoPanes';

/** Cells between a pane and the splitter (the grid's gap). */
const GAP = 1;
/** px one column stands for when shared code asks a px question (as kit/media.term.ts and the Splitter's drag count). */
const CELL_PX = 8;

export const TwoPanes: typeof Web.TwoPanes = ({ a, b }) => {
  const t = useStrings(strings);
  const [size, onSize] = useBoxSize();
  const [split, setSplit] = useState(50);
  // Not measured yet: no room, so the web's unknown-room bounds (25-75) hold until the first layout.
  const room = size ? Math.max(0, size.width - 1 - 2 * GAP) * CELL_PX : 0;
  const [lo, hi] = splitBounds(room);
  const value = Math.min(hi, Math.max(lo, split));
  return (
    <Box dir="row" gap={GAP} height="100%" minHeight={0} onSize={onSize}>
      <Box dir="row" grow={value} shrink={1} basis={0} minWidth={0} minHeight={0} sem={{ id: 'files-pane-a' }}>{a}</Box>
      <Splitter
        orientation="vertical"
        value={value}
        min={lo}
        max={hi}
        label={t('split.label')}
        controls="files-pane-a"
        onStep={(d) => setSplit(Math.min(hi, Math.max(lo, value + d)))}
        onEqualise={() => setSplit(50)}
      />
      <Box dir="row" grow={100 - value} shrink={1} basis={0} minWidth={0} minHeight={0} sem={{ id: 'files-pane-b' }}>{b}</Box>
    </Box>
  );
};
