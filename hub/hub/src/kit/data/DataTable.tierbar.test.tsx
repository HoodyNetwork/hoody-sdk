// Vitest: the two-tier filter bar (`filterBar="tier"`). Row 1 keeps search, the segmented filters, the count and the
// end controls; every chip filter sits in one flush bar under it (outside the measured toolbar row, so the row's fit
// never folds a chip), above the toolbar note. Clear all stays at the end of row 1. List rows and narrow tables keep
// the one-row toolbar, where the chips fold into the Filters button.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from './DataTable';
import type { FilterChip } from './FilterChips';
import { ListPaneContext } from '../layouts/pane';

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

const chip = (id: string, label: string, value?: string): FilterChip => ({ id, label, options: [{ value: 'x', label: 'X' }], value, onChange: () => {} });
const kind: FilterChip = { id: 'kind', label: 'Kind', display: 'segmented', options: [{ value: 'now', label: 'Instant' }, { value: 'pre', label: 'Pre-order' }], value: undefined, onChange: () => {} };

function table(filters: readonly FilterChip[], extra: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
  return (
    <div data-testid="t">
      <DataTable<Row> label="Listings" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} search="Search" filters={filters} filterBar="tier" toolbarNote="Note" {...extra} />
    </div>
  );
}

const tierOf = () => document.querySelector<HTMLElement>('[data-testid="t"] [data-toolbar-tier="2"]');

describe('DataTable filterBar="tier"', () => {
  it('draws the segmented filter in row 1 and every chip filter in one bar under the toolbar, above the note', () => {
    render(table([kind, chip('country', 'Country'), chip('cores', 'Cores'), chip('ram', 'Memory')]));
    const bar = tierOf();
    expect(bar, 'a second tier').not.toBeNull();
    const chips = within(bar!).getByRole('group', { name: 'Filters' });
    expect(within(chips).getAllByRole('button').map((b) => b.textContent)).toEqual(['Country', 'Cores', 'Memory']);
    // The segmented filter is not in the bar; it is in row 1.
    expect(within(bar!).queryByRole('radiogroup')).toBeNull();
    expect(screen.getByRole('radiogroup', { name: 'Kind' }).closest('[data-toolbar-tier]')).toBeNull();
    // Outside the measured row, before the note.
    const tb = document.querySelector('[data-testid="t"] [data-hub-search]')!.closest('div[class]')!;
    expect(tb.contains(bar)).toBe(false);
    const note = screen.getByText('Note');
    expect(bar!.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Clear all sits in row 1, never in the bar', () => {
    render(table([kind, chip('country', 'Country', 'x'), chip('cores', 'Cores', 'x')]));
    const bar = tierOf()!;
    expect(within(bar).queryByRole('button', { name: /clear all/i })).toBeNull();
    const clear = screen.getByRole('button', { name: /clear all/i });
    expect(clear.closest('[data-toolbar-tier]')).toBeNull();
  });

  it('Clear all with no filter left in row 1 hands focus to the first chip of the bar, not to the page', () => {
    // Row 1 holds no filter (no segmented one), so Clear all is the only thing in its group and leaves with it.
    function Host() {
      const [v, setV] = useState<Record<string, string | undefined>>({ country: 'x', cores: 'x' });
      const mk = (id: string, label: string): FilterChip => ({ ...chip(id, label, v[id]), onChange: (x) => setV((m) => ({ ...m, [id]: x })) });
      return table([mk('country', 'Country'), mk('cores', 'Cores')]);
    }
    render(<Host />);
    const clear = screen.getByRole('button', { name: /clear all/i });
    clear.focus();
    fireEvent.click(clear);
    expect(screen.queryByRole('button', { name: /clear all/i })).toBeNull();
    expect(document.activeElement).toBe(within(tierOf()!).getByRole('button', { name: /^Country/ }));
  });

  it('without the prop, or in list rows, there is no second tier', () => {
    const { unmount } = render(table([kind, chip('country', 'Country')], { filterBar: undefined }));
    expect(tierOf()).toBeNull();
    unmount();
    render(<ListPaneContext.Provider value={{ presentation: 'list' }}>{table([kind, chip('country', 'Country')])}</ListPaneContext.Provider>);
    expect(tierOf()).toBeNull();
  });

  it('the bar is flush, fills the width and wraps; it never scrolls sideways', () => {
    const css = readFileSync(join(import.meta.dirname, 'DataTable.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = (sel: string) => new RegExp(`(?:^|\\n|\\})\\s*${sel.replace(/[.[\]()>]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    expect(rule('.tierBar .chips')).toMatch(/flex-wrap:\s*wrap/);
    expect(rule('.tierBar .chips')).toMatch(/gap:\s*0/);
    expect(rule('.tierBar .chipWrap')).toMatch(/flex:\s*1 1 auto/);
    expect(rule('.tierBar .chip')).toMatch(/justify-content:\s*space-between/);
    expect(css).not.toMatch(/\.tierBar[^{]*\{[^}]*overflow-x:\s*(auto|scroll)/);
  });
  it('Clear all on a table with no rows at all: the toolbar leaves with the filters, and focus goes to the empty state, not to the page', () => {
    function Host() {
      const [v, setV] = useState<Record<string, string | undefined>>({ country: 'x', cores: 'x' });
      const mk = (id: string, label: string): FilterChip => ({ ...chip(id, label, v[id]), onChange: (x) => setV((m) => ({ ...m, [id]: x })) });
      return table([mk('country', 'Country'), mk('cores', 'Cores')], { data: [] });
    }
    render(<Host />);
    const clear = screen.getByRole('button', { name: /clear all/i });
    clear.focus();
    fireEvent.click(clear);
    expect(screen.queryByRole('button', { name: /clear all/i })).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.querySelector('[data-testid="t"]')!.contains(document.activeElement)).toBe(true);
  });
});
