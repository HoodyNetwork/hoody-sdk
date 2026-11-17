// CountMark in a terminal: the kit CountBadge alone. The web's placement box (a span carrying `className`) places the
// badge on its icon or row with CSS, which a terminal does not have; the host's own layout places it.
import type * as Web from './CountMark';
import { CountBadge } from '@kit/controls/CountBadge';

export type { CountMarkProps } from './CountMark';

export const CountMark: typeof Web.CountMark = ({ n, capped = false, tone }) => (
  <CountBadge count={n} atLeast={capped} hidden tone={tone} />
);
