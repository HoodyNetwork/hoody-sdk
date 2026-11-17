// Cell math for text: how many terminal cells a string takes, and how to cut or pad it to a width, wide characters
// (CJK, emoji: 2 cells) and combining marks (0 cells) counted as a terminal draws them. Tables and lists measure with
// this, never with `.length`. Control characters are removed first (they draw nothing, or worse).
import { portableWidth } from './width';

const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
/** Bun's own terminal width (East Asian Wide = 2, emoji = 2, marks = 0); without Bun (Node), the same count from width.ts. */
const stringWidth: (s: string) => number = (globalThis as unknown as { Bun?: { stringWidth(s: string): number } }).Bun?.stringWidth ?? portableWidth;

/** The text without terminal control characters (tab and newline kept; callers that want one line fold them). */
export function cleanText(s: string): string {
  return s.replace(CONTROL, '');
}

/** One line: control characters removed, tabs and line breaks folded to single spaces. */
export function oneLine(s: string): string {
  return cleanText(s).replace(/[\t\n]+/g, ' ');
}

/** Cells the text takes in a terminal (after cleanText). */
export function cellWidth(s: string): number {
  return stringWidth(cleanText(s));
}

/** The widest of `texts` in cells, at most `max`; reads the first `limit` only (a few thousand rows stay cheap). */
export function widestCells(texts: Iterable<string>, max = Infinity, limit = 2000): number {
  let w = 0;
  let n = 0;
  for (const t of texts) {
    if (n++ >= limit) break;
    if (t) w = Math.max(w, cellWidth(t));
    if (w >= max) return max;
  }
  return Math.min(w, max);
}

/** The text cut to at most `width` cells, a grapheme never split, an ellipsis ("…", 1 cell) at the end when cut. */
export function clipCells(s: string, width: number, ellipsis = '…'): string {
  const t = oneLine(s);
  if (width <= 0) return '';
  if (stringWidth(t) <= width) return t;
  const room = width - stringWidth(ellipsis);
  let out = '';
  let used = 0;
  for (const { segment } of segmenter.segment(t)) {
    const w = stringWidth(segment);
    if (used + w > room) break;
    out += segment;
    used += w;
  }
  // The cut never leaves a blank before its mark ("atlas stopped…", not "atlas stopped …").
  return room < 0 ? '' : out.trimEnd() + ellipsis;
}

/** The text cut to `width` cells and padded with spaces to exactly `width` (start, end or centre). */
export function padCells(s: string, width: number, align: 'start' | 'end' | 'center' = 'start'): string {
  const t = clipCells(s, width);
  const gap = Math.max(0, width - stringWidth(t));
  if (align === 'end') return ' '.repeat(gap) + t;
  if (align === 'center') return ' '.repeat(Math.floor(gap / 2)) + t + ' '.repeat(gap - Math.floor(gap / 2));
  return t + ' '.repeat(gap);
}

/** Splits text into lines of at most `width` cells at spaces; a run longer than a line breaks anywhere (a URL, an id).
 *  Never cuts: every grapheme of the input is in the output. */
export function wrapCells(s: string, width: number): string[] {
  const w = Math.max(1, width);
  const lines: string[] = [];
  for (const para of cleanText(s).split('\n')) {
    let line = '';
    let used = 0;
    const words = para.split(/( +)/).filter((x) => x !== '');
    for (const word of words) {
      const ww = stringWidth(word);
      if (used + ww <= w) {
        line += word;
        used += ww;
        continue;
      }
      if (/^ +$/.test(word)) {
        lines.push(line);
        line = '';
        used = 0;
        continue;
      }
      if (line !== '') {
        lines.push(line.trimEnd());
        line = '';
        used = 0;
      }
      for (const { segment } of segmenter.segment(word)) {
        const gw = stringWidth(segment);
        if (used + gw > w && line !== '') {
          lines.push(line);
          line = '';
          used = 0;
        }
        line += segment;
        used += gw;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** How a cell's text gives way when its column is narrower than the text, decided per kind of value, once:
 *  - 'end'   plain text: cut at the end, one-cell "…" (never "...", never in the middle);
 *  - 'start' a value whose end is the point (an id tail, a host's last labels): "…" + the tail;
 *  - 'path'  a file path or URL path: keeps the last segments whole ("…/backup.tar.gz"), else as 'start';
 *  - 'never' status words and verbs: not cut at all (the planner gives the column the widest value; see planTerm).
 *  A 'never' value that still does not fit is cut at the end, so a frame never overflows its cell. */
export type CellCut = 'end' | 'start' | 'path' | 'never';

/** The text cut to at most `width` cells at its START, "…" first: the tail is kept whole. */
export function clipStart(s: string, width: number, ellipsis = '…'): string {
  const t = oneLine(s);
  if (width <= 0) return '';
  if (stringWidth(t) <= width) return t;
  const room = width - stringWidth(ellipsis);
  if (room < 0) return '';
  const parts = [...segmenter.segment(t)].map((x) => x.segment);
  let out = '';
  let used = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    const w = stringWidth(parts[i]!);
    if (used + w > room) break;
    out = parts[i] + out;
    used += w;
  }
  return ellipsis + out;
}

/** A path cut to `width` cells keeping whole trailing segments ("…/share/ada", "…/backup.tar.gz"); text before the
 *  path (a "Files: opened " prefix) is kept when the tail and the prefix both fit, else the path's tail alone. A last
 *  segment longer than the room is cut at its start. */
export function clipPath(s: string, width: number): string {
  const t = oneLine(s);
  if (width <= 0) return '';
  if (stringWidth(t) <= width) return t;
  const at = t.search(/[^\s]*\/[^\s]*$/);
  const prefix = at > 0 ? t.slice(0, at) : '';
  const path = at >= 0 ? t.slice(at) : t;
  const segs = path.split('/');
  /** "…/" + the most trailing segments that fit `room`, or null when not even the last one does. */
  const wholeTail = (room: number): string | null => {
    let tail = '';
    // i >= 1: the first segment is what comes before the first "/" (empty for a rooted path, "/session"), never a
    // segment of its own; adding it would draw "…//session".
    for (let i = segs.length - 1; i >= 1; i--) {
      const next = `/${segs[i]}${tail}`;
      if (stringWidth(next) + 1 > room) break;
      tail = next;
    }
    return tail ? `…${tail}` : null;
  };
  if (prefix) {
    const tail = wholeTail(width - stringWidth(prefix));
    if (tail) return prefix + tail;
  }
  return wholeTail(width) ?? clipStart(path, width);
}

/** `s` fitted to `width` cells by its kind (CellCut). */
export function cutCells(s: string, width: number, cut: CellCut = 'end'): string {
  if (cut === 'start') return clipStart(s, width);
  if (cut === 'path') return clipPath(s, width);
  return clipCells(s, width);
}
