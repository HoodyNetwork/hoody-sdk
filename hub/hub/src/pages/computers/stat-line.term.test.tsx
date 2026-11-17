// Computers, the summary above the list: one line in the terminal (parts/StatStrip.term.tsx). The kit strip drew it on
// three rows (label, number, detail), which at 80x24 left the first screen with three computers.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: the counts and the servers share one line; the number never runs into the detail`, async () => {
    s = await renderPage({ page: 'computers', cols, rows });
    const lines = (await s.settle()).split('\n');
    const line = lines.find((l) => l.includes('4 running')) ?? '';
    expect(line).toContain('Computers 8 · 4 running · 2 stopped · 1 failed · 1 starting');
    // The parts add up to the total: the starting computer is counted.
    expect(line).toContain('Servers 3');
    expect(s.failures).toEqual([]);
  }, 180_000);
}

// The third stat: a server near its room limit (fixture slotsNear: 7 of 8) shows "Slots 7 of 8" and the upgrade link.
// It does not fit beside the first two: it wraps WHOLE onto the next line (never cut mid-stat).
for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: slots and the upgrade link are on screen, whole`, async () => {
    s = await renderPage({ page: 'computers', cols, rows, fx: 'slotsNear' });
    const lines = (await s.settle()).split('\n');
    const line = lines.find((l) => l.includes('Slots')) ?? '';
    // Near the limit the link is the kit's worded button ("Running low: Get more room"). Beside the first two stats
    // the three need 102 cells, more than either size gives the page, so the third takes the next line at both.
    expect(line).toContain('Slots 7 of 8 · ');
    expect(line).toContain('Get more room]');
    expect(line).not.toContain('Servers');
    expect(lines.some((l) => l.includes('Computers 8 · 4 running · 2 stopped · 1 failed · 1 starting') && l.includes('Servers 3'))).toBe(true);
    expect(s.failures).toEqual([]);
  }, 180_000);
}
