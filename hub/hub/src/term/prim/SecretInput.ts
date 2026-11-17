// SecretInput: THE secret-entry primitive (passwords, tokens, recovery codes, API keys being typed).
// - Display: one bullet per character, drawn from the Caret model (FieldInput `mask`); the value itself is never in a
//   drawn frame, so captureCharFrame, termshot and the agent never see it.
// - Semantics: role textbox, `secret: true`: the tree carries no value and collects no text beneath it, only whether
//   something is typed (semantics.ts).
// - Diagnostics: the value never goes into an error, ledger or log from here; `describeSecret` is the only text form.
// - Copy: never. Ctrl+C / Ctrl+X / Cmd+C are taken and dropped (the web field's copy of a password is also blocked).
// - Lifecycle: the caller's value is wiped (onChange('')) when `wipeOn` changes (the web's useWipeOn: a dialog closing,
//   an account switch) and when the field unmounts, unless `keepOnUnmount`. A wipe also makes the field forget its
//   undo, redo and caret (FieldInput `wipe`), even when the value is already empty: nothing typed comes back by undo.
// - Disabled / read-only: inert (no focus by click, no edit, no paste, no callback).
import { createElement, useEffect, useRef, type ReactElement, type Ref } from 'react';
import { FieldInput, type FieldHandle } from './FieldInput';
import type { KeyHandler } from './focus';
import type { Sem } from './semantics';

export interface SecretInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Enter. */
  onSubmit?: (value: string) => void;
  /** Shown while empty (never derived from the value). */
  placeholder?: string;
  width?: number | `${number}%`;
  grow?: number;
  disabled?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
  /** UTF-16 units. */
  maxLength?: number;
  /** Any value; when it changes the secret is wiped (onChange('')). */
  wipeOn?: unknown;
  /** Keep the caller's value when the field unmounts (default: wiped). */
  keepOnUnmount?: boolean;
  /** Keys before the editor's own (copy keys are taken before this sees them). */
  onKey?: KeyHandler;
  onFocusChange?: (focused: boolean) => void;
  handle?: Ref<FieldHandle>;
  /** Name/description for the semantics tree; `value` is ignored (a secret never carries one). */
  sem?: Omit<Sem, 'value'>;
}

const COPY = (k: { name?: string; ctrl?: boolean; meta?: boolean; super?: boolean }): boolean =>
  (k.name === 'c' || k.name === 'x' || k.name === 'insert') && (k.ctrl === true || k.meta === true || k.super === true);

/** The only text form of a secret for logs and reports: whether one is typed, never what or how long. */
export const describeSecret = (value: string): string => (value.length > 0 ? '[secret: set]' : '[secret: empty]');

export function SecretInput(p: SecretInputProps): ReactElement {
  const change = useRef(p.onChange);
  change.current = p.onChange;
  const value = useRef(p.value);
  value.current = p.value;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (value.current !== '') change.current('');
  }, [p.wipeOn]);
  const keep = useRef(p.keepOnUnmount === true);
  keep.current = p.keepOnUnmount === true;
  useEffect(() => () => { if (!keep.current && value.current !== '') change.current(''); }, []);
  const inert = p.disabled === true || p.readOnly === true;
  return createElement(FieldInput, {
    value: p.value,
    onChange: (v: string) => { if (!inert) p.onChange(v); },
    onSubmit: p.onSubmit,
    placeholder: p.placeholder,
    width: p.width,
    grow: p.grow,
    disabled: p.disabled,
    readOnly: p.readOnly,
    autoFocus: p.autoFocus,
    maxLength: p.maxLength,
    mask: true,
    lines: 1,
    wipe: p.wipeOn,
    onKey: (k: Parameters<KeyHandler>[0]) => (COPY(k) ? true : p.onKey?.(k)),
    onFocusChange: p.onFocusChange,
    handle: p.handle,
    ...(p.sem ? { sem: { ...p.sem, secret: true } as Sem } : {}),
  } as never);
}
