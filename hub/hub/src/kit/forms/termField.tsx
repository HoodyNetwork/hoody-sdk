// The terminal side of kit fields, shared by every forms/controls sibling (never imported by web code):
// - FieldFrame: label line (required mark, read-only / unavailable words), the control, the description or the error.
//   Every state reads in mono: a mark or a word, never a colour alone.
// - The terminal Form context: implicit submission (Enter in a single-line field), server field errors by name, and
//   native-style validation (a required or validate() error shows after a submit attempt or after the field is left
//   with a change, then follows edits; a page's own error shows at once and never blocks the submit), as React Aria does.
// - domKey: a terminal key as the slice of a DOM KeyboardEvent the web handlers read (onKeyDown props).
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Text, useFocusControl, useFocusWithin, type Colour, type Key } from '../../term/prim';
import type { BoxRenderable } from '../../term/prim/otui';
import { useStrings } from '../strings';
import type { FieldWidth } from './fields';
import ts from './term.strings.en.json';
import { textOf, type Sem } from '../../term/prim/semantics';
import { submitRawForm, useEnclosingRawForm, useRawFormSubmitter } from '../../term/jsx/dom';
import { useStyleResolver } from '../../term/jsx/style';

/** --field-w-* (8, 15, 22.5, 30 rem) in cells; `full` and none fill the row. */
export const FIELD_CELLS: Readonly<Record<FieldWidth, number | undefined>> = { xs: 16, sm: 30, md: 45, lg: 60, full: undefined };

/** A node as text: strings and numbers through Text, elements as they are, nothing for empty. */
export function say(n: ReactNode, colour: Colour = 'muted'): ReactNode {
  if (n === undefined || n === null || n === false || n === '') return null;
  return typeof n === 'string' || typeof n === 'number' ? <Text colour={colour}>{String(n)}</Text> : n;
}

export interface FrameProps {
  label?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  description?: ReactNode;
  /** Shown instead of the description; marked ✗. */
  error?: ReactNode;
  /** Keep the error line's row even without an error. */
  reserveError?: boolean;
  width?: FieldWidth;
  /** The page's class on the field. Only its flex-grow is read: a field the web grows to fill its row (Home's Ask
   *  input, `flex: 1`) fills it here too; any other property of the class stays web-only. */
  className?: string;
  /** No FIELD_MIN: the control is a button whose width is its content (a Select's trigger), not a text input. It
   *  shrinks with the room it is given and cuts its text with "…". */
  fit?: boolean;
  children: ReactNode;
}

/** The narrowest an unsized field is drawn: the web's input keeps its intrinsic width (size=20, about 20ch) in a row
 *  that wraps (tunnels Setup: Host and Port side by side), so a short value is never cut to its label's width ("│ 00"
 *  for 3000). The 2 extra cells are the control row's rule and gap. A sized field takes its width instead; a Select
 *  (`fit`) has no such minimum on the web either: in less room than this it must cut its label and keep its ▾. */
export const FIELD_MIN = 22;

// Read by the Scroll prim's focus scroll (`revealTarget`, REVEAL_FRAME in term/prim/Scroll.ts).
const markRevealFrame = (n: unknown): void => { if (n) (n as Record<string, unknown>).hxRevealFrame = true; };

type Scrolling = { parent?: Scrolling | null; height?: number; hxFollowFocus?: boolean; viewport?: { height?: number }; scrollChildIntoView?: (n: unknown, o: { align: 'nearest' }) => void };

/** An error line that appears under a field holding the focus is brought into view with the field. The focus scroll
 *  ran when the focus arrived, before the line was drawn (a submit marks the field invalid and focuses it), so at 80x24
 *  a stacked field stayed in view while its error fell under the fold (computers create-name-error). Once the line is
 *  laid out, the nearest scroll that follows the focus brings the whole frame into view, as it does on arrival
 *  (revealTarget: only a frame that fits its viewport). */
