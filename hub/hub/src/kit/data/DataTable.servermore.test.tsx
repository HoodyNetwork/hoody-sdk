// Vitest: a client view over the rows a page has read so far, with more on the server (the page passes `total`
// and `onLoadMore`). The footer says how many of the total and offers Load more; the view's own "Show more"
// still comes first; without onLoadMore nothing changes.
import { createColumnHelper } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable';
import { useDataView } from './DataTableView';

interface Row {
  id: string;
  name: string;
}
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true } })];
const ROWS: Row[] = Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, name: `row ${i}` }));

function Page({ onLoadMore, total, pageSize, more }: { onLoadMore?: () => void; total?: number; pageSize?: number; more?: boolean }) {
  const view = useDataView({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, pageSize, more });
  return <DataTable label="Rows" columns={COLUMNS} view={view} presentation="table" {...(total !== undefined ? { total } : {})} {...(onLoadMore ? { onLoadMore } : {})} />;
}

async function mount(el: () => ReturnType<typeof Page>) {
  const router = createRouter({ routeTree: createRootRoute({ component: el }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

describe('DataTable: a view with more rows on the server', () => {
  it('says how many of the total and offers Load more, which calls the page', async () => {
    const load = vi.fn();
    await mount(() => <Page total={20} onLoadMore={load} />);
    expect(screen.getByText('Showing 6 of 20')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('no Load more once every row is read, or without onLoadMore', async () => {
    const load = vi.fn();
    await mount(() => <Page total={6} onLoadMore={load} />);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    await mount(() => <Page total={20} />);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it("the view's own Show more comes first", async () => {
    const load = vi.fn();
    await mount(() => <Page total={20} onLoadMore={load} pageSize={4} more />);
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(load).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument();
  });
});
