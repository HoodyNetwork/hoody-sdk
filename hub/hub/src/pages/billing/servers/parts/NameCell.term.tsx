// The Listings name cell in the terminal: the server name on one line, cut with "…" when long, then its tags on a line
// of their own, as on the web.
import { Box, Text } from '@term/prim';
import type * as Web from './NameCell';

export const nameCell: typeof Web.nameCell = ({ name, tags }) => (
  <Box dir="column" shrink={1} minWidth={0}>
    <Text truncate>{name}</Text>
    {tags.length > 0 ? (
      <Box dir="row" wrap gap={1} shrink={0}>
        {tags}
      </Box>
    ) : null}
  </Box>
);
