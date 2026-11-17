// Vitest: a pager names what it counts when the table asks (pagerNamed), with the table's own count words
// (countLabel): "1–10 of 25 things", where a group's count beside it counts something else. Without the prop the pager
// says the plain range, as before.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from './DataTable';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
}
const ROWS: Row[] = Array.from({ length: 25 }, (_, i) => ({ id: `r${i}`, name: `row ${i}` }));
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true } })];
type Props = Partial<Parameters<typeof DataTable<Row>>[0]>;
const table = (extra: Props = {}) =>
  render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="table" pageSize={10} countLabel={(n) => `${n} things`} {...extra} />);

describe('the pager', () => {
  it('names what it counts with the count words when asked', () => {
    table({ pagerNamed: true });
    const pager = screen.getByRole('navigation', { name: 'Pages' });
    expect(pager.textContent).toContain('1–10 of 25 things');
  });

  it('says the plain range without the prop', () => {
    table();
    const pager = screen.getByRole('navigation', { name: 'Pages' });
    expect(pager.textContent).toContain('1–10 of 25');
    expect(pager.textContent).not.toContain('things');
  });
});
