// PickerPanel in the terminal (PickerPanel.term.tsx on pickerLogic.ts). PickerPanel.scenario.ts holds the click picks,
// minPicked, the search's Show all and a folded group; these hold the keyboard and the states around the list:
//   - one stop for the list: arrows skip a disabled row (which still says why), Home / End jump, Enter picks (single)
//   - the focused row taken away (the list changed under it) hands the keyboard to the next row
//   - ↓ from the search box enters the list; ↑ from its first row goes back; a letter typed on a row searches
//   - the create slot: ↓ from the last row reaches its control, ↑ from that control comes back (the scenario file's
//     `unsupported.renderCreate` names "the terminal test" for this; there was none)
//   - failed: the sentence and Try again; empty: the page's sentence; loading: no "nothing to choose" sentence
//   - maxRows: as tall as its first rows, scrolled to the focused one
//   - the footer: Tab reaches its buttons, a press runs its action, arrows stay in the list
// The last row's ↓ without a create slot has its own file (PickerPanel.lastRow.term.test.tsx).
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { Button } from '../controls/Button';
import { PickerPanel, type PickerItem, type PickerPanelProps } from './PickerPanel';

const ITEMS: PickerItem[] = [
  { id: 'r1', label: 'Personal' },
  { id: 'r2', label: 'Acme client', isDisabled: true, disabledReason: 'Owned by another account' },
  { id: 'r3', label: 'Lab', description: 'Experiments' },
  { id: 'r4', label: 'Field work' },
];
const MANY: PickerItem[] = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, label: `computer-${i}` }));

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

/** Lets a test change the list from outside, as a page's query would. */
let setItemsOut: (items: PickerItem[] | undefined) => void = () => {};
type Extra = Omit<Partial<PickerPanelProps>, 'items' | 'value' | 'onChange' | 'mode'>;
type PanelProps = { picks: string[][]; items?: PickerItem[] | undefined; initial?: string[]; mode?: 'single' | 'multi'; extra?: Extra };
function Panel(p: PanelProps) {
  const { picks, initial = [], mode = 'multi', extra = {} } = p;
  // `items: undefined` given on purpose is a list still loading (or a failed first load), never ITEMS: a destructuring
  // default would apply to it too.
  const items = 'items' in p ? p.items : ITEMS;
  const [v, setV] = useState<string[]>(initial);
  const [list, setList] = useState<PickerItem[] | undefined>(items);
  setItemsOut = setList;
  return (
    <FocusRoot>
      <PickerPanel label="Realms" mode={mode} items={list} value={v} onChange={(n) => { picks.push(n); setV(n); }} {...extra} />
    </FocusRoot>
  );
}
const draw = async (p: PanelProps, width = 70, height = 18): Promise<string> => {
  t = await drawTest(<Panel {...p} />, { width, height });
  return t.settle();
};
const step = async (fn: () => void): Promise<string> => { fn(); return t!.settle(); };
/** The row the keyboard is on: the one drawn with ›. */
const focusedRow = (f: string) => f.split('\n').find((l) => l.includes('›'))?.trim() ?? '';

// Catches the stops leaving out disabled rows (line 76), onStopKey's arrows / Home / End (lines 119-136), the press on
// Enter in single mode (StopBox) and the reason line under a disabled row (line 159).
test('arrows skip the disabled row, which still says why; Home and End jump; Enter picks in single mode', async () => {
  const picks: string[][] = [];
  let f = await draw({ picks, mode: 'single', initial: ['r1'] });
  expect(f).toContain('( ) Acme client');
  expect(f).toContain('Owned by another account');
  f = await step(() => t!.mockInput.pressTab());
  expect(focusedRow(f)).toContain('(•) Personal');
  f = await step(() => t!.mockInput.pressArrow('down'));
  expect(focusedRow(f)).toContain('Lab');
  f = await step(() => t!.mockInput.pressKey('END'));
  expect(focusedRow(f)).toContain('Field work');
  f = await step(() => t!.mockInput.pressKey('HOME'));
  expect(focusedRow(f)).toContain('Personal');
  await step(() => t!.mockInput.pressArrow('down'));
  f = await step(() => t!.mockInput.pressEnter());
  expect(picks).toEqual([['r3']]);
  expect(f).toContain('(•) Lab');
  expect(f).toContain('( ) Personal');
});

// Catches the "keep the keyboard where it was" effect (lines 96-110): without it the focus is nowhere after the list
// changes, and the next Space ticks nothing.
test('the focused row taken away hands the keyboard to the next row', async () => {
  const picks: string[][] = [];
  await draw({ picks });
  await step(() => t!.mockInput.pressTab());
  let f = await step(() => t!.mockInput.pressArrow('down'));
  expect(focusedRow(f)).toContain('Lab');
  f = await step(() => setItemsOut(ITEMS.filter((i) => i.id !== 'r3')));
  expect(f).not.toContain('Lab');
  expect(focusedRow(f)).toContain('Field work');
  f = await step(() => t!.mockInput.pressKey(' '));
  expect(picks).toEqual([['r4']]);
  expect(f).toContain('1 selected');
});

