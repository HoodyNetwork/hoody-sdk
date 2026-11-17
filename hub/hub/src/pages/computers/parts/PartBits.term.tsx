// The detail parts' small wrappers in the terminal: a column with one blank line between sections, a wrapping row with
// one cell between pieces, plain text for a mono value and for a sentence. Inside running text (a link's words) the row
// is its pieces with one space between them, since a box cannot sit in a text.
import { Children, Fragment } from 'react';
import { Box, Text, useInText } from '@term/prim';
import type * as Web from './PartBits';

export const PartStack: typeof Web.PartStack = ({ children }) => (
  <Box dir="column" gap={1}>
    {children}
  </Box>
);

export const IdRow: typeof Web.IdRow = ({ children }) => {
  const inText = useInText();
  const items = Children.toArray(children);
  if (inText) return <>{items.map((c, i) => <Fragment key={i}>{i > 0 ? ' ' : null}{c}</Fragment>)}</>;
  return (
    <Box dir="row" wrap gapX={1}>
      {items.map((c, i) => (typeof c === 'string' || typeof c === 'number' ? <Text key={i}>{String(c)}</Text> : c))}
    </Box>
  );
};

/** One Text, which stays inside a text run (term/jsx/dom.ts isInlineComponent). */
export const Mono: typeof Web.Mono = ({ children }) => <Text>{children}</Text>;
(Mono as { hxInline?: boolean }).hxInline = true;

/** One Text: a line in a stack, and inside a text run it stays part of the run. */
export const Line: typeof Web.Line = ({ children }) => <Text>{children}</Text>;
(Line as { hxInline?: boolean }).hxInline = true;

export const UpgradeRow: typeof Web.UpgradeRow = ({ children }) => <Box dir="row">{children}</Box>;

/** No touch height in a terminal. */
export const touchClass: typeof Web.touchClass = '';
