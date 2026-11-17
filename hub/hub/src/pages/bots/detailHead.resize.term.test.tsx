// A Bot opened in a short terminal (under 30 rows) pins nothing. When the terminal then grows in height only, the header
// and the tab strip start to stick: the strip must stick under the header, not over it. The header's height did not
// change in that resize, so its rows have to be known already when sticking turns on.
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';

type S = Awaited<ReturnType<typeof renderPage>>;
let s: S | null = null;
afterEach(() => { s?.close(); s = null; });

const PATH = '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const HEAD = /Chief\s+● Waiting for you/;
const STRIP = /Activity\s+.*Link and keys/;

test('growing 120x24 to 120x40: the tab strip sticks under the Bot\'s header, not over it', async () => {
  s = await renderPage({ page: 'bots', path: PATH, cols: 120, rows: 24, settleMs: 3000 });
  const end = performance.now() + 30_000;
  while (!s.frame.includes('Message the Bot') && performance.now() < end) { await new Promise((r) => setTimeout(r, 250)); await s.settle(); }
  // Short: opened at the thread's end, the header and the strip scrolled away with it.
  expect(s.frame).toContain('Message the Bot');
  expect(HEAD.test(s.frame), s.frame).toBe(false);
  expect(STRIP.test(s.frame), s.frame).toBe(false);

  await s.resize(120, 40);
  const until = performance.now() + 30_000;
  while (!(HEAD.test(s.frame) && STRIP.test(s.frame)) && performance.now() < until) { await new Promise((r) => setTimeout(r, 250)); await s.settle(); }
  const lines = s.frame.split('\n');
  const head = lines.findIndex((l) => HEAD.test(l));
  const strip = lines.findIndex((l) => STRIP.test(l));
  const composer = lines.findIndex((l) => l.includes('Message the Bot'));
  // Still at the thread's end; both pinned, the header first and the strip right under the header's rows.
  expect(composer, s.frame).toBeGreaterThan(0);
  expect(head, s.frame).toBeGreaterThan(0);
  expect(strip, s.frame).toBeGreaterThan(head);
  expect(composer, s.frame).toBeGreaterThan(strip);
  expect(s.trapsAt).toEqual([]);
}, 180_000);
