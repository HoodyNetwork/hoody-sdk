// Vitest: a note about one group (a computer's failed read, its paused items) is that
// group's own first row, right under its header, never a strip above the table. It hides with its group, a chip in the
// header's extra stays, its action comes in the tab order between the header and the group's rows, and a group with a
// note is drawn even when it has no rows.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { DataTable } from './DataTable';

interface Thing {
  id: string;
  name: string;
  g: string;
}
const col = createColumnHelper<Thing>();
const columns = [col.accessor('name', { header: 'Name', meta: { pinned: true } })];
const data: Thing[] = [
  { id: 'a1', name: 'alpha one', g: 'a' },
  { id: 'a2', name: 'alpha two', g: 'a' },
  { id: 'b1', name: 'beta one', g: 'b' },
];

// The table reads the location (its view state lives in the URL), so it mounts under a router.
async function table(groups: Parameters<typeof DataTable<Thing>>[0]['groups']) {
  const el = () => <DataTable label="Things" data={data} columns={columns} getRowId={(r) => r.id} groupBy={(r) => r.g} groups={groups} />;
  const router = createRouter({ routeTree: createRootRoute({ component: el }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}
const rowTexts = () => [...document.querySelectorAll('tbody tr')].map((tr) => tr.textContent?.trim() ?? '').filter(Boolean);

afterEach(cleanup);

describe('DataTable: a group\'s own note (TableGroup.note)', () => {
  const note = (
    <span>
      2 paused. <button type="button">Resume</button>
    </span>
  );

  it('draws the note as the group\'s first row, under its header and before its rows, once', async () => {
    await table([{ id: 'a', label: 'atlas', note }, { id: 'b', label: 'boreal' }]);
    const texts = rowTexts();
    const head = texts.findIndex((x) => x.startsWith('atlas'));
    expect(texts[head + 1]).toBe('2 paused. Resume');
    expect(texts[head + 2]).toBe('alpha one');
    expect(texts.filter((x) => x.includes('2 paused'))).toHaveLength(1);
    expect(document.querySelector('[data-group-note]')?.closest('tr')?.getAttribute('data-row-id')).toBeNull();
  });

  it('collapsing the group hides its note and keeps the header\'s chip; opening it brings the note back', async () => {
    await table([{ id: 'a', label: 'atlas', note, extra: <span>2 paused chip</span> }, { id: 'b', label: 'boreal' }]);
    await userEvent.click(screen.getByRole('button', { name: /^atlas/ }));
    expect(screen.queryByText('2 paused.', { exact: false })).toBeNull();
    expect(screen.getByText('2 paused chip')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^atlas/ }));
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('a group with a note and no rows still has its header and note', async () => {
    await table([{ id: 'a', label: 'atlas' }, { id: 'b', label: 'boreal' }, { id: 'c', label: 'cinder', note: <span>Couldn&apos;t read it.</span> }]);
    const texts = rowTexts();
    const head = texts.findIndex((x) => x.startsWith('cinder'));
    expect(head).toBeGreaterThan(-1);
    expect(texts[head + 1]).toBe("Couldn't read it.");
  });

  it('a group with no note and no rows is still left out', async () => {
    await table([{ id: 'a', label: 'atlas' }, { id: 'b', label: 'boreal' }, { id: 'c', label: 'cinder' }]);
    expect(rowTexts().some((x) => x.startsWith('cinder'))).toBe(false);
  });

  it('Tab goes from the group\'s header to the note\'s action, then on to the group\'s rows', async () => {
    await table([{ id: 'a', label: 'atlas', note }, { id: 'b', label: 'boreal' }]);
    const header = screen.getByRole('button', { name: /^atlas/ });
    header.focus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Resume' })).toHaveFocus();
    await userEvent.tab();
    const focused = document.activeElement as HTMLElement;
    expect(focused.getAttribute('data-row-id') ?? within(focused).queryByText('alpha one')?.textContent).toBeTruthy();
  });

  it('the note row is a row of the table\'s own grid: one cell across every column', async () => {
    await table([{ id: 'a', label: 'atlas', note }, { id: 'b', label: 'boreal' }]);
    const tr = document.querySelector('[data-group-note]')?.closest('tr') as HTMLTableRowElement;
    expect(tr.cells).toHaveLength(1);
    expect(tr.cells[0]?.colSpan).toBe(document.querySelector('[data-group-note]')?.closest('table')?.querySelector('colgroup')?.children.length);
  });
});
