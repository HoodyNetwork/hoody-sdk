// Stack and Row in the terminal: the token gap scale in cells.
import type * as Web from './Stack';
import { Box, cols, rows, type Gap } from '../../term/prim';

export type { StackProps, RowProps } from './Stack';

const PAD = { none: { x: 0, y: 0 }, sm: { x: 1, y: 0 }, md: { x: 2, y: 0 }, page: { x: 2, y: 1 } } as const;

export const Stack: typeof Web.Stack = ({ gap = 4, padding = 'none', align = 'stretch', children }) => (
  <Box dir="column" gap={rows(gap as Gap)} padX={PAD[padding].x} padY={PAD[padding].y} align={align}>
    {children}
  </Box>
);

// A wrapping Row: `gap` in columns along a line, and the same token in rows between wrapped lines (sp-3 and up is one
// row: fields that wrap keep a line between them; chips and buttons at sp-1/sp-2 wrap onto the very next line).
export const Row: typeof Web.Row = ({ gap = 2, padding = 'none', align = 'center', justify = 'start', wrap, children }) => (
  <Box dir="row" gap={cols(gap as Gap)} {...(wrap ? { gapY: rows(gap as Gap) } : {})} padX={PAD[padding].x} padY={PAD[padding].y} align={align} justify={justify} wrap={wrap} {...(justify !== 'start' ? { width: '100%' as const } : {})}>
    {children}
  </Box>
);
