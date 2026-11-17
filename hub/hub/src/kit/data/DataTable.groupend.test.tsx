// TableGroup.extraEnd puts a group's extra at the row's end, its end edge on the row actions'
// end edge. jsdom has no layout, so the proof is the markup and the rules: one --actions-pad-end feeds both the last
// (⋯) cell and an end-placed group row. The Bots spec measures the edges in a browser.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable, type TableGroup } from './DataTable';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
  group: string;
}
const ROWS: Row[] = [
  { id: 'a', name: 'alpha', group: 'one' },
  { id: 'b', name: 'bravo', group: 'two' },
];
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true } })];
const GROUPS: TableGroup[] = [
  { id: 'one', label: 'One', extraEnd: true, extra: <span data-testid="extra-one">Resume</span> },
  { id: 'two', label: 'Two', extra: <span data-testid="extra-two">Open it</span> },
];
const table = (extra: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) =>
  render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} groupBy={(r) => r.group} groups={GROUPS} {...extra} />);

const css = readFileSync(join(__dirname, 'DataTable.module.css'), 'utf8');
/** The CSS as rules: each selector of a list (whitespace normalised) maps to its declarations, so formatting or a split
 * of a selector list does not change what the test reads. */
const decls = (() => {
  const out = new Map<string, Map<string, string>>();
  for (const [, sels, body] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const props = new Map([...body!.matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)].map(([, k, v]) => [k!, v!.trim().replace(/\s+/g, ' ')]));
    for (const sel of sels!.split(',').map((x) => x.trim().replace(/\s+/g, ' ')))
      out.set(sel, new Map([...(out.get(sel) ?? []), ...props]));
  }
  return out;
})();
const prop = (sel: string, name: string) => decls.get(sel)?.get(name);

describe('DataTable group extra at the end', () => {
  it('extraEnd: the extra is in the end slot and the row is marked; a plain group keeps it after the count', () => {
    table({ presentation: 'table' });
    const end = screen.getByTestId('extra-one').closest('[data-group-extra-end]');
    expect(end).not.toBeNull();
    expect(end!.closest('tr')!.className).toMatch(/groupRowEnd/);
    expect(screen.getByTestId('extra-two').closest('[data-group-extra-end]')).toBeNull();
    expect(screen.getByTestId('extra-two').closest('tr')!.className).not.toMatch(/groupRowEnd/);
  });

  it('a stacked header ignores extraEnd: its own second line already spans the row', () => {
    table({ presentation: 'table', groupHeader: 'stacked' });
    expect(screen.getByTestId('extra-one').closest('[data-group-extra-end]')).toBeNull();
    expect(screen.getByTestId('extra-one').closest('tr')!.className).not.toMatch(/groupRowEnd/);
  });

  it('the last (⋯) cell and an end-placed group row read one end padding; the slot is pushed to the end', () => {
    // The ⋯ cell is the row's last cell, and `.tr > td:last-child` outranks `.tr > .tdActions`: its end padding is the
    // last-cell value, which the end-placed group row reads too. The browser spec measures the edges.
    expect(prop('.table', '--actions-pad-end')).toBe('var(--sp-4)');
    expect(prop('.tr > td:last-child', 'padding-inline-end')).toBe('var(--actions-pad-end)');
    expect(prop('.thead th:last-child', 'padding-inline-end')).toBe('var(--actions-pad-end)');
    expect(prop('.groupRow.groupRowEnd > td', 'padding-inline-end')).toBe('var(--actions-pad-end)');
    expect(prop('.groupExtraEnd', 'margin-inline-start')).toBe('auto');
  });
});
