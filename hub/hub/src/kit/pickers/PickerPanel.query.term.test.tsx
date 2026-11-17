// PickerPanel in the terminal, for a caller whose rows change with the search (ModelPicker offers the models that need
// setup only while a search is typed): it hears every search text (onQuery) and names the tally itself (searchTally),
// as on the web. Without searchTally the panel's own "n of m shown" stays.
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { act, getAllByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { PickerPanel, type PickerItem, type PickerPanelProps } from './PickerPanel';

// Nine rows: the search box shows by itself (above SEARCH_ABOVE, 7).
const MANY: PickerItem[] = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, label: `computer-${i}` }));

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

function Panel({ extra }: { extra: Partial<PickerPanelProps> }) {
  const [v, setV] = useState<string[]>([]);
  return (
    <FocusRoot>
      <PickerPanel label="Computers" mode="single" items={MANY} value={v} onChange={setV} {...extra} />
    </FocusRoot>
  );
}
const draw = async (extra: Partial<PickerPanelProps>): Promise<string> => {
  t = await drawTest(<Panel extra={extra} />, { width: 70, height: 18 });
  return t.settle();
};
const step = async (fn: () => void | Promise<void>): Promise<string> => { await fn(); return t!.settle(); };

// Catches changeQuery not telling the caller: typed in the box, typed on a row, and Show all.
test('every change of the search text reaches onQuery: typed in the box, typed on a row, Show all', async () => {
  const queries: string[] = [];
  await draw({ onQuery: (q) => queries.push(q) });
  await step(() => t!.mockInput.pressTab()); // the search box
  let f = await step(() => t!.mockInput.typeText('7'));
  expect(queries).toEqual(['7']);
  expect(f).toContain('1 of 9 shown');
  await step(() => t!.mockInput.pressArrow('down')); // into the list: computer-7
  f = await step(() => t!.mockInput.typeText('x')); // a letter on a row searches
  expect(queries).toEqual(['7', '7x']);
  expect(f).toContain('No match for "7x".');
  act(getAllByRole(semanticsOf(t!.renderer as unknown as SemRoot), 'button', { name: 'Show all' })[0]!, 'press');
  f = await t!.settle();
  expect(queries).toEqual(['7', '7x', '']);
  expect(f).toContain('computer-0');
});

// Catches the tally ignoring searchTally: the caller's words replace "n of m shown" while a search is typed.
test("searchTally names the tally while a search is typed, in place of the panel's own", async () => {
  await draw({ searchTally: (n) => `${n} found here` });
  await step(() => t!.mockInput.pressTab());
  const f = await step(() => t!.mockInput.typeText('7'));
  expect(f).toContain('1 found here');
  expect(f).not.toContain('of 9 shown');
});
