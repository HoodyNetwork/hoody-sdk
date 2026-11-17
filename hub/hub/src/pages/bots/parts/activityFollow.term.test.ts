// The Activity log follows its end in the terminal as on the web: opened on a Bot, the page's one scroll
// stands at the end, so the newest row (Chief's waiting approval card) sits wholly above the sticky chat-box dock and
// no log row runs under the dock (no `logCol ⨯ sayDock` overdraw).
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../../scripts/term/render';
import { layoutFaults } from '../../../term/prim/layoutcheck';

let close: (() => void) | null = null;
afterEach(() => { close?.(); close = null; });

for (const [cols, rows] of [[80, 24], [120, 40]] as const) test(`Chief's activity at ${cols}x${rows}: the newest row above the dock`, async () => {
  const s = await renderPage({ page: 'bots', path: '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief', cols, rows });
  close = () => s.close();
  const lines = s.frame.split('\n');
  const card = lines.findIndex((l) => l.includes('Allow this action?'));
  const dock = lines.findIndex((l) => l.includes('Message the Bot'));
  expect(card).toBeGreaterThan(-1);
  expect(dock).toBeGreaterThan(card);
  const faults = layoutFaults((s.renderer as unknown as { root: never }).root, { cols, rows }).filter((f) => /sayDock|logCol/.test(JSON.stringify(f)));
  expect(faults).toEqual([]);
}, 120_000);

// Idle: with the page settled, two seconds pass with no draw asked and no frame change; the log hears its
// scroll box by the engine's events, so nothing wakes it. Then a scroll of the page is heard (the card is measured
// again) and the hearing ends with the page.
test('an idle Bots page asks for no draw over 2 s', async () => {
  const s = await renderPage({ page: 'bots', path: '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief', cols: 120, rows: 40 });
  close = () => s.close();
  const r = s.renderer as unknown as { requestRender(): void };
  const real = r.requestRender.bind(r);
  let asked = 0;
  r.requestRender = () => { asked++; real(); };
  const before = s.frame;
  await new Promise((res) => setTimeout(res, 2000));
  expect(asked).toBe(0);
  expect(await s.settle()).toBe(before);
  // the counter is live: scrolling the log's box up asks for a draw and moves the log
  type N = { scrollTop?: number; scrollHeight?: number; viewport?: { height: number }; getChildren?(): N[] };
  const boxes: N[] = [];
  const walk = (n: N): void => { if (typeof n.scrollHeight === 'number' && n.viewport && n.scrollHeight > n.viewport.height) boxes.push(n); for (const k of n.getChildren?.() ?? []) walk(k); };
  walk((s.renderer as unknown as { root: N }).root);
  expect(boxes.length).toBeGreaterThan(0);
  for (const b of boxes) b.scrollTop = Math.max(0, (b.scrollTop ?? 0) - 5);
  expect(asked).toBeGreaterThan(0);
  expect(await s.settle()).not.toBe(before);
}, 120_000);
