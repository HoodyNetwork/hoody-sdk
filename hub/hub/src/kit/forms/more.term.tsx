// More form controls in the terminal: NumberField, Select, Combobox, EntityPicker, RadioGroup, TimeField, Form and
// FormFooter. The rules (what a list shows for a query, time parsing, the C9 lock, the footer's states) are the web's:
// more.pure.ts, lock.tsx, Outcome.pure.ts. Lists open in an anchored popover layer (prim/Overlay): keys stay in it,
// Esc clears the search first and closes next, the focus comes back to the trigger.
import { Item } from 'react-stately/Item';
import { useRadioGroupState } from 'react-stately/useRadioGroupState';
import { useSelectState } from 'react-stately/useSelectState';
import { useComboBoxState } from 'react-stately/useComboBoxState';
import { useNumberFieldState } from 'react-stately/useNumberFieldState';
import { useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type JSX, type ReactNode, type Ref } from 'react';
// Prop types only: each component's own web file has a terminal sibling that re-exports from here, so a
// `typeof` of the web component would describe this file by itself.
import type { NumberFieldProps, SelectProps, ComboboxProps, EntityPickerProps, RadioGroupProps, FormProps, FormFooterProps, TimeFieldProps } from './more';
import { Box, Text, useBoxSize, useFocusable, isPressKey, type Key } from '../../term/prim';
import { focusInk } from '../../term/prim/FocusInk';
import type { Focusable } from '../../term/prim/focus';
import type { BoxRenderable } from '../../term/prim/otui';
import { FieldInput, type FieldHandle } from '../../term/prim/FieldInput';
import { Layer, useAnchor, useLayer } from '../../term/prim/Overlay';
import { cellWidth } from '../../term/prim/Caret';
import { mergeRefs, useSem, type Sem } from '../../term/prim/semantics';
import { Button } from '../controls/Button';
import { TextButton } from '../controls/Link';
import { useDrawer } from '../overlays/Drawer';
import { isUnknown } from '../outcome';
import { groupItems } from '../pickers/pickerLogic';
import { ErrorDetails, errorSentence, pendingFacts, useErrorInfo } from '../states/ErrorDetails';
import { Spinner } from '../states/States';
import stateStrings from '../states/strings.en.json';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import { TextField } from './fields';
import strings from './forms.strings.en.json';
import { type FooterLock, FooterLockContext, FormStateProvider, useFieldLock, useFormState, useReportFooterLock } from './lock';
import { Outcome } from './Outcome';
import { useCheck, useDoneFlash, useOutcome, useOutcomeFacts, usePendingToast } from './Outcome.pure';
import { type Option, SELECT_SEARCH_ABOVE, TIME, asItem, groupOf, normalizeTime, selectSections, stepTime } from './more.pure';
import { ControlRow, FIELD_CELLS, FieldFrame, fieldSem, TermFormContext, useTermForm, useTermFormHost, useValidation } from './termField';
import ts from './term.strings.en.json';

export type { NumberFieldProps, SelectProps, ComboboxProps, EntityPickerProps, RadioGroupProps, FormProps, FormFooterProps, TimeFieldProps } from './more';
export type { Option } from './more.pure';
export type { SecretFieldProps, SecretInputProps, SecretConfirm, CopyAttempt } from './Secret';
export { SELECT_SEARCH_ABOVE, SELECT_MAX_ROWS, selectSections, normalizeTime, stepClock } from './more.pure';
export { SecretField, SecretInput, copyWhenRead, useRevealGuard } from './Secret';

/** A focusable handle as the element-shaped ref web callers hold (focus() works). */
function refLike<T>(focus: () => void): T {
  return { focus, blur: () => {}, select: focus } as unknown as T; // contract-any: an element-shaped handle; a terminal has no DOM element, only focus
}

// ── NumberField ─────────────────────────────────────────────────────────────────────

