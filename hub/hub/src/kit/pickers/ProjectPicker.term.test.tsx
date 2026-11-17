// ProjectPicker in the terminal: the trigger and every row show the project's own colour as one swatch cell. The web
// sets that colour as an inline style on an empty span, which the terminal does not read, so the picker drew a blank
// gap before each name. The square is now ComputerPicker's ColourSquare piece.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, PaneSize, setColourTier } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { ProjectPicker, type ProjectChoice } from './ProjectPicker';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; setColourTier('truecolor'); });

const PROJECTS: ProjectChoice[] = [
  { id: 'p1', name: 'Home base', color: '#3B82F6' },
  { id: 'p2', name: 'Acme storefront', color: '#10B981' },
  { id: 'p3', name: 'Plain' },
];

const draw = async () => {
  t = await drawTest(<FocusRoot><OverlayHost><PaneSize><ProjectPicker label="Project" projects={PROJECTS} value="p1" onChange={() => {}} /></PaneSize></OverlayHost></FocusRoot>, { width: 80, height: 20 });
  return t.settle();
};
const open = async () => { t!.mockInput.pressTab(); await t!.settle(); t!.mockInput.pressEnter(); return t!.settle(); };

/** The colour (r, g, b) of the swatch cell that stands before `name` on its line, or null when there is none. */
function swatchBefore(name: string, from = 0): number[] | null {
  const lines = t!.captureSpans().lines;
  for (const line of lines.slice(from)) {
    const cells: Array<{ ch: string; fg: number[] }> = [];
    for (const sp of line.spans) for (const ch of [...sp.text]) cells.push({ ch, fg: sp.fg.toInts().slice(0, 3) });
    const at = cells.map((c) => c.ch).join('').indexOf(name);
    if (at < 0) continue;
    const before = cells.slice(Math.max(0, at - 3), at).filter((c) => c.ch === '█');
    return before.length ? before[before.length - 1]!.fg : null;
  }
  return null;
}

test('the trigger shows the picked project with its colour', async () => {
  setColourTier('truecolor');
  const frame = await draw();
  expect(frame).toMatch(/█ ?Home base/);
  expect(swatchBefore('Home base')).toEqual([0x3b, 0x82, 0xf6]);
});

test('each row of the open list has its own colour; a project without one has none', async () => {
  setColourTier('truecolor');
  await draw();
  const frame = await open();
  expect(frame).toContain('Acme storefront');
  expect(swatchBefore('Acme storefront')).toEqual([0x10, 0xb9, 0x81]);
  expect(swatchBefore('Plain')).toBeNull();
});

test('mono draws no swatch (the name carries the meaning)', async () => {
  setColourTier('mono');
  const frame = await draw();
  expect(frame).toContain('Home base');
  expect(frame).not.toContain('█');
});
