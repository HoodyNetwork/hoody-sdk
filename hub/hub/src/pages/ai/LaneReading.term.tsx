// LaneReading in the terminal: one row that never shrinks, the percent end-aligned in four cells ("100%"; wider words
// keep their own width, never cut) and then the bar, so the bars of a column start under each other and the table cuts the cell whole when its column is narrow.
import { Meter, useStrings } from '@kit';
import { Box, Text, cellWidth, padCells } from '@term/prim';
import strings from './Allowance.strings.en.json';
import type * as Web from './LaneReading';

export const LaneReading: typeof Web.LaneReading = ({ pct, label, tone }) => {
  const words = useStrings(strings)('aiu.pct', { pct });
  return (
    <Box dir="row" gap={1} shrink={0}>
      <Text>{padCells(words, Math.max(4, cellWidth(words)), 'end')}</Text>
      <Meter value={pct} size="sm" label={label} tone={tone} />
    </Box>
  );
};