export const NumberField: (props: NumberFieldProps) => JSX.Element = ({ label, description, errorMessage, unit, placeholder, width, inputRef, ...rest }) => {
  const isDisabled = useFieldLock(rest.isDisabled);
  const { minValue: min, maxValue: max, step, formatOptions } = rest;
  // React Stately's number field state (the web's), in the kit's locale: parsing (grouping, units, percent), what typing
  // may enter (validate), step snapping from the minimum, clamping, formatting, the steppers, and onChange only for a
  // different number.
  const state = useNumberFieldState({
    locale: 'en', value: rest.value, defaultValue: rest.defaultValue, onChange: rest.onChange,
    minValue: min, maxValue: max, step, formatOptions, isDisabled, isReadOnly: rest.isReadOnly,
  });
  const value = state.numberValue;
  const [focused, setFocused] = useState(false);
  const handle = useRef<FieldHandle | null>(null);
  useImperativeHandle(inputRef as Ref<HTMLInputElement> | undefined, () => refLike<HTMLInputElement>(() => handle.current?.focus()), []);
  const v = useValidation({
    name: rest.name, value, empty: Number.isNaN(value), isRequired: rest.isRequired, validate: rest.validate,
    isInvalid: rest.isInvalid, errorMessage, validationBehavior: rest.validationBehavior, focus: () => handle.current?.focus(),
  });
  const atMin = !state.canDecrement;
  const atMax = !state.canIncrement;
  const inert = isDisabled || rest.isReadOnly === true;
  const form = useTermForm();
  // Enter commits the typed text (onChange) and then submits. The form's onSubmit is the one of the render that holds
  // the committed number, so the submit runs after that render, as a browser's submit event comes after the keydown's
  // update (a submit in the same handler would send the number from before the typing).
  const formNow = useRef(form);
  formNow.current = form;
  const [submits, setSubmits] = useState(0);
  useEffect(() => { if (submits > 0) formNow.current?.submit(); }, [submits]);
  // What of a text may be part of a number, each character judged in turn (as React Aria's input refuses the others).
  const keep = (x: string): string => (state.validate(x) ? x : [...x].reduce((acc, ch) => (state.validate(acc + ch) ? acc + ch : acc), ''));
  return (
    <FieldFrame label={label} required={rest.isRequired} disabled={isDisabled} readOnly={rest.isReadOnly} description={description} error={v.error} width={width}>
      <ControlRow focused={focused} invalid={v.invalid} disabled={isDisabled}>
        <Box onPress={inert || atMin ? undefined : () => state.decrement()}><Text colour={isDisabled || atMin ? 'faint' : 'muted'}>[−]</Text></Box>
        <FieldInput
          handle={handle}
          value={state.inputValue}
          // As React Aria's input: what cannot become part of a number is refused as it is typed. Each character is
          // judged in turn (keys in one burst reach here as one text, the refused ones included).
          onChange={(x) => state.setInputValue(keep(x))}
          placeholder={placeholder}
          disabled={isDisabled}
          readOnly={rest.isReadOnly === true}
          autoFocus={rest.autoFocus}
          sem={fieldSem({ label: label ?? rest['aria-label'], description, error: v.error, invalid: v.invalid, required: rest.isRequired })}
          // Enter commits the text the editor holds (`typed`), not this render's text: keys that arrive in one burst
          // ("42" and Enter in one read, a paste ending in a new line) reach here before any render, so the render's
          // text is still the one from before the typing and a commit of it changes nothing.
          onSubmit={(typed) => { state.commit(keep(typed)); if (form) setSubmits((n) => n + 1); }}
          onKey={(k) => {
            if (inert) return k.name === 'up' || k.name === 'down' || k.name === 'pageup' || k.name === 'pagedown';
            if (k.name === 'up') { state.increment(); return true; }
            if (k.name === 'down') { state.decrement(); return true; }
            if (k.name === 'pageup' && max !== undefined) { state.incrementToMax(); return true; }
            if (k.name === 'pagedown' && min !== undefined) { state.decrementToMin(); return true; }
            return false;
          }}
          onFocusChange={(f) => {
            setFocused(f);
            if (!f) { const before = state.numberValue; state.commit(); v.left(!Object.is(before, state.numberValue)); }
          }}
        />
        {unit ? <Text colour="faint">{unit}</Text> : null}
        <Box onPress={inert || atMax ? undefined : () => state.increment()}><Text colour={isDisabled || atMax ? 'faint' : 'muted'}>[+]</Text></Box>
      </ControlRow>
    </FieldFrame>
  );
};

// ── Choice lists (Select, Combobox) ─────────────────────────────────────────────────

type Row<V extends string> = { kind: 'head'; title: string } | { kind: 'opt'; o: Option<V> };

function rowsOf<V extends string>(sections: { title: string | null; rows: Option<V>[] }[]): Row<V>[] {
  const out: Row<V>[] = [];
  for (const g of sections) {
    if (g.title !== null) out.push({ kind: 'head', title: g.title });
    for (const o of g.rows) out.push({ kind: 'opt', o });
  }
  return out;
}

/** The next enabled option row from `at` in `dir` (wrapping off), or `at` when there is none. */
function nextEnabled<V extends string>(rows: Row<V>[], at: number, dir: 1 | -1): number {
  for (let i = at + dir; i >= 0 && i < rows.length; i += dir) {
    const r = rows[i]!;
    if (r.kind === 'opt' && !r.o.isDisabled) return i;
  }
  return at;
}

const LIST_ROWS = 10;

/** One option as a line: ✓ marks the picked one, a description dims after it, a disabled one is faint and says so. */
function OptionLine<V extends string>({ o, picked, cursor, focused, slots }: { o: Option<V>; picked: boolean; cursor: boolean; focused: boolean; slots?: boolean }) {
  const off = o.isDisabled === true;
  return (
    <Text truncate colour={off ? 'faint' : 'ink'} {...focusInk(cursor && focused)}>
      {cursor ? '›' : ' '}{picked ? '✓ ' : '  '}{o.label}
      {o.description ? <Text colour="faint">{slots ? ` · ${o.description}` : ` ${o.description}`}</Text> : null}
    </Text>
  );
}

/** The rows of a list, windowed around the cursor; a press picks. At most LIST_ROWS rows, fewer when the layer has less
 *  room (its lines less `reserve`, the other lines of the panel): the cursor's row is always drawn, so a key never picks
 *  a row that is cut off. */
function ListRows<V extends string>({ rows, cursor, value, focused, onPick, slots, emptyText, onWheel, reserve = 0 }: {
  rows: Row<V>[]; cursor: number; value: V | undefined; focused: boolean; onPick: (o: Option<V>) => void; slots?: boolean; emptyText: string; onWheel?: (dir: 1 | -1) => void; reserve?: number;
}) {
  const room = (useLayer()?.room ?? Infinity) - reserve;
  if (rows.length === 0) return <Text colour="faint">{emptyText}</Text>;
  // All rows when they fit; else a window with its ↑ / ↓ count lines inside the room.
  const most = rows.length <= Math.min(LIST_ROWS, room) ? rows.length : Math.max(1, Math.min(LIST_ROWS, room - 2));
  const start = Math.max(0, Math.min(cursor - Math.floor(most / 2), rows.length - most));
  const shown = rows.slice(start, start + most);
  return (
    <Box dir="column" onWheel={onWheel ? (e: { scroll?: { direction?: string } }) => onWheel(e.scroll?.direction === 'up' ? -1 : 1) : undefined}>
      {start > 0 ? <Text colour="faint">  ↑ {start}</Text> : null}
      {shown.map((r, i) => (r.kind === 'head' ? (
        <Text key={'h' + r.title + i} colour="muted" bold truncate>{r.title}</Text>
      ) : (
        <Box key={r.o.value} onPress={r.o.isDisabled ? undefined : () => onPick(r.o)} sem={optionSem(r.o, r.o.value === value, slots)}>
          <OptionLine o={r.o} picked={r.o.value === value} cursor={start + i === cursor} focused={focused} slots={slots} />
        </Box>
      )))}
      {start + most < rows.length ? <Text colour="faint">  ↓ {rows.length - start - most}</Text> : null}
    </Box>
  );
}

