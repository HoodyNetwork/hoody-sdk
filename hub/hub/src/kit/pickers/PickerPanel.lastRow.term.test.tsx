// PickerPanel in the terminal: ↓ on the last row keeps the keyboard on that row when there is no create slot (the
// web's rule: `slotControl()?.focus()` focuses nothing without a slot). A focusSlot() that calls
// fc.focusFirst(null) focuses the first stop of the whole screen: in a drawer, ↓ past the last realm would leave the
// list for the drawer's first field, and the next Space would type there instead of ticking.
// Fails if focusSlot() focuses anything when `slot.current` is null.
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { TextField } from '../forms/fields';
import { PickerPanel, type PickerItem } from './PickerPanel';

const ITEMS: PickerItem[] = [
  { id: 'r1', label: 'Personal' },
  { id: 'r2', label: 'Lab' },
  { id: 'r3', label: 'Field work' },
];

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

function Form({ picks, typed }: { picks: string[][]; typed: string[] }) {
  const [v, setV] = useState<string[]>([]);
  const [name, setName] = useState('');
  return (
    <FocusRoot>
      <TextField label="Name" value={name} onChange={(x) => { typed.push(x); setName(x); }} />
      <PickerPanel label="Realms" mode="multi" items={ITEMS} value={v} onChange={(n) => { picks.push(n); setV(n); }} />
    </FocusRoot>
  );
}
/** The row the keyboard is on: the one drawn with ›. */
const focusedRow = (f: string) => f.split('\n').find((l) => l.includes('›'))?.trim() ?? '';

test('↓ on the last row with no create slot stays on that row; Space then ticks it, nothing is typed above', async () => {
  const picks: string[][] = [];
  const typed: string[] = [];
  t = await drawTest(<Form picks={picks} typed={typed} />, { width: 60, height: 14 });
  t.mockInput.pressTab(); // Name
  await t.settle();
  t.mockInput.pressTab(); // the list's one stop: its first row
  await t.settle();
  t.mockInput.pressKey('END');
  let f = await t.settle();
  expect(focusedRow(f)).toContain('Field work');
  t.mockInput.pressArrow('down');
  f = await t.settle();
  expect(focusedRow(f)).toContain('Field work');
  t.mockInput.pressKey(' ');
  await t.settle();
  expect(typed).toEqual([]);
  expect(picks).toEqual([['r3']]);
});
