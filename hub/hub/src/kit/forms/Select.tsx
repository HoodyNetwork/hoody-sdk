// Select, Combobox and EntityPicker: one of a known set, picked from a list under the field.
// Which one: Select for one of a known set (it grows its own search above 7 options); Combobox only where the
// person types in the field itself; EntityPicker is a Combobox over entities from a query, with loading and error
// lines. For 2 to 5 choices worth seeing at once use RadioGroup; for computers, models and other entities with their
// own rows use a kit/pickers picker.
import { createContext, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode, type Ref, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Button as AriaButton, ButtonContext, ComboBox, ComboBoxStateContext, Input, Header, ListBox, ListBoxItem, ListBoxSection, Popover, Select as AriaSelect, SelectValue, Text, useFilter } from 'react-aria-components';
import { cx } from '../controls/Button';
import { useDisabledPressRef } from '../controls/disabledPress';
import { TextButton } from '../controls/Link';
import { Icon } from '../icons';
import { groupItems } from '../pickers/pickerLogic';
import { ErrorDetails, errorSentence, pendingFacts, useErrorInfo } from '../states/ErrorDetails';
import { Spinner } from '../states/States';
import stateStrings from '../states/strings.en.json';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import b from './fieldBox.module.css';
import { type FieldChrome, type FieldWidth, fieldWidthClass } from './fields';
import f from './fields.module.css';
import { useFieldLock } from './lock';
import s from './more.module.css';
import { describedProps } from './described';
import { pageErrorProps } from './pageError';
import { FieldLabel, FieldNotes } from './FieldShell';
import { type Option, SELECT_SEARCH_ABOVE, asItem, groupOf, selectSections } from './more.pure';

// The pure rules live in more.pure.ts (shared with the terminal); their names stay importable from here.
export { SELECT_SEARCH_ABOVE, SELECT_MAX_ROWS, selectSections } from './more.pure';
export type { Option } from './more.pure';

/** With `slots`, the label and description are the option's label and description slots (its name is the label alone,
 * the description is read as its description); without, plain text (the name reads both). */
function OptionBody({ o, check, slots = false }: { o: Option; check: boolean; slots?: boolean }) {
  return (
    <>
      {o.icon && <Icon name={o.icon} />}
      {o.swatch && o.swatch.length > 0 && (
        <span className={s.swatches} aria-hidden="true">
          {o.swatch.slice(0, 3).map((c, i) => (
            <span key={i} className={s.swatch} style={{ backgroundColor: c }} />
          ))}
        </span>
      )}
      <span className={s.optionText}>
        {slots ? (
          <Text slot="label" className={s.optionLabel} style={o.sample ? { fontFamily: o.sample.fontFamily } : undefined}>
            {o.label}
          </Text>
        ) : (
          <span className={s.optionLabel} style={o.sample ? { fontFamily: o.sample.fontFamily } : undefined}>
            {o.label}
          </span>
        )}
        {o.description && (slots ? <Text slot="description" className={s.optionDesc}>{o.description}</Text> : <span className={s.optionDesc}>{o.description}</span>)}
      </span>
      {check && <Icon name="check" size="sm" className={s.optionCheck} />}
    </>
  );
}

/** A Select whose options' descriptions are their accessible descriptions, never part of their names (see Select). */
const DescriptionSlots = createContext(false);

function OptionRow({ o }: { o: Option }) {
  const slots = useContext(DescriptionSlots);
  return (
    <ListBoxItem id={o.value} textValue={o.label} className={s.option}>
      {({ isSelected }) => <OptionBody o={o} check={isSelected} slots={slots} />}
    </ListBoxItem>
  );
}

export interface SelectProps<V extends string> extends FieldChrome {
  options: readonly Option<V>[];
  value: V | undefined;
  onChange: (value: V) => void;
  placeholder?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  /** Accessible name when there is no visible label. */
  'aria-label'?: string;
  /** Id(s) of help text read with the field. */
  'aria-describedby'?: string;
  /** Each option's name is its label alone and its description is read as a description (a count, say), never as part
   * of its name. */
  descriptionSlots?: boolean;
  width?: FieldWidth;
  /** 'toolbar': a toolbar control's height (`--tb-ctl-h`), as SearchField size="toolbar" and Button, for a filter in a
   *  table toolbar. 'md' (default) is every other field's. */
  size?: 'md' | 'toolbar';
  /** The button that opens the list, so a page can focus it without searching the DOM. */
  triggerRef?: Ref<HTMLButtonElement>;
}

const composing = (e: KeyboardEvent): boolean => e.nativeEvent.isComposing || e.keyCode === 229;

