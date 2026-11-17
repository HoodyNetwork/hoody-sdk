// The notifications error state must never caption its table "Unread notifications, 0 in
// all: This didn't load": a count for a list that never loaded (from `total ?? 0`). With no total the
// table is named without a count; a loaded list keeps "…, N in all".
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('a list that did not load is named without a count', async () => {
  s = await renderPage({ page: 'notifications', fx: 'error', cols: 120, rows: 40 });
  const frame = await s.settle();
  expect(frame).toContain('Unread notifications');
  expect(frame).not.toContain('in all');
  expect(s.trapsAt).toEqual([]);
}, 240_000);
