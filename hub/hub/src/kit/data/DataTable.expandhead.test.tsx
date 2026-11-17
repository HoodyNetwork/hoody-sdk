// DataTable expandable rows: every row keeps a 20 px slot before its first cell (the chevron, or an
// empty gap on a row that cannot expand), so the header's first cell keeps the same slot and the first column lines
// up with its header. A table without expandable rows has no slot anywhere.
import { render, screen, within } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Run { id: string; started: string; result: string; parts: number }
const rows: Run[] = [
  { id: 'a', started: 'Today 13:00', result: 'Worked', parts: 2 },
  { id: 'b', started: 'Yesterday 13:00', result: 'Worked', parts: 0 },
];
const columns: ColumnDef<Run>[] = [
  { id: 'started', header: 'Started', accessorKey: 'started', meta: { pinned: true } },
  { id: 'result', header: 'Result', accessorKey: 'result' },
];
const slot = (el: Element) => [...el.querySelectorAll('span')].filter((x) => /expander/i.test(String(x.className)));

describe('DataTable header slot for expandable rows', () => {
  it('with expandable rows, the first header cell carries the slot the rows carry, and only the first', () => {
    render(<DataTable label="History" presentation="table" data={rows} columns={columns} getRowId={(r) => r.id} renderExpanded={() => 'parts'} canExpand={(r) => r.parts > 0} />);
    const heads = screen.getAllByRole('columnheader');
    expect(slot(heads[0] as HTMLElement)).toHaveLength(1);
    for (const h of heads.slice(1)) expect(slot(h)).toHaveLength(0);
    // The header keeps its name.
    expect(heads[0]).toHaveTextContent('Started');
    // A row that cannot expand keeps the same empty slot.
    const plain = screen.getAllByRole('row').find((r) => within(r).queryByText('Yesterday 13:00'));
    expect(plain && slot(plain)).toHaveLength(1);
  });

  it('without expandable rows there is no slot in the header or the rows', () => {
    const { container } = render(<DataTable label="History" presentation="table" data={rows} columns={columns} getRowId={(r) => r.id} />);
    expect(slot(container)).toHaveLength(0);
  });
});