function Sections({ sections }: { sections: { title: string | null; rows: Option[] }[] }) {
  return (
    <>
      {sections.map((g) =>
        g.title === null ? (
          g.rows.map((o) => <OptionRow key={o.value} o={o} />)
        ) : (
          <ListBoxSection key={g.title} className={s.section}>
            <Header className={s.sectionHead}>{g.title}</Header>
            {g.rows.map((o) => (
              <OptionRow key={o.value} o={o} />
            ))}
          </ListBoxSection>
        ),
      )}
    </>
  );
}

export function Select<V extends string>({ label, description, errorMessage, className, options, value, onChange, placeholder, descriptionSlots = false, width, size = 'md', triggerRef, ...rest }: SelectProps<V>) {
  const t = useStrings(kitStrings);
  const isDisabled = useFieldLock(rest.isDisabled);
  // The trigger is disabled with the field (a form's lock ends by itself) and enabled in place.
  const pressRef = useDisabledPressRef(triggerRef);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const searchable = options.length > SELECT_SEARCH_ABOVE;
  const input = useRef<HTMLInputElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  // Closed, every option is in the collection (the selected one always); open and searching, only the matches. A plain list (the
  // options shrank to the search limit while a query was typed) has no box to clear, so it ignores the query.
  const view = useMemo(() => selectSections(options, open && searchable ? query : '', value), [options, open, searchable, query, value]);
  const picked = options.find((o) => o.value === value);
  const toList = (): void => list.current?.focus();
  // The options shrank to the plain list while the search box had focus: the box is gone, so the keys go to the list.
  useEffect(() => {
    if (open && !searchable) list.current?.focus();
  }, [open, searchable]);
  // Typing anywhere in the list starts the search; the arrow keys come back to the list.
  const fromList = (e: KeyboardEvent): void => {
    if (composing(e)) {
      // The same for the list: a fallback composition event (keyCode 229) must not reach the popup's own handlers.
      e.stopPropagation();
      return;
    }
    if (e.key === 'Escape' && query !== '') {
      // The first Escape clears the search wherever focus is; the next one closes.
      e.preventDefault();
      e.stopPropagation();
      setQuery('');
      input.current?.focus();
      return;
    }
    if (!searchable || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.key === ' ') return;
    e.preventDefault();
    e.stopPropagation();
    setQuery((q) => q + e.key);
    input.current?.focus();
  };
  const fromInput = (e: KeyboardEvent): void => {
    if (composing(e)) {
      // An input method owns these keys (candidate choice, Enter to commit, Escape to cancel): nothing here, nothing for the popup either.
      e.stopPropagation();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      toList();
    } else if (e.key === 'Escape' && query !== '') {
      e.preventDefault();
      e.stopPropagation();
      setQuery('');
    } else if (e.key !== 'Tab' && e.key !== 'Escape') e.stopPropagation();
  };
  return (
    <AriaSelect
      {...rest}
      {...describedProps(description)}
      isDisabled={isDisabled}
      selectedKey={value ?? null}
      onSelectionChange={(k) => k !== null && onChange(String(k) as V)}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery('');
      }}
      disabledKeys={options.filter((o) => o.isDisabled).map((o) => o.value)}
      isInvalid={errorMessage ? true : undefined}
      {...pageErrorProps(errorMessage)}
      placeholder={placeholder ?? t('select.placeholder')}
      className={cx(f.field, s.select, size === 'toolbar' && s.select_toolbar, fieldWidthClass(width), className)}
    >
      <FieldLabel>{label}</FieldLabel>
      <AriaButton ref={pressRef} className={cx(b.box, s.selectBtn)}>
        <SelectValue className={s.selectValue}>{() =>
            picked ? (
              <span className={s.pickedVal}>
                <OptionBody o={picked} check={false} />
              </span>
            ) : (
              (placeholder ?? t('select.placeholder'))
            )
          }</SelectValue>
        <Icon name="chevrons-up-down" size="sm" className={s.chev} />
      </AriaButton>
      <FieldNotes description={description} errorMessage={errorMessage} />
      <Popover className={s.popover}>
        {searchable && (
          <div className={s.search}>
            <Icon name="search" size="sm" className={s.searchIcon} />
            <input
              ref={input}
              className={cx(b.box, s.searchInput)}
              type="text"
              value={query}
              placeholder={t('select.search')}
              aria-label={t('select.search')}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={fromInput}
            />
          </div>
        )}
        <div className={s.listWrap} onKeyDownCapture={fromList}>
          <ListBox ref={list} className={s.listbox} renderEmptyState={() => <div className={s.empty}>{t('combo.empty')}</div>}>
            <DescriptionSlots.Provider value={descriptionSlots}>
              <Sections sections={view.sections} />
            </DescriptionSlots.Provider>
          </ListBox>
        </div>
        {view.total > view.shown && (
          <div className={s.more} role="status">
            {t('select.more', { count: view.total - view.shown })}
          </div>
        )}
      </Popover>
    </AriaSelect>
  );
}

