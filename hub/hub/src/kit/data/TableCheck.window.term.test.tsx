// The table gate and scrolls: the last row in view may be cut by a scroll's edge (the table's rows window, which
// declares it drops: an id ending "~cut"; or the page's scroll viewport), as any scrolled list; scrolling shows the rest,
// so a wrapped cell text there is not table-wrap-cut (Hoody AI allowance at 80x24: "spare"'s four-line note at the
// screen's bottom edge). The cell's own edge still counts, and so does a clipping box that does not scroll.
import { expect, test } from 'bun:test';
import { tableFaults } from '../../term/prim/TableCheck';

const node = (x: number, y: number, width: number, height: number, mark?: object, kids: any[] = [], extra: object = {}): any => {
  const n: any = { x, y, width, height, __tableMark: mark, _overflow: 'hidden', ...extra };
  for (const c of kids) c.parent = n;
  n.getChildren = () => kids;
  return n;
};
// A note wrapped onto 4 lines from y 6, its cell `cellH` tall, in a rows window that shows y 0..8 (3 of its lines).
const note = (): any => ({ x: 2, y: 6, width: 20, height: 4, plainText: "Can't read this server right now. Try again in a minute.", virtualLineCount: 4, wrapMode: 'word', getChildren: () => [] });
const table = (cellH: number, windowId?: string) => node(0, 0, 80, 12, { role: 'table' }, [
  node(0, 0, 80, 9, undefined, [node(0, 6, 20, cellH, { role: 'cell', col: 'name' }, [note()])], windowId ? { id: windowId } : {}),
]);

test('a wrapped note in the last row of a scrolled rows window (drops): no fault', () => {
  expect(tableFaults(table(4, 'drops@d1~cut'), { cols: 80, rows: 24 })).toEqual([]);
});
test('control: the same note cut by its own cell (3 of 4 lines): table-wrap-cut', () => {
  expect(tableFaults(table(3, 'drops@d1~cut'), { cols: 80, rows: 24 }).map((f) => f.kind)).toEqual(['table-wrap-cut']);
});
// The same table with a rows window tall enough (y 0..12), in a page scroll whose viewport shows y 0..8.
const inPage = (scrolls: boolean) => {
  const t = node(0, 0, 80, 12, { role: 'table' }, [node(0, 0, 80, 12, undefined, [node(0, 6, 20, 4, { role: 'cell', col: 'name' }, [note()])])]);
  const content: any = node(0, 0, 80, 40, undefined, [t], { _overflow: 'visible' });
  const viewport: any = node(0, 0, 80, 9, undefined, [content]);
  const wrapper: any = node(0, 0, 80, 9, undefined, [viewport]);
  node(0, 0, 80, 9, undefined, [wrapper], scrolls ? { wrapper, viewport, content } : {});
  return t;
};
test("a wrapped note cut by the page's scroll viewport: no fault", () => {
  expect(tableFaults(inPage(true), { cols: 80, rows: 24 })).toEqual([]);
});
test('control: the same boxes when they are not a scroll box: table-wrap-cut', () => {
  expect(tableFaults(inPage(false), { cols: 80, rows: 24 }).map((f) => f.kind)).toEqual(['table-wrap-cut']);
});
test('control: a clipping box above the cell that does not declare it drops still cuts: table-wrap-cut', () => {
  expect(tableFaults(table(4), { cols: 80, rows: 24 }).map((f) => f.kind)).toEqual(['table-wrap-cut']);
});
