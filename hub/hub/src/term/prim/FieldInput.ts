// FieldInput: the one text-entry primitive of kit fields. Four engines behind one set of props:
//  - plain single line: the engine's own input (caret, selection, word jumps, Home/End, bracketed paste, undo);
//  - multiline (`lines` > 1): the engine's textarea (Enter is a new line, as in a web textarea);
//  - masked (`mask`), or read-only on one line: drawn here from the Caret model, so a secret is never in a drawn
//    frame (one bullet per character) and a read-only value can be walked and selected but never changed;
//  - read-only multiline (`readOnly`, `lines` > 1, not masked): the value's own lines, wrapped, in as many rows as
//    they take (one at least, `lines` at most, then they scroll: ReadArea; `keepRows`: always `lines`); it takes the
//    focus and refuses every edit.
// The value is controlled: what the caller holds is what shows (a caller that refuses or rewrites a keystroke wins).
import { createElement, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode, type Ref } from 'react';
import { usePaste } from '@opentui/react';
import type { InputRenderable, TextareaRenderable } from '@opentui/core';
import { el, useRenderer, type BoxRenderable, type CliRenderer } from './otui';
import { Box } from './Box';
import { cutCells, wrapCells } from './TableCells';
import { focusInk } from './FocusInk';
import { Text } from './Text';
import { useFocusable, type Key, type KeyHandler } from './focus';
import { colour, type Colour } from './tokens';
import { mergeRefs, useSem, type Sem } from './semantics';
import { History, actionOf, apply, cellWidth, edit, graphemes, insert, MUTATES, printable, scrollStart, selection, shownOf, type LineEdit } from './Caret';

export interface FieldHandle {
  /** Move the focus into the field. */
  focus(): void;
  /** Put the caret at `at` (UTF-16 units into the value, as the web's setSelectionRange; clamped; any selection
   *  dropped). At or past the value's end it goes after the last character. A text field always has it; a handle that
   *  is not a text field (a Select's list) may not. */
  setCaret?(at: number): void;
}

export interface FieldInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Enter in a single-line field. */
  onSubmit?: (value: string) => void;
  placeholder?: string;
  /** Drawn across the field's room while it is empty, unfocused and has no placeholder (one character, repeated, faint),
   *  so an empty field shows its extent as the web's box does. Drawing only: never in the semantics. Single-line
   *  fields only (a multiline editor keeps its own empty look). */
  emptyFill?: string;
  /** Cells; default: grow into the row. */
  width?: number | `${number}%`;
  grow?: number;
  disabled?: boolean;
  /** Never change: one line is walked and selected; several (`lines` > 1, not masked) are read and scrolled. */
  readOnly?: boolean;
  autoFocus?: boolean;
  /** One bullet per character; the value itself is never drawn. */
  mask?: boolean;
  /** UTF-16 units, like the web's maxLength. */
  maxLength?: number;
  /** Rows: more than 1 is a multiline editor (read-only and not masked: at most this many, sized to the value). */
  lines?: number;
  /** Read-only only for a moment (a send in flight): keep all `lines` rows, so the field does not shrink to its text
   *  and grow back once it is editable again. Multiline, read-only and not masked only. */
  keepRows?: boolean;
  /** Keys before the editor's own: return true to take one (it then never edits). */
  onKey?: KeyHandler;
  onFocusChange?: (focused: boolean) => void;
  handle?: Ref<FieldHandle>;
  colour?: Colour;
  /** Any value; when it changes the field forgets its edits (undo and redo, caret, selection), even when the value is
   *  already empty, so a wiped secret never comes back through undo; a paste still arriving at that moment is dropped.
   *  The caller still empties the value itself. A masked field also forgets when its value is emptied from outside. */
  wipe?: unknown;
  /** What the field is to a reader (name, description, invalid + errorText, required, role 'searchbox' ...): role
   *  textbox, value, disabled, read-only, secret (masked) and multiline come from the field itself. */
  sem?: Sem;
}

/** No limit unless asked: the engine's input cuts at 1000 by default, the web field does not. */
const NO_LIMIT = 1_000_000;
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[@-_]/g;

