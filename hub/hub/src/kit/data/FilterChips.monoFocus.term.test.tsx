// FilterChips with colour off (the mono tier, NO_COLOR). A chip's × and "Clear all" showed their focus by colour alone
// (ink on the selected plate; ink for muted), so with colour off Tab landed on them with nothing on screen to say so.
// In mono the focused × is bold and underlined, and the focused "Clear all" (always underlined) is bold too
// (focusMark); the colour tiers draw both as before.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, setColourTier } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { FilterChips, type FilterChip } from './FilterChips';

const BOLD = 1;
const UNDERLINE = 8;
let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; setColourTier('truecolor'); });

const filters = (): FilterChip[] => [
  { id: 'state', label: 'State', options: [{ value: 'failed', label: 'Failed' }], kind: 'single', value: 'failed', onChange: () => undefined },
  { id: 'kind', label: 'Kind', options: [{ value: 'web', label: 'Web' }], kind: 'single', value: 'web', onChange: () => undefined },
];
const draw = async (): Promise<string> => {
  t = await drawTest(<FocusRoot><OverlayHost><FilterChips filters={filters()} /></OverlayHost></FocusRoot>, { width: 80, height: 8 });
  return t.settle();
};
const tab = async (): Promise<string> => { t!.mockInput.pressTab(); return t!.settle(); };

/** Bold and underline of the cell at (x, y) as last drawn. */
function marks(x: number, y: number): number {
  const lines = (t!.renderer as unknown as { currentRenderBuffer: { getSpanLines(): { spans: { text: string; attributes: number; width?: number }[] }[] } }).currentRenderBuffer.getSpanLines();
  let at = 0;
  for (const sp of lines[y]?.spans ?? []) {
    const w = sp.width ?? [...sp.text].length;
    if (x < at + w) return sp.attributes & (BOLD | UNDERLINE);
    at += w;
  }
  return 0;
}
/** Where `text` starts in the frame: [x, y] in cells. */
function at(frame: string, text: string, nth = 0): [number, number] {
  const rows = frame.split('\n');
  let seen = 0;
  for (let y = 0; y < rows.length; y++) {
    const cells = [...rows[y]!];
    for (let x = 0; x <= cells.length - [...text].length; x++) {
      if (cells.slice(x, x + [...text].length).join('') === text && seen++ === nth) return [x, y];
    }
  }
  throw new Error(`"${text}" (${nth}) is not in the frame:\n${frame}`);
}

test('mono: the focused × of a chip is bold and underlined; an unfocused one is neither', async () => {
  setColourTier('mono');
  let f = await draw();
  expect(f).toContain('State: Failed ×');
  expect(f).toContain('Kind: Web ×');
  f = await tab(); // the State chip
  expect(marks(...at(f, '×', 0))).toBe(0);
  f = await tab(); // its ×
  expect(marks(...at(f, '×', 0))).toBe(BOLD | UNDERLINE);
  expect(marks(...at(f, '×', 1))).toBe(0);
  f = await tab(); // the Kind chip: the first × is plain again
  expect(marks(...at(f, '×', 0))).toBe(0);
});

test('mono: "Clear all" is underlined at rest and bold as well while focused', async () => {
  setColourTier('mono');
  let f = await draw();
  expect(marks(...at(f, 'Clear all'))).toBe(UNDERLINE);
  for (let i = 0; i < 5; i++) f = await tab(); // State, its ×, Kind, its ×, Clear all
  expect(marks(...at(f, 'Clear all'))).toBe(BOLD | UNDERLINE);
});

test('with colour the × and "Clear all" take no bold or extra underline from focus', async () => {
  let f = await draw();
  f = await tab(); f = await tab(); // the State chip's ×
  expect(marks(...at(f, '×', 0))).toBe(0);
  for (let i = 0; i < 3; i++) f = await tab(); // Clear all
  expect(marks(...at(f, 'Clear all'))).toBe(UNDERLINE);
});
