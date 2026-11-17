import { createColumnHelper } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { DataTable } from './DataTable';
import { type DataView, useDataView } from './DataTableView';

interface Box {
  id: string;
  name: string;
  state: string;
  ram: number;
}

const ROWS: Box[] = [
  { id: 'a', name: 'atlas', state: 'running', ram: 8 },
  { id: 'b', name: 'Borealis', state: 'running', ram: 4 },
  { id: 'c', name: 'cédar', state: 'stopped', ram: 4 },
  { id: 'd', name: 'dune', state: 'creating', ram: 2 },
  { id: 'e', name: 'ember', state: 'failed', ram: 4 },
];
const col = createColumnHelper<Box>();
const COLUMNS = [
  col.accessor('name', { header: 'Name', meta: { pinned: true } }),
  col.accessor('state', { header: 'State' }),
  col.accessor('ram', { header: 'RAM' }),
];

let last: DataView<Box> | undefined;

function Page({ pageSize, more }: { pageSize?: number; more?: boolean }) {
  const view = useDataView({
    rows: ROWS,
    columns: COLUMNS,
    getRowId: (r) => r.id,
    search: ['name'],
    filters: [
      { id: 'state', label: 'State', value: (r) => r.state },
      { id: 'ram', label: 'RAM', kind: 'range', value: (r) => r.ram },
    ],
    sort: 'name',
    pageSize,
    more,
  });
  last = view;
  return <DataTable label="Boxes" columns={COLUMNS} view={view} presentation="table" />;
}

