// raw.tsx in the terminal: the same names drawn with the terminal's own boxes and text.
// - Points / Point: one "• " line per point, wrapped under its text.
// - CodeLeaf: an id on one line, cut with an ellipsis when it does not fit (the web's truncate class).
// - Bidi: the text as it is (a terminal line has one direction).
// - GroupBox: a group node named by its label.
// - Block: a cell of the new-chat strip, a column with the cell's padding (the web's 14 px is two columns and one row).
// - FormBlock: a column with an empty line between fields.
import type { ReactNode } from 'react';
import { Box, Text } from '@term/prim';
import type * as Web from './raw';

const leaf = (n: ReactNode): ReactNode => (typeof n === 'string' || typeof n === 'number' ? <Text>{String(n)}</Text> : n);

export const Points: typeof Web.Points = ({ children }) => <Box dir="column">{children}</Box>;

export const Point: typeof Web.Point = ({ children }) => (
  <Box dir="row">
    <Box shrink={0}><Text colour="muted">{'• '}</Text></Box>
    <Box dir="column" grow={1} shrink={1}>{leaf(children)}</Box>
  </Box>
);

export const CodeLeaf: typeof Web.CodeLeaf = ({ children }) => (
  <Box shrink={1} minWidth={0}><Text truncate>{children}</Text></Box>
);

export const Bidi: typeof Web.Bidi = ({ children }) => <>{leaf(children)}</>;

export const GroupBox: typeof Web.GroupBox = ({ label, children }) => <Box dir="column" sem={{ role: 'group', name: label }}>{children}</Box>;

export const Block: typeof Web.Block = ({ children }) => <Box dir="column" grow={1} shrink={1} padX={2} padY={1} align="start">{children}</Box>;

export const FormBlock: typeof Web.FormBlock = ({ children }) => <Box dir="column" gap={1}>{children}</Box>;
