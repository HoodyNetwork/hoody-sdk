// The table gate sees a line of a cell below its one-line row (a stacked block) as table-wrap-cut, whatever its width,
// unless a box marks the loss; it is never reported as a sideways cut (it is not on screen at all).
import { expect, test } from 'bun:test';
import { tableFaults } from '../../term/prim/TableCheck';

const node = (x: number, y: number, width: number, height: number, mark?: object, kids: any[] = [], extra: object = {}): any => {
  const n: any = { x, y, width, height, __tableMark: mark, _overflow: 'hidden', ...extra };
  for (const c of kids) c.parent = n;
  n.getChildren = () => kids;
  return n;
};
const text = (x: number, y: number, s: string): any => ({ x, y, width: s.length, height: 1, plainText: s, getChildren: () => [] });
const table = (note: string, marked = false) => node(0, 0, 80, 5, { role: 'table' }, [node(0, 1, 80, 1, undefined, [
  node(0, 1, 30, 1, { role: 'cell', col: 'task' }, [node(0, 1, 30, 1, undefined, [node(0, 1, 30, 2, undefined, [text(0, 1, 'Draft reply to a reader'), text(0, 2, note)], { _overflow: 'visible' })], marked ? { __cutMarked: true } : {})]),
])]);

test('a short note line below its row: table-wrap-cut', () => {
  expect(tableFaults(table('Waiting'), { cols: 80, rows: 24 }).map((f) => f.kind)).toEqual(['table-wrap-cut']);
});
test('a wide note line below its row: table-wrap-cut, never table-cut-unmarked', () => {
  expect(tableFaults(table('Waiting to: Run a command that changes files in the shop repository'), { cols: 80, rows: 24 }).map((f) => f.kind)).toEqual(['table-wrap-cut']);
});
test('marked by its box (ClipRow drew the "…"): no fault', () => {
  expect(tableFaults(table('Waiting to: Run a command that changes files in the shop repository', true), { cols: 80, rows: 24 })).toEqual([]);
});
