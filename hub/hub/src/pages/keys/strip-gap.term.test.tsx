// The API keys tab (its list scrolls itself) closes the tab strip with one blank row, or the notice under it when there
// is one (never a blank between the strip's rule and its notice), as the kit's page layouts place their strips; a short
// terminal (24 rows) keeps the rows for the content and draws no blank.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const after = (lines: string[], re: RegExp): string => {
  const i = lines.findIndex((l) => re.test(l));
  expect(i, `no line matching ${re}`).toBeGreaterThan(-1);
  return lines[i + 1]!;
};
const blank = (l: string): boolean => /^\s*$/.test(l.replace(/^.*│/, "").replace(/█/g, ""));
const rule = /^(.*│)?\s+─{10,}/;

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  const tall = rows >= 30;
  test(`${cols}x${rows}: API keys: the notice follows the rule, then ${tall ? 'one blank row' : 'no blank row'}`, async () => {
    s = await renderPage({ page: 'keys', cols, rows });
    const lines = (await s.settle()).split('\n');
    expect(after(lines, rule)).toContain('Keys that work in');
    expect(blank(after(lines, /Keys that work in/))).toBe(tall);
  }, 180_000);

  // A page-scrolling tab (SSH keys): its body padding is the one gap under the rule, never a second one.
  test(`${cols}x${rows}: SSH keys: one blank row under the rule, not two`, async () => {
    s = await renderPage({ page: 'keys', path: '/keys/ssh', cols, rows });
    const lines = (await s.settle()).split('\n');
    const i = lines.findIndex((l) => rule.test(l));
    expect(blank(lines[i + 1]!)).toBe(true);
    expect(blank(lines[i + 2]!)).toBe(false);
  }, 180_000);
}
