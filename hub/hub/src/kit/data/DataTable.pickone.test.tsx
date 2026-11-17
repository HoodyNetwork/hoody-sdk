// Vitest: selectable="pickOne". A real radio leads every row, all of one name, inside a labelled
// table; the selection holds one id at most; a row click, Space or Enter picks; nothing opens and nothing selects all.
// The view's own selection keeps the last id when it is told the table picks one.
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
  note: string;
}
const col = createColumnHelper<Row>();
const COLUMNS = [
  col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary' } }),
  col.accessor('note', { header: 'Note', meta: { list: 'meta' } }),
];
const ROWS: Row[] = [
  { id: 'a', name: 'alpha', note: 'one' },
  { id: 'b', name: 'bravo', note: 'two' },
  { id: 'c', name: 'charlie', note: 'three' },
];
const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLTableRowElement;
const picked = () => screen.getByTestId('sel').textContent;

function One({ presentation = 'table', onSel }: { presentation?: 'table' | 'list' | 'cards'; onSel?: (ids: Set<string>) => void }) {
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  return (
    <>
      <output data-testid="sel">{[...sel].sort().join(',')}</output>
      <DataTable
        label="Pick a computer"
        presentation={presentation}
        data={ROWS}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        selectable="pickOne"
        selectedIds={sel}
        onSelectionChange={(ids) => {
          onSel?.(ids);
          setSel(ids);
        }}
      />
    </>
  );
}

describe('DataTable selectable="pickOne"', () => {
  it('a radio per row, one shared name, in a labelled table; no select-all checkbox', () => {
    render(<One />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    const name = radios[0]!.getAttribute('name');
    expect(name).toBeTruthy();
    for (const r of radios) expect(r.getAttribute('name')).toBe(name);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByRole('table', { name: 'Pick a computer' })).toBeTruthy();
  });

  it('two row clicks leave one picked: the second', () => {
    const seen: string[][] = [];
    render(<One onSel={(ids) => seen.push([...ids])} />);
    fireEvent.click(rowOf('alpha'));
    fireEvent.click(rowOf('charlie'));
    expect(picked()).toBe('c');
    expect(within(rowOf('charlie')).getByRole('radio')).toBeChecked();
    expect(within(rowOf('alpha')).getByRole('radio')).not.toBeChecked();
    for (const ids of seen) expect(ids.length).toBeLessThanOrEqual(1);
  });

  it('a click on the picked row keeps it picked (a radio does not uncheck)', () => {
    render(<One />);
    fireEvent.click(rowOf('bravo'));
    fireEvent.click(rowOf('bravo'));
    expect(picked()).toBe('b');
  });

  it('Space and Enter pick the focused row; o opens nothing', () => {
    render(<One />);
    fireEvent.keyDown(rowOf('alpha'), { key: ' ' });
    expect(picked()).toBe('a');
    fireEvent.keyDown(rowOf('bravo'), { key: 'Enter' });
    expect(picked()).toBe('b');
    fireEvent.keyDown(rowOf('charlie'), { key: 'o' });
    expect(picked()).toBe('b');
  });

  it('the radio itself picks once, not again through the row', () => {
    const seen: string[][] = [];
    render(<One onSel={(ids) => seen.push([...ids])} />);
    fireEvent.click(within(rowOf('bravo')).getByRole('radio'));
    expect(picked()).toBe('b');
    expect(seen).toHaveLength(1);
  });

  it('shift with an arrow never adds a range', () => {
    render(<One />);
    fireEvent.click(rowOf('alpha'));
    fireEvent.keyDown(rowOf('alpha'), { key: 'ArrowDown', shiftKey: true });
    expect(picked()).toBe('a');
  });

  for (const presentation of ['list', 'cards'] as const)
    it(`${presentation}: the radio leads the row and a row click picks`, () => {
      render(<One presentation={presentation} />);
      const radios = screen.getAllByRole('radio');
      expect(radios.length).toBe(3);
      const row = radios[1]!.closest('tr, [data-row-id], li, [role="row"], [role="option"]') ?? radios[1]!.parentElement!;
      const first = row.querySelector('input, button, [role="checkbox"]');
      expect(first).toBe(radios[1]);
      fireEvent.click(screen.getByText('bravo'));
      expect(picked()).toBe('b');
    });

  it('inside a locked Form the radios are disabled and nothing picks', () => {
    render(
      <Form locked onSubmit={() => undefined}>
        <One />
      </Form>,
    );
    for (const r of screen.getAllByRole('radio')) expect(r).toBeDisabled();
    fireEvent.click(rowOf('alpha'));
    fireEvent.keyDown(rowOf('bravo'), { key: ' ' });
    expect(picked()).toBe('');
  });
});

async function routed(children: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: children }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

describe('useDataView pickOne', () => {
  it('a set of several ids keeps only the last; without pickOne it keeps them all (control)', async () => {
    const out: Record<string, string> = {};
    function Probe({ pickOne, tag }: { pickOne: boolean; tag: string }) {
      const view = useDataView({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, pickOne });
      out[tag] = [...view.selected].join(',');
      return (
        <button type="button" onClick={() => view.setSelected(new Set(['a', 'c']))}>
          {tag}
        </button>
      );
    }
    await routed(() => (
      <>
        <Probe pickOne tag="one" />
        <Probe pickOne={false} tag="many" />
      </>
    ));
    await act(async () => {
      fireEvent.click(screen.getByText('one'));
      fireEvent.click(screen.getByText('many'));
    });
    expect(out.one).toBe('c');
    expect(out.many).toBe('a,c');
  });
});