export function FieldInput(p: FieldInputProps): ReactElement {
  const multi = (p.lines ?? 1) > 1;
  // Read-only over several rows before the one-line drawn field: a `<textarea readOnly rows={10}>` (what Logs Explain
  // sends to the AI helper) drew as one cut line. A masked field never takes it: a secret is only ever bullets.
  if (p.readOnly && multi && !p.mask) return createElement(ReadArea, p);
  if (p.mask || p.readOnly) return createElement(DrawnField, p);
  if (multi) return createElement(AreaField, p);
  return createElement(LineField, p);
}

/** The engine editor's caret put at `at` UTF-16 units of `value` (its offsets count characters, not units: an
 *  astral character is one), clamped; the end is the buffer's end. */
function engineCaret(n: { cursorOffset: number; gotoBufferEnd(): void } | null, value: string, at: number): void {
  if (!n) return;
  const units = Math.max(0, Math.floor(Number.isFinite(at) ? at : value.length));
  if (units >= value.length) { n.gotoBufferEnd(); return; }
  n.cursorOffset = [...value.slice(0, units)].length;
}

/** A faint run of `fill` across the room it is given, cut by its box (never an ellipsis); hidden from the semantics. */
function fillRun(fill: string): ReactElement {
  // Basis 0: the run's own 512 cells never claim room (they would push the gutter out of the row); it grows into what
  // is left. `drops`: the box declares that it cuts the run at its edge, so the layout gate does not report the 512
  // cells as content laid past the box (for example the home customize field "Name (optional)", `cut … 512x1`).
  return createElement(Box, { key: 'fill', basis: 0, grow: 1, shrink: 1, minWidth: 0, clip: true, drops: true, height: 1 },
    createElement(Text, { colour: 'faint', width: FILL_CELLS, shrink: 0, maxLines: 1, sem: { hidden: true } }, fill.repeat(FILL_CELLS)));
}
/** An unfocused value's start, cut at the field's end with one "…" (basis 0: its own width never claims room; the
 *  field's width already does). Hidden from the semantics: the input carries the value. */
function cutRun(p: FieldInputProps): ReactElement {
  return createElement(Box, { key: 'cut', basis: 0, grow: 1, shrink: 1, minWidth: 0, height: 1 },
    createElement(Text, { truncate: true, grow: 1, shrink: 1, colour: p.disabled ? 'faint' : (p.colour ?? 'ink'), sem: { hidden: true } }, p.value));
}
/** Wider than any terminal row a field gets. */
const FILL_CELLS = 512;

/** Renderers holding a drop for the paste that was open at a wipe (one drop at a time). */
const dropping = new WeakSet<object>();

/**
 * A bracketed paste still open in the input parser at a wipe is dropped whole when it ends, whatever field has the
 * focus by then: its text was typed into what was wiped. Its terminator ends it as usual, so the rest never turns into
 * keys. Nothing is read from it. A paste the parser abandons instead (a suspend or a parse error resets it) never
 * ends: the drop is disarmed as soon as input is fed to a parser that no longer holds that paste, so it never takes a
 * later one.
 */
function dropOpenPaste(renderer: CliRenderer | null): void {
  type Parser = { paste?: unknown; push(data: Uint8Array): void };
  const parser = (renderer as unknown as { stdinParser?: Parser | null } | null)?.stdinParser;
  const open = parser?.paste ?? null;
  if (!renderer || !parser || open === null || dropping.has(renderer)) return;
  dropping.add(renderer);
  type Ev = { preventDefault(): void; stopPropagation(): void };
  const input = renderer.keyInput as unknown as { prependListener(ev: 'paste', fn: (e: Ev) => void): void; off(ev: 'paste', fn: (e: Ev) => void): void };
  const own = Object.prototype.hasOwnProperty.call(parser, 'push');
  const push = parser.push;
  const disarm = (): void => {
    input.off('paste', drop);
    if (parser.push === guard) { if (own) parser.push = push; else delete (parser as Partial<Parser>).push; }
    dropping.delete(renderer);
  };
  // Runs before the parser takes each chunk: a parser no longer holding the open paste has finished it (the drop ran)
  // or abandoned it.
  const guard = (data: Uint8Array): void => {
    if (parser.paste !== open) disarm();
    push.call(parser, data);
  };
  const drop = (e: Ev): void => {
    disarm();
    e.preventDefault();
    e.stopPropagation();
  };
  parser.push = guard;
  input.prependListener('paste', drop);
}

