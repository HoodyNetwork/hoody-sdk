// DateField.term: the web component's observable behaviours, each held here.
//  - a TextField with the label, YYYY-MM-DD placeholder, required mark; the value is the text itself
//  - typing keeps digits and "-" only, at most 10 characters
//  - leaving completes 2026-3-5 and 20260305 to the canonical day; a non-day stays as typed
//  - "Use a date such as 2026-10-23." waits while typing; shows once left, or on Enter while still in the field
//  - a page errorMessage replaces the field's own line
//  - ↑/↓ step a day (from today when the text is no day)
//  - isDisabled: "(unavailable)", no edits
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { DateField } from './DateField';
import { TextField } from './fields';

const W = { width: 60, height: 10 };

function P({ got, initial = '', errorMessage, isDisabled }: { got: string[]; initial?: string; errorMessage?: string; isDisabled?: boolean }) {
  const [v, setV] = useState(initial);
  return (
    <FocusRoot>
      <DateField label="Expires" isRequired value={v} onChange={(x) => { got.push(x); setV(x); }} errorMessage={errorMessage} isDisabled={isDisabled} />
      <TextField label="Next" value="" onChange={() => {}} />
    </FocusRoot>
  );
}

test('placeholder; typing filters; leaving completes the day', async () => {
  const got: string[] = [];
  const t = await drawTest(<P got={got} />, W);
  expect(t.captureCharFrame()).toContain('Expires * (required)');
  expect(t.captureCharFrame()).toContain('YYYY-MM-DD');
  t.mockInput.pressTab();
  await t.mockInput.typeText('2026x3-5');
  let f = await t.settle();
  expect(f).toContain('20263-5');
  t.mockInput.pressKey('u', { ctrl: true });
  await t.mockInput.typeText('20260305');
  t.mockInput.pressTab();
  f = await t.settle();
  expect(f).toContain('2026-03-05');
  expect(got.at(-1)).toBe('2026-03-05');
  t.renderer.destroy();
});

test('format line waits while typing, shows on leaving or on Enter', async () => {
  const got: string[] = [];
  const t = await drawTest(<P got={got} />, W);
  t.mockInput.pressTab();
  await t.mockInput.typeText('2026-1');
  let f = await t.settle();
  expect(f).not.toContain('Use a date such as');
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(f).toContain('✗ Use a date such as 2026-10-23.');
  await t.mockInput.typeText('3');
  f = await t.settle();
  expect(f).not.toContain('Use a date such as');
  t.mockInput.pressTab();
  f = await t.settle();
  expect(f).toContain('✗ Use a date such as 2026-10-23.');
  t.renderer.destroy();
});

test('↑/↓ step a day; a page error replaces the format line', async () => {
  const got: string[] = [];
  const t = await drawTest(<P got={got} initial="2026-12-31" errorMessage="Pick a later day." />, W);
  expect(t.captureCharFrame()).toContain('✗ Pick a later day.');
  t.mockInput.pressTab();
  t.mockInput.pressArrow('up');
  let f = await t.settle();
  expect(f).toContain('2027-01-01');
  t.mockInput.pressArrow('down');
  t.mockInput.pressArrow('down');
  f = await t.settle();
  expect(f).toContain('2026-12-30');
  expect(got).toEqual(['2027-01-01', '2026-12-31', '2026-12-30']);
  t.renderer.destroy();
});

test('disabled: unavailable, no edits', async () => {
  const got: string[] = [];
  const t = await drawTest(<P got={got} initial="2026-01-01" isDisabled />, W);
  expect(t.captureCharFrame()).toContain('Expires * (required, unavailable)');
  t.mockInput.pressTab();
  t.mockInput.pressArrow('up');
  await t.mockInput.typeText('9');
  await t.settle();
  expect(got).toEqual([]);
  t.renderer.destroy();
});
