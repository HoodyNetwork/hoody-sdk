// KeyLine (terminal only): a key line such as "Enter send · Alt+Enter or Ctrl+J new line · PgUp scroll" drawn as one
// cell group per pair in a wrapping row, so a narrow line breaks only BETWEEN pairs (the web keeps each pair nowrap).
// A no-break space cannot do it: the engine's word wrap breaks at U+00A0 too. A pair wider than the whole line still
// wraps inside itself rather than being cut.
import type { ReactElement } from 'react';
import { Box, Text } from '@term/prim';
import type { Colour } from '@term/kit';

const SEP = ' · ';

export function KeyLine({ line, colour = 'faint' }: { line: string; colour?: Colour }): ReactElement {
  const pairs = line.split(SEP);
  return (
    <Box dir="row" wrap gapX={1} shrink={1} minWidth={0}>
      {pairs.map((p, i) => (
        <Text key={i} colour={colour} shrink={1}>{i < pairs.length - 1 ? p + ' ·' : p}</Text>
      ))}
    </Box>
  );
}