export interface ComboboxProps<V extends string> extends Omit<SelectProps<V>, 'triggerRef'> {
  /** Options are filtered by what the person types: an option matches on its label, its description or its group name. */
  emptyText?: string;
  /** The input itself, so a page can focus it without searching the DOM. */
  inputRef?: Ref<HTMLInputElement>;
  /** Free entry: typed text is never dropped. Enter with no option highlighted (by arrow or pointer) hands it over, and so
   *  does leaving the field (empty text included, so a page can drop a refusal the person cleared). Return true when it
   *  was taken: the box empties for the next entry and the list stays closed. False keeps the text, so the page's
   *  `errorMessage` can say what is wrong with it. An option highlighted is still picked through `onChange`. The list
   *  opens on typing, the arrows, the show button or a press on the field, not with the focus. */
  onCommitText?: (text: string) => boolean;
}

export function Combobox<V extends string>({ label, description, errorMessage, className, options, value, onChange, placeholder, emptyText, width, inputRef, onCommitText, ...rest }: ComboboxProps<V>) {
  const t = useStrings(kitStrings);
  const isDisabled = useFieldLock(rest.isDisabled);
  // The show button is disabled with the field (a form's lock, options still loading) and enabled in place.
  const showRef = useDisabledPressRef<HTMLButtonElement>();
  const { contains } = useFilter({ sensitivity: 'base' });
  // The rows are filtered here, never by react-aria: its filter copies grouped rows into plain objects, and React's dev
  // build then diffs those against the collection nodes it replaced, whose childNodes getter throws, which froze the box
  // after its first key. Passing `items` keeps react-aria from filtering; it still owns the box's text and its resets.
  const picked = options.find((o) => o.value === value)?.label ?? '';
  // The box's text as react-aria reports it, typed or reset by it; the picked label itself is no query.
  const [text, setText] = useState(picked);
  // A new value reaches react-aria one commit after the rows that hold it: react-aria looks its label up among the rows
  // it has already built.
  const [ariaKey, setAriaKey] = useState(value);
  useEffect(() => setAriaKey(value), [value]);
  // The pick last reported in this visit to the list: react-aria's blur commit selects the focused row again, and a
  // parent that did not store the pick would hear it twice. A new value, or the list opening again, starts afresh, so a
  // deliberate pick of the same row later is reported.
  const reported = useRef<string | undefined>(value);
  useEffect(() => {
    reported.current = value;
  }, [value]);
  const query = text === picked ? '' : text;
  // The picked row always stays: react-aria reads its label from the rows to put it back in the box, and a label it
  // cannot find empties the box.
  const shown = useMemo(
    () => (query === '' ? options : options.filter((o) => o.value === value || [o.label, o.description, groupOf(o)].some((x) => !!x && contains(x, query)))),
    [options, query, value, contains],
  );
  return (
    <ComboBox
      {...rest}
      {...describedProps(description)}
      items={shown}
      onInputChange={setText}
      onOpenChange={(open) => {
        if (open) reported.current = value;
      }}
      // Open with no match, so the list says so instead of vanishing under the typing.
      allowsEmptyCollection
      // Free entry: leaving the field keeps typed text in the box (React Aria's custom value) instead of putting the
      // picked label back over it; CommitText hands it over.
      allowsCustomValue={onCommitText ? true : undefined}
      isDisabled={isDisabled}
      selectedKey={ariaKey ?? null}
      // Picking the option already picked again is no change.
      onSelectionChange={(k) => {
        if (k === null || String(k) === value || String(k) === reported.current) return;
        reported.current = String(k);
        onChange(String(k) as V);
      }}
      disabledKeys={options.filter((o) => o.isDisabled).map((o) => o.value)}
      isInvalid={errorMessage ? true : undefined}
      {...pageErrorProps(errorMessage)}
      // Free entry opens the list on typing, the arrows, the show button or a press on the field (CommitText), not with the
      // focus: the field takes the focus back after an entry without the list covering what sits under it.
      menuTrigger={onCommitText ? 'input' : 'focus'}
      className={cx(f.field, fieldWidthClass(width), className)}
    >
      <FieldLabel>{label}</FieldLabel>
      <CommitText onCommitText={onCommitText} picked={picked}>
        <Input ref={inputRef} className={cx(b.box, f.input, s.comboInput)} placeholder={placeholder} />
        <AriaButton ref={showRef} className={s.comboBtn} aria-label={t('combo.show')}>
          <Icon name="chevron-down" size="sm" />
        </AriaButton>
      </CommitText>
      <FieldNotes description={description} errorMessage={errorMessage} />
      <Popover className={s.popover}>
        <ListBox className={s.listbox} renderEmptyState={() => <div className={s.empty}>{emptyText ?? t('combo.empty')}</div>}>
          <Sections sections={groupItems(shown.map(asItem)).map((g) => ({ title: g.title, rows: g.rows.map((r) => shown.find((o) => o.value === r.id) as Option) }))} />
        </ListBox>
      </Popover>
    </ComboBox>
  );
}