/** An option as React Aria names it: the label, and its description too unless the description is its own slot. */
const optionSem = (o: Option, picked: boolean, slots?: boolean): Sem => ({
  role: 'option', name: o.description && !slots ? `${o.label} ${o.description}` : o.label, ...(slots && o.description ? { description: o.description } : {}),
  selected: picked, disabled: o.isDisabled || undefined,
});

const widestLabel = (options: readonly Option[]): number => options.reduce((w, o) => Math.max(w, cellWidth(o.label) + (o.description ? cellWidth(o.description) + 1 : 0)), 0);

/** The keyboard-owned list inside an open Select: arrows, Home/End, Enter/Space pick; typing goes to the search. */
function SelectList<V extends string>({ rows, value, cursor, setCursor, onPick, onType, slots, emptyText, autoFocus, handle, name, reserve }: {
  name: string; rows: Row<V>[]; value: V | undefined; cursor: number; setCursor: (n: number) => void; onPick: (o: Option<V>) => void; onType: ((ch: string) => void) | null; slots?: boolean; emptyText: string; autoFocus: boolean;
  handle: Ref<FieldHandle>; reserve: number;
}) {
  const f = useFocusable({
    auto: autoFocus,
    onKey: (k) => {
      if (k.name === 'down') { setCursor(nextEnabled(rows, cursor, 1)); return true; }
      if (k.name === 'up') { setCursor(nextEnabled(rows, cursor, -1)); return true; }
      if (k.name === 'home') { setCursor(nextEnabled(rows, -1, 1)); return true; }
      if (k.name === 'end') { setCursor(nextEnabled(rows, rows.length, -1)); return true; }
      if (k.name === 'pagedown') { let c = cursor; for (let i = 0; i < LIST_ROWS; i++) c = nextEnabled(rows, c, 1); setCursor(c); return true; }
      if (k.name === 'pageup') { let c = cursor; for (let i = 0; i < LIST_ROWS; i++) c = nextEnabled(rows, c, -1); setCursor(c); return true; }
      if (isPressKey(k)) { const r = rows[cursor]; if (r && r.kind === 'opt' && !r.o.isDisabled) onPick(r.o); return true; }
      if (onType && !k.ctrl && !k.meta && k.sequence && k.sequence.length === 1 && k.sequence > ' ') { onType(k.sequence); return true; }
      return false;
    },
  });
  useImperativeHandle(handle, () => ({ focus: f.focus }), [f.focus]);
  const semRef = useSem({ role: 'listbox', name }, { focus: f });
  const ref = useMemo(() => mergeRefs<BoxRenderable>(f.ref, semRef), [f.ref, semRef]);
  return (
    <Box dir="column" boxRef={ref}>
      <ListRows rows={rows} cursor={cursor} value={value} focused={f.focused} onPick={onPick} slots={slots} emptyText={emptyText} reserve={reserve}
        onWheel={(d) => setCursor(nextEnabled(rows, cursor, d))} />
    </Box>
  );
}

const firstCursor = <V extends string>(rows: Row<V>[], value: V | undefined): number => {
  const at = rows.findIndex((r) => r.kind === 'opt' && r.o.value === value);
  return at >= 0 ? at : nextEnabled(rows, -1, 1);
};

/** A trigger: focusable, Enter/Space/↓/↑ open; a typed letter picks the next option starting with what was typed. */
function useTrigger(o: { disabled: boolean; autoFocus?: boolean; onOpen: () => void; onType?: (ch: string) => void }) {
  return useFocusable({
    disabled: o.disabled,
    auto: o.autoFocus,
    onKey: (k: Key) => {
      if (isPressKey(k) || k.name === 'down' || k.name === 'up') { o.onOpen(); return true; }
      if (o.onType && !k.ctrl && !k.meta && k.sequence && k.sequence.length === 1 && k.sequence > ' ') { o.onType(k.sequence); return true; }
      return false;
    },
  });
}