function useRevealError(box: { current: BoxRenderable | null }, hasError: boolean): void {
  const inside = useRef(false);
  const focus = useFocusControl();
  useFocusWithin(box, (now) => { inside.current = now; });
  useEffect(() => {
    if (!hasError) return;
    const id = setTimeout(() => {
      const n = box.current as unknown as Scrolling | null;
      // An autofocused field held the focus before the watch above began, so the store is asked as well.
      if (!n || !(inside.current || focus.containsFocus(box.current))) return;
      for (let p = n.parent ?? null; p; p = p.parent ?? null) {
        if (typeof p.scrollChildIntoView !== 'function') continue;
        const view = p.viewport?.height;
        if (p.hxFollowFocus === true && (view === undefined || (n.height ?? 0) <= view)) {
          try { p.scrollChildIntoView(n, { align: 'nearest' }); } catch { /* gone mid-scroll */ }
        }
        return;
      }
    }, 0);
    return () => clearTimeout(id);
  }, [hasError, box, focus]);
}

export function FieldFrame({ label, required, disabled, readOnly, description, error, reserveError, width, className, fit, children }: FrameProps) {
  const t = useStrings(ts);
  const resolve = useStyleResolver();
  const classes = typeof className === 'string' ? className.split(/\s+/).filter(Boolean) : [];
  const box = resolve && classes.length > 0 ? resolve({ tag: 'div', classes, attrs: {}, empty: false }, [])?.box : undefined;
  const rawGrow = (box?.raw as { flexGrow?: unknown } | undefined)?.flexGrow;
  const grow = typeof box?.grow === 'number' ? box.grow : typeof rawGrow === 'number' ? rawGrow : undefined;
  const cells = width ? FIELD_CELLS[width] : undefined;
  const marks = [required ? t('field.requiredMark') : null, readOnly ? t('field.readOnly') : null, disabled ? t('field.disabled') : null].filter(Boolean);
  const hasError = error !== undefined && error !== null && error !== false && error !== '';
  const frame = useRef<BoxRenderable | null>(null);
  const frameRef = useCallback((n: BoxRenderable | null) => { frame.current = n; markRevealFrame(n); }, []);
  useRevealError(frame, hasError);
  return (
    // A width sizes the control; the label, description and error may run past it (a 16-cell field would fold its
    // error into a column of words).
    // A reveal frame: focus landing in the control brings the label (and the description under it) into view with it.
    // An unsized field gives way down to FIELD_MIN in a row narrower than its own width (its input shrinks, a suffix
    // stays whole): at its own width it ran past the row and the card's edge cut its suffix ("[Suggest anoth│").
    // A sized field with an error is never wider than the row it is in: the error may run past the control, but one
    // that ran past the row's end was cut there (the VM ports drawer at 80 columns: "…is already used by the VM web-1.
    // Pic"); held to the row, it wraps under its mark.
    <Box dir="column" shrink={cells || fit ? 0 : 1} {...(cells && hasError ? { maxWidth: '100%' } : {})} boxRef={frameRef} {...(cells || fit ? {} : { minWidth: FIELD_MIN })} {...(grow ? { grow } : {})}>
      {label !== undefined && label !== null && label !== '' && (
        <Text colour={disabled ? 'faint' : 'ink'} truncate>
          {label}
          {required ? <Text colour="danger"> *</Text> : null}
          {marks.length > 0 ? <Text colour="faint">{` (${marks.join(', ')})`}</Text> : null}
        </Text>
      )}
      {cells ? <Box dir="row"><Box width={cells} maxWidth="100%" shrink={1}>{children}</Box></Box> : children}
      {hasError ? (
        // Hanging indent: a wrapped error continues under its text, not under the mark.
        <Box dir="row"><Text colour="danger" shrink={0}>{'✗ '}</Text><Text colour="danger" grow={1} shrink={1}>{error}</Text></Box>
      ) : (
        <>
          {say(description)}
          {reserveError && <Text> </Text>}
        </>
      )}
    </Box>
  );
}

/** The control row: a left rule that marks focus (┃, focus tone) and invalid (┃, danger tone; invalid keeps the colour
 *  while focused); idle │. Never the half block ▌: beside the caret cell before a placeholder it read as a second caret
 *  ("▌ ▌https://"). In mono the one ✗ error line under the field carries invalid (the gutter is never a
 *  second ✗); focus shows in mono by the heavy rule and the caret. */