async function mount(path: string, el: () => ReactElement = () => <Page />) {
  const router = createRouter({ routeTree: createRootRoute({ component: el }), history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  return router;
}

const names = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[0]?.textContent);

describe('useDataView + DataTable', () => {
  it('restores search, filters and sort from the URL (reload)', async () => {
    await mount('/?q=AT&sort=-name');
    expect(names()).toEqual(['atlas']);
    expect(screen.getByRole('searchbox')).toHaveValue('AT');
  });

  it('sorts by the default, then by the URL; accents fold in search', async () => {
    await mount('/');
    expect(names()).toEqual(['atlas', 'Borealis', 'cédar', 'dune', 'ember']);
    await act(async () => last?.setQ('cedar'));
    expect(names()).toEqual(['cédar']);
  });

  it('writes filters to the URL and clears them all from the no-match state', async () => {
    const router = await mount('/?state=running&ram=5..');
    expect(names()).toEqual(['atlas']);
    await act(async () => last?.setFilter('ram', { kind: 'range', min: 100 }));
    expect(router.state.location.search).toMatchObject({ state: 'running', ram: '100..' });
    const clear = screen.getByRole('button', { name: 'Clear filters' });
    await act(async () => fireEvent.click(clear));
    expect(names()).toHaveLength(5);
    expect(router.state.location.search).toEqual({});
  });

  it('pages in the URL and resets the page when the search changes (the search itself never in the URL)', async () => {
    const router = await mount('/?page=2', () => <Page pageSize={2} />);
    expect(names()).toEqual(['cédar', 'dune']);
    expect(screen.getByText('3–4 of 5')).toBeInTheDocument();
    await act(async () => last?.setQ('e'));
    expect(router.state.location.search).toEqual({});
    expect(last?.query.q).toBe('e');
  });

  it('shows more rows with "Show more" and says how many of how many', async () => {
    await mount('/', () => <Page pageSize={2} more />);
    expect(names()).toHaveLength(2);
    expect(screen.getByText('Showing 2 of 5')).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Show more' })));
    expect(names()).toHaveLength(4);
  });

  it('opens a row into ?sel= with Enter', async () => {
    const router = await mount('/');
    const row = screen.getByText('dune').closest('tr') as HTMLElement;
    await act(async () => fireEvent.keyDown(row, { key: 'Enter' }));
    expect(router.state.location.search).toEqual({ sel: 'd' });
  });
});

// A required single choice that picks the source (Unread | Archive).
function BoxPage() {
  const view = useDataView({
    rows: ROWS,
    columns: COLUMNS,
    getRowId: (r) => r.id,
    search: ['name'],
    filters: [
      {
        id: 'box',
        label: 'Box',
        value: () => 'unread',
        display: 'segmented',
        required: true,
        defaultValue: 'unread',
        apply: false,
        options: [
          { value: 'unread', label: 'Unread' },
          { value: 'archive', label: 'Archive' },
        ],
      },
      { id: 'state', label: 'State', value: (r) => r.state },
    ],
    sort: 'name',
  });
  last = view;
  return <DataTable label="Boxes" columns={COLUMNS} view={view} presentation="table" />;
}

describe('useDataView required filter', () => {
  it('has its default without a URL key, shows no Any, filters nothing, and is never counted or cleared', async () => {
    const router = await mount('/', () => <BoxPage />);
    expect(last?.query.filters).toEqual({ box: 'unread' });
    expect(last?.isFiltered).toBe(false);
    expect(last?.matched).toBe(ROWS.length);
    const seg = screen.getByRole('radiogroup', { name: 'Box' });
    expect(within(seg).queryByRole('radio', { name: /Any/ })).toBeNull();
    await act(async () => fireEvent.click(within(seg).getByRole('radio', { name: 'Archive' })));
    expect(router.state.location.search).toMatchObject({ box: 'archive' });
    expect(last?.isFiltered).toBe(false);
    expect(last?.matched).toBe(ROWS.length);
    await act(async () => router.navigate({ to: '.', search: { box: 'archive', state: 'running' } as never }));
    expect(last?.isFiltered).toBe(true);
    await act(async () => last?.clearAll());
    expect(router.state.location.search).toEqual({ box: 'archive' });
    await act(async () => fireEvent.click(within(seg).getByRole('radio', { name: 'Unread' })));
    expect(router.state.location.search).toEqual({});
  });

  it('a hand-typed value that is not an option reads as the default', async () => {
    await mount('/?box=bogus', () => <BoxPage />);
    expect(last?.query.filters).toEqual({ box: 'unread' });
    expect(within(screen.getByRole('radiogroup', { name: 'Box' })).getByRole('radio', { name: 'Unread' }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('option counts', () => {
  const counts = (id: string) => Object.fromEntries((last?.chips.find((c) => c.id === id)?.options ?? []).map((o) => [o.value, o.count]));
  it('count the rows each option would show under the search and the other filters', async () => {
    await mount('/?q=e&ram=..4');
    // q 'e' keeps Borealis, cédar, dune and ember (ram <= 4 keeps them all): atlas's running is not counted.
    expect(counts('state')).toEqual({ creating: 1, failed: 1, running: 1, stopped: 1 });
    await mount('/?state=running');
    // A filter's own value never narrows its counts.
    expect(counts('state')).toEqual({ creating: 1, failed: 1, running: 2, stopped: 1 });
  });
  it('fill counts for options the page lists, and keep a count the page gives', async () => {
    function Listed() {
      const view = useDataView({
        rows: ROWS,
        columns: COLUMNS,
        getRowId: (r) => r.id,
        search: ['name'],
        filters: [
          { id: 'state', label: 'State', value: (r) => r.state, options: [{ value: 'running', label: 'Running' }, { value: 'paused', label: 'Paused' }, { value: 'failed', label: 'Failed', count: 9 }] },
          { id: 'pick', label: 'Pick', value: () => '', apply: false, options: [{ value: 'x', label: 'X' }] },
        ],
      });
      last = view;
      return <DataTable label="Boxes" columns={COLUMNS} view={view} presentation="table" />;
    }
    await mount('/?q=b', () => <Listed />);
    expect(counts('state')).toEqual({ running: 1, paused: 0, failed: 9 });
    // apply:false: the rows say nothing about it, so no count is made up.
    expect(counts('pick')).toEqual({ x: undefined });
  });
});
