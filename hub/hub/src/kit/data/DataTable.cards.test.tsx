// Vitest: DataTable presentation="cards". Rows become cards (title line, one body line per field,
// a footer for `card: 'foot'` columns, the row menu); keys, selection, opening and groups work as in list rows; table and
// list rendering are unchanged by the new `card` meta.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable, type TableGroup } from './DataTable';
import { planCards } from './DataTableLayout';
import type { FilterChip } from './FilterChips';
import { ListPaneContext } from '../layouts/pane';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
  state: string;
  place: string;
  size: string;
  usage: string;
  secret: string;
  kind: 'free' | 'metal';
}

const ROWS: Row[] = [
  { id: 'a', name: 'alpha', state: 'Running', place: 'Paris', size: '2 CPU', usage: 'Chat 40%', secret: 'tbl-only-a', kind: 'free' },
  { id: 'b', name: 'bravo', state: 'Stopped', place: 'Oslo', size: '4 CPU', usage: 'Chat 10%', secret: 'tbl-only-b', kind: 'metal' },
  { id: 'c', name: 'charlie', state: 'Running', place: 'Lima', size: '8 CPU', usage: '', secret: 'tbl-only-c', kind: 'metal' },
];
const col = createColumnHelper<Row>();
const COLUMNS = [
  col.accessor('name', { header: 'Name', meta: { pinned: true } }),
  col.accessor('state', { header: 'State', meta: { list: 'status' } }),
  col.accessor('place', { header: 'Place' }),
  col.accessor('size', { header: 'Size', meta: { listLabel: true } }),
  col.accessor('usage', { header: 'AI use', meta: { card: 'foot', list: false, table: false } }),
  col.accessor('secret', { header: 'Secret', meta: { card: false } }),
];
const PLAIN = COLUMNS.map((c) => {
  const meta = { ...(c.meta ?? {}) };
  delete meta.card;
  return { ...c, meta };
});

// Generated ids (React useId) differ between two renders; everything else must match byte for byte.
const markup = (el: HTMLElement) => el.innerHTML.replace(/_r_[0-9a-z]+_/g, '_r_');
const cards = () => screen.getAllByRole('row').filter((r) => r.hasAttribute('data-row-id'));

describe('cards presentation', () => {
  it('draws each row as a card: title, status, one line per field, the footer, never a card:false field', () => {
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="cards" />);
    expect(screen.getByRole('table', { name: 'Things' })).toBeTruthy();
    const all = cards();
    expect(all.map((r) => r.getAttribute('data-row-id'))).toEqual(['a', 'b', 'c']);
    const a = within(all[0]!);
    expect(a.getByText('alpha')).toBeTruthy();
    expect(a.getByText('Running')).toBeTruthy();
    expect(a.getByText('Paris')).toBeTruthy();
    expect(a.getByText('Size')).toBeTruthy();
    expect(a.getByText('Chat 40%')).toBeTruthy();
    expect(a.queryByText('tbl-only-a')).toBeNull();
    // The footer field sits in the footer, after the body lines.
    const foot = a.getByText('Chat 40%').closest('[class*="cardFoot"]');
    expect(foot).not.toBeNull();
    expect(a.getByText('Paris').closest('[class*="cardFoot"]')).toBeNull();
  });

  it('keeps the table roles on every element, so a row is still a row and a card a cell', () => {
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="cards" />);
    const table = screen.getByRole('table', { name: 'Things' });
    expect(table.getAttribute('role')).toBe('table');
    for (const r of cards()) {
      expect(r.getAttribute('role')).toBe('row');
      expect(within(r).getAllByRole('cell')).toHaveLength(1);
    }
  });

  it('opens a card with Enter and moves between cards with the left and right arrows', () => {
    const open = vi.fn();
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="cards" onRowAction={open} />);
    const [a, b] = cards();
    a!.focus();
    fireEvent.keyDown(a!, { key: 'ArrowRight' });
    expect(document.activeElement === b || b!.tabIndex === 0).toBe(true);
    fireEvent.keyDown(b!, { key: 'Enter' });
    expect(open).toHaveBeenCalledWith(ROWS[1]);
    fireEvent.keyDown(b!, { key: 'ArrowLeft' });
    expect(cards()[0]!.tabIndex).toBe(0);
  });

  it('shows a checkbox on each card while picks are made', () => {
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="cards" selectable selectedIds={new Set(['b'])} onSelectionChange={() => undefined} />);
    for (const r of cards()) expect(within(r).getByRole('checkbox')).toBeTruthy();
    expect(within(cards()[1]!).getByRole('checkbox')).toHaveProperty('checked', true);
  });

  it('draws every card, never a virtual window, even past 200 rows', () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ ...ROWS[0]!, id: `r${i}`, name: `n${i}` }));
    render(<DataTable label="Things" data={many} columns={COLUMNS} getRowId={(r) => r.id} presentation="cards" />);
    expect(cards()).toHaveLength(250);
  });

  it('puts a heading over each group of cards, and a closed group hides its cards', () => {
    const groups: TableGroup[] = [
      { id: 'free', label: 'Free' },
      { id: 'metal', label: 'Bare metal' },
    ];
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="cards" groupBy={(r) => r.kind} groups={groups} />);
    const free = screen.getByRole('button', { name: /Free/ });
    expect(screen.getByRole('button', { name: /Bare metal/ })).toBeTruthy();
    expect(free.closest('tr')?.getAttribute('role')).toBe('row');
    fireEvent.click(free);
    expect(cards().map((r) => r.getAttribute('data-row-id'))).toEqual(['b', 'c']);
  });
});

