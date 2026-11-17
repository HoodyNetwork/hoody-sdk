// PaneSeparator in the terminal (the list/detail width handle). Its header promises a mouse
// drag that moves it a column per cell (8 px). The failure this catches: a drag that does nothing and a click that does
// not focus it, when the drag starts in the Box's onPress, which fires on a release, and the box's own raw onMouseUp
// replaces that release handler (Box.ts assigns `raw` after `onPress`), so no press reaches it.
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { focusedNode, getByRole, semanticsOf } from '../../term/prim/semantics';
import { PaneSeparator } from './PaneSeparator';

const RANGE = { min: 240, max: 640, def: 340 };
let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const tree = () => semanticsOf(t!.renderer as never);

/** A 20-column list, the handle at column 20, the detail after it. */
function Host({ log, dir }: { log: number[]; dir: 1 | -1 }) {
  const [w, setW] = useState(RANGE.def);
  return (
    <FocusRoot>
      <Box dir="row" width={60} height={6}>
        <Box width={20} shrink={0}><Text>List</Text></Box>
        <PaneSeparator value={w} range={RANGE} dir={dir} label="Resize list" onChange={(v) => { log.push(v); setW(v); }} />
        <Box grow={1}><Text>Detail</Text></Box>
      </Box>
    </FocusRoot>
  );
}
async function draw(dir: 1 | -1 = 1): Promise<number[]> {
  const log: number[] = [];
  t = await drawTest(<Host log={log} dir={dir} />, { width: 60, height: 6 });
  await t.settle();
  return log;
}
const handle = () => getByRole(tree(), 'separator', { name: 'Resize list' });
/** The column the handle is drawn at (its box). */
const col = () => handle().box[0];

// Catches the drag start at the press (PaneSeparator.term.tsx, raw onMouseDown: the focus and the drag's anchor),
// onMouseDrag (a column per 8 px, by `dir`, clamped to the range) and the drag's end.
test('a mouse drag moves the handle 8 px a column and focuses it; past the range it stops at the bound', async () => {
  const log = await draw();
  const x = col();
  expect(x).toBe(20);
  await t!.mockMouse.drag(x, 2, x + 5, 2);
  await t!.settle();
  expect(handle().value).toBe('380');
  expect(log.at(-1)).toBe(380);
  expect(focusedNode(tree())?.role).toBe('separator');
  expect(t!.captureCharFrame()).toContain('⇔');
  await t!.mockMouse.drag(x, 2, 0, 2);
  await t!.settle();
  expect(handle().value).toBe(String(RANGE.min));
});

// Catches `dir` in the drag (line 46: a handle whose pane is on the end side narrows it when dragged towards it).
test('dir -1: dragging right narrows the pane', async () => {
  const log = await draw(-1);
  const x = col();
  await t!.mockMouse.drag(x, 2, x + 2, 2);
  await t!.settle();
  expect(log.at(-1)).toBe(RANGE.def - 16);
});

// The keys, against the drawn value (lines 31-38): ←/→ 16 px, End and Home to the bounds, Enter back to the default;
// the ⇔ mark while it has the focus.
test('keys: Tab reaches it (⇔ drawn); →/← step 16 px, End/Home go to the bounds, Enter back to the default', async () => {
  await draw();
  expect(t!.captureCharFrame()).not.toContain('⇔');
  t!.mockInput.pressTab();
  await t!.settle();
  expect(focusedNode(tree())?.name).toBe('Resize list');
  expect(t!.captureCharFrame()).toContain('⇔');
  const steps: Array<[() => void, string]> = [
    [() => t!.mockInput.pressArrow('right'), '356'],
    [() => t!.mockInput.pressArrow('left'), '340'],
    [() => t!.mockInput.pressKey('END'), '640'],
    [() => t!.mockInput.pressArrow('right'), '640'],
    [() => t!.mockInput.pressKey('HOME'), '240'],
    [() => t!.mockInput.pressEnter(), '340'],
  ];
  for (const [press, want] of steps) {
    press();
    await t!.settle();
    expect(handle().value).toBe(want);
  }
});

// Catches the ⇔ mark drawn as selectable text (PaneSeparator.term.tsx, the mark is a TableMark): a press on the focused
// handle's mark started the engine's text selection, which took the drag and the release away from the handle, so the
// width never moved.
test('a drag that starts on the focused handle\'s ⇔ mark moves it', async () => {
  const log = await draw();
  t!.mockInput.pressTab();
  const rows = (await t!.settle()).split('\n');
  const x = col();
  const y = rows.findIndex((l) => l.includes('⇔'));
  expect(y).toBeGreaterThanOrEqual(0);
  expect((rows[y] ?? '').indexOf('⇔')).toBe(x); // the press lands on the mark itself
  await t!.mockMouse.drag(x, y, x + 5, y);
  await t!.settle();
  expect(handle().value).toBe('380');
  expect(log.at(-1)).toBe(380);
});
