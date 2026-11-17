// Vitest: column meta `table: false` (the mirror of `list: false`): the column is a list-row field only, never a table
// column or header. Columns without the flag render exactly as they do with no flagged column at all, in a table and in
// a list (the flag only takes its own column out of the table).
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from './DataTable';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
  note: string;
  when: string;
  kind: string;
}

const ROWS: Row[] = [
  { id: 'a', name: 'alpha', note: 'line-two note', when: 'today', kind: 'cron' },
  { id: 'b', name: 'beta', note: 'other note', when: 'tomorrow', kind: 'loop' },
];
const col = createColumnHelper<Row>();
const COLUMNS = [
  col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary' } }),
  col.accessor('note', { header: 'Note', enableHiding: false, meta: { list: 'meta', table: false } }),
];

describe('DataTable column meta table: false', () => {
  it('a table shows neither its header nor its cells', () => {
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="table" />);
    const table = screen.getByRole('table', { name: 'Things' });
    expect(within(table).queryByRole('columnheader', { name: 'Note' })).toBeNull();
    expect(within(table).queryByText('line-two note')).toBeNull();
    expect(within(table).getByText('alpha')).toBeTruthy();
  });

  it('a list row shows it on line 2', () => {
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="list" />);
    const table = screen.getByRole('table', { name: 'Things' });
    expect(within(table).getByText('line-two note')).toBeTruthy();
    expect(within(table).getByText('alpha')).toBeTruthy();
  });
});

// The rendered table with React's generated ids made neutral (two renders mint different ones).
const html = (el: HTMLElement) => el.outerHTML.replace(/_r_[0-9a-z]+_|:r[0-9a-z]+:|«r[0-9a-z]+»/g, 'ID');

describe('columns without the flag render as before', () => {
  const PLAIN = [
    col.accessor('name', { header: 'Name', meta: { pinned: true } }),
    col.accessor('when', { header: 'When', meta: { width: '120px', priority: 2 } }),
    col.accessor('kind', { header: 'Kind', meta: { priority: 3 } }),
  ];
  // A flagged column that is also never in list rows: neither a table nor a list shows it, so nothing else may move.
  const WITH_INERT = [...PLAIN, col.accessor('note', { header: 'Note', enableHiding: false, meta: { table: false, list: false } })];
  // A flagged line-2 column: a table must render exactly as with no such column.
  const WITH_LISTONLY = [...PLAIN, col.accessor('note', { header: 'Note', enableHiding: false, meta: { table: false } })];

  const render1 = (columns: typeof PLAIN, presentation: 'table' | 'list') => {
    const { unmount } = render(<DataTable label="Things" data={ROWS} columns={columns} getRowId={(r) => r.id} presentation={presentation} />);
    const out = html(screen.getByRole('table', { name: 'Things' }));
    unmount();
    return out;
  };

  it('a table: the same bytes with or without a flagged column', () => {
    const base = render1(PLAIN, 'table');
    expect(render1(WITH_INERT, 'table')).toBe(base);
    expect(render1(WITH_LISTONLY, 'table')).toBe(base);
  });

  it('a list: the same bytes with or without a flagged column that is never in list rows', () => {
    expect(render1(WITH_INERT, 'list')).toBe(render1(PLAIN, 'list'));
  });
});
