// A draft URL opened cold (another tab's draft): the flow's whole-page state ("This draft can't be opened here") drew its
// "New script" heading at column 0 while the rest of the page keeps the one-cell gutter (80 columns, the page just opened).
// The state's root is now the kit's PageFrame, as ComputerRequired's is, so the header sits in the page gutter.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: the gone-draft state's header keeps the page gutter`, async () => {
    s = await renderPage({ page: 'scripts', path: '/scripts/new/shotaaaaaa', cols, rows });
    const frame = await s.settle();
    expect(frame).toContain("This draft can't be opened here");
    const line = frame.split('\n').find((l) => /New script/.test(l));
    expect(line).toBeDefined();
    expect(line!.indexOf('New script')).toBeGreaterThanOrEqual(1);
    expect(s.trapsAt).toEqual([]);
    expect(s.failures).toEqual([]);
  }, 240_000);
}
