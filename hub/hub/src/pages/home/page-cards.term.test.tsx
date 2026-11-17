// Home's page cards in a terminal: "Your computer", "Bots", "Billing" and "Notifications" are contributed by their pages
// (page.ts `widgets`) and read through kit useContributions, which the shell provides (shell/contributions.tsx). The
// terminal shell provided nothing, so every reader got none: Home drew only its own cards and Customize listed three.
//  1. Customize lists every contributed card with its switch.
//  2. Home draws "Your computer" (the computers page's card), and nothing traps or fails.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import computers from '../computers/strings.en.json';
import bots from '../bots/strings.en.json';
import billing from '../billing/strings.en.json';
import notifications from '../notifications/strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const CARDS = [computers['widget.title'], bots['widget.title'], billing['widget.title'], notifications['widget.title']];
function clean(): void {
  expect(s!.failures).toEqual([]);
  expect(s!.trapsAt).toEqual([]);
  expect(s!.placeholders.rendered).toEqual([]);
}

for (const [cols, rows] of [[120, 40], [200, 50]] as const) { // the whole list on one screen
  test(`${cols}x${rows}: Customize lists the cards other pages contribute, each with its switch`, async () => {
    s = await renderPage({ page: 'home', path: '/home?customize=1', cols, rows });
    const frame = await s.settle();
    clean();
    const lines = frame.split('\n');
    for (const title of CARDS) expect(lines.some((l) => l.includes(`] ${title}`)), title).toBe(true);
  }, 180_000);
}

test('200x50: Home draws the "Your computer" card', async () => {
  s = await renderPage({ page: 'home', cols: 200, rows: 50 });
  const frame = await s.settle();
  clean();
  expect(frame).toContain(computers['widget.title']);
}, 180_000);
