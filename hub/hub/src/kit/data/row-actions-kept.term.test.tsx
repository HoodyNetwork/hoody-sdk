// The page spacing (a blank row between a table's toolbar and its column head, from 30 rows up) never costs a table
// its row actions: on a table page with row actions (Demo), every drawn row keeps its trailing ⋯ at both sizes.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: Demo: every table row keeps its ⋯`, async () => {
    s = await renderPage({ page: 'demo', cols, rows });
    const lines = (await s.settle()).split('\n');
    const head = lines.findIndex((l) => /Name\s+Status/.test(l));
    expect(head).toBeGreaterThan(0);
    const body = lines.slice(head + 1).filter((l) => /\b[a-z]+-\d+\s+●/.test(l));
    expect(body.length).toBeGreaterThanOrEqual(10);
    for (const l of body) expect(l.trimEnd(), l.trim()).toMatch(/⋯[█░]?$/);
  }, 180_000);
}
