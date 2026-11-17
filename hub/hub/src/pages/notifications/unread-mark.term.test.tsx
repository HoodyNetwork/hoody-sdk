// The terminal Inbox tells unread from read at a glance, as the web's row edge does: every row of the inbox (all unread
// in the fixture) draws the kit's row mark "•" after the cursor bar; no row of the archive (all read) does.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

/** The fixture's notice titles (fixtures.ts), so a row is told from the page's other lines. */
const TITLE = /Computer \S+ stopped|Payment received for|rental ends in 3 days|Computer \S+ is running|Planned maintenance for|Renewal coming up for|Storage share \S+ expires tomorrow|Hoody news:/;
const rowLines = (frame: string) => frame.split('\n').filter((l) => TITLE.test(l));

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  // Catches the rows' mark dropped in the terminal: an unread row looked like a read one.
  test(`${cols}x${rows}: every inbox row is marked unread, no archive row is`, async () => {
    s = await renderPage({ page: 'notifications', cols, rows });
    const inbox = rowLines(await s.settle());
    expect(inbox.length).toBeGreaterThan(2);
    for (const l of inbox) expect(l).toContain('•');
    expect(s.failures).toEqual([]);
    s.close();
    s = await renderPage({ page: 'notifications', cols, rows, path: '/notifications?box=archive' });
    const archive = rowLines(await s.settle());
    expect(archive.length).toBeGreaterThan(2);
    for (const l of archive) expect(l).not.toContain('•');
    expect(s.failures).toEqual([]);
  }, 240_000);
}
