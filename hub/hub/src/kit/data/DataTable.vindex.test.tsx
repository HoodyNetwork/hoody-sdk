// A virtual table registers each drawn row with the virtualizer by its own index
// attribute, data-vindex (its index among all items: group and expanded rows count), while data-index stays the row's
// index among rows, the one focus moves by. With group rows the two differ; keys move focus by data-index.
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable, type TableGroup } from './DataTable';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
  group: string;
}
const MANY: Row[] = Array.from({ length: 250 }, (_, i) => ({ id: `r${i}`, name: `row ${i}`, group: i < 125 ? 'one' : 'two' }));
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true } })];
const GROUPS: TableGroup[] = [
  { id: 'one', label: 'One' },
  { id: 'two', label: 'Two' },
];
const big = (extra: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) =>
  render(<DataTable label="Many" data={MANY} columns={COLUMNS} getRowId={(r) => r.id} groupBy={(r) => r.group} groups={GROUPS} presentation="table" pageSize={500} {...extra} />);

const rowEls = () => [...document.querySelectorAll<HTMLElement>('tr[data-row-id]')];
const flush = async () => {
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  });
};

describe('DataTable virtual rows: data-vindex for the virtualizer, data-index for focus', () => {
  // jsdom lays nothing out: give every box a 800 x 600 client size so the virtualizer has a viewport and draws a
  // window of rows (each measured row is 0 tall, so it keeps its estimate).
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  });
  afterEach(() => vi.restoreAllMocks());

  it('a virtual table draws fewer rows than it has, and each drawn row and group row carries its item index', () => {
    big();
    const rows = rowEls();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(250);
    // The first group's header is item 0, its first row item 1 (row 0).
    const first = rows.find((r) => r.dataset.rowId === 'r0');
    expect(first?.dataset.index).toBe('0');
    expect(first?.dataset.vindex).toBe('1');
    const header = document.querySelector<HTMLElement>('tr[data-vindex="0"]');
    expect(header?.querySelector('[aria-expanded]')).not.toBeNull();
    // Every drawn data row: its item index is its row index plus the group headers above it (one here).
    for (const r of rows) expect(Number(r.dataset.vindex)).toBe(Number(r.dataset.index) + 1);
  });

  it('a table that is not virtual carries no data-vindex', () => {
    render(<DataTable label="Few" data={MANY.slice(0, 5)} columns={COLUMNS} getRowId={(r) => r.id} groupBy={(r) => r.group} groups={GROUPS} presentation="table" />);
    expect(rowEls()).toHaveLength(5);
    expect(document.querySelector('[data-vindex]')).toBeNull();
  });

  it('ArrowDown and PageDown move focus by row index, to the row the index names, with data-vindex present', async () => {
    big();
    const r0 = rowEls().find((r) => r.dataset.rowId === 'r0')!;
    act(() => r0.focus());
    fireEvent.keyDown(r0, { key: 'ArrowDown' });
    await flush();
    expect((document.activeElement as HTMLElement).dataset.rowId).toBe('r1');
    expect((document.activeElement as HTMLElement).dataset.index).toBe('1');
    const from = Number((document.activeElement as HTMLElement).dataset.index);
    fireEvent.keyDown(document.activeElement!, { key: 'PageDown' });
    await flush();
    const to = document.activeElement as HTMLElement;
    expect(Number(to.dataset.index)).toBeGreaterThan(from);
    // The row the index names (rows are r0, r1, ... in order), never the item index's row.
    expect(to.dataset.rowId).toBe(`r${to.dataset.index}`);
  });
});

// Measured sizes are cached by item identity, so a size follows its
// item when items move; and PageUp/PageDown count only this table's own rows wholly in sight.
const rectOf = (top: number, height: number) => ({ x: 0, y: top, top, left: 0, right: 800, bottom: top + height, width: 800, height, toJSON: () => ({}) }) as DOMRect;
const scrollerOf = () => document.querySelector('table')?.parentElement as HTMLElement;

