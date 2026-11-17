// Vitest: grouped rows in useDataView. The AI pane's chat list sorts and filters like any
// list but draws group headers inside the one sorted view ("Needs you", then Today / Yesterday / Older). The view
// orders rows by group before paging (so a page or "Show more" never skips a group's first rows) and keeps the sort
// inside each group; each header counts the group's whole match. In the 288 px pane the table draws list rows: the
// headers are not data rows (the keys skip them, aria-rowcount leaves them out). Pages with their own groupBy keep
// their behaviour.
import { createColumnHelper } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { type ReactElement, useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable';
import { type DataView, type DataViewGroup, useDataView } from './DataTableView';

interface Chat {
  id: string;
  title: string;
  /** 'needs' | 'today' | 'yesterday' | 'older' | anything else (a key the page does not list). */
  when: string;
  at: number;
}

const ROWS: Chat[] = [
  { id: 'o1', title: 'old plan', when: 'older', at: 1 },
  { id: 't1', title: 'deploy notes', when: 'today', at: 90 },
  { id: 'n1', title: 'approve rm', when: 'needs', at: 50 },
  { id: 'y1', title: 'yesterday chat', when: 'yesterday', at: 40 },
  { id: 't2', title: 'build fix', when: 'today', at: 95 },
  { id: 'n2', title: 'answer question', when: 'needs', at: 10 },
  { id: 'o2', title: 'older note', when: 'older', at: 2 },
  { id: 'x1', title: 'archived', when: 'zzz', at: 3 },
];
const LABELS: Record<string, string> = { needs: 'Needs you', today: 'Today', yesterday: 'Yesterday', older: 'Older' };
const col = createColumnHelper<Chat>();
const COLUMNS = [col.accessor('title', { header: 'Title', meta: { pinned: true, list: 'primary' } }), col.accessor('at', { header: 'Last' })];

let view: DataView<Chat>;

function Page({ pageSize, more, group = true, presentation = 'auto' }: { pageSize?: number; more?: boolean; group?: boolean; presentation?: 'auto' | 'table' }) {
  const g = useMemo<DataViewGroup<Chat> | undefined>(
    () => (group ? { key: (r) => r.when, order: ['needs', 'today', 'yesterday', 'older'], label: (k) => LABELS[k] ?? k } : undefined),
    [group],
  );
  view = useDataView<Chat>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, search: ['title'], sort: '-at', pageSize, more, group: g });
  return <DataTable label="Chats" columns={COLUMNS} view={view} presentation={presentation} />;
}

/** The pane's own width: every observed box (the table's scroll box, its toolbar) reads `room`. */
let room = 288;
type Cb = (entries: Array<{ target: Element; contentRect: { width: number } }>) => void;
const observers: Array<{ cb: Cb; el?: Element }> = [];

beforeEach(() => {
  observers.length = 0;
  room = 288;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    private o: { cb: Cb; el?: Element };
    constructor(cb: Cb) {
      this.o = { cb };
      observers.push(this.o);
    }
    observe(el: Element) {
      this.o.el = el;
    }
    unobserve() {}
    disconnect() {
      this.o.el = undefined;
    }
  };
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.isConnected ? room : 0;
    },
  });
});

afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

function width(w: number) {
  room = w;
  act(() => {
    for (const o of observers) if (o.el) o.cb([{ target: o.el, contentRect: { width: w } }]);
  });
}

