// Bare metal list: every machine shows its price, whole, at every width. Two faults, both at widths between the two
// golden sizes:
// - cut: "$228 for 30 days" is 16 cells and the From column's floor is 14, so where the columns were tight the price
//   lost its end ("$228 for 30 da…": 88, 102 and 112 columns). The column is `cut: 'never'` now: it takes its widest
//   value and the text columns beside it give way.
// - dropped: Location, Memory and From were all priority 1, and among equals the column furthest right drops first
//   (kit/data/DataTableLayout planColumns), so at 100 columns the list kept Memory and showed no price at all. Memory
//   now gives way before the price.
import { expect, test } from 'bun:test';
import { renderPage } from '../../../../scripts/term/render';

async function list(cols: number, rows: number): Promise<string[]> {
  const s = await renderPage({ page: 'billing', cols, rows, path: '/billing?view=servers' });
  try {
    let lines = (await s.settle()).split('\n');
    // The listings arrive after the first frame: wait for the table (its Location column is in it at every width).
    for (let i = 0; i < 40 && !lines.some((l) => /\bDE Falkenstein\b/.test(l)); i++) { await new Promise((r) => setTimeout(r, 100)); lines = (await s.settle()).split('\n'); }
    return lines;
  } finally { s.close(); }
}

for (const [cols, rows] of [[80, 24], [88, 30], [100, 30], [102, 30], [112, 40], [120, 40]] as const) {
  test(`${cols}x${rows}: every listed machine shows its whole price`, async () => {
    const lines = await list(cols, rows);
    const machines = lines.filter((l) => /\b(DE|JP|SG|US) [A-Z][a-z]+/.test(l));
    expect(machines.length).toBeGreaterThan(2);
    for (const l of machines) expect(l).toMatch(/\$\d+ for \d+ days(?!…)\s|Not for sale/);
    expect(lines.filter((l) => /\$\d+ for [^│]*…/.test(l))).toEqual([]);
  }, 120_000);
}

test('80x24 and 120x40 keep the columns they had: Memory beside the price, Cores from 120', async () => {
  const head = (lines: string[]) => (lines.find((l) => /\bServer\b.*\bLocation\b/.test(l)) ?? '').replace(/\s+/g, ' ');
  expect(head(await list(80, 24))).toMatch(new RegExp('Server Location RAM From'));
  expect(head(await list(120, 40))).toMatch(new RegExp('Server Location Cores RAM From'));
}, 120_000);
