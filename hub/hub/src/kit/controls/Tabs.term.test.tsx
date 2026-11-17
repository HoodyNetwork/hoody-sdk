// Tabs.term: the web component's observable behaviours, each held here.
// - the open tab reads in mono: "▸ Label"; the others "  Label"; a badge follows its label, with its unit ("3 tasks")
// - no value / a disabled value = the first enabled tab
// - one Tab stop: Right/Left move and select (wrapping, skipping disabled), Home/End the ends; onChange(id) per change
// - only the open tab's panel is rendered (item content), or `children` as the open tab's body (bar-only tabs)
// - a strip wider than its room (80 cols) shows the run around the open tab and counts the hidden ones ("‹ n" / "n ›"),
//   keeps the open tab in view as it moves, and every tab stays reachable by keys
// - `end` sits on the strip's row
// - tabWindow (pure): all when they fit; the window always holds `at`; markers fit inside the room
// - dropIndex (pure): the same drop-position rule as the web's Tabs
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot, Text } from '../../term/prim';
import { Tabs, type TabItem } from './Tabs';
import { TAB_MORE_CELLS, dropIndex, tabWindow } from './Tabs.pure';

const items: TabItem[] = [
  { id: 'over', label: 'Overview', content: <Text>overview body</Text> },
  { id: 'tasks', label: 'Tasks', badge: 3, badgeUnit: (n) => (n === 1 ? 'task' : 'tasks'), content: <Text>tasks body</Text> },
  { id: 'off', label: 'Billing', isDisabled: true, content: <Text>billing body</Text> },
  { id: 'logs', label: 'Logs', content: <Text>logs body</Text> },
];

function P({ got, initial, list = items, end }: { got: string[]; initial?: string; list?: TabItem[]; end?: string }) {
  const [v, setV] = useState<string | undefined>(initial);
  return (
    <FocusRoot>
      <Tabs label="Sections" items={list} value={v} end={end ? <Text>{end}</Text> : undefined} onChange={(x) => { got.push(x); setV(x); }} />
    </FocusRoot>
  );
}

test('marks, badge with unit, only the open panel', async () => {
  const t = await drawTest(<P got={[]} />, { width: 80, height: 6 });
  const f = t.captureCharFrame();
  expect(f).toContain('▸ Overview');
  expect(f).toContain('  Tasks 3 tasks');
  expect(f).toContain('overview body');
  expect(f).not.toContain('tasks body');
  expect(f).not.toContain('logs body');
  t.renderer.destroy();
});

test('a disabled value opens the first enabled tab', async () => {
  const t = await drawTest(<P got={[]} initial="off" />, { width: 80, height: 6 });
  expect(t.captureCharFrame()).toContain('▸ Overview');
  t.renderer.destroy();
});

test('keys: Right skips disabled and wraps, Left back, Home/End; panel follows', async () => {
  const got: string[] = [];
  const t = await drawTest(<P got={got} initial="tasks" />, { width: 80, height: 6 });
  t.mockInput.pressTab();
  t.mockInput.pressArrow('right');
  let f = await t.settle();
  expect(got).toEqual(['logs']);
  expect(f).toContain('▸ Logs');
  expect(f).toContain('logs body');
  expect(f).not.toContain('tasks body');
  t.mockInput.pressArrow('right');
  await t.settle();
  t.mockInput.pressArrow('left');
  await t.settle();
  t.mockInput.pressKey('HOME');
  await t.settle();
  t.mockInput.pressKey('END');
  f = await t.settle();
  expect(got).toEqual(['logs', 'over', 'logs', 'over', 'logs']);
  t.renderer.destroy();
});

test('bar-only tabs: children are the open tab body; end on the strip row', async () => {
  const bare: TabItem[] = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }];
  function B() {
    const [v, setV] = useState('a');
    return <FocusRoot><Tabs label="X" items={bare} value={v} onChange={setV} end={<Text>3 open</Text>}><Text>{`body of ${v}`}</Text></Tabs></FocusRoot>;
  }
  const t = await drawTest(<B />, { width: 60, height: 6 });
  let f = t.captureCharFrame();
  expect(f).toContain('body of a');
  expect(f.split('\n')[0]).toMatch(/▸ Alpha.*3 open/);
  t.mockInput.pressTab();
  t.mockInput.pressArrow('right');
  f = await t.settle();
  expect(f).toContain('body of b');
  t.renderer.destroy();
});

test('80 cols: overflow shows the run around the open tab with hidden counts; keys reach every tab', async () => {
  const many: TabItem[] = Array.from({ length: 14 }, (_, i) => ({ id: `t${i}`, label: `Section ${i}` }));
  const got: string[] = [];
  const t = await drawTest(<P got={got} list={many} />, { width: 80, height: 4 });
  let f = t.captureCharFrame();
  let strip = f.split('\n')[0]!;
  expect(strip).toContain('▸ Section 0');
  expect(strip).toMatch(/\d+ ›/);
  expect(strip).not.toContain('Section 13');
  t.mockInput.pressTab();
  t.mockInput.pressKey('END');
  f = await t.settle();
  strip = f.split('\n')[0]!;
  expect(got).toEqual(['t13']);
  expect(strip).toContain('▸ Section 13');
  expect(strip).toMatch(/‹ \d+/);
  expect(strip).not.toContain('Section 0 ');
  t.renderer.destroy();
});

test('tabWindow and dropIndex (pure)', () => {
  expect(tabWindow([10, 10, 10], 1, 30)).toEqual({ from: 0, to: 3 });
  const w = tabWindow([10, 10, 10, 10, 10, 10], 4, 30);
  expect(w.from <= 4 && w.to > 4).toBe(true);
  const sum = [10, 10, 10, 10, 10, 10].slice(w.from, w.to).reduce((a, b) => a + b, 0) + (w.from > 0 ? TAB_MORE_CELLS : 0) + (w.to < 6 ? TAB_MORE_CELLS : 0);
  expect(sum).toBeLessThanOrEqual(30);
  expect(tabWindow([50], 0, 10)).toEqual({ from: 0, to: 1 });
  expect(dropIndex(0, 2, false)).toBe(1);
  expect(dropIndex(2, 2, false)).toBeNull();
  expect(dropIndex(3, 0, false)).toBe(0);
});
