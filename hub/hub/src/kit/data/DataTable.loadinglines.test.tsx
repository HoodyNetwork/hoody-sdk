// Vitest: a column table's first read draws one loading line per declared column, inside that column's cell under the
// real header, so the loading table has the loaded one's shape.
// List rows keep the block skeleton. Readers hear "Loading" once; the lines themselves are hidden from them.
import { createColumnHelper } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { DataTable } from './DataTable';

interface Row {
  id: string;
  name: string;
  state: string;
  ports: number;
  sandbox: string;
  boot: string;
  up: string;
}
const col = createColumnHelper<Row>();
const SIX = [
  col.accessor('name', { header: 'Name', meta: { pinned: true } }),
  col.accessor('state', { header: 'State' }),
  col.accessor('up', { header: 'Up' }),
  col.accessor('ports', { header: 'Ports', meta: { align: 'end' } }),
  col.accessor('sandbox', { header: 'Sandbox' }),
  col.accessor('boot', { header: 'At boot' }),
];
const FOUR = SIX.slice(0, 4);

async function mount(el: ReactNode) {
  const router = createRouter({ routeTree: createRootRoute({ component: () => el }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const headCells = () => [...document.querySelectorAll('table thead th')];
const loadingRows = () => [...document.querySelectorAll('table tbody[data-skeleton] tr')];

describe('DataTable: loading lines follow the columns', () => {
  afterEach(cleanup);

  for (const [n, columns] of [
    [6, SIX],
    [4, FOUR],
  ] as const) {
    it(`${n} columns: every loading row has one cell per header cell, each with one line`, async () => {
      await mount(<DataTable label="Programs" presentation="table" columns={columns} data={undefined} getRowId={(r) => r.id} isLoading />);
      const heads = headCells();
      expect(heads).toHaveLength(n);
      const rows = loadingRows();
      expect(rows.length).toBeGreaterThan(0);
      for (const tr of rows) {
        const cells = [...tr.children];
        expect(cells).toHaveLength(heads.length);
        for (const td of cells) {
          expect(td.tagName).toBe('TD');
          expect(td.children).toHaveLength(1);
        }
      }
      // The lines sit in the table itself, never in a block of fixed places beside it.
      expect(document.querySelectorAll('[data-skeleton]')).toHaveLength(1);
      expect(document.querySelector('[data-skeleton]')!.closest('table')).not.toBeNull();
    });
  }

  it("an end-aligned column's line keeps its column's alignment (the cell takes the column's class)", async () => {
    await mount(<DataTable label="Programs" presentation="table" columns={SIX} data={undefined} getRowId={(r) => r.id} isLoading />);
    const portsAt = headCells().findIndex((th) => th.textContent?.includes('Ports'));
    const portsHead = headCells()[portsAt]!;
    const portsCell = loadingRows()[0]!.children[portsAt]!;
    expect(portsHead.className).toMatch(/end/);
    expect(portsCell.className).toMatch(/end/);
  });

  it('readers hear Loading once; the lines are hidden from them', async () => {
    await mount(<DataTable label="Programs" presentation="table" columns={SIX} data={undefined} getRowId={(r) => r.id} isLoading />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toMatch(/Loading/);
    expect(document.querySelector('tbody[data-skeleton]')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('list rows keep the block skeleton (no columns to follow)', async () => {
    await mount(<DataTable label="Programs" presentation="list" columns={SIX} data={undefined} getRowId={(r) => r.id} isLoading />);
    expect(document.querySelector('tbody[data-skeleton]')).toBeNull();
    expect(document.querySelector('div[data-skeleton]')).not.toBeNull();
  });

  it('gone once the rows are in', async () => {
    const data: Row[] = [{ id: 'a', name: 'atlas', state: 'up', up: '1h', ports: 2, sandbox: 'on', boot: 'yes' }];
    await mount(<DataTable label="Programs" presentation="table" columns={SIX} data={data} getRowId={(r) => r.id} />);
    expect(document.querySelector('[data-skeleton]')).toBeNull();
    expect(screen.getByText('atlas')).toBeInTheDocument();
  });
});