/** The box around the input. With `onCommitText` it takes Enter first (capture), before React Aria's own Enter: with no
 *  option highlighted the text goes to the page. Leaving the box (not into its own show button) hands it over too, and a
 *  press on the input opens the list. */
function CommitText({ onCommitText, picked, children }: { onCommitText: ((text: string) => boolean) | undefined; picked: string; children: ReactNode }) {
  const state = useContext(ComboBoxStateContext);
  // Emptying the box after a taken entry is a text change, which React Aria answers by opening the list again while the
  // field has the focus; that one opening is closed. Any key or press of the person's own ends it.
  const cleared = useRef(false);
  useEffect(() => {
    if (!cleared.current || !state) return;
    if (state.inputValue !== '') { cleared.current = false; return; }
    if (state.isOpen) { cleared.current = false; state.close(); }
  });
  const onKeyDownCapture = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') cleared.current = false;
    if (!onCommitText || !state || e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    const text = (e.target as HTMLInputElement).value ?? '';
    if (text.trim() === '' || text === picked) return;
    if (state.isOpen && state.selectionManager.focusedKey != null) return;
    e.preventDefault();
    e.stopPropagation();
    if (onCommitText(text)) { state.setInputValue(''); cleared.current = true; }
    state.close();
  };
  // A press on the field itself opens the list, as the focus did before free entry (the show button toggles it).
  const onPointerDownCapture = (e: PointerEvent<HTMLDivElement>) => {
    cleared.current = false;
    if (!state || state.isOpen || e.button !== 0 || !(e.target instanceof HTMLInputElement) || e.target.disabled) return;
    state.open(null, 'manual');
  };
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!onCommitText || !state) return;
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    const text = e.currentTarget.querySelector('input')?.value ?? '';
    if (picked !== '' && text === picked) return;
    if (onCommitText(text) && text !== '') state.setInputValue('');
  };
  return (
    <div
      className={s.combo}
      onKeyDownCapture={onCommitText ? onKeyDownCapture : undefined}
      onPointerDownCapture={onCommitText ? onPointerDownCapture : undefined}
      onBlur={onCommitText ? onBlur : undefined}
    >
      {children}
    </div>
  );
}

export interface EntityPickerProps<V extends string> extends Omit<ComboboxProps<V>, 'options'> {
  /** The choices, from the page's query; undefined while loading. */
  options: readonly Option<V>[] | undefined;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
}

/** A Combobox over entities from a query (computers, realms, bots): loading and error inline. With `onCommitText` the
 *  field stays open for typing while the list loads or cannot be read. */
export function EntityPicker<V extends string>({ options, isLoading, error, onRetry, description, ...rest }: EntityPickerProps<V>) {
  const t = useStrings(kitStrings);
  const ts = useStrings(stateStrings);
  // The compact ErrorState's parts (a `<p role=alert>` does not belong in a description): the rejection's mapped
  // words and Details. Facts that say pending are the pending state (C9): its title, and Check again (a read again).
  const info = useErrorInfo(error);
  const pending = pendingFacts(info);
  // The status sits inside the ComboBox, whose ButtonContext names and wires its own trigger button: cleared here so
  // Try again and Details stay their own buttons.
  const status = error ? (
    <ButtonContext.Provider value={null}>
      <span className={s.pickerStatus}>
        <Icon name="warn" size="sm" />
        {pending ? t('outcome.pending.title') : t('picker.error')}
        {info && <span>{errorSentence(info, undefined, ts)}</span>}
        {onRetry && (
          <TextButton onPress={onRetry}>{pending ? t('outcome.pending.check') : t('action.retry')}</TextButton>
        )}
        {info && <ErrorDetails error={info} mode="button" />}
      </span>
    </ButtonContext.Provider>
  ) : isLoading || !options ? (
    <span className={s.pickerStatus}>
      <Spinner />
      {t('picker.loading')}
    </span>
  ) : null;
  return <Combobox {...rest} options={options ?? []} isDisabled={rest.isDisabled || (!options && !rest.onCommitText)} description={status ?? description} />;
}
