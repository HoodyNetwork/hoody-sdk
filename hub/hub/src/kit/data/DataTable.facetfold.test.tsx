// Vitest: a table with more than 3 chip facets keeps them behind the Filters button at every width,
// decided by their count, never by the room left in the toolbar; no prop. A segmented filter (the row's state switch)
// is not a chip facet. `filterBar='tier'` is unchanged (its chips sit in the bar under the row). jsdom has no layout, so
// the toolbar's room-driven fold stays at its first step: whatever folds here folds by count.
import { createColumnHelper } from '@tanstack/react-table';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHIP_FACETS_MAX, DataTable } from './DataTable';
import type { FilterChip } from './FilterChips';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
}
const ROWS: Row[] = [
  { id: 'a', name: 'alpha' },
  { id: 'b', name: 'bravo' },
];
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true } })];
const chip = (id: string): FilterChip => ({ id, label: id, options: [{ value: 'x', label: 'X' }], value: undefined, onChange: () => {} });
const segmented = (id: string): FilterChip => ({
  id,
  label: id,
  display: 'segmented',
  options: ['running', 'stopped', 'failed'].map((v) => ({ value: v, label: v, count: 1 })),
  value: undefined,
  onChange: () => {},
});

const filtersButton = () => document.querySelector('[data-filters-trigger]');
const chipGroup = () => document.querySelector('.toolbar [role="group"][aria-label="Filters"]');

function table(filters: FilterChip[], filterBar?: 'row' | 'tier') {
  render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} search filters={filters} presentation="table" filterBar={filterBar} />);
}

describe('DataTable: more than 3 chip facets fold by count', () => {
  afterEach(cleanup);

  it('the rule is 3', () => expect(CHIP_FACETS_MAX).toBe(3));

  it('3 chip facets: chips in the row', () => {
    table([chip('a'), chip('b'), chip('c')]);
    expect(chipGroup()).not.toBeNull();
    expect(filtersButton()).toBeNull();
  });

  for (const n of [4, 6]) {
    it(`${n} chip facets (Bots has 6): the Filters button, no chip in the row, with room to spare`, () => {
      table(Array.from({ length: n }, (_, i) => chip(`f${i}`)));
      expect(filtersButton()).not.toBeNull();
      expect(chipGroup()).toBeNull();
    });
  }

  it('a segmented state filter is not a chip facet: 3 chips + 1 segmented stay in the row', () => {
    table([segmented('state'), chip('a'), chip('b'), chip('c')]);
    expect(filtersButton()).toBeNull();
    expect(document.querySelector('.toolbar [role="radiogroup"], .toolbar [data-segmented], .toolbar [role="group"]')).not.toBeNull();
  });

  it("filterBar='tier' is unchanged: its chips stay in the bar under the row", () => {
    table([segmented('state'), chip('a'), chip('b'), chip('c'), chip('d')], 'tier');
    const tier = document.querySelector('[data-toolbar-tier="2"]');
    expect(tier).not.toBeNull();
    expect(tier!.querySelectorAll('[data-filter-control], button').length).toBeGreaterThan(0);
  });
});
