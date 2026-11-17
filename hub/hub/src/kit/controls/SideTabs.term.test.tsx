// SideTabs in the terminal (SideTabs.term.tsx). SideTabs.scenario.ts holds the group's name, `pressed`, a press, Down and
// End through onChange. These hold what the scenarios leave out:
//   - the picked row is the one drawn "▸ Label", the others "  Label" (in mono the mark is the only sign of the pick)
//   - the mark follows the value: Enter on another row moves it
//   - Home picks the first row and the focus goes with the pick; Down on the last row picks nothing
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';
import { SideTabs } from './SideTabs';

type K = 'cli' | 'ssh' | 'web';
const items: { id: K; label: string }[] = [
  { id: 'cli', label: 'Terminal' },
  { id: 'ssh', label: 'SSH' },
  { id: 'web', label: 'Browser' },
];

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

function Tabs({ calls, start }: { calls: K[]; start: K }) {
  const [v, setV] = useState<K>(start);
  return <FocusRoot><SideTabs items={items} value={v} onChange={(x) => { calls.push(x); setV(x); }} label="Ways in" /></FocusRoot>;
}
const rows = (f: string): string[] => f.split('\n').slice(0, 3).map((r) => r.trimEnd());
const focusedName = (term: TestTerm): string | undefined => focusedNode(semanticsOf(term.renderer as never))?.name;

// Catches the mark (SideTabs.term.tsx line 43, `on ? '▸ ' : '  '`) and the press (line 32).
test('the picked row carries ▸; Enter on another row moves the mark there and reports its id once', async () => {
  const calls: K[] = [];
  t = await drawTest(<Tabs calls={calls} start="ssh" />, { width: 30, height: 5 });
  let f = await t.settle();
  expect(rows(f)).toEqual(['  Terminal', '▸ SSH', '  Browser']);
  t.mockInput.pressTab(); // the first row
  await t.settle();
  expect(focusedName(t)).toBe('Terminal');
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(calls).toEqual(['cli']);
  expect(rows(f)).toEqual(['▸ Terminal', '  SSH', '  Browser']);
});

// Catches Home and End (lines 36-37), the focus moving with the pick (line 18), and the end of the list (line 34:
// Down on the last row stays there and reports nothing, line 17).
test('End then Home: each picks and takes the focus with it; Down on the last row picks nothing', async () => {
  const calls: K[] = [];
  t = await drawTest(<Tabs calls={calls} start="ssh" />, { width: 30, height: 5 });
  await t.settle();
  t.mockInput.pressTab();
  t.mockInput.pressTab(); // SSH, the picked row
  await t.settle();
  expect(focusedName(t)).toBe('SSH');
  t.mockInput.pressKey('END');
  let f = await t.settle();
  expect(calls).toEqual(['web']);
  expect(focusedName(t)).toBe('Browser');
  expect(rows(f)[2]).toBe('▸ Browser');
  t.mockInput.pressArrow('down');
  await t.settle();
  expect(calls).toEqual(['web']);
  expect(focusedName(t)).toBe('Browser');
  t.mockInput.pressKey('HOME');
  f = await t.settle();
  expect(calls).toEqual(['web', 'cli']);
  expect(focusedName(t)).toBe('Terminal');
  expect(rows(f)).toEqual(['▸ Terminal', '  SSH', '  Browser']);
});
