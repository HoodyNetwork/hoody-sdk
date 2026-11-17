// FiltersButton in the terminal by keyboard (FilterChips.term.tsx): the folded "Filters" panel holds every chip inline,
// and an inline chip opens its options under it with the same option lines as a toolbar chip. ↑/↓ must reach every
// option and wrap, as in FilterChips.keys.term.test.tsx. FilterChips.scenario.ts holds only the presses here.
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { FiltersButton, type FilterChip, type FilterOption } from './FilterChips';

const OPTS: FilterOption[] = [
  { value: 'running', label: 'Running', count: 3 },
  { value: 'stopped', label: 'Stopped', count: 1 },
  { value: 'failed', label: 'Failed' },
];

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

function Folded({ log }: { log: (string | undefined)[] }) {
  const [v, setV] = useState<string | undefined>(undefined);
  const filters: FilterChip[] = [{ id: 'state', label: 'State', options: OPTS, value: v, onChange: (x) => { log.push(x); setV(x); } }];
  return <FocusRoot><OverlayHost><FiltersButton filters={filters} /></OverlayHost></FocusRoot>;
}
const step = async (fn: () => void): Promise<string> => { fn(); return t!.settle(); };
/** The option line the keyboard is on: the one drawn with ▸. */
const focusedRow = (f: string) => f.split('\n').find((l) => l.includes('▸'))?.trim() ?? '';

// Catches the option lines' ↑/↓ (Opt: each line's place in its panel's list). Before, a line appended its focus handle
// on every render; a focus move re-renders only the two lines it changes, so ↓ went Any → Running → Any → Running and
// never reached Stopped or Failed.
test('folded: an inline chip\'s options take ↓ to every line and wrap; ↑ wraps back; Enter picks and the chip says so', async () => {
  const log: (string | undefined)[] = [];
  t = await drawTest(<Folded log={log} />, { width: 80, height: 16 });
  let f = await t.settle();
  expect(f).toContain('Filters');
  await step(() => t!.mockInput.pressTab()); // the Filters button
  f = await step(() => t!.mockInput.pressEnter()); // its panel opens, nothing in it focused
  expect(f).toContain('State ▾');
  await step(() => t!.mockInput.pressTab()); // the inline State chip
  f = await step(() => t!.mockInput.pressEnter()); // its options open under it, on Any
  expect(focusedRow(f)).toContain('(•) Any');
  f = await step(() => t!.mockInput.pressArrow('down'));
  expect(focusedRow(f)).toContain('Running');
  f = await step(() => t!.mockInput.pressArrow('down'));
  expect(focusedRow(f)).toContain('Stopped');
  f = await step(() => t!.mockInput.pressArrow('down'));
  expect(focusedRow(f)).toContain('Failed');
  f = await step(() => t!.mockInput.pressArrow('down'));
  expect(focusedRow(f)).toContain('Any');
  f = await step(() => t!.mockInput.pressArrow('up'));
  expect(focusedRow(f)).toContain('Failed');
  f = await step(() => t!.mockInput.pressEnter());
  expect(log).toEqual(['failed']);
  expect(f).toContain('State: Failed');
  expect(f).toContain('Filters (1)');
  expect(f).not.toContain('Stopped');
});
