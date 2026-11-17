// The vault's realm note is one line at 80x24: two paragraphs of prose above the stats pushed the
// list to row 11. The note keeps its fact (the entries are this realm's; other realms and Global have their own: the
// Questions answer the rest) in one row, so the list starts higher on a small terminal.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('the realm note fits one row at 80x24 and the list header follows it', async () => {
  s = await renderPage({ page: 'vault', cols: 80, rows: 24 });
  const rows = (await s.settle()).split('\n');
  const at = rows.findIndex((r) => r.includes('These entries belong to Personal.'));
  expect(at).toBeGreaterThan(-1);
  expect(rows[at]).toContain('Global');
  expect(rows[at + 1]).not.toMatch(/^\s*Global\b|different entry|their own/);
  expect(rows.findIndex((r) => /Name ↑/.test(r))).toBeLessThanOrEqual(9);
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 240_000);
