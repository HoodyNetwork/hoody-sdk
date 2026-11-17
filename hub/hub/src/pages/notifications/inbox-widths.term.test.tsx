// The inbox table at 80x24: thirteen rows fit. A filling table draws rows for a guessed height (20 lines) until it
// knows its own, then drops those that do not fit. A dropped row has no say in the column widths: whether it
// reported its title's width before it went was a matter of timing, so one tree drew two frames (the Notice column
// 42 cells wide, or 44 for a 43-cell title seven rows under the fold, with Level two cells narrower).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('80x24: the Notice column is as wide as the titles shown need, not a title under the fold', async () => {
  s = await renderPage({ page: 'notifications', fx: 'notices-page2-error', cols: 80, rows: 24 });
  const lines = (await s.settle()).split('\n');
  const h = lines.findIndex((l) => /\bLevel\b.*\bNotice\b.*\bWhen\b/.test(l));
  expect(h, lines.join('\n')).toBeGreaterThan(0);
  const head = lines[h]!;
  const from = head.indexOf('Notice'), to = head.indexOf('When');
  // The rows drawn under the header: their titles, as cut by the column.
  const titles = lines.slice(h + 1).filter((l) => l.includes('[ ]')).map((l) => l.slice(from, to).trimEnd());
  expect(titles.length).toBeGreaterThan(8);
  const widest = Math.max(...titles.map((x) => x.length));
  // Positive control: no shown title is cut (the column is not short of cells).
  expect(titles.some((x) => x.endsWith('…'))).toBe(false);
  // The widest shown title and the two cells between columns.
  expect(to - from).toBe(widest + 2);
  expect(s.failures).toEqual([]);
}, 240_000);
