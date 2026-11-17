// Vitest: data-hub-busy, the e2e-search settle hook. Present only while the table's view loads (kept rows on screen
// included), absent once it is settled; never a value ("false" would read as busy to a presence check).
import { createColumnHelper } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { DataTable } from './DataTable';
import { useDataView } from './DataTableView';

interface Row {
  id: string;
  name: string;
}
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true } })];
const ROWS: Row[] = Array.from({ length: 4 }, (_, i) => ({ id: `r${i}`, name: `row ${i}` }));

let setAnswer: (r: readonly Row[] | undefined) => void = () => {};
function Page({ first }: { first: readonly Row[] | undefined }) {
  const [answer, setA] = useState<readonly Row[] | undefined>(first);
  setAnswer = setA;
  const view = useDataView({ rows: answer, columns: COLUMNS, getRowId: (r) => r.id, search: ['name'], server: { total: 4 } });
  return <DataTable label="Rows" columns={COLUMNS} view={view} presentation="table" />;
}

async function mount(first: readonly Row[] | undefined) {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <Page first={first} /> }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}
const root = () => document.querySelector('[data-dataview]');
const step = async (fn: () => void) => act(async () => fn());

describe('DataTable: data-hub-busy (test hook)', () => {
  afterEach(cleanup);

  it('absent on a settled table, present while the first answer loads, absent again once it is in', async () => {
    await mount(ROWS);
    expect(root()).not.toBeNull();
    expect(root()!.hasAttribute('data-hub-busy')).toBe(false);
    cleanup();
    await mount(undefined);
    expect(root()!.getAttribute('data-hub-busy')).toBe('');
    await step(() => setAnswer(ROWS));
    expect(screen.getByText('row 0')).toBeInTheDocument();
    expect(root()!.hasAttribute('data-hub-busy')).toBe(false);
  });

  it('present while kept rows stay on screen during a refresh, and only then', async () => {
    await mount(ROWS);
    await step(() => setAnswer(undefined));
    // The old rows are still drawn: a row check alone would pass here, the hook says the view is not settled.
    expect(screen.getByText('row 3')).toBeInTheDocument();
    expect(root()!.getAttribute('data-hub-busy')).toBe('');
    await step(() => setAnswer(ROWS.slice(0, 1)));
    expect(screen.queryByText('row 3')).toBeNull();
    expect(root()!.hasAttribute('data-hub-busy')).toBe(false);
  });

  it('a plain table without a view: present only while isLoading', async () => {
    let setLoading: (b: boolean) => void = () => {};
    function Plain() {
      const [loading, setL] = useState(true);
      setLoading = setL;
      return <DataTable label="Rows" columns={COLUMNS} data={ROWS} getRowId={(r) => r.id} isLoading={loading} presentation="table" />;
    }
    const router = createRouter({ routeTree: createRootRoute({ component: Plain }), history: createMemoryHistory({ initialEntries: ['/'] }) });
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });
    const frame = () => document.querySelector('[data-table-frame]');
    expect(screen.getByText('row 2')).toBeInTheDocument();
    expect(frame()!.getAttribute('data-hub-busy')).toBe('');
    await step(() => setLoading(false));
    expect(frame()!.hasAttribute('data-hub-busy')).toBe(false);
  });
});