export function Select<V extends string>({ label, description, errorMessage, options, value, onChange, placeholder, descriptionSlots = false, width, triggerRef, ...rest }: SelectProps<V>) {
  const t = useStrings(kitStrings);
  const tt = useStrings(ts);
  const isDisabled = useFieldLock(rest.isDisabled);
  // React Stately's select state (the web's): open/close and the selected key; onChange only for a different key.
  // Its collection is every option; the terminal's own list (search, sections, cursor) draws from `options`.
  const state = useSelectState<Option<V>>({
    items: options, children: (o: Option<V>) => <Item key={o.value}>{o.label}</Item>,
    selectedKey: value ?? null, onSelectionChange: (k) => { if (k !== null) onChange(String(k) as V); },
    disabledKeys: options.filter((o) => o.isDisabled).map((o) => o.value), isDisabled, allowsEmptyCollection: true,
  });
  const open = state.isOpen;
  const [query, setQuery] = useState('');
  const searchable = options.length > SELECT_SEARCH_ABOVE;
  const view = useMemo(() => selectSections(options, open && searchable ? query : '', value), [options, open, searchable, query, value]);
  const rows = useMemo(() => rowsOf(view.sections), [view]);
  const [cursor, setCursor] = useState(0);
  useEffect(() => { setCursor(firstCursor(rows, value)); }, [rows, value]);
  const picked = options.find((o) => o.value === value);
  const anchor = useAnchor();
  const v = useValidation({ value, empty: value === undefined, isRequired: rest.isRequired, errorMessage, focus: () => trig.focus() });
  // Typeahead on the closed trigger (React Aria's): letters typed within a second build a prefix.
  const typed = useRef({ text: '', at: 0 });
  const typeahead = (ch: string): void => {
    const now = Date.now();
    typed.current = { text: (now - typed.current.at < 1000 ? typed.current.text : '') + ch.toLowerCase(), at: now };
    const from = options.findIndex((o) => o.value === value);
    const n = options.length;
    for (let i = 1; i <= n; i++) {
      const o = options[(from + i + (typed.current.text.length > 1 ? n - 1 : 0)) % n]!;
      if (!o.isDisabled && o.label.toLowerCase().startsWith(typed.current.text)) { state.setSelectedKey(o.value); return; }
    }
  };
  const close = (): void => { state.close(); setQuery(''); };
  const trig = useTrigger({ disabled: isDisabled, onOpen: () => state.open(), onType: typeahead });
  useImperativeHandle(triggerRef as Ref<HTMLButtonElement> | undefined, () => refLike<HTMLButtonElement>(trig.focus), [trig.focus]);
  const pick = (o: Option<V>): void => {
    close();
    state.setSelectedKey(o.value);
  };
  const cells = width ? FIELD_CELLS[width] : undefined;
  // Wide enough for the widest option and for the key hint line (border 2 + padding 2), up to 64.
  const panelW = Math.min(64, Math.max(cells ?? 0, widestLabel(options) + 6, cellWidth(tt('select.keys')) + 4, 24));
  const search = useRef<FieldHandle | null>(null);
  const list = useRef<FieldHandle | null>(null);
  // React Aria's trigger: a button named by the shown value and the label, that pops up a listbox.
  const name = label ?? rest['aria-label'] ?? '';
  const shownText = picked ? picked.label : (placeholder ?? t('select.placeholder'));
  const trigSem = useSem({ ...fieldSem({ label: `${shownText} ${name}`.trim(), description, error: v.error, invalid: v.invalid, required: rest.isRequired }), role: 'button', expanded: open, popup: 'listbox' },
    { role: 'button', disabled: isDisabled, focus: trig });
  const trigRef = useMemo(() => mergeRefs<BoxRenderable>(trig.ref, trigSem), [trig.ref, trigSem]);
  return (
    <FieldFrame label={label} required={rest.isRequired} disabled={isDisabled} description={description} error={v.error} width={width} fit>
      <Box boxRef={anchor.ref} dir="row">
        <Box boxRef={trigRef} dir="row" grow={cells ? 1 : 0} shrink={1} onPress={isDisabled ? undefined : () => { trig.focus(); state.open(); }}>
          <ControlRow focused={trig.focused} invalid={v.invalid} disabled={isDisabled}>
            <Text truncate colour={isDisabled ? 'faint' : picked ? 'ink' : 'faint'} {...focusInk(trig.focused)}>
              {picked ? picked.label : (placeholder ?? t('select.placeholder'))}
            </Text>
            <Text colour="faint">▾</Text>
          </ControlRow>
        </Box>
      </Box>
      <Layer open={open} kind="popover" place={{ at: 'anchor', anchor: anchor.rect, width: panelW }} onEscape={() => (query !== '' ? setQuery('') : close())} onOutside={close}>
        {searchable && (
          <Box dir="row" gap={1}>
            <Text colour="faint">/</Text>
            <FieldInput handle={search} value={query} onChange={setQuery} placeholder={t('select.search')} autoFocus
              onKey={(k) => {
                if (k.name === 'escape' && query !== '') { setQuery(''); return true; }
                if (k.name === 'down' || k.name === 'return') { list.current?.focus(); return true; }
                return false;
              }} />
          </Box>
        )}
        {/* The search line, the "more" line and the key hint share the panel with the list. */}
        <SelectList name={name} rows={rows} value={value} cursor={cursor} setCursor={setCursor} onPick={pick} slots={descriptionSlots} emptyText={t('combo.empty')} handle={list}
          reserve={(searchable ? 1 : 0) + (view.total > view.shown ? 1 : 0) + 1}
          autoFocus={!searchable} onType={searchable ? (ch) => { setQuery((q) => q + ch); search.current?.focus(); } : null} />
        {view.total > view.shown ? <Text colour="faint">{t('select.more', { count: view.total - view.shown })}</Text> : null}
        <Text colour="faint" truncate>{tt('select.keys')}</Text>
      </Layer>
    </FieldFrame>
  );
}

