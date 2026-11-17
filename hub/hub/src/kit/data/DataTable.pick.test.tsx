// Vitest: a table that only picks. Selectable with nothing to open: a click anywhere on a row toggles
// it, Enter and Space too; `selectable="pick"` also drops the view's default open. A table with a row action still opens.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import { type ReactElement, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Form } from '../forms/more';
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
const COLUMNS = [
  col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary' } }),
  col.display({ id: 'go', header: 'Go', cell: () => <a href="#/x">link</a> }),
];
const ROWS: Row[] = [
  { id: 'a', name: 'alpha' },
  { id: 'b', name: 'bravo' },
];
const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLTableRowElement;
const picked = () => screen.getByTestId('sel').textContent;

async function mountRouted(el: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: el }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  let r!: ReturnType<typeof render>;
  await act(async () => {
    r = render(<RouterProvider router={router} />);
    await router.load();
  });
  return r;
}

type Selectable = boolean | 'pick';
function Plain({ selectable, onRowAction, presentation = 'table', initial = [], bulk = true }: { selectable: Selectable; onRowAction?: ((r: Row) => void) | false; presentation?: 'table' | 'list' | 'icons'; initial?: string[]; bulk?: boolean }) {
  const [sel, setSel] = useState<Set<string>>(() => new Set(initial));
  return (
    <>
      <output data-testid="sel">{[...sel].sort().join(',')}</output>
      <button type="button" onClick={() => setSel(new Set(['a']))}>
        load
      </button>
      <DataTable
        label="Things"
        presentation={presentation}
        data={ROWS}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        selectable={selectable}
        selectedIds={sel}
        onSelectionChange={setSel}
        {...(bulk ? { bulkActions: () => <span>bulk</span> } : {})}
        {...(onRowAction === undefined ? {} : { onRowAction })}
      />
    </>
  );
}

