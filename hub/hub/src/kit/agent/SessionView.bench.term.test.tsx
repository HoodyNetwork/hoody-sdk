// SessionView.term at scale. Skipped in the suite (it is long); run it on purpose with
//   HUB_BENCH=1 NODE_ENV=test bun test --preload ./scripts/term/test-preload.ts ./src/kit/agent/SessionView.bench.term.test.tsx
// (named *.term.test.* so the boundary list lets it use the term test helpers). What it measures:
// a conversation of ~10 000 rendered lines, then a reply streamed into it chunk by chunk while following, then the same
// while the reader is scrolled up. Prints the numbers; the bounds are loose ceilings (a shared, loaded host), there to
// catch a lost window (every block mounted) rather than to time the machine.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { SessionView } from './SessionView';
import { longScript, scriptedSource } from './scriptedSource.fixture';

/** Bun's collector when it is there (typed locally: this file is also seen by the web type check, which has no Bun types). */
const gc = (): void => (globalThis as { Bun?: { gc(force: boolean): void } }).Bun?.gc(true);
const mb = (n: number) => Math.round(n / 1048576);
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))]!;

test.skipIf(!process.env.HUB_BENCH)('10 000 lines: mount, memory, streamed chunks', async () => {
  gc();
  const heap0 = process.memoryUsage().heapUsed;
  // 200 turns x ~25 paragraphs: about 10 000 lines at 120 columns.
  const src = scriptedSource([...longScript(200, 25), { k: 'user', text: 'And now?' }, { k: 'reply', text: Array.from({ length: 120 }, (_, i) => `Streamed sentence ${i + 1} of the answer, with **bold** and \`code\`.`).join(' '), chunk: 40 }]);
  for (let i = 0; i < 400; i++) src.tick();
  const rows = src.snapshot().blocks.reduce((n, b) => n + (b.k === 'reply' || b.k === 'user' ? b.text.split('\n').length : 1), 0);
  const t0 = performance.now();
  const t = await drawTest(<FocusRoot><Box dir="column" width={120} height={40}><SessionView source={src} size="l" typing /></Box></FocusRoot>, { width: 120, height: 40 });
  await t.settle();
  const mountMs = performance.now() - t0;
  let boxes = 0;
  const walk = (n: { getChildren?: () => unknown[] }) => { boxes++; for (const c of n.getChildren?.() ?? []) walk(c as never); };
  walk(t.renderer.root as never);
  // Following: each chunk to a settled frame.
  const follow: number[] = [];
  for (let i = 0; i < 40 && src.tick(); i++) { const a = performance.now(); await t.settle(); follow.push(performance.now() - a); }
  // Scrolled up: PgUp a few pages, then chunks again (the view must not move).
  for (let i = 0; i < 3; i++) t.mockInput.pressKey('\x1b[5~' as never);
  const before = (await t.settle()).split('\n').slice(0, 5).join('\n');
  const up: number[] = [];
  for (let i = 0; i < 40 && src.tick(); i++) { const a = performance.now(); await t.settle(); up.push(performance.now() - a); }
  const after = (await t.settle()).split('\n').slice(0, 5).join('\n');
  gc();
  const heap1 = process.memoryUsage().heapUsed;
  const rss = process.memoryUsage().rss;
  console.log(JSON.stringify({
    sourceLines: rows, blocks: src.snapshot().blocks.length, mountedNodes: boxes, mountMs: Math.round(mountMs),
    chunkFollowMs: { p50: +pct(follow, 0.5).toFixed(1), p95: +pct(follow, 0.95).toFixed(1), n: follow.length },
    chunkScrolledUpMs: { p50: +pct(up, 0.5).toFixed(1), p95: +pct(up, 0.95).toFixed(1), n: up.length },
    heapDeltaMB: mb(heap1 - heap0), rssMB: mb(rss),
  }));
  expect(after).toBe(before);
  expect(boxes).toBeLessThan(2000);
  expect(pct(follow, 0.95)).toBeLessThan(250);
  t.renderer.destroy();
}, 300_000);
