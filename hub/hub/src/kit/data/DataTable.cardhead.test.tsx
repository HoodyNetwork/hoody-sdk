// Vitest ("Header band", the Projects cards): cardShape 'band' puts a card's title and its row
// menu in one band at the card's top, with the fields under it; foot cells keep the bottom band, which then has no menu.
// The default shape keeps the menu in the bottom band (DataTable.cardband.test.tsx).
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
  note: string;
  act: string;
}
const ROWS: Row[] = [
  { id: 'a', name: 'alpha', note: '2 computers', act: 'Restart' },
  { id: 'b', name: 'bravo', note: 'No computers', act: '' },
];
const col = createColumnHelper<Row>();
const NAME = col.accessor('name', { header: 'Name', meta: { pinned: true } });
const NOTE = col.accessor('note', { header: 'Computers' });
const FOOT = col.accessor('act', { header: 'Action', meta: { card: 'foot', list: false }, cell: (c) => (c.getValue() ? <button type="button">{c.getValue()}</button> : null) });
const actions = (r: Row) => [{ id: 'open', label: `Open ${r.name}`, onAction: () => undefined }];
const card = (id: string) => screen.getAllByRole('row').find((r) => r.getAttribute('data-row-id') === id)!;
const part = (id: string, name: string) => card(id).querySelector(`[class*="${name}"]`) as HTMLElement | null;
const menuOf = (id: string) => within(card(id)).getByRole('button', { name: /actions/i });

describe("cards: cardShape 'band'", () => {
  it('puts the title and the row menu in one band at the top of the card, the fields under it, and no bottom band', () => {
    render(<DataTable label="Projects" data={ROWS} columns={[NAME, NOTE]} getRowId={(r) => r.id} presentation="cards" cardShape="band" actions={actions} />);
    const head = part('a', 'cardHeadBand');
    expect(head).not.toBeNull();
    expect(head!.contains(within(card('a')).getByText('alpha'))).toBe(true);
    expect(head!.contains(menuOf('a'))).toBe(true);
    // The band opens the card (after the drawn edge), and the fields come after it.
    const body = part('a', 'cardBody')!;
    expect(head!.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(body.textContent).toContain('2 computers');
    expect(part('a', 'cardBottom')).toBeNull();
  });

  it('keeps foot cells in a bottom band of their own, with the menu staying up in the head band', () => {
    render(<DataTable label="Projects" data={ROWS} columns={[NAME, NOTE, FOOT]} getRowId={(r) => r.id} presentation="cards" cardShape="band" actions={actions} />);
    const bottom = part('a', 'cardBottom')!;
    expect(bottom.contains(within(card('a')).getByRole('button', { name: 'Restart' }))).toBe(true);
    expect(bottom.contains(menuOf('a'))).toBe(false);
    expect(part('a', 'cardHeadBand')!.contains(menuOf('a'))).toBe(true);
  });

  it('a row the actions callback gives nothing has a head band with no menu slot', () => {
    const some = (r: Row) => (r.id === 'a' ? actions(r) : []);
    render(<DataTable label="Projects" data={ROWS} columns={[NAME, NOTE]} getRowId={(r) => r.id} presentation="cards" cardShape="band" actions={some} />);
    expect(part('b', 'cardHeadBand')).not.toBeNull();
    expect(within(card('b')).queryByRole('button', { name: /actions/i })).toBeNull();
    expect(part('b', 'cardActions')).toBeNull();
    expect(part('b', 'cardBottom')).toBeNull();
  });

  it('the default shape is unchanged: no head band, the menu in the bottom band', () => {
    render(<DataTable label="Projects" data={ROWS} columns={[NAME, NOTE]} getRowId={(r) => r.id} presentation="cards" actions={actions} />);
    expect(part('a', 'cardHeadBand')).toBeNull();
    expect(part('a', 'cardBottom')!.contains(menuOf('a'))).toBe(true);
  });
});
