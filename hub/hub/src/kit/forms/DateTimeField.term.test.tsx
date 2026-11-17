// DateTimeField.term: the web component's observable behaviours, each held here.
//  - the group label (with * when required), then the date (YYYY-MM-DD) and the time (HH:MM) as two fields
//  - a value (epoch ms) shows as its local parts; null shows the placeholders
//  - typing both parts calls onChange with the local epoch ms; while either is empty or invalid, onChange(null)
//  - a part says it is wrong ("Use a date such as 2026-10-23." / "Use a 24-hour time such as 09:30.") only once left
//  - leaving completes 2026-3-5 to 2026-03-05 and 930 to 09:30
//  - ↑/↓ on the date step a day; on the time step to the next mark of `step` minutes (23:50 ↓ = 23:45)
//  - a value set from outside replaces the parts (not while a part is being typed)
//  - a page errorMessage shows once under the group (✗), the parts read invalid
//  - isDisabled: both parts "(unavailable)", no edits
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { DateTimeField } from './DateTimeField';
import { TextField } from './fields';
import { normalizeDate, partsOf, stepDay, stepTimeGrid } from './DateTimeField.pure';

const W = { width: 70, height: 14 };
let setOuter: (v: number | null) => void = () => {};

function P({ got, initial = null, step, errorMessage, isDisabled }: { got: (number | null)[]; initial?: number | null; step?: number; errorMessage?: string; isDisabled?: boolean }) {
  const [v, setV] = useState<number | null>(initial);
  setOuter = setV;
  return (
    <FocusRoot>
      <DateTimeField label="Around" isRequired value={v} onChange={(x) => { got.push(x); setV(x); }} step={step} errorMessage={errorMessage} isDisabled={isDisabled} />
      <TextField label="Next" value="" onChange={() => {}} />
    </FocusRoot>
  );
}

test('pure: normalizeDate, stepDay, stepTimeGrid on the grid', () => {
  expect(normalizeDate('2026-3-5')).toBe('2026-03-05');
  expect(normalizeDate('20260305')).toBe('2026-03-05');
  expect(normalizeDate('2026-02-30')).toBe('2026-02-30');
  expect(stepDay('2026-02-28', 1)).toBe('2026-03-01');
  expect(stepTimeGrid('23:50', 15, -1)).toBe('23:45');
  expect(stepTimeGrid('23:50', 15, 1)).toBe('00:00');
  expect(stepTimeGrid('930', 15, 1)).toBe('09:45');
});

test('label, placeholders; typing both parts composes local ms; leaving normalizes', async () => {
  const got: (number | null)[] = [];
  const t = await drawTest(<P got={got} />, W);
  let f = t.captureCharFrame();
  expect(f).toContain('Around *');
  expect(f).toContain('YYYY-MM-DD');
  expect(f).toContain('HH:MM');
  t.mockInput.pressTab();
  await t.mockInput.typeText('2026-3-5');
  t.mockInput.pressTab();
  await t.mockInput.typeText('930');
  t.mockInput.pressTab();
  f = await t.settle();
  expect(f).toContain('2026-03-05');
  expect(f).toContain('09:30');
  expect(got.at(-1)).toBe(new Date(2026, 2, 5, 9, 30).getTime());
  const first = got.findIndex((x) => x !== null);
  expect(got[first]).toBe(new Date(2026, 2, 5, 9, 30).getTime());
  expect(got.slice(0, first).every((x) => x === null)).toBe(true);
  t.renderer.destroy();
});

test('a wrong part says so only once left', async () => {
  const got: (number | null)[] = [];
  const t = await drawTest(<P got={got} />, W);
  t.mockInput.pressTab();
  await t.mockInput.typeText('2026-13-40');
  let f = await t.settle();
  expect(f).not.toContain('Use a date such as');
  t.mockInput.pressTab();
  f = await t.settle();
  expect(f).toContain('✗ Use a date such as 2026-10-23.');
  await t.mockInput.typeText('25');
  t.mockInput.pressTab();
  f = await t.settle();
  expect(f).toContain('✗ Use a 24-hour time such as 09:30.');
  t.renderer.destroy();
});

test('↑/↓ step a day and the time grid; an outside value replaces the parts', async () => {
  const got: (number | null)[] = [];
  const t = await drawTest(<P got={got} initial={new Date(2026, 9, 23, 23, 50).getTime()} />, W);
  let f = t.captureCharFrame();
  expect(f).toContain('2026-10-23');
  expect(f).toContain('23:50');
  t.mockInput.pressTab();
  t.mockInput.pressArrow('up');
  f = await t.settle();
  expect(f).toContain('2026-10-24');
  t.mockInput.pressTab();
  t.mockInput.pressArrow('down');
  f = await t.settle();
  expect(f).toContain('23:45');
  expect(got.at(-1)).toBe(new Date(2026, 9, 24, 23, 45).getTime());
  t.mockInput.pressTab();
  await t.settle();
  setOuter(new Date(2025, 0, 2, 3, 4).getTime());
  f = await t.settle();
  expect(f).toContain('2025-01-02');
  expect(f).toContain('03:04');
  expect(partsOf(null)).toEqual(['', '']);
  t.renderer.destroy();
});

test('page error under the group; disabled parts read unavailable and take no keys', async () => {
  const got: (number | null)[] = [];
  const t = await drawTest(<P got={got} errorMessage="That is in the future." isDisabled initial={new Date(2026, 0, 1, 8, 0).getTime()} />, W);
  const f = t.captureCharFrame();
  expect(f).toContain('✗ That is in the future.');
  expect(f).toContain('Around * (required, unavailable)');
  t.mockInput.pressTab();
  t.mockInput.pressArrow('up');
  await t.mockInput.typeText('9');
  await t.settle();
  expect(got).toEqual([]);
  t.renderer.destroy();
});
