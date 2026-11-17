// The terminal app applies its own wording (termWords.ts, from createTermApp) before a page draws: Account's sign-in
// sessions name this device's address, never this browser's. This file imports nothing from termWords, so only the
// app can have applied it.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test("Account's sign-in sessions name this device's address", async () => {
  s = await renderPage({ page: 'account', path: '/account?section=sessions', cols: 120, rows: 40 });
  const frame = await s.settle();
  expect(frame).toContain("This device's address");
  expect(frame).not.toContain("This browser's address");
}, 180_000);
