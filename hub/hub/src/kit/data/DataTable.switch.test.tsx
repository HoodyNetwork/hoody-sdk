// Vitest: a required switch (Open | Finished) that narrows the rows itself: an empty box shows the
// table's empty state with the switch still there, never "nothing matches" with a Clear filters
// that cannot change the switch. A user filter or search still gives the no-match state.
import { createColumnHelper } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataTable } from './DataTable';
import { useDataView } from './DataTableView';

interface Task {
  id: string;
  name: string;
  done: boolean;
}
const ROWS: Task[] = [{ id: 't1', name: 'atlas', done: true }];
const col = createColumnHelper<Task>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true } })];

function Tasks() {
  const view = useDataView<Task>({
    rows: ROWS,
    columns: COLUMNS,
    getRowId: (r) => r.id,
    search: ['name'],
    filters: [
      {
        id: 'state',
        label: 'Which',
        display: 'segmented',
        required: true,
        defaultValue: 'open',
        value: (r) => (r.done ? 'done' : 'open'),
        options: [
          { value: 'open', label: 'Open' },
          { value: 'done', label: 'Done' },
        ],
      },
    ],
  });
  return <DataTable label="Tasks" view={view} columns={COLUMNS} fill={false} empty={<p>No open tasks</p>} />;
}

async function mount(path: string) {
  const router = createRouter({ routeTree: createRootRoute({ component: Tasks }), history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

describe('DataTable required switch with an empty box', () => {
  it('shows the empty state and keeps the switch, not the no-match state', async () => {
    await mount('/');
    expect(screen.getByText('No open tasks')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Which' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Clear filters/ })).toBeNull();
  });

  it('a search with no result in that box is still the no-match state', async () => {
    await mount('/?q=zzz');
    expect(screen.queryByText('No open tasks')).toBeNull();
    expect(screen.getByRole('button', { name: /Clear filters/ })).toBeInTheDocument();
  });

  it('the other box shows its rows', async () => {
    await mount('/?state=done');
    expect(screen.getByRole('table', { name: 'Tasks' })).toHaveTextContent('atlas');
  });
});
