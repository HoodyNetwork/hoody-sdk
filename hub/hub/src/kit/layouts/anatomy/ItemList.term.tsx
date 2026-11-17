// ItemList in the terminal (the web's ItemList.tsx): a plain list, one row per item.
//   - A row: the order mark or the leading icon, the title (a link with `href`, a button with `onOpen`, else text; the
//     words as written when `mono`), the status pill, then the meta line (muted, its parts apart with " · ") and the facts
//     under it. At most two inline actions and the ⋯ menu sit at the end of the title line (ActionControl, the web's).
//   - A list of rows (role list / listitem) named by `label`; no search, sort, grouping or selection (a DataTable has).
import type * as Web from './ItemList';
import { Box, Pressable, Text } from '../../../term/prim';
import { Link } from '../../controls/Link';
import { Facts, StatusPill } from '../../data/Display';
import { Icon } from '../../icons';
import { InfoTip } from '../../overlays/InfoTip';
import { ActionMenu } from '../../overlays/Menu';
import { useStrings } from '../../strings';
import kitStrings from '../../strings.en.json';
import { focusInk } from '../../../term/prim/FocusInk';
import { ActionControl } from './ActionBar';
import type { ItemProps } from './types';

// `mono` (the web's code font for a title that is data) needs nothing here: every cell is monospace.
function Title({ title, name, onOpen, href }: Pick<ItemProps, 'title' | 'name' | 'onOpen' | 'href'>) {
  if (href) return <Link href={href}>{title}</Link>;
  if (onOpen) {
    return (
      <Pressable dir="row" shrink={1} focusPaint={false} hoverFill onPress={onOpen} sem={{ role: 'button', name: name ?? title }}>
        {({ focused }) => <Text truncate bold colour="ink" {...focusInk(focused)}>{title}</Text>}
      </Pressable>
    );
  }
  return <Text truncate bold colour="ink">{title}</Text>;
}

function Row(p: ItemProps) {
  const t = useStrings(kitStrings);
  const inline = p.actions?.inline ?? [];
  const menu = p.actions?.menu ?? [];
  return (
    <Box dir="column" shrink={0} sem={{ role: 'listitem', name: p.name ?? p.title }}>
      <Box dir="row" gap={1} shrink={0}>
        {p.leading ? <Icon name={p.leading} /> : null}
        {p.mark !== undefined ? <Text colour="muted" shrink={0}>{p.mark.padStart(2)}</Text> : null}
        <Title title={p.title} name={p.name} onOpen={p.onOpen} href={p.href} />
        {p.status ? (
          <StatusPill tone={p.status.tone}>
            {p.status.tip ? <InfoTip text={p.status.tip} subject={p.status.label}>{p.status.label}</InfoTip> : p.status.label}
          </StatusPill>
        ) : null}
        {inline.length > 0 || menu.length > 0 ? (
          <Box dir="row" gap={1} grow={1} justify="end" shrink={0}>
            {inline.map((a) => <ActionControl key={a.id} action={a} variant="secondary" size="sm" />)}
            {menu.length > 0 ? <ActionMenu items={menu} label={t('action.more')} size="sm" title={p.title} /> : null}
          </Box>
        ) : null}
      </Box>
      {p.meta ? <Box pad={{ left: 2 }} shrink={0}><Text colour="muted" truncate>{p.meta.join(' · ')}</Text></Box> : null}
      {p.details && p.details.length > 0 ? <Box pad={{ left: 2 }} shrink={0}><Facts items={p.details} columns={1} /></Box> : null}
    </Box>
  );
}

export const ItemList: typeof Web.ItemList = ({ label, items }) => (
  <Box dir="column" shrink={0} gap={0} sem={{ role: 'list', name: label }}>
    {items.map((i) => <Row key={i.id} {...i} />)}
  </Box>
);
