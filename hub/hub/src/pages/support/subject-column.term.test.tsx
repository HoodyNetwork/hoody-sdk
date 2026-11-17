// Support's ticket list: an unread ticket's dot no longer pushes its subject right. A read row keeps
// the dot's place, so every subject starts in one column, at both sizes; the unread mark itself stays.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`subjects start in one column, unread or read (${cols}x${rows})`, async () => {
    s = await renderPage({ page: 'support', cols, rows });
    const lines = (await s.settle()).split('\n');
    const unread = lines.find((l) => l.includes('Computer will not start'));
    const read = lines.find((l) => l.includes('Invoice shows the wrong country'));
    expect(unread).toBeDefined();
    expect(read).toBeDefined();
    expect(unread!).toMatch(/• Computer will not start/);
    expect(read!.indexOf('Invoice shows')).toBe(unread!.indexOf('Computer will not start'));
    expect(s.trapsAt).toEqual([]);
    expect(s.failures).toEqual([]);
  }, 240_000);
}
