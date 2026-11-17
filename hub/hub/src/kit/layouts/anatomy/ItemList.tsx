// Rows for a plain list: skill files, workflow steps, storage backends, server commands. It takes
// no search, filter, sort, grouping or selection, and at most two inline actions per row: a list that needs any of those
// is a DataTable. A row that opens something opens on click or Enter, through its title (a link or a button).
import { Link as AriaLink, Button as AriaButton } from 'react-aria-components';
import { cx } from '../../controls/Button';
import { Facts, StatusPill } from '../../data/Display';
import { Icon } from '../../icons';
import { InfoTip } from '../../overlays/InfoTip';
import { ActionMenu } from '../../overlays/Menu';
import { useStrings } from '../../strings';
import kitStrings from '../../strings.en.json';
import { ActionControl } from './ActionBar';
import { markElement } from './provenance';
import type { ItemListProps, ItemProps } from './types';
import s from './anatomy.module.css';

/** The longest order mark a row takes. */
const MARK_MAX = 4;

function Row({ id, title, name, onOpen, href, leading, mark, mono, meta, status, details, actions, nest }: ItemProps & { nest: readonly Node[] }) {
  const t = useStrings(kitStrings);
  if (import.meta.env.DEV && mark !== undefined) {
    if (leading) throw new Error(`hub ItemList: row "${id}" takes a mark or a leading icon, not both`);
    if (mark.length > MARK_MAX) throw new Error(`hub ItemList: row "${id}" mark "${mark}" is longer than ${MARK_MAX} characters; a mark takes at most 4`);
  }
  const monoAttr = mono ? '' : undefined;
  const titleText = href ? (
    <AriaLink href={href} className={cx(s.itemOpen, mono && s.itemMono)} aria-label={name} data-mono={monoAttr}>
      {title}
    </AriaLink>
  ) : onOpen ? (
    <AriaButton onPress={onOpen} className={cx(s.itemOpen, mono && s.itemMono)} aria-label={name} data-mono={monoAttr}>
      {title}
    </AriaButton>
  ) : (
    <span className={cx(s.itemTitle, mono && s.itemMono)} aria-label={name} data-mono={monoAttr}>
      {title}
    </span>
  );
  const inline = actions?.inline ?? [];
  const menu = actions?.menu ?? [];
  return (
    <li ref={markElement} className={cx(s.item, nest.length > 0 && s.itemParent)} data-hub-item={id}>
      {leading && <Icon name={leading} className={s.itemLead} />}
      {mark !== undefined && (
        <span className={s.itemMark} data-hub-item-mark="">
          {mark}
        </span>
      )}
      <div className={s.itemMain}>
        <div className={s.itemTitleLine}>
          {titleText}
          {status && (
            <StatusPill tone={status.tone}>
              {status.tip ? (
                <InfoTip text={status.tip} subject={status.label}>
                  {status.label}
                </InfoTip>
              ) : (
                status.label
              )}
            </StatusPill>
          )}
        </div>
        {meta && (
          <p className={s.itemMeta}>
            {meta.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </p>
        )}
        {details && details.length > 0 && <Facts items={details} columns={1} />}
      </div>
      {(inline.length > 0 || menu.length > 0) && (
        <div className={s.itemActions}>
          {inline.map((a) => (
            <ActionControl key={a.id} action={a} variant="secondary" size="sm" />
          ))}
          {menu.length > 0 && <ActionMenu items={menu} label={t('action.more')} size="sm" title={title} />}
        </div>
      )}
      {nest.length > 0 && <Rows nodes={nest} className={s.itemsNested} />}
    </li>
  );
}

/** A row and the rows nested under it. */
interface Node {
  item: ItemProps;
  nest: Node[];
}

/** The flat rows as a tree: a row with `indent` n hangs under the nearest row above it at n - 1, so nesting is real list
 *  structure (a nested <ul> inside its parent's <li>) that assistive tech reads as such, not only an indent. Outside DEV a
 *  bad depth is clamped (the first row to 0, a jump to one level deeper than the row above). */
function treeOf(items: readonly ItemProps[]): Node[] {
  const roots: Node[] = [];
  const path: Node[] = [];
  for (const item of items) {
    const depth = Math.min(item.indent ?? 0, path.length);
    const node: Node = { item, nest: [] };
    path.length = depth;
    (depth === 0 ? roots : path[depth - 1]!.nest).push(node);
    path.push(node);
  }
  return roots;
}

function Rows({ nodes, label, className }: { nodes: readonly Node[]; label?: string; className?: string }) {
  return (
    <ul className={cx(s.items, className)} aria-label={label}>
      {nodes.map((n) => (
        <Row key={n.item.id} {...n.item} nest={n.nest} />
      ))}
    </ul>
  );
}

export function ItemList({ label, items }: ItemListProps) {
  if (import.meta.env.DEV) {
    items.forEach((it, n) => {
      const depth = it.indent ?? 0;
      if (n === 0 && depth > 0) throw new Error(`hub ItemList: row "${it.id}" is indented, but the first row is never indented`);
      if (n > 0 && depth > (items[n - 1]!.indent ?? 0) + 1) throw new Error(`hub ItemList: row "${it.id}" is more than one level deeper than the row above it`);
    });
  }
  return <Rows nodes={treeOf(items)} label={label} />;
}
