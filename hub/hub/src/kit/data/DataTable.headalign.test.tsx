// Vitest: a column's header follows its cells. Column meta align 'end' (figures) and 'center' put the same class on
// the header cell and on every body cell; the header's own rule must say the alignment again, because the general
// header rule (`.thead th`, start-aligned) outweighs the bare class. What follows an end-aligned label (the sort
// arrow, a tip) is drawn before it, so the label ends on the column's edge.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { createColumnHelper } from '@tanstack/react-table';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable';
import s from './DataTable.module.css';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

const css = readFileSync(path.join(__dirname, 'DataTable.module.css'), 'utf8');
/** The declarations of the rule whose whole selector list is `sel`. */
const rule = (sel: string) => {
  const i = css.indexOf(`\n${sel} {`);
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
};

interface Row {
  id: string;
  name: string;
  calls: number;
  state: string;
}
const ROWS: Row[] = [
  { id: 'a', name: 'alpha', calls: 30, state: 'on' },
  { id: 'b', name: 'beta', calls: 5120, state: 'off' },
];
const col = createColumnHelper<Row>();
const columns = [
  col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary' } }),
  col.accessor('calls', { header: 'Calls', meta: { align: 'end' } }),
  col.accessor('state', { header: 'State', enableSorting: false, meta: { align: 'center' } }),
];

describe('DataTable header alignment', () => {
  it('the header cell and the body cells of an aligned column carry the same class', () => {
    const { container } = render(<DataTable label="Scripts" data={ROWS} columns={columns} getRowId={(r) => r.id} presentation="table" sortParam={false} />);
    const heads = [...container.querySelectorAll<HTMLElement>('thead th')];
    const calls = heads.find((th) => th.textContent === 'Calls')!;
    const state = heads.find((th) => th.textContent === 'State')!;
    const name = heads.find((th) => th.textContent === 'Name')!;
    expect(calls.classList.contains(s.end!)).toBe(true);
    expect(state.classList.contains(s.center!)).toBe(true);
    expect(name.classList.contains(s.end!) || name.classList.contains(s.center!)).toBe(false);
    const cell = [...container.querySelectorAll<HTMLElement>('tbody td')].find((td) => td.textContent === '30')!;
    expect(cell.classList.contains(s.end!)).toBe(true);
    // The sort button is inside the end-aligned header: the rule below reaches it.
    expect(calls.querySelector(`.${s.sortBtn}`)).not.toBeNull();
    expect(calls.closest(`.${s.thead}`)).not.toBeNull();
  });

  it('CSS: the general header rule is start-aligned, and the aligned header says its own alignment after it', () => {
    expect(rule('.thead th')).toMatch(/text-align: start;/);
    expect(rule('.thead th.end')).toMatch(/text-align: end;/);
    expect(rule('.thead th.center')).toMatch(/text-align: center;/);
    expect(css.indexOf('\n.thead th.end {')).toBeGreaterThan(css.indexOf('\n.thead th {'));
    expect(css.indexOf('\n.thead th.center {')).toBeGreaterThan(css.indexOf('\n.thead th {'));
  });

  it('CSS: the sort arrow and the tip of an end-aligned header are drawn before its label', () => {
    expect(rule('.thead th.end .sortBtn,\n.thead th.end .thTip')).toMatch(/flex-direction: row-reverse;/);
  });
});
