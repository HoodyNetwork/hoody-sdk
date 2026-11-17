// Filter chips: one chip per filter, as tall as a toolbar control (`--tb-ctl-h`); pressing it opens its options. A chip
// with no value is its name and a caret. A set chip is one plate in three parts with a rule between them: its name
// (muted caps), its value (ink, cut short with an ellipsis when long; the button's name keeps the whole value) and an ×
// that clears it. The folded Filters panel draws the same chips. Kinds: single (one choice, or a segmented control with
// `display: 'segmented'`), multi ("State: Running +1"), range ("Size: 2–8"). On narrow toolbars everything folds into
// one "Filters (n)" button. Values are URL strings (useDataView keeps them in the URL): "running", "running,paused", "2..8".
import { type ReactElement, useEffect, useId, useRef, useState } from 'react';
import { Button as AriaButton, Dialog, DialogTrigger, Menu, MenuItem, MenuTrigger, Popover, Text } from 'react-aria-components';
import { Button, cx, IconButton } from '../controls/Button';
import { SegmentedControl } from '../controls/SegmentedControl';
import { NumberField } from '../forms/more';
import { Icon } from '../icons';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import chipStrings from './FilterChips.strings.en.json';
import { formatFilter } from './DataTableViewLogic';
import { activeCount, chipValueText, FILTER_CONTROL, isSegmentedFilter, parsed, type FilterChip, type FilterOption } from './FilterChips.pure';
import s from './DataTable.module.css';

export type { FilterOption, FilterChip } from './FilterChips.pure';
export { chipValueText, activeCount, isSegmentedFilter, FILTER_CONTROL } from './FilterChips.pure';

/** The mark of the option the chip shows first (a single value, or a multi's first), if it has one. */
function chipMark(f: FilterChip): ReactElement | undefined {
  const v = parsed(f);
  const id = v?.kind === 'single' ? v.value : v?.kind === 'multi' ? v.values[0] : undefined;
  return id === undefined ? undefined : f.options.find((o) => o.value === id)?.mark;
}

// The option's name is its label alone ("Billing"); its line (`description`, under the label) and its count are its
// description, so neither ever changes what the item is called. Both carry their own ids, which the item names in
// aria-describedby (line first), never React Aria's description slot: the slot is read only when the item mounts, so a
// line or count that comes or goes on an open menu would leave the description wrong (as the kit ActionMenu, Menu.tsx).
function OptionRow({ o, isSelected, ids }: { o: FilterOption; isSelected: boolean; ids: OptionIds }) {
  const label = (
    <Text slot="label" className={s.menuLabel}>
      {o.label}
    </Text>
  );
  return (
    <>
      <span className={s.menuCheck}>{isSelected && <Icon name="check" size="sm" />}</span>
      {o.mark && (
        <span className={s.menuMark} aria-hidden="true">
          {o.mark}
        </span>
      )}
      {o.description ? (
        <span className={s.menuLabels}>
          {label}
          <span id={ids.line} className={s.menuLine}>
            {o.description}
          </span>
        </span>
      ) : (
        label
      )}
      {o.count !== undefined && (
        <span id={ids.count} className={s.menuCount}>
          {o.count}
        </span>
      )}
    </>
  );
}

interface OptionIds {
  line: string;
  count: string;
}

/** Ids for an option's line and count. `base` comes from the chip's useId and `i` is the option's place, so ids are the
 *  chip's own and an option value never has to be a valid id. */
function optionIds(base: string, i: number): OptionIds {
  return { line: `${base}-${i}-line`, count: `${base}-${i}-count` };
}

/** The ids of the parts this option renders now, line first; none = no description. */
function describedBy(ids: OptionIds, o: FilterOption): string | undefined {
  const parts = [o.description ? ids.line : undefined, o.count !== undefined ? ids.count : undefined].filter((x) => x !== undefined);
  return parts.length ? parts.join(' ') : undefined;
}

function RangePanel({ f, close }: { f: FilterChip; close: () => void }) {
  const t = useStrings(chipStrings);
  const v = parsed(f);
  const cur = v?.kind === 'range' ? v : undefined;
  const [min, setMin] = useState<number | undefined>(cur?.min);
  const [max, setMax] = useState<number | undefined>(cur?.max);
  const apply = () => {
    f.onChange(formatFilter({ kind: 'range', min: Number.isFinite(min) ? min : undefined, max: Number.isFinite(max) ? max : undefined }));
    close();
  };
  return (
    <form
      className={s.rangePanel}
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <div className={s.rangeFields}>
        <NumberField label={t('range.min')} value={min ?? Number.NaN} onChange={(n) => setMin(Number.isFinite(n) ? n : undefined)} minValue={f.range?.min} maxValue={f.range?.max} step={f.range?.step} />
        <NumberField label={t('range.max')} value={max ?? Number.NaN} onChange={(n) => setMax(Number.isFinite(n) ? n : undefined)} minValue={f.range?.min} maxValue={f.range?.max} step={f.range?.step} />
      </div>
      <div className={s.rangeActions}>
        <Button
          size="sm"
          variant="ghost"
          onPress={() => {
            f.onChange(undefined);
            close();
          }}
        >
          {t('range.any')}
        </Button>
        <Button size="sm" type="submit">
          {t('range.apply')}
        </Button>
      </div>
    </form>
  );
}

