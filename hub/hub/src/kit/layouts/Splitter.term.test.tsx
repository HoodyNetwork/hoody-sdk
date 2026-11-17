// Splitter in the terminal (the board's pane divider, percentages). Its header promises a
// mouse drag that reports cell positions as px (×8 across, ×16 down). The failure this catches: a drag that reports
// nothing and a click that does not focus it, when the drag starts in the Box's onPress, which fires on a release, and
// the box's own raw onMouseUp replaces that release handler (Box.ts assigns `raw` after `onPress`), so no press reaches it.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { focusedNode, getByRole, semanticsOf } from '../../term/prim/semantics';
import { Splitter } from './Splitter';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const tree = () => semanticsOf(t!.renderer as never);

async function draw(log: string[], orientation: 'vertical' | 'horizontal'): Promise<void> {
  const split = (
    <Splitter
      orientation={orientation} value={50} label="Resize the panes"
      onStep={(d) => log.push(`step ${d}`)} onEqualise={() => log.push('equal')}
      onDragStart={() => log.push('start')} onDrag={(x, y) => log.push(`drag ${x},${y}`)} onDragEnd={() => log.push('end')}
    />
  );
  t = await drawTest(
    <FocusRoot>
      {orientation === 'vertical' ? (
        <Box dir="row" width={60} height={8}>
          <Box width={20} shrink={0}><Text>Left</Text></Box>{split}<Box grow={1}><Text>Right</Text></Box>
        </Box>
      ) : (
        <Box dir="column" width={60} height={12}>
          <Box height={4} shrink={0}><Text>Top</Text></Box>{split}<Box grow={1}><Text>Bottom</Text></Box>
        </Box>
      )}
    </FocusRoot>,
    { width: 60, height: 12 },
  );
  await t.settle();
}
const divider = () => getByRole(tree(), 'separator', { name: 'Resize the panes' });

// Catches the drag start at the press (Splitter.term.tsx, raw onMouseDown: the focus and onDragStart once), onMouseDrag
// (cells as px, ×8 across) and the end (onDragEnd once).
test('vertical: a mouse drag starts once, reports the pointer as px (×8 across), ends once; it focuses the divider', async () => {
  const log: string[] = [];
  await draw(log, 'vertical');
  const [x] = divider().box;
  expect(x).toBe(20);
  await t!.mockMouse.drag(x!, 3, x! + 5, 3);
  await t!.settle();
  expect(log[0]).toBe('start');
  expect(log.filter((l) => l === 'start')).toHaveLength(1);
  expect(log.filter((l) => l.startsWith('drag')).at(-1)).toBe(`drag ${(x! + 5) * 8},${3 * 16}`);
  expect(log.at(-1)).toBe('end');
  expect(log.filter((l) => l === 'end')).toHaveLength(1);
  expect(focusedNode(tree())?.role).toBe('separator');
});

// The same for stacked panes (×16 down), and the keys of each orientation (lines 17-21): ↑/↓ step 5 points when
// stacked, ←/→ when side by side (the other pair does nothing), Enter equalises.
test('horizontal: a drag down reports ×16 px; ↑/↓ step, ←/→ do nothing, Enter equalises', async () => {
  const log: string[] = [];
  await draw(log, 'horizontal');
  const [, y] = divider().box;
  expect(y).toBe(4);
  await t!.mockMouse.drag(10, y!, 10, y! + 3);
  await t!.settle();
  expect(log.filter((l) => l.startsWith('drag')).at(-1)).toBe(`drag ${10 * 8},${(y! + 3) * 16}`);
  log.length = 0;
  t!.mockInput.pressArrow('down');
  t!.mockInput.pressArrow('up');
  t!.mockInput.pressArrow('left');
  t!.mockInput.pressEnter();
  await t!.settle();
  expect(log).toEqual(['step 5', 'step -5', 'equal']);
});

// Catches the ⇔ mark drawn as selectable text (Splitter.term.tsx, the mark is a TableMark): a press on the focused
// divider's mark started the engine's text selection, which took the drag and the release away from the divider, so
// nothing was reported after onDragStart and onDragEnd never ran.
test('a drag that starts on the focused divider\'s ⇔ mark reports the pointer and ends once', async () => {
  const log: string[] = [];
  await draw(log, 'vertical');
  t!.mockInput.pressTab();
  const rows = (await t!.settle()).split('\n');
  const [x] = divider().box;
  const y = rows.findIndex((l) => l.includes('⇔'));
  expect(y).toBeGreaterThanOrEqual(0);
  expect((rows[y] ?? '').indexOf('⇔')).toBe(x); // the press lands on the mark itself
  await t!.mockMouse.drag(x, y, x + 5, y);
  await t!.settle();
  expect(log.filter((l) => l === 'start')).toHaveLength(1);
  expect(log.filter((l) => l.startsWith('drag')).at(-1)).toBe(`drag ${(x + 5) * 8},${y * 16}`);
  expect(log.filter((l) => l === 'end')).toHaveLength(1);
  expect(log.at(-1)).toBe('end');
});
