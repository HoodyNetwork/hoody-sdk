// The listing inspector's sections in reading order: the spec sheet, the term picker, the order, the order's facts and
// "Good to know". The terminal sibling puts the term picker and the order first, so the amount about to be paid is on
// the first screen of a short terminal.
import type { ReactNode } from 'react';
import { Stack } from '@kit';

export interface DetailSectionsProps {
  specs: ReactNode;
  terms: ReactNode;
  order: ReactNode;
  orderFacts: ReactNode;
  perks: ReactNode;
}

export function DetailSections({ specs, terms, order, orderFacts, perks }: DetailSectionsProps) {
  return (
    <Stack gap={5}>
      {specs}
      {terms}
      {order}
      {orderFacts}
      {perks}
    </Stack>
  );
}
