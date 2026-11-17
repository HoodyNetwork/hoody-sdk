// The rail's inset (the web's --rail-pad, RailPane.module.css .head, .navItem, and DataTable.module.css `.rail` toolbar,
// rows and group rows): one inset for everything from the rail's edge. The terminal drew the head at 1 cell, the strip's
// links at 1, the column links at 0 and the list (search, count, groups, rows) at 0. Now all of them start 1 cell in.
// The only rail is the AI tab's (pages/ai/parts/Pane.tsx), so it is the page under test, at both of its shapes.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

/** The column where `re` first matches on the first line holding it (the rail is the leftmost thing on those lines). */
const colOf = (frame: string, re: RegExp): number => {
  const line = frame.split('\n').find((l) => re.test(l));
  expect(line ?? `(no line matching ${re})`).toMatch(re);
  return line!.search(re);
};

for (const [cols, rows, edge] of [[80, 24, 0], [240, 67, 25]] as const) {
  test(`${cols}x${rows}: head, links and list start one cell inside the rail`, async () => {
    s = await renderPage({ page: 'ai', cols, rows });
    const frame = await s.settle();
    const inset = edge + 1;
    expect(colOf(frame, /▌✦ Chats/)).toBe(inset);
    expect(colOf(frame, /\/ Search/)).toBe(inset);
    expect(colOf(frame, /▾ Needs you/)).toBe(inset);
    // The head's button draws its own one-cell pad before its words, as the kit button does everywhere.
    expect(colOf(frame, /New chat/)).toBe(inset + 1);
    expect(s.failures).toEqual([]);
    expect(s.trapsAt).toEqual([]);
  }, 240_000);
}