function Chip({ f }: { f: FilterChip }) {
  const kt = useStrings(kitStrings);
  const t = useStrings(chipStrings);
  const kind = f.kind ?? 'single';
  const v = parsed(f);
  const text = chipValueText(f, t);
  const mark = text ? chipMark(f) : undefined;
  const [rangeOpen, setRangeOpen] = useState(false);
  const idBase = useId();
  // The x removes itself with the value it clears: focus goes to this chip's own button, not to the page.
  const wrap = useRef<HTMLSpanElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current || text) return;
    refocus.current = false;
    wrap.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }, [text]);
  const button = (
    <AriaButton className={s.chip}>
      <span className={s.chipName}>{f.label}</span>
      {text ? (
        <span className={cx(s.chipValue, mark && s.chipValueMarked)}>
          {mark && (
            <span className={s.chipMark} aria-hidden="true">
              {mark}
            </span>
          )}
          <span className={s.chipValueText}>{text}</span>
        </span>
      ) : (
        <Icon name="chevron-down" size="sm" />
      )}
    </AriaButton>
  );
  let body;
  if (kind === 'range') {
    body = (
      <DialogTrigger isOpen={rangeOpen} onOpenChange={setRangeOpen}>
        {button}
        <Popover className={s.popover} placement="bottom start">
          <Dialog className={s.filtersDialog} aria-label={f.label}>
            <RangePanel f={f} close={() => setRangeOpen(false)} />
          </Dialog>
        </Popover>
      </DialogTrigger>
    );
  } else if (kind === 'multi') {
    const selected = v?.kind === 'multi' ? v.values : [];
    body = (
      <MenuTrigger>
        {button}
        <Popover className={s.popover} placement="bottom start">
          <Menu
            className={s.menu}
            aria-label={f.label}
            selectionMode="multiple"
            selectedKeys={new Set(selected)}
            onSelectionChange={(keys) => {
              const values = keys === 'all' ? f.options.map((o) => o.value) : f.options.map((o) => o.value).filter((x) => keys.has(x));
              f.onChange(formatFilter({ kind: 'multi', values }));
            }}
          >
            {f.options.map((o, i) => {
              const ids = optionIds(idBase, i);
              return (
                <MenuItem key={o.value} id={o.value} className={s.menuItem} textValue={o.label} aria-describedby={describedBy(ids, o)}>
                  {({ isSelected }) => <OptionRow o={o} isSelected={isSelected} ids={ids} />}
                </MenuItem>
              );
            })}
          </Menu>
        </Popover>
      </MenuTrigger>
    );
  } else {
    body = (
      <MenuTrigger>
        {button}
        <Popover className={s.popover} placement="bottom start">
          <Menu
            className={s.menu}
            aria-label={f.label}
            selectionMode="single"
            selectedKeys={new Set([v?.kind === 'single' ? v.value : '__any'])}
            onAction={(key) => f.onChange(key === '__any' ? undefined : String(key))}
          >
            {!f.required && (
              <MenuItem id="__any" className={s.menuItem} textValue={kt('table.filterAny')}>
                {({ isSelected }) => <OptionRow o={{ value: '__any', label: kt('table.filterAny') }} isSelected={isSelected} ids={optionIds(idBase, -1)} />}
              </MenuItem>
            )}
            {f.options.map((o, i) => {
              const ids = optionIds(idBase, i);
              return (
                <MenuItem key={o.value} id={o.value} className={s.menuItem} textValue={o.label} aria-describedby={describedBy(ids, o)}>
                  {({ isSelected }) => <OptionRow o={o} isSelected={isSelected} ids={ids} />}
                </MenuItem>
              );
            })}
          </Menu>
        </Popover>
      </MenuTrigger>
    );
  }
  return (
    <span ref={wrap} className={cx(s.chipWrap, text && s.chipOn)} data-chip={f.id}>
      {body}
      {text && !f.required && (
        <AriaButton className={s.chipX} aria-label={kt('table.clearFilter', { name: f.label })} onPress={() => { refocus.current = true; f.onChange(undefined); }}>
          <Icon name="x" size="sm" />
        </AriaButton>
      )}
    </span>
  );
}

