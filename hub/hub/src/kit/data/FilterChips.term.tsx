// Filter chips in the terminal: one chip per filter ("State: Running ×" or "State ▾"); Enter, Space or a click opens
// its options under it (Up/Down move, Enter or Space picks, Esc closes); "Clear all" once two are set. A multi filter's
// options toggle; a range filter takes From / To and Apply. FiltersButton folds every chip into one "Filters (n)" panel.
import { useContext, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type * as Web from './FilterChips';
import { Box, Text, TextInput, useBoxSize, useFocusable, useFocusControl, type Focusable, type Key } from '../../term/prim';
import { focusMark } from '../../term/prim/FocusInk';
import { cellWidth } from '../../term/prim/TableCells';
import { TableMark } from '../../term/prim/TableMark';
import { Layer, useAnchor } from '../../term/prim/Overlay';
import { iconMark } from './termIcons';
import { mergeRefs, useSem, type Sem } from '../../term/prim/semantics';
import type { BoxRenderable } from '../../term/prim/otui';
import { SegmentedControl } from '../controls/SegmentedControl';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import chipStrings from './FilterChips.strings.en.json';
import { formatFilter } from './DataTableViewLogic';
import { FilterRefocusCtx } from './filterRefocus';
import { activeCount, chipValueText, parsed, type FilterChip } from './FilterChips.pure';

export type { FilterOption, FilterChip } from './FilterChips.pure';
export { chipValueText, activeCount, isSegmentedFilter, FILTER_CONTROL } from './FilterChips.pure';

const isPress = (k: Key) => k.name === 'return' || k.name === 'linefeed' || k.name === 'space';

/** The focus handle's ref plus what the node is for the semantics tree (role, name, states): as the web's ARIA. */
function useNamed(f: Focusable, sem: Sem): (node: unknown) => void {
  const semRef = useSem(sem, { role: sem.role, focus: f, disabled: sem.disabled });
  return useMemo(() => mergeRefs<unknown>(f.ref, semRef), [f.ref, semRef]);
}

/** A focusable line of the chip panel; `first` takes the focus when the panel opens. `at` is its place in the panel's
 *  `list`: a focus move re-renders only the lines it changes, so a line writes its own place, never appends. */
function Opt({ label, on, mark, first, onPick, onClose, list, at, hint, role = 'button' }: { label: string; on?: boolean; mark?: string; first?: boolean; onPick: () => void; onClose: () => void; list: Focusable[]; at: number; hint?: string; role?: 'button' | 'menuitemradio' | 'menuitemcheckbox' }) {
  const f = useFocusable({
    onKey: (k) => {
      if (isPress(k)) { onPick(); return true; }
      if (k.name === 'escape') { onClose(); return true; }
      if (k.name === 'down' || k.name === 'up') {
        list[(at + (k.name === 'down' ? 1 : -1) + list.length) % list.length]?.focus();
        return true;
      }
      return false;
    },
  });
  list[at] = f;
  const ref = useNamed(f, role === 'button' ? { role, name: label } : { role, name: label, checked: on === true });
  useEffect(() => { if (first) f.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Box dir="row" boxRef={ref} onPress={() => { f.focus(); onPick(); }} bg={f.focused ? 'selected' : undefined} gap={1}>
      <TableMark colour="blueText" width={2}>{f.focused ? '▸' : ' '}</TableMark>
      {mark !== undefined && <TableMark colour="ok" width={3}>{mark}</TableMark>}
      <Text colour={f.focused ? 'ink' : 'muted'} bold={on}>{label}</Text>
      {hint && <Text colour="faint">{hint}</Text>}
    </Box>
  );
}

function Panel({ f, onClose }: { f: FilterChip; onClose: () => void }) {
  const kt = useStrings(kitStrings);
  const t = useStrings(chipStrings);
  const kind = f.kind ?? 'single';
  const v = parsed(f);
  const list: Focusable[] = [];
  if (kind === 'range') return <RangePanel f={f} onClose={onClose} />;
  const selected = v?.kind === 'multi' ? v.values : v?.kind === 'single' ? [v.value] : [];
  const pick = (value: string | undefined) => {
    if (kind === 'multi' && value !== undefined) {
      const values = selected.includes(value) ? selected.filter((x) => x !== value) : [...selected, value];
      f.onChange(formatFilter({ kind: 'multi', values: f.options.map((o) => o.value).filter((x) => values.includes(x)) }));
      return;
    }
    f.onChange(value);
    onClose();
  };
  const mark = (on: boolean) => (kind === 'multi' ? (on ? '[x]' : '[ ]') : on ? '(•)' : '( )');
  const role = kind === 'multi' ? 'menuitemcheckbox' as const : 'menuitemradio' as const;
  const any = kind === 'single' && !f.required;
  const base = any ? 1 : 0;
  return (
    <Box dir="column" sem={{ role: 'menu', name: f.label }}>
      <Text colour="faint">{f.label}</Text>
      {any && <Opt list={list} at={0} role={role} first label={kt('table.filterAny')} on={selected.length === 0} mark={mark(selected.length === 0)} onPick={() => pick(undefined)} onClose={onClose} />}
      {f.options.map((o, i) => (
        <Opt key={o.value} role={role} list={list} at={base + i} first={i === 0 && (kind !== 'single' || f.required === true)} label={o.label} on={selected.includes(o.value)} mark={mark(selected.includes(o.value))}
          hint={[o.count === undefined ? '' : String(o.count), o.description ?? ''].filter(Boolean).join('  ')} onPick={() => pick(o.value)} onClose={onClose} />
      ))}
      {kind === 'multi' && <Opt list={list} at={base + f.options.length} label={t('range.apply')} onPick={onClose} onClose={onClose} />}
    </Box>
  );
}

function RangePanel({ f, onClose }: { f: FilterChip; onClose: () => void }) {
  const t = useStrings(chipStrings);
  const v = parsed(f);
  const [min, setMin] = useState(v?.kind === 'range' && v.min !== undefined ? String(v.min) : '');
  const [max, setMax] = useState(v?.kind === 'range' && v.max !== undefined ? String(v.max) : '');
  const list: Focusable[] = [];
  const num = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? undefined : Number(s));
  const apply = (from: string, to: string) => {
    f.onChange(formatFilter({ kind: 'range', min: num(from), max: num(to) }));
    onClose();
  };
  // Enter in a field applies the text that field's editor holds, not this render's: keys that arrive in one burst (a
  // paste ending in a newline, fast typing) reach Enter before a re-render (NumberField's rule, more.term.tsx).
  return (
    <Box dir="column" border borderColour="line" bg="card" padX={1}>
      <Text colour="faint">{f.label}</Text>
      <Box dir="row" gap={1}><Text colour="muted">{t('range.min')}</Text><TextInput value={min} onChange={setMin} onSubmit={(typed) => apply(typed, max)} width={10} /></Box>
      <Box dir="row" gap={1}><Text colour="muted">{t('range.max')}</Text><TextInput value={max} onChange={setMax} onSubmit={(typed) => apply(min, typed)} width={10} /></Box>
      <Box dir="row" gap={2}>
        <Opt list={list} at={0} label={t('range.any')} onPick={() => { f.onChange(undefined); onClose(); }} onClose={onClose} />
        <Opt list={list} at={1} label={t('range.apply')} onPick={() => apply(min, max)} onClose={onClose} />
      </Box>
    </Box>
  );
}

/** One chip: its name and value, a × that clears it, its options under it while open. */
/** The options panel's width: its longest option (with its mark and hint) and frame, at least 24 cells. */
function panelWidth(f: FilterChip): number {
  const words = f.options.map((o) => cellWidth(o.label) + (o.count !== undefined ? String(o.count).length + 1 : 0));
  // ▸ and the radio mark (6), a space before the count, the layer frame and padding (6).
  return Math.max(24, Math.min(52, Math.max(cellWidth(f.label), ...words) + 14));
}

/** After mount, while the bar was refolded and nothing has the focus, focus `f` (a control registers after its commit,
 *  so it asks again for a few ticks). The first control to ask wins; later ones find the focus taken. */
/** `open`: this control's popover is open (the focus is in it, still the bar's). */
function useTakeLostFocus(f: Focusable, on: boolean, open: boolean): void {
  const held = useContext(FilterRefocusCtx);
  const fc = useFocusControl();
  // The bar holds the focus while this control (or its popover) has it; it gives it up when the focus goes elsewhere.
  // A control that just went (a form change) changes nothing here, so the bar still holds it for the new form.
  useEffect(() => {
    if (!held || !on) return;
    if (f.focused || open) held.current = true;
    else if (fc.current() !== null) held.current = false;
  });
  useEffect(() => {
    if (!held?.current || !on) return;
    let n = 0, timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => { timer = null; if (fc.current() !== null) return; f.focus(); if (fc.current() === null && ++n < 5) timer = setTimeout(tick, 0); };
    timer = setTimeout(tick, 0);
    return () => { if (timer) clearTimeout(timer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

function TermChip({ f, inline }: { f: FilterChip; inline?: boolean }): ReactElement {
  const t = useStrings(chipStrings);
  const text = chipValueText(f, t);
  const [open, setOpen] = useState(false);
  const chip = useFocusable({ onKey: (k) => {
    if (isPress(k) || k.name === 'down') { setOpen(true); return true; }
    if ((k.name === 'backspace' || k.name === 'delete') && text && !f.required) { f.onChange(undefined); return true; }
    return false;
  } });
  useTakeLostFocus(chip, !inline, open);
  const back = useRef(false);
  const close = () => { setOpen(false); back.current = true; };
  useEffect(() => { if (!open && back.current) { back.current = false; chip.focus(); } });
  const x = useFocusable({ disabled: !text || f.required === true, onKey: (k) => { if (isPress(k)) { f.onChange(undefined); chip.focus(); return true; } return false; } });
  const kt = useStrings(kitStrings);
  const chipRef = useNamed(chip, { role: 'button', name: text ? `${f.label} ${text}` : f.label, expanded: open });
  const xRef = useNamed(x, { role: 'button', name: kt('table.clearFilter', { name: f.label }) });
  const anchor = useAnchor();
  return (
    // A chip wider than its toolbar line (a long value) cuts its value at the end with one "…": never past its box.
    <Box dir="column" shrink={1} raw={{ minWidth: 0 }}>
      <Box dir="row" boxRef={anchor.ref} shrink={1} raw={{ minWidth: 0 }}>
        <Box dir="row" boxRef={chipRef} shrink={1} raw={{ minWidth: 0 }} onPress={() => { chip.focus(); setOpen((o) => !o); }} bg={chip.focused ? 'selected' : undefined}>
          <Text colour={chip.focused ? 'ink' : 'muted'} underline={chip.focused} shrink={0}>{f.label}</Text>
          {text ? <Text colour="ink" bold truncate>{`: ${text}`}</Text> : <TableMark colour="faint">{' ▾'}</TableMark>}
        </Box>
        {text && !f.required && (
          <Box dir="row" boxRef={xRef} onPress={() => { f.onChange(undefined); chip.focus(); }}>
            {/* focusMark: with colour off the ink and the plate are gone, so the focused × is bold and underlined. */}
            <TableMark colour={x.focused ? 'ink' : 'faint'} bg={x.focused ? 'selected' : undefined} {...focusMark(x.focused)}>{' ×'}</TableMark>
          </Box>
        )}
      </Box>
      {open && inline ? <Panel f={f} onClose={close} /> : null}
      {/* On a toolbar the options float under the chip on the overlay layer (never inside the toolbar's own box,
          which clips what it holds): a press outside or Esc closes it and gives the chip the keys back. */}
      {!inline && (
        <Layer open={open} kind="popover" place={{ at: 'anchor', anchor: anchor.rect, side: 'bottom', align: 'start', width: panelWidth(f) }} initialFocus="none" padX={1} onEscape={close} onOutside={close}>
          <Panel f={f} onClose={close} />
        </Layer>
      )}
    </Box>
  );
}

/** A single filter shown as a segmented control on a wide toolbar (the web's display: 'segmented'). */
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

const clearAllOf = (filters: readonly FilterChip[], onClearAll?: () => void) => onClearAll ?? (() => filters.forEach((f) => !f.required && f.onChange(undefined)));

function ClearAll({ label, onPress }: { label: string; onPress: () => void }) {
  const f = useFocusable({ onKey: (k) => { if (isPress(k)) { onPress(); return true; } return false; } });
  const ref = useNamed(f, { role: 'button', name: label });
  return (
    <Box dir="row" boxRef={ref} onPress={onPress} shrink={0}>
      {/* Always underlined (it is a link-like action); with colour off the focused one is bold too (focusMark). */}
      <Text colour={f.focused ? 'ink' : 'muted'} underline {...focusMark(f.focused)}>{label}</Text>
    </Box>
  );
}

/** Cells the segmented row draws (SegmentedControl: "‹ " or two spaces, the label, its count, " ›" or two spaces). */
function segmentedRow(f: FilterChip, anyLabel: string): number {
  const words = [...(f.required ? [] : [anyLabel]), ...f.options.map((o) => (o.count !== undefined ? `${o.label} ${o.count}` : o.label))];
  return words.reduce((n, w) => n + cellWidth(w) + 4, 0);
}

export const FilterChips: typeof Web.FilterChips = ({ filters, onClearAll, bar, clearOf, focusAfterClear }) => {
  const t = useStrings(chipStrings);
  const kt = useStrings(kitStrings);
  // As the web: Clear all counts and clears `clearOf` (the whole bar's filters) when given; a `bar` part never shows it.
  const scope = clearOf ?? filters;
  const active = bar ? 0 : activeCount(scope);
  const [size, onSize] = useBoxSize();
  // Clear all leaves with the filters it clears: once it is gone and nothing took the focus, the first chip takes it,
  // else what the page names (`focusAfterClear`). Asked after this tick: the focus scope hears of the removal first.
  const fc = useFocusControl();
  const row = useRef<BoxRenderable | null>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current || active >= 2) return;
    refocus.current = false;
    setTimeout(() => {
      if (fc.current() !== null) return;
      if (row.current && fc.focusFirst(row.current, 'asked')) return;
      focusAfterClear?.()?.focus();
    }, 0);
  }, [active, focusAfterClear, fc]);
  // A segmented filter shows only where every option fits whole beside the other chips; else it is a chip with a menu,
  // as on a narrow web toolbar (never a segmented row cut mid-word).
  // The measured box is never sized by what it shows: the segmented row is narrower than its chip, so a box sized by its
  // content flipped segmented ↔ chip on every frame and the page never settled (Notifications: 43 cells as a row, 49 as
  // chips, need 45). Its width is what the filters need drawn with their segmented rows (fixed by the filters alone),
  // shrunk to the room it is given: the rows show exactly when that width is all there, else the chips, which wrap inside
  // it. The same answer every frame.
  const chipT = useStrings(chipStrings);
  const need = useMemo(() => {
    const asChip = (f: FilterChip) => { const v = chipValueText(f, chipT); return cellWidth(f.label) + (v ? 2 + cellWidth(v) + (f.required ? 0 : 2) : 2); };
    const parts = filters.reduce((n, f) => n + (f.display === 'segmented' && (f.kind ?? 'single') === 'single' ? segmentedRow(f, kt('table.filterAny')) : asChip(f)), 0);
    const clear = active >= 2 ? 2 + cellWidth(t('clearAll')) : 0;
    return parts + 2 * Math.max(0, filters.length - 1) + clear;
  }, [filters, active, chipT, kt, t]);
  const segmentedFits = (_f: FilterChip) => size !== null && size.width >= need;
  return (
    <Box dir="row" gap={2} gapY={0} wrap shrink={1} width={need} maxWidth="100%" raw={{ minWidth: 0 }} onSize={onSize} boxRef={row}>
      {filters.map((f) => (f.display === 'segmented' && (f.kind ?? 'single') === 'single' && segmentedFits(f) ? <SegmentedFilter key={f.id} f={f} /> : <TermChip key={f.id} f={f} />))}
      {active >= 2 && <ClearAll label={t('clearAll')} onPress={() => { refocus.current = true; clearAllOf(scope, onClearAll)(); }} />}
    </Box>
  );
};

export const FiltersButton: typeof Web.FiltersButton = ({ filters, onClearAll, iconOnly }) => {
  const kt = useStrings(kitStrings);
  const active = activeCount(filters);
  const words = active ? kt('table.filtersButtonCount', { count: active }) : kt('table.filtersButton');
  const anchor = useAnchor();
  const [open, setOpen] = useState(false);
  const f = useFocusable({ onKey: (k) => {
    if (isPress(k)) { setOpen((o) => !o); return true; }
    if (k.name === 'escape' && open) { setOpen(false); return true; }
    return false;
  } });
  const ref = useNamed(f, { role: 'button', name: iconOnly && active ? `${kt('table.filters')} ${active}` : words, expanded: open });
  useTakeLostFocus(f, true, open);
  return (
    <Box dir="column" shrink={0}>
      <Box dir="row" boxRef={anchor.ref}>
        <Box dir="row" boxRef={ref} onPress={() => { f.focus(); setOpen((o) => !o); }} bg={f.focused ? 'selected' : undefined}>
          {iconMark('filter') ? <TableMark colour="faint">{`${iconMark('filter')} `}</TableMark> : null}
          <Text colour={active ? 'ink' : 'muted'} bold={active > 0} underline={f.focused}>{iconOnly && active ? String(active) : words}</Text>
        </Box>
      </Box>
      <Layer open={open} kind="popover" place={{ at: 'anchor', anchor: anchor.rect, side: 'bottom', align: 'start', width: Math.max(28, ...filters.map(panelWidth)) }} initialFocus="none" padX={1} onEscape={() => { setOpen(false); f.focus(); }} onOutside={() => setOpen(false)}>
        <Box dir="column">
          {filters.map((c) => <TermChip key={c.id} f={c} inline />)}
          {active > 0 && <ClearAll label={kt('table.clearFilters')} onPress={() => { clearAllOf(filters, onClearAll)(); setOpen(false); }} />}
        </Box>
      </Layer>
    </Box>
  );
};
