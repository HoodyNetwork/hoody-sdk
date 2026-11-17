// The list's text cells and the tab bar in the terminal. The name: the kit's MarkCell, so a marked and an unmarked
// row start their names in one column (a fixed 2-cell gutter), the name is cut at its end with one "…", and the tag
// gives way first, whole. "Ends in …" is one Text (no hover in a terminal).
import { Icon, Tabs, useStrings } from '@kit';
import { MarkCell } from '../../../kit/data/cells';
import { Box, Text } from '@term/prim';
import strings from '../strings.en.json';
import type { NameCellProps } from './NameCell';
import type * as Web from './NameCell';

export const nameCell: typeof Web.nameCell = ({ attention, attentionLabel, name, after }: NameCellProps) => (
  <MarkCell mark={attention ? <Icon name="warn" size="sm" label={attentionLabel} /> : undefined} after={after}>
    {name}
  </MarkCell>
);

export const textCell: typeof Web.textCell = (text) => <Text>{text}</Text>;

export const TabsBlock: typeof Web.TabsBlock = () => {
  const t = useStrings(strings);
  return (
    <Box dir="column" shrink={0}>
      <Tabs label={t('tabs.label')} param="tab" items={[{ id: 'running', label: t('tab.running') }, { id: 'apps', label: t('tab.apps') }, { id: 'ports', label: t('tab.ports') }]} />
    </Box>
  );
};