export function ControlRow({ focused, invalid, disabled, children }: { focused: boolean; invalid?: boolean; disabled?: boolean; children: ReactNode }) {
  const c: Colour = invalid ? 'danger' : focused ? 'focus' : disabled ? 'line' : 'lineStrong';
  return (
    <Box dir="row" shrink={1} grow={1}>
      <Text colour={c}>{focused || invalid ? '┃' : '│'}</Text>
      {/* Shrinks with the row, so a truncating text inside it cuts with "…" (a picker trigger giving way). */}
      <Box dir="row" grow={1} shrink={1} minWidth={0} gap={1} pad={{ left: 1 }}>
        {children}
      </Box>
    </Box>
  );
}

/** A field's semantics as React Aria gives its control: named by the label, described by the description or, while
 *  invalid, by the error text; required and invalid as states. */
export function fieldSem(o: { label?: ReactNode; description?: ReactNode; error?: ReactNode; invalid?: boolean; required?: boolean }): Sem {
  const words = (n: ReactNode): string | undefined => (n === undefined || n === null || n === false || n === '' ? undefined : typeof n === 'string' ? n : textOf(n) || undefined);
  return {
    name: words(o.label) ?? '',
    description: o.invalid ? undefined : words(o.description),
    invalid: o.invalid || undefined,
    errorText: o.invalid ? words(o.error) : undefined,
    required: o.required || undefined,
  };
}

// ── Form ─────────────────────────────────────────────────────────────────────

export interface FieldCheck {
  /** True when the field's own rules (required, validate) refuse its value now. */
  invalid(): boolean;
  /** Show the field's current validation (a submit was tried). */
  commit(): void;
  focus(): void;
}

export interface TermForm {
  /** Validates, then calls the Form's onSubmit unless locked. From useTermForm (Enter in a field) it is the implicit
   *  submission: nothing at all while the form's default submit button is off. False when nothing was submitted (that
   *  button off, or a field invalid: a browser fires no submit event, and onSubmitted hears nothing). */
  submit(): boolean;
  errors: Readonly<Record<string, string>>;
  register(check: { current: FieldCheck }): () => void;
  /** Hears each submit of the form, whatever sent it (Enter, a submit button, requestSubmit): the browser's submit
   *  event, fired before the form's onSubmit, also while the form is locked; never for a submit refused (the default
   *  button off, a field invalid). The same function for the form's life. Returns the unsubscribe. */
  onSubmitted(fn: () => void): () => void;
}

/** The kit Form's side (TermFormContext): its `submit` is the explicit one (a submit button, requestSubmit). */
export interface TermFormHost extends TermForm {
  /** A submit button of the form, in mount order; `off()` (disabled or busy) is read at each Enter. The same function
   *  for the Form's whole life, so a new host (a new `fieldErrors` object) keeps every button registered. */
  submitter(off: () => boolean): () => void;
  /** Enter in a field: nothing (false) while the default (first) submit button is off, as in a browser; else submit(). */
  implicit(): boolean;
}

export const TermFormContext = createContext<TermFormHost | null>(null);
const NO_ERRORS: Readonly<Record<string, string>> = {};
const NO_REGISTER = (): (() => void) => () => undefined;
/** The form a field submits on Enter, by implicit submission as a browser does (nothing while the form's default submit
 *  button is off): the kit Form around it, else a raw `<form>` a page wrote (it has no field registry, so it validates
 *  nothing here), else none. */
export const useTermForm = (): TermForm | null => {
  const kit = useContext(TermFormContext);
  const raw = useEnclosingRawForm();
  return useMemo<TermForm | null>(
    () => (kit ? { submit: () => kit.implicit(), errors: kit.errors, register: (c) => kit.register(c), onSubmitted: kit.onSubmitted } : raw ? { submit: () => raw.implicit(), errors: NO_ERRORS, register: NO_REGISTER, onSubmitted: raw.onSubmitted } : null),
    [kit, raw],
  );
};

