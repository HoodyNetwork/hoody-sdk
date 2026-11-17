// FilterChips in the terminal by keyboard (FilterChips.term.tsx). FilterChips.scenario.ts holds the presses: a chip
// opens its menu and a pick reports, the × clears, a required filter has no ×, Clear all, segmented. The refold,
// settle and noSteal files hold the bar's focus across layouts. These hold the keys a person uses:
//   - single: ↓ opens on "Any"; ↑/↓ move and wrap; Enter picks and closes; the focus is back on the chip; Esc closes
//     without a change; Backspace on a set chip clears it
//   - multi: Space ticks and the panel stays; the value keeps the options' order; Apply closes; the chip says "+1"
//   - range: From / To fields, Enter in one applies ("2–8"); Any clears
//   - Clear all: once it goes, the first chip has the focus (Enter opens its options)
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { FilterChips, type FilterChip, type FilterOption } from './FilterChips';

const OPTS: FilterOption[] = [
  { value: 'running', label: 'Running', count: 3 },
  { value: 'stopped', label: 'Stopped', count: 1 },
  { value: 'failed', label: 'Failed' },
];

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

type Log = (string | undefined)[];
function Bar({ log, state = true, mem = false, kind = 'single', first, firstMem }: { log: Log; state?: boolean; mem?: boolean; kind?: 'single' | 'multi'; first?: string; firstMem?: string }) {
  const [v, setV] = useState<string | undefined>(first);
  const [m, setM] = useState<string | undefined>(firstMem);
  const filters: FilterChip[] = [
    ...(state ? [{ id: 'state', label: 'State', options: OPTS, kind, value: v, onChange: (x: string | undefined) => { log.push(x); setV(x); } }] : []),
    ...(mem ? [{ id: 'mem', label: 'Memory', options: [], kind: 'range' as const, value: m, onChange: (x: string | undefined) => { log.push(x); setM(x); } }] : []),
  ];
  return <FocusRoot><OverlayHost><FilterChips filters={filters} /></OverlayHost></FocusRoot>;
}
const draw = async (p: Parameters<typeof Bar>[0]): Promise<string> => {
  t = await drawTest(<Bar {...p} />, { width: 80, height: 14 });
  return t.settle();
};
const step = async (fn: () => void): Promise<string> => { fn(); return t!.settle(); };
const esc = async (): Promise<string> => { t!.mockInput.pressEscape(); await new Promise((r) => setTimeout(r, 120)); return t!.settle(); };
/** The panel row the keyboard is on: the one drawn with ▸. */
const focusedRow = (f: string) => f.split('\n').find((l) => l.includes('▸'))?.trim() ?? '';

// Catches ↓ opening the chip (line 150), the rows' ↑/↓ with wrap (lines 37-42), the pick closing (lines 66-72), the
// focus going back to the chip (lines 155-157), Esc (line 38 / the layer's onEscape) and Backspace (line 151).
test('single: ↓ opens on Any; ↑/↓ move and wrap; Enter picks and closes; Esc closes with no change; Backspace clears', async () => {
  const log: Log = [];
  let f = await draw({ log });
  expect(f).toContain('State ▾');
  await step(() => t!.mockInput.pressTab());
  f = await step(() => t!.mockInput.pressArrow('down'));
  expect(focusedRow(f)).toContain('(•) Any');
  expect(f).toMatch(/\( \) Running +3/);
  f = await step(() => t!.mockInput.pressArrow('down'));
  expect(focusedRow(f)).toContain('Running');
  await step(() => t!.mockInput.pressArrow('down'));
  f = await step(() => t!.mockInput.pressArrow('down'));
  expect(focusedRow(f)).toContain('Failed');
  f = await step(() => t!.mockInput.pressArrow('down'));
  expect(focusedRow(f)).toContain('Any');
  f = await step(() => t!.mockInput.pressArrow('up'));
  expect(focusedRow(f)).toContain('Failed');
  f = await step(() => t!.mockInput.pressEnter());
  expect(log).toEqual(['failed']);
  expect(f).not.toContain('Running');
  expect(f).toContain('State: Failed ×');
  f = await step(() => t!.mockInput.pressEnter()); // the chip has the focus again
  expect(f).toContain('(•) Failed');
  f = await esc();
  expect(f).not.toContain('Running');
  expect(log).toEqual(['failed']);
  f = await step(() => t!.mockInput.pressBackspace());
  expect(log).toEqual(['failed', undefined]);
  expect(f).toContain('State ▾');
});

