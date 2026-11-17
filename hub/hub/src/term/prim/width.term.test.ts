// width.ts counts cells as Bun.stringWidth does, for the same bundle under Node (no Bun.stringWidth there). Three checks:
// the table (widths.gen.ts) is what a fresh `bun scripts/term/widths.ts` writes; every code point and the emoji
// sequences below count the same as Bun.stringWidth; and so do strings full of escape sequences. (The test fence
// refuses subprocesses, so width.ts is checked under Bun here; under Node only the grapheme segmenter differs.)
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import { WIDTHS_FILE, widthsSource } from '../../../scripts/term/widths';
import { portableWidth } from './width';

const bunWidth = (s: string): number => Bun.stringWidth(s);

/** Every code point except the surrogates, one string each. */
function codePoints(): string[] {
  const out: string[] = [];
  for (let cp = 0; cp <= 0x10ffff; cp++) if (cp < 0xd800 || cp > 0xdfff) out.push(String.fromCodePoint(cp));
  return out;
}

const ZWJ = '‍';
const VS15 = '︎';
const VS16 = '️';
const SKINS = ['\u{1f3fb}', '\u{1f3fd}', '\u{1f3ff}'];
const LAPTOP = '\u{1f4bb}';
const RAINBOW = '\u{1f308}';

/** Emoji sequences: each emoji-like code point with what may follow it, keycaps, flags, tags, families, marks. */
function sequences(): string[] {
  const out: string[] = [];
  const emoji = codePoints().filter((c) => /\p{Extended_Pictographic}|\p{Emoji}/u.test(c));
  expect(emoji.length).toBeGreaterThan(2000);
  for (const e of emoji) {
    out.push(e + VS16, e + VS15, e + ZWJ + LAPTOP, e + VS16 + ZWJ + RAINBOW, LAPTOP + ZWJ + e, 'a' + ZWJ + e, e + ZWJ, e + VS16 + VS16);
    for (const s of SKINS) out.push(e + s, e + s + ZWJ + LAPTOP);
  }
  for (const k of '#*0123456789') out.push(k + VS16 + '⃣', k + '⃣');
  for (let a = 0x1f1e6; a <= 0x1f1ff; a++) {
    out.push(String.fromCodePoint(a), String.fromCodePoint(a) + SKINS[1]);
    for (let b = 0x1f1e6; b <= 0x1f1ff; b++) out.push(String.fromCodePoint(a, b));
  }
  const tags = (t: string): string => [...t].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join('') + '\u{e007f}';
  out.push('\u{1f3f4}' + tags('gbeng'), '\u{1f3f4}' + tags('gbsct'), 'a' + tags('x'));
  out.push(
    '\u{1f468}‍\u{1f469}‍\u{1f467}‍\u{1f466}', '\u{1f469}\u{1f3fd}‍\u{1f4bb}', '\u{1f3f3}️‍\u{1f308}',
    '〰️‍\u{1f308}', '\u{1f9d1}‍\u{1f91d}‍\u{1f9d1}', '❤️‍\u{1f525}', '\u{1f43b}‍❄️',
    '\u{1f441}️‍\u{1f5e8}️', '\u{1f9d1}\u{1f3ff}‍\u{1f91d}‍\u{1f9d1}\u{1f3fb}', '\u{1f46e}‍♀️',
    'é', 'ạ̈', '각', '가', '漢字', 'ＡＢ', 'a​b', 'क्ष',
    'abc 漢字 \u{1f469}\u{1f3fd}‍\u{1f4bb} é \u{1f1ef}\u{1f1f5}', '', ' ', '\t', 'x\u0000y', '­', '⁠',
  );
  return out;
}

test('widths.gen.ts is what `bun scripts/term/widths.ts` writes now (a Bun that counts differently fails here)', () => {
  expect(fs.readFileSync(WIDTHS_FILE, 'utf8')).toBe(widthsSource());
}, 60_000);

