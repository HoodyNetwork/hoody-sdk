// A file name as a one-line label: the Open-with drawer's title, its statuses and the launch's
// stored row name ("Nano · ‹label›"). The preview's escaper (ro.ts escapeUnsafe: controls, bidirectional and invisible
// format characters written out) plus tab and line feed, since a label is one line; then cut by grapheme with "…".

import { escapeUnsafe } from './ro';

export const LABEL_MAX = 80;

const graphemes = (s: string): string[] =>
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s), (x) => x.segment)
    : Array.from(s);

/**
 * `s` written out safe for one line, at most `max` graphemes and `units` UTF-16 units of what is shown ("…" included
 * when cut). The cut is made on the name's own graphemes, each written out whole, so it never splits a grapheme or a
 * written-out character ("\u200D" is kept or dropped as one). `units` bounds a label that is stored inside a longer
 * value with a UTF-16 limit (a launch's row name), so that value is never cut again later.
 */
export function safeLabel(s: string, max = LABEL_MAX, units = Infinity): string {
  const parts = graphemes(typeof s === 'string' ? s : '').map(one);
  const sizes = parts.map((p) => graphemes(p).length);
  const whole = parts.join('');
  if (sizes.reduce((a, b) => a + b, 0) <= max && whole.length <= units) return whole;
  let out = '';
  let used = 0;
  for (let i = 0; i < parts.length && used + sizes[i]! <= max - 1 && out.length + parts[i]!.length <= units - 1; i++) {
    out += parts[i];
    used += sizes[i]!;
  }
  return out + '…';
}

/** One grapheme written out: the preview's escaper, then tab and line feed. */
const one = (g: string): string => escapeUnsafe(g).replace(/[\t\n]/g, (ch) => (ch === '\t' ? '\\x09' : '\\x0A'));
