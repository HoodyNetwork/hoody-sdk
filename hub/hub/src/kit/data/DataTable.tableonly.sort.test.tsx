// Vitest: a `table: false` column has no header, so it is never offered in the view menu and never sorts the table,
// whether the sort comes from the URL, initialSort or a data view. The flagged column here keeps
// the default hiding and sorting (no enableHiding/enableSorting set), the case a page gets by default.
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable';
import { type DataView, useDataView } from './DataTableView';

const nav = vi.hoisted(() => ({ sort: undefined as string | undefined }));
vi.mock('../nav', async (orig) => ({
  ...(await orig<object>()),
  useSearchParam: (key: string) => [key === 'sort' ? nav.sort : undefined, () => undefined],
}));

afterEach(() => {
  cleanup();
  nav.sort = undefined;
});

interface Row { id: string; name: string; note: string }
// Data order alpha, beta; by note (z > a) a sort would put beta first.
const ROWS: Row[] = [
  { id: 'a', name: 'alpha', note: 'z note' },
  { id: 'b', name: 'beta', note: 'a note' },
];
const col = createColumnHelper<Row>();
const COLUMNS = [
  col.accessor('name', { header: 'Name', enableSorting: false, meta: { pinned: true, list: 'primary' } }),
  col.accessor('note', { header: 'Note', meta: { list: 'meta', table: false } }),
];
const order = () => within(screen.getByRole('table', { name: 'Things' })).getAllByText(/^(alpha|beta)$/).map((e) => e.textContent);

describe('a table: false column is never a sort or a view menu entry', () => {
  it('ignores a URL sort by it', () => {
    nav.sort = 'note';
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="table" />);
    expect(order()).toEqual(['alpha', 'beta']);
  });

  it('ignores an initialSort by it, kept locally', () => {
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="table" sortParam={false} initialSort={[{ id: 'note', desc: false }]} />);
    expect(order()).toEqual(['alpha', 'beta']);
  });

  it('ignores an initialSort by it while the URL has no sort', () => {
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="table" initialSort={[{ id: 'note', desc: false }]} />);
    expect(order()).toEqual(['alpha', 'beta']);
  });

  it('a column without the flag still sorts from the URL (control)', () => {
    nav.sort = 'note';
    const plain = [COLUMNS[0]!, col.accessor('note', { header: 'Note', meta: { list: 'meta' } })];
    render(<DataTable label="Things" data={ROWS} columns={plain} getRowId={(r) => r.id} presentation="table" />);
    expect(order()).toEqual(['beta', 'alpha']);
  });

  // A flagged column whose id TanStack derives: a nested accessor key (user.name is the id user_name)
  // and a leaf inside a column group are never a sort either.
  it('ignores an initialSort by a flagged nested accessor', () => {
    type Nested = { id: string; name: string; user: { name: string } };
    const rows: Nested[] = [
      { id: 'a', name: 'alpha', user: { name: 'z' } },
      { id: 'b', name: 'beta', user: { name: 'a' } },
    ];
    const cols: ColumnDef<Nested, unknown>[] = [
      { accessorKey: 'name', header: 'Name', enableSorting: false, meta: { pinned: true, list: 'primary' } },
      { accessorKey: 'user.name', header: 'Nested', meta: { list: 'meta', table: false } },
    ];
    render(<DataTable label="Things" data={rows} columns={cols} getRowId={(r) => r.id} presentation="table" sortParam={false} initialSort={[{ id: 'user_name', desc: false }]} />);
    expect(order()).toEqual(['alpha', 'beta']);
  });

  it('ignores an initialSort by a flagged leaf inside a column group', () => {
    const cols = [COLUMNS[0]!, col.group({ id: 'g', header: 'Group', columns: [col.accessor('note', { id: 'inner', header: 'Inner', meta: { list: 'meta', table: false } })] })];
    render(<DataTable label="Things" data={ROWS} columns={cols} getRowId={(r) => r.id} presentation="table" sortParam={false} initialSort={[{ id: 'inner', desc: false }]} />);
    expect(order()).toEqual(['alpha', 'beta']);
  });

  // Columns without the flag sort as before, whatever their id comes from: an accessor function whose id
  // is its header, and a leaf inside a column group. Each sorts by note text, so beta (a note) comes first.
  it('an unflagged accessor function with a header-derived id still sorts from initialSort (control)', () => {
    const cols = [COLUMNS[0]!, COLUMNS[1]!, col.accessor((r) => r.note, { header: 'Said', meta: { list: 'meta' } })];
    render(<DataTable label="Things" data={ROWS} columns={cols} getRowId={(r) => r.id} presentation="table" sortParam={false} initialSort={[{ id: 'Said', desc: false }]} />);
    expect(order()).toEqual(['beta', 'alpha']);
  });

  it('an unflagged leaf inside a column group still sorts from initialSort (control)', () => {
    const cols = [COLUMNS[0]!, COLUMNS[1]!, col.group({ id: 'g', header: 'Group', columns: [col.accessor('note', { id: 'inner', header: 'Inner' })] })];
    render(<DataTable label="Things" data={ROWS} columns={cols} getRowId={(r) => r.id} presentation="table" sortParam={false} initialSort={[{ id: 'inner', desc: false }]} />);
    expect(order()).toEqual(['beta', 'alpha']);
  });

  it('is not in the view menu, while a hideable column without the flag is', async () => {
    const cols = [...COLUMNS, col.accessor('id', { header: 'Ident', meta: { priority: 3 } })];
    render(<DataTable label="Things" data={ROWS} columns={cols} getRowId={(r) => r.id} presentation="table" />);
    await userEvent.click(screen.getByRole('button', { name: 'View options' }));
    const menu = await screen.findByRole('menu', { name: 'View options' });
    expect(within(menu).getByRole('menuitemcheckbox', { name: 'Ident' })).toBeTruthy();
    expect(within(menu).queryByRole('menuitemcheckbox', { name: 'Note' })).toBeNull();
  });
});

describe('useDataView: a table: false column is never a sort', () => {
  let view: DataView<Row>;
  function Probe() {
    view = useDataView<Row>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id });
    return null;
  }
  const mount = async (path: string) => {
    const router = createRouter({ routeTree: createRootRoute({ component: Probe }), history: createMemoryHistory({ initialEntries: [path] }) });
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });
  };

  it('ignores sort=note in the URL', async () => {
    await mount('/?sort=note');
    expect(view.sort).toBeUndefined();
    expect(view.rows.map((r) => r.id)).toEqual(['a', 'b']);
  });
});
