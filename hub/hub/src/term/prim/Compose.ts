// Compose: the message editor of a chat composer (kit/agent Composer.term). The engine's multiline editor with the key
// rule a chat needs, which a form's multiline field (FieldInput, Enter = new line) does not have:
//
//   Enter                 send (onSubmit)
//   Alt+Enter, Ctrl+J     new line (every xterm-class terminal tells these from Enter: ESC CR and LF)
//   Shift+Enter           new line where the terminal reports it (kitty keyboard protocol, modifyOtherKeys); elsewhere
//                         the terminal sends a plain CR, indistinguishable from Enter, so it sends: the hint says Alt+Enter
//   Esc, PgUp, PgDn, Tab  never the editor's (the host closes menus, the transcript scrolls, the focus moves)
//   Alt+letter            never the editor's (host chords: Alt+J the Ask dock)
//   Home, End             the editor's while it holds text; on an EMPTY editor they move nothing, so they pass to the host
//                         (the transcript: End jumps to the newest message)
//
// The value is controlled like FieldInput's. Paste arrives whole (bracketed paste) at `onPaste` first: return true to take
// it (a paste of file paths attaches them there) or false to let the editor insert it. The caret offset is reported, and a
// handle can focus, insert at the caret and place the caret. The box grows with its wrapped lines, minLines..maxLines.
import { createElement, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactElement, type Ref } from 'react';
import type { TextareaRenderable } from '@opentui/core';
import type { BoxRenderable } from './otui';
import { useFocusChange, useFocusable, type Key, type KeyHandler } from './focus';
import { colour } from './tokens';
import { useSem, type Sem } from './semantics';

export interface ComposeHandle {
  focus(): void;
  blur(): void;
  /** Inserts at the caret (replacing a selection), as typing would. */
  insert(text: string): void;
  /** The caret, as a UTF-16 offset into the value. */
  caret(): number;
  setCaret(offset: number): void;
  readonly focused: boolean;
}

export interface ComposeProps {
  value: string;
  onChange: (value: string) => void;
  /** Enter. */
  onSubmit?: () => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  minLines?: number;
  maxLines?: number;
  /** Keys before the editor's own: return true to take one (it then never edits). */
  onKey?: KeyHandler;
  /** A paste, whole: true = taken here (not inserted). */
  onPaste?: (text: string) => boolean;
  /** The caret moved (UTF-16 offset). */
  onCaret?: (offset: number) => void;
  onFocusChange?: (focused: boolean) => void;
  handle?: Ref<ComposeHandle>;
  sem?: Sem;
}

/** Keys the editor never takes. */
const NOT_EDITOR = new Set(['escape', 'pageup', 'pagedown', 'tab']);
/** The chat key rule, as the engine's textarea bindings (they replace its defaults for these keys). */
const BINDINGS = [
  { name: 'return', action: 'submit' },
  { name: 'kpenter', action: 'submit' },
  { name: 'return', meta: true, action: 'newline' },
  { name: 'return', shift: true, action: 'newline' },
  { name: 'linefeed', action: 'newline' },
  { name: 'j', ctrl: true, action: 'newline' },
] as const;
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[@-_]/g;

