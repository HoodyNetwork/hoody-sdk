// ItemList in the terminal (ItemList.term.tsx). ItemList.scenario.ts holds opening a row through its title, an inline
// action's press, the status words, the meta and a link row. These hold the drawing and the keyboard a person meets:
//   - order marks take two cells, right-aligned, so the titles of "1" and "10" start in one column
//   - the meta line sits under its title, two cells in, its parts apart with " · "; the details' facts under that
//   - a long title is cut with "…" while the row's actions stay whole at the line end
//   - Tab: an opening title, its inline action, then ⋯; a plain title is no stop; ⋯ opens the row's menu
//   - an inline action with a reason is still a stop, says why while focused and runs nothing
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../../term/prim/testing';
import { FocusRoot } from '../../../term/prim';
import { OverlayHost } from '../../../term/prim/Overlay';
import { ItemList } from './ItemList';
import type { ItemProps } from './types';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const draw = async (items: readonly ItemProps[], width = 70, height = 16): Promise<string> => {
  t = await drawTest(<FocusRoot><OverlayHost><ItemList label="Steps" items={items} /></OverlayHost></FocusRoot>, { width, height });
  return t.settle();
};
const step = async (fn: () => void): Promise<string> => { fn(); return t!.settle(); };
const lines = (f: string) => f.split('\n');
const rowOf = (f: string, s: string): number => lines(f).findIndex((l) => l.includes(s));

// Catches the mark's padStart(2) (line 40), the meta line under the title with its " · " join (line 54) and the facts
// under the row (line 55).
test('marks line the titles up; the meta sits under its title with " · "; the facts under the row', async () => {
  const f = await draw([
    { id: 'a', title: 'Build the image', mark: '1', meta: ['2 min', 'yesterday'] },
    { id: 'b', title: 'Deploy', mark: '10', details: [{ label: 'Since', value: 'Monday' }] },
  ]);
  const build = rowOf(f, 'Build the image');
  const deploy = rowOf(f, 'Deploy');
  expect(lines(f)[build]).toContain(' 1 Build the image');
  expect(lines(f)[deploy]).toContain('10 Deploy');
  expect(lines(f)[build]!.indexOf('Build')).toBe(lines(f)[deploy]!.indexOf('Deploy'));
  expect(rowOf(f, '2 min · yesterday')).toBe(build + 1);
  expect(lines(f)[build + 1]!.indexOf('2 min')).toBe(2); // the list starts at column 0; the meta two cells in
  const since = rowOf(f, 'Since');
  expect(since).toBeGreaterThan(deploy);
  expect(lines(f)[since]).toContain('Monday');
});

// Catches the title's truncate (lines 25, 29) and the actions' shrink={0} (line 48): squeezed, the title gives way.
test('a long title is cut with "…"; its inline action and ⋯ stay whole on the same line', async () => {
  const f = await draw([{
    id: 'a', title: 'Build the image for every architecture this project ships to', onOpen: () => {},
    actions: { inline: [{ id: 'rerun', label: 'Run again', onPress: () => {} }], menu: [{ id: 'logs', label: 'Logs', onAction: () => {} }] },
  }], 44, 8);
  const top = lines(f)[rowOf(f, 'Build the')]!;
  expect(top).toContain('…');
  expect(top).not.toContain('ships to');
  expect(top).toContain('[Run again]');
  expect(top).toContain('[⋯]');
});

// Catches the opening title as a stop (lines 22-27), the plain title as none (line 29), the inline actions and the
// menu (lines 49-50) and an action with a reason drawn as a ReasonButton (ActionBar.term.tsx ActionControl).
test('Tab: the opening title, its action, ⋯, then the next row\'s reasoned action (its plain title is no stop); ⋯ opens the menu', async () => {
  const log: string[] = [];
  let f = await draw([
    { id: 'a', title: 'Build the image', onOpen: () => log.push('open'),
      actions: { inline: [{ id: 'rerun', label: 'Run again', onPress: () => log.push('rerun') }], menu: [{ id: 'logs', label: 'Logs', onAction: () => log.push('logs') }] } },
    { id: 'b', title: 'Deploy', actions: { inline: [{ id: 'go', label: 'Deploy now', disabledReason: 'Stop the computer first', onPress: () => log.push('go') }] } },
  ]);
  expect(f).not.toContain('Stop the computer first');
  await step(() => t!.mockInput.pressTab());
  await step(() => t!.mockInput.pressEnter());
  expect(log).toEqual(['open']);
  await step(() => t!.mockInput.pressTab());
  await step(() => t!.mockInput.pressEnter());
  expect(log).toEqual(['open', 'rerun']);
  f = await step(() => t!.mockInput.pressTab()); // ⋯
  expect(f).not.toContain('Logs');
  f = await step(() => t!.mockInput.pressTab()); // past the plain title "Deploy", onto Deploy now
  expect(f).toContain('Stop the computer first');
  await step(() => t!.mockInput.pressEnter());
  expect(log).toEqual(['open', 'rerun']);
  f = await step(() => t!.mockInput.pressTab({ shift: true })); // back on ⋯
  expect(f).not.toContain('Stop the computer first');
  f = await step(() => t!.mockInput.pressEnter());
  expect(f).toContain('Logs');
  await step(() => t!.mockInput.pressEnter());
  expect(log).toEqual(['open', 'rerun', 'logs']);
});
