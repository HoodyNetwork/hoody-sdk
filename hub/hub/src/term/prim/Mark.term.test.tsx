// The Hoody mark (prim/Mark.ts) and the theme a terminal names (app/run.ts terminalTheme).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Each size fills exactly its box, at 80x24, 120x40 and 200x50, and draws nothing outside it | 'fits its box <size> <cols>x<rows>' |
// | 2 | The large mark is square as seen (a cell is twice as tall as wide) and is the web logo's shape: a plate with the h cut out, the stem broken where the arch leaves it | 'the large mark is the logo' |
// | 3 | The small mark is an h of three cells: a half-block stem, then the arch as a heavy line turning down | 'the small mark is the logo' |
// | 4 | No room for the large mark: the small one is drawn | 'falls back to the small mark' |
// | 5 | Without colour the shape still reads: large = blocks and blanks with no colour named; small = the terminal's inverse | 'without colour <size>' |
// | 6 | In colour the cut is the dark of the accent plate (dark theme) and the reverse on a light terminal | 'colours <theme>' |
// | 7 | The mark is decoration: not in the semantics tree | 'hidden from semantics' |
// | 8 | The terminal's answer decides the theme; no answer, a throw or anything else is null | 'terminalTheme' |
import { afterEach, expect, test } from 'bun:test';
import { TextAttributes } from './otui';
import { drawTest } from './testing';
import { Box, Mark, MARK_SIZE, markSizeFor, Text } from './index';
import { MARK_LG, MARK_SM } from './Mark';
import { TRUECOLOR, setColourTier, setThemeMode, type ThemeMode } from './tokens';
import { terminalTheme, THEME_WAIT_MS } from '../app/run';

afterEach(() => { setColourTier('truecolor'); setThemeMode('dark'); });

const SIZES = [[80, 24], [120, 40], [200, 50]] as const;
/** The mark at (2, 1) between two words, on an otherwise empty screen. */
const Stage = ({ size }: { size: 'sm' | 'lg' }) => (
  <Box dir="column" pad={{ top: 1, left: 2 }}>
    <Box dir="row" gap={1}><Mark size={size} /><Text>after</Text></Box>
    <Text>below</Text>
  </Box>
);
const cells = (line: string): string[] => [...line];

for (const size of ['sm', 'lg'] as const) {
  for (const [w, h] of SIZES) {
    test(`fits its box ${size} ${w}x${h}`, async () => {
      const t = await drawTest(<Stage size={size} />, { width: w, height: h });
      const lines = (await t.settle()).split('\n');
      const { cols, rows } = MARK_SIZE[size];
      const want = size === 'sm' ? [MARK_SM] : MARK_LG;
      for (let r = 0; r < rows; r++) {
        const row = cells(lines[1 + r]!);
        expect(row.slice(0, 2).join('')).toBe('  ');
        expect(row.slice(2, 2 + cols).join('')).toBe(want[r]!);
        // One blank after the box, then the next thing on the first row; nothing on the others.
        expect(row.slice(2 + cols).join('').trimEnd()).toBe(r === 0 ? ' after' : '');
      }
      expect(lines[1 + rows]!.trimEnd()).toBe('  below');
      t.renderer.destroy();
    });
  }
}

