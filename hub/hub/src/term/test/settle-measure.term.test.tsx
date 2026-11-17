// Settle must not take a frame drawn before a measured size: Computers at 120x40,
// Enter on a computer: ListDetailPage's pane reported 93x35 (useBoxSize) and React drew it ~400 ms later, after
// settle() had already returned the frame drawn at size null. A frame settle() returns must still be on screen later.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('Computers detail at 120x40: the settled frame is the one still drawn after a wait', async () => {
  s = await renderPage({ page: 'computers', cols: 120, rows: 40 });
  await s.keys.press('enter');
  const settled = await s.settle();
  await new Promise((r) => setTimeout(r, 1500));
  const later = await s.settle();
  expect(settled).toBe(later);
  expect(s.trapsAt).toEqual([]);
}, 120_000);