export function Combobox<V extends string>({ label, description, errorMessage, options, value, onChange, placeholder, emptyText, width, inputRef, onCommitText, ...rest }: ComboboxProps<V>) {
  const t = useStrings(kitStrings);
  const isDisabled = useFieldLock(rest.isDisabled);
  const pickedLabel = options.find((o) => o.value === value)?.label ?? '';
  // React Stately's combo box state (the web's): the input text (reset to the pick on leaving and on Escape), open on
  // focus (menuTrigger "focus"), the selected key; onChange only for a different key. The terminal's own list
  // (filter over label, description and group; sections; cursor) draws from `options`.
  const state = useComboBoxState<Option<V>>({
    items: options, children: (o: Option<V>) => <Item key={o.value} textValue={o.label}>{o.label}</Item>,
    selectedKey: value ?? null, onSelectionChange: (k) => { if (k !== null) onChange(String(k) as V); },
    disabledKeys: options.filter((o) => o.isDisabled).map((o) => o.value), isDisabled, allowsEmptyCollection: true,
    // Free entry (the web's): the list opens on typing, the arrows or ▾, not with the focus, so the field can take the
    // focus back after an entry without the list covering what sits under it; leaving keeps typed text, then hands it
    // over (onFocusChange below).
    menuTrigger: onCommitText ? 'input' : 'focus',
    allowsCustomValue: onCommitText ? true : undefined,
  });
  // Free entry: emptying the box after a taken entry is a text change, which the state answers by opening the list
  // again while the field has the focus; that one opening is closed. Any key or press of the person's own ends it.
  const cleared = useRef(false);
  useEffect(() => {
    if (!cleared.current) return;
    if (state.inputValue !== '') { cleared.current = false; return; }
    if (state.isOpen) { cleared.current = false; state.close(); }
  });
  const text = state.inputValue;
  const focused = state.isFocused;
  const open = state.isOpen;
  const query = text === pickedLabel ? '' : text;
  const q = query.toLowerCase();
  const shown = useMemo(
    () => (q === '' ? options : options.filter((o) => o.value === value || [o.label, o.description, groupOf(o)].some((x) => !!x && x.toLowerCase().includes(q)))),
    [options, q, value],
  );
  const rows = useMemo(() => rowsOf(groupItems(shown.map(asItem)).map((g) => ({ title: g.title, rows: g.rows.map((r) => shown.find((o) => o.value === r.id) as Option<V>) }))), [shown]);
  const [cursor, setCursor] = useState(0);
  useEffect(() => { setCursor(firstCursor(rows, value)); }, [rows, value]);
  // Free entry (the web's): an option counts as highlighted only once the arrows moved to it after the last typing;
  // the terminal's list always draws a cursor row, the web's has none until then.
  const [moved, setMoved] = useState(false);
  const handle = useRef<FieldHandle | null>(null);
  useImperativeHandle(inputRef as Ref<HTMLInputElement> | undefined, () => refLike<HTMLInputElement>(() => handle.current?.focus()), []);
  const anchor = useAnchor();
  const v = useValidation({ value, empty: value === undefined, isRequired: rest.isRequired, errorMessage, focus: () => handle.current?.focus() });
  const form = useTermForm();
  // The pick already chosen puts its label back and closes (React Stately's commit of the selected key); another one
  // reports itself and closes (the text follows when the parent stores it, else returns to the parent's on leaving).
  const pick = (o: Option<V>): void => {
    if (o.value === state.selectedKey) { state.revert(); return; }
    state.setSelectedKey(o.value);
    state.close();
  };
  // Enter on the open list picks the highlighted option. The list's own layer takes it first (onKeyFirst), so a dialog
  // holding the field never presses its primary instead (React Aria's listbox consumes the Enter).
  const enter = (k: Key): boolean => {
    if (!(k.name === 'return' || k.name === 'linefeed')) return false;
    if (onCommitText && !(open && moved) && text.trim() !== '' && text !== pickedLabel) {
      if (onCommitText(text)) { state.setInputValue(''); cleared.current = true; }
      state.close();
      return true;
    }
    if (!open) return false;
    const r = rows[cursor];
    if (r && r.kind === 'opt' && !r.o.isDisabled) pick(r.o); else state.close();
    return true;
  };
  const cells = width ? FIELD_CELLS[width] : undefined;
  return (
    <FieldFrame label={label} required={rest.isRequired} disabled={isDisabled} description={description} error={v.error} width={width}>
      <Box boxRef={anchor.ref} dir="row">
        <ControlRow focused={focused} invalid={v.invalid} disabled={isDisabled}>
          <FieldInput
            handle={handle}
            value={text}
            onChange={(n) => { cleared.current = false; state.setInputValue(n); state.open(null, 'input'); setMoved(false); }}
            placeholder={placeholder}
            disabled={isDisabled}
            sem={{ ...fieldSem({ label: label ?? rest['aria-label'], description, error: v.error, invalid: v.invalid, required: rest.isRequired }), role: 'combobox', expanded: open && focused, popup: 'listbox' }}
            onSubmit={() => form?.submit()}
            onKey={(k) => {
              if (k.name !== 'return' && k.name !== 'linefeed') cleared.current = false;
              if (k.name === 'down') { if (!open) state.open('first', 'manual'); else setCursor(nextEnabled(rows, cursor, 1)); setMoved(true); return true; }
              if (k.name === 'up') { if (open) { setCursor(nextEnabled(rows, cursor, -1)); setMoved(true); } return true; }
              if (enter(k)) return true;
              // Escape (React Aria's): put the picked label back and close.
              if (k.name === 'escape' && (open || text !== pickedLabel)) { state.revert(); return true; }
              return false;
            }}
            // menuTrigger "focus" (without free entry): the list opens with the focus; leaving resets the text to the picked
            // label (the state's).
            onFocusChange={(f) => {
              state.setFocused(f);
              if (f || !onCommitText || (pickedLabel !== '' && text === pickedLabel)) return;
              if (onCommitText(text) && text !== '') state.setInputValue('');
            }}
          />
          <Box onPress={isDisabled ? undefined : () => { cleared.current = false; handle.current?.focus(); state.toggle(null, 'manual'); }}><Text colour="faint">▾</Text></Box>
        </ControlRow>
      </Box>
      <Layer open={open && focused} kind="tip" place={{ at: 'anchor', anchor: anchor.rect, width: Math.min(64, Math.max(cells ?? 0, widestLabel(options) + 6, 24)) }} onEscape={() => state.revert()} onKeyFirst={enter}>
        <Box dir="column" sem={{ role: 'listbox', name: label ?? rest['aria-label'] ?? '' }}>
          <ListRows rows={rows} cursor={cursor} value={value} focused onPick={pick} emptyText={emptyText ?? t('combo.empty')} />
        </Box>
      </Layer>
    </FieldFrame>
  );
}

