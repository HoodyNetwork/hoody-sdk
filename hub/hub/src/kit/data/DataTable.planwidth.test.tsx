// Vitest: the scroll box carries data-plan-width, the width (whole px) the drawn plan was
// made for, in the same commit as the plan: absent before the box is measured, then each measured width with the
// presentation that width picks (a table when it fits, a list when it does not).
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from './DataTable';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
  state: string;
  note: string;
}
const col = createColumnHelper<Row>();
const COLUMNS = [
  col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary' } }),
  col.accessor('state', { header: 'State', meta: { width: '160px', list: 'status' } }),
  col.accessor('note', { header: 'Note', meta: { width: '400px', priority: 1 } }),
];
const ROWS: Row[] = [
  { id: 'a', name: 'Alpha', state: 'ok', note: 'first' },
  { id: 'b', name: 'Beta', state: 'ok', note: 'second' },
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
const box = () => document.querySelector('table')!.parentElement as HTMLElement;
const heads = () => document.querySelectorAll('thead th').length;

describe('DataTable: data-plan-width', () => {
  it('names the width the drawn plan was made for, in the commit that draws it', () => {
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} />);
    expect(box()).not.toHaveAttribute('data-plan-width');
    width(1350.4);
    expect(box()).toHaveAttribute('data-plan-width', '1350');
    expect(heads()).toBeGreaterThan(1);
    width(300);
    expect(box()).toHaveAttribute('data-plan-width', '300');
    // At 300 px name + state + the first-priority column cannot fit: the same commit draws the list (one header cell).
    expect(heads()).toBeLessThanOrEqual(1);
  });
});
