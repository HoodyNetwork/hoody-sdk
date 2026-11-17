// ActionCards in the terminal: the same list of cards, one block each, a blank line apart: the icon's mark and the title
// as a heading one level below its section, the muted line, then the actions in one wrapping row (each its own Tab stop).
import type * as Web from './ActionCards';
import { Box, Text } from '../../term/prim';
import { Icon } from '../icons';
import { useHeadingLevel } from '../layouts/anatomy/Heading';
import { Flow } from './termFlow';

export type { ActionCard, ActionCardsProps } from './ActionCards';

export const ActionCards: typeof Web.ActionCards = ({ label, cards }) => {
  const level = Math.min(6, useHeadingLevel() + 1);
  return (
    <Box dir="column" gap={1} shrink={0} sem={{ role: 'list', name: label }}>
      {cards.map((c) => (
        <Box key={c.id} dir="column" shrink={0} sem={{ role: 'listitem' }}>
          <Box dir="row" gap={1} shrink={0}>
            {c.icon && <Icon name={c.icon} />}
            <Text bold colour="ink" sem={{ role: 'heading', level, name: c.title }}>{c.title}</Text>
          </Box>
          {c.body !== undefined && <Flow colour="muted">{c.body}</Flow>}
          {c.actions !== undefined && <Box dir="row" gap={2} gapY={0} wrap shrink={0}>{c.actions}</Box>}
        </Box>
      ))}
    </Box>
  );
};
