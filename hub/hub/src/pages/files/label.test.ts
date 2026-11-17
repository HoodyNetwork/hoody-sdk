// Vitest: safeLabel: a file name as a one-line label for Open with's drawer, statuses and
// the launch's row name. The preview's escaper (shared, not forked) plus tab and line feed; cut by grapheme with "…".
import { describe, expect, it } from 'vitest';
import { LABEL_MAX, safeLabel } from './label';
import { OW_LABEL_UNITS, OW_PROGRAM_MAX } from '../apps/links';
import { escapeUnsafe, textOf } from './ro';

describe('safeLabel', () => {
  it('leaves a plain name as it is', () => {
    expect(safeLabel('a b.txt')).toBe('a b.txt');
    expect(safeLabel('ünï 文件.txt')).toBe('ünï 文件.txt');
    expect(safeLabel(`it's "q" $x.txt`)).toBe(`it's "q" $x.txt`);
  });
  it('writes out bidirectional and invisible format characters', () => {
    // U+202E (right-to-left override) would show "txt.exe" as "exe.txt".
    expect(safeLabel('a‮txt.exe')).toBe('a\\u202Etxt.exe');
    expect(safeLabel('x؜y​z⁦w﻿')).toBe('x\\u061Cy\\u200Bz\\u2066w\\uFEFF');
    expect(safeLabel('p\u2028q')).toBe('p\\u2028q');
  });
  it('writes out C0 and C1 controls and DEL', () => {
    expect(safeLabel('a\u001b[31mred')).toBe('a\\x1B[31mred');
    expect(safeLabel('a\rb\u007fc\u0085d')).toBe('a\\x0Db\\x7Fc\\x85d');
  });
  it('writes out tab and line feed too: a label is one line', () => {
    expect(safeLabel('a\tb\nc')).toBe('a\\x09b\\x0Ac');
    expect(safeLabel('a\tb\nc')).not.toMatch(/[\t\n]/);
    // The preview keeps them (its text is many lines): the same escaper, the label adds the two.
    expect(escapeUnsafe('a\tb\nc')).toBe('a\tb\nc');
    expect(textOf(new TextEncoder().encode('a\tb‮c'))).toBe('a\tb\\u202Ec');
  });
  it('cuts at 80 graphemes with "…", never inside a grapheme', () => {
    const long = 'x'.repeat(200);
    expect(safeLabel(long)).toBe('x'.repeat(LABEL_MAX - 1) + '…');
    expect([...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(safeLabel(long))]).toHaveLength(LABEL_MAX);
    // A family emoji is one grapheme; its joiners are written out (\u200D), and the cut keeps or drops it whole.
    const fam = '👨‍👩‍👧';
    const famOut = '👨\\u200D👩\\u200D👧';
    expect(safeLabel(fam)).toBe(famOut);
    expect(safeLabel(fam.repeat(100), 31)).toBe(famOut.repeat(2) + '…');
    expect(safeLabel(fam.repeat(100), 5)).toBe('…');
    // A written-out character is never cut into a misleading part ("\u2…").
    expect(safeLabel('a‮bcdef', 4)).toBe('a…');
    expect(safeLabel('a‮bcdef', 9)).toBe('a\\u202Eb…');
    expect(safeLabel('abc', 3)).toBe('abc');
    expect(safeLabel('abcd', 3)).toBe('ab…');
  });
  it('row_name_never_cut_after_labelling: with the units bound, "‹longest program› · ‹label›" fits the stored 80 units and ends on a whole written-out character', () => {
    const program = 'x'.repeat(OW_PROGRAM_MAX);
    for (const name of ['\u202E'.repeat(40), 'a\u202E'.repeat(30), '😀'.repeat(60), 'é'.repeat(200), '👨‍👩‍👧'.repeat(30)]) {
      const label = safeLabel(name, LABEL_MAX, OW_LABEL_UNITS);
      expect(label.length).toBeLessThanOrEqual(OW_LABEL_UNITS);
      expect(`${program} · ${label}`.length).toBeLessThanOrEqual(80);
      expect(label).not.toMatch(/\\(?:u[0-9A-F]{0,3}|x[0-9A-F]?)…$/);
    }
    expect(safeLabel('a\u202Ebcdef', LABEL_MAX, 4)).toBe('a…');
    expect(safeLabel('short.txt', LABEL_MAX, OW_LABEL_UNITS)).toBe('short.txt');
  });
});