// Catches the search box's ArrowDown (line 212), ↑ from the first row (lines 129-132) and typing on a row (lines 137-141).
test('search: ↓ enters the list, ↑ from its first row goes back, a letter typed on a row searches', async () => {
  const picks: string[][] = [];
  let f = await draw({ picks, items: MANY, mode: 'single' });
  expect(f).toContain('Search');
  await step(() => t!.mockInput.pressTab()); // the search box comes first
  f = await step(() => t!.mockInput.pressArrow('down'));
  expect(focusedRow(f)).toContain('computer-0');
  f = await step(() => t!.mockInput.pressArrow('up'));
  expect(focusedRow(f)).toBe('');
  f = await step(() => t!.mockInput.pressArrow('down'));
  expect(focusedRow(f)).toContain('computer-0');
  await t!.mockInput.typeText('7');
  f = await t!.settle();
  expect(f).toContain('computer-7');
  expect(f).not.toContain('computer-3');
  expect(f).toContain('1 of 9 shown');
  expect(picks).toEqual([]);
});

// Catches focusSlot reaching the slot (line 126) and the ↑ way back (lines 146-150).
test('the create slot: ↓ from the last row reaches its control; ↑ from it comes back to the last row', async () => {
  const picks: string[][] = [];
  let made = 0;
  await draw({ picks, extra: { renderCreate: () => <Button onPress={() => { made += 1; }}>New realm</Button> } });
  await step(() => t!.mockInput.pressTab());
  await step(() => t!.mockInput.pressKey('END'));
  let f = await step(() => t!.mockInput.pressArrow('down'));
  expect(focusedRow(f)).toBe('');
  await step(() => t!.mockInput.pressEnter());
  expect(made).toBe(1);
  f = await step(() => t!.mockInput.pressArrow('up'));
  expect(focusedRow(f)).toContain('Field work');
  await step(() => t!.mockInput.pressKey(' '));
  expect(picks).toEqual([['r4']]);
  expect(made).toBe(1);
});

// Catches the state lines (lines 223-236): a failed load names itself and offers Try again; an empty list says the
// page's sentence; a list still loading never claims there is nothing to choose.
test('failed: the sentence and Try again; empty: the page sentence; loading: never "nothing to choose"', async () => {
  let retried = 0;
  let f = await draw({ picks: [], items: undefined, extra: { status: { error: true, onRetry: () => { retried += 1; } } } });
  expect(f).toContain("The choices didn't load.");
  expect(f).toContain('Try again');
  expect(f).not.toContain('Personal'); // a failed first load: no rows under the error
  await step(() => t!.mockInput.pressTab());
  await step(() => t!.mockInput.pressEnter());
  expect(retried).toBe(1);
  t!.renderer.destroy();
  t = null;

  f = await draw({ picks: [], items: [], extra: { emptyText: 'No realms yet.' } });
  expect(f).toContain('No realms yet.');
  t!.renderer.destroy();
  t = null;

  f = await draw({ picks: [], items: undefined });
  // The control first: a loading list draws no rows (with rows drawn, the two absences below would hold by themselves).
  expect(f).not.toContain('Personal');
  expect(f).not.toContain('[ ]');
  expect(f).not.toContain('Nothing to choose from.');
  expect(f).not.toContain("The choices didn't load.");
});

// Catches capLines (lines 81-83) and the Scroll's followFocus (line 238).
test('maxRows: as tall as its first three rows; End scrolls the last row into view', async () => {
  const rows: PickerItem[] = Array.from({ length: 6 }, (_, i) => ({ id: `w${i + 1}`, label: `row-${i + 1}` }));
  let f = await draw({ picks: [], items: rows, extra: { maxRows: 3 } }, 60, 16);
  expect(f).toContain('row-1');
  expect(f).toContain('row-3');
  expect(f).not.toContain('row-4');
  await step(() => t!.mockInput.pressTab());
  f = await step(() => t!.mockInput.pressKey('END'));
  expect(focusedRow(f)).toContain('row-6');
  expect(f).not.toContain('row-1');
});

// Catches the footer (lines 277-285): outside the list, a Tab stop of its own, its press runs the action and ticks nothing.
test('the footer: Tab reaches its first button and Enter runs it; arrows keep the keyboard in the list', async () => {
  const picks: string[][] = [];
  let applied = 0;
  await draw({ picks, extra: { footer: [{ id: 'apply', label: 'Apply', onPress: () => { applied += 1; } }, { id: 'cancel', label: 'Cancel', onPress: () => {} }] } });
  expect(t!.captureCharFrame()).toContain('Apply');
  await step(() => t!.mockInput.pressTab());
  let f = await step(() => t!.mockInput.pressKey('END'));
  expect(focusedRow(f)).toContain('Field work');
  f = await step(() => t!.mockInput.pressArrow('down'));
  expect(focusedRow(f)).not.toBe('');
  await step(() => t!.mockInput.pressTab());
  await step(() => t!.mockInput.pressEnter());
  expect(applied).toBe(1);
  expect(picks).toEqual([]);
});
