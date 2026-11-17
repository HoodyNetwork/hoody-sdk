// Vitest: the select-all setter inside a locked Form. The real header checkbox is disabled by the
// lock, so a click on it never reaches the setter and cannot show that the guard holds; here the checkbox is a stand-in
// the lock does not disable, so its onChange reaches DataTable's own setter and only that guard can refuse it.
import { fireEvent, render, screen } from '@testing-library/react';
import { createColumnHelper } from '@tanstack/react-table';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Form } from '../forms/more';
import type { CheckboxProps } from '../forms/fields';
import { DataTable } from './DataTable';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));
vi.mock('../forms/fields', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  Checkbox: (p: CheckboxProps) => (
    <input type="checkbox" data-standin aria-label={p['aria-label'] ?? ''} checked={Boolean(p.isSelected)} onChange={(e) => p.onChange?.(e.target.checked)} />
  ),
}));

interface Row {
  id: string;
  name: string;
}
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary' } })];
const ROWS: Row[] = [
  { id: 'a', name: 'alpha' },
  { id: 'b', name: 'bravo' },
];
const picked = () => screen.getByTestId('sel').textContent;
// The stand-in must be what rendered: a mock that never mounts would leave the real, disabled checkbox to pass these tests.
const selectAll = () => {
  const box = screen.getByRole('checkbox', { name: 'Select all rows' });
  expect(box).toHaveAttribute('data-standin');
  expect(box).toBeEnabled();
  return box;
};

function Plain({ initial = [] }: { initial?: string[] }) {
  const [sel, setSel] = useState<Set<string>>(() => new Set(initial));
  return (
    <>
      <output data-testid="sel">{[...sel].sort().join(',')}</output>
      <DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} selectable="pick" selectedIds={sel} onSelectionChange={setSel} />
    </>
  );
}

describe('DataTable header select-all reaches the central selection guard', () => {
  it('inside a locked Form the header onChange selects nothing', () => {
    render(
      <Form locked onSubmit={() => undefined}>
        <Plain />
      </Form>,
    );
    fireEvent.click(selectAll());
    expect(picked()).toBe('');
  });

  it('inside a locked Form the header onChange clears nothing', () => {
    render(
      <Form locked onSubmit={() => undefined}>
        <Plain initial={['a', 'b']} />
      </Form>,
    );
    fireEvent.click(selectAll());
    expect(picked()).toBe('a,b');
  });

  it('an unlocked Form selects and clears all through the same onChange (the lock is the only difference)', () => {
    render(
      <Form onSubmit={() => undefined}>
        <Plain />
      </Form>,
    );
    fireEvent.click(selectAll());
    expect(picked()).toBe('a,b');
    fireEvent.click(selectAll());
    expect(picked()).toBe('');
  });
});
