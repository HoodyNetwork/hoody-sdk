// The Hoody busy mark in the terminal: a still "…", as Spinner draws it (the web's still frame; a glyph that animates
// would keep an idle app drawing), then the page's words of what it waits for. With a label and no words it is a status
// named by the label; with neither it is decorative (hidden from the semantics), as on the web.
import type * as Web from './HoodyLoader';
import { Box, Text } from '../../term/prim';
export type { HoodyLoaderProps } from './HoodyLoader';

/** The mark and its three parts, the web module's values (the terminal draws neither; LoadScreen's web view reads them,
 *  and a sibling exports every runtime name of its module). Kept equal by HoodyLoader.term's test. */
export const HOODY_MARK = 'M1 1h22v22H1zM4.4375 4.4375h2.75v8.25h-2.75zM4.4375 15.4375h2.75v4.125h-2.75zM7.1875 12.6875h12.375v6.875h-2.75v-4.125H7.1875z';
export const HOODY_PARTS = [
  'M4.4375 15.4375h2.75v4.125h-2.75z',
  'M4.4375 4.4375h2.75v8.25h-2.75z',
  'M7.1875 12.6875h12.375v6.875h-2.75v-4.125H7.1875z',
] as const;

export const HoodyLoader: typeof Web.HoodyLoader = ({ size, label, text }) => {
  const hasText = text !== undefined && text !== null && text !== false && text !== '';
  const bold = size === 'lg';
  if (!hasText) {
    return label
      ? <Text colour="muted" bold={bold} sem={{ role: 'status', name: label }}>…</Text>
      : <Text colour="muted" bold={bold} sem={{ hidden: true }}>…</Text>;
  }
  return (
    <Box dir="row" gap={1} shrink={1} sem={{ role: 'status' }}>
      <Text colour="muted" bold={bold} shrink={0}>…</Text>
      {typeof text === 'string' || typeof text === 'number' ? <Text colour="muted" shrink={1}>{String(text)}</Text> : text}
    </Box>
  );
};
