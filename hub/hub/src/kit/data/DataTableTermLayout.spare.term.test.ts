// Spare width on a wide screen, terminal only:
// - Notifications at 320 columns kept Notice (a 'fit' column, capped at 40 cells as the web's 320 px) cutting its titles
//   while Message beside it held 200 cells its words never use. A cut 'fit' column grows from slack.
// - Apps at 240 columns gave Name every spare cell: names, 150 empty cells, then State, Opens in and Action at the far
//   edge. A text column keeps its need and some room; the rest is shared across the row.
import { expect, test } from 'bun:test';
import { cellWidth } from '../../term/prim/TableCells';
import { planTerm, TERM_TEXT_SLACK, type TermColumn } from './DataTableTermLayout';

const col = (id: string, o: Partial<TermColumn> = {}): TermColumn => ({ id, priority: 2, pinned: false, label: id, sortable: false, ...o });
const sum = (p: { visible: string[]; widths: Record<string, number> }) => p.visible.reduce((n, id) => n + (p.widths[id] ?? 0), 0);

const title = 'Storage share granite-archive-2026 expires tomorrow at noon'; // 59 cells
const notifications = (titleWant?: number, messageWant = 110): TermColumn[] => [
  col('level', { width: '56px', want: 1 }),
  col('title', { pinned: true, minWidth: 240, size: 'fit', texts: [title, 'Payment received'], fitPad: 8, ...(titleWant === undefined ? {} : { want: titleWant }) }),
  col('message', { size: 'fill', want: messageWant }),
  col('type', { width: '100px', size: 'fit', texts: ['Status update', 'Billing'], priority: 3 }),
  col('when', { width: '112px', size: 'fit', texts: ['19 days ago'], priority: 1 }),
];

test('Notifications at 320 columns: the title column shows its titles whole, taken from Message\'s spare cells', () => {
  const base = planTerm(notifications(undefined), 300, cellWidth);
  expect(base.cells.title!).toBeLessThan(59); // the cap: the fault
  const p = planTerm(notifications(59), 300, cellWidth);
  expect(p.cells.title!).toBeGreaterThanOrEqual(59);
  expect(p.cells.message!).toBeGreaterThanOrEqual(110);
  expect(p.visible).toEqual(base.visible);
  expect(sum(p)).toBe(sum(base));
});

test('slack only: with Message itself cut, the title takes nothing from it', () => {
  const p = planTerm(notifications(59, 400), 140, cellWidth);
  const base = planTerm(notifications(undefined, 400), 140, cellWidth);
  expect(p.cells.message!).toBeGreaterThanOrEqual(Math.min(base.cells.message!, 400) - 6); // only Level's px padding may move
  expect(p.cells.message!).toBeLessThan(400);
  expect(sum(p)).toBe(sum(base));
});

// Apps: Name is pinned with no size; State, Opens in and Action are px columns.
const apps = (name?: number): TermColumn[] => [
  col('name', { pinned: true, ...(name === undefined ? {} : { want: name }) }),
  col('state', { width: '160px', want: 15 }),
  col('opens', { width: '110px', priority: 2, want: 8 }),
  col('action', { width: '150px', priority: 1, want: 15 }),
];

test('Apps at 240 columns: Name no longer takes every spare cell; the row is shared', () => {
  const base = planTerm(apps(undefined), 212, cellWidth);
  expect(base.cells.name!).toBeGreaterThan(140); // the fault: names, then 120+ empty cells
  const p = planTerm(apps(22), 212, cellWidth);
  expect(p.cells.name!).toBeGreaterThanOrEqual(22 + TERM_TEXT_SLACK);
  expect(p.cells.name!).toBeLessThan(100);
  for (const id of ['state', 'opens', 'action']) expect(p.cells[id]!).toBeGreaterThan(base.cells[id]!);
  expect(p.visible).toEqual(base.visible);
  expect(sum(p)).toBe(sum(base));
});

