// Vitest: railTextWord makes a rail list row's inline word a text action on its line. Cards and tiles in a rail pane keep
// the plated button, so a card's word and its ⋯ menu stay one height.
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from './DataTable';
import { ListPaneContext } from '../layouts/pane';

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
const noop = () => undefined;
const ACTIONS = () => [{ id: 'answer', label: 'Answer', inline: true, onAction: noop }, '-' as const, { id: 'rename', label: 'Rename', onAction: noop }];

const inRail = (presentation: 'list' | 'cards') =>
  render(
    <ListPaneContext.Provider value={{ list: true, rail: true }}>
      <DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation={presentation} actions={ACTIONS} railTextWord />
    </ListPaneContext.Provider>,
  );
const word = (c: HTMLElement) => [...c.querySelectorAll('[data-row-actions] button, [data-row-actions] [data-text-button]')].find((b) => b.textContent?.includes('Answer'));

describe('railTextWord', () => {
  it('draws a rail list row\'s word as a text action', () => {
    const { container } = inRail('list');
    expect(word(container)?.closest('[data-text-button]')).toBeTruthy();
  });

  it('keeps a card\'s word a plated button in a rail pane', () => {
    const { container } = inRail('cards');
    const w = word(container);
    expect(w).toBeTruthy();
    expect(w!.closest('[data-text-button]')).toBeNull();
  });
});