describe('DataTable pick (selectable with nothing to open)', () => {
  for (const [name, props] of [
    ['selectable="pick"', { selectable: 'pick' as const }],
    ['selectable with onRowAction={false}', { selectable: true, onRowAction: false as const }],
    ['selectable with no handler', { selectable: true }],
  ] as const) {
    it(`${name}: a click anywhere on the row toggles it, with aria-selected and the checkbox`, () => {
      render(<Plain {...props} />);
      const row = rowOf('alpha');
      expect(row.className).toMatch(/clickable/);
      expect(row).toHaveAttribute('aria-selected', 'false');
      fireEvent.click(screen.getByText('alpha'));
      expect(picked()).toBe('a');
      expect(rowOf('alpha')).toHaveAttribute('aria-selected', 'true');
      expect(within(rowOf('alpha')).getByRole('checkbox')).toBeChecked();
      fireEvent.click(rowOf('bravo'));
      expect(picked()).toBe('a,b');
      fireEvent.click(rowOf('alpha'));
      expect(picked()).toBe('b');
    });

    it(`${name}: Enter and Space toggle the focused row, o does not`, () => {
      render(<Plain {...props} />);
      fireEvent.keyDown(rowOf('alpha'), { key: 'Enter' });
      expect(picked()).toBe('a');
      fireEvent.keyDown(rowOf('alpha'), { key: ' ' });
      expect(picked()).toBe('');
      fireEvent.keyDown(rowOf('alpha'), { key: 'o' });
      expect(picked()).toBe('');
    });
  }

  it('a click on a link or the checkbox inside the row is that control\'s own, not a second toggle', () => {
    render(<Plain selectable="pick" />);
    fireEvent.click(within(rowOf('alpha')).getByRole('link', { name: 'link' }));
    expect(picked()).toBe('');
    fireEvent.click(within(rowOf('alpha')).getByRole('checkbox'));
    expect(picked()).toBe('a');
  });

  it('list presentation: a pick shows the checks at once and a row click toggles', () => {
    render(<Plain selectable="pick" presentation="list" />);
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
    fireEvent.click(rowOf('bravo'));
    expect(picked()).toBe('b');
  });

  it('with a row action a click opens the row and selects nothing (unchanged)', () => {
    const open = vi.fn();
    render(<Plain selectable onRowAction={open} />);
    fireEvent.click(screen.getByText('alpha'));
    expect(open).toHaveBeenCalledWith(ROWS[0]);
    expect(picked()).toBe('');
    fireEvent.keyDown(rowOf('bravo'), { key: 'Enter' });
    expect(open).toHaveBeenLastCalledWith(ROWS[1]);
    expect(picked()).toBe('');
  });

  it('a non-selectable table without a row action is untouched: no pick look, a click selects nothing', () => {
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} />);
    expect(rowOf('alpha').className).not.toMatch(/clickable/);
    fireEvent.click(rowOf('alpha'));
    expect(rowOf('alpha')).not.toHaveAttribute('aria-selected', 'true');
  });

  it('inside a locked Form a row click and Enter pick nothing, like the disabled checkbox', () => {
    render(
      <Form locked onSubmit={() => undefined}>
        <Plain selectable="pick" />
      </Form>,
    );
    fireEvent.click(rowOf('alpha'));
    fireEvent.keyDown(rowOf('bravo'), { key: 'Enter' });
    expect(picked()).toBe('');
    expect(within(rowOf('alpha')).getByRole('checkbox')).toBeDisabled();
  });

  it('an unlocked Form still picks (the lock is the only difference)', () => {
    render(
      <Form onSubmit={() => undefined}>
        <Plain selectable="pick" />
      </Form>,
    );
    fireEvent.click(rowOf('alpha'));
    expect(picked()).toBe('a');
  });

  it('a list picker has no "Select rows" / "Stop selecting" command (selecting is permanent); a list with a row action keeps it', async () => {
    const { unmount } = render(<Plain selectable="pick" presentation="list" />);
    fireEvent.click(screen.getByRole('button', { name: 'View options' }));
    expect(screen.queryByText('Stop selecting')).toBeNull();
    expect(screen.queryByText('Select rows')).toBeNull();
    unmount();
    render(<Plain selectable onRowAction={() => undefined} presentation="list" />);
    fireEvent.click(screen.getByRole('button', { name: 'View options' }));
    expect(screen.getByText('Select rows')).toBeInTheDocument();
  });

  it('icons presentation: selectable="pick" toggles on a click (a second click deselects); plain selectable keeps its replace-select', () => {
    const { unmount } = render(<Plain selectable="pick" presentation="icons" />);
    fireEvent.click(rowOf('alpha'));
    fireEvent.click(rowOf('bravo'));
    expect(picked()).toBe('a,b');
    fireEvent.click(rowOf('bravo'));
    expect(picked()).toBe('a');
    unmount();
    render(<Plain selectable onRowAction={() => undefined} presentation="icons" />);
    fireEvent.click(rowOf('alpha'));
    fireEvent.click(rowOf('bravo'));
    expect(picked()).toBe('b');
  });

  it('inside a locked Form an icons tile with a row action is not picked by a click either', () => {
    render(
      <Form locked onSubmit={() => undefined}>
        <Plain selectable onRowAction={() => undefined} presentation="icons" />
      </Form>,
    );
    fireEvent.click(rowOf('alpha'));
    expect(picked()).toBe('');
  });

  describe('inside a locked Form no path changes the selection (one guard on the setter)', () => {
    const locked = (el: ReactElement) => render(<Form locked onSubmit={() => undefined}>{el}</Form>);

    it.each([
      ['Shift+ArrowDown', 'alpha', { key: 'ArrowDown', shiftKey: true }],
      ['Shift+J', 'alpha', { key: 'J', shiftKey: true }],
      ['Shift+ArrowUp', 'bravo', { key: 'ArrowUp', shiftKey: true }],
      ['Shift+K', 'bravo', { key: 'K', shiftKey: true }],
    ])('%s does not extend the selection', (_n, row, ev) => {
      locked(<Plain selectable="pick" />);
      fireEvent.keyDown(rowOf(row), ev);
      expect(picked()).toBe('');
    });

    it('Space and x on a row pick nothing', () => {
      locked(<Plain selectable="pick" />);
      fireEvent.keyDown(rowOf('alpha'), { key: ' ' });
      fireEvent.keyDown(rowOf('bravo'), { key: 'x' });
      expect(picked()).toBe('');
    });

    it('Escape on a row keeps a held selection', () => {
      locked(<Plain selectable="pick" initial={['a']} />);
      fireEvent.keyDown(rowOf('alpha'), { key: 'Escape' });
      expect(picked()).toBe('a');
    });

    it('the toolbar Clear keeps a held selection', () => {
      locked(<Plain selectable="pick" initial={['a', 'b']} />);
      fireEvent.click(screen.getByRole('button', { name: /^Clear/ }));
      expect(picked()).toBe('a,b');
    });

    it('select-all in the header changes nothing', () => {
      locked(<Plain selectable="pick" />);
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select all rows' }));
      expect(picked()).toBe('');
    });

    it('a list menu "Stop selecting" keeps a selection that arrived while selecting', async () => {
      locked(<Plain selectable onRowAction={() => undefined} presentation="list" bulk={false} />);
      fireEvent.click(screen.getByRole('button', { name: 'View options' }));
      fireEvent.click(await screen.findByText('Select rows'));
      fireEvent.click(screen.getByRole('button', { name: 'load' }));
      expect(picked()).toBe('a');
      fireEvent.click(screen.getByRole('button', { name: 'View options' }));
      fireEvent.click(await screen.findByText('Stop selecting'));
      expect(picked()).toBe('a');
    });

    it('an unlocked Form does all of it (the lock is the only difference)', () => {
      render(
        <Form onSubmit={() => undefined}>
          <Plain selectable="pick" initial={['a']} />
        </Form>,
      );
      fireEvent.keyDown(rowOf('alpha'), { key: 'ArrowDown', shiftKey: true });
      expect(picked()).toBe('a,b');
      fireEvent.keyDown(rowOf('alpha'), { key: 'Escape' });
      expect(picked()).toBe('');
    });
  });

  it('o opens a selectable row that has a row action, without selecting it', () => {
    const open = vi.fn();
    render(<Plain selectable onRowAction={open} />);
    fireEvent.keyDown(rowOf('alpha'), { key: 'o' });
    expect(open).toHaveBeenCalledWith(ROWS[0]);
    expect(picked()).toBe('');
  });

  describe('with a view', () => {
    function Page({ selectable, open }: { selectable: Selectable; open: (id: string | undefined) => void }) {
      const view = useDataView({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id });
      return (
        <>
          <output data-testid="sel">{[...view.selected].sort().join(',')}</output>
          <DataTable label="Things" columns={COLUMNS} view={{ ...view, open }} selectable={selectable} />
        </>
      );
    }

    it('selectable="pick" toggles instead of the view default open', async () => {
      const open = vi.fn();
      await mountRouted(() => <Page selectable="pick" open={open} />);
      expect(rowOf('alpha')).not.toHaveAttribute('data-row-opens');
      fireEvent.click(rowOf('alpha'));
      fireEvent.keyDown(rowOf('bravo'), { key: 'Enter' });
      expect(open).not.toHaveBeenCalled();
      expect(picked()).toBe('a,b');
    });

    it('plain selectable keeps the view default open on a click (the table has a row action)', async () => {
      const open = vi.fn();
      await mountRouted(() => <Page selectable open={open} />);
      expect(rowOf('alpha')).toHaveAttribute('data-row-opens');
      fireEvent.click(screen.getByText('alpha'));
      expect(open).toHaveBeenCalledWith('a');
      expect(picked()).toBe('');
    });
  });
});
