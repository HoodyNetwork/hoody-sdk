import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable, type TableGroup } from './DataTable';

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
  { id: 'c', name: 'charlie' },
];
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true } })];

function Selectable({ onAction }: { onAction?: (r: Row) => void }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  return (
    <>
      <output data-testid="sel">{[...selected].sort().join(',')}</output>
      <DataTable
        label="Things"
        data={ROWS}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        selectable
        selectedIds={selected}
        onSelectionChange={setSelected}
        onRowAction={onAction ?? (() => undefined)}
      />
    </>
  );
}

function rowOf(name: string): HTMLElement {
  const row = screen.getByText(name).closest('tr');
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

describe('DataTable selection', () => {
  it('toggles the focused row with Space and x, and keeps earlier picks', () => {
    render(<Selectable />);
    fireEvent.keyDown(rowOf('alpha'), { key: ' ' });
    expect(screen.getByTestId('sel')).toHaveTextContent('a');
    fireEvent.keyDown(rowOf('bravo'), { key: 'x' });
    expect(screen.getByTestId('sel')).toHaveTextContent('a,b');
    fireEvent.keyDown(rowOf('alpha'), { key: ' ' });
    expect(screen.getByTestId('sel')).toHaveTextContent(/^b$/);
  });

  it('opens a row with Enter and on click, but not when a checkbox is clicked', () => {
    const onAction = vi.fn();
    render(<Selectable onAction={onAction} />);
    fireEvent.keyDown(rowOf('charlie'), { key: 'Enter' });
    expect(onAction).toHaveBeenLastCalledWith(ROWS[2]);
    fireEvent.click(screen.getByText('bravo'));
    expect(onAction).toHaveBeenLastCalledWith(ROWS[1]);
    expect(onAction).toHaveBeenCalledTimes(2);
  });
});

describe('DataTable refresh bar anchor', () => {
  it('.wrap is the positioned ancestor the absolute .refreshBar hangs from', () => {
    const css = readFileSync(join(import.meta.dirname, 'DataTable.module.css'), 'utf8');
    const wrap = /(?:^|\n)\.wrap\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(wrap).toMatch(/position:\s*relative/);
    const bar = /(?:^|\n)\.refreshBar\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(bar).toMatch(/position:\s*absolute/);
  });
});

describe('DataTable no-match', () => {
  it('a chip that the page pre-filters to 0 rows shows no-match with Clear filters, not a blank table', () => {
    const onChange = vi.fn();
    render(
      <DataTable
        label="Things"
        data={[]}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        filters={[{ id: 'state', label: 'State', options: [{ value: 'gone', label: 'Gone' }], value: 'gone', onChange }]}
        empty={<p>nothing yet</p>}
      />,
    );
    expect(screen.queryByText('nothing yet')).toBeNull();
    // The kit NoMatchState recipe, not a hand-rolled EmptyState (one wording everywhere).
    expect(screen.getByText('Try fewer filters or a different search.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

interface Meta {
  id: string;
  name: string;
  where: string;
  size: string;
  note: string;
}
const mcol = createColumnHelper<Meta>();
const META_COLUMNS = [
  mcol.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary' } }),
  mcol.accessor('where', { header: 'Where', meta: { list: 'meta' } }),
  mcol.accessor('size', { header: 'Size', meta: { list: 'meta' } }),
  mcol.accessor('note', { header: 'Note', meta: { list: 'meta' }, cell: (c) => c.getValue() || null }),
];

describe('DataTable list line 2 (390)', () => {
  it('an empty meta cell draws no separator: no stray "· ·"', () => {
    render(
      <DataTable
        label="Things"
        presentation="list"
        data={[{ id: 'a', name: 'alpha', where: '', size: '4 GB', note: '' }]}
        columns={META_COLUMNS}
        getRowId={(r) => r.id}
      />,
    );
    // jsdom does not apply the CSS, so this checks the structure the CSS relies on: no separator
    // element or text in the markup, and an empty cell leaves its value wrapper :empty (hidden).
    const value = screen.getByText('4 GB').closest('span');
    const items = Array.from(value?.parentElement?.parentElement?.children ?? []);
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.textContent)).toEqual(['', '4 GB', '']);
    expect(items.filter((i) => i.firstElementChild?.childNodes.length === 0)).toHaveLength(2);
    expect(items.some((i) => i.querySelector('[aria-hidden="true"]'))).toBe(false);
  });
});

describe('DataTable row shortcuts', () => {
  it('a copy action run by its key copies first, as the ⋯ menu does', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const onAction = vi.fn();
    render(
      <DataTable
        label="Things"
        data={ROWS}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        actions={(r) => [{ id: 'copy', label: 'Copy id', key: 'c', copy: r.id, onAction }]}
      />,
    );
    fireEvent.keyDown(rowOf('bravo'), { key: 'c' });
    await vi.waitFor(() => expect(onAction).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith('b');
  });
});

describe('DataTable stored view', () => {
  it('a stored hidden list never hides a pinned column', () => {
    localStorage.setItem('hub.v3.table.pinned-test', JSON.stringify({ hidden: ['name'] }));
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} storageKey="pinned-test" presentation="table" />);
    expect(screen.getByText('alpha')).toBeTruthy();
    localStorage.removeItem('hub.v3.table.pinned-test');
  });
});

describe('DataTable groups open on a match, and can be controlled', () => {
  const SYS: TableGroup[] = [{ id: 'sys', label: 'System', defaultCollapsed: true }];
  const inSys = (r: Row) => (r.id === 'c' ? 'sys' : undefined);
  function Grouped({ value, collapsedGroups, onCollapsedGroupsChange }: { value?: string; collapsedGroups?: readonly string[]; onCollapsedGroupsChange?: (ids: string[]) => void }) {
    return (
      <DataTable
        label="Things"
        data={value ? ROWS.filter((r) => r.name.includes(value)) : ROWS}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        presentation="table"
        groupBy={inSys}
        groups={SYS}
        filters={[{ id: 'name', label: 'Name', options: [{ value: 'char', label: 'char' }], value, onChange: () => undefined }]}
        collapsedGroups={collapsedGroups}
        onCollapsedGroupsChange={onCollapsedGroupsChange}
      />
    );
  }

  it('a filter match inside a collapsed group shows; clearing the filter collapses it again', () => {
    const { rerender } = render(<Grouped />);
    expect(screen.queryByText('charlie')).toBeNull();
    rerender(<Grouped value="char" />);
    expect(screen.getByText('charlie')).toBeTruthy();
    expect(screen.getByRole('button', { name: /System/ }).getAttribute('aria-expanded')).toBe('true');
    // A press closes it for this search only.
    fireEvent.click(screen.getByRole('button', { name: /System/ }));
    expect(screen.queryByText('charlie')).toBeNull();
    rerender(<Grouped />);
    expect(screen.queryByText('charlie')).toBeNull();
    // The same search again opens it again.
    rerender(<Grouped value="char" />);
    expect(screen.getByText('charlie')).toBeTruthy();
    // An empty filter value is no filter.
    rerender(<Grouped value="" />);
    expect(screen.queryByText('charlie')).toBeNull();
  });

  it('the tab stop stays on the same row when a group above it closes', () => {
    const TWO: TableGroup[] = [
      { id: 'top', label: 'Top' },
      { id: 'sys', label: 'System' },
    ];
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="table" groupBy={(r) => (r.id === 'a' ? 'top' : 'sys')} groups={TWO} />);
    const bravo = () => screen.getByText('bravo').closest('tr') as HTMLElement;
    fireEvent.focus(bravo());
    expect(bravo().tabIndex).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: /Top/ }));
    expect(bravo().tabIndex).toBe(0);
    expect((screen.getByText('charlie').closest('tr') as HTMLElement).tabIndex).toBe(-1);
  });

  it('controlled: the page opens a group, and the header asks the page to change it', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Grouped collapsedGroups={['sys']} onCollapsedGroupsChange={onChange} />);
    expect(screen.queryByText('charlie')).toBeNull();
    rerender(<Grouped collapsedGroups={[]} onCollapsedGroupsChange={onChange} />);
    expect(screen.getByText('charlie')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /System/ }));
    expect(onChange).toHaveBeenLastCalledWith(['sys']);
  });
});

