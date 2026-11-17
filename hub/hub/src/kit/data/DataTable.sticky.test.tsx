// DataTable stickyGroups. A group's header row sticks under the column header while its rows scroll by
// (DataTable.module.css .stickyGroups); with virtual rows the header of the group in sight stays drawn even when it is
// far above the drawn window, with a spacer keeping the rows where they belong. Without the prop nothing changes, and
// keyboard row navigation is the same with it.
import { act, fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
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
type Props = Partial<Parameters<typeof DataTable<Row>>[0]>;
const table = (extra: Props = {}, rows = MANY) =>
  render(<DataTable label="Many" data={rows} columns={COLUMNS} getRowId={(r) => r.id} groupBy={(r) => r.group} groups={GROUPS} presentation="table" pageSize={500} {...extra} />);

const rowEls = () => [...document.querySelectorAll<HTMLElement>('tr[data-row-id]')];
const headerOf = (label: string) => [...document.querySelectorAll<HTMLElement>('tr')].find((tr) => tr.querySelector('[aria-expanded]')?.textContent?.includes(label));
const flush = async () => {
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  });
};
const scrollerOf = () => document.querySelector('table')?.parentElement as HTMLElement;
async function scrollTo(y: number) {
  const box = scrollerOf();
  Object.defineProperty(box, 'scrollTop', { configurable: true, get: () => y, set: () => {} });
  fireEvent.scroll(box);
  await flush();
}
/** The body's rows as drawn, top to bottom: pads and spacers (aria-hidden), group headers and rows. */
const tbodyRows = () => [...document.querySelectorAll<HTMLElement>('tbody > tr')];

// Each case mounts 250 grouped rows (twice in the first): on a loaded host that alone passes the default per-test
// time, so the file asks for more. No assertion waits on it.
vi.setConfig({ testTimeout: 60_000 });

