// Get notified -> Browser alerts in the terminal. A terminal has no browser alerts (its host gives no alertHost), so
// the web card's states are not true here: "Not set up in this browser" with a Turn on that asks a browser that is not
// there (the fixture default), or "secure (https)" (what a live terminal read, the `browser-insecure` state). The
// section says why in the terminal's words and hands off to the same page on the web (parts/BrowserCard.term.tsx,
// kit Handoff); its lead is the terminal's own (term/app/termWords.json, h.browser.what).
// The section is read from the semantics tree, from its heading to the next section's ("On your phone"): the tree
// holds what a scroll clips, and the rest of the page (the FAQ) may name a browser on its own.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { semanticsOf, semText } from '../../term/prim/semantics';
import termStrings from './parts/BrowserCard.term.strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

function browserSection(): string {
  const lines = semText(semanticsOf(s!.renderer as never)).split('\n');
  const start = lines.findIndex((l) => /^\s*heading(\[\d+\])? "Browser alerts"/.test(l));
  const end = lines.findIndex((l, i) => i > start && /^\s*heading(\[\d+\])? "On your phone"/.test(l));
  // Positive control: the Learn page drew the section and the one after it.
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return lines.slice(start, end).join('\n');
}

for (const fx of [null, 'browser-insecure'] as const) {
  test(`${fx ?? 'default'}: the Browser alerts section says a terminal cannot show alerts and hands off to the web`, async () => {
    s = await renderPage({ page: 'notifications', path: '/notifications/learn#browser', fx, cols: 120, rows: 40 });
    await s.settle();
    const section = browserSection();
    expect(section).not.toContain('secure (https)');
    expect(section).not.toContain('this browser');
    expect(section).not.toContain('Turn on browser alerts');
    expect(section).toContain(termStrings['term.alerts.reason']);
    expect(section).toContain('Copy link');
    expect(s.failures).toEqual([]);
  }, 180_000);
}
