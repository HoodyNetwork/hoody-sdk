// Compact ErrorState: the web draws one line (.compact: icon, the words, "·", Try again, Details, gap sp-2). The
// terminal's wrapping row put "Try again" after the sentence, then a blank gap row, then "Details" alone (seen on
// billing balance-failed at 80x24). Now: the words wrap in their own column, the actions stay together on the first
// line one cell apart, and no blank row is drawn.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, Text } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { ErrorState } from './States';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const draw = async (node: React.ReactNode, w: number, h = 8) => { t = await drawTest(<FocusRoot><OverlayHost>{node}</OverlayHost></FocusRoot>, { width: w, height: h }); return (await t.settle()).split('\n').map((l) => l.trimEnd()); };
const used = (rows: string[]) => { let n = rows.length; while (n > 0 && rows[n - 1] === '') n--; return rows.slice(0, n); };

for (const w of [80, 120]) {
  test(`at ${w} columns: Try again and Details together on the first line, one cell apart; no blank row`, async () => {
    const rows = used(await draw(<ErrorState size="compact" title="Balance unavailable" onRetry={() => {}} error={{ status: 0 }} />, w));
    expect(rows[0]).toContain('Balance unavailable');
    expect(rows[0]).toMatch(/· Try again Details$/);
    expect(rows.filter((r) => r === '')).toEqual([]);
    expect(rows.join(' ')).toContain('No answer from the server');
  });
}

test('extra actions sit in the same group, one cell apart', async () => {
  const rows = used(await draw(<ErrorState size="compact" title="Couldn't load" onRetry={() => {}} secondary={<Text>[Open logs]</Text>} />, 80));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatch(/Couldn't load +· Try again \[Open logs\]$/);
});
