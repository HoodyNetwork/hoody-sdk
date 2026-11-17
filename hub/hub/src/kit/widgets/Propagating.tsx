// A new link's address can take about a minute to answer while its DNS spreads. One shared piece for every create flow
// that makes a link (Bot links, aliases, program addresses): isFresh / useFresh say whether a link is still inside
// PROPAGATION_MS of its created time, and PropagatingNote is the line that says so (its class is in Widgets.module.css).
import { cx } from '../controls/Button';
import { Icon } from '../icons';
import { useStrings } from '../strings';
import { useFresh } from './Propagating.pure';
import strings from './Propagating.strings.en.json';
import s from './Widgets.module.css';

export { PROPAGATION_MS, isFresh, useFresh } from './Propagating.pure';

export interface PropagatingNoteProps {
  /** The link's created time from the server (row variant). */
  createdAt?: string | null;
  variant?: 'row' | 'created';
  className?: string;
}

/** The muted line saying a new link may not answer yet: variant 'row' (default) shows only while the link is fresh and hides itself
 *  when the minute ends, with no reload; variant 'created' is the create confirmation's line, shown always. */
export function PropagatingNote({ createdAt, variant = 'row', className }: PropagatingNoteProps) {
  const t = useStrings(strings);
  const fresh = useFresh(createdAt);
  if (variant === 'row' && !fresh) return null;
  return (
    <p className={cx(s.propagating, className)}>
      <Icon name="clock" size="sm" />
      <span>{t(variant === 'created' ? 'propagating.created' : 'propagating.row')}</span>
    </p>
  );
}