describe('DataTable stickyGroups', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  });
  afterEach(() => vi.restoreAllMocks());

  it('without the prop the table is drawn exactly as before: same markup as stickyGroups={false}, no sticky class', async () => {
    const a = table();
    await scrollTo(44 * 80);
    const ids = (html: string) => html.replace(/react-aria-[^"]*/g, 'id'); // reason: generated ids differ per mount
    const plain = ids(a.container.innerHTML);
    a.unmount();
    const b = table({ stickyGroups: false });
    await scrollTo(44 * 80);
    expect(ids(b.container.innerHTML)).toBe(plain);
    expect(document.querySelector('table')?.className).not.toMatch(/stickyGroups/);
    // Scrolled far into group One, the plain table no longer draws One's header.
    expect(headerOf('One')).toBeUndefined();
  });

  it('without the prop the body keeps the shape it had before the prop existed: one top pad, the window in order, one bottom pad', async () => {
    // The structure the virtual body has without the prop: [top pad] then the window's items with
    // consecutive data-vindex, then [bottom pad]; no other aria-hidden row, no out-of-order item.
    table();
    for (const y of [0, 44 * 80, 40 + 44 * 125 + 40 + 44 * 60]) {
      await scrollTo(y);
      const trs = tbodyRows();
      const hidden = trs.filter((tr) => tr.getAttribute('aria-hidden') === 'true');
      const items = trs.filter((tr) => tr.dataset.vindex !== undefined);
      expect(trs.length - items.length, `only the two pads besides the items at ${y}`).toBeLessThanOrEqual(2);
      for (const h of hidden) expect([trs[0], trs.at(-1)]).toContain(h);
      const v = items.map((tr) => Number(tr.dataset.vindex));
      expect(v, `consecutive items at ${y}`).toEqual(v.map((_, i) => v[0]! + i));
    }
  });

  it('without the prop a row keeps its DOM node as the window moves (no remount from a wrapper)', async () => {
    table();
    await scrollTo(44 * 80);
    const row = document.querySelector<HTMLElement>('tr[data-row-id="r82"]');
    expect(row).not.toBeNull();
    await scrollTo(44 * 82);
    expect(document.querySelector('tr[data-row-id="r82"]')).toBe(row);
  });

  it('with virtual rows the header of the group in sight stays drawn far above the window, a spacer keeping the rows in place', async () => {
    table({ stickyGroups: true });
    expect(document.querySelector('table')?.className).toMatch(/stickyGroups/);
    await scrollTo(44 * 80);
    const one = headerOf('One');
    expect(one, 'One is the group in sight').toBeDefined();
    expect(one?.dataset.vindex).toBe('0');
    // Drawn first (after the top pad, none: the header is item 0), then a spacer, then the window's rows.
    const trs = tbodyRows();
    const at = trs.indexOf(one!);
    const spacer = trs[at + 1]!;
    expect(spacer.getAttribute('aria-hidden')).toBe('true');
    const firstRow = Math.min(...rowEls().map((r) => Number(r.dataset.vindex)));
    expect(firstRow).toBeGreaterThan(20);
    // the spacer is exactly the items between the header (40) and the first drawn row (44 each)
    expect(spacer.querySelector('td')?.style.height).toBe(`${(firstRow - 1) * 44}px`);
    // Into group Two: its header is the one kept (One's is gone).
    await scrollTo(40 + 44 * 125 + 40 + 44 * 60);
    expect(headerOf('Two')).toBeDefined();
    expect(headerOf('One')).toBeUndefined();
  });

  it('at the top no spacer is drawn: the window starts at the header', async () => {
    table({ stickyGroups: true });
    await flush();
    expect(tbodyRows()[0]).toBe(headerOf('One'));
    expect(tbodyRows()[1]?.dataset.rowId).toBe('r0');
  });

  it('keyboard row navigation is unchanged: the same keys land on the same rows with and without the prop', async () => {
    const press = async (key: string) => {
      fireEvent.keyDown(document.activeElement!, { key });
      await flush();
      return (document.activeElement as HTMLElement).dataset.rowId ?? 'none';
    };
    const keys = async (extra: Props) => {
      const r = table(extra);
      act(() => rowEls().find((x) => x.dataset.rowId === 'r0')!.focus());
      const seen: string[] = [];
      // Within a group, a page (jsdom's estimate: 600 / 44 - 1 = 12 rows), Home. End needs a real scroll to draw the last
      // row (jsdom lays nothing out): DataTable.sticky.spec.ts presses End, Home and the boundary keys in Chromium.
      for (const key of ['ArrowDown', 'ArrowDown', 'PageDown', 'PageUp', 'PageDown', 'Home', 'j', 'k']) seen.push(await press(key));
      // Across the group boundary, far from the top (virtual rows, One's head kept drawn when sticky): r124 -> r125 -> r124.
      await scrollTo(44 * 118);
      act(() => rowEls().find((x) => x.dataset.rowId === 'r124')!.focus());
      for (const key of ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp']) seen.push(await press(key));
      r.unmount();
      return seen;
    };
    const plain = await keys({});
    expect(plain).toEqual(['r1', 'r2', 'r14', 'r2', 'r14', 'r0', 'r1', 'r0', 'r125', 'r124', 'r136', 'r124']);
    expect(await keys({ stickyGroups: true })).toEqual(plain);
  });

  it('the kept head is the real one: focusable, and it collapses its group from far below its place', async () => {
    table({ stickyGroups: true });
    await scrollTo(44 * 80);
    const button = headerOf('One')!.querySelector<HTMLElement>('[aria-expanded]')!;
    act(() => button.focus());
    expect(document.activeElement).toBe(button);
    // Arrow keys on the head do not move to a row (as without the prop: the head is a button, not a row).
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    await flush();
    expect(document.activeElement).toBe(button);
    act(() => button.click());
    await flush();
    expect(headerOf('One')?.querySelector('[aria-expanded]')?.getAttribute('aria-expanded')).toBe('false');
    expect(rowEls().some((r) => Number(r.dataset.rowId!.slice(1)) < 125)).toBe(false);
  });

  it('the stylesheet sticks a group row below the column header (0 in the list presentation, its header unseen)', () => {
    const css = readFileSync(path.resolve(__dirname, 'DataTable.module.css'), 'utf8');
    expect(css).toMatch(/\.stickyGroups \.groupRow > td \{\s*position: sticky;\s*inset-block-start: var\(--group-sticky-top\);/);
    expect(css).toMatch(/\.stickyGroups \{\s*--group-sticky-top: var\(--th-h\);/);
    expect(css).toMatch(/\.stickyGroups\.list \{\s*--group-sticky-top: 0px;/);
  });

  it('cards and icons never stick (a grid has no header row to hold)', () => {
    table({ stickyGroups: true, presentation: 'cards' }, MANY.slice(0, 10));
    expect(document.querySelector('table')?.className).not.toMatch(/stickyGroups/);
  });
});
