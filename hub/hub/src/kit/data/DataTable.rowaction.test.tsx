// Vitest: onRowAction={false}. Rows that open nothing must not look like they open: no pointer class and no
// data-row-opens, in table and list presentation; a click or Enter does nothing.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { type ReactElement } from 'react';
import { DataTable } from './DataTable';
import { useDataView } from './DataTableView';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
}
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary' } })];
const DATA: Row[] = [{ id: 'a', name: 'alpha' }];
const rowOf = () => screen.getByText('alpha').closest('tr') as HTMLTableRowElement;
// A view needs the router (its state lives in the URL).
async function mountRouted(el: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: el }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  let r!: ReturnType<typeof render>;
  await act(async () => {
    r = render(<RouterProvider router={router} />);
    await router.load();
  });
  return r;
}

describe('DataTable onRowAction={false}', () => {
  for (const presentation of ['table', 'list'] as const) {
    it(`${presentation}: the row has no open affordance and a click or Enter opens nothing`, () => {
      render(<DataTable label="Things" presentation={presentation} data={DATA} columns={COLUMNS} getRowId={(r) => r.id} onRowAction={false} />);
      const row = rowOf();
      expect(row).not.toHaveAttribute('data-row-opens');
      expect(row.className).not.toMatch(/clickable/);
      expect(row).not.toHaveAttribute('role', 'button');
      fireEvent.click(row);
      fireEvent.keyDown(row, { key: 'Enter' });
    });

    // A view-backed table opens rows through view.open by default; false turns that off too.
    it(`${presentation}: with a view, false stops view.open on click, Enter and 'o'; without the prop the view opens the row`, async () => {
      const open = vi.fn();
      function Page({ off }: { off: boolean }) {
        const view = useDataView({ rows: DATA, columns: COLUMNS, getRowId: (r) => r.id });
        return <DataTable label="Things" presentation={presentation} columns={COLUMNS} view={{ ...view, open }} {...(off ? { onRowAction: false as const } : {})} />;
      }
      const r = await mountRouted(() => <Page off />);
      let row = rowOf();
      expect(row).not.toHaveAttribute('data-row-opens');
      fireEvent.click(row);
      fireEvent.keyDown(row, { key: 'Enter' });
      fireEvent.keyDown(row, { key: 'o' });
      expect(open).not.toHaveBeenCalled();
      r.unmount();
      await mountRouted(() => <Page off={false} />);
      row = rowOf();
      expect(row).toHaveAttribute('data-row-opens');
      fireEvent.click(row);
      fireEvent.keyDown(row, { key: 'Enter' });
      fireEvent.keyDown(row, { key: 'o' });
      expect(open.mock.calls).toEqual([['a'], ['a'], ['a']]);
    });

    it(`${presentation}: a real action still marks the row and runs on click and Enter`, () => {
      const open = vi.fn();
      render(<DataTable label="Things" presentation={presentation} data={DATA} columns={COLUMNS} getRowId={(r) => r.id} onRowAction={open} />);
      const row = rowOf();
      expect(row).toHaveAttribute('data-row-opens');
      expect(row.className).toMatch(/clickable/);
      fireEvent.click(row);
      fireEvent.keyDown(row, { key: 'Enter' });
      expect(open).toHaveBeenCalledTimes(2);
    });
  }
});
