// IntroPanel in the terminal: the line with Hide at its end, then the actions. The eyebrow repeats the header's own
// entry that opens the panel, and the map with its card is a picture, so neither has a cell form.
import type * as Web from './IntroPanel';
import { forwardRef } from 'react';
import { Box } from '../../term/prim';
import { Lead } from '../layouts/Lead';
import { Widget } from '../layouts/Layouts';

export type { IntroPanelComputer, IntroPanelProps } from './IntroPanel';

/** The line's measure (the web panel's text column). */
const LEAD_COLS = 46;

export const IntroPanel: typeof Web.IntroPanel = forwardRef<HTMLElement, Web.IntroPanelProps>(function IntroPanel({ labelId, lead, actions, hide }, _ref) {
  return (
    <Widget size="l">
      <Box dir="column" gap={1} shrink={0}>
        <Box dir="row" justify="between" gap={2} shrink={0}>
          <Box dir="column" shrink={1} maxWidth={LEAD_COLS}>
            <Lead id={labelId}>{lead}</Lead>
          </Box>
          {hide}
        </Box>
        <Box dir="row" wrap gap={2} gapY={1} shrink={0}>
          {actions}
        </Box>
      </Box>
    </Widget>
  );
});
