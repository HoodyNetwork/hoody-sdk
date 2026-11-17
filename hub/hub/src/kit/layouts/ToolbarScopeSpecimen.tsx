// Gallery specimen: toolbar controls inside and outside a toolbar scope, nested both ways.
// kit/controls/toolbarScope.spec.ts measures it; the gallery's controls tab mounts it.
import { Button, IconButton } from '../controls/Button';
import { SegmentedControl } from '../controls/SegmentedControl';
import s from './ToolbarScopeSpecimen.module.css';
import { Stack } from './Stack';
import { Toolbar, ToolbarScope } from './PageHeader';

export interface ToolbarScopeLabels {
  button: string;
  icon: string;
  segmented: string;
  list: string;
  grid: string;
}

const noop = () => {};

/** One row of toolbar controls: what a scope changes, and the disabled look it may change. kit/controls/toolbarScope.spec.ts measures it. */
function ScopeRow({ labels, name }: { labels: ToolbarScopeLabels; name: string }) {
  return (
    <div className={s.scopeRow} data-scope-probe={name}>
      <code>{name}</code>
      <Button size="toolbar" literal>{labels.button}</Button>
      <IconButton size="toolbar" icon="plus" label={labels.icon} />
      <Button size="toolbar" literal isDisabled data-scope-off="">{labels.button}</Button>
      <SegmentedControl
        label={labels.segmented}
        value="list"
        onChange={noop}
        items={[
          { id: 'list', label: labels.list },
          { id: 'grid', label: labels.grid },
        ]}
      />
    </div>
  );
}

/**
 * The 32 toolbar scope and its inner boundary: a default toolbar, or a default scope, inside it is default at any depth.
 * A measuring specimen, kit-internal on purpose: pages get their toolbar rows from the kit's slots, and this one hand-writes
 * the rows because the raw controls are what it measures.
 */
export function ToolbarScopeSpecimen({ labels }: { labels: ToolbarScopeLabels }) {
  const row = (name: string) => <ScopeRow labels={labels} name={name} />;
  return (
    <Stack gap={3}>
      {row('outside')}
      <Toolbar start={row('toolbar-default-alone')} />
      <ToolbarScope size="32">
        <Stack gap={3}>
          {row('scope-32')}
          <Toolbar start={row('toolbar-default-in-32')} />
          <Toolbar size="default" start={row('toolbar-explicit-default-in-32')} />
          <Toolbar size="32" start={row('toolbar-32-in-32')} />
          <ToolbarScope size="default">
            <Stack gap={3}>
              {row('scope-default-in-32')}
              <ToolbarScope size="32">{row('scope-32-in-default-in-32')}</ToolbarScope>
            </Stack>
          </ToolbarScope>
        </Stack>
      </ToolbarScope>
    </Stack>
  );
}