/** Runs `forget` when `wipe` changes, never on the first render, and drops a paste open at that moment. A layout
 *  effect: it runs before the effects of the caller that wipes, so no key lands between the wipe and the forgetting. */
function useWipe(wipe: unknown, forget: () => void): void {
  const renderer = useRenderer() as CliRenderer | null;
  const seen = useRef(wipe);
  const run = useRef(forget);
  run.current = forget;
  useLayoutEffect(() => {
    if (Object.is(seen.current, wipe)) return;
    seen.current = wipe;
    dropOpenPaste(renderer);
    run.current();
  }, [wipe]);
}

/**
 * The engine editor's undo forgotten on a wipe: at once, and again after the empty value the wipe brings is written
 * into it (the textarea's write keeps the old text on its undo stack).
 */
function useEngineWipe(wipe: unknown, node: { current: { editBuffer: { clearHistory(): void }; plainText: string } | null }): (written: string) => void {
  const pending = useRef(false);
  useWipe(wipe, () => {
    const n = node.current;
    n?.editBuffer.clearHistory();
    pending.current = n !== null && n.plainText !== '';
  });
  return (written) => {
    if (!pending.current || written !== '') return;
    pending.current = false;
    node.current?.editBuffer.clearHistory();
  };
}

/** The engine's editor of a field, when it has one. */
type Engine = { focused: boolean; focus(): void; handleKeyPress(k: Key): boolean; isDestroyed: boolean };

/**
 * Focus and keys of a field. A key this field takes never also reaches another engine editor: the focus moves in the
 * store at once but in the engine only when React commits, so keys typed right after Tab (or `/`) would otherwise go
 * to the field that had the focus. When this field's engine editor does not hold the engine's focus yet, it is given
 * it and the key is handed to it here.
 */
function useField(p: FieldInputProps, editorKeys: (k: Key) => boolean, engine?: { current: Engine | null }, setCaret?: (at: number) => void) {
  // The last key routed to this field: the engine editor acts on no other (see strayGuard).
  const routed = useRef<Key | null>(null);
  const f = useFocusable({
    editor: true,
    disabled: p.disabled,
    auto: p.autoFocus,
    onKey: (k) => {
      routed.current = k;
      if (p.onKey?.(k) === true) { k.preventDefault(); return true; }
      const mine = editorKeys(k);
      if (!mine) return false;
      const e = engine?.current;
      if (!engine) k.preventDefault();
      else if (e && !e.isDestroyed && !e.focused) { e.focus(); e.handleKeyPress(k); k.preventDefault(); }
      return true;
    },
  });
  // setCaret is read when called (a field's caret state changes every render; the handle stays the same object).
  const caretTo = useRef(setCaret);
  caretTo.current = setCaret;
  useImperativeHandle(p.handle, () => ({ focus: f.focus, setCaret: (at: number) => caretTo.current?.(at) }), [f.focus]);
  const was = useRef(f.focused);
  const onFocusChange = useRef(p.onFocusChange);
  onFocusChange.current = p.onFocusChange;
  useEffect(() => {
    if (was.current === f.focused) return;
    was.current = f.focused;
    onFocusChange.current?.(f.focused);
  }, [f.focused]);
  return Object.assign(f, {
    /** The engine editor's own key hook: a key the focus store did not route here (the engine still had this editor
     *  focused while the store had moved on) is refused, so it never edits or submits the field that lost the focus. */
    strayGuard: (k: Key) => { if (routed.current !== k) k.preventDefault(); },
  });
}

function colours(p: FieldInputProps): Record<string, unknown> {
  const fg = colour(p.disabled ? 'faint' : (p.colour ?? 'ink'));
  // Selected text: `bg` words on the focus fill, as the drawn path below marks a selection (focusInk), seen on every
  // ground and tier. Not `selected` (the current row's ground): 1.1:1 on a card in truecolor, and on 16 colours the
  // ground itself (dark: the palette's black; light: the card's white).
  return fg ? { textColor: fg, focusedTextColor: fg, placeholderColor: colour('faint'), cursorColor: colour('focus'), selectionBg: colour('focus'), selectionFg: colour('bg') } : {};
}

