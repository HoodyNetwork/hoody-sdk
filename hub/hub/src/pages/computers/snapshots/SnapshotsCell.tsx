// The Computers list cell for snapshots: the computer's snapshot count and a shortcut to its Backups tab. It only
// navigates; it reads and sends nothing.
import { IconButton, useGo, useStrings } from '@kit';
import { useCan } from '@core';
import { handleOf } from '../logic';
import type { Computer } from '../types';
import { countOf } from './logic';
import strings from './strings.en.json';
import s from './snapshots.module.css';

/** Nothing while the row carries no count, or when the session cannot use snapshots. A press does not reach the
 *  row (react-aria presses do not propagate). */
export function SnapshotsCell({ computer: c }: { computer: Computer }) {
  const t = useStrings(strings);
  const go = useGo();
  const can = useCan('computers.features.snapshots');
  const n = countOf(c);
  if (!can || n === null) return null;
  // The number is shown as text beside an icon button (whose name carries the count), so no button label holds data.
  return (
    <span className={s.badge}>
      <span aria-hidden="true">{n}</span>
      <IconButton icon="clock" size="sm" variant="ghost" label={t('badge.label', { count: n, name: c.name })} onPress={() => go(`/computers?sel=${encodeURIComponent(handleOf(c))}&tab=backups`)} />
    </span>
  );
}
