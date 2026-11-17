// The Keys title is on the first row under the top bar, as on every other page. Keys has a frame of its own
// (parts/Frame.tsx) whose header keeps 16px above it on the web (keys.module.css .frameHead); in a terminal that was
// one blank row above the title, on a page with 22 rows at 80x24. The terminal's value is a row of
// scripts/term/css-translate/term-decls.ts.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: the title is on the row under the top bar`, async () => {
    s = await renderPage({ page: 'keys', cols, rows });
    const lines = (await s.settle()).split('\n');
    expect(lines[0]).toContain('HOODY');
    expect(lines[1]).toContain('Keys and tokens');
    expect(s.failures).toEqual([]);
  }, 180_000);
}
