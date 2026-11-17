// SegmentedControl.term: the web component's observable behaviours, each held here.
// - the chosen segment reads in mono: ‹ Label › around it, plain around the others; a count follows its label
// - no value = the first enabled item; a value naming no item shows no choice; a disabled value shows the first enabled
// - React Aria toggle group (toolbar of radios): one Tab stop (the first enabled segment, then the one last focused);
//   Right/Left move the focus only (skipping disabled, no wrap); Enter / Space / a click choose;
//   onChange(id) once per change, never for the chosen one
// - isDisabled: not focusable, keys do nothing
// - showLabel / description: a field label above and help below
// - fullWidth: labels that no longer fit draw a Select of the same choices (current choice shown, ▾)
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { SegmentedControl, type SegmentItem } from './SegmentedControl';

const items: SegmentItem[] = [
  { id: 'all', label: 'All', count: 12 },
  { id: 'run', label: 'Running' },
  { id: 'gone', label: 'Gone', isDisabled: true },
  { id: 'stop', label: 'Stopped' },
];

function P({ got, initial, isDisabled }: { got: string[]; initial?: string; isDisabled?: boolean }) {
  const [v, setV] = useState<string | undefined>(initial);
  return (
    <FocusRoot>
      <SegmentedControl label="State" items={items} value={v} isDisabled={isDisabled} onChange={(x) => { got.push(x); setV(x); }} />
    </FocusRoot>
  );
}

test('marks: chosen ‹ ›, count after its label; no value = first item', async () => {
  const t = await drawTest(<P got={[]} />, { width: 70, height: 4 });
  const f = t.captureCharFrame();
  expect(f).toContain('‹ All 12 ›');
  expect(f).toContain('  Running  ');
  expect(f).not.toContain('‹ Running');
  t.renderer.destroy();
});

test('unknown value shows no choice; a disabled value shows the first enabled', async () => {
  let t = await drawTest(<P got={[]} initial="nope" />, { width: 70, height: 4 });
  expect(t.captureCharFrame()).not.toContain('‹');
  t.renderer.destroy();
  t = await drawTest(<P got={[]} initial="gone" />, { width: 70, height: 4 });
  expect(t.captureCharFrame()).toContain('‹ All 12 ›');
  t.renderer.destroy();
});

test('one Tab stop: arrows move the focus (skip disabled, no wrap), Enter/Space choose', async () => {
  const got: string[] = [];
  const t = await drawTest(<P got={got} initial="run" />, { width: 70, height: 4 });
  t.mockInput.pressTab();
  t.mockInput.pressArrow('right');
  t.mockInput.pressArrow('right');
  await t.settle();
  expect(got).toEqual([]);
  t.mockInput.pressArrow('right');
  t.mockInput.pressEnter();
  let f = await t.settle();
  expect(got).toEqual(['stop']);
  expect(f).toContain('‹ Stopped ›');
  t.mockInput.pressEnter();
  await t.settle();
  expect(got).toEqual(['stop']);
  t.mockInput.pressArrow('left');
  t.mockInput.pressKey(' ');
  f = await t.settle();
  expect(got).toEqual(['stop', 'run']);
  expect(f).toContain('‹ Running ›');
  t.renderer.destroy();
});

test('isDisabled: no focus, keys do nothing', async () => {
  const got: string[] = [];
  const t = await drawTest(<P got={got} isDisabled />, { width: 70, height: 4 });
  t.mockInput.pressTab();
  t.mockInput.pressArrow('right');
  await t.settle();
  expect(got).toEqual([]);
  t.renderer.destroy();
});

test('form row: label above, description below', async () => {
  const t = await drawTest(<FocusRoot><SegmentedControl label="Run as" showLabel description="Who owns the files." items={items} /></FocusRoot>, { width: 70, height: 6 });
  const f = t.captureCharFrame();
  const lines = f.split('\n');
  const li = lines.findIndex((l) => l.includes('Run as'));
  expect(li).toBeGreaterThanOrEqual(0);
  expect(lines[li + 1]).toContain('‹ All 12 ›');
  expect(lines[li + 2]).toContain('Who owns the files.');
  t.renderer.destroy();
});

test('fullWidth: too narrow for the labels draws a Select of the choices', async () => {
  const t = await drawTest(<FocusRoot><SegmentedControl label="State" fullWidth items={items} value="run" /></FocusRoot>, { width: 24, height: 4 });
  const f = await t.settle();
  expect(f).toMatch(/Running\s+▾/);
  expect(f).not.toContain('‹');
  t.renderer.destroy();
});

test('a row that cannot hold every segment shows the Select, never a clipped row (7 colours)', async () => {
  const colours: SegmentItem[] = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Pink'].map((l) => ({ id: l.toLowerCase(), label: l }));
  const t = await drawTest(<FocusRoot><Box dir="column" width={40}><SegmentedControl label="Colour" items={colours} value="pink" onChange={() => {}} /></Box></FocusRoot>, { width: 60, height: 6 });
  await t.settle();
  const f = await t.settle();
  expect(f).toContain('Pink');
  expect(f).not.toContain('‹ Red');
  t.renderer.destroy();
});

test('in a row with room the segments stay segments (the measuring box does not force the Select)', async () => {
  const items: SegmentItem[] = [{ id: 'a', label: 'All' }, { id: 'o', label: 'Open' }];
  const t = await drawTest(<FocusRoot><Box dir="row" width={50} gap={2}><Box shrink={0}><SegmentedControl label="State" items={items} value="a" onChange={() => {}} /></Box></Box></FocusRoot>, { width: 60, height: 4 });
  await t.settle();
  expect(await t.settle()).toContain('‹ All ›');
  t.renderer.destroy();
});