async function mount(path: string, el: () => ReactElement = () => <Page />) {
  const router = createRouter({ routeTree: createRootRoute({ component: el }), history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  width(room);
  return router;
}

const ids = () => view.rows.map((r) => r.id);
/** What the body draws, top to bottom: '# Label n' for a header, the row id for a data row. */
function drawn(): string[] {
  const body = document.querySelector('tbody')!;
  return [...body.querySelectorAll('tr')].flatMap((tr) => {
    const btn = tr.querySelector('button[aria-expanded]');
    if (btn && !tr.hasAttribute('data-row-id')) return [`# ${btn.textContent}`];
    const id = tr.getAttribute('data-row-id');
    return id ? [id] : [];
  });
}

describe('useDataView group', () => {
  it('orders the rows by group, listed groups first, then any other key; the sort holds inside each group', async () => {
    await mount('/');
    expect(ids()).toEqual(['n1', 'n2', 't2', 't1', 'y1', 'o2', 'o1', 'x1']);
    expect(view.groups).toEqual([
      { id: 'needs', label: 'Needs you', count: 2 },
      { id: 'today', label: 'Today', count: 2 },
      { id: 'yesterday', label: 'Yesterday', count: 1 },
      { id: 'older', label: 'Older', count: 2 },
      { id: 'zzz', label: 'zzz', count: 1 },
    ]);
  });

  it('@sort sorts within groups: a new sort reorders each group, never the groups', async () => {
    await mount('/?sort=at');
    expect(ids()).toEqual(['n2', 'n1', 't1', 't2', 'y1', 'o1', 'o2', 'x1']);
    await act(async () => view.setSort({ id: 'title', desc: false }));
    expect(ids()).toEqual(['n2', 'n1', 't2', 't1', 'y1', 'o1', 'o2', 'x1']);
  });

  it('a new sort never moves an unlisted group: they keep the order of the rows as given', async () => {
    const rows: Chat[] = [
      { id: 'x1', title: 'a', when: 'x', at: 1 },
      { id: 'y1', title: 'b', when: 'y', at: 2 },
      { id: 'x2', title: 'c', when: 'x', at: 3 },
      { id: 'y2', title: 'd', when: 'y', at: 4 },
    ];
    function Two() {
      const g = useMemo<DataViewGroup<Chat>>(() => ({ key: (r) => r.when, order: ['needs'], label: (k) => k }), []);
      view = useDataView<Chat>({ rows, columns: COLUMNS, getRowId: (r) => r.id, sort: 'at', pageSize: 2, group: g });
      return null;
    }
    await mount('/', () => <Two />);
    expect(ids()).toEqual(['x1', 'x2']);
    expect(view.groups?.map((g) => g.id)).toEqual(['x', 'y']);
    await act(async () => view.setSort({ id: 'at', desc: true }));
    expect(ids()).toEqual(['x2', 'x1']);
    expect(view.groups?.map((g) => g.id)).toEqual(['x', 'y']);
  });

  it('pages after grouping: page 1 holds the first group whole, and counts are whole-match counts', async () => {
    await mount('/', () => <Page pageSize={3} />);
    expect(ids()).toEqual(['n1', 'n2', 't2']);
    expect(drawn()).toEqual(['# Needs you2', 'n1', 'n2', '# Today2', 't2']);
    await act(async () => view.setPage(2));
    expect(drawn()).toEqual(['# Today2', 't1', '# Yesterday1', 'y1', '# Older2', 'o2']);
  });

  it('"Show more" grows the grouped list in group order', async () => {
    await mount('/', () => <Page pageSize={3} more />);
    expect(ids()).toEqual(['n1', 'n2', 't2']);
    await act(async () => view.showMore());
    expect(ids()).toEqual(['n1', 'n2', 't2', 't1', 'y1', 'o2']);
  });

  it('a search counts only what matches, and a group with no match draws no header', async () => {
    await mount('/?q=o');
    const shown = view.rows.map((r) => r.title);
    expect(shown.every((t) => t.includes('o'))).toBe(true);
    for (const g of view.groups ?? []) expect(g.count).toBe(view.rows.filter((r) => r.when === g.id).length);
    expect(drawn().filter((x) => x.startsWith('#')).length).toBe(view.groups?.length);
  });

  it('without group the view is as before: plain sort, no groups', async () => {
    await mount('/', () => <Page group={false} />);
    expect(ids()).toEqual(['t2', 't1', 'n1', 'y1', 'n2', 'x1', 'o2', 'o1']);
    expect(view.groups).toBeUndefined();
    expect(view.groupOf).toBeUndefined();
    expect(drawn().some((x) => x.startsWith('#'))).toBe(false);
  });
});

for (const [where, px, pres] of [
  ['in a 288 px pane (list rows)', 288, 'auto'],
  ['in a wide table', 1600, 'table'],
] as const) describe(`DataTable with a grouped view, ${where}`, () => {
  const page = () => <Page presentation={pres} />;
  beforeEach(() => {
    room = px;
  });
  it('draws the group headers, and aria-rowcount counts data rows only', async () => {
    await mount('/', page);
    const table = screen.getByRole('table', { name: 'Chats' });
    if (pres === 'auto') expect(table.className).toMatch(/list/);
    else expect(table.className).not.toMatch(/list/);
    expect(table.getAttribute('aria-rowcount')).toBe(String(ROWS.length + 1));
    expect(drawn()).toEqual(['# Needs you2', 'n1', 'n2', '# Today2', 't2', 't1', '# Yesterday1', 'y1', '# Older2', 'o2', 'o1', '# zzz1', 'x1']);
    // Headers carry no row index or row id; data rows are numbered 2.. in order, headers skipped.
    const dataRows = [...document.querySelectorAll('tbody tr[data-row-id]')];
    expect(dataRows.map((r) => r.getAttribute('aria-rowindex'))).toEqual(['2', '3', '4', '5', '6', '7', '8', '9']);
    for (const h of [...document.querySelectorAll('tbody tr')].filter((r) => !r.hasAttribute('data-row-id'))) {
      expect(h.getAttribute('aria-rowindex')).toBeNull();
      expect(h.getAttribute('tabindex')).toBeNull();
    }
  });

  it('the keys skip the headers: Down from the last row of a group lands on the next group\'s first row', async () => {
    await mount('/', page);
    const row = (id: string) => document.querySelector<HTMLElement>(`tbody tr[data-row-id="${id}"]`)!;
    act(() => row('n2').focus());
    await act(async () => {
      fireEvent.keyDown(row('n2'), { key: 'ArrowDown' });
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    });
    expect(document.activeElement).toBe(row('t2'));
    await act(async () => {
      fireEvent.keyDown(row('t2'), { key: 'ArrowUp' });
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    });
    expect(document.activeElement).toBe(row('n2'));
    // Exactly one roving tab stop, and it is the focused data row (header buttons are their own controls).
    const stops = [...document.querySelectorAll('tbody tr[tabindex="0"]')];
    expect(stops).toEqual([row('n2')]);
  });

  it('a header press collapses its group; the count stays the whole match', async () => {
    await mount('/', page);
    const head = within(document.querySelector('tbody')!).getByRole('button', { name: /Today/ });
    await act(async () => fireEvent.click(head));
    expect(drawn()).toEqual(['# Needs you2', 'n1', 'n2', '# Today2', '# Yesterday1', 'y1', '# Older2', 'o2', 'o1', '# zzz1', 'x1']);
  });
});

describe('server mode with a group', () => {
  it("keeps the answer's order: the hook reorders nothing and the table draws the groups as they come", async () => {
    room = 1600;
    const answer: Chat[] = [
      { id: 't1', title: 'one', when: 'today', at: 3 },
      { id: 't2', title: 'two', when: 'today', at: 2 },
      { id: 'n1', title: 'three', when: 'needs', at: 1 },
    ];
    function Server() {
      const g = useMemo<DataViewGroup<Chat>>(() => ({ key: (r) => r.when, order: ['needs', 'today'], label: (k) => LABELS[k] ?? k }), []);
      view = useDataView<Chat>({ rows: answer, columns: COLUMNS, getRowId: (r) => r.id, server: { total: 9 }, group: g });
      return <DataTable label="Chats" columns={COLUMNS} view={view} presentation="table" />;
    }
    await mount('/', () => <Server />);
    expect(ids()).toEqual(['t1', 't2', 'n1']);
    expect(view.groups).toEqual([
      { id: 'today', label: 'Today', count: 2 },
      { id: 'needs', label: 'Needs you', count: 1 },
    ]);
    expect(drawn()).toEqual(['# Today2', 't1', 't2', '# Needs you1', 'n1']);
  });
});

for (const [where, px, pres] of [
  ['288 px list rows', 288, 'auto'],
  ['a wide table', 1600, 'table'],
] as const)
  describe(`server mode, an answer that comes back to a group, in ${where}`, () => {
    it('keeps every row where the server put it and draws a header at each run', async () => {
      room = px;
      const answer: Chat[] = [
        { id: 't1', title: 'one', when: 'today', at: 3 },
        { id: 'n1', title: 'two', when: 'needs', at: 2 },
        { id: 't2', title: 'three', when: 'today', at: 1 },
      ];
      function Server() {
        const g = useMemo<DataViewGroup<Chat>>(() => ({ key: (r) => r.when, order: ['needs', 'today'], label: (k) => LABELS[k] ?? k }), []);
        view = useDataView<Chat>({ rows: answer, columns: COLUMNS, getRowId: (r) => r.id, server: { total: 3 }, group: g });
        return <DataTable label="Chats" columns={COLUMNS} view={view} presentation={pres} />;
      }
      await mount('/', () => <Server />);
      expect(ids()).toEqual(['t1', 'n1', 't2']);
      expect(drawn()).toEqual(['# Today2', 't1', '# Needs you1', 'n1', '# Today2', 't2']);
      expect([...document.querySelectorAll('tbody tr[data-row-id]')].map((r) => r.getAttribute('aria-rowindex'))).toEqual(['2', '3', '4']);
      // Collapsing Today closes both of its runs.
      await act(async () => fireEvent.click(within(document.querySelector('tbody')!).getAllByRole('button', { name: /Today/ })[0]!));
      expect(drawn()).toEqual(['# Today2', '# Needs you1', 'n1', '# Today2']);
    });

    it('a run key is never another group\'s: ids "a" and "a:1" survive a new answer with no stale or doubled header', async () => {
      room = px;
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      let setRows: (r: Chat[]) => void = () => undefined;
      const row = (id: string, when: string): Chat => ({ id, title: id, when, at: 0 });
      function Server() {
        const [answer, set] = useState<Chat[]>([row('r1', 'a'), row('r2', 'b'), row('r3', 'a'), row('r4', 'a:1')]);
        setRows = set;
        const g = useMemo<DataViewGroup<Chat>>(() => ({ key: (r) => r.when, order: [], label: (k) => k }), []);
        view = useDataView<Chat>({ rows: answer, columns: COLUMNS, getRowId: (r) => r.id, server: {}, group: g });
        return <DataTable label="Chats" columns={COLUMNS} view={view} presentation={pres} />;
      }
      await mount('/', () => <Server />);
      expect(drawn()).toEqual(['# a2', 'r1', '# b1', 'r2', '# a2', 'r3', '# a:11', 'r4']);
      await act(async () => setRows([row('r4', 'a:1')]));
      expect(drawn()).toEqual(['# a:11', 'r4']);
      await act(async () => setRows([row('r2', 'a:1'), row('r3', 'a')]));
      expect(drawn()).toEqual(['# a:11', 'r2', '# a1', 'r3']);
      expect(errors.mock.calls.some((c) => c.map(String).join(' ').includes('same key'))).toBe(false);
      errors.mockRestore();
    });
  });

describe('pages with their own groupBy are unchanged', () => {
  function Own({ pageSize }: { pageSize?: number }) {
    view = useDataView<Chat>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, search: ['title'], sort: '-at', pageSize });
    return (
      <DataTable
        label="Chats"
        columns={COLUMNS}
        view={view}
        presentation="table"
        groupBy={(r) => (r.when === 'needs' ? 'needs' : undefined)}
        groups={[{ id: 'needs', label: 'Needs you' }]}
      />
    );
  }

  it('their rows stay in plain sort order and a header counts the rows on screen', async () => {
    room = 1600;
    await mount('/', () => <Own pageSize={4} />);
    expect(ids()).toEqual(['t2', 't1', 'n1', 'y1']);
    expect(drawn()).toEqual(['t2', 't1', 'y1', '# Needs you1', 'n1']);
  });

  it("a page's own groupBy wins over a grouped view's groups", async () => {
    room = 1600;
    function Both() {
      const g = useMemo<DataViewGroup<Chat>>(() => ({ key: (r) => r.when, order: ['needs', 'today'], label: (k) => LABELS[k] ?? k }), []);
      view = useDataView<Chat>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, sort: '-at', group: g });
      return <DataTable label="Chats" columns={COLUMNS} view={view} presentation="table" groupBy={(r) => (r.when === 'older' ? 'old' : undefined)} groups={[{ id: 'old', label: 'Old' }]} />;
    }
    await mount('/', () => <Both />);
    expect(drawn()).toEqual(['n1', 'n2', 't2', 't1', 'y1', 'x1', '# Old2', 'o2', 'o1']);
  });

  it('a page that passes groups without groupBy turns the view\'s groups off: no row is hidden', async () => {
    room = 1600;
    function GroupsOnly() {
      const g = useMemo<DataViewGroup<Chat>>(() => ({ key: (r) => r.when, order: ['needs', 'today'], label: (k) => LABELS[k] ?? k }), []);
      view = useDataView<Chat>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, sort: '-at', group: g });
      return <DataTable label="Chats" columns={COLUMNS} view={view} presentation="table" groups={[{ id: 'needs', label: 'Custom' }]} />;
    }
    await mount('/', () => <GroupsOnly />);
    expect(drawn()).toEqual(view.rows.map((r) => r.id));
    expect(drawn()).toHaveLength(ROWS.length);
  });
});
