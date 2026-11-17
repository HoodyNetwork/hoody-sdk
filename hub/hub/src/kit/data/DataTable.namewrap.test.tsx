// Vitest: column meta listWraps on the list primary marks the item
// name as wrapping too (the line-2 fields already do), only there and only in list rows; and an
// inline row action that gains or loses its disabledReason stays the same element, so a keyboard user keeps focus on it.
import { render, screen } from '@testing-library/react';
import { createColumnHelper } from '@tanstack/react-table';
import { describe, expect, it, vi } from 'vitest';
import { ListPaneContext } from '../layouts/pane';
import { DataTable, type RowActionEntry } from './DataTable';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
  size: string;
}
const ROWS: Row[] = [{ id: 'a', name: 'https://alpha.example/a-very-long-token-with-no-break-point', size: '2 CPU' }];
const col = createColumnHelper<Row>();
const cols = (wraps: boolean) => [
  col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary', listWraps: wraps } }),
  col.accessor('size', { header: 'Size', meta: { list: 'meta' } }),
];
const primaryOf = (c: HTMLElement) => c.querySelector<HTMLElement>('[class*="listPrimary"]');

describe('listWraps on the list primary', () => {
  it('marks the item name as wrapping in a list row', () => {
    const { container } = render(<DataTable label="People" data={ROWS} columns={cols(true)} getRowId={(r) => r.id} presentation="list" />);
    expect(primaryOf(container)?.hasAttribute('data-meta-wraps')).toBe(true);
  });

  it('marks it in a rail list too', () => {
    const { container } = render(
      <ListPaneContext.Provider value={{ list: true, rail: true }}>
        <DataTable label="People" data={ROWS} columns={cols(true)} getRowId={(r) => r.id} presentation="list" />
      </ListPaneContext.Provider>,
    );
    expect(container.querySelector('[data-rail]')).not.toBeNull();
    expect(primaryOf(container)?.hasAttribute('data-meta-wraps')).toBe(true);
  });

  it('without listWraps the name keeps one line, as before', () => {
    const { container } = render(<DataTable label="People" data={ROWS} columns={cols(false)} getRowId={(r) => r.id} presentation="list" />);
    expect(primaryOf(container)?.hasAttribute('data-meta-wraps')).toBe(false);
  });
});

describe('an inline action that turns soft-disabled keeps its element', () => {
  const COLS = [col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary' } })];
  const DATA: Row[] = [{ id: 'a', name: 'alpha', size: '' }];
  const ui = (reason?: string, short?: string) => {
    const actions: RowActionEntry[] = [{ id: 'stop', label: 'Stop alpha', short, inline: true, onAction: () => undefined, isDisabled: reason !== undefined, disabledReason: reason }];
    return <DataTable label="Ports" presentation="table" data={DATA} columns={COLS} getRowId={(r) => r.id} actions={() => actions} />;
  };
  it.each([
    ['a short word', 'Stop'],
    ['a whole label', undefined],
  ])('%s: the same focused button through off and back on', (_, short) => {
    const { rerender } = render(ui(undefined, short));
    const before = screen.getByRole('button', { name: 'Stop alpha' });
    before.focus();
    expect(before).toHaveFocus();
    rerender(ui('Wait until the change on its way is done', short));
    expect(screen.getByRole('button', { name: 'Stop alpha' })).toBe(before);
    expect(before).toHaveFocus();
    expect(before).toHaveAttribute('aria-disabled', 'true');
    rerender(ui(undefined, short));
    expect(screen.getByRole('button', { name: 'Stop alpha' })).toBe(before);
    expect(before).toHaveFocus();
  });
});
