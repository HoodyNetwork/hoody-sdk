// Notifications' inbox at 120x40 gives the Message column room for a phrase: it got 19 cells beside
// Kind's 14, every message cut after two or three words. With a 192 px floor on Message, Kind leaves first.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('at 120x40 the Message column has at least 28 cells', async () => {
  s = await renderPage({ page: 'notifications', cols: 120, rows: 40 });
  const lines = (await s.settle()).split('\n');
  const head = lines.find((l) => l.includes('Notice') && l.includes('Message'));
  expect(head).toBeDefined();
  const from = head!.indexOf('Message');
  const next = head!.slice(from + 'Message'.length).search(/\S/);
  expect(next === -1 ? head!.length - from : next + 'Message'.length).toBeGreaterThanOrEqual(28);
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 240_000);

test('at 80x24 Message gives way and every title shows whole', async () => {
  s = await renderPage({ page: 'notifications', cols: 80, rows: 24 });
  const screen = await s.settle();
  expect(screen).toContain('Storage share granite expires tomorrow');
  expect(screen).toContain('Server proud-koala rental ends in 3 days');
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 240_000);
