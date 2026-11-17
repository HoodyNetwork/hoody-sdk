// Vitest: DataTable gives the edge cells' extra padding (and the row's lead) to the
// 'fit' columns drawn at the ends, after hidden and dropped columns are gone; the checkbox and actions cells keep their
// edge; and the 4 px the planner adds is what DataTable.module.css draws.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from './DataTable';
import { EDGE_PAD, fitWidth } from './DataTableLayout';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  code: string;
  name: string;
  note: string;
  last: string;
}
const data: Row[] = Array.from({ length: 4 }, (_, i) => ({ id: `r${i}`, code: `Code number ${i}`, name: `A fairly long name ${i}`, note: `note ${i}`, last: `${i} min ago` }));
const col = createColumnHelper<Row>();
const NAME = fitWidth(data.map((r) => r.name));
const LAST = fitWidth(data.map((r) => r.last));
const columns = (hideCode: boolean) => [
  col.accessor('code', { header: 'Code', meta: { size: 'fit', defaultHidden: hideCode } }),
  col.accessor('name', { header: 'Name', meta: { size: 'fit', list: 'primary' } }),
  col.accessor('note', { header: 'Note', meta: { size: 'fill' } }),
  col.accessor('last', { header: 'Last', meta: { size: 'fit' } }),
];

type Cb = (entries: { target: Element; contentRect: { width: number } }[]) => void;
const observers: { cb: Cb; el?: Element }[] = [];
beforeEach(() => {
  observers.length = 0;
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
});
afterEach(() => cleanup());

function width(w: number) {
  act(() => {
    for (const o of observers) if (o.el) o.cb([{ target: o.el, contentRect: { width: w } }]);
  });
}
/** A data column's planned px width, by its header: the colgroup has one col per header cell, the checkbox's and the
 *  actions' included, in the same order. */
function widthOf(head: string): number {
  const heads = [...document.querySelectorAll('thead tr:last-child th')].map((th) => th.textContent?.trim() ?? '');
  const colEls = [...document.querySelectorAll('colgroup col')];
  expect(colEls.length, 'one col per header cell').toBe(heads.length);
  const at = heads.findIndex((h) => h.startsWith(head));
  expect(at, `a ${head} column`).toBeGreaterThanOrEqual(0);
  return Number.parseFloat((colEls[at] as HTMLElement).style.width);
}

describe('DataTable: the edge cells\' padding goes to the fit columns drawn at the ends', () => {
  it('the CSS the planner\'s 4 px mirrors: the first cell --sp-4 at the start, the last --actions-pad-end at the end, the table\'s --actions-pad-end --sp-4', () => {
    const css = readFileSync(path.join(import.meta.dirname, 'DataTable.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = (sel: RegExp) => {
      const m = sel.exec(css);
      expect(m, `${sel} in DataTable.module.css`).not.toBeNull();
      return m![1]!;
    };
    expect(rule(/\.tr > td:first-child \{([^}]*)\}/)).toMatch(/padding-inline-start:\s*var\(--sp-4\)/);
    expect(rule(/\.tr > td:last-child \{([^}]*)\}/)).toMatch(/padding-inline-end:\s*var\(--actions-pad-end\)/);
    expect(rule(/\.table \{([^}]*)\}/)).toMatch(/--actions-pad-end:\s*var\(--sp-4\)/);
    // --sp-4 is 16 and --sp-3 12 (the fit measure's 12 a side, CELL_PAD): 4 px more at each edge.
    expect(16 - 12).toBe(EDGE_PAD);
  });

  it('with the first column hidden, the next fit column is drawn first and takes the start pad; the last takes the end pad', () => {
    render(<DataTable label="Things" data={data} columns={columns(true)} getRowId={(r) => r.id} />);
    width(1400);
    expect(widthOf('Name'), 'Name, drawn first: its words and the first cell\'s 4 px').toBe(NAME + EDGE_PAD);
    expect(widthOf('Last'), 'Last, drawn last: its words and the last cell\'s 4 px').toBe(LAST + EDGE_PAD);
  });

  it('with the first column shown, it takes the start pad and the next column none', () => {
    render(<DataTable label="Things" data={data} columns={columns(false)} getRowId={(r) => r.id} />);
    width(1400);
    expect(widthOf('Code')).toBe(fitWidth(data.map((r) => r.code)) + EDGE_PAD);
    expect(widthOf('Name')).toBe(NAME);
  });

  it('a stacked table whose first column is hidden: the row\'s lead (the group indent, 24 px past the first cell\'s 16) goes to the column drawn first', () => {
    render(
      <DataTable label="Things" data={data} columns={columns(true)} getRowId={(r) => r.id} groupBy={() => 'g'} groups={[{ id: 'g', label: 'Group' }]} groupHeader="stacked" />,
    );
    width(1400);
    // .groupIndent pads the cell 40 px at the start: the first cell's 16 (12 + EDGE_PAD) and --group-indent (24) more.
    expect(widthOf('Name'), 'Name: its words, the first cell\'s 4 px and the group indent').toBe(NAME + EDGE_PAD + 24);
  });

  it('an inline grouped table: the same 24 px indent goes to the column drawn first', () => {
    render(<DataTable label="Things" data={data} columns={columns(true)} getRowId={(r) => r.id} groupBy={() => 'g'} groups={[{ id: 'g', label: 'Group' }]} />);
    width(1400);
    expect(widthOf('Name'), 'Name: its words, the first cell\'s 4 px and the group indent').toBe(NAME + EDGE_PAD + 24);
  });

  it('a grouped table with grouping turned off: no indent', () => {
    render(
      <DataTable label="Things" data={data} columns={columns(true)} getRowId={(r) => r.id} groupBy={() => 'g'} groups={[{ id: 'g', label: 'Group' }]} groupToggle={{ label: 'Group', defaultOn: false }} />,
    );
    width(1400);
    expect(widthOf('Name')).toBe(NAME + EDGE_PAD);
  });

  it('a stacked table with a checkbox: the indent is 24 px past the cell\'s 12, and no start pad', () => {
    render(
      <DataTable label="Things" data={data} columns={columns(true)} getRowId={(r) => r.id} selectable groupBy={() => 'g'} groups={[{ id: 'g', label: 'Group' }]} groupHeader="stacked" />,
    );
    width(1400);
    expect(widthOf('Name'), 'Name: its words and the group indent').toBe(NAME + 24);
  });

  it('an expandable table: the row chevron (20 px and the 4 px gap) goes to the column drawn first', () => {
    render(<DataTable label="Things" data={data} columns={columns(true)} getRowId={(r) => r.id} renderExpanded={(r) => r.note} />);
    width(1400);
    expect(widthOf('Name'), 'Name: its words, the first cell\'s 4 px and the chevron').toBe(NAME + EDGE_PAD + 24);
  });

  it('the actions cell keeps the end: the last data column takes no end pad', () => {
    render(<DataTable label="Things" data={data} columns={columns(true)} getRowId={(r) => r.id} actions={() => [{ id: 'open', label: 'Open', onAction: () => undefined }]} />);
    width(1400);
    expect(widthOf('Last')).toBe(LAST);
    expect(widthOf('Name')).toBe(NAME + EDGE_PAD);
  });
});
