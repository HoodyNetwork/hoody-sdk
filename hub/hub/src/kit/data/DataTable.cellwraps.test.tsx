// Vitest: column meta wraps marks that column's table cells as wrapping (data-cell-wraps on the td,
// DataTable.module.css .td[data-cell-wraps]): the text takes the lines it needs and the row grows, instead of one line
// ending in an ellipsis. Off by default, table cells only: the header, sorting, the selection column, row keys and the
// list rows (which follow listWraps) are the same with and without it. The gallery's "Cells that wrap" table shows it.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { createColumnHelper } from '@tanstack/react-table';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
  size: string;
}
const ROWS: Row[] = [
  { id: 'a', name: 'averylongnamewithnobreakpointanywhereinsideit', size: '2 CPU' },
  { id: 'b', name: 'beta', size: '4 CPU' },
];
const col = createColumnHelper<Row>();
const cols = (wraps: boolean | undefined) => [
  col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary', ...(wraps === undefined ? {} : { wraps }) } }),
  col.accessor('size', { header: 'Size' }),
];
const cellOf = (c: HTMLElement, text: string) => [...c.querySelectorAll<HTMLElement>('td')].find((td) => td.textContent === text);
// Everything but the mark itself: what the table draws must be the same with and without the option.
const shape = (c: HTMLElement) =>
  [...c.querySelectorAll('*')].map((e) => `${e.tagName}.${e.getAttribute('class') ?? ''}[${e.getAttribute('role') ?? ''}|${e.getAttribute('tabindex') ?? ''}|${e.getAttribute('aria-sort') ?? ''}|${e.getAttribute('aria-label') ?? ''}]${e.children.length ? '' : e.textContent}`).join('\n');

describe('DataTable column meta wraps', () => {
  it('marks every body cell of its column, and no other cell', () => {
    const { container } = render(<DataTable label="People" data={ROWS} columns={cols(true)} getRowId={(r) => r.id} presentation="table" />);
    expect(cellOf(container, ROWS[0]!.name)?.hasAttribute('data-cell-wraps')).toBe(true);
    expect(cellOf(container, 'beta')?.hasAttribute('data-cell-wraps')).toBe(true);
    expect(cellOf(container, '2 CPU')?.hasAttribute('data-cell-wraps')).toBe(false);
    expect(container.querySelectorAll('[data-cell-wraps]')).toHaveLength(2);
    expect(container.querySelector('th[data-cell-wraps]')).toBeNull();
  });

  it.each([undefined, false])('marks nothing when the column says %s', (wraps) => {
    const { container } = render(<DataTable label="People" data={ROWS} columns={cols(wraps)} getRowId={(r) => r.id} presentation="table" />);
    expect(container.querySelector('[data-cell-wraps]')).toBeNull();
  });

  it('changes nothing else in the table: header, sort button, selection column and rows are the same markup', () => {
    const on = render(<DataTable label="People" data={ROWS} columns={cols(true)} getRowId={(r) => r.id} presentation="table" selectable selectedIds={new Set()} onSelectionChange={() => undefined} />);
    const withIt = shape(on.container);
    on.unmount();
    const off = render(<DataTable label="People" data={ROWS} columns={cols(false)} getRowId={(r) => r.id} presentation="table" selectable selectedIds={new Set()} onSelectionChange={() => undefined} />);
    expect(withIt).toBe(shape(off.container));
  });

  it('keeps sorting from its header and moving between rows with the keys', () => {
    render(<DataTable label="People" data={ROWS} columns={cols(true)} getRowId={(r) => r.id} presentation="table" sortParam={false} />);
    const ids = () => screen.getAllByRole('row').map((r) => r.getAttribute('data-row-id')).filter(Boolean);
    expect(ids()).toEqual(['a', 'b']);
    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(ids()).toEqual(['b', 'a']);
    const rows = screen.getAllByRole('row').filter((r) => r.hasAttribute('data-row-id'));
    // The tab stop follows its row through the sort: row a, now second. k moves up to row b.
    expect(rows[1]).toHaveAttribute('tabindex', '0');
    rows[1]!.focus();
    fireEvent.keyDown(rows[1]!, { key: 'k' });
    expect(rows[0]).toHaveAttribute('tabindex', '0');
    expect(rows[1]).toHaveAttribute('tabindex', '-1');
  });

  it.each(['list', 'cards'] as const)('leaves %s rows alone (they follow listWraps)', (presentation) => {
    const { container } = render(<DataTable label="People" data={ROWS} columns={cols(true)} getRowId={(r) => r.id} presentation={presentation} />);
    expect(container.querySelector('[data-cell-wraps]')).toBeNull();
    expect(container.querySelector('[data-meta-wraps]')).toBeNull();
  });

  it('the CSS wraps a marked cell and keeps a one-line row inside the row height', () => {
    const css = readFileSync(path.join(import.meta.dirname, 'DataTable.module.css'), 'utf8');
    const rule = (sel: string) => new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[2] ?? '';
    const cell = rule('.td[data-cell-wraps]');
    expect(cell).toMatch(/white-space:\s*normal/);
    // A run with no break point breaks anywhere, so the cell never needs more than its column.
    expect(cell).toMatch(/overflow-wrap:\s*anywhere/);
    expect(cell).toMatch(/text-overflow:\s*clip/);
    // One 20 px line plus the block padding is 36 px (28 px compact): under the 44 px (32 px) row, so such a row keeps its height.
    expect(cell).toMatch(/padding-block:\s*var\(--sp-2\)/);
    expect(rule("[data-density='compact'] .td[data-cell-wraps]")).toMatch(/padding-block:\s*var\(--sp-1\)/);
    // The unmarked cell still keeps one line with an ellipsis.
    expect(rule('.td')).toMatch(/white-space:\s*nowrap/);
    expect(rule('.td')).toMatch(/text-overflow:\s*ellipsis/);
  });
});