function size(p: FieldInputProps, props: Record<string, unknown>): void {
  if (p.width !== undefined) props.width = p.width;
  if (p.grow !== undefined) props.flexGrow = p.grow;
  else if (p.width === undefined) props.flexGrow = 1;
  props.flexShrink = 1;
  props.minWidth = 1;
}


/**
 * Keeps an engine editor holding exactly the caller's value. A value the editor reported (`emitted`) that the caller's
 * prop does not show yet may only be a render that has not seen it (a focus change commits first): it is given one
 * task to arrive before the editor is put back to the prop (a caller that refused or rewrote the keystroke). Any other
 * difference (the caller set a new value) is applied at once.
 */
function useControlled(read: () => string | null, write: (v: string) => void, value: string, emitted: { current: string | null }): void {
  const prop = useRef(value);
  prop.current = value;
  useLayoutEffect(() => {
    const now = read();
    if (now === null || now === value) { emitted.current = null; return; }
    if (now !== emitted.current) { write(value); return; }
    const id = setTimeout(() => {
      const later = read();
      if (later !== null && later !== prop.current && later === emitted.current) { emitted.current = null; write(prop.current); }
    }, 0);
    return () => clearTimeout(id);
  });
}

function LineField(p: FieldInputProps): ReactElement {
  // Escape is never the editor's: it closes what holds the field (a drawer, a list).
  const node = useRef<InputRenderable | null>(null);
  const f = useField(p, (k) => k.name !== 'escape', node as unknown as { current: Engine | null }, (at) => engineCaret(node.current, node.current?.value ?? p.value, at));
  const syncing = useRef(false);
  const semRef = useSem(p.sem, { role: 'textbox', disabled: p.disabled, readonly: p.readOnly, focus: f, value: p.value });
  const setRef = useCallback((n: InputRenderable | null) => { node.current = n; f.ref.current = n as unknown as BoxRenderable; semRef(n); }, [f.ref, semRef]);
  // The engine gets the value once, at creation: a later `value` prop would reach it through its setter, which
  // reports the change back as input (an echo of the caller's own value). useControlled writes it instead.
  const initial = useRef(p.value);
  const wiped = useEngineWipe(p.wipe, node);
  // Controlled: after every render the engine holds exactly the caller's value (a refused keystroke is undone).
  const emitted = useRef<string | null>(null);
  useControlled(() => node.current?.value ?? null, (v) => {
    const n = node.current;
    if (!n) return;
    syncing.current = true;
    try { n.value = v; } finally { syncing.current = false; }
    wiped(v);
  }, p.value, emitted);
  const props: Record<string, unknown> = {
    // The placeholder is never the engine's: its cursor would sit on (and invert) the first letter. It is drawn below.
    ref: setRef, value: initial.current, focused: f.focused, placeholder: '', maxLength: p.maxLength ?? NO_LIMIT,
    // The caret follows with the least margin the engine keeps (one cell after it), as a web field scrolls only when the
    // caret leaves the box. The engine's default (a fifth of the width, before every paint) scrolled a value that had
    // room: "steady-amber-badger" showed as "dy-amber-badger".
    scrollMargin: 0,
    onInput: (v: string) => { if (!syncing.current) { emitted.current = v; p.onChange(v); } },
    onSubmit: (v: string) => p.onSubmit?.(v),
    onKeyDown: f.strayGuard,
    onMouseDown: () => { if (!p.disabled) f.focus(); },
    ...colours(p),
  };
  // Empty with a placeholder: a one-cell input (the caret, only while focused) then the placeholder, dim and cut at
  // its end; the input takes the field's room again with the first character. The input keeps its place in the
  // tree, so the engine keeps its state.
  const ph = p.value === '' && p.placeholder ? p.placeholder : '';
  // Empty, unfocused, no placeholder: the fill takes the room the same way (the input keeps its place, zero wide).
  const fill = p.value === '' && !p.placeholder && !f.focused && p.emptyFill ? p.emptyFill : '';
  // Unfocused, a value wider than its field shows its START, cut with one "…", as a web input shows the start of its
  // value while it is not being edited. The engine kept the caret's place (the value's end): "│ : triage, approvals
  // and summaries" told nothing of what the field holds. The input keeps its place in the tree (zero wide, as under a
  // placeholder), so the focus comes back to it and the engine's caret and scroll take over again.
  const [room, setRoom] = useState(0);
  const cut = !f.focused && !ph && !fill && room > 0 && cellWidth(p.value) >= room;
  const outer: Record<string, unknown> = {
    flexDirection: 'row', onMouseDown: () => { if (!p.disabled) f.focus(); },
    onSizeChange: function (this: { width: number }) { setRoom(this.width); },
  };
  size(p, outer);
  // An unsized field showing its value claims the value's width plus the caret's cell and the one cell the engine
  // keeps after the caret. At the value's width alone the engine scrolled it by those two cells, so a row with room
  // still cut the value at its start ("eady-amber-otter"). In a narrower row it still gives way (flexShrink, minWidth
  // 1): the caret follows. A width, not a flexBasis: layout gives the only flexible child of a row a flex basis of 0
  // and keeps a set flexBasis at that value on later passes, so the field measured 0 cells wide.
  if (p.width === undefined && !ph && !fill) outer.width = cellWidth(p.value) + 2;
  // A hair under 1, never 1: the engine stops a box from shrinking when a number is set as its width after the box was
  // made while its shrink is exactly 1 (it reads 1 as "not set"). That width follows the value, so a field filled after
  // its first frame (an address typed or pasted) kept its whole width, ran past its row and pushed its suffix out of it
  // ("…/invoices/and-recei│", no "✓ Free"). A shrink of 0.999 is kept and shares a shortfall as 1 does.
  outer.flexShrink = 0.999;
  if (ph) Object.assign(props, { width: f.focused ? 1 : 0, flexGrow: 0, flexShrink: 0, minWidth: 0 });
  else if (fill || cut) Object.assign(props, { width: 0, flexGrow: 0, flexShrink: 0, minWidth: 0 });
  else Object.assign(props, { flexGrow: 1, flexShrink: 1, minWidth: 1 });
  // A cut value draws its start and "…" in the row; the engine still lays a width-0 input out 1x1, on that text
  // (an overdraw at 80x24 on the Bots settings tab). Out of the flow it covers nothing and still takes the focus.
  props.position = cut ? 'absolute' : 'relative';
  return el('box', outer, el('input', props), ph ? createElement(Text, { key: 'ph', colour: 'faint', truncate: true, grow: 1 }, ph) : fill ? fillRun(fill) : cut ? cutRun(p) : null);
}

