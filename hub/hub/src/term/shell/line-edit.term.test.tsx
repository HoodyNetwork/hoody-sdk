// The line the shell's overlays edit themselves (layer.tsx useLineEdit, LineView: the palette's and the menus' search).
// - A terminal sends a flag or a ZWJ emoji one code point per key, and the line took each; Backspace took one code point
//   back and left half of it (a lone regional letter, "👩‍"). It now takes the last grapheme.
// - A line longer than its row was drawn from its start and cut at the end with "…": what was just typed and the cursor
//   cell were not on screen. It now shows its end, the cursor cell last; a line that fits is drawn from its start.
//   Both ways in: a value the line opens with (drawn before its width is known) and one typed a key at a time.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../prim/testing';
import { Box, FocusRoot, setColourTier } from '../prim';
import { LineView, useLineEdit, type LineEdit } from './layer';
import type { HubKey } from './hubKey';

const INVERSE = 32;
let t: TestTerm | null = null;
let edit: LineEdit | null = null;
afterEach(async () => { await t?.dispose(); t = null; edit = null; setColourTier('truecolor'); });

function Line({ initial }: { initial: string }) {
  const e = useLineEdit(initial);
  edit = e;
  return <LineView edit={e} />;
}
const draw = (initial: string, width = 20) => drawTest(<FocusRoot><Box width={width}><Line initial={initial} /></Box></FocusRoot>, { width, height: 3 });
const press = (key: string, name = key): HubKey => ({ key, name, code: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false });
/** Keys as the terminal sends them (one per code point), then the line as drawn state (the hook's value is per render). */
const type = async (s: string): Promise<string> => { for (const cp of Array.from(s)) edit!.onKey(press(cp)); await t!.settle(); return edit!.value; };
const back = async (): Promise<string> => { edit!.onKey(press('Backspace', 'backspace')); await t!.settle(); return edit!.value; };

test('Backspace takes a whole flag and a whole ZWJ emoji, typed one code point per key', async () => {
  t = await draw('');
  expect(await type('a🇫🇷')).toBe('a🇫🇷');
  expect(await back()).toBe('a');
  expect(await type('👩‍👧')).toBe('a👩‍👧');
  expect(await back()).toBe('a');
  // A plain letter is still one key back.
  expect(await type('bc')).toBe('abc');
  expect(await back()).toBe('ab');
});

/** The row holding the line and the attributes of the cell at column x on it. */
function rowAt(term: TestTerm, frame: string): { row: string; attrs: (x: number) => number } {
  const y = frame.split('\n').findIndex((l) => l.startsWith('›'));
  expect(y, frame).toBeGreaterThanOrEqual(0);
  const spans = term.captureSpans().lines[y]!.spans;
  return {
    row: frame.split('\n')[y]!,
    attrs: (x) => { let c = 0; for (const sp of spans) { const w = (sp as { width?: number }).width ?? [...sp.text].length; if (x < c + w) return sp.attributes; c += w; } return 0; },
  };
}

/** The row shows the line's end, no "…", and the cursor cell right after its last character, inside the row. */
function endInView(term: TestTerm, frame: string): void {
  const r = rowAt(term, frame);
  expect(r.row, frame).not.toContain('…');
  expect(r.row, frame).toContain('0123');
  const x = r.row.indexOf('0123') + 4;
  expect(x, frame).toBeLessThan(20);
  expect(r.attrs(x) & INVERSE, frame).toBe(INVERSE);
}

test('mono, 20 columns: a long line shows its end and the cursor cell; a short one its start', async () => {
  setColourTier('mono');
  t = await draw('abcdefghijklmnopqrstuvwxyz0123');
  let f = await t.settle();
  endInView(t, f);
  // Positive control on the same view: a line that fits keeps its start, the cursor after it.
  await t.dispose();
  t = await draw('abc');
  f = await t.settle();
  const r = rowAt(t, f);
  expect(r.row.trimEnd(), f).toBe('› abc');
  expect(r.attrs(5) & INVERSE, f).toBe(INVERSE);
});

test('mono, 20 columns: typed one key at a time past the row, its end and the cursor cell stay in view', async () => {
  setColourTier('mono');
  t = await draw('');
  expect(await type('abcdefghijklmnopqrstuvwxyz0123')).toBe('abcdefghijklmnopqrstuvwxyz0123');
  endInView(t, await t.settle());
});
