// PropagatingNote in the terminal: one muted note, a clock then the sentence. The clock stays on the note's first row
// and the sentence wraps at whole words in its own column (the compat drawing centred the clock on a wrapped note,
// broke "(DNS)" after its bracket and lost a letter at narrow widths). Same rule as the web: variant 'row' shows only
// while the link is fresh and hides itself when the minute ends; 'created' always shows.
import type * as Web from './Propagating';
import { Box } from '@term/prim';
import { Flow } from '../data/termFlow';
import { Icon } from '../icons';
import { useStrings } from '../strings';
import { useFresh } from './Propagating.pure';
import strings from './Propagating.strings.en.json';

export type { PropagatingNoteProps } from './Propagating';
export { PROPAGATION_MS, isFresh, useFresh } from './Propagating.pure';

export const PropagatingNote: typeof Web.PropagatingNote = ({ createdAt, variant = 'row' }) => {
  const t = useStrings(strings);
  const fresh = useFresh(createdAt);
  if (variant === 'row' && !fresh) return null;
  return (
    <Box dir="row" gap={1} shrink={0}>
      <Box shrink={0}><Icon name="clock" size="sm" /></Box>
      <Box dir="column" grow={1} shrink={1}><Flow colour="muted" words>{t(variant === 'created' ? 'propagating.created' : 'propagating.row')}</Flow></Box>
    </Box>
  );
};
