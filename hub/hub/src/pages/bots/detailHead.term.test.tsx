// A Bot's detail scrolls whole in the pane and opens at the end of its thread. Its header (name, state, actions) and
// its tab strip stay at the pane's top while the thread scrolls under them, as on the web (sticky header and tabs).
// Not in a short terminal (under 30 rows): at 80x24 they scroll away with the thread, which keeps the pane's rows.
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';

type S = Awaited<ReturnType<typeof renderPage>>;
let s: S | null = null;
afterEach(() => { s?.close(); s = null; });

const PATH = '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
for (const [cols, rows] of [[120, 40], [160, 45], [80, 30]] as const) {
  test(`the Bot's header and tabs stay above its thread at ${cols}x${rows}`, async () => {
    s = await renderPage({ page: 'bots', path: PATH, cols, rows, settleMs: 3000 });
    const end = performance.now() + 30_000;
    const ready = (f: string): boolean => f.includes('Message the Bot') && /Chief\s+● Waiting for you/.test(f);
    while (!ready(s.frame) && performance.now() < end) { await new Promise((r) => setTimeout(r, 250)); await s.settle(); }
    const lines = s.frame.split('\n');
    const head = lines.findIndex((l) => /Chief\s+● Waiting for you/.test(l));
    const strip = lines.findIndex((l) => /Activity\s+.*Link and keys/.test(l));
    const composer = lines.findIndex((l) => l.includes('Message the Bot'));
    // Opened at the thread's end (the composer drawn), the header and strip still drawn above it, in that order.
    expect(composer, s.frame).toBeGreaterThan(0);
    expect(head, s.frame).toBeGreaterThan(0);
    expect(strip, s.frame).toBeGreaterThan(head);
    expect(composer, s.frame).toBeGreaterThan(strip);
    expect(s.trapsAt).toEqual([]);
  }, 180_000);
}
test('a short terminal (80x24) pins nothing: the thread\'s end is drawn, the header scrolled away', async () => {
  s = await renderPage({ page: 'bots', path: PATH, cols: 80, rows: 24, settleMs: 3000 });
  const end = performance.now() + 30_000;
  while (!s.frame.includes('Message the Bot') && performance.now() < end) { await new Promise((r) => setTimeout(r, 250)); await s.settle(); }
  expect(s.frame).toContain('Message the Bot');
  expect(/Chief\s+● Waiting for you/.test(s.frame), s.frame).toBe(false);
  expect(/Activity\s+.*Link and keys/.test(s.frame), s.frame).toBe(false);
  expect(s.trapsAt).toEqual([]);
}, 180_000);