function AreaField(p: FieldInputProps): ReactElement {
  const node = useRef<TextareaRenderable | null>(null);
  const f = useField(p, (k) => k.name !== 'escape', node as unknown as { current: Engine | null }, (at) => engineCaret(node.current, node.current?.plainText ?? p.value, at));
  const syncing = useRef(false);
  const latest = useRef(p.onChange);
  latest.current = p.onChange;
  const semRef = useSem(p.sem, { role: 'textbox', disabled: p.disabled, readonly: p.readOnly, focus: f, value: p.value, multiline: true });
  const setRef = useCallback((n: TextareaRenderable | null) => { node.current = n; f.ref.current = n as unknown as BoxRenderable; semRef(n); }, [f.ref, semRef]);
  const wiped = useEngineWipe(p.wipe, node);
  const emitted = useRef<string | null>(null);
  useControlled(() => node.current?.plainText ?? null, (v) => {
    const n = node.current;
    if (!n) return;
    syncing.current = true;
    try { n.replaceText(v); } finally { syncing.current = false; }
    wiped(v);
  }, p.value, emitted);
  const props: Record<string, unknown> = {
    ref: setRef, initialValue: p.value, focused: f.focused, placeholder: p.placeholder ?? null, height: p.lines, wrapMode: 'word',
    onContentChange: () => {
      const n = node.current;
      if (!n || syncing.current) return;
      let v = n.plainText;
      if (p.maxLength !== undefined && v.length > p.maxLength) v = v.slice(0, p.maxLength);
      if (v !== p.value) { emitted.current = v; latest.current(v); }
    },
    onMouseDown: () => { if (!p.disabled) f.focus(); },
    onKeyDown: f.strayGuard,
    ...colours(p),
  };
  size(p, props);
  return createElement('textarea', props);
}

