// Vitest: the wide table's Row actions header cell carries its name as text (visually
// hidden), not as an aria-label on an empty cell, so axe's empty-table-header finds nothing and the column header is
// named the same way for every reader.
import { render, screen } from '@testing-library/react';
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
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary' } })];
const DATA: Row[] = [{ id: 'a', name: 'alpha' }];
const actions = () => [{ id: 'start', label: 'Start', onAction: () => undefined }];

describe('DataTable Row actions header', () => {
  it('row_actions_header_has_text_not_only_aria_label', () => {
    render(<DataTable label="Things" presentation="table" data={DATA} columns={COLUMNS} getRowId={(r) => r.id} actions={actions} />);
    const head = screen.getByRole('columnheader', { name: 'Row actions' });
    expect(head.textContent).toBe('Row actions');
    expect(head).not.toHaveAttribute('aria-label');
    // The text is for readers only: it sits in the visually hidden span, never as visible header text.
    const span = head.querySelector('span');
    expect(span?.className).toMatch(/\bhxSrOnly\b/);
  });

  it('a table without actions draws no Row actions header', () => {
    render(<DataTable label="Things" presentation="table" data={DATA} columns={COLUMNS} getRowId={(r) => r.id} />);
    expect(screen.queryByRole('columnheader', { name: 'Row actions' })).toBeNull();
  });
});
