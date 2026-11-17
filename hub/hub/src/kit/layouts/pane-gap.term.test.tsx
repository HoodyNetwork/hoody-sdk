// A detail pane beside the list: one clear cell on each side of the rule between them. The list's toolbar end and the
// pane's title never touch it ("View options│boreal-1"), at every width.
import { expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';

const frame = async (path: string, cols: number, rows: number): Promise<string[]> => {
  const s = await renderPage({ page: 'demo', cols, rows, path });
  try { return (await s.settle()).split('\n').map((l) => l.trimEnd()); } finally { s.close(); }
};

for (const [cols, rows] of [[200, 50], [320, 90]] as const) {
  test(`side inspector at ${cols}x${rows}: "View options │ boreal-1"`, async () => {
    const lines = await frame('/demo?mode=side&sel=item-02', cols, rows);
    const row = lines.find((l) => l.includes('View options') && l.includes('boreal-1'));
    expect(row).toMatch(/View options │ boreal-1/);
    // The inspector's body keeps the same start as its title.
    const col = row!.indexOf('boreal-1');
    expect(lines.find((l) => l.includes('Ben Okafor') && l.indexOf('Ben Okafor', col - 1) === col)).toBeDefined();
  }, 180_000);

  test(`fill detail at ${cols}x${rows}: the title starts one cell after the rule`, async () => {
    const lines = await frame('/demo?sel=item-02', cols, rows);
    expect(lines.find((l) => l.includes('boreal-1') && l.includes('Active'))).toMatch(/│ boreal-1/);
  }, 180_000);
}
