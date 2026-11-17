// Gallery specimen: the md, sm and toolbar controls side by side, at both densities. kit/controls/mixedrow.spec.ts
// measures the rows; the gallery's controls tab mounts it.
import type { ReactNode } from 'react';
import { Button, IconButton } from '../controls/Button';
import { SearchField } from '../forms/fields';
import { Select } from '../forms/more';
import s from './MixedRowSpecimen.module.css';
import { Stack } from './Stack';

export interface MixedRowLabels {
  button: string;
  icon: string;
  select: string;
  search: string;
  one: string;
  two: string;
}

const noop = () => {};

/** One row of one size: the controls a page puts side by side, each in a measuring cell. */
function Row({ labels, size, density }: { labels: MixedRowLabels; size: 'md' | 'sm' | 'toolbar'; density: 'default' | 'compact' }) {
  const item = (name: string, node: ReactNode) => (
    <span className={s.item} data-mix-item={name}>
      {node}
    </span>
  );
  const caption = `${density} ${size}`; // the row's own key, shown as code, not prose
  return (
    <div className={s.row} data-mix-row={`${density}.${size}`}>
      <code>{caption}</code>
      {item('button', <Button variant="secondary" size={size} literal>{labels.button}</Button>)}
      {item('icon', <IconButton size={size} icon="plus" label={labels.icon} />)}
      {item('ghost', <Button variant="ghost" size={size} literal>{labels.button}</Button>)}
      {size === 'md' &&
        item(
          'select',
          <Select
            aria-label={labels.select}
            value="one"
            onChange={noop}
            options={[
              { value: 'one', label: labels.one },
              { value: 'two', label: labels.two },
            ]}
          />,
        )}
      {size !== 'sm' && item('search', <SearchField label={labels.search} size={size === 'toolbar' ? 'toolbar' : 'md'} />)}
    </div>
  );
}

/**
 * Mixed rows: the md, sm and toolbar controls side by side, in the default density and in a compact
 * area, where they keep their heights (compact makes rows dense, never controls small). kit/controls/mixedrow.spec.ts
 * measures it. A measuring specimen, kit-internal on purpose: it hand-writes the rows because the raw controls are what it
 * measures.
 */
export function MixedRowSpecimen({ labels }: { labels: MixedRowLabels }) {
  const rows = (density: 'default' | 'compact') => (
    <div className={s.area} data-density={density === 'compact' ? 'compact' : undefined} data-mix-density={density}>
      <Stack gap={3}>
        <Row labels={labels} size="md" density={density} />
        <Row labels={labels} size="sm" density={density} />
        <Row labels={labels} size="toolbar" density={density} />
      </Stack>
    </div>
  );
  return (
    <Stack gap={4}>
      {rows('default')}
      {rows('compact')}
    </Stack>
  );
}
