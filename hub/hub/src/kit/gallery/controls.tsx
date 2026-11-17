// The gallery's Controls tab (/_kit?tab=controls): generated from the control spec (kit/controlSpec.ts).
// One specimen per spec cell, tagged data-cell=<cellKey>, once at default density and once inside a compact area
// (data-density="compact"). kit/controls/controls.matrix.spec.ts measures every specimen in light/dark x fine/coarse and
// compares it with the cell's target; a cell that holds no specimen here fails kit/controlSpec.test.ts.
import { Button, IconButton, LinkButton } from '../controls/Button';
import { FileButton } from '../controls/FileButton';
import { SegmentedControl } from '../controls/SegmentedControl';
import { MixedRowSpecimen } from '../layouts/MixedRowSpecimen';
import { SoftDisabledSpecimen } from '../layouts/SoftDisabledSpecimen';
import { Tabs } from '../controls/Tabs';
import { CONTROL_SPEC, DENSITIES, cellKey, type Density, type SpecCell } from '../controlSpec';
import { Checkbox, SearchField, Switch, TextField } from '../forms/fields';
import { NumberField, RadioGroup, Select } from '../forms/more';
import { AnatomySection } from '../layouts/anatomy/Section';
import { ToolbarScopeSpecimen } from '../layouts/ToolbarScopeSpecimen';
import { Stack } from '../layouts/Stack';
import { useStrings } from '../strings';
import s from './controls.module.css';
import strings from './controls.strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;

export function useControlsStrings(): T {
  return useStrings(strings);
}

const noop = () => undefined;

/** The kit control a cell is drawn with, in the cell's size and state. Toggles are drawn unselected. */
function Specimen({ c, t }: { c: SpecCell; t: T }) {
  const disabled = c.state === 'disabled';
  const error = c.state === 'invalid' ? { errorMessage: t('error.field') } : {};
  const size = c.size;
  const press = { size, isDisabled: disabled, onPress: noop };
  const segments = (variant?: 'folder') => (
    <SegmentedControl
      label={t('label.segmented')}
      value="list"
      onChange={noop}
      isDisabled={disabled}
      {...(variant ? { variant } : {})}
      items={[
        { id: 'list', label: t('seg.list') },
        { id: 'grid', label: t('seg.grid') },
        { id: 'board', label: t('seg.board') },
      ]}
    />
  );
  switch (c.control) {
    case 'button':
      return <Button {...press}>{t('label.button')}</Button>;
    case 'fileButton':
      return <FileButton label={t('label.upload')} size={size === 'sm' ? 'sm' : 'md'} isDisabled={disabled} onFiles={noop} />;
    case 'buttonGhost':
      return <Button variant="ghost" {...press}>{t('label.button')}</Button>;
    case 'buttonPrimary':
      return <Button variant="primary" {...press}>{t('label.button')}</Button>;
    case 'buttonDanger':
      return <Button tone="danger" {...press}>{t('label.delete')}</Button>;
    case 'buttonDangerSolid':
      return <Button variant="primary" tone="danger" {...press}>{t('label.delete')}</Button>;
    case 'buttonRow':
      return <Button variant="row" {...press}>{t('label.button')}</Button>;
    case 'buttonBubble':
      return <Button variant="bubble" {...press}>{t('label.button')}</Button>;
    case 'linkButton':
      return <LinkButton href="#controls-default" size={size} isDisabled={disabled}>{t('label.link')}</LinkButton>;
    case 'iconButton':
      return <IconButton icon="plus" label={t('label.icon')} variant="secondary" {...press} />;
    case 'textField':
      return <TextField label={t('label.field')} defaultValue={t('value.field')} isDisabled={disabled} {...error} />;
    case 'searchField':
      return <SearchField label={t('label.search')} isDisabled={disabled} isInvalid={c.state === 'invalid'} size={size === 'toolbar' ? 'toolbar' : 'md'} />;
    case 'select':
      return (
        <Select
          label={t('label.select')}
          value="one"
          onChange={noop}
          isDisabled={disabled}
          {...error}
          options={[
            { value: 'one', label: t('opt.one') },
            { value: 'two', label: t('opt.two') },
          ]}
        />
      );
    case 'numberField':
      return <NumberField label={t('label.number')} defaultValue={20} isDisabled={disabled} {...error} />;
    case 'checkbox':
      return <Checkbox label={t('label.checkbox')} isDisabled={disabled} />;
    case 'switch':
      return <Switch label={t('label.switch')} isDisabled={disabled} />;
    case 'radio':
      return (
        <RadioGroup
          label={t('label.radio')}
          value={undefined}
          onChange={noop}
          isDisabled={disabled}
          options={[
            { value: 'one', label: t('opt.one') },
            { value: 'two', label: t('opt.two') },
          ]}
        />
      );
    case 'segmented':
    case 'segmentedOption':
      return segments();
    case 'segmentedFolder':
      return segments('folder');
    case 'segmentedIcon':
      return (
        <SegmentedControl
          label={t('label.segmented')}
          value="list"
          onChange={noop}
          isDisabled={disabled}
          iconOnly
          items={[
            { id: 'list', label: t('seg.list'), icon: 'menu' },
            { id: 'grid', label: t('seg.grid'), icon: 'apps' },
          ]}
        />
      );
    case 'tabs':
      return (
        <Tabs
          label={t('label.tabs')}
          value="list"
          onChange={noop}
          items={[
            { id: 'list', label: t('seg.list') },
            { id: 'grid', label: t('seg.grid') },
          ]}
        />
      );
  }
}

