// AI Memory, the projects table: the Project cell is two stacked lines on the web (the name; its folder) in a taller
// row. Each row takes as many lines as its cell holds: a one-line row would drop the folder line and cut every name ("shop…",
// "Every project…") while half the column stays empty. As on
// the web: a name that fits its column is never cut, and its folder is on the line under it.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../../../scripts/term/render';
import { awaitText } from '../../../../../scripts/term/wait-text';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: a project name with room in its column is not cut; its folder is under it`, async () => {
    s = await renderPage({ page: 'ai', path: '/ai/knowledge/memory', cols, rows });
    // Memory is a lazy view inside the AI page (tab.tsx) whose import settle does not count: after an earlier file
    // loaded the AI page, settle can return on its Skeleton. Wait for the table, as a shot's wait text does.
    let frame = await s.settle();
    const page = s;
    await awaitText({ settle: async () => { frame = await page.settle(); } }, () => frame.includes('Memories'), { ms: 20_000 });
    const lines = frame.split('\n');
    expect(lines.some((l) => l.includes('Memories'))).toBe(true);
    expect(lines.filter((l) => /\b(shop|Every project)…/.test(l))).toEqual([]);
    const shop = lines.findIndex((l) => /\bshop\b/.test(l) && /\s2\s+1\b/.test(l));
    expect(shop).toBeGreaterThan(0);
    expect(lines[shop + 1]).toContain('/home/ada/projects/shop');
    const every = lines.findIndex((l) => l.includes('Every project'));
    expect(lines[every + 1]).toContain('Lessons and slots');
    expect(s.failures).toEqual([]);
  }, 180_000);
}
