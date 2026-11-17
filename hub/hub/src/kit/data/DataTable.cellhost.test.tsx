// Function cells render through one stable host (CellHost): a column set rebuilt with new cell functions (a new row, a
// new handler closed over) keeps every cell mounted, so its state and focus survive a refresh. A cell that really
// becomes another component asks for a fresh mount with meta.cellKey. Anything that is not a plain function (a string,
// an element, a memo component) renders as before.
import { fireEvent, render, screen } from '@testing-library/react';
import { memo, useRef, useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createColumnHelper, type CellContext } from '@tanstack/react-table';
import { DataTable } from './DataTable';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Item {
  id: string;
  name: string;
}
const DATA: Item[] = [
  { id: 'a', name: 'alpha' },
  { id: 'b', name: 'bravo' },
];
const col = createColumnHelper<Item>();

/** A cell function with its own hooks (as flexRender allowed): a press counter. Every call of mk() is a NEW function. */
const mk = (tag: string) =>
  function CounterCell(c: CellContext<Item, unknown>): ReactNode {
    const [n, setN] = useState(0);
    return (
      <button type="button" data-tag={tag} onClick={() => setN(n + 1)}>
        {c.row.original.name}:{n}
      </button>
    );
  };

const table = (cell: (c: CellContext<Item, unknown>) => ReactNode, cellKey?: string | number, data: Item[] = DATA) => (
  <DataTable
    label="Things"
    data={data}
    getRowId={(r) => r.id}
    columns={[
      col.accessor('name', { id: 'name', header: 'Name', meta: { pinned: true } }),
      col.display({ id: 'act', header: 'Act', cell, meta: { priority: 1, ...(cellKey !== undefined ? { cellKey } : {}) } }),
    ]}
  />
);
const press = (name: string) => screen.getByRole('button', { name });

describe('DataTable function cells keep their mount when the cell function changes', () => {
  it('state kept: a hook-using cell keeps its count across a new function with the same hooks', () => {
    const { rerender } = render(table(mk('one')));
    fireEvent.click(press('alpha:0'));
    fireEvent.click(press('alpha:1'));
    const el = press('alpha:2');
    rerender(table(mk('two')));
    expect(press('alpha:2')).toBe(el);
    expect(el.getAttribute('data-tag')).toBe('two');
  });

  it('focus kept: the focused button of a cell is the same element after the columns are rebuilt', () => {
    const { rerender } = render(table(mk('one')));
    const el = press('bravo:0');
    el.focus();
    expect(document.activeElement).toBe(el);
    rerender(table(mk('two')));
    expect(press('bravo:0')).toBe(el);
    expect(document.activeElement).toBe(el);
  });

  it('new data too: the same row keeps its cell when its row object is a new one', () => {
    const { rerender } = render(table(mk('one')));
    fireEvent.click(press('alpha:0'));
    const el = press('alpha:1');
    rerender(table(mk('two'), undefined, [{ id: 'a', name: 'alpha' }, { id: 'b', name: 'bravo' }]));
    expect(press('alpha:1')).toBe(el);
  });

  it('cellKey: a cell that becomes another component asks for a fresh mount and starts at 0', () => {
    const { rerender } = render(table(mk('one'), 'v1'));
    fireEvent.click(press('alpha:0'));
    const el = press('alpha:1');
    rerender(table(mk('two'), 'v2'));
    expect(press('alpha:0')).not.toBe(el);
    expect(el.isConnected).toBe(false);
  });

  it('cellKey: a cell function with other hooks mounts afresh under a new key', () => {
    const noHooks = (c: CellContext<Item, unknown>): ReactNode => <span>{c.row.original.name}!</span>;
    const { rerender } = render(table(mk('one'), 'k1'));
    fireEvent.click(press('alpha:0'));
    rerender(table(noHooks, 'k2'));
    expect(screen.getAllByText('alpha!').length).toBe(1);
    expect(screen.queryByRole('button', { name: /alpha:/ })).toBeNull();
  });
});

