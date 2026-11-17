// The listing inspector's sections in the terminal: the term picker, the order and the order's facts (delivery, what
// happens after the term) come first, then the spec sheet and "Good to know". A full spec sheet is taller than a
// 40-row terminal's detail pane, so in the web's order the amount about to be paid sat below the fold.
import { Stack } from '@kit';
import type * as Web from './DetailSections';

export const DetailSections: typeof Web.DetailSections = ({ specs, terms, order, orderFacts, perks }) => (
  <Stack gap={5}>
    {terms}
    {order}
    {orderFacts}
    {specs}
    {perks}
  </Stack>
);
