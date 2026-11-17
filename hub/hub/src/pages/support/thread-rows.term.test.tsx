// A ticket's thread in the smallest frame. The line saying what happens next ("Reply within 30 days of closing to
// open it again.") is drawn with the reply box, which stays in view, so 80 columns show it as 120 do.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

/** T_CLOSED of the fixtures: "How do I add a domain?", closed, a reply opens it again; two messages. */
const CLOSED = '0000000000000000' + (0x6720a1b2 + 3).toString(16);

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`the what-next line is drawn with the reply box (${cols}x${rows})`, async () => {
    s = await renderPage({ page: 'support', fx: null, cols, rows, path: `/support?sel=${CLOSED}` });
    const lines = (await s.settle()).split('\n');
    const next = lines.findIndex((l) => l.includes('Reply within 30 days of closing to open it again.'));
    const reply = lines.findIndex((l) => l.includes('Your reply'));
    expect(next).toBeGreaterThan(-1);
    expect(reply).toBeGreaterThan(next);
    expect(reply - next).toBeLessThanOrEqual(2);
    expect(s.failures).toEqual([]);
  }, 240_000);
}