describe('cards toolbar', () => {
  const FILTERS: FilterChip[] = [{ id: 'state', label: 'State', options: [{ value: 'run', label: 'Running' }], value: undefined, onChange: () => undefined }];
  it('keeps the filter chips while there is room, as the wide table does (list rows fold them into Filters)', () => {
    const { unmount } = render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="cards" filters={FILTERS} />);
    expect(screen.getByRole('button', { name: /^State/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Filters' })).toBeNull();
    unmount();
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="list" filters={FILTERS} />);
    expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy();
  });

  it('sorts cards from the Sort by menu, through the same asc, desc, off order as a header', async () => {
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="cards" sortParam={false} noViewMenu />);
    const order = () => cards().map((r) => r.getAttribute('data-row-id'));
    const pick = async (name: string) => {
      await userEvent.click(screen.getByRole('button', { name: 'Sort by' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${name}`) }));
    };
    await pick('Place');
    expect(order()).toEqual(['c', 'b', 'a']);
    await userEvent.click(screen.getByRole('button', { name: 'Sort by' }));
    // The current sort is in the item's name for screen readers, not only in its arrow.
    expect(await screen.findByRole('menuitem', { name: /^Place\s*, sorted ascending$/ })).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    });
    await pick('Place');
    expect(order()).toEqual(['a', 'b', 'c']);
  });

  it('never offers a sort the table drops: a table: false column is not in Sort by', async () => {
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="cards" sortParam={false} noViewMenu />);
    await userEvent.click(screen.getByRole('button', { name: 'Sort by' }));
    const items = (await screen.findAllByRole('menuitem')).map((m) => m.textContent?.trim());
    expect(items).toContain('Place');
    expect(items).not.toContain('AI use');
  });

  it('with a view menu, Sort by is a section of it (one toolbar button fewer)', async () => {
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="cards" sortParam={false} />);
    expect(screen.queryByRole('button', { name: 'Sort by' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'View options' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /^Place/ }));
    expect(cards().map((r) => r.getAttribute('data-row-id'))).toEqual(['c', 'b', 'a']);
  });

  it('table and list rows have no Sort by button (the header sorts the table)', () => {
    for (const presentation of ['table', 'list'] as const) {
      const { unmount } = render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation={presentation} />);
      expect(screen.queryByRole('button', { name: 'Sort by' })).toBeNull();
      unmount();
    }
  });
});

describe('cards beside a detail pane', () => {
  it('give way to list rows, never to the wide table', () => {
    const { container } = render(
      <ListPaneContext.Provider value={{ presentation: 'list' }}>
        <DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="cards" />
      </ListPaneContext.Provider>,
    );
    const table = container.querySelector('table')!;
    // List rows: no explicit roles, no card markup, the header kept for screen readers only.
    expect(table.hasAttribute('role')).toBe(false);
    expect(container.querySelector('[class*="cardCell"]')).toBeNull();
    expect(table.className).toMatch(/list/);
    expect(container.querySelector('thead')?.className).toMatch(/srOnlyHead/);
  });
});

describe('table and list are unchanged by the card meta', () => {
  for (const presentation of ['table', 'list'] as const) {
    it(`${presentation}: the same markup with and without card meta`, () => {
      const one = render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation={presentation} />);
      const withMeta = markup(one.container);
      one.unmount();
      const two = render(<DataTable label="Things" data={ROWS} columns={PLAIN} getRowId={(r) => r.id} presentation={presentation} />);
      expect(markup(two.container)).toBe(withMeta);
      expect(two.container.querySelector('table')?.hasAttribute('role')).toBe(false);
    });
  }
});

describe('planCards', () => {
  it('caps the body at four fields', () => {
    const c = (id: string) => ({ id, role: undefined, priority: 2, pinned: false });
    expect(planCards([c('name'), c('a'), c('b'), c('c'), c('d'), c('e')]).meta).toEqual(['a', 'b', 'c', 'd']);
  });

  it('takes the list roles for the title line, the body fields, and the footer columns in order', () => {
    const c = (id: string, extra: Partial<Parameters<typeof planCards>[0][number]> = {}) => ({ id, role: undefined, priority: 2, pinned: false, ...extra });
    const layout = planCards([
      c('name', { pinned: true }),
      c('state', { role: 'status' }),
      c('a'),
      c('b'),
      c('c'),
      c('ai', { card: 'foot', role: false }),
      c('hidden', { card: false }),
      c('ai2', { card: 'foot' }),
    ]);
    expect(layout.primary).toBe('name');
    expect(layout.status).toBe('state');
    // A footer column is never also a body line, even with room left in the body.
    expect(layout.meta).toEqual(['a', 'b', 'c']);
    expect(layout.foot).toEqual(['ai', 'ai2']);
  });
});