test('at 80 and 120 columns nothing moves: a text column within its need and slack keeps its cells', () => {
  for (const room of [60, 70, 92]) {
    const p = planTerm(apps(22), room, cellWidth);
    const base = planTerm(apps(undefined), room, cellWidth);
    // Name may still take slack while cut (growFixed); nothing is shared out, so no other column gains a cell.
    expect(p.cells.name!).toBeLessThanOrEqual(22 + TERM_TEXT_SLACK);
    for (const id of p.visible) if (id !== 'name') expect(p.cells[id]!).toBeLessThanOrEqual(base.cells[id]!);
    expect(p.visible).toEqual(base.visible);
    expect(sum(p)).toBe(sum(base));
  }
});

test('a text column with no known need keeps everything; a lone column keeps everything', () => {
  expect(planTerm(apps(undefined), 212, cellWidth).cells.name!).toBeGreaterThan(140);
  const one = planTerm([col('name', { pinned: true, want: 10 })], 200, cellWidth);
  expect(one.cells.name!).toBeGreaterThan(190);
});

// Support's rule stays: Subject still takes the px columns' slack when cut, and on a wide screen shares.
test('Support stays right: a cut Subject still grows at 100; at 200 it holds its whole subject and more', () => {
  const support = (subject?: number): TermColumn[] => [
    col('subject', { pinned: true, ...(subject === undefined ? {} : { want: subject }) }),
    col('category', { width: '140px', priority: 3, want: 12 }),
    col('status', { width: '180px', priority: 1, want: 21 }),
    col('last', { width: '140px', priority: 2, want: 10 }),
  ];
  expect(planTerm(support(40), 100, cellWidth).cells.subject!).toBeGreaterThan(planTerm(support(undefined), 100, cellWidth).cells.subject!);
  const wide = planTerm(support(40), 190, cellWidth);
  expect(wide.cells.subject!).toBeGreaterThanOrEqual(40 + TERM_TEXT_SLACK);
  expect(wide.cells.status!).toBeGreaterThanOrEqual(21);
});

// Notifications at 120x40: Message drew 15 cells ("Your payment f…") while When held its
// 112 px floor (14 cells) for "19 days ago" (11) and Level its 56 px for one mark. The row has no other spare cell: the
// title sits at its 240 px minimum and Kind at its words.
test('Notifications at 120 columns: a cut Message takes the cells px floors hold above their words', () => {
  const titles = ['Computer atlas stopped', 'Payment received for borealis', 'Server cedar rental ends in 3 days', 'Storage share granite expires tomorrow'];
  const cols = (message?: number): TermColumn[] => [
    col('severity', { label: 'Level', width: '56px', priority: 1, want: 1 }),
    col('title', { label: 'Notice', pinned: true, minWidth: 240, size: 'fit', texts: titles, fitPad: 8, want: 38 }),
    col('message', { label: 'Message', size: 'fill', ...(message === undefined ? {} : { want: message }) }),
    col('type', { label: 'Kind', width: '100px', size: 'fit', texts: ['Status update', 'Billing', 'Maintenance'], priority: 3, want: 13 }),
    col('when', { label: 'When', sortable: true, width: '112px', size: 'fit', texts: ['19 days ago'], priority: 1, want: 11 }),
  ];
  const p = planTerm(cols(130), 84, cellWidth, 'when');
  expect(p.cells.message!).toBeGreaterThanOrEqual(20);
  expect(p.cells.when!).toBeGreaterThanOrEqual(11); // its words whole
  expect(p.cells.type!).toBeGreaterThanOrEqual(13);
  expect(p.cells.title!).toBeGreaterThanOrEqual(30); // its 240 px minimum holds
  expect(p.cells.severity!).toBeGreaterThanOrEqual(5); // its header
  expect(p.visible).toEqual(['severity', 'title', 'message', 'type', 'when']);
  expect(sum(p)).toBe(84);
});