test('the large mark is the logo', () => {
  const { cols, rows } = MARK_SIZE.lg;
  expect(MARK_LG.length).toBe(rows);
  for (const l of MARK_LG) { expect(cells(l).length).toBe(cols); expect(/^[█ ]+$/.test(l)).toBe(true); }
  expect<number>(cols).toBe(rows * 2); // square as seen
  // The plate's rim is whole; the stem is cut in the same columns above and below the arch's row, and is broken there
  // (the plate shows where the arch leaves it); the arch runs from the stem to the right leg, and the leg comes down in
  // the row below, as on the brand's 16 grid (stem x 2.5-4.5, arch x 4.5-13.5 at y 8.5-10.5, leg x 11.5-13.5).
  expect(MARK_LG[0]).toBe('█'.repeat(cols));
  expect(MARK_LG[rows - 1]).toBe('█'.repeat(cols));
  const cut = (l: string): number[] => cells(l).flatMap((c, i) => (c === ' ' ? [i] : []));
  for (const r of [1, 2, 3]) expect(cut(MARK_LG[r]!)).toEqual([2, 3]);
  expect(cut(MARK_LG[4]!)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
  expect(cut(MARK_LG[5]!)).toEqual([2, 3, 10, 11]);
});

test('the small mark is the logo', () => {
  // U+2590 fills the right half of its cell: the stem, touching the arch's cell. U+2501 is the heavy line that crosses
  // its whole cell at mid height, and U+2513 the heavy line coming in from the left and turning down: the arch and its
  // leg. Three cells and a cell twice as tall as wide: the h is about as wide as it is tall, as the logo's. All three
  // are in the block-element and box-drawing blocks every terminal font carries.
  expect(cells(MARK_SM)).toEqual(['\u2590', '\u2501', '\u2513']);
  expect(cells(MARK_SM).length).toBe(MARK_SIZE.sm.cols);
});

test('falls back to the small mark', async () => {
  expect(markSizeFor('lg')).toBe('lg');
  expect(markSizeFor('lg', { cols: 14, rows: 7 })).toBe('lg');
  expect(markSizeFor('lg', { cols: 13, rows: 7 })).toBe('sm');
  expect(markSizeFor('lg', { cols: 40, rows: 6 })).toBe('sm');
  expect(markSizeFor('lg', { cols: -3, rows: -1 })).toBe('sm');
  expect(markSizeFor('sm', { cols: 0, rows: 0 })).toBe('sm');
  const t = await drawTest(<Box pad={{ top: 1, left: 2 }}><Mark size="lg" fit={{ cols: 80, rows: 1 }} /></Box>, { width: 80, height: 24 });
  const f = await t.settle();
  expect(f).toContain(MARK_SM);
  expect(f).not.toContain('█');
  t.renderer.destroy();
});

/** The spans of the mark's rows: [text, fg, bg, attributes] with colours as #rrggbb or 'default'. */
async function spansOf(size: 'sm' | 'lg') {
  const t = await drawTest(<Stage size={size} />, { width: 80, height: 24 });
  await t.settle();
  const hex = (c: { r: number; g: number; b: number; a: number; intent?: string }): string =>
    (c.intent === 'default' || c.a === 0 ? 'default' : '#' + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join(''));
  const frame = t.captureSpans();
  const out = frame.lines.slice(1, 1 + MARK_SIZE[size].rows).map((l) => l.spans.map((s) => ({ text: s.text, fg: hex(s.fg as never), bg: hex(s.bg as never), attributes: s.attributes })));
  t.renderer.destroy();
  return out;
}
const markSpans = (rows: Awaited<ReturnType<typeof spansOf>>) => rows.flatMap((r) => r.filter((s) => /[\u2588\u2590\u2501\u2513]/.test(s.text)));

for (const size of ['sm', 'lg'] as const) {
  test(`without colour ${size}`, async () => {
    setColourTier('mono');
    const rows = await spansOf(size);
    const marks = markSpans(rows);
    expect(marks.length).toBeGreaterThan(0);
    // The word beside the mark names no colour either: the mark's cells carry exactly what plain words carry.
    const plain = rows[0]!.find((s) => s.text.includes('after'))!;
    expect(plain).toBeDefined();
    for (const s of marks) {
      expect(s.fg).toBe(plain.fg);
      expect(s.bg).toBe(plain.bg);
      // Small: the terminal's own inverse makes the plate. Large: the blocks are the plate, nothing is inverted.
      expect((s.attributes & TextAttributes.INVERSE) !== 0).toBe(size === 'sm');
    }
  });
}

for (const theme of ['dark', 'light'] as ThemeMode[]) {
  test(`colours ${theme}`, async () => {
    setThemeMode(theme);
    const T = TRUECOLOR[theme];
    // Small: the h is the cut, written on the plate. Large: the blocks are the plate, the blanks show the cut.
    const sm = markSpans(await spansOf('sm'));
    const lg = markSpans(await spansOf('lg'));
    expect(sm.length).toBe(1);
    expect(lg.length).toBeGreaterThanOrEqual(MARK_SIZE.lg.rows);
    for (const s of sm) { expect(s.fg).toBe(T.markCut); expect(s.bg).toBe(T.markPlate); expect(s.attributes & TextAttributes.INVERSE).toBe(0); }
    for (const s of lg) { expect(s.fg).toBe(T.markPlate); expect(s.bg).toBe(T.markCut); }
  });
}

test('hidden from semantics', async () => {
  // A button named by its content: the mark inside adds nothing to the name.
  const t = await drawTest(<Box sem={{ role: 'button' }}><Box dir="row" gap={1}><Mark /><Mark size="lg" /><Text>Hoody</Text></Box></Box>, { width: 80, height: 24 });
  expect(await t.settle()).toContain(MARK_SM);
  const { semanticsOf, semText } = await import('./semantics');
  const text = semText(semanticsOf(t.renderer as never));
  expect(text).toContain('Hoody');
  expect(text).not.toContain('█');
  expect(text).not.toContain(MARK_SM);
  t.renderer.destroy();
});

test('terminalTheme', async () => {
  expect(await terminalTheme({ themeMode: 'light' })).toBe('light');
  expect(await terminalTheme({ themeMode: 'dark' })).toBe('dark');
  let asked = -1;
  expect(await terminalTheme({ themeMode: null, waitForThemeMode: async (ms) => { asked = ms; return 'light'; } })).toBe('light');
  expect(asked).toBe(THEME_WAIT_MS);
  expect(await terminalTheme({ themeMode: null, waitForThemeMode: async () => null })).toBeNull();
  expect(await terminalTheme({ waitForThemeMode: async () => { throw new Error('gone'); } })).toBeNull();
  expect(await terminalTheme({ themeMode: 'sepia' as never })).toBeNull();
  expect(await terminalTheme({})).toBeNull();
});
