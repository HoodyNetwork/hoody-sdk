// Files with two panes side by side in a wide terminal: the Splitter between them moves them. The web holds the split
// in an inline grid style the terminal Hub does not read, so a Splitter step said "55 %" while both panes kept their
// columns (a focusable control that changed nothing on screen). twoPanes.term.tsx draws the two slots as boxes that
// grow by the two shares: → widens pane A and pushes the Splitter and pane B right; Enter evens them again.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, focusedNode, queryAllByRole, semanticsOf, type SemNode } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

// The two-pane address and size of two-panes-side.term.test.tsx: both panes on one row.
const TWO = '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp&b=atlas.00a1&bp=%2Fsrv';

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const splitter = (): SemNode => {
  const found = queryAllByRole(tree(), 'separator', { name: 'Resize the two panes' });
  expect(found.length).toBe(1);
  return found[0]!;
};
/** The first column of pane B's Up one folder button (the right one of the two panes' buttons). */
const paneBUp = (): number => {
  const xs = queryAllByRole(tree(), 'button', { name: 'Up one folder' }).map((n) => n.box[0]).sort((x, y) => x - y);
  expect(xs.length).toBe(2);
  return xs[1]!;
};
const percent = (n: SemNode): number => Number(/^(\d+) %$/.exec(n.value ?? '')?.[1]);

test('200x50: → on the Splitter moves the Splitter and pane B right; Enter evens the panes again', async () => {
  s = await renderPage({ page: 'files', path: TWO, cols: 200, rows: 50 });
  await s.settle();
  expect(s.failures).toEqual([]);
  const before = splitter();
  expect(before.value).toBe('50 %');
  const sepAt = before.box[0];
  const upAt = paneBUp();

  act(before, 'focus');
  await s.settle();
  expect(focusedNode(tree())?.name).toBe('Resize the two panes');
  for (let i = 0; i < 3; i++) {
    await s.keys.press('right');
    await s.settle();
  }
  const moved = splitter();
  expect(percent(moved)).toBeGreaterThan(50);
  // What it says is what it draws: the Splitter and pane B start further right.
  expect(moved.box[0]).toBeGreaterThanOrEqual(sepAt + 3);
  expect(paneBUp()).toBeGreaterThanOrEqual(upAt + 3);

  await s.keys.press('return');
  await s.settle();
  const even = splitter();
  expect(even.value).toBe('50 %');
  expect(even.box[0]).toBe(sepAt);
  expect(paneBUp()).toBe(upAt);
  expect(s.failures).toEqual([]);
}, 120_000);