/** Rows one wheel notch moves a read-only area (as the kit data table and the logs list do). */
const WHEEL_ROWS = 3;

/** The first row a read-only area shows after a key, before it is held to the rows there are; null: not a moving key.
 *  Up/Down a row, PageUp/PageDown a page less one row (one line stays in view as context), Home/End to an end. */
function areaStep(k: Key, top: number, max: number, rows: number): number | null {
  if (k.ctrl || k.meta) return null;
  switch (k.name) {
    case 'up': return top - 1;
    case 'down': return top + 1;
    case 'pageup': return top - Math.max(1, rows - 1);
    case 'pagedown': return top + Math.max(1, rows - 1);
    case 'home': return 0;
    case 'end': return max;
    default: return null;
  }
}

/**
 * A read-only multiline field: the value's own lines, wrapped by word. It is as tall as they are, one row at least (an
 * empty value or its placeholder) and `lines` rows at most, then it scrolls: a short text it only shows leaves no blank
 * rows pushing what follows down (an editable field keeps its `lines` rows to type into, and so does a field read-only
 * only while a send is out, `keepRows`: it does not shrink and grow back). It takes the focus as the
 * web's read-only textarea does, and the arrows, PageUp/PageDown, Home/End and the wheel move it. A key or a notch that
 * cannot move it (it all fits, or it is at that end) goes on, so the drawer or page around it scrolls instead. Every
 * edit is refused here, Enter included (it never submits a form around it); there is no paste handler. The last cell
 * of each row is its rail: ┃ while focused, │ idle, and ↑ / ↓ where more of the value lies above or below, so a
 * person sees there is more to read. Only rows in view are drawn: nothing is laid out past the box. Never a secret.
 */
function ReadArea(p: FieldInputProps): ReactElement {
  const most = p.lines ?? 2;
  const [w, setW] = useState(0);
  const [top, setTop] = useState(0);
  // Before the first measure the lines are not wrapped (each row cuts at the box); the measured width wraps them.
  const all = useMemo(() => wrapCells(p.value, w > 1 ? w - 1 : NO_LIMIT), [p.value, w]);
  // As tall as the wrapped value, between one row and `lines`: the height follows the width, never the other way.
  // Read-only for a moment (`keepRows`): all `lines` rows, as the editable field it was and will be again.
  const rows = p.keepRows ? most : Math.max(1, Math.min(most, p.value === '' ? 1 : all.length));
  const max = Math.max(0, all.length - rows);
  const at = Math.min(top, max);
  // Keys of one burst arrive before a render: each moves from where the last one left the view.
  const live = useRef({ at, max });
  live.current = { at, max };
  const moveTo = (to: number): boolean => {
    const cur = live.current;
    const next = Math.min(cur.max, Math.max(0, to));
    if (next === cur.at) return false;
    live.current = { ...cur, at: next };
    setTop(next);
    return true;
  };
  const keys = (k: Key): boolean => {
    if (k.name === 'escape' || k.name === 'tab') return false;
    const to = areaStep(k, live.current.at, live.current.max, rows);
    if (to !== null) return moveTo(to);
    // A key that would type, delete, undo or submit is taken and does nothing, so it never reaches what is around.
    return actionOf(k) !== null || printable(k) !== null;
  };
  const f = useField(p, keys);
  const semRef = useSem(p.sem, { role: 'textbox', disabled: p.disabled, readonly: true, focus: f, value: p.value, multiline: true });
  const placeholder = p.value === '' && p.placeholder ? p.placeholder : '';
  const shown = placeholder ? [placeholder] : all.slice(at, at + rows);
  const ink: Colour = placeholder || p.disabled ? 'faint' : (p.colour ?? 'ink');
  const rail: Colour = f.focused ? 'focus' : 'lineStrong';
  const lines: ReactNode[] = [];
  for (let i = 0; i < rows; i++) {
    const mark = i === 0 && at > 0 ? '↑' : i === rows - 1 && at < max ? '↓' : f.focused ? '┃' : '│';
    lines.push(createElement(Box, { key: i, dir: 'row', height: 1, shrink: 0 },
      createElement(Text, { truncate: true, grow: 1, colour: ink }, shown[i] ?? ''),
      createElement(Text, { width: 1, shrink: 0, colour: rail }, mark)));
  }
  const boxProps: Record<string, unknown> = {
    dir: 'column',
    boxRef: mergeRefs(f.ref, semRef),
    onPress: p.disabled ? undefined : () => f.focus(),
    onWheel: (e: { scroll?: { direction?: string }; stopPropagation?: () => void }) => {
      const d = e.scroll?.direction;
      const by = d === 'up' ? -WHEEL_ROWS : d === 'down' ? WHEEL_ROWS : 0;
      if (by !== 0 && moveTo(live.current.at + by)) e.stopPropagation?.();
    },
    onSize: (width: number) => setW(width),
    clip: true,
    height: rows,
    minHeight: rows,
    shrink: 1,
    minWidth: 2,
  };
  if (p.width !== undefined) boxProps.width = p.width;
  if (p.grow !== undefined) boxProps.grow = p.grow;
  else if (p.width === undefined) boxProps.grow = 1;
  return createElement(Box, boxProps as never, ...lines);
}

