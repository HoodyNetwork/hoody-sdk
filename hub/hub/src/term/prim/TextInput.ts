// TextInput: one line of editable text. It edits only while it has the focus.
import { useMemo, type ReactElement } from 'react';
import { el } from './otui';
import { useFocusChange, useFocusable, type Focusable, type KeyHandler } from './focus';
import { colour } from './tokens';
import { mergeRefs, useSem, type Sem } from './semantics';

export interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  width?: number | `${number}%`;
  grow?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Sees each key first; true = taken (the input does not get it). Tab never reaches it. */
  onKey?: KeyHandler;
  /** Called when the focus arrives (true) or leaves (false). */
  onFocusChange?: (focused: boolean) => void;
  sem?: Sem;
  /** Receives the focus handle. */
  handle?: { current: Focusable | null };
}

export function TextInput(p: TextInputProps): ReactElement {
  // Printable keys and editing keys are the input's own; Tab still moves the focus (FocusRoot sees it first).
  const f = useFocusable({ editor: true, disabled: p.disabled, auto: p.autoFocus, onKey: (k) => p.onKey?.(k) === true || k.name !== 'escape' });
  if (p.handle) p.handle.current = f;
  useFocusChange(f.focused, p.onFocusChange);
  const semRef = useSem(p.sem, { role: 'textbox', disabled: p.disabled, focus: f, value: p.value });
  const ref = useMemo(() => mergeRefs(f.ref, semRef), [f.ref, semRef]);
  const props: Record<string, unknown> = {
    ref, value: p.value, focused: f.focused && !p.disabled, placeholder: p.placeholder ?? '',
    // Disabled = inert at every boundary: no focus by click, no edit, no paste, no callback.
    onInput: (v: string) => { if (!p.disabled) p.onChange(v); else return; },
    onSubmit: (v: string) => { if (!p.disabled) p.onSubmit?.(v); },
    onMouseDown: () => { if (!p.disabled) f.focus(); },
    ...(p.disabled ? { onPaste: (e: { preventDefault?: () => void }) => e.preventDefault?.() } : {}),
    flexShrink: 1,
  };
  if (p.width !== undefined) props.width = p.width;
  if (p.grow !== undefined) props.flexGrow = p.grow; else if (p.width === undefined) props.width = 24;
  // Disabled: no engine input at all (the engine focuses and edits an input on its own click), only its text.
  if (p.disabled) {
    const w: Record<string, unknown> = { ref, flexShrink: 1, height: 1 };
    if (p.width !== undefined) w.width = p.width; else if (p.grow !== undefined) w.flexGrow = p.grow; else w.width = 24;
    return el('box', w, el('text', { fg: colour('faint') }, p.value || p.placeholder || ''));
  }
  const fg = colour('ink');
  if (fg) Object.assign(props, { textColor: fg, focusedTextColor: fg, placeholderColor: colour('faint'), cursorColor: colour('focus') });
  return el('input', props);
}