/** What a `type="submit"` button submits: the raw form named by `form` (HTML's form attribute), else the kit Form around
 *  it, else the raw `<form>` around it. Called after the button's own onPress, as the browser submits after the click. */
export function useSubmitTarget(type: string | undefined, formId: string | undefined, off: () => boolean = () => false): (submitter?: unknown) => void {
  // A press is an explicit submit (never the Enter rule useTermForm applies to fields): the kit Form, else the raw form.
  const kit = useContext(TermFormContext);
  const raw = useEnclosingRawForm();
  // A submit button is one of its raw form's submitters: the first one is the default button, and while it is off
  // (disabled or busy) Enter in the form's fields submits nothing, as in a browser. The same holds in the kit Form around
  // it (unless `form` names a raw form).
  useRawFormSubmitter(off, formId, type === 'submit');
  const liveOff = useRef(off);
  liveOff.current = off;
  // A field may submit in an effect of the same commit (NumberField's deferred Enter): the button is registered in a
  // layout effect, so it is in the Form before any effect runs, even when that commit mounts it afresh. Keyed on the
  // Form's registrar, not its host: a new host (a page's inline fieldErrors) keeps it registered.
  const enroll = kit?.submitter;
  useLayoutEffect(() => (enroll && type === 'submit' && !formId ? enroll(() => liveOff.current()) : undefined), [enroll, type, formId]);
  return useCallback((submitter?: unknown) => {
    if (type !== 'submit') return;
    if (formId) { submitRawForm(formId, submitter); return; }
    if (kit) kit.submit();
    else raw?.submit(submitter);
  }, [type, formId, kit, raw]);
}

/** The Form's side: hand this to TermFormContext. */
export function useTermFormHost(onSubmit: () => void, locked: boolean, errors: Readonly<Record<string, string>> | undefined): TermFormHost {
  const fields = useRef(new Set<{ current: FieldCheck }>());
  const submitters = useRef(new Set<() => boolean>());
  const latest = useRef({ onSubmit, locked });
  latest.current = { onSubmit, locked };
  const errs = useMemo(() => errors ?? {}, [errors]);
  const submitter = useCallback((off: () => boolean) => { submitters.current.add(off); return () => { submitters.current.delete(off); }; }, []);
  const heard = useRef(new Set<() => void>());
  const onSubmitted = useCallback((fn: () => void) => { heard.current.add(fn); return () => { heard.current.delete(fn); }; }, []);
  return useMemo<TermFormHost>(() => {
    const submit = (): boolean => {
      let first: FieldCheck | null = null;
      for (const c of fields.current) {
        c.current.commit();
        if (!first && c.current.invalid()) first = c.current;
      }
      if (first) { first.focus(); return false; }
      // The submit event: a browser fires it before the form's own handler, which then ignores a locked form.
      for (const fn of [...heard.current]) fn();
      if (latest.current.locked) return true;
      latest.current.onSubmit();
      return true;
    };
    return {
      errors: errs,
      register(c) { fields.current.add(c); return () => { fields.current.delete(c); }; },
      submitter,
      onSubmitted,
      submit,
      implicit() {
        const first = submitters.current.values().next();
        if (!first.done && first.value()) return false;
        return submit();
      },
    };
  }, [errs, submitter, onSubmitted]);
}

type Validate<V> = (value: V) => string | string[] | true | null | undefined;

export interface ValidationInput<V> {
  name?: string;
  value: V;
  empty: boolean;
  isRequired?: boolean;
  validate?: Validate<V>;
  isInvalid?: boolean;
  /** The page's error text (also makes the field invalid, shown at once). */
  errorMessage?: ReactNode;
  validationBehavior?: 'native' | 'aria';
  focus(): void;
}