export function EntityPicker<V extends string>({ options, isLoading, error, onRetry, description, ...rest }: EntityPickerProps<V>) {
  const t = useStrings(kitStrings);
  const tsx = useStrings(stateStrings);
  const info = useErrorInfo(error);
  const pending = pendingFacts(info);
  const status = error ? (
    <Box dir="row" gap={1} wrap>
      <Text colour="warn">! {pending ? t('outcome.pending.title') : t('picker.error')}</Text>
      {info && <Text colour="muted">{errorSentence(info, undefined, tsx)}</Text>}
      {onRetry && <TextButton onPress={onRetry}>{pending ? t('outcome.pending.check') : t('action.retry')}</TextButton>}
      {info && <ErrorDetails error={info} mode="button" />}
    </Box>
  ) : isLoading || !options ? (
    <Box dir="row" gap={1}><Spinner /><Text colour="muted">{t('picker.loading')}</Text></Box>
  ) : null;
  return <Combobox {...rest} options={options ?? []} isDisabled={rest.isDisabled || (!options && !rest.onCommitText)} description={status ?? description} />;
}

// ── RadioGroup ──────────────────────────────────────────────────────────────────────

/** The web's card grid in cells: `minmax(180px, 1fr)` columns, `gap: var(--sp-2)`. */
const CARD_MIN = 23;
const CARD_GAP = 1;

/** One radio: its own node in the semantics tree; focusing it puts the group's cursor on it (the group is one Tab stop). */
function Radio<V extends string>({ o, on, here, off, cards, width, group, onPick }: {
  o: Option<V>; on: boolean; here: boolean; off: boolean; cards: boolean; width?: number; group: Focusable & { focusOn: (v: V) => void }; onPick: () => void;
}) {
  const focus = useMemo<Focusable>(() => ({ focused: here, ref: group.ref, focus: () => group.focusOn(o.value), blur: group.blur }), [here, group, o.value]);
  const semRef = useSem({ role: 'radio', name: o.label, checked: on, ...(o.description ? { description: o.description } : {}) }, { disabled: off, focus });
  return (
    <Box boxRef={semRef} dir="row" onPress={off ? undefined : onPick}
      {...(cards ? { border: true, borderColour: on ? 'focus' : 'line', padX: 1, minWidth: 18 } : {})}
      {...(width !== undefined ? { width, shrink: 0 } : {})}>
      {/* The mark is its own cell run (the web's radio beside its text column): a label that wraps continues under
          its first word, not under the mark. */}
      <Box shrink={0}><Text colour={off ? 'faint' : 'ink'} {...focusInk(here)}>{on ? '(•) ' : '( ) '}</Text></Box>
      <Box dir="column" shrink={1} minWidth={0}>
        <Text colour={off ? 'faint' : 'ink'} {...focusInk(here)}>{o.label}{o.isDisabled ? <Text colour="faint"> (unavailable)</Text> : null}</Text>
        {o.description ? <Text colour="faint">{o.description}</Text> : null}
      </Box>
    </Box>
  );
}