export function Compose(p: ComposeProps): ReactElement {
  const node = useRef<TextareaRenderable | null>(null);
  const routed = useRef<Key | null>(null);
  const live = useRef(p);
  live.current = p;
  const f = useFocusable({
    editor: true,
    disabled: p.disabled,
    auto: p.autoFocus,
    onKey: (k) => {
      routed.current = k;
      if (live.current.onKey?.(k) === true) { k.preventDefault(); return true; }
      if (NOT_EDITOR.has(k.name)) return false;
      // Alt+letter is not the editor's (it binds none): the host's chords (Alt+J opens the Ask dock) reach it from a composer.
      if (k.meta && !k.ctrl && /^[a-z]$/.test(k.name)) return false;
      if ((k.name === 'home' || k.name === 'end') && !k.ctrl && !k.meta && !k.shift && (node.current?.plainText ?? '') === '') return false;
      const e = node.current;
      // The focus moved in the store but the engine has not committed it yet: give the engine its focus and the key.
      if (e && !e.isDestroyed && !e.focused) { e.focus(); e.handleKeyPress(k); k.preventDefault(); }
      return true;
    },
  });
  useFocusChange(f.focused, p.onFocusChange);
  const semRef = useSem(p.sem, { role: 'textbox', disabled: p.disabled, focus: f, value: p.value, multiline: true });
  const setRef = useCallback((n: TextareaRenderable | null) => { node.current = n; f.ref.current = n as unknown as BoxRenderable; semRef(n); }, [f.ref, semRef]);
  const syncing = useRef(false);
  const emitted = useRef<string | null>(null);
  const [lines, setLines] = useState(Math.max(1, p.minLines ?? 1));
  const fit = useCallback(() => {
    const n = node.current;
    if (!n || n.isDestroyed) return;
    // Every wrapped line of the text, not only those the box shows now: virtualLineCount stops at the box's height, so a
    // one-row box given a long text by the caller (a picked suggestion, a kept draft) said 1 and never grew.
    const total = (n as unknown as { editorView?: { getTotalVirtualLineCount?(): number } }).editorView?.getTotalVirtualLineCount?.();
    const want = Math.min(Math.max(total || n.virtualLineCount || 1, p.minLines ?? 1), p.maxLines ?? 8);
    setLines((l) => (l === want ? l : want));
  }, [p.minLines, p.maxLines]);
  // Controlled: the caller's value goes into the editor when the CALLER changed it (or refused an edit: the value it holds
  // stayed while the editor moved on and was told). Text the person typed that the engine has not reported yet (keys
  // handed over in the same tick as a focus move, before a re-render) is never written over: it is reported instead.
  const synced = useRef(p.value);
  useLayoutEffect(() => {
    const n = node.current;
    if (!n || n.isDestroyed) return;
    const now = n.plainText;
    const callerMoved = p.value !== synced.current;
    synced.current = p.value;
    if (now === p.value) { emitted.current = null; return; }
    if (now === emitted.current && !callerMoved) return;
    if (!callerMoved && now !== emitted.current) { emitted.current = now; live.current.onChange(now); return; }
    syncing.current = true;
    try { n.replaceText(p.value); n.cursorOffset = p.value.length; } finally { syncing.current = false; }
    fit();
  });
  useEffect(fit, [fit]);
  // A kept draft (text held at mount) is continued at its end, as a browser field is after its value is restored.
  useEffect(() => { const n = node.current; if (n && !n.isDestroyed && p.value) n.cursorOffset = p.value.length; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The engine wraps with the width layout gives it, which comes after mount and changes with the pane: the text is
  // counted again when the editor's width changes (a no-op when the count stands). The engine takes a new width in at
  // its next paint, so the count is read after that.
  const soon = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resized = useCallback(() => {
    if (soon.current !== null) clearTimeout(soon.current);
    soon.current = setTimeout(() => { soon.current = null; fit(); }, 0);
  }, [fit]);
  useEffect(() => () => { if (soon.current !== null) clearTimeout(soon.current); }, []);
  useImperativeHandle(p.handle, () => ({
    focus: f.focus,
    blur: f.blur,
    insert: (text: string) => { const n = node.current; if (n && !n.isDestroyed && !live.current.disabled) n.insertText(text); },
    caret: () => node.current?.cursorOffset ?? p.value.length,
    setCaret: (o: number) => { const n = node.current; if (n && !n.isDestroyed) n.cursorOffset = o; },
    get focused() { return f.focused; },
  }), [f, p.value.length]);
  const fg = colour(p.disabled ? 'faint' : 'ink');
  const props: Record<string, unknown> = {
    ref: setRef,
    initialValue: p.value,
    focused: f.focused,
    placeholder: p.placeholder ?? null,
    height: lines,
    wrapMode: 'word',
    keyBindings: BINDINGS,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 1,
    onSubmit: () => { if (!live.current.disabled) live.current.onSubmit?.(); },
    onContentChange: () => {
      const n = node.current;
      if (!n || syncing.current) return;
      const v = n.plainText;
      fit();
      if (v !== live.current.value) { emitted.current = v; live.current.onChange(v); }
    },
    onCursorChange: () => { const n = node.current; if (n) live.current.onCaret?.(n.cursorOffset); },
    onPaste: (e: { bytes: Uint8Array; preventDefault(): void }) => {
      if (live.current.disabled) { e.preventDefault(); return; }
      const text = new TextDecoder().decode(e.bytes).replace(ANSI, '');
      if (live.current.onPaste?.(text) === true) e.preventDefault();
    },
    onMouseDown: () => { if (!live.current.disabled) f.focus(); },
    // A key the focus store did not route here (the engine still had this editor focused while the store moved on).
    onKeyDown: (k: Key) => { if (routed.current !== k) k.preventDefault(); },
    // Selected text as a field draws it (FieldInput `colours`): `bg` words on the focus fill.
    ...(fg ? { textColor: fg, focusedTextColor: fg, placeholderColor: colour('faint'), cursorColor: colour('focus'), selectionBg: colour('focus'), selectionFg: colour('bg') } : {}),
  };
  return createElement('box', { flexGrow: 1, flexShrink: 1, minWidth: 1, onSizeChange: resized }, createElement('textarea', props));
}
