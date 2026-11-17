// Customize in a terminal says where the layout really is: the session's memory, gone when the Hub closes
// (parts/customizeWords.term.ts), never "Saved in this browser.". The "Add a web widget" form is left out
// (widgets/AddWidget.term.tsx): a terminal card cannot draw a web page, so the form's promise could not be kept.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: terminal wording, no web-widget form`, async () => {
    s = await renderPage({ page: 'home', path: '/home?customize=1', cols, rows });
    const frame = await s.settle();
    expect(s.failures).toEqual([]);
    const flat = frame.replace(/[│┃║]/g, ' ').replace(/\s+/g, ' ');
    expect(flat).not.toContain('this browser');
    expect(flat).not.toContain('Add a web widget');
    expect(flat).not.toContain('new tab');
    // The drawer's subtitle wraps beside the page behind it, so its words are matched in reading order.
    expect(flat).toMatch(/Kept until[^.]*you[^.]*close[^.]*the Hub\./);
  }, 120_000);
}