function Cells({ t, density }: { t: T; density: Density }) {
  return (
    <div className={s.grid} data-density={density === 'compact' ? 'compact' : undefined} data-spec-density={density}>
      {CONTROL_SPEC.map((c) => {
        const key = cellKey(c);
        return (
          <div key={key} className={s.cell} data-cell={key}>
            <code>{key}</code>
            <Specimen c={c} t={t} />
          </div>
        );
      })}
    </div>
  );
}

export function ControlsTab() {
  const t = useControlsStrings();
  return (
    <Stack gap={5}>
      <AnatomySection id="controls-scope" title={t('sec.scope')} description={t('sec.scopeDesc')}>
        <ToolbarScopeSpecimen labels={{ button: t('label.button'), icon: t('label.icon'), segmented: t('label.segmented'), list: t('seg.list'), grid: t('seg.grid') }} />
      </AnatomySection>
      <AnatomySection id="controls-soft" title={t('sec.soft')} description={t('sec.softDesc')}>
        <Stack gap={3}>
          <SoftDisabledSpecimen labels={{ reason: t('label.reason'), button: t('label.button'), input: t('label.field'), popover: t('label.popoverText') }} />
          {/* A switch that says why it is off: focusable, the reason on focus, hover and press. */}
          <Switch label={t('label.switch')} isSelected={false} onChange={noop} isDisabled disabledReason={t('label.reason')} />
        </Stack>
      </AnatomySection>
      <AnatomySection id="controls-tabs-row" title={t('sec.tabsRow')} description={t('sec.tabsRowDesc')}>
        <Tabs
          label={t('label.tabs')}
          value="list"
          onChange={noop}
          toolbarRow
          before={<Button size="sm" literal>{t('label.button')}</Button>}
          after={<IconButton icon="plus" label={t('label.icon')} size="sm" />}
          items={[
            { id: 'list', label: t('seg.list') },
            { id: 'grid', label: t('seg.grid') },
          ]}
        />
      </AnatomySection>
      <AnatomySection id="controls-mixed" title={t('sec.mixed')} description={t('sec.mixedDesc')}>
        <MixedRowSpecimen labels={{ button: t('label.button'), icon: t('label.icon'), select: t('label.select'), search: t('label.search'), one: t('opt.one'), two: t('opt.two') }} />
      </AnatomySection>
      {DENSITIES.map((d) => (
        <AnatomySection key={d} id={`controls-${d}`} title={t(d === 'compact' ? 'sec.compact' : 'sec.default')} description={t(d === 'compact' ? 'sec.compactDesc' : 'sec.defaultDesc')}>
          <Cells t={t} density={d} />
        </AnatomySection>
      ))}
    </Stack>
  );
}
