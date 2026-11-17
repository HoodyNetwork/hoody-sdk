// Account > Security summary in the terminal: with more sessions than the first page
// holds, the line says "N+", never a total the page did not read (live: "49 other …" beside 266 sessions).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[120, 40], [80, 24]] as const) test(`summary at ${cols}x${rows}: "N+" when more sessions exist`, async () => {
  s = await renderPage({ page: 'account', fx: 'sessions-more', cols, rows });
  const text = (await s.settle()).replace(/\s+/g, ' ');
  expect(s.failures).toEqual([]);
  expect(text).toMatch(/\d+\+ other browsers or devices are signed in\./);
  expect(text).toContain('Review');
}, 240_000);
