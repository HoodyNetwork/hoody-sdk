import { expect, test } from 'bun:test';
import { cellWidth } from '../../term/prim/TableCells';
import { keepInView, lineOffsets, planTerm, scrollBy, thumb, windowOf, type TermColumn } from './DataTableTermLayout';

const col = (id: string, o: Partial<TermColumn> = {}): TermColumn => ({ id, priority: 2, pinned: false, label: id, sortable: false, ...o });

test('cells: each visible column draws its plan width less its separator; the room is never exceeded', () => {
  const cols = [col('name', { pinned: true }), col('state', { width: '120px' }), col('note', { width: '160px', priority: 4 })];
  for (const room of [30, 50, 80, 120]) {
    const p = planTerm(cols, room, cellWidth);
    const used = p.visible.reduce((n, id) => n + (p.widths[id] ?? 0), 0);
    expect(used).toBeLessThanOrEqual(room);
    for (const id of p.visible) expect(p.cells[id]).toBe((p.widths[id] ?? 0) - p.sep);
  }
});

test('priority: the highest number drops first; the pinned column never drops', () => {
  const cols = [col('name', { pinned: true }), col('a', { width: '120px', priority: 1 }), col('b', { width: '120px', priority: 3 }), col('c', { width: '120px', priority: 4 })];
  const p = planTerm(cols, 45, cellWidth);
  expect(p.visible).toContain('name');
  expect(p.visible).toContain('a');
  expect(p.visible).not.toContain('c');
});

test('never-cut column (status words): as wide as its widest value, even when declared narrower', () => {
  const texts = ['Worked', 'Failed', 'Not run yet', 'Paused after failed runs'];
  const cols = [col('name', { pinned: true }), col('result', { width: '64px', never: true, texts })];
  const p = planTerm(cols, 90, cellWidth);
  expect(p.cells.result).toBeGreaterThanOrEqual(cellWidth('Paused after failed runs'));
});

test('virtual window: offsets, the window from a line, keepInView, the wheel, the thumb', () => {
  const at = lineOffsets([1, 1, 2, 1, 4, 1]);
  expect(at).toEqual([0, 1, 2, 4, 5, 9, 10]);
  expect(windowOf(at, 0, 3)).toEqual({ from: 0, to: 3 });
  expect(windowOf(at, 4, 2)).toEqual({ from: 3, to: 5 });
  expect(keepInView(0, 8, 1, 5, 10)).toBe(4);
  expect(keepInView(6, 2, 1, 5, 10)).toBe(2);
  expect(keepInView(3, 4, 1, 5, 10)).toBe(3);
  expect(scrollBy(4, 10, 5, 10)).toBe(5);
  expect(thumb(0, 10, 10)).toBeNull();
  expect(thumb(0, 10, 100)).toEqual({ start: 0, size: 1 });
  expect(thumb(90, 10, 100)).toEqual({ start: 9, size: 1 });
});

test('5,000 rows: the window is found in a dozen steps (binary search), not a scan', () => {
  const at = lineOffsets(Array.from({ length: 5000 }, () => 1));
  const s = performance.now();
  for (let i = 0; i < 10000; i++) windowOf(at, (i * 37) % 4980, 20);
  expect(performance.now() - s).toBeLessThan(200);
  expect(windowOf(at, 4980, 20)).toEqual({ from: 4980, to: 5000 });
});

test('gap: two cells when the row has room, one only when tight; the wide gap never drops a column or cuts a fit word', () => {
  const texts = ['Status update', 'Billing', 'Maintenance'];
  const cols = [col('name', { pinned: true }), col('kind', { size: 'fit', texts }), col('when', { width: '120px' })];
  const roomy = planTerm(cols, 100, cellWidth);
  expect(roomy.sep).toBe(2);
  for (const id of roomy.visible) expect(roomy.cells[id]).toBe((roomy.widths[id] ?? 0) - 2);
  expect(roomy.cells.kind).toBeGreaterThanOrEqual(cellWidth('Status update'));
  // Exactly the floors with one-cell gaps: a second cell per gap would drop a column, so the gap stays one.
  const floors = (16 + 1) + (cellWidth('Status update') + 1) + (15 + 1);
  const tight = planTerm(cols, floors, cellWidth);
  expect(tight.sep).toBe(1);
  expect(tight.visible).toEqual(['name', 'kind', 'when']);
  expect(tight.cells.kind).toBeGreaterThanOrEqual(cellWidth('Status update'));
});

test('text column: never left at a word while a fit column stands above its floor (notifications: Notice vs Message)', () => {
  const notices = ['Storage share cosmic-bison expires in 3 days', 'Server proud-koala rental ends in 2 days', 'Computer atlas stopped'];
  const cols = [
    col('level', { width: '48px' }),
    col('notice', { pinned: true, minWidth: 240, size: 'fit', texts: notices, fitPad: 8 }),
    col('message', { size: 'fill' }),
    col('kind', { width: '100px', size: 'fit', texts: ['Status update', 'Maintenance', 'Billing'], priority: 3 }),
    col('when', { width: '112px', size: 'fit', texts: ['20 days ago'], priority: 1 }),
  ];
  const p = planTerm(cols, 86, cellWidth);
  expect(p.visible).toEqual(['level', 'notice', 'message', 'kind', 'when']);
  expect(p.cells.message).toBeGreaterThanOrEqual(15);
  expect(p.cells.notice).toBeGreaterThanOrEqual(30); // its floor (240 px) still holds
  expect(p.cells.when).toBeGreaterThanOrEqual(cellWidth('20 days ago'));
  expect(p.visible.reduce((n, id) => n + (p.widths[id] ?? 0), 0)).toBeLessThanOrEqual(86);
  // No donor above its floor: the text column keeps what it had (no column is pushed under a floor).
  const tight = planTerm(cols, 31 + 11 + 7 + 15 + 15, cellWidth);
  for (const id of tight.visible) expect(tight.widths[id]).toBeGreaterThan(0);
});

test('the wide gap never takes cells from a text column under its want (notifications at 120x40: room 84)', () => {
  const notices = ['Storage share cosmic-bison expires in 3 days', 'Server proud-koala rental ends in 2 days', 'Computer atlas stopped'];
  const cols = [
    col('level', { width: '56px', priority: 1 }),
    col('notice', { pinned: true, minWidth: 240, size: 'fit', texts: notices, fitPad: 8 }),
    col('message', { size: 'fill' }),
    col('kind', { width: '100px', size: 'fit', texts: ['Status update', 'Maintenance', 'Billing'], priority: 3 }),
    col('when', { width: '112px', size: 'fit', texts: ['20 days ago'], priority: 1, sortable: true }),
  ];
  for (const room of [80, 84, 87, 90, 100]) {
    const p = planTerm(cols, room, cellWidth);
    if (room >= 84) expect(p.cells.message).toBeGreaterThanOrEqual(15);
  }
  // Room enough for both: the wide gap still comes.
  expect(planTerm(cols, 100, cellWidth).sep).toBe(2);
});