describe('DataTable virtual sizes follow their item', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    // Laid-out heights: a detail row 144, any other row 44 (what the virtualizer's measure reads).
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.tagName !== 'TR') return rectOf(0, 0);
      return rectOf(0, /expandedRow/.test(this.className) ? 144 : 44);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('expand row 0 then collapse it: row 1 keeps its own 44 px, so the space above a scrolled window is 44 per item', async () => {
    render(<DataTable label="Many" data={MANY} columns={COLUMNS} getRowId={(r) => r.id} presentation="table" pageSize={500} renderExpanded={(r) => <p>detail of {r.name}</p>} />);
    const expander = () => document.querySelector<HTMLButtonElement>('tr[data-row-id="r0"] button[aria-expanded]')!;
    act(() => expander().click());
    await flush();
    expect(document.querySelector('tr[data-vindex="1"]')?.className).toMatch(/expandedRow/);
    act(() => expander().click());
    await flush();
    // Row 1 is item 1 again (it was item 2 under the detail row, measured 44 there; the detail row measured 144 at 1).
    expect(document.querySelector<HTMLElement>('tr[data-row-id="r1"]')?.dataset.vindex).toBe('1');
    // Scroll a hundred rows down: the items above the window are rows of 44 each, the detail row gone.
    const box = scrollerOf();
    let y = 0;
    Object.defineProperty(box, 'scrollTop', { configurable: true, get: () => y, set: (v: number) => { y = v; } });
    y = 44 * 100;
    fireEvent.scroll(box);
    await flush();
    const first = Math.min(...rowEls().map((r) => Number(r.dataset.vindex)));
    expect(first).toBeGreaterThan(1);
    const pad = document.querySelector<HTMLElement>('tbody > tr:first-child > td');
    expect(pad?.style.height).toBe(`${first * 44}px`);
  });
});

describe('DataTable PageDown counts its own rows wholly in sight', () => {
  const FEW = MANY.slice(0, 30);
  const INNER = MANY.slice(100, 108);
  // A 400 px scroller at the top of the window. Outer rows stack from 0 at `outerH` each; a nested table's rows sit
  // inside the scroller (20 px each), as a detail row's table would.
  const lay = (outerH: number) => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const outer = document.querySelector('table');
      if (this === outer?.parentElement) return rectOf(0, 400);
      if (this instanceof HTMLElement && this.tagName === 'TR' && this.dataset.rowId) {
        const n = Number(this.dataset.index);
        return this.closest('table') === outer ? rectOf(n * outerH, outerH) : rectOf(50 + n * 20, 20);
      }
      return rectOf(0, 0);
    });
  };
  afterEach(() => vi.restoreAllMocks());
  const pageDownFrom0 = async () => {
    const r0 = document.querySelector<HTMLElement>('table tr[data-row-id="r0"]')!;
    act(() => r0.focus());
    fireEvent.keyDown(r0, { key: 'PageDown' });
    await flush();
    return document.activeElement as HTMLElement;
  };

  it('a nested table in an open detail row is not counted: 9 outer rows wholly in sight step 8', async () => {
    lay(44);
    render(
      <DataTable label="Outer" data={FEW} columns={COLUMNS} getRowId={(r) => r.id} presentation="table"
        renderExpanded={(r) => (r.id === 'r0' ? <DataTable label="Inner" data={INNER} columns={COLUMNS} getRowId={(x) => x.id} presentation="table" /> : null)} />,
    );
    act(() => document.querySelector<HTMLButtonElement>('tr[data-row-id="r0"] button[aria-expanded]')!.click());
    await flush();
    expect(document.querySelectorAll('table table tr[data-row-id]')).toHaveLength(8);
    const to = await pageDownFrom0();
    expect(to.closest('table')).toBe(document.querySelector('table'));
    expect(to.dataset.rowId).toBe('r8');
  });

  it('rows taller than the view (none wholly in sight) step one row, not a view of estimates', async () => {
    lay(600);
    render(<DataTable label="Tall" data={FEW} columns={COLUMNS} getRowId={(r) => r.id} presentation="table" />);
    const to = await pageDownFrom0();
    expect(to.dataset.rowId).toBe('r1');
  });
});

