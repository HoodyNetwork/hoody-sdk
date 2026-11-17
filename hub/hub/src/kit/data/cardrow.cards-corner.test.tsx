// A card-table row is a card. It carries the corner mark and draws its edge from its one cell,
// also inside a Panel (the Panel holds a table, so it is never a card itself and the row is outermost).
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { Panel } from '../layouts/Layouts';
import { DataTable } from './DataTable';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
}
const ROWS: Row[] = [{ id: 'a', name: 'alpha' }];
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true } })];
const card = (id: string) => screen.getAllByRole('row').find((r) => r.getAttribute('data-row-id') === id)!;

describe('cards: the corner', () => {
  it('a card row is marked and its cell holds the edge, inside a Panel too', () => {
    render(
      <Panel title="Servers" flush>
        <DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="cards" />
      </Panel>,
    );
    expect(card('a').getAttribute('data-card-cut')).toBe('');
    expect(card('a').querySelector(':scope > td > svg[data-card-edge]')).not.toBeNull();
  });
  it('table and list rows are not cards', () => {
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="list" />);
    expect(card('a').hasAttribute('data-card-cut')).toBe(false);
    expect(card('a').querySelector('svg[data-card-edge]')).toBeNull();
  });
});
