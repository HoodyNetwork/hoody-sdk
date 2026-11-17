// The keys header (title, lede, tab strip) sat 2 cells right of the API keys table's toolbar: keys.module.css pads its
// frame with var(--pad-page) (24px, read as 2 cells) while the kit's terminal page shells draw a 1-cell gutter. The
// translator now reads --pad-page as the kit's gutter (scripts/term/css-translate/tokens.ts TERM_TOKENS), as on the web
// where both are --pad-page.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const col = (frame: string, re: RegExp): number => {
  const line = frame.split('\n').find((l) => re.test(l));
  expect(line ?? `(no line matching ${re})`).toMatch(re);
  return line!.search(re);
};

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: the page title, the tab strip and the table toolbar start on one column`, async () => {
    s = await renderPage({ page: 'keys', cols, rows });
    const frame = await s.settle();
    const title = col(frame, /Keys and tokens(?!\s+◆)/);
    const tabs = col(frame, /(▸ )?API keys/);
    const search = col(frame, /\/ Search/);
    expect(title).toBe(search);
    expect(tabs).toBe(search);
    expect(s.trapsAt).toEqual([]);
  }, 240_000);
}
