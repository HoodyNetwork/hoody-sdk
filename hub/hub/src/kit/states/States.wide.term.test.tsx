// Full-size states on a wide screen, as the web draws them:
// | # | Web | Terminal | Test |
// |---|---|---|---|
// | B | ErrorState md is the centred .empty block (same as EmptyState md) | centred in its area, at most 72 cells, no border; sm stays a plain column | 'ErrorState md centred' |
// | C | Skeleton bars are percents of the skeleton's own box (title 40 %, rows 40-70 %, table cells across the width) | bars sized from the measured box, not min(72, terminal - 30) | 'Skeleton fills its box' |
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { ErrorState, Skeleton } from './States';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const draw = async (node: React.ReactNode, w: number, h = 20) => { t = await drawTest(<FocusRoot><OverlayHost>{node}</OverlayHost></FocusRoot>, { width: w, height: h }); await new Promise((r) => setTimeout(r, 200)); return (await t.settle()).split('\n'); };
const lead = (l: string) => l.length - l.trimStart().length;

test('ErrorState md centred: at 200 columns its title starts near the middle, its words stay within 72 cells', async () => {
  const rows = await draw(<Box dir="column" width={200}><ErrorState title="Couldn't load your referrals" body="No answer from the server. Check your connection, then try again." onRetry={() => {}} /></Box>, 200);
  const title = rows.find((r) => r.includes("Couldn't load your referrals"))!;
  expect(lead(title)).toBeGreaterThan(50);
  for (const r of rows.filter((x) => x.trim())) expect(r.trimEnd().length - lead(r)).toBeLessThanOrEqual(72);
});

test('ErrorState sm stays a plain column at the start', async () => {
  const rows = await draw(<Box dir="column" width={200}><ErrorState size="sm" title="Couldn't load" onRetry={() => {}} /></Box>, 200);
  expect(lead(rows.find((r) => r.includes("Couldn't load"))!)).toBe(0);
});

test('Skeleton fills its box: rows up to 70 % of a 200-cell box, table cells across it, a narrow box never overflows', async () => {
  let rows = await draw(<Box dir="column" width={200}><Skeleton rows={4} immediate /></Box>, 240, 20);
  const bars = rows.filter((r) => r.includes('▁')).map((r) => r.trim().length);
  expect(Math.max(...bars)).toBeGreaterThanOrEqual(130);
  for (const b of bars) expect(b).toBeLessThanOrEqual(200);
  t!.renderer.destroy();
  rows = await draw(<Box dir="column" width={200}><Skeleton variant="table" rows={2} columns={4} immediate /></Box>, 240, 12);
  const tr = rows.filter((r) => r.includes('▁'));
  // The last cell starts in the last fifth of the box (first cell flex 2, the rest flex 1).
  for (const r of tr) expect(r.lastIndexOf('  ▁') + 2).toBeGreaterThan(155);
  t!.renderer.destroy();
  rows = await draw(<Box dir="column" width={30}><Skeleton rows={3} variant="detail" immediate /></Box>, 120, 12);
  for (const r of rows.filter((x) => x.includes('▁'))) expect(r.trimEnd().length).toBeLessThanOrEqual(30);
});

// The web's skeleton is a block: beside a title in a row (a page header's meta, billing's balance while it loads) it is
// only as wide as its contents and its percent bars come to nothing. The terminal keeps it to its words there, on the
// title's line; it took the whole row before (100 % of the row), pushing the header onto four rows (PAGE-PROBLEMS 0113).
test('Skeleton beside a title in a row: the words on the title line, no bar, one row', async () => {
  const rows = await draw(<Box dir="row" width={78} gapX={2}><Box>Plans & Billing</Box><Skeleton variant="text" rows={1} immediate /></Box>, 80, 6);
  const used = rows.filter((r) => r.trim());
  expect(used).toHaveLength(1);
  expect(used[0]).toMatch(/^Plans & Billing {2}Loading…\s*$/);
  expect(rows.join('\n')).not.toContain('▁');
});
