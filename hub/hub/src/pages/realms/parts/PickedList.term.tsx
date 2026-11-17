// The picked computers in the terminal: the count on its own line, then every name on a row with its colour mark. No
// inner scroll and no stop of its own: the page scrolls, so every name can be reached with the keys.
import { ComputerMark } from '@kit';
import { Box, Text } from '@term/prim';
import type * as Web from './PickedList';

export type { PickedListProps } from './PickedList';

export const PickedList: typeof Web.PickedList = ({ count, items }) => (
  <Box dir="column">
    <Text>{count}</Text>
    {items.map((r) => (
      <Box dir="row" gap={1} key={r.id}>
        <ComputerMark color={r.color} />
        <Text>{r.name}</Text>
      </Box>
    ))}
  </Box>
);
