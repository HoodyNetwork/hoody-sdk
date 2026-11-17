// The Customize list in the terminal: one row per Home card, its show switch (named by the card, as the web's) then [↑] [↓]. The
// web's grip is pointer-only and has no cell form; the buttons are the way to reorder, as they are the web grip's
// keyboard equivalent. The web's up/down are icon buttons whose terminal face is their whole label ("[Move Start
// something up]"), which squeezed the switch into a 4-cell column; here they show their arrow and keep the label as name.
import { Button, Switch, useStrings } from '@kit';
import { Box } from '@term/prim';
import homeStrings from '../strings.en.json';
import strings from './strings.en.json';
import type * as Web from './OrderList';

const UP = '↑';
const DOWN = '↓';

export const OrderList: typeof Web.OrderList = ({ all, hiddenKeys, onToggle, onMove }) => {
  const th = useStrings(homeStrings);
  const t = useStrings(strings);
  return (
    <Box dir="column" shrink={0} sem={{ role: 'list', name: t('order.list') }}>
      {all.map((w, i) => (
        <Box key={w.key} dir="row" gap={1} shrink={0} sem={{ role: 'listitem' }}>
          <Box grow={1} shrink={1} minWidth={0}>
            <Switch label={w.title} isSelected={!hiddenKeys.has(w.key)} onChange={(on) => onToggle(w.key, on)} />
          </Box>
          <Button size="sm" aria-label={th('customize.up', { title: w.title })} isDisabled={i === 0} onPress={() => onMove(w.key, -1)}>{UP}</Button>
          <Button size="sm" aria-label={th('customize.down', { title: w.title })} isDisabled={i === all.length - 1} onPress={() => onMove(w.key, 1)}>{DOWN}</Button>
        </Box>
      ))}
    </Box>
  );
};