function SegmentedFilter({ f }: { f: FilterChip }) {
  const kt = useStrings(kitStrings);
  const v = parsed(f);
  return (
    <SegmentedControl
      label={f.label}
      value={v?.kind === 'single' ? v.value : '__any'}
      onChange={(id) => f.onChange(id === '__any' ? undefined : id)}
      items={[...(f.required ? [] : [{ id: '__any', label: kt('table.filterAny') }]), ...f.options.map((o) => ({ id: o.value, label: o.label, count: o.count }))]}
    />
  );
}

/** Wide toolbars: one chip (or segmented control) per filter, then "Clear all" once two are set. `bar` draws the chips
 *  as one flush bar that fills its width (a table's second filter tier) and leaves Clear all to the row above it;
 *  `clearOf` names the filters Clear all counts and clears when they are not all drawn here (that row). `focusAfterClear`
 *  finds where focus goes when Clear all leaves a group with no filter of its own (the chips live in the other tier). */
export function FilterChips({ filters, onClearAll, bar, clearOf, focusAfterClear }: { filters: readonly FilterChip[]; onClearAll?: () => void; bar?: boolean; clearOf?: readonly FilterChip[]; focusAfterClear?: () => HTMLElement | null | undefined }) {
  const kt = useStrings(kitStrings);
  const t = useStrings(chipStrings);
  const scope = clearOf ?? filters;
  const active = bar ? 0 : activeCount(scope);
  // Clear all leaves with the filters it clears: focus goes to the first chip.
  const group = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current || active >= 2) return;
    refocus.current = false;
    const own = group.current?.querySelector<HTMLElement>('[data-chip] button, [role="radio"]');
    (own ?? focusAfterClear?.())?.focus({ preventScroll: true });
  }, [active, focusAfterClear]);
  if (filters.length === 0 && active < 2) return null;
  return (
    <div ref={group} className={s.chips} role="group" aria-label={kt('table.filters')} data-chip-bar={bar ? '' : undefined}>
      {filters.map((f) => (isSegmentedFilter(f) ? <SegmentedFilter key={f.id} f={f} /> : <Chip key={f.id} f={f} />))}
      {active >= 2 && (
        <Button variant="ghost" size="toolbar" className={s.tbWords} onPress={() => { refocus.current = true; (onClearAll ?? (() => scope.forEach((f) => !f.required && f.onChange(undefined))))(); }}>
          {t('clearAll')}
        </Button>
      )}
    </div>
  );
}

/** Narrow toolbars: every filter behind one button. `iconOnly` (the tightest toolbars) draws the icon alone, marked
 *  while filters are on; the words, with the number on, are its name and tooltip. */
export function FiltersButton({ filters, onClearAll, iconOnly }: { filters: readonly FilterChip[]; onClearAll?: () => void; iconOnly?: boolean }) {
  const kt = useStrings(kitStrings);
  const active = activeCount(filters);
  const words = active ? kt('table.filtersButtonCount', { count: active }) : kt('table.filtersButton');
  // Clear filters leaves the panel with the filters it clears: focus goes to the panel's first filter.
  const list = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current || active > 0) return;
    refocus.current = false;
    list.current?.querySelector<HTMLElement>(FILTER_CONTROL)?.focus({ preventScroll: true });
  }, [active]);
  const clear = () => {
    refocus.current = true;
    (onClearAll ?? (() => filters.forEach((f) => !f.required && f.onChange(undefined))))();
  };
  return (
    <DialogTrigger>
      {iconOnly ? (
        // The field look draws set and unset alike, so a set button shows its number in a small badge
        // inside its box. Hidden from the name, which already says "Filters (2)"; the number is the cue, not colour.
        <span className={s.filtersIcon} data-count={active > 0 ? '' : undefined}>
          <IconButton size="toolbar" variant={active ? 'secondary' : 'ghost'} icon="filter" label={words} data-filters-trigger="" />
          {active > 0 && (
            <span className={s.filtersCount} aria-hidden="true" data-filters-count="">
              {active}
            </span>
          )}
        </span>
      ) : (
        <Button size="toolbar" variant={active ? 'secondary' : 'ghost'} icon="filter" data-filters-trigger="">
          {active ? kt('table.filtersButtonCount', { count: active }) : kt('table.filtersButton')}
        </Button>
      )}
      <Popover className={cx(s.popover, s.filtersPanel)} placement="bottom start">
        <Dialog className={s.filtersDialog} aria-label={kt('table.filters')}>
          <div ref={list} className={s.filtersList}>
            {filters.map((f) => (
              <Chip key={f.id} f={f} />
            ))}
          </div>
          {active > 0 && (
            <Button variant="ghost" size="sm" onPress={clear}>
              {kt('table.clearFilters')}
            </Button>
          )}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
