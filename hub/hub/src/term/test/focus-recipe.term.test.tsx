// One focus recipe for a control that draws its own focused words: focusInk (prim/FocusInk.ts), the focus plate with the
// page ground as ink; bold and underlined in mono. A Text that takes `inverse` from its focus instead stands on a plate
// of its own word colour (grey for a muted word, green for a done step), a second look for the same state.
import { afterEach, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drawTest, type TestTerm } from '../prim/testing';
import { FocusRoot } from '../prim';
import { TRUECOLOR, setColourTier } from '../prim/tokens';
import { TabStrip } from '../../kit/layouts/termTabs';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; setColourTier('truecolor'); });

const SRC = join(import.meta.dir, '..', '..');
function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

test('no control takes inverse from its focus (focusInk is the recipe)', () => {
  const found: string[] = [];
  for (const file of sources(SRC)) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      // The one exception names the mono tier: the tab strip, whose open tab already is bold and underlined.
      for (const m of line.matchAll(/\binverse=\{([^}]*)\}/g)) if (/\bfocused\b/.test(m[1]!) && !m[1]!.includes("'mono'")) found.push(`${file.slice(SRC.length + 1)}:${i + 1}`);
    });
  }
  expect(found).toEqual([]);
});

type Span = { text: string; fg: { toInts(): number[] }; bg: { toInts(): number[] }; attributes?: number };
const hex = (c: { toInts(): number[] }): string => '#' + c.toInts().slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
const span = (word: string): Span => {
  const s = (t!.captureSpans().lines as unknown as { spans: Span[] }[]).flatMap((l) => l.spans).find((x) => x.text.includes(word));
  expect(s, t!.captureCharFrame()).toBeDefined();
  return s!;
};
const BOLD = 1, UNDERLINE = 8, INVERSE = 32;
const strip = <FocusRoot><TabStrip items={[{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }]} value="b" onChange={() => {}} /></FocusRoot>;

test('the focused tab stands on the focus plate, not on a plate of its own word colour', async () => {
  t = await drawTest(strip, { width: 40, height: 3 });
  t.mockInput.pressTab();
  await t.settle();
  const alpha = span('Alpha');
  expect(hex(alpha.bg)).toBe(TRUECOLOR.dark.focus);
  expect(hex(alpha.fg)).toBe(TRUECOLOR.dark.bg);
  // The open tab, not focused, keeps its own look.
  expect(hex(span('Beta').bg)).not.toBe(TRUECOLOR.dark.focus);
});

test('mono: the focused tab is bold, underlined and inverse; the open tab alone is not inverse', async () => {
  setColourTier('mono');
  t = await drawTest(strip, { width: 40, height: 3 });
  t.mockInput.pressTab();
  await t.settle();
  const a = span('Alpha').attributes ?? 0;
  expect(a & (BOLD | UNDERLINE | INVERSE)).toBe(BOLD | UNDERLINE | INVERSE);
  const b = span('Beta').attributes ?? 0;
  expect(b & (BOLD | UNDERLINE)).toBe(BOLD | UNDERLINE);
  expect(b & INVERSE).toBe(0);
});
