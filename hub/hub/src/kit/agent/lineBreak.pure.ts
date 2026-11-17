// Line breaking for terminal prose (Reply.term's paragraphs, list items, headings). The engine's word wrap (OpenTUI 0.8.4,
// native utf8.zig isAsciiWrapBreak) may break after any of , . ; : ! ? ( ) [ ] { } - / \, so a line can start with ", "
// or a "(" can end one with its host on the next line. The rule here, the reading rule of UAX #14 for Latin text:
//   - a line breaks at a space (the space is dropped), never before closing punctuation , . ; : ! ? ) ] } and never after
//     opening ( [ {;
//   - a word longer than the line breaks after a "-" or "/" inside it (a path, an address), never before closing
//     punctuation; with none, at the last cell that fits (nothing is ever cut or hidden);
//   - "\n" in the text is a line end.
// Styled runs keep their style across the break: the result is lines of runs. Pure; widths in terminal cells.
export interface Run<S> { readonly s: string; readonly st: S }

const CLOSING = new Set([',', '.', ';', ':', '!', '?', ')', ']', '}', '»', '”', '’']);
const OPENING = new Set(['(', '[', '{', '«', '“', '‘']);

interface Ch { c: string; w: number; r: number }

export function breakRuns<S>(runs: readonly Run<S>[], width: number, cells: (s: string) => number): Run<S>[][] {
  const max = Math.max(1, Math.floor(width));
  const chars: Ch[] = [];
  runs.forEach((run, r) => { for (const c of Array.from(run.s)) chars.push({ c, w: c === '\n' ? 0 : cells(c), r }); });
  const n = chars.length;
  const ranges: Array<[number, number]> = [];
  // A space at i may end a line unless the next visible character closes, or the one before it opens.
  const spaceBreaks = (i: number): boolean => {
    let j = i + 1;
    while (j < n && chars[j]!.c === ' ') j++;
    if (j < n && CLOSING.has(chars[j]!.c)) return false;
    return !(i > 0 && OPENING.has(chars[i - 1]!.c));
  };
  let start = 0;
  let first = true;
  while (start < n) {
    if (!first) while (start < n && chars[start]!.c === ' ') start++;
    first = false;
    if (start >= n) break;
    let w = 0;
    let i = start;
    let spaceAt = -1; // line [start, spaceAt), next starts after it
    let softAt = -1; // line [start, softAt), next starts at softAt
    let ended = false;
    for (; i < n; i++) {
      const ch = chars[i]!;
      if (ch.c === '\n') { ranges.push([start, i]); start = i + 1; first = true; ended = true; break; }
      if (ch.c === ' ' && i > start && spaceBreaks(i)) spaceAt = i;
      if (w + ch.w > max && ch.c !== ' ') break;
      w += ch.w;
      if ((ch.c === '-' || ch.c === '/') && i + 1 < n && chars[i + 1]!.c !== ' ' && !CLOSING.has(chars[i + 1]!.c)) softAt = i + 1;
    }
    if (ended) continue;
    if (i >= n) { ranges.push([start, n]); break; }
    if (spaceAt > start) { ranges.push([start, spaceAt]); start = spaceAt + 1; continue; }
    if (softAt > start) { ranges.push([start, softAt]); start = softAt; continue; }
    // One word wider than the line: as many cells as fit (at least one character), never before closing punctuation.
    let cut = Math.max(start + 1, i);
    while (cut - 1 > start && CLOSING.has(chars[cut]?.c ?? '')) cut--;
    ranges.push([start, cut]);
    start = cut;
  }
  return ranges.map(([a, b]) => {
    let end = b;
    while (end > a && chars[end - 1]!.c === ' ') end--;
    const line: Run<S>[] = [];
    for (let k = a; k < end; k++) {
      const ch = chars[k]!;
      const prev = line[line.length - 1];
      if (prev && prev.st === runs[ch.r]!.st) line[line.length - 1] = { s: prev.s + ch.c, st: prev.st };
      else line.push({ s: ch.c, st: runs[ch.r]!.st });
    }
    return line;
  });
}

/** The text of a line (tests and screen readers). */
export const lineText = <S,>(line: readonly Run<S>[]): string => line.map((r) => r.s).join('');
