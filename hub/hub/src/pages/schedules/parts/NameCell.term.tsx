// The list's text cells in the terminal. The name: the kit's MarkCell, so a marked and an unmarked row start their
// names in one column (a fixed 2-cell gutter), the name is cut at its end with one "…", and the tag gives way first,
// whole. The other cells are one Text each (no hover in a terminal: the short wording only).
import { Icon, Tag, useStrings } from '@kit';
import { MarkCell } from '../../../kit/data/cells';
import { Text } from '@term/prim';
import strings from '../strings.en.json';
import { nextShort, nextText } from './words';
import type { NameCellProps } from './NameCell';
import type * as Web from './NameCell';

export const termNameCell: typeof Web.termNameCell = ({ attention, attentionLabel, name, after }: NameCellProps) => (
  <MarkCell mark={attention ? <Icon name="warn" size="sm" label={attentionLabel} /> : undefined} after={after}>
    {name}
  </MarkCell>
);

export const NameCell: typeof Web.NameCell = ({ row, children }) => {
  const t = useStrings(strings);
  return (
    <MarkCell mark={row.attention ? <Icon name="warn" size="sm" label={t('f.attention')} /> : undefined} after={<Tag>{t(`kind.${row.src}` as 'kind.cron')}</Tag>}>
      {children}
    </MarkCell>
  );
};

export const NextLine: typeof Web.NextLine = ({ row, now, zone }) => {
  const t = useStrings(strings);
  const n = nextShort(t, row, now, zone);
  return <Text>{n ? n.rel : nextText(t, row, now, zone)}</Text>;
};

export const ScheduleCell: typeof Web.ScheduleCell = ({ children }) => <Text>{children}</Text>;

export const NextCell: typeof Web.NextCell = ({ row, now, zone }) => {
  const t = useStrings(strings);
  const n = nextShort(t, row, now, zone);
  return <Text>{n ? n.rel : nextText(t, row, now, zone)}</Text>;
};
