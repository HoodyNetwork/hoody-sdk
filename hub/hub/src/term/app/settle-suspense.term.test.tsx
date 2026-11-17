// Settling never accepts the router's Suspense fallback ("Loading…", router.tsx Loading): viewsLoading() counts a
// shown fallback as well as a view import, so whenIdle (render.ts, goldens, shots, dev) waits for the page's own view.
// The slow page here imports at once but SUSPENDS after that (a `use()` of a 1.5 s promise inside the view): before the
// fix the import count was 0 while the fallback was up, and a render reported "settled: yes" on "Loading…".
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from 'bun:test';
import { use } from 'react';
import type { PageManifest } from '@kit/page';
import { queryClient } from '@core';
import { discoverPages, visiblePages } from '../../app/pages';
import { fixtureBoot } from './boot';
import { beginTermSession, type TermSession } from '../env/session';
import type { TermBoot } from './lifecycle';
import { createTermApp } from './App';
import { viewsLoading } from './router';
import { whenIdle } from './idle';
import { drawTest, type TestTerm } from '../prim/testing';
import { setColourTier, Text } from '../prim';

setDefaultTimeout(60_000);

let session: TermSession | null = null;
let boot: TermBoot | null = null;
let t: TestTerm | null = null;
let pages: readonly PageManifest[] = [];
const SLOW_MS = 1500;
let gate: Promise<void> | null = null;

function SlowView() {
  gate ??= new Promise((r) => setTimeout(r, SLOW_MS));
  use(gate);
  return <Text>slow page drawn</Text>;
}

beforeAll(async () => {
  setColourTier('truecolor');
  const all = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
  pages = all.map((p) => (p.id !== 'home' ? p : { ...p, load: async () => ({ default: SlowView }) } as unknown as PageManifest));
  session = beginTermSession();
  boot = fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'home', fx: null });
  await boot.start(session, () => {});
});
afterAll(async () => {
  await t?.dispose();
  await boot?.dispose('term-quit');
  session?.end();
});

test('a view suspending after its import: the fallback counts as loading, and whenIdle settles on the page, never on "Loading…"', async () => {
  const app = createTermApp({ pages, queryClient, path: '/', onQuit: () => {} });
  t = await drawTest(app.element, { width: 120, height: 40 });
  let sawFallback = 0;
  const r = await whenIdle({
    queryClient,
    views: viewsLoading,
    still: 3,
    deadlineMs: 15_000,
    frame: async () => {
      await t!.renderOnce();
      const f = t!.captureCharFrame();
      if (f.includes('Loading…')) { sawFallback++; expect(viewsLoading()).toBeGreaterThan(0); }
      return f;
    },
  });
  expect(sawFallback).toBeGreaterThan(0);
  expect(r.settled).toBe(true);
  expect(r.frame).not.toContain('Loading…');
  expect(r.frame).toContain('slow page drawn');
  expect(viewsLoading()).toBe(0);
});