/** A field drawn from the Caret model: masked secrets and read-only values on one line. */
function DrawnField(p: FieldInputProps): ReactElement {
  const [at, setAt] = useState<{ caret: number; anchor: number | null }>({ caret: p.value.length, anchor: null });
  const history = useRef(new History());
  const start = useRef(0);
  const state: LineEdit = { value: p.value, caret: Math.min(at.caret, p.value.length), anchor: at.anchor === null ? null : Math.min(at.anchor, p.value.length) };
  const live = useRef(state);
  live.current = state;
  // The last value this field sent (or was given): an empty value it did not send is a clear from outside.
  const sent = useRef(p.value);
  const commit = (next: LineEdit, kind: 'type' | 'other' | null): void => {
    const cur = live.current;
    if (kind && next.value !== cur.value) history.current.push(cur, next, kind);
    live.current = next;
    setAt({ caret: next.caret, anchor: next.anchor });
    if (next.value !== cur.value) { sent.current = next.value; p.onChange(next.value); }
  };
  const forget = (): void => {
    history.current.clear();
    live.current = { value: '', caret: 0, anchor: null };
    start.current = 0;
    setAt({ caret: 0, anchor: null });
  };
  useWipe(p.wipe, forget);
  // A masked field the caller empties (a form cleared after save) forgets as on a wipe: undo never brings back a
  // secret that was sent. Callers without a `wipe` (a raw password input) get this too.
  const renderer = useRenderer() as CliRenderer | null;
  useLayoutEffect(() => {
    const outside = p.value !== sent.current;
    sent.current = p.value;
    if (outside && p.value === '' && p.mask) { dropOpenPaste(renderer); forget(); }
  }, [p.value]);
  const keys = (k: Key): boolean => {
    if (k.name === 'escape' || k.name === 'tab') return false;
    const a = actionOf(k);
    const cur = live.current;
    if (a === 'submit') { if ((p.lines ?? 1) <= 1) p.onSubmit?.(cur.value); return true; }
    if (a === 'undo' || a === 'redo') {
      if (p.readOnly) return true;
      const back = a === 'undo' ? history.current.undo(cur) : history.current.redo(cur);
      if (back) commit(back, null);
      return true;
    }
    if (a) {
      if (p.readOnly && MUTATES.has(a)) return true;
      commit(apply(cur, a), 'other');
      return true;
    }
    const typed = printable(k);
    if (typed !== null) {
      if (!p.readOnly) commit(insert(cur, typed, p.maxLength ?? NO_LIMIT), 'type');
      return true;
    }
    // Up/Down and anything else unknown are not the field's: lists and steppers around it may want them.
    return false;
  };
  const f = useField(p, keys, undefined, (at) => {
    const v = live.current.value;
    const c = Math.min(v.length, Math.max(0, Math.floor(Number.isFinite(at) ? at : v.length)));
    live.current = { ...live.current, caret: c, anchor: null };
    setAt({ caret: c, anchor: null });
  });
  const semRef = useSem(p.sem, { role: 'textbox', disabled: p.disabled, readonly: p.readOnly, focus: f, value: p.value, secret: p.mask === true, multiline: (p.lines ?? 1) > 1 });
  const focused = useRef(f.focused);
  focused.current = f.focused;
  usePaste((e) => {
    if (!focused.current || p.readOnly || p.disabled) return;
    const text = new TextDecoder().decode(e.bytes).replace(ANSI, '');
    commit(insert(live.current, text, p.maxLength ?? NO_LIMIT), 'other');
    e.preventDefault();
  });
  const [w, setW] = useState(0);
  const shown = shownOf(state.value, p.mask === true);
  const sel = selection(state);
  const caret = shown.map(state.caret);
  const selShown = sel ? [shown.map(sel[0]), shown.map(sel[1])] as const : null;
  // Offsets in the shown text: masked bullets are one unit per grapheme.
  const gs = graphemes(shown.text);
  const offs: number[] = [];
  { let o = 0; for (const g of gs) { offs.push(o); o += g.length; } offs.push(o); }
  const caretOff = p.mask ? offs[Math.min(caret, gs.length)]! : caret;
  const s0 = scrollStart(shown.text, caretOff, w, start.current);
  start.current = s0;
  const spans: ReactNode[] = [];
  let used = 0;
  let run = '';
  let runStyle = '';
  const flush = (): void => {
    if (run === '') return;
    spans.push(runStyle === 'mark' ? createElement(Text, { key: spans.length, ...focusInk(true) }, run) : createElement(Text, { key: spans.length }, run));
    run = '';
  };
  const selFrom = selShown ? (p.mask ? offs[selShown[0]]! : selShown[0]) : -1;
  const selTo = selShown ? (p.mask ? offs[selShown[1]]! : selShown[1]) : -1;
  for (let i = 0; i < gs.length; i++) {
    const o = offs[i]!;
    if (o < s0) continue;
    const g = gs[i]!;
    const cw = cellWidth(g);
    if (w > 0 && used + cw > w) break;
    used += cw;
    const marked = (f.focused && sel === null && o === caretOff) || (selShown !== null && o >= selFrom && o < selTo);
    const style = marked ? 'mark' : 'plain';
    if (style !== runStyle) { flush(); runStyle = style; }
    run += g;
  }
  flush();
  const empty = state.value === '';
  if (empty && !p.placeholder && !f.focused && p.emptyFill && w > 0) {
    spans.push(createElement(Text, { key: 'fill', colour: 'faint', sem: { hidden: true } }, p.emptyFill.repeat(w)));
  } else if (empty && p.placeholder) {
    const ph = p.placeholder;
    // The caret cell comes BEFORE the dim placeholder: no letter of it is ever inverted (it would read as typed).
    const room = w > 0 ? Math.max(0, w - used - (f.focused ? 1 : 0)) : 0;
    const cutPh = room > 0 ? cutCells(ph, room, 'end') : ph;
    if (f.focused) spans.push(createElement(Text, { key: 'c', ...focusInk(true) }, ' '));
    spans.push(createElement(Text, { key: 'p', colour: 'faint' }, cutPh));
  } else if (f.focused && sel === null && caretOff >= shown.text.length && (w === 0 || used < w)) {
    spans.push(createElement(Text, { key: 'c', ...focusInk(true) }, ' '));
  }
  const boxProps: Record<string, unknown> = {
    dir: 'row',
    boxRef: mergeRefs(f.ref, semRef),
    onPress: p.disabled ? undefined : () => f.focus(),
    onSize: (width: number) => setW(width),
    clip: true,
    height: 1,
    shrink: 1,
    minWidth: 1,
  };
  if (p.width !== undefined) boxProps.width = p.width;
  if (p.grow !== undefined) boxProps.grow = p.grow;
  else if (p.width === undefined) boxProps.grow = 1;
  return createElement(Box, boxProps as never, createElement(Text, { truncate: true, colour: p.disabled ? 'faint' : (p.colour ?? 'ink') }, ...spans));
}
