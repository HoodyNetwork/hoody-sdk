// Caret: the pure line-editing model behind a field the engine's own input cannot draw (a masked secret, a read-only
// value). It holds the text, the caret and a selection anchor, all as UTF-16 offsets that always sit on grapheme
// boundaries, so a caret never splits an emoji or a combining mark. Keys map to the same actions as the engine's
// input (OpenTUI Textarea's default bindings), so a masked field edits exactly like a plain one.
// Pure: no React, no engine. Cell widths come from cellWidth (wide CJK and emoji are 2 cells).
import { portableWidth } from './width';

export interface LineEdit {
  readonly value: string;
  /** Offset of the caret. */
  readonly caret: number;
  /** The other end of the selection, or null when nothing is selected. */
  readonly anchor: number | null;
}

/** The parts of a key event the model reads (OpenTUI's KeyEvent has them all). */
export interface CaretKey {
  name: string;
  sequence?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  super?: boolean;
}

export type CaretAction =
  | 'left' | 'right' | 'word-left' | 'word-right' | 'home' | 'end'
  | 'select-left' | 'select-right' | 'select-word-left' | 'select-word-right' | 'select-home' | 'select-end' | 'select-all'
  | 'backspace' | 'delete' | 'delete-word-back' | 'delete-word-forward' | 'delete-to-start' | 'delete-to-end'
  | 'undo' | 'redo' | 'submit';

const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/** Grapheme cluster boundaries of `s` (0 and s.length included). */
export function boundaries(s: string): number[] {
  if (s === '') return [0];
  const out: number[] = [];
  if (seg) for (const g of seg.segment(s)) out.push(g.index);
  else for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c < 0xdc00 || c > 0xdfff) out.push(i); }
  out.push(s.length);
  return out;
}

/** The graphemes of `s`. */
export function graphemes(s: string): string[] {
  const b = boundaries(s);
  const out: string[] = [];
  for (let i = 0; i + 1 < b.length; i++) out.push(s.slice(b[i], b[i + 1]));
  return out;
}

/** Terminal cells a string takes (wide CJK and emoji 2, combining marks 0): Bun's count, or width.ts's where Bun is not
 *  the runtime (the same count). */
export function cellWidth(s: string): number {
  const B = (globalThis as { Bun?: { stringWidth?(s: string): number } }).Bun;
  if (B?.stringWidth) return B.stringWidth(s);
  return portableWidth(s);
}

const snap = (b: number[], at: number): number => {
  let best = 0;
  for (const x of b) if (x <= at) best = x;
  return best;
};
const prevB = (b: number[], at: number): number => { let p = 0; for (const x of b) { if (x >= at) break; p = x; } return p; };
const nextB = (b: number[], at: number): number => { for (const x of b) if (x > at) return x; return b[b.length - 1]!; };
const isWord = (g: string): boolean => /[\p{L}\p{N}_]/u.test(g);

/** The offset a word jump lands on (the engine's rule: skip separators, then the word). */
export function wordJump(s: string, at: number, dir: 1 | -1): number {
  const b = boundaries(s);
  let i = b.indexOf(snap(b, at));
  const gAt = (k: number): string => s.slice(b[k], b[k + 1]);
  if (dir === 1) {
    while (i < b.length - 1 && !isWord(gAt(i))) i++;
    while (i < b.length - 1 && isWord(gAt(i))) i++;
  } else {
    while (i > 0 && !isWord(gAt(i - 1))) i--;
    while (i > 0 && isWord(gAt(i - 1))) i--;
  }
  return b[i]!;
}

export const edit = (value: string, caret = value.length): LineEdit => ({ value, caret: Math.min(caret, value.length), anchor: null });

/** The selected range [from, to), or null. */
export function selection(e: LineEdit): [number, number] | null {
  if (e.anchor === null || e.anchor === e.caret) return null;
  return e.anchor < e.caret ? [e.anchor, e.caret] : [e.caret, e.anchor];
}