export function RadioGroup<V extends string>({ label, description, errorMessage, options, value, onChange, variant = 'list', orientation, columns: _columns, ...rest }: RadioGroupProps<V>) {
  const isDisabled = useFieldLock(rest.isDisabled);
  const horizontal = (orientation ?? (variant === 'cards' ? 'horizontal' : 'vertical')) === 'horizontal';
  const enabled = options.filter((o) => !o.isDisabled);
  // The cursor is read by key handlers that may run before a re-render (a focus then a key in one burst): keep a ref.
  const [cursor, setCursorState] = useState<V | undefined>(value ?? enabled[0]?.value);
  const cursorRef = useRef(cursor);
  const setCursor = (c: V | undefined): void => { cursorRef.current = c; setCursorState(c); };
  useEffect(() => { if (value !== undefined) setCursor(value); }, [value]);
  // React Stately's radio group state (the web's): the selection, and onChange only for a different value. Validation
  // stays the kit's (useValidation), so the state gets no isRequired.
  const state = useRadioGroupState({ value: value ?? null, onChange: (next) => { if (next !== null) onChange(next as V); }, isDisabled });
  const selected = (state.selectedValue ?? undefined) as V | undefined;
  const v = useValidation({ value: selected, empty: selected === undefined, isRequired: rest.isRequired, errorMessage, focus: () => f.focus() });
  const choose = (o: Option<V>): void => { setCursor(o.value); state.setSelectedValue(o.value); };
  // One Tab stop: arrows move and select, as React Aria's radio group does; Space selects the one under the cursor.
  const step = (dir: 1 | -1): void => {
    if (enabled.length === 0) return;
    const at = enabled.findIndex((o) => o.value === cursorRef.current);
    const next = enabled[(at + dir + enabled.length) % enabled.length]!;
    choose(next);
  };
  const f = useFocusable({
    disabled: isDisabled || enabled.length === 0,
    onKey: (k) => {
      if (k.name === 'down' || k.name === 'right') { step(1); return true; }
      if (k.name === 'up' || k.name === 'left') { step(-1); return true; }
      if (k.name === 'space') { const o = options.find((x) => x.value === cursorRef.current); if (o && !o.isDisabled) choose(o); return true; }
      return false;
    },
  });
  const group = useMemo(() => ({ ...f, focusOn: (c: V) => { setCursor(c); f.focus(); } }), [f]);
  // Named by its label, else by the caller's aria-label or the element aria-labelledby points at (a setting row's label).
  const semRef = useSem({ role: 'radiogroup', ...fieldSem({ label: label ?? rest['aria-label'], description, error: v.error, invalid: v.invalid, required: rest.isRequired }),
    name: (label ?? rest['aria-label']) || undefined, labelledBy: rest['aria-labelledby'], describedBy: rest['aria-describedby'] }, { disabled: isDisabled });
  const ref = useMemo(() => mergeRefs<BoxRenderable>(f.ref, semRef), [f.ref, semRef]);
  // Cards are the web's grid (`repeat(auto-fit, minmax(180px, 1fr))`, gap 8px): as many equal columns as fit at 23
  // cells or more, each card as wide as its column. They were as wide as their own text: two cards under each other
  // of different widths (Tunnels' "What to connect").
  const [size, onSize] = useBoxSize();
  const cards = variant === 'cards';
  const room = size?.width ?? 0;
  const perRow = Math.max(1, Math.min(options.length, Math.floor((room + CARD_GAP) / (CARD_MIN + CARD_GAP))));
  const cardWidth = cards && room > 0 ? Math.max(1, Math.floor((room - (perRow - 1) * CARD_GAP) / perRow)) : undefined;
  // The picked option's own fields (`reveal`), drawn while the parent's value is that option, as the web does
  // (RadioGroup.tsx: `value !== o.value`). Under a vertical list they sit right below the picked radio, indented under
  // its label ("(•) " is 4 cells); after a horizontal row or the cards they span the group. They are their own Tab
  // stops. Only the focused control gets a key (term/prim/focus.ts), so the group's arrows never reach a revealed field
  // and nothing like the web's keepArrowsInReveal is needed.
  const shown = options.find((o) => !!o.reveal && o.value === value);
  const reveal = (o: Option<V>, indent: number) => (
    <Box key={`${o.value}-reveal`} dir="column" minWidth={0} pad={{ left: indent }} sem={{ role: 'group' }}>{o.reveal}</Box>
  );
  if (cards) {
    return (
      <FieldFrame label={label} required={rest.isRequired} disabled={isDisabled} description={description} error={v.error}>
        <Box boxRef={ref} dir="row" wrap gapX={CARD_GAP} gapY={0} onSize={onSize}>
          {options.map((o) => (
            <Radio key={o.value} o={o} on={o.value === selected} here={f.focused && o.value === cursor} off={isDisabled || o.isDisabled === true} cards width={cardWidth}
              group={group} onPick={() => { f.focus(); choose(o); }} />
          ))}
        </Box>
        {shown ? reveal(shown, 0) : null}
      </FieldFrame>
    );
  }
  return (
    <FieldFrame label={label} required={rest.isRequired} disabled={isDisabled} description={description} error={v.error}>
      {/* Horizontal: two cells after each choice, as padding of the choice (it wraps with its choice; no gap between wrapped lines). */}
      <Box boxRef={ref} dir={horizontal ? 'row' : 'column'} wrap={horizontal}>
        {options.flatMap((o) => {
          const off = isDisabled || o.isDisabled === true;
          const radio = (
            <Radio key={o.value} o={o} on={o.value === selected} here={f.focused && o.value === cursor} off={off} cards={false} group={group}
              onPick={() => { f.focus(); choose(o); }} />
          );
          if (horizontal) return [<Box key={o.value} shrink={0} pad={{ right: 2 }}>{radio}</Box>];
          return o === shown ? [radio, reveal(o, 4)] : [radio];
        })}
      </Box>
      {horizontal && shown ? reveal(shown, 0) : null}
    </FieldFrame>
  );
}

// ── Form + FormFooter ───────────────────────────────────────────────────────────────

export const Form: (props: FormProps) => JSX.Element = ({ onSubmit, fieldErrors, busy = false, outcome, onCheck, locked, layout = 'stack', ref, children }) => {
  const o = useOutcome(outcome);
  const [footer, setFooter] = useState<FooterLock | null>(null);
  const isLocked = Boolean(locked) || busy || isUnknown(o) || Boolean(footer && (footer.busy || footer.pending));
  const state = useMemo(() => ({ locked: isLocked, busy, outcome: o, onCheck }), [isLocked, busy, o, onCheck]);
  const host = useTermFormHost(onSubmit, isLocked, fieldErrors);
  useImperativeHandle(ref, () => ({ requestSubmit: () => host.submit(), submit: () => host.submit(), focus: () => {}, reset: () => {} }) as unknown as HTMLFormElement, [host]); // contract-any: a form-shaped handle; submit goes to the terminal form host, nothing else exists
  return (
    <FooterLockContext.Provider value={setFooter}>
      <FormStateProvider value={state}>
        <TermFormContext.Provider value={host}>
          <Box dir={layout === 'inline' ? 'row' : 'column'} gap={layout === 'bare' ? 0 : layout === 'inline' ? 2 : 1} wrap={layout === 'inline'} align={layout === 'inline' ? 'end' : undefined}
            {...(layout === 'stack' ? { maxWidth: 90 } : {})}>
            {children}
          </Box>
        </TermFormContext.Provider>
      </FormStateProvider>
    </FooterLockContext.Provider>
  );
};

/** A real drawer context (a stand-in for an unported module is a hole that answers every read: never a drawer). */
const isDrawer = (d: unknown): d is { requestClose: () => void; reportOutcome?: (id: string, s: unknown) => void } =>
  typeof d === 'object' && d !== null && 'requestClose' in d;