test('every code point and every sequence: the same cells as Bun.stringWidth', () => {
  const bad: string[] = [];
  for (const s of [...codePoints(), ...sequences()]) {
    const want = bunWidth(s);
    const got = portableWidth(s);
    if (got !== want && bad.length < 20) bad.push(`${[...s].map((c) => 'U+' + c.codePointAt(0)!.toString(16)).join(' ')}: ${got}, Bun ${want}`);
  }
  expect(bad).toEqual([]);
}, 120_000);

test('a zero-cell Prepend (U+0600-0605, U+06DD, U+070F, U+08E2) before an emoji: the cells of what is drawn', () => {
  // Under Node the grapheme segmenter joins such a character to the emoji after it; safeText drops it, so the line is
  // measured as the emoji alone is drawn. (Before: U+0600 + a flag + VS15 counted 1, drawn in 2 cells.)
  const PREPEND = [0x600, 0x601, 0x602, 0x603, 0x604, 0x605, 0x6dd, 0x70f, 0x8e2].map((c) => String.fromCodePoint(c));
  const RI = '\u{1f1e6}';
  const tails = [RI + VS15, RI + SKINS[0]!, RI + ZWJ, RI + ZWJ + LAPTOP, RI + '\u{1f1e8}', RI, '\u{1f44d}' + SKINS[1]!, '\u{1f468}' + ZWJ + LAPTOP, '1' + VS16 + '⃣', '❤' + VS16, 'a\u0301'];
  const bad: string[] = [];
  for (const p of PREPEND) {
    expect(portableWidth(p)).toBe(0);
    for (const t of tails) for (const s of [p + t, p + p + t, 'x' + p + t]) {
      const want = bunWidth(s.replaceAll(p, ''));
      const got = portableWidth(s);
      if (got !== want) bad.push(`${[...s].map((c) => 'U+' + c.codePointAt(0)!.toString(16)).join(' ')}: ${got}, drawn ${want}`);
    }
  }
  expect(bad).toEqual([]);
});

test('escape sequences take no cells, cut and ended where Bun cuts and ends them', () => {
  const E = '\x1b';
  const named = [
    `${E}[31mhello${E}[39m`, `${E}[1;31;48;5;200mab${E}[0m`, `${E}[?25lab`, `${E}[200~ab${E}[201~`, `${E}]8;;https://example.test\x07link${E}]8;;\x07`,
    `${E}]0;title${E}\\ab`, `${E}(Bab`, `${E}($Bab`, `${E}7ab${E}8`, `${E}Pq\x07ab${E}\\cd`, `${E}[3${E}[31mab`, `x${E}[0m\u0301`,
    `${LAPTOP}${E}[0m${ZWJ}${RAINBOW}`, `${E}漢ab`, `\x9b31mab`, `\x9d0;t\x07ab`, `${E}[1\x9cab`, `\x9e@\x1aab`, `${E}[31`, `${E}`,
  ];
  // Seeded strings over the pieces escape sequences are made of, with text, wide letters, emoji and marks between.
  const pieces = [E, '[', ']', 'P', 'X', '^', '_', '\\', '\x07', '\x9b', '\x9c', '\x9d', '\x90', '\x98', '\x9e', '\x9f', '\x18', '\x1a',
    '0', '1', ';', '?', 'm', 'a', 'B', '(', '$', ' ', '/', '~', '@', '`', '\x7f', '\n', '\t', '漢', LAPTOP, '\u0301', ZWJ, SKINS[1]!, VS16,
    'é', '\x80', '\x85', 'c', 'N', '7'];
  let seed = 1;
  const next = (n: number): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const strings = [...named];
  for (let k = 0; k < 200_000; k++) {
    let s = '';
    for (let n = 1 + next(20); n > 0; n--) s += pieces[next(pieces.length)];
    strings.push(s);
  }
  const bad: string[] = [];
  for (const s of strings) {
    const want = bunWidth(s);
    const got = portableWidth(s);
    if (got !== want && bad.length < 20) bad.push(`${[...s].map((c) => 'U+' + c.codePointAt(0)!.toString(16)).join(' ')}: ${got}, Bun ${want}`);
  }
  expect(bad).toEqual([]);
}, 120_000);