/** One field's validation, as React Aria shows it. Call `left(changed)` when the focus leaves the field. */
export function useValidation<V>(o: ValidationInput<V>): { error: ReactNode; invalid: boolean; left: (changed: boolean) => void } {
  const t = useStrings(ts);
  const form = useTermForm();
  const ownErrors = (): string[] => {
    const out: string[] = [];
    if (o.isRequired && o.empty) out.push(t('field.required'));
    const v = o.validate?.(o.value);
    if (typeof v === 'string' && v) out.push(v);
    else if (Array.isArray(v)) out.push(...v.filter(Boolean));
    return out;
  };
  const realtime = ownErrors();
  // A server error by name stays until the value changes from what it was when the error arrived.
  const server = o.name ? form?.errors[o.name] : undefined;
  const seen = useRef<{ msg: string | undefined; at: V } | null>(null);
  if (seen.current?.msg !== server) seen.current = { msg: server, at: o.value };
  const serverShown = server && Object.is(seen.current!.at, o.value) ? server : undefined;
  const aria = o.validationBehavior === 'aria' || Boolean(o.errorMessage) || o.isInvalid === true;
  const [committed, setCommitted] = useState<string[] | null>(null);
  const latest = useRef({ realtime, o });
  latest.current = { realtime, o };
  const check = useRef<FieldCheck>({ invalid: () => false, commit: () => {}, focus: () => {} });
  check.current = {
    invalid: () => !aria && latest.current.realtime.length > 0,
    commit: () => setCommitted(latest.current.realtime),
    focus: () => latest.current.o.focus(),
  };
  // In a layout effect: a new form host (a page's inline fieldErrors) re-registers every field before any passive effect
  // of that commit runs, so NumberField's submit there sees a required field drawn after it.
  useLayoutEffect(() => form?.register(check), [form]);
  // Once shown, the error follows each edit (React Aria commits on change after the first display).
  const shownNative = committed === null ? [] : committed.length > 0 ? realtime : [];
  const left = useCallback((changed: boolean) => { if (changed) setCommitted(latest.current.realtime); }, []);
  const pageInvalid = o.isInvalid === true || Boolean(o.errorMessage);
  const list = serverShown ? [serverShown] : aria ? (pageInvalid ? [] : realtime) : shownNative;
  const invalid = Boolean(serverShown) || pageInvalid || list.length > 0;
  const error: ReactNode = !invalid ? null : (o.errorMessage || (list.length ? list.join(' ') : null));
  return { error, invalid, left };
}

// ── Keys ─────────────────────────────────────────────────────────────────────

const DOM_KEY: Readonly<Record<string, string>> = {
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', return: 'Enter', linefeed: 'Enter', kpenter: 'Enter',
  escape: 'Escape', tab: 'Tab', backspace: 'Backspace', delete: 'Delete', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown', space: ' ',
};

export interface DomKeyLike {
  key: string;
  code: string;
  keyCode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  repeat: boolean;
  defaultPrevented: boolean;
  nativeEvent: { isComposing: boolean };
  preventDefault(): void;
  stopPropagation(): void;
  continuePropagation(): void;
  isPropagationStopped(): boolean;
}

/** A terminal key as the DOM KeyboardEvent fields web handlers read; `taken()` says whether the handler prevented it. */
export function domKey(k: Key): { event: DomKeyLike; taken: () => boolean } {
  let prevented = false;
  const key = DOM_KEY[k.name] ?? (k.sequence && k.sequence.length === 1 && k.sequence >= ' ' ? k.sequence : k.name);
  const event: DomKeyLike = {
    key, code: key, keyCode: 0, ctrlKey: !!k.ctrl, metaKey: !!k.super, shiftKey: !!k.shift, altKey: !!k.meta, repeat: false,
    get defaultPrevented() { return prevented; },
    nativeEvent: { isComposing: false },
    preventDefault() { prevented = true; },
    stopPropagation() {},
    continuePropagation() {},
    isPropagationStopped: () => false,
  };
  return { event, taken: () => prevented };
}

/** A FocusEvent-shaped object for onFocus/onBlur props (handlers here read nothing from it but its type). */
export const FOCUS_EVENT = { type: 'focus', target: null, currentTarget: null, relatedTarget: null, preventDefault() {}, stopPropagation() {}, continuePropagation() {} } as never;
