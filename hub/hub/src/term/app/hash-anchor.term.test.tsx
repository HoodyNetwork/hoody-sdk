// The #hash jump keeps its target in view while the content above it is still arriving (the web's scroll anchoring;
// for example /guide#guide-bots jumped when the Bots section mounted, then the sections above it filled in from their
// queries and pushed it off screen, about one run in three). A page whose upper part grows AFTER the target mounted
// must still show the target at the top once it settles.
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from 'bun:test';
import { useEffect, useState } from 'react';
import { h } from '../jsx/classic';
import type { PageManifest } from '@kit/page';
import { queryClient } from '@core';
import { discoverPages, visiblePages } from '../../app/pages';
import { fixtureBoot } from './boot';
import { beginTermSession, type TermSession } from '../env/session';
import type { TermBoot } from './lifecycle';
import { createTermApp } from './App';
import { drawTest, type TestTerm } from '../prim/testing';

setDefaultTimeout(30_000);

let pages: readonly PageManifest[] = [];
let session: TermSession | null = null;
let boot: TermBoot | null = null;
let t: TestTerm | null = null;

const lines = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => h('p', { key: `${prefix}-${i}` }, `${prefix} ${i + 1}`));

/** The target mounts at once; 40 lines appear above it 150 ms later (a query answering after the jump). */
function Growing() {
  const [late, setLate] = useState(false);
  useEffect(() => { const id = setTimeout(() => setLate(true), 150); return () => clearTimeout(id); }, []);
  return h('div', null,
    h('p', null, 'Page top'),
    late ? h('div', null, ...lines('Arrived late', 40)) : null,
    h('section', { id: 'anchor-target' }, h('h2', null, 'Anchor target heading')),
    h('div', null, ...lines('Below', 80)));
}

beforeAll(async () => {
  const all = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
  pages = all.map((p) => (p.id !== 'demo' ? p : ({ ...p, load: async () => ({ default: Growing }) } as unknown as PageManifest)));
  session = beginTermSession();
  boot = fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'demo', fx: null });
  await boot.start(session, () => {});
});
afterAll(async () => {
  await t?.dispose();
  await boot?.dispose('term-quit');
  session?.end();
});

test('a #hash target stays in view when content above it arrives after the jump', async () => {
  const app = createTermApp({ pages, queryClient, path: '/demo#anchor-target', onQuit: () => {} });
  t = await drawTest(app.element, { width: 100, height: 30 });
  const end = performance.now() + 4000;
  let f = await t.settle();
  while (!f.includes('Arrived late 40') && !f.includes('Anchor target heading') && performance.now() < end) { await new Promise((r) => setTimeout(r, 30)); f = await t.settle(); }
  // Past the growth, and quiet: the frame the person is left with.
  await new Promise((r) => setTimeout(r, 1200));
  f = await t.settle();
  expect(f).toContain('Anchor target heading');
  expect(f).not.toContain('Page top');
});
