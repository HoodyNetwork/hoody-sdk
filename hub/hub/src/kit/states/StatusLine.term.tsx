// StatusLine in the terminal: one muted line that stays in place and changes only its words; with nothing to say it
// keeps its empty row, so the lines under it do not move when the words come and go.
import type * as Web from './StatusLine';
import { Box } from '../../term/prim';
import { Inline } from '../layouts/termParts';
import type { ReactNode } from 'react';

export type { StatusLineProps } from './StatusLine';

const nothing = (c: ReactNode): boolean => c === null || c === undefined || c === false || c === '' || (Array.isArray(c) && c.every(nothing));

export const StatusLine: typeof Web.StatusLine = ({ children }) => (
  <Box dir="column" shrink={0} minHeight={1} sem={{ role: 'status' }}>
    {nothing(children) ? null : <Inline colour="muted">{children}</Inline>}
  </Box>
);
