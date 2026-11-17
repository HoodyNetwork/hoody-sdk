// Vitest: a card closes with one bottom band holding its foot cells (at the start) and its row
// menu (at the end), so every card of a row has its actions on one line. No band when there is neither.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from './DataTable';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
  act: string;
}
const ROWS: Row[] = [
  { id: 'a', name: 'alpha', act: 'Restart' },
  { id: 'b', name: 'bravo', act: '' },
];
const col = createColumnHelper<Row>();
const COLUMNS = [
  col.accessor('name', { header: 'Name', meta: { pinned: true } }),
  col.accessor('act', { header: 'Action', meta: { card: 'foot', list: false }, cell: (c) => (c.getValue() ? <button type="button">{c.getValue()}</button> : null) }),
];
const actions = (r: Row) => [{ id: 'open', label: `Open ${r.name}`, onAction: () => undefined }];
const card = (id: string) => screen.getAllByRole('row').find((r) => r.getAttribute('data-row-id') === id)!;
const band = (id: string) => card(id).querySelector('[class*="cardBottom"]');

describe('cards: the bottom band', () => {
  it('holds the foot cells first and the row menu last, in one band at the end of the card', () => {
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="cards" actions={actions} />);
    const b = band('a') as HTMLElement;
    expect(b).not.toBeNull();
    const restart = within(card('a')).getByRole('button', { name: 'Restart' });
    const menu = within(card('a')).getByRole('button', { name: /actions/i });
    expect(b.contains(restart)).toBe(true);
    expect(b.contains(menu)).toBe(true);
    expect(restart.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The band closes the card: nothing of the card comes after it.
    expect(b.parentElement?.lastElementChild).toBe(b);
  });

  it('keeps the row menu in the band when the foot has nothing to show', () => {
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="cards" actions={actions} />);
    const b = band('b') as HTMLElement;
    expect(b).not.toBeNull();
    expect(b.contains(within(card('b')).getByRole('button', { name: /actions/i }))).toBe(true);
  });

  it('a table with row actions and no foot column still closes each card with the band holding its menu', () => {
    render(<DataTable label="Things" data={ROWS} columns={[COLUMNS[0]!]} getRowId={(r) => r.id} presentation="cards" actions={actions} />);
    const b = band('a') as HTMLElement;
    expect(b).not.toBeNull();
    expect(b.contains(within(card('a')).getByRole('button', { name: /actions/i }))).toBe(true);
  });

  it('a row the actions callback gives nothing gets no menu slot and so no band; the others keep theirs', () => {
    const some = (r: Row) => (r.id === 'a' ? actions(r) : []);
    render(<DataTable label="Things" data={ROWS} columns={[COLUMNS[0]!]} getRowId={(r) => r.id} presentation="cards" actions={some} />);
    expect(band('a')).not.toBeNull();
    expect(band('b')).toBeNull();
    expect(card('b').querySelector('[class*="cardActions"]')).toBeNull();
  });

  it('with a foot cell that renders nothing and no actions for the row, no menu slot is drawn (the band hides by css)', () => {
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="cards" actions={() => []} />);
    expect(card('b').querySelector('[class*="cardActions"]')).toBeNull();
    expect(within(card('a')).getByRole('button', { name: 'Restart' })).toBeTruthy();
  });

  it('draws no band without foot columns or row actions', () => {
    render(<DataTable label="Things" data={ROWS} columns={[COLUMNS[0]!]} getRowId={(r) => r.id} presentation="cards" />);
    expect(band('a')).toBeNull();
  });
});
