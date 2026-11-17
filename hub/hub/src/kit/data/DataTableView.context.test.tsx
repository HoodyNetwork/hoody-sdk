// useDataView across a context switch: after an account,
// realm or computer change the old context's rows, selection and open-row actions never stay on
// screen; the table shows loading, then the new answer or an error. Also: column sortingFn and
// enableSorting:false, loading with an error, and the table prefs in the sign-out registry.
import { createColumnHelper } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { bump, setTarget } from '@core/ctx';
import { registryEntry } from '@core/registry';
import { DataTable } from './DataTable';
import { type DataView, useDataView } from './DataTableView';

interface Box {
  id: string;
  name: string;
  status: string;
}

const A: Box[] = [
  { id: 'a1', name: 'atlas', status: 'idle' },
  { id: 'a2', name: 'borealis', status: 'waiting' },
];
const B: Box[] = [{ id: 'b1', name: 'cedar', status: 'idle' }];
const RANK: Record<string, number> = { waiting: 0, error: 1, working: 2, idle: 3 };

const col = createColumnHelper<Box>();
const COLUMNS = [
  col.accessor('name', { header: 'Name', meta: { pinned: true } }),
  col.accessor('status', { header: 'Status', sortingFn: (a, b) => RANK[a.original.status]! - RANK[b.original.status]! }),
  col.accessor((r) => r.id, { id: 'tag', header: 'Tag', enableSorting: false }),
];

let view: DataView<Box> | undefined;
let setRows: (r: readonly Box[] | undefined) => void = () => undefined;
let setError: (e: unknown) => void = () => undefined;

function Page({ server }: { server: boolean }) {
  const [rows, rowsSet] = useState<readonly Box[] | undefined>(A);
  const [error, errorSet] = useState<unknown>(undefined);
  setRows = rowsSet;
  setError = errorSet;
  view = useDataView({
    rows,
    columns: COLUMNS,
    getRowId: (r) => r.id,
    ...(server ? { server: { isLoading: rows === undefined && !error, error } } : { isLoading: rows === undefined && !error, error }),
  });
  return <DataTable label="Boxes" columns={COLUMNS} view={view} presentation="table" selectable />;
}

async function mount(server: boolean, path = '/') {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <Page server={server} /> }), history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  return router;
}

const shown = () => screen.queryAllByRole('row').map((r) => r.textContent ?? '');

beforeEach(() => {
  setTarget(null);
});

describe.each([
  ['server mode', true],
  ['client mode', false],
])('context switch (%s)', (_name, server) => {
  it('a generation bump drops the old rows: loading, then the new answer', async () => {
    await mount(server);
    expect(shown().some((t) => t.includes('atlas'))).toBe(true);
    await act(async () => {
      bump('switch');
      setRows(undefined);
    });
    expect(shown().some((t) => t.includes('atlas'))).toBe(false);
    expect(view?.rows).toEqual([]);
    expect(view?.isLoading).toBe(true);
    await act(async () => setRows(B));
    expect(shown().some((t) => t.includes('cedar'))).toBe(true);
  });

  it('a failed read in the new context shows the error, never the old rows', async () => {
    await mount(server);
    await act(async () => {
      bump('account');
      setRows(undefined);
    });
    await act(async () => setError(new Error('nope')));
    expect(shown().some((t) => t.includes('atlas') || t.includes('borealis'))).toBe(false);
    expect(view?.isLoading).toBe(false);
    expect(screen.getByText("This didn't load")).toBeTruthy();
  });

  it('a computer change clears the selection (no action on the old ids)', async () => {
    await mount(server);
    await act(async () => view?.setSelected(new Set(['a1', 'a2'])));
    expect(view?.selected.size).toBe(2);
    await act(async () => setTarget({ project: { id: 'p2' }, container: { id: 'c2' } }));
    expect(view?.selected.size).toBe(0);
    expect(view?.selectedRows).toEqual([]);
  });
});

describe('sorting follows the column definition', () => {
  it('a column sortingFn orders the rows (Status by urgency, not alphabetically)', async () => {
    await mount(false, '/?sort=status');
    expect(view?.rows.map((r) => r.status)).toEqual(['waiting', 'idle']);
  });

  it('enableSorting:false ignores a sort in the URL', async () => {
    await mount(false, '/?sort=-tag');
    expect(view?.sort).toBeUndefined();
  });
});

describe('table prefs are wiped at sign-out', () => {
  it('hub.v3.table.* and hub.v3.pane.* are registered purge keys', () => {
    expect(registryEntry('local', 'hub.v3.table.bots')?.purge).toBe(true);
    expect(registryEntry('local', 'hub.v3.pane.keys.list')?.purge).toBe(true);
  });
});

describe('the search box, sort and selection across a context switch', () => {
  it('a context switch puts the box back to the applied search, not unsent text', async () => {
    await mount(true, '/?q=atl');
    await act(async () => view?.setQ('atlas-typed'));
    expect(view?.q).toBe('atlas-typed');
    await act(async () => {
      bump('switch');
    });
    expect(view?.q).toBe('atl');
  });

  it('a refresh error after an empty answer is the error state, not a stale band over nothing', async () => {
    await mount(true);
    await act(async () => setRows([]));
    await act(async () => setError(new Error('nope')));
    expect(screen.getByText("This didn't load")).toBeTruthy();
    expect(screen.queryByText('Showing the last answer we got. It may be out of date.')).toBeNull();
  });

  it('the server query carries no sort for a column with sorting off', async () => {
    await mount(true, '/?sort=-tag');
    expect(view?.query.sort).toBeUndefined();
  });
});
