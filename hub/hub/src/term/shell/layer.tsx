// The shell's overlays (palette, `?` sheet, menus, prompts) on the kit's overlay layer (prim/Overlay.ts, Layer): drawn
// over the page at the screen root with a scrim that closes them on a click; while one is open it has every key (the
// layer's key gate stops them before the shell's keymap and the page). Each shell overlay edits its own text
// (useLineEdit) and reads keys in the web's shape (hubKey), so no engine focus moves into it and back.
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Box, Text, useTerminalSize, type Colour } from '../prim';
import { graphemes, scrollStart } from '../prim/Caret';
import { FieldSwatch } from '../prim/FieldSwatch';
import { centerWidth, Layer } from '../prim/Overlay';
import { hubKey, type HubKey } from './hubKey';
import type { ShellKeymap } from './keymap';

/** The shell's keymap, for its status line and overlays. */
export const KeymapContext = createContext<ShellKeymap | null>(null);
export const useShellKeymap = (): ShellKeymap | null => useContext(KeymapContext);

export interface ModalProps {
  title: string;
  /** Columns wanted; capped to the terminal. */
  width?: number;
  onClose: () => void;
  /** Every key while open, in the web's shape (Esc included: the overlay decides). */
  onKey: (k: HubKey) => void;
  /** A key line under the content ("↑↓ choose · Enter run · Esc close"). */
  footer?: string;
  tone?: 'danger';
  /** Where it sits: a dialog a fifth down (default), a list a tenth down (more rows). */
  top?: 'fifth' | 'tenth';
  /** The panel's frame; the layer's default (one plain border) when left out. */
  frame?: 'single';
  children: ReactNode;
}

/** A centred panel over everything (a modal layer), closed by a click on the scrim. */
/** Rows a Modal adds above its body (the title row and its rule): callers sizing a list subtract them. */
export const MODAL_HEAD_ROWS = 2;

export function Modal({ title, width = 72, onClose, onKey, footer, tone, top = 'tenth', frame, children }: ModalProps) {
  const ref = useRef(onKey);
  ref.current = onKey;
  // The kit Dialog's look (one modal look in the Hub): plain frame (danger: danger), the title as a bold first row
  // with a rule under it, the body, then the key line.
  const edge: Colour = tone === 'danger' ? 'danger' : 'lineStrong';
  const { width: cols } = useTerminalSize();
  // The panel's inside: the width it is placed at (centerWidth) less frame and padding (2 + 2).
  const inner = Math.max(0, centerWidth(width, cols) - 4);
  return (
    <Layer
      open
      kind="modal"
      place={{ at: 'center', width, top }}
      onOutside={onClose}
      frameColour={edge}
      {...(frame ? { frame } : {})}
      sem={{ role: 'dialog', name: title }}
      padX={1}
      onKeyFirst={(k) => {
        if (k.eventType === 'release') return true;
        ref.current(hubKey(k));
        return true;
      }}
    >
      <Box dir="row" gap={1}>
        {tone === 'danger' && <Text colour="danger" bold>!</Text>}
        <Text bold grow={1} truncate>{title}</Text>
      </Box>
      <Text colour="line">{'─'.repeat(inner)}</Text>
      <Box dir="column" shrink={1}>{children}</Box>
      {footer && <Text colour="faint" truncate>{footer}</Text>}
    </Layer>
  );
}

/** One line of text an overlay edits itself: printable keys, Backspace, Ctrl+U (clear), Ctrl+W (word), paste-free. */
export interface LineEdit {
  value: string;
  set(v: string): void;
  /** True when the key edited the line. */
  onKey(k: HubKey): boolean;
}

