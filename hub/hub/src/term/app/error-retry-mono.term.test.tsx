// A page that throws shows its error and a [ Try again ] that holds the focus. It painted its focus blue and nothing
// else, and it is always bold, so with NO_COLOR (the mono tier) the focused button looked like the rest of the page.
// In mono it is underlined while focused, as every kit control is (focusInk); the colour tiers draw as before.
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from 'bun:test';
import type { PageManifest } from '@kit/page';
import { queryClient } from '@core';
import { discoverPages, visiblePages } from '../../app/pages';
import { fixtureBoot } from './boot';
import { beginTermSession, type TermSession } from '../env/session';
import type { TermBoot } from './lifecycle';
import { createTermApp } from './App';
import { drawTest, type TestTerm } from '../prim/testing';
import { setColourTier } from '../prim';

setDefaultTimeout(30_000);

const UNDERLINE = 8;
let pages: readonly PageManifest[] = [];
let session: TermSession | null = null;
let boot: TermBoot | null = null;
let t: TestTerm | null = null;

beforeAll(async () => {
  const all = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
  pages = all.map((p) => (p.id !== 'demo' ? p : { ...p, load: async () => ({ default: function Boom(): never { throw new Error('Boom: on purpose'); } }) } as unknown as PageManifest));
  session = beginTermSession();
  boot = fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'schedules', fx: null });
  await boot.start(session, () => {});
});
afterAll(async () => {
  await t?.dispose();
  await boot?.dispose('term-quit');
  session?.end();
  setColourTier('truecolor');
});

/** The attributes of the cells drawing `text` (its first and last cell), after the page error is shown. */
async function retryAttrs(): Promise<[number, number]> {
  await t?.dispose();
  const app = createTermApp({ pages, queryClient, path: '/demo', onQuit: () => {} });
  t = await drawTest(app.element, { width: 120, height: 40 });
  const end = performance.now() + 4000;
  let f = await t.settle();
  while (!f.includes('could not be drawn') && performance.now() < end) { await new Promise((r) => setTimeout(r, 30)); f = await t.settle(); }
  expect(f).toContain('could not be drawn');
  const label = '[ Try again ]';
  const y = f.split('\n').findIndex((l) => l.includes(label));
  expect(y, f).toBeGreaterThanOrEqual(0);
  const spans = t.captureSpans().lines[y]!.spans;
  const x0 = Bun.stringWidth(f.split('\n')[y]!.slice(0, f.split('\n')[y]!.indexOf(label)));
  const at = (x: number): number => {
    let c = 0;
    for (const sp of spans) { const w = (sp as { width?: number }).width ?? [...sp.text].length; if (x < c + w) return sp.attributes; c += w; }
    return 0;
  };
  return [at(x0) & UNDERLINE, at(x0 + label.length - 1) & UNDERLINE];
}

test('mono: the page error\'s focused Try again is underlined', async () => {
  setColourTier('mono');
  expect(await retryAttrs()).toEqual([UNDERLINE, UNDERLINE]);
});

test('truecolor: Try again keeps its look (the blue fill is the mark, no underline)', async () => {
  setColourTier('truecolor');
  expect(await retryAttrs()).toEqual([0, 0]);
});
