// Vitest: DataTable cardRender. In cards presentation a page may draw each card itself; the kit keeps the
// row (its role, focus, keys, opening and selection) and hands the card its checkbox and row menu. Without cardRender
// the kit's own card is drawn, and the other presentations ignore it.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from './DataTable';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
}
const ROWS: Row[] = [
  { id: 'a', name: 'alpha' },
  { id: 'b', name: 'bravo' },
];
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true } })];
const rows = () => screen.getAllByRole('row').filter((r) => r.hasAttribute('data-row-id'));
const draw = (r: Row, slots: { check: React.ReactNode; menu: React.ReactNode }) => (
  <section aria-label={`card ${r.name}`}>
    <span>{slots.check}</span>
    <strong>{r.name}</strong>
    <span data-menu-slot="">{slots.menu}</span>
  </section>
);

describe('DataTable cardRender', () => {
  it("draws the page's card inside the kit's row and cell, with the table's custom-card grid", () => {
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="cards" cardRender={draw} />);
    const table = screen.getByRole('table', { name: 'Things' });
    expect(table.className).toMatch(/cardsCustom/);
    const all = rows();
    expect(all.map((r) => r.getAttribute('data-row-id'))).toEqual(['a', 'b']);
    for (const r of all) {
      expect(r.getAttribute('role')).toBe('row');
      expect(within(r).getAllByRole('cell')).toHaveLength(1);
    }
    expect(within(all[0]!).getByRole('region', { name: 'card alpha' })).toBeTruthy();
    expect(all[0]!.querySelector('[class*="cardTop"]')).toBeNull();
  });

  it('hands the card the row menu and the selection checkbox, and keeps Enter and the arrows on the row', async () => {
    const open = vi.fn();
    const onSel = vi.fn();
    render(
      <DataTable
        label="Things"
        data={ROWS}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        presentation="cards"
        cardRender={draw}
        onRowAction={open}
        selectable
        selectedIds={new Set(['b'])}
        onSelectionChange={onSel}
        actions={() => [{ id: 'x', label: 'Do it', onAction: () => undefined }]}
      />,
    );
    const [a, b] = rows();
    expect(within(a!).getByRole('checkbox')).toHaveProperty('checked', false);
    expect(within(b!).getByRole('checkbox')).toHaveProperty('checked', true);
    expect(within(a!.querySelector('[data-menu-slot]') as HTMLElement).getByRole('button')).toBeTruthy();
    // The arrows move focus from card to card, and Enter opens the focused one.
    a!.focus();
    fireEvent.keyDown(a!, { key: 'ArrowRight' });
    // The kit moves focus on the next frame.
    await waitFor(() => expect(document.activeElement).toBe(b));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Enter' });
    expect(open).toHaveBeenCalledWith(ROWS[1]);
    expect(open).toHaveBeenCalledTimes(1);
    // The card's checkbox is the kit's: a press selects the row and never opens it.
    open.mockClear();
    fireEvent.click(within(a!).getByRole('checkbox'));
    expect(onSel).toHaveBeenCalled();
    expect([...(onSel.mock.calls.at(-1)![0] as Set<string>)].sort()).toEqual(['a', 'b']);
    expect(open).not.toHaveBeenCalled();
  });

  it('a row without actions gets no menu slot content', () => {
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="cards" cardRender={draw} actions={() => []} />);
    expect((rows()[0]!.querySelector('[data-menu-slot]') as HTMLElement).childElementCount).toBe(0);
  });

  it('table and list presentations ignore cardRender', () => {
    for (const presentation of ['table', 'list'] as const) {
      const { unmount } = render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation={presentation} cardRender={draw} />);
      expect(screen.queryByRole('region', { name: 'card alpha' })).toBeNull();
      expect(screen.getByRole('table', { name: 'Things' }).className).not.toMatch(/cardsCustom/);
      unmount();
    }
  });
});
