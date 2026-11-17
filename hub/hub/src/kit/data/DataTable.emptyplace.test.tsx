// Vitest: only a page's own list gives its empty card the table frame's place. A ListDetailPage list
// pane says so (ListPaneContext `list`); a bare table, a table outside a list pane and a table inside a section card
// keep their empty state where it was, and a state inside the table's own frame (a required switch's empty box) is
// never a card.
import { createColumnHelper } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { CardScope } from '../layouts/CardEdge';
import { ListPaneContext } from '../layouts/pane';
import { EmptyState } from '../states/States';
import { DataTable } from './DataTable';
import { useDataView } from './DataTableView';

interface Row {
  id: string;
  name: string;
}
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true } })];

function Table({ bare, size }: { bare?: boolean; size?: 'md' | 'sm' }) {
  const view = useDataView({ rows: [] as Row[], columns: COLUMNS, getRowId: (r) => r.id, search: ['name'] });
  return <DataTable label="Rows" columns={COLUMNS} view={view} bare={bare} empty={<EmptyState title="Nothing yet" size={size} />} />;
}

interface Task {
  id: string;
  name: string;
  done: boolean;
}
const tcol = createColumnHelper<Task>();
const TCOLS = [tcol.accessor('name', { header: 'Name', meta: { pinned: true } })];
function Switched() {
  const view = useDataView<Task>({
    rows: [{ id: 't1', name: 'atlas', done: true }],
    columns: TCOLS,
    getRowId: (r) => r.id,
    search: ['name'],
    filters: [{ id: 'state', label: 'Which', display: 'segmented', required: true, defaultValue: 'open', value: (r) => (r.done ? 'done' : 'open'), options: [{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }] }],
  });
  return <DataTable label="Tasks" view={view} columns={TCOLS} fill={false} empty={<EmptyState title="No open tasks" />} />;
}

async function mount(node: ReactNode) {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <>{node}</> }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}
const place = () => document.querySelector('[data-empty-place]')?.getAttribute('data-empty-place') ?? null;

describe('DataTable empty slot: the frame place is a list pane\'s only', () => {
  afterEach(cleanup);

  it('a list pane\'s table: the empty card takes the frame', async () => {
    await mount(
      <ListPaneContext.Provider value={{ list: true }}>
        <Table size="sm" />
      </ListPaneContext.Provider>,
    );
    expect(place()).toBe('frame');
  });

  it('a bare table in a list pane keeps its state where it was: sm stays plain, md is the centred card', async () => {
    await mount(
      <ListPaneContext.Provider value={{ list: true }}>
        <Table bare size="sm" />
      </ListPaneContext.Provider>,
    );
    expect(place()).toBeNull();
    cleanup();
    await mount(
      <ListPaneContext.Provider value={{ list: true }}>
        <Table bare />
      </ListPaneContext.Provider>,
    );
    expect(place()).toBe('center');
  });

  it('a table outside a list pane (a section, a rail) never takes the frame', async () => {
    await mount(<Table size="sm" />);
    expect(place()).toBeNull();
    cleanup();
    await mount(
      <ListPaneContext.Provider value={{ presentation: 'list', rail: true, flush: true }}>
        <Table size="sm" />
      </ListPaneContext.Provider>,
    );
    expect(place()).toBeNull();
  });

  it('an empty box of a required switch shows its page-size state inside the table frame, never as a card', async () => {
    await mount(
      <ListPaneContext.Provider value={{ list: true }}>
        <Switched />
      </ListPaneContext.Provider>,
    );
    expect(screen.getByText('No open tasks')).toBeTruthy();
    expect(place()).toBeNull();
    expect(document.querySelector('[data-card-edge]')).toBeNull();
  });

  it('a list pane\'s table inside a card draws no second card', async () => {
    await mount(
      <CardScope>
        <ListPaneContext.Provider value={{ list: true }}>
          <Table />
        </ListPaneContext.Provider>
      </CardScope>,
    );
    expect(place()).toBeNull();
    expect(document.querySelector('[data-card-edge]')).toBeNull();
  });
});