export const FormFooter: (props: FormFooterProps) => JSX.Element = ({
  dirty, busy: busyProp, outcome: outcomeProp, onCheck: onCheckProp, checking, onDiscard, submitLabel, busyLabel, doneText, doneFor, pendingDetail, failedDetail,
  onSubmit, onCancel, requireDirty = true, submitDisabled, tone = 'default', toastOnLeave = true, nested = false, error, errorWords, reason,
}) => {
  const t = useStrings(strings);
  const form = useFormState();
  const busy = busyProp ?? form.busy;
  const own = useOutcome(outcomeProp);
  const o = outcomeProp !== undefined ? own : form.outcome;
  const onCheck = onCheckProp ?? form.onCheck;
  const [checkBusy, check] = useCheck(onCheck, checking);
  const doneShown = useDoneFlash(o, doneFor);
  const { info, kind } = useOutcomeFacts(o, error);
  const pending = kind === 'pending';
  const lock = busy || checkBusy;
  const raw = useDrawer() as unknown;
  const drawer = isDrawer(raw) ? raw : null;
  const report = drawer?.reportOutcome;
  const reporter = useId();
  useEffect(() => {
    if (!report) return;
    report(reporter, { pending, busy: lock, nested, ...(onCheck ? { onCheck: () => void onCheck() } : {}) });
  }, [report, reporter, pending, lock, nested, onCheck]);
  useEffect(() => (report ? () => report(reporter, null) : undefined), [report, reporter]);
  usePendingToast(o, onCheck, toastOnLeave, info);
  useReportFooterLock(busy, pending);
  const cancel = drawer ? drawer.requestClose : onCancel;

  let state: ReactNode = null;
  if (o && o.kind !== 'done') {
    // A page's refusal words show only on a definite refusal: a refusal whose facts say pending keeps the C9 words.
    const detail = o.kind === 'pending' ? pendingDetail : pending ? undefined : failedDetail;
    state = <Outcome outcome={o} detail={detail} error={info} errorWords={errorWords} wrap />;
  } else if (doneShown && !dirty) {
    state = <Outcome outcome={o} doneText={doneText ?? t('form.saved')} />;
  } else if (reason !== undefined && reason !== null && reason !== false && reason !== '') {
    // The page's line on what the primary does or why it is off takes the place of "Unsaved changes".
    state = typeof reason === 'string' || typeof reason === 'number' ? <Text colour="muted">{String(reason)}</Text> : reason;
  } else if (dirty && !busy) {
    state = <Text colour="warn">● {t('form.unsaved')}</Text>;
  }

  return (
    // Wraps only when there is a state line to fold under the buttons; an empty state takes no room (a content-sized
    // wrapping row measured its empty 10-cell slot onto a second line, past the footer's one row: goldens layout-cut).
    // As the web's footer (`.footer { width: 100% }`, `.footerState { flex: 1 1 0 }`): the row is as wide as its place,
    // also where it is a row's item (a Drawer's foot), and the state takes the room left beside the buttons, its words
    // wrapping there. With its text as the basis a wrapping row puts the buttons on a line of their own under the
    // words; with basis 0 in a row sized by its content the row is only as wide as the buttons and they are cut.
    <Box dir="row" gap={2} wrap={state !== null} align="center" shrink={0} width={state !== null ? '100%' : undefined}>
      {state !== null ? <Box grow={1} shrink={1} basis={0} minWidth={10}>{state}</Box> : null}
      <Box dir="row" gap={1} shrink={0}>
        {onDiscard && !pending && (
          <Button variant="ghost" isDisabled={!dirty || busy} onPress={onDiscard}>{t('form.discard')}</Button>
        )}
        {(onCancel || drawer) && cancel && (
          <Button variant="secondary" isDisabled={lock} onPress={cancel}>{pending ? t('form.close') : t('form.cancel')}</Button>
        )}
        {pending ? (
          <Button variant="primary" busy={checkBusy} isDisabled={!check} onPress={check}>{checkBusy ? t('outcome.checking') : t('outcome.check')}</Button>
        ) : (
          <Button
            variant={tone === 'danger' ? 'secondary' : 'primary'}
            tone={tone}
            busy={busy}
            isDisabled={(requireDirty && !dirty) || form.locked || submitDisabled}
            type={onSubmit ? 'button' : 'submit'}
            onPress={busy ? undefined : onSubmit}
          >
            {busy ? (busyLabel ?? t('form.saving')) : (submitLabel ?? t('form.save'))}
          </Button>
        )}
      </Box>
    </Box>
  );
};

// ── TimeField ───────────────────────────────────────────────────────────────────────

export const TimeField: (props: TimeFieldProps) => JSX.Element = ({ label, value, onChange, description, errorMessage, step = 15, isDisabled, isRequired }) => {
  const t = useStrings(kitStrings);
  const invalid = value !== '' && !TIME.test(value);
  return (
    <TextField
      label={label}
      value={value}
      onChange={(v) => onChange(v.replace(/[^\d:]/g, '').slice(0, 5))}
      onBlur={() => {
        const n = normalizeTime(value);
        if (n !== value) onChange(n);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          onChange(stepTime(value, step, e.key === 'ArrowUp' ? 1 : -1));
        } else e.continuePropagation();
      }}
      inputMode="numeric"
      placeholder={t('time.placeholder')}
      mono
      width="xs"
      description={description}
      errorMessage={errorMessage ?? (invalid ? t('time.invalid') : undefined)}
      isInvalid={invalid || Boolean(errorMessage)}
      validationBehavior={errorMessage ? 'aria' : 'native'}
      isDisabled={isDisabled}
      isRequired={isRequired}
    />
  );
};