describe('DataTable cells that are not plain functions render as before', () => {
  it('a string and an element and a memo component render', () => {
    const Memo = memo(function Memo() {
      return <i>memo-cell</i>;
    });
    const withCells = (cell: unknown) => (
      <DataTable
        label="Things"
        data={DATA.slice(0, 1)}
        getRowId={(r) => r.id}
        columns={[col.accessor('name', { id: 'name', header: 'Name', meta: { pinned: true } }), col.display({ id: 'x', header: 'X', cell: cell as never, meta: { priority: 1 } })]}
      />
    );
    const a = render(withCells('plain-string'));
    expect(screen.getByText('plain-string')).toBeInTheDocument();
    a.unmount();
    const b = render(withCells(<b>element-cell</b>));
    expect(screen.getByText('element-cell')).toBeInTheDocument();
    b.unmount();
    render(withCells(Memo));
    expect(screen.getByText('memo-cell')).toBeInTheDocument();
  });

  it('the default cell (no cell given) shows the accessor value', () => {
    render(
      <DataTable label="Things" data={DATA} getRowId={(r) => r.id} columns={[col.accessor('name', { id: 'name', header: 'Name', meta: { pinned: true } })]} />,
    );
    expect(screen.getByText('bravo')).toBeInTheDocument();
  });
});

// A list, card or tile slot (primary, lead, status) draws whichever column the layout picks. When another column takes the
// slot, its cell must mount afresh: with other hooks it would otherwise run over the first column's hooks.
describe('a different column taking over a layout slot mounts its own cell', () => {
  // Two candidates for the primary slot with different hooks: P1 has a state and a ref, P2 only a state. Named as components: they
  // are called by the table's cell host, which is the pattern under test, and the hook rules want an uppercase name for that.
  const P1 = (c: CellContext<Item, unknown>): ReactNode => {
    const [s, setS] = useState('first');
    const ref = useRef(0);
    return (
      <button type="button" onClick={() => setS(`first-${++ref.current}`)}>
        p1:{c.row.original.name}:{s}
      </button>
    );
  };
  const P2 = (c: CellContext<Item, unknown>): ReactNode => {
    const [s] = useState('second');
    return <span>p2:{c.row.original.name}:{s}</span>;
  };
  const columns = (...ids: Array<'p1' | 'p2'>) => ids.map((id) => col.display({ id, header: id, cell: id === 'p1' ? P1 : P2 }));
  const view = (presentation: 'list' | 'cards' | 'icons', ...ids: Array<'p1' | 'p2'>) => (
    <DataTable label="Things" data={DATA} getRowId={(r) => r.id} presentation={presentation} columns={columns(...ids)} />
  );

  for (const presentation of ['list', 'cards', 'icons'] as const) {
    it(`${presentation}: the first column's cell is replaced by the second column's, with its own state and no hook-order error`, () => {
      const { rerender } = render(view(presentation, 'p1'));
      fireEvent.click(screen.getByRole('button', { name: 'p1:alpha:first' }));
      expect(screen.getByRole('button', { name: 'p1:alpha:first-1' })).toBeInTheDocument();
      rerender(view(presentation, 'p2'));
      expect(screen.getByText('p2:alpha:second')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^p1:/ })).toBeNull();
    });

    it(`${presentation}: the first of two candidates is taken away; the second shows its own state`, () => {
      const { rerender } = render(view(presentation, 'p1', 'p2'));
      expect(screen.getAllByRole('button', { name: /^p1:/ }).length).toBeGreaterThan(0);
      rerender(view(presentation, 'p2'));
      expect(screen.getAllByText('p2:alpha:second').length).toBeGreaterThan(0);
      expect(screen.queryByRole('button', { name: /^p1:/ })).toBeNull();
    });
  }

  it('the same column across a refetch keeps its host, state and focus in a list slot', () => {
    const list = (cell: (c: CellContext<Item, unknown>) => ReactNode) => (
      <DataTable label="Things" data={DATA} getRowId={(r) => r.id} presentation="list" columns={[col.display({ id: 'act', header: 'Act', cell })]} />
    );
    const { rerender } = render(list(mk('three')));
    fireEvent.click(screen.getAllByRole('button', { name: 'alpha:0' })[0]!);
    const kept = screen.getAllByRole('button', { name: 'alpha:1' })[0]!;
    kept.focus();
    rerender(list(mk('four')));
    expect(screen.getAllByRole('button', { name: 'alpha:1' })[0]).toBe(kept);
    expect(document.activeElement).toBe(kept);
  });
});