export function useLineEdit(initial = ''): LineEdit {
  const [value, set] = useState(initial);
  const latest = useRef(value);
  latest.current = value;
  return {
    value,
    set(v) { latest.current = v; set(v); },
    onKey(k) {
      // The latest value is kept here, not only in state: keys typed faster than a render each see the one before.
      const v = latest.current;
      let next: string | null = null;
      if (k.ctrlKey && k.name === 'u') next = '';
      else if (k.ctrlKey && k.name === 'w') next = v.replace(/\s*\S+\s*$/, '');
      // Backspace takes the last grapheme: a flag or a ZWJ emoji (typed one code point per key) goes whole.
      else if (k.key === 'Backspace') next = graphemes(v).slice(0, -1).join('');
      else if (!k.ctrlKey && !k.altKey && !k.metaKey && [...k.key].length === 1 && k.key >= ' ') next = v + k.key;
      if (next === null) return false;
      latest.current = next;
      set(next);
      return true;
    },
  };
}

/** The edited line as drawn: its text and a block cursor; the placeholder when empty. Masked text draws dots. */
export function LineView({ edit, placeholder, mask }: { edit: LineEdit; placeholder?: string; mask?: boolean }) {
  const shown = mask ? '•'.repeat([...edit.value].length) : edit.value;
  // A line longer than its room shows its end, where the cursor is (a web field scrolls to its caret): the start is
  // left out. The room is the row less the '› ' (2 cells); before the first layout the line is drawn from its start.
  const [w, setW] = useState(0);
  const from = scrollStart(shown, shown.length, Math.max(0, w - 2), 0);
  return (
    <Box dir="row" height={1} onSize={(width) => setW(width)}>
      <Text colour="blueText">{'› '}</Text>
      {shown === '' && placeholder ? (
        <Text truncate grow={1}><Text inverse> </Text><Text colour="faint">{placeholder}</Text></Text>
      ) : (
        <>
          {/* Plain text, so the cut is measured from its own box: it ends in "…" only when it does not fit (before the
              first layout). The cursor cell is its own Text after it, never cut. */}
          <Text truncate>{shown.slice(from)}</Text>
          <Text inverse shrink={0}> </Text>
        </>
      )}
    </Box>
  );
}

export interface PickItem {
  id: string;
  label: string;
  /** Shown faint after the label (a place, a count). */
  detail?: string;
  /** Keys shown at the end of the row (a jump, a shortcut). */
  keys?: readonly string[];
  /** A section heading drawn before this item. */
  section?: string;
  /** A data colour (#rrggbb) drawn as a swatch before the label; the label names it (a realm, its colour). */
  swatch?: string;
  /** Checked: the current choice (drawn with ✓, not by colour alone). */
  checked?: boolean;
  disabled?: boolean;
}

/** Arrow keys over a list: returns the new active index for the key, or null when the key is not a list key. */
export function listMove(k: HubKey, active: number, items: readonly PickItem[], page = 8): number | null {
  const ok = (i: number) => items[i] && !items[i]!.disabled;
  const step = (from: number, by: 1 | -1, n = 1): number => {
    let i = from;
    let moved = 0;
    for (let guard = 0; guard < items.length * 2 && moved < n; guard++) {
      const j = i + by;
      if (j < 0 || j >= items.length) break;
      i = j;
      if (ok(i)) moved++;
    }
    return ok(i) ? i : from;
  };
  if (k.key === 'ArrowDown' || (k.ctrlKey && k.name === 'n')) return step(active, 1);
  if (k.key === 'ArrowUp' || (k.ctrlKey && k.name === 'p')) return step(active, -1);
  if (k.key === 'PageDown') return step(active, 1, page);
  if (k.key === 'PageUp') return step(active, -1, page);
  if (k.key === 'Home') return step(-1, 1);
  if (k.key === 'End') return step(items.length, -1);
  return null;
}

/** The first item that can be picked at or after `from`. */
export const firstPickable = (items: readonly PickItem[], from = 0): number => {
  for (let i = Math.max(0, from); i < items.length; i++) if (!items[i]!.disabled) return i;
  return -1;
};

/** A list of choices: the active row is marked with ▸ and drawn reversed; a click picks. Scrolls to keep it seen.
 *  With `onHover` the pointer moves the active row as the keys do (one cursor, the web menu's): only a pointer MOVE
 *  does, never a pointer at rest (the row under it changes when the keys scroll the list), and never onto a row that
 *  cannot be picked or a heading. A pointer that leaves the list leaves the active row where it was. */
