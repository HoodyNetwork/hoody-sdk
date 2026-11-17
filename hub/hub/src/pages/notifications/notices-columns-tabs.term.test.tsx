// Two terminal layout pins.
// 1. Notices at 80x24: the same notice title repeats ("Outgoing spam reported from your server"), and only the server
//    tells those rows apart. When the table is short of cells, Updated goes before Server (parts/Notices.tsx priorities).
// 2. The view tabs (Inbox, Notices, Get notified) sit on the same line on every view: Get notified's header is closed
//    by its tabs as the Inbox's is, with no blank line between the subtitle and the tabs (parts/Learn.tsx tabsFollow).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import ns from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

async function until(ok: (frame: string) => boolean, tries = 50): Promise<string> {
  let frame = await s!.settle();
  for (let i = 0; i < tries && !ok(frame); i++) {
    await new Promise((r) => setTimeout(r, 100));
    frame = await s!.settle();
  }
  return frame;
}

test('80x24: the Notices table keeps the Server column', async () => {
  s = await renderPage({ page: 'notifications', path: '/notifications/notices', cols: 80, rows: 24 });
  const frame = await until((f) => f.includes('Outgoing spam reported'));
  const head = frame.split('\n').find((l) => l.includes(ns['an.col.title']) && l.includes(ns['an.col.status']));
  expect(head, frame).toBeDefined();
  expect(head).toContain(ns['an.col.server']);
  expect(s.failures).toEqual([]);
}, 240_000);

const tabsLine = (frame: string) =>
  frame.split('\n').findIndex((l) => l.includes(ns['h.tab.inbox']) && l.includes(ns['h.tab.notices']) && l.includes(ns['h.tab.learn']));

test('120x40: the tabs are on the same line on Get notified as on the Inbox', async () => {
  s = await renderPage({ page: 'notifications', cols: 120, rows: 40 });
  const inbox = tabsLine(await until((f) => f.includes('Computer atlas stopped')));
  s.close();
  s = await renderPage({ page: 'notifications', path: '/notifications/learn', cols: 120, rows: 40 });
  const learnFrame = await until((f) => f.includes(ns['h.tab.learn']) && tabsLine(f) > 0);
  expect(inbox).toBeGreaterThan(0);
  expect(tabsLine(learnFrame), learnFrame).toBe(inbox);
  expect(s.failures).toEqual([]);
}, 240_000);
