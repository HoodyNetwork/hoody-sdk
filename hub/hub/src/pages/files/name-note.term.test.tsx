// Files, Browse at 80x24 (fixture `many`): the folder "copy" carries the note "Can't open here yet". After a refetch
// (Refresh, or the page's own reload) the table's measured wants start over; the name cells must measure again, else
// Name loses the cells it had grown and the note is cut ("Can't open…") while Kind keeps cells its words never use
// (the terminal table contract).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const row = (f: string) => f.split('\n').find((l) => l.includes('copy')) ?? '';

test('80x24: the note stays whole after a refresh', async () => {
  s = await renderPage({ page: 'files', fx: 'many', cols: 80, rows: 24 });
  await s.settle();
  expect(row(s.frame)).toContain("Can't open here yet");
  const lines = s.frame.split('\n');
  const y = lines.findIndex((l) => l.includes('Refresh'));
  await s.click(lines[y]!.indexOf('Refresh') + 1, y);
  await s.settle();
  expect(row(s.frame)).toContain("Can't open here yet");
  expect(s.failures).toEqual([]);
}, 180_000);