// Every item kind has its own cache key, so a row whose id looks
// like a detail row's key keeps its own size; Page keys stop at the sticky header cells (the th stick, the thead scrolls
// away) in a table, and a list's screen-reader header covers nothing.
describe('DataTable item keys and the sticky header', () => {
  afterEach(() => vi.restoreAllMocks());

  it('a row whose id is x:r0 keeps its own 44 px after row r0 expands and collapses', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.tagName !== 'TR') return rectOf(0, 0);
      return rectOf(0, /expandedRow/.test(this.className) ? 144 : 44);
    });
    const data = MANY.map((r, i) => (i === 50 ? { ...r, id: 'x:r0' } : r));
    render(<DataTable label="Many" data={data} columns={COLUMNS} getRowId={(r) => r.id} presentation="table" pageSize={500} renderExpanded={(r) => <p>detail of {r.name}</p>} />);
    const box = scrollerOf();
    let y = 0;
    Object.defineProperty(box, 'scrollTop', { configurable: true, get: () => y, set: (v: number) => { y = v; } });
    // Scroll and let the virtualizer's scrolling state end (150 ms, its reset delay): rows mounted while it scrolls are
    // not measured, rows mounted after are.
    const scrollTo = async (v: number) => {
      y = v;
      fireEvent.scroll(box);
      await flush();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 200));
      });
      await flush();
    };
    // Row 50 (id x:r0) drawn and measured, then back to the top.
    await scrollTo(44 * 45);
    expect(document.querySelector('tr[data-row-id="x:r0"]')).not.toBeNull();
    await scrollTo(0);
    const expander = () => document.querySelector<HTMLButtonElement>('tr[data-row-id="r0"] button[aria-expanded]')!;
    act(() => expander().click());
    await flush();
    act(() => expander().click());
    await flush();
    // Row 50 is off screen above: the space above the window is 44 px per item.
    await scrollTo(44 * 100);
    expect(document.querySelector('tr[data-row-id="x:r0"]')).toBeNull();
    const first = Math.min(...rowEls().map((r) => Number(r.dataset.vindex)));
    expect(first).toBeGreaterThan(50);
    expect(document.querySelector<HTMLElement>('tbody > tr:first-child > td')?.style.height).toBe(`${first * 44}px`);
  });

  // A 400 px scroller at the window's top; rows stack at `rowH` each from `rowTop`; header boxes as given.
  const lay = (rowH: number, th: DOMRect, thead: DOMRect) => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const outer = document.querySelector('table');
      if (this === outer?.parentElement) return rectOf(0, 400);
      if (this.tagName === 'TH') return th;
      if (this.tagName === 'THEAD') return thead;
      if (this instanceof HTMLElement && this.tagName === 'TR' && this.dataset.rowId) return rectOf(Number(this.dataset.index) * rowH, rowH);
      return rectOf(0, 0);
    });
  };
  const pageDownFrom = async (id: string) => {
    const r = document.querySelector<HTMLElement>(`tr[data-row-id="${id}"]`)!;
    act(() => r.focus());
    fireEvent.keyDown(r, { key: 'PageDown' });
    await flush();
    return (document.activeElement as HTMLElement).dataset.rowId;
  };

  it('a scrolled table: row 0 under the sticky header cells is not in sight, so rows 1-8 step 7 (row 1 to row 8)', async () => {
    // Scrolled by the header's height: the thead has scrolled above the view, its th cells stick over row 0.
    lay(44, rectOf(0, 44), rectOf(-44, 44));
    render(<DataTable label="Thirty" data={MANY.slice(0, 30)} columns={COLUMNS} getRowId={(r) => r.id} presentation="table" />);
    expect(await pageDownFrom('r1')).toBe('r8');
  });

  it('a list at its top: the screen-reader header covers nothing, so rows 0-6 step 6 (row 0 to row 6)', async () => {
    lay(56, rectOf(0, 1), rectOf(0, 1));
    render(<DataTable label="Thirty" data={MANY.slice(0, 30)} columns={COLUMNS} getRowId={(r) => r.id} presentation="list" />);
    expect(await pageDownFrom('r0')).toBe('r6');
  });
});
