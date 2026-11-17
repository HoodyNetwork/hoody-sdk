// A fixed-px column (the web's `width: '170px'`) whose content needs more cells than its px give (Bots Work State:
// "● Waiting for approval", 22 cells in 21) grows up to that need, terminal only, ONLY from slack: cells other columns
// hold above their own need. No column is pushed below its need; with no slack nothing moves (rule b).
import { expect, test } from 'bun:test';
import { cellWidth } from '../../term/prim/TableCells';
import { planTerm, TERM_TEXT_SLACK, type TermColumn } from './DataTableTermLayout';

const col = (id: string, o: Partial<TermColumn> = {}): TermColumn => ({ id, priority: 2, pinned: false, label: id, sortable: false, ...o });
// Bots Work: Task fills, Computer and State are px, Started fits its words.
const work = (task: number | undefined, state = 22): TermColumn[] => [
  col('task', { pinned: true, size: 'fill', ...(task === undefined ? {} : { want: task }) }),
  col('computer', { width: '160px', want: 5 }),
  col('state', { width: '170px', want: state }),
  col('started', { size: 'fit', texts: ['14 minutes ago'] }),
];

test('the px column grows to its content from a roomy column (200 cols)', () => {
  const p = planTerm(work(33), 180, cellWidth);
  // At least its need: on a screen this wide the task column also shares its surplus across the row (shareSurplus).
  expect(p.cells.state).toBeGreaterThanOrEqual(22);
  expect(p.cells.task).toBeGreaterThanOrEqual(33);
  expect(p.visible.reduce((n, id) => n + (p.widths[id] ?? 0), 0)).toBeLessThanOrEqual(180);
});

test('slack only: a donor never goes under its need; with no slack nothing moves', () => {
  for (const room of [80, 100, 120, 160]) {
    // The plan with no needs known (nothing moves in it): the baseline cells.
    const before = planTerm(work(undefined, 0), room, cellWidth);
    const p = planTerm(work(33), room, cellWidth);
    for (const id of p.visible) {
      if (id === 'state') continue;
      const need = id === 'task' ? 33 : id === 'computer' ? 5 : 14;
      // Only cells above a column's need may leave it.
      expect(p.cells[id]).toBeGreaterThanOrEqual(Math.min(before.cells[id] ?? 0, need));
    }
    // Growing stops at its need; only a wide row's shared surplus (task above its need + TERM_TEXT_SLACK) adds more.
    if ((p.cells.task ?? 0) <= 33 + TERM_TEXT_SLACK) expect(p.cells.state).toBeLessThanOrEqual(22);
    expect(p.visible).toEqual(before.visible);
  }
  // Every other column at its need: nothing to take.
  const tight = planTerm([col('a', { size: 'fill', want: 400 }), col('s', { width: '80px', want: 30 })], 40, cellWidth);
  const base = planTerm([col('a', { size: 'fill', want: 400 }), col('s', { width: '80px' })], 40, cellWidth);
  expect(tight.cells).toEqual(base.cells);
});

test('a column with no known need gives nothing; a px column never shrinks for it', () => {
  const p = planTerm([col('a', { size: 'fill' }), col('s', { width: '80px', want: 30 })], 120, cellWidth);
  const base = planTerm([col('a', { size: 'fill' }), col('s', { width: '80px' })], 120, cellWidth);
  expect(p.cells).toEqual(base.cells);
});

// Support tickets at 120x40: Subject (pinned, unsized) was cut to 22 cells while Category (140px), Status
// (180px) and Last message (140px) held cells above what their words need. A cut text column takes that slack.
const support = (subject: number | undefined): TermColumn[] => [
  col('subject', { pinned: true, ...(subject === undefined ? {} : { want: subject }) }),
  col('category', { width: '140px', priority: 3, want: 12 }),
  col('status', { width: '180px', priority: 1, want: 21 }),
  col('last', { width: '140px', priority: 2, want: 10 }),
];

test('a cut text column takes the slack fixed columns hold above their need, never more than its want', () => {
  for (const room of [84, 88, 100]) {
    const base = planTerm(support(undefined), room, cellWidth);
    const p = planTerm(support(40), room, cellWidth);
    expect(p.visible).toEqual(base.visible);
    expect(p.cells.subject!).toBeGreaterThan(base.cells.subject!);
    expect(p.cells.subject!).toBeLessThanOrEqual(Math.max(40, base.cells.subject!));
    expect(p.cells.category!).toBeGreaterThanOrEqual(12);
    expect(p.cells.status!).toBeGreaterThanOrEqual(21);
    expect(p.cells.last!).toBeGreaterThanOrEqual(10);
    expect(p.visible.reduce((n, id) => n + (p.widths[id] ?? 0), 0)).toBe(base.visible.reduce((n, id) => n + (base.widths[id] ?? 0), 0));
  }
  // A text column already showing its whole want takes nothing.
  const whole = planTerm(support(8), 100, cellWidth);
  expect(whole.cells).toEqual(planTerm(support(undefined), 100, cellWidth).cells);
});