// Catches the multi pick (lines 63-67: a tick keeps the panel open, the value in the options' order), Apply (line 82)
// and the chip's "+1" (FilterChips.pure.ts chipValueText).
test('multi: Space ticks and the panel stays; the value keeps the options\' order; Apply closes; the chip says "+1"', async () => {
  const log: Log = [];
  await draw({ log, kind: 'multi' });
  await step(() => t!.mockInput.pressTab());
  let f = await step(() => t!.mockInput.pressEnter());
  expect(focusedRow(f)).toContain('[ ] Running');
  await step(() => t!.mockInput.pressArrow('down'));
  await step(() => t!.mockInput.pressArrow('down'));
  f = await step(() => t!.mockInput.pressKey(' '));
  expect(log).toEqual(['failed']);
  expect(f).toContain('[x] Failed');
  expect(f).toContain('[ ] Running');
  await step(() => t!.mockInput.pressArrow('up'));
  await step(() => t!.mockInput.pressArrow('up'));
  f = await step(() => t!.mockInput.pressKey(' '));
  expect(log).toEqual(['failed', 'running,failed']);
  expect(f).toContain('[x] Running');
  for (let i = 0; i < 3; i++) await step(() => t!.mockInput.pressArrow('down'));
  f = await t!.settle();
  expect(focusedRow(f)).toContain('Apply');
  f = await step(() => t!.mockInput.pressEnter());
  expect(f).not.toContain('Stopped');
  expect(f).toContain('State: Running +1 ×');
  expect(log).toEqual(['failed', 'running,failed']);
});

// Catches the range panel (lines 96-110): From / To, Enter in a field applies, Any clears.
test('range: From and To, Enter applies "2–8"; Any clears it', async () => {
  const log: Log = [];
  let f = await draw({ log, state: false, mem: true });
  expect(f).toContain('Memory ▾');
  await step(() => t!.mockInput.pressTab());
  f = await step(() => t!.mockInput.pressEnter());
  expect(f).toContain('From');
  expect(f).toContain('To');
  await step(() => t!.mockInput.pressTab()); // From
  await t!.mockInput.typeText('2');
  await step(() => t!.mockInput.pressTab()); // To
  await t!.mockInput.typeText('8');
  f = await step(() => t!.mockInput.pressEnter());
  expect(log).toEqual(['2..8']);
  expect(f).not.toContain('From');
  expect(f).toContain('Memory: 2–8 ×');
  f = await step(() => t!.mockInput.pressEnter()); // the chip has the focus again
  expect(f).toContain('From');
  for (let i = 0; i < 3; i++) await step(() => t!.mockInput.pressTab()); // From, To, Any
  f = await step(() => t!.mockInput.pressEnter());
  expect(log).toEqual(['2..8', undefined]);
  expect(f).toContain('Memory ▾');
});

// Catches Clear all's refocus (lines 222-235): it leaves with the filters it cleared and the first chip takes the focus.
test('Clear all clears every filter, goes, and the first chip has the focus', async () => {
  const log: Log = [];
  let f = await draw({ log, mem: true, first: 'running', firstMem: '2..8' });
  expect(f).toContain('Clear all');
  for (let i = 0; i < 5; i++) await step(() => t!.mockInput.pressTab()); // State, its ×, Memory, its ×, Clear all
  f = await step(() => t!.mockInput.pressEnter());
  expect(log).toEqual([undefined, undefined]);
  expect(f).not.toContain('Clear all');
  expect(f).toContain('State ▾');
  expect(f).toContain('Memory ▾');
  f = await step(() => t!.mockInput.pressEnter());
  expect(f).toMatch(/Running +3/);
});
