// The selection bar keeps its count whole. On Files at 120x40, with one folder ticked the
// bar read "1" / "select" / "ed" down three rows, because the count was the only part of the row allowed to shrink
// and three buttons stood beside it. The count never shrinks; the buttons go to the next line when the row is full.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`files ${cols}x${rows}: one ticked row reads "1 selected" on one line`, async () => {
    s = await renderPage({ page: 'files', fx: 'idle', path: '/files', cols, rows });
    await s.settle();
    const row = s.frame.split('\n').findIndex((l) => l.includes('[ ] ') && !l.includes('Name'));
    expect(row, s.frame).toBeGreaterThan(0);
    await s.click(s.frame.split('\n')[row]!.indexOf('[ ]') + 1, row);
    const f = await s.settle();
    expect(f, f).toContain('[x]');
    expect(f, f).toContain('1 selected');
    expect(f.split('\n').some((l) => /^\W*(select|ed)\W*$/.test(l)), f).toBe(false);
  }, 240_000);
}
