// Fields in the terminal: a label line, the control behind a left rule (▌ focused, ✗ invalid, │ idle), then its
// description or its error. Same props and callbacks as the web fields; validation as React Aria shows it (termField).
import { createContext, useContext, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import type * as Web from './fields';
import { useToggleState } from 'react-stately/useToggleState';
import { Box, Pressable, Text, useKeys } from '../../term/prim';
import { searchFieldMounted } from '../../term/prim/searchPresence';
import { focusInk } from '../../term/prim/FocusInk';
import { FieldInput, type FieldHandle } from '../../term/prim/FieldInput';
import { textOf } from '../../term/prim/semantics';
import { Button } from '../controls/Button';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import { useFieldLock } from './lock';
import { useWipeOn } from './wipe';
import { ControlRow, FIELD_CELLS, FOCUS_EVENT, FieldFrame, domKey, fieldSem, say, useTermForm, useValidation } from './termField';

export type { FieldWidth, FieldChrome, TextFieldProps, FieldRule, SearchFieldProps, SwitchProps, CheckboxProps, FieldsetProps, CheckboxGroupProps } from './fields';

/** On the web a class name; here the field's width is the frame's own prop, so this names the width. */
export const fieldWidthClass: typeof Web.fieldWidthClass = (width) => (width ? `w_${width}` : undefined);

/** What an inputRef holds here: focus(), the value, and setSelectionRange(start, end), which puts the caret at `end` (a
 *  terminal field holds no range selected from code: the web's usual call is a collapsed range, the caret after text a
 *  page just added). The rest of an element is absent. */
/** The members of an element a terminal field implements (typed, so a page calling one gets the DOM's signature). */
type ElementPart = Pick<HTMLInputElement & HTMLTextAreaElement, 'focus' | 'select' | 'blur' | 'value' | 'setSelectionRange'>;
function elementLike(handle: { current: FieldHandle | null }, value: () => string): HTMLInputElement & HTMLTextAreaElement {
  const part: ElementPart = {
    focus: () => handle.current?.focus(), select: () => handle.current?.focus(), blur: () => {}, get value() { return value(); },
    setSelectionRange: (_start, end) => { handle.current?.setCaret?.(end ?? value().length); },
  };
  // The ref's declared type is the whole element (the web contract); the members above are all a page may use here.
  return part as HTMLInputElement & HTMLTextAreaElement;
}

/** Controlled or not, the value a field shows and the setter that tells the caller. */
function useFieldValue(value: string | undefined, defaultValue: string | undefined, onChange: ((v: string) => void) | undefined): [string, (v: string) => void] {
  const [own, setOwn] = useState(defaultValue ?? '');
  const controlled = value !== undefined;
  return [controlled ? value : own, (v) => { if (!controlled) setOwn(v); onChange?.(v); }];
}

export const TextField: typeof Web.TextField = (props) => {
  const { label, description, errorMessage, placeholder, multiline, rows = 4, mono, prefix, suffix, focusOnError, reserveError, width, inputRef, action } = props;
  const isDisabled = useFieldLock(props.isDisabled);
  const [value, setValue] = useFieldValue(props.value, props.defaultValue, props.onChange);
  const handle = useRef<FieldHandle | null>(null);
  const latestValue = useRef(value);
  latestValue.current = value;
  useImperativeHandle(inputRef as Ref<HTMLInputElement & HTMLTextAreaElement> | undefined, () => elementLike(handle, () => latestValue.current), []);
  const [focused, setFocused] = useState(false);
  const atFocus = useRef(value);
  const v = useValidation({
    name: props.name, value, empty: value === '', isRequired: props.isRequired, validate: props.validate,
    isInvalid: props.isInvalid, errorMessage, validationBehavior: props.validationBehavior, focus: () => handle.current?.focus(),
  });
  const hadError = useRef(false);
  useEffect(() => {
    if (focusOnError && errorMessage && !hadError.current) handle.current?.focus();
    hadError.current = Boolean(errorMessage);
  }, [errorMessage, focusOnError]);
  // A password field is secret entry: cleared when its context ends (route, realm, sign-out), like SecretInput.
  // So is a one-time code typed as text (autoComplete="one-time-code": the account's "6-digit code or backup code"):
  // a credential (term/docs/forms.md, secrets rules 2 and 3), masked as typed and only "typed or not" in the semantics.
  // The value shown and its setter (useFieldValue), so an uncontrolled field (defaultValue) is cleared too.
  const secret = props.type === 'password' || props.autoComplete === 'one-time-code';
  const latest = useRef({ value, setValue });
  latest.current = { value, setValue };
  // The field also forgets its undo, redo and caret on each wipe (FieldInput `wipe`), even when the value is already
  // empty: what was typed and deleted before the wipe must not come back by undo.
  const [wipes, setWipes] = useState(0);
  useWipeOn(() => { setWipes((n) => n + 1); if (latest.current.value) latest.current.setValue(''); }, undefined, secret);
  const form = useTermForm();
  const control = (
    <ControlRow focused={focused} invalid={v.invalid} disabled={isDisabled}>
      {say(prefix, 'faint')}
      <FieldInput
        handle={handle}
        value={value}
        onChange={setValue}
        placeholder={placeholder}
        // The web's empty field is a box: here a faint rule across the room, so it never reads as a stray gutter "│".
        emptyFill="_"
        disabled={isDisabled}
        readOnly={props.isReadOnly === true}
        mask={secret}
        wipe={wipes}
        maxLength={props.maxLength}
        lines={multiline ? rows : 1}
        keepRows={props.keepRows === true}
        autoFocus={props.autoFocus}
        colour={mono ? 'ink' : undefined}
        sem={fieldSem({ label: label || props['aria-label'], description, error: v.error, invalid: v.invalid, required: props.isRequired })}
        onSubmit={() => form?.submit()}
        onKey={props.onKeyDown ? (k) => { const d = domKey(k); props.onKeyDown!(d.event as never); return d.taken(); } : undefined} // contract-any: a DOM-shaped key slice, not a KeyboardEvent
        onFocusChange={(f) => {
          setFocused(f);
          if (f) { atFocus.current = latestValue.current; props.onFocus?.(FOCUS_EVENT); props.onFocusChange?.(true); }
          else { v.left(atFocus.current !== latestValue.current); props.onBlur?.(FOCUS_EVENT); props.onFocusChange?.(false); }
        }}
      />
      {say(suffix, 'faint')}
    </ControlRow>
  );
  return (
    <FieldFrame label={label} required={props.isRequired} disabled={isDisabled} readOnly={props.isReadOnly} description={description} error={v.error} reserveError={reserveError} width={width} className={props.className}>
      {action ? (
        <Box dir="row" gap={1} wrap>
          <Box grow={1} minWidth={16}>{control}</Box>
          <Button variant="secondary" busy={action.busy} isDisabled={Boolean(action.disabledReason)} disabledReason={action.disabledReason} tone={action.tone} onPress={() => action.onPress()}>
            {action.label}
          </Button>
        </Box>
      ) : control}
    </FieldFrame>
  );
};

/** A live rule checklist: ○ until met, then ✓ (a mark, so it reads without colour). */
export const RuleChecklist: typeof Web.RuleChecklist = ({ rules, label }) => (
  <Box dir="column" shrink={0}>
    {label ? <Text colour="muted">{label}</Text> : null}
    {rules.map((r) => (
      <Text key={r.id} colour={r.met ? 'ok' : 'muted'}>{r.met ? '✓' : '○'} {r.label}</Text>
    ))}
  </Box>
);

// The page search: `/` focuses the newest search field mounted (the shell's data-hub-search rule on the web).
const searches: Array<{ current: FieldHandle | null }> = [];

const SEARCH_MIN_CELLS = 25;
const SEARCH_MAX_CELLS = 45;
export const SearchField: typeof Web.SearchField = ({ placeholder, label, width, inputRef, ...rest }) => {
  const t = useStrings(kitStrings);
  const isDisabled = useFieldLock(rest.isDisabled);
  const [value, setValue] = useFieldValue(rest.value, rest.defaultValue, rest.onChange);
  const handle = useRef<FieldHandle | null>(null);
  const latestValue = useRef(value);
  latestValue.current = value;
  useImperativeHandle(inputRef as Ref<HTMLInputElement> | undefined, () => elementLike(handle, () => latestValue.current), []);
  useEffect(() => { searches.push(handle); const gone = searchFieldMounted(); return () => { gone(); const i = searches.indexOf(handle); if (i >= 0) searches.splice(i, 1); }; }, []);
  useKeys((k) => {
    if (isDisabled || k.ctrl || k.meta || k.sequence !== '/' || searches[searches.length - 1] !== handle) return false;
    handle.current?.focus();
    return true;
  });
  const [focused, setFocused] = useState(false);
  const clear = (): void => { setValue(''); rest.onClear?.(); };
  const cells = width ? FIELD_CELLS[width] : undefined;
  // As the web's .search: without a width it grows to fill its row (flex: 1) between 200px and --search-max-w (360px),
  // here 25 to 45 cells, so a placeholder like "Search models and providers" is not cut in a drawer.
  return (
    <Box dir="row" {...(cells ? { width: cells, shrink: 0 } : width === 'full' ? { grow: 1 } : { grow: 1, shrink: 1, minWidth: SEARCH_MIN_CELLS, maxWidth: SEARCH_MAX_CELLS })}>
      <ControlRow focused={focused} invalid={rest.isInvalid} disabled={isDisabled}>
        <Text colour="faint">/</Text>
        <FieldInput
          handle={handle}
          value={value}
          onChange={setValue}
          placeholder={placeholder ?? t('search.placeholder')}
          disabled={isDisabled}
          readOnly={rest.isReadOnly === true}
          maxLength={rest.maxLength}
          // React Aria names it by `label` (else "Search"): an aria-label, never a drawn label.
          sem={{ ...fieldSem({ label: label ?? t('search.label'), invalid: rest.isInvalid, required: rest.isRequired }), role: 'searchbox' }}
          autoFocus={rest.autoFocus}
          onSubmit={(v) => { if (!rest.isReadOnly) rest.onSubmit?.(v); }}
          // Escape clears a field with text (React Aria's SearchField); an empty one lets Escape go on.
          onKey={(k) => {
            if (rest.onKeyDown) { const d = domKey(k); rest.onKeyDown(d.event as never); if (d.taken()) return true; } // contract-any: a DOM-shaped key slice
            if (k.name === 'escape' && latestValue.current !== '' && !rest.isReadOnly) { clear(); return true; }
            return false;
          }}
          onFocusChange={(f) => { setFocused(f); if (f) rest.onFocus?.(FOCUS_EVENT); else rest.onBlur?.(FOCUS_EVENT); rest.onFocusChange?.(f); }}
        />
        {/* Out of the Tab order, as on the web: a click clears (never a read-only field: it has no ×). Its cell is kept while empty, so typing never moves the field. */}
        <Box width={1} shrink={0} onPress={value !== '' && !isDisabled && !rest.isReadOnly ? () => clear() : undefined}><Text colour="faint">{value !== '' && !isDisabled && !rest.isReadOnly ? '×' : ' '}</Text></Box>
      </ControlRow>
    </Box>
  );
};

/** The switch's mark: [■ on ] / [ off □]: the word carries the state, the colour only repeats it. */
function SwitchMark({ on, focused, disabled }: { on: boolean; focused: boolean; disabled: boolean }) {
  return (
    <Text colour={disabled ? 'faint' : on ? 'ok' : 'muted'} dim={disabled} {...focusInk(focused)}>
      {on ? '[■ on ]' : '[□ off]'}
    </Text>
  );
}

export const Switch: typeof Web.Switch = ({ label, labelHidden, description, disabledReason, ...rest }) => {
  // Why a disabled switch cannot change: read with its description and drawn under it (the web shows it as a tip).
  const why = rest.isDisabled && disabledReason ? disabledReason : undefined;
  const isDisabled = useFieldLock(rest.isDisabled);
  const readOnly = rest.isReadOnly === true;
  // React Stately's toggle state (the web's): controlled/uncontrolled, onChange(next), read-only refuses.
  const state = useToggleState({ isSelected: rest.isSelected, defaultSelected: rest.defaultSelected, onChange: rest.onChange, isReadOnly: readOnly });
  const on = state.isSelected;
  const toggle = (): void => state.toggle();
  // Named as the web names it: an aria-label wins over the drawn label (a row's "On"/"Off" word names no setting).
  // The pressable is as wide as what it draws (alignSelf start): a column stretches its children, so in a stacked
  // setting row a click on the blank rest of the line toggled the switch (the web's switch label is inline-flex).
  return (
    <Box dir="column" shrink={0}>
      <Pressable dir="row" gap={1} shrink={0} alignSelf="start" disabled={isDisabled} autoFocus={rest.autoFocus} onPress={toggle}
        sem={{ role: 'switch', name: rest['aria-label'] || textOf(label) || undefined, labelledBy: rest.labelledBy, checked: on, readonly: readOnly || undefined, description: [typeof description === 'string' ? description : undefined, why].filter(Boolean).join(' ') || undefined }}>
        {({ focused }) => (
          <>
            <SwitchMark on={on} focused={focused} disabled={isDisabled} />
            {label !== undefined && !labelHidden ? <Text colour={isDisabled ? 'faint' : 'ink'}>{label}</Text> : null}
          </>
        )}
      </Pressable>
      {description ? <Box pad={{ left: 8 }}>{say(description)}</Box> : null}
      {why ? <Box pad={{ left: 8 }}><Text colour="faint">{why}</Text></Box> : null}
    </Box>
  );
};

/** The value list a CheckboxGroup shares with the Checkboxes inside it (each takes part by its `value`). */
interface CheckboxGroupState {
  value: readonly string[];
  toggle: (value: string) => void;
  disabled: boolean;
  readOnly: boolean;
}
const CheckboxGroupContext = createContext<CheckboxGroupState | null>(null);

export const Checkbox: typeof Web.Checkbox = ({ label, description, ...rest }) => {
  const group = useContext(CheckboxGroupContext);
  // In a group, a checkbox with a value is one entry of the group's list: the group holds whether it is ticked.
  const member = group !== null && typeof rest.value === 'string' ? rest.value : null;
  const isDisabled = useFieldLock(rest.isDisabled || group?.disabled);
  const state = useToggleState({
    isSelected: member !== null && group ? group.value.includes(member) : rest.isSelected,
    defaultSelected: rest.defaultSelected,
    onChange: member !== null && group ? (next) => { group.toggle(member); rest.onChange?.(next); } : rest.onChange,
    isReadOnly: rest.isReadOnly === true || group?.readOnly === true,
  });
  const on = state.isSelected;
  const mixed = rest.isIndeterminate === true;
  const v = useValidation({ name: rest.name, value: on, empty: !on, isRequired: rest.isRequired, validate: rest.validate, isInvalid: rest.isInvalid, validationBehavior: rest.validationBehavior, focus: () => {} });
  // Indeterminate is a look over the stored value: a press flips that value, as the web's native checkbox does.
  const toggle = (): void => state.toggle();
  return (
    // Never wider than its parent: in a column that sizes its children to their content (align-items flex-start, the
    // agent sign-in box) the row took its label's whole length and ran past the box (52 cells in 49).
    // As wide as what it draws (alignSelf start), as the Switch: a click on the blank rest of a stretched line never
    // ticks it.
    <Pressable dir="row" gap={1} shrink={0} maxWidth="100%" alignSelf="start" disabled={isDisabled} autoFocus={rest.autoFocus} onPress={toggle}
      sem={{ role: 'checkbox', name: textOf(label as ReactNode) || rest['aria-label'] || '', checked: mixed ? 'mixed' : on, readonly: rest.isReadOnly || undefined,
        invalid: v.invalid || undefined, errorText: typeof v.error === 'string' ? v.error : undefined, description: typeof description === 'string' ? description : undefined }}>
      {({ focused }) => (
        <>
          {/* The mark is one piece; the label beside it wraps (or is cut) when the row is narrow. */}
          <Text shrink={0} colour={isDisabled ? 'faint' : v.invalid ? 'danger' : 'ink'} {...focusInk(focused)}>{mixed ? '[-]' : on ? '[x]' : '[ ]'}</Text>
          {(label || description) && (
            <Box dir="column" shrink={1} minWidth={0}>
              {label ? <Text colour={isDisabled ? 'faint' : 'ink'}>{label}</Text> : null}
              {say(description as ReactNode)}
              {v.error ? <Text colour="danger">✗ {v.error}</Text> : null}
            </Box>
          )}
        </>
      )}
    </Pressable>
  );
};

/** A named set of controls that each keep their own value: the name as a field label, the controls under it, then the
 *  description. */
export const Fieldset: typeof Web.Fieldset = ({ label, description, children }) => (
  <Box dir="column" shrink={0} sem={{ role: 'group', name: label, description: typeof description === 'string' ? description : undefined }}>
    <Text colour="ink" truncate>{label}</Text>
    {children}
    {say(description)}
  </Box>
);

/** A labelled group of checkboxes sharing one value list (controlled by `value`, or its own from `defaultValue`); the
 *  label, description and error are the group's. */
export const CheckboxGroup: typeof Web.CheckboxGroup = ({ label, description, errorMessage, children, columns: _columns, ...rest }) => {
  const isDisabled = useFieldLock(rest.isDisabled);
  const [own, setOwn] = useState<readonly string[]>(rest.defaultValue ?? []);
  const controlled = rest.value !== undefined;
  const value = controlled ? (rest.value as readonly string[]) : own;
  const latest = useRef(value);
  latest.current = value;
  const readOnly = rest.isReadOnly === true;
  const toggle = (v: string): void => {
    if (readOnly || isDisabled) return;
    const next = latest.current.includes(v) ? latest.current.filter((x) => x !== v) : [...latest.current, v];
    if (!controlled) setOwn(next);
    rest.onChange?.(next);
  };
  // The group's own rules (required = at least one ticked, validate over the list), as the terminal Form reads them.
  const validate = rest.validate;
  const v = useValidation<readonly string[]>({
    name: rest.name, value, empty: value.length === 0, isRequired: rest.isRequired, validate: validate ? (list) => validate([...list]) : undefined,
    isInvalid: rest.isInvalid, errorMessage, validationBehavior: rest.validationBehavior, focus: () => {},
  });
  return (
    <CheckboxGroupContext.Provider value={{ value, toggle, disabled: isDisabled, readOnly }}>
      <FieldFrame label={label} required={rest.isRequired} disabled={isDisabled} readOnly={readOnly} description={description} error={v.error}>
        <Box dir="column" shrink={0}
          sem={{ role: 'group', ...fieldSem({ label: label ?? rest['aria-label'], description, error: v.error, invalid: v.invalid, required: rest.isRequired }),
            // No name of its own: the group is named by the element `aria-labelledby` points at (a setting row's label).
            name: (label ?? rest['aria-label']) || undefined, labelledBy: rest['aria-labelledby'], describedBy: rest['aria-describedby'] }}>
          {children}
        </Box>
      </FieldFrame>
    </CheckboxGroupContext.Provider>
  );
};