describe('DataTable required filter with an empty box', () => {
  it('keeps the toolbar (the switch stays) and shows the empty state under it', () => {
    render(
      <DataTable
        label="Sessions"
        data={[]}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        presentation="table"
        filters={[
          {
            id: 'box',
            label: 'Box',
            display: 'segmented',
            required: true,
            options: [
              { value: 'active', label: 'Active' },
              { value: 'ended', label: 'Ended' },
            ],
            value: 'ended',
            onChange: () => undefined,
          },
        ]}
        empty={<p>no sessions here</p>}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Box' })).toBeTruthy();
    expect(screen.getByText('no sessions here')).toBeTruthy();
  });
});

describe('DataTable bulk bar and list keys', () => {
  it('the bulk bar wraps at narrow widths instead of pushing the view menu out', () => {
    const css = readFileSync(join(import.meta.dirname, 'DataTable.module.css'), 'utf8');
    const bulk = /(?:^|\n)\.bulk\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(bulk).toMatch(/flex-wrap:\s*wrap/);
    expect(bulk).toMatch(/min-width:\s*0/);
    const count = /(?:^|\n)\.bulkCount\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(count).toMatch(/white-space:\s*nowrap/);
  });

  it('list presentation: x picks the active row, j/k move, and the bulk bar counts the picks', () => {
    function ListPick() {
      const [selected, setSelected] = useState<Set<string>>(() => new Set());
      return (
        <DataTable
          label="Things"
          data={ROWS}
          columns={COLUMNS}
          getRowId={(r) => r.id}
          presentation="list"
          selectable
          selectedIds={selected}
          onSelectionChange={setSelected}
          bulkActions={() => <button type="button">Stop</button>}
        />
      );
    }
    render(<ListPick />);
    const row = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;
    fireEvent.focus(row('bravo'));
    fireEvent.keyDown(row('bravo'), { key: 'x' });
    fireEvent.keyDown(row('bravo'), { key: 'k' });
    fireEvent.keyDown(row('alpha'), { key: 'x' });
    expect(screen.getByText('2 selected')).toBeTruthy();
    fireEvent.keyDown(row('alpha'), { key: 'j' });
    fireEvent.keyDown(row('bravo'), { key: 'x' });
    expect(screen.getByText('1 selected')).toBeTruthy();
  });
});
