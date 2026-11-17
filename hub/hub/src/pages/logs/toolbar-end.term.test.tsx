// Logs bar on a wide terminal: Live, Refresh and ⋯ end the bar's row, as on the web (the kit Toolbar's start side
// grows into the free room, and the page pushes the group to its end). The start side was content-sized, so the group
// stopped where the controls did: column 200 of 320, with "Around this moment" one row below at the real end.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[160, 45], [240, 67], [320, 90]] as const) {
  test(`${cols}x${rows}: the Live / Refresh group ends the row`, async () => {
    s = await renderPage({ page: 'logs', cols, rows });
    const lines = (await s.settle()).split('\n').map((l) => l.replace(/[\s█▀▄]+$/u, ''));
    const bar = lines.find((l) => l.includes('[Refresh]')) ?? '';
    const below = lines.find((l) => l.includes('[Around this moment]')) ?? '';
    expect(bar).toMatch(/Live \[Refresh\] \[⋯\]$/);
    expect(below).not.toBe('');
    // Both end at the page's right edge (the scrollbar column apart).
    expect(Math.abs([...bar].length - [...below].length)).toBeLessThanOrEqual(2);
    expect(s.failures).toEqual([]);
  }, 180_000);
}
