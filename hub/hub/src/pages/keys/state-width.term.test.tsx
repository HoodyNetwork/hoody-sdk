// The State column asked for 280px: its width alone pushed Ends out at 120 columns and Works in and Key out at 80,
// for a cell that holds one short word. It asks for a small width now, so those columns stay (Access, priority 4,
// still gives way first at 120). At 80 the key's prefix gives way before its end date: Ends tells the keys apart.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const CASES = [
  { cols: 120, rows: 40, want: ['State', 'Works in', 'Ends'] },
  { cols: 80, rows: 24, want: ['State', 'Works in', 'Ends'] },
] as const;

for (const c of CASES) {
  test(`${c.cols}x${c.rows}: State keeps its neighbours`, async () => {
    s = await renderPage({ page: 'keys', cols: c.cols, rows: c.rows, path: '/keys?state=active' });
    const lines = (await s.settle()).split('\n');
    const header = lines.find((l) => l.includes('Name ↑')) ?? '';
    for (const w of c.want) expect(header).toContain(w);
    expect(s.failures).toEqual([]);
  }, 240_000);
}
