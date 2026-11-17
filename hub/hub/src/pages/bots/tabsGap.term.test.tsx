// Bots on a tall terminal: the tab strip (kit Tabs with no panel; the page draws the tab's
// content itself) grew with the pane and pushed the content down: 12 blank rows above "At a glance" at 240x67, 24 at
// 320x90, and the same above Activity. The strip is its own rows; the content starts right under it.
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';

type S = Awaited<ReturnType<typeof renderPage>>;
let s: S | null = null;
afterEach(() => { s?.close(); s = null; });

const SEL = 'sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const CASES = [
  { name: 'Link and keys', path: `/bots?${SEL}&tab=link`, first: 'At a glance' },
  { name: 'Activity', path: `/bots?${SEL}`, first: 'Hide task updates' },
] as const;

// 160x45: Link and keys only (Activity opens at the log's end there, the strip scrolled above the screen); since the log
// keeps a blank row between its turns it is taller than 67 rows too, so Activity is read at 320x90.
const SIZES = (name: string): Array<[number, number]> => (name === 'Activity' ? [[320, 90]] : [[240, 67], [320, 90], [160, 45]]);
for (const c of CASES) for (const [cols, rows] of SIZES(c.name)) {
  test(`${c.name}: content starts under the tab strip at ${cols}x${rows}`, async () => {
    s = await renderPage({ page: 'bots', path: c.path, cols, rows, settleMs: 3000 });
    const end = performance.now() + 30_000;
    while (!s.frame.includes(c.first) && performance.now() < end) { await new Promise((r) => setTimeout(r, 250)); await s.settle(); }
    const lines = s.frame.split('\n');
    const strip = lines.findIndex((l) => /Activity\s+.*Link and keys\s+Chat apps/.test(l));
    const first = lines.findIndex((l) => l.includes(c.first));
    expect(strip, s.frame).toBeGreaterThanOrEqual(0);
    expect(first, s.frame).toBeGreaterThan(strip);
    // the strip's rule line, the pane's top padding, and nothing else
    expect(first - strip, s.frame).toBeLessThanOrEqual(4);
    expect(s.trapsAt).toEqual([]);
  }, 180_000);
}