/** Insert text at the caret (replacing a selection). Line breaks and control characters are dropped; `maxLength`
 *  counts UTF-16 units like the engine's input and the web's maxLength. */
export function insert(e: LineEdit, text: string, maxLength = Infinity): LineEdit {
  const clean = text.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
  const sel = selection(e);
  const [from, to] = sel ?? [e.caret, e.caret];
  const room = maxLength - (e.value.length - (to - from));
  if (room <= 0 && sel === null) return e;
  let add = clean;
  if (add.length > room) add = graphemes(add).reduce((acc, g) => (acc.length + g.length <= room ? acc + g : acc), '');
  const value = e.value.slice(0, from) + add + e.value.slice(to);
  return { value, caret: from + add.length, anchor: null };
}

function cut(e: LineEdit, from: number, to: number): LineEdit {
  if (from === to) return { ...e, anchor: null };
  return { value: e.value.slice(0, from) + e.value.slice(to), caret: from, anchor: null };
}

/** The action a key stands for, or null (a printable key is not an action: see printable()). Single-line rules. */
export function actionOf(k: CaretKey): CaretAction | null {
  const n = k.name;
  const c = !!k.ctrl, m = !!k.meta, s = !!k.shift, sup = !!k.super;
  if (n === 'return' || n === 'kpenter' || n === 'linefeed') return 'submit';
  if (n === 'left') return (c || m) ? (s ? 'select-word-left' : 'word-left') : sup ? (s ? 'select-home' : 'home') : s ? 'select-left' : 'left';
  if (n === 'right') return (c || m) ? (s ? 'select-word-right' : 'word-right') : sup ? (s ? 'select-end' : 'end') : s ? 'select-right' : 'right';
  if (n === 'home' || (n === 'up' && sup)) return s ? 'select-home' : 'home';
  if (n === 'end' || (n === 'down' && sup)) return s ? 'select-end' : 'end';
  if (c && n === 'a') return s ? 'select-home' : 'home';
  if (c && n === 'e') return s ? 'select-end' : 'end';
  if (m && n === 'a') return s ? 'select-home' : 'home';
  if (m && n === 'e') return s ? 'select-end' : 'end';
  if (c && n === 'f') return 'right';
  if (c && n === 'b') return 'left';
  if (m && n === 'f') return s ? 'select-word-right' : 'word-right';
  if (m && n === 'b') return s ? 'select-word-left' : 'word-left';
  if (sup && n === 'a') return 'select-all';
  if (n === 'backspace') return c || m ? 'delete-word-back' : 'backspace';
  if (c && n === 'w') return 'delete-word-back';
  if (n === 'delete') return c || m ? 'delete-word-forward' : 'delete';
  if (m && n === 'd') return 'delete-word-forward';
  if (c && n === 'd') return 'delete';
  if (c && n === 'u') return 'delete-to-start';
  if (c && n === 'k') return 'delete-to-end';
  // Ctrl+- arrives as Ctrl+_ (0x1f) from a legacy terminal.
  if ((c && (n === '-' || n === '_')) || (sup && n === 'z' && !s)) return 'undo';
  if ((c && n === '.') || (sup && n === 'z' && s)) return 'redo';
  return null;
}

/** The text a key types, or null (modifier chords, control keys). */
export function printable(k: CaretKey): string | null {
  if (k.ctrl || k.meta || k.super) return null;
  if (k.name === 'space') return ' ';
  const q = k.sequence ?? '';
  if (q === '' || /[\x00-\x1f\x7f-\x9f]/.test(q)) return null;
  return q;
}

/** True for actions that change the value (refused by a read-only field). */
export const MUTATES: ReadonlySet<CaretAction> = new Set(['backspace', 'delete', 'delete-word-back', 'delete-word-forward', 'delete-to-start', 'delete-to-end', 'undo', 'redo']);