export function PickList({ items, active, onPick, onHover, rows }: { items: readonly PickItem[]; active: number; onPick: (i: number) => void; onHover?: (i: number) => void; rows: number }) {
  // A window of `rows` lines (section headings count) that keeps the active row in view.
  const lines: Array<{ kind: 'head'; text: string } | { kind: 'item'; i: number }> = [];
  items.forEach((it, i) => {
    if (it.section) lines.push({ kind: 'head', text: it.section });
    lines.push({ kind: 'item', i });
  });
  const at = Math.max(0, lines.findIndex((l) => l.kind === 'item' && l.i === active));
  // Hover never scrolls. Once the pointer chose a row the window stays as it was then (centring it would slide the row
  // from under the pointer and the next move would choose another), also while the keys move the active row inside
  // it; a key that takes the active row out of that window centres the list again, as it always is without a pointer.
  const held = useRef<{ n: number; start: number } | null>(null);
  const h = held.current;
  const keep = h !== null && h.n === lines.length && at >= h.start && at < h.start + Math.max(1, rows);
  const start = keep ? h.start : Math.max(0, Math.min(at - Math.floor(rows / 2), lines.length - rows));
  const over = (i: number): void => {
    if (!onHover || i === active) return;
    held.current = { n: lines.length, start };
    onHover(i);
  };
  // The keys took the row out of the held window: the hold ends (a later row inside the old window must not jump back).
  useEffect(() => { if (!keep) held.current = null; });
  const shown = lines.slice(start, start + Math.max(1, rows));
  return (
    <Box dir="column">
      {start > 0 && <Text colour="faint">{'  ↑ more'}</Text>}
      {shown.map((l, n) =>
        l.kind === 'head' ? (
          // '—' is a divider (the web menu's Separator): a full-width rule, the box's top border at the list's own width
          // (a text rule wrapped into lines the one-row box then cut: census "8 lines in 1").
          l.text === '—' ? (
            <Box key={`h${start + n}`} height={1} border={['top']} borderColour="line" />
          ) : (
            <Text key={`h${start + n}`} colour="faint" bold truncate>{l.text.toUpperCase()}</Text>
          )
        ) : (
          <Row key={items[l.i]!.id} item={items[l.i]!} on={l.i === active} onOver={onHover ? () => over(l.i) : undefined} onPress={() => { onHover?.(l.i); onPick(l.i); }} />
        ),
      )}
      {start + rows < lines.length && <Text colour="faint">{'  ↓ more'}</Text>}
    </Box>
  );
}

function Row({ item, on, onPress, onOver }: { item: PickItem; on: boolean; onPress: () => void; onOver: (() => void) | undefined }) {
  const mark = on ? '▸ ' : '  ';
  // A row that cannot be picked is faint and dim (the kit Button's disabled look): faint alone is no colour in mono.
  return (
    // A plain box, not a focusable: the overlay owns the keys, and a click must not move the page's focus.
    <Box dir="row" height={1} onPress={item.disabled ? undefined : onPress} bg={on ? 'selected' : undefined} {...(onOver && !item.disabled ? { raw: { onMouseMove: onOver } } : {})}>
      {item.swatch ? <Text colour={item.disabled ? 'faint' : on ? 'blueText' : 'ink'} bold={on} dim={item.disabled} shrink={0}>{mark + (item.checked ? '✓ ' : '')}</Text> : null}
      {item.swatch ? <Box shrink={0} width={3}><FieldSwatch value={item.swatch} /></Box> : null}
      <Text colour={item.disabled ? 'faint' : on ? 'blueText' : 'ink'} bold={on} dim={item.disabled} truncate grow={1} shrink={1}>
        {(item.swatch ? '' : mark + (item.checked ? '✓ ' : '')) + item.label}
        {item.detail ? <Text colour="faint">{'  ' + item.detail}</Text> : null}
      </Text>
      {item.keys && item.keys.length > 0 && <Text colour="faint">{' ' + item.keys.join(' ')}</Text>}
    </Box>
  );
}