/** Applies a movement or deletion. undo/redo/submit are the caller's (they need history or the form). */
export function apply(e: LineEdit, a: CaretAction): LineEdit {
  const v = e.value;
  const b = boundaries(v);
  const sel = selection(e);
  const move = (to: number, select: boolean): LineEdit => ({ value: v, caret: to, anchor: select ? (e.anchor ?? e.caret) : null });
  switch (a) {
    case 'left': return sel ? move(sel[0], false) : move(prevB(b, e.caret), false);
    case 'right': return sel ? move(sel[1], false) : move(nextB(b, e.caret), false);
    case 'word-left': return move(wordJump(v, e.caret, -1), false);
    case 'word-right': return move(wordJump(v, e.caret, 1), false);
    case 'home': return move(0, false);
    case 'end': return move(v.length, false);
    case 'select-left': return move(prevB(b, e.caret), true);
    case 'select-right': return move(nextB(b, e.caret), true);
    case 'select-word-left': return move(wordJump(v, e.caret, -1), true);
    case 'select-word-right': return move(wordJump(v, e.caret, 1), true);
    case 'select-home': return move(0, true);
    case 'select-end': return move(v.length, true);
    case 'select-all': return { value: v, caret: v.length, anchor: 0 };
    case 'backspace': return sel ? cut(e, sel[0], sel[1]) : cut(e, prevB(b, e.caret), e.caret);
    case 'delete': return sel ? cut(e, sel[0], sel[1]) : cut(e, e.caret, nextB(b, e.caret));
    case 'delete-word-back': return sel ? cut(e, sel[0], sel[1]) : cut(e, wordJump(v, e.caret, -1), e.caret);
    case 'delete-word-forward': return sel ? cut(e, sel[0], sel[1]) : cut(e, e.caret, wordJump(v, e.caret, 1));
    case 'delete-to-start': return cut(e, 0, e.caret);
    case 'delete-to-end': return cut(e, e.caret, v.length);
    default: return e;
  }
}

/** Edit history for undo/redo: one entry per value change, typing runs coalesced. */
export class History {
  private past: LineEdit[] = [];
  private future: LineEdit[] = [];
  private lastKind: 'type' | 'other' | null = null;
  /** Record `before` when `after` changed the value. */
  push(before: LineEdit, after: LineEdit, kind: 'type' | 'other'): void {
    if (before.value === after.value) return;
    if (!(kind === 'type' && this.lastKind === 'type')) this.past.push(before);
    if (this.past.length > 200) this.past.shift();
    this.future = [];
    this.lastKind = kind;
  }
  undo(cur: LineEdit): LineEdit | null {
    const p = this.past.pop();
    if (!p) return null;
    this.future.push(cur);
    this.lastKind = null;
    return p;
  }
  redo(cur: LineEdit): LineEdit | null {
    const f = this.future.pop();
    if (!f) return null;
    this.past.push(cur);
    this.lastKind = null;
    return f;
  }
  clear(): void { this.past = []; this.future = []; this.lastKind = null; }
}

/** What a line of `width` cells shows of `shown` so the caret stays in view: the start offset, given the last start. */
export function scrollStart(shown: string, caret: number, width: number, lastStart: number): number {
  if (width <= 0) return 0;
  const b = boundaries(shown);
  let start = Math.min(snap(b, lastStart), snap(b, caret));
  // The caret cell itself needs one column after the text before it.
  while (start < caret && cellWidth(shown.slice(start, caret)) + 1 > width) start = nextB(b, start);
  // Room left (the field grew, text was deleted): show more of the start again.
  while (start > 0 && cellWidth(shown.slice(prevB(b, start))) + 1 <= width) start = prevB(b, start);
  return start;
}

/** The drawn form of a value: itself, or one bullet per grapheme when masked. Offsets map 1:1 per grapheme. */
export function shownOf(value: string, mask: boolean): { text: string; map: (offset: number) => number } {
  if (!mask) return { text: value, map: (o) => o };
  const b = boundaries(value);
  const n = b.length - 1;
  return { text: '•'.repeat(value === '' ? 0 : n), map: (o) => Math.max(0, b.indexOf(snap(b, o))) };
}
