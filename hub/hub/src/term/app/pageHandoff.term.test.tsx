import { afterEach, expect, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/history';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { parseSearch, stringifySearch } from './router';
import { definePage, type PageManifest } from '@kit/page';
import { drawTest, type TestTerm } from '../prim/testing';
import { FocusRoot } from '../prim';
import { beginTermSession } from '../env/session';
import { handoffView, withPageHandoff } from './pageHandoff';

const STRINGS = { 'page.title': 'Board', 'page.handoff': 'Tiles are live browser frames.', 'page.what': 'Board', 'page.empty': '' } as const;
let viewLoaded = 0;
const base = {
  id: 'boardx', path: '/boardx', title: 'page.title', layout: 'canvas', status: 'ready', sensitive: false, strings: STRINGS,
  load: () => { viewLoaded++; return Promise.resolve({ default: () => null }); },
} as const;

/** A router that declares the page's own route, as the app's does: a hand-off address carries only a declared page
 *  path, so a bare splat router would give the Hub root. */
function routed(children: () => ReactNode, at: string): { element: ReactNode } {
  const root = createRootRoute({ component: () => createElement(FocusRoot, null, children()) });
  const page = createRoute({ getParentRoute: () => root, path: '/boardx/$', component: () => null });
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
  const router = createRouter({ routeTree: root.addChildren([index, page]), history: createMemoryHistory({ initialEntries: [at] }), origin: 'http://hub.term', parseSearch, stringifySearch } as never);
  return { element: createElement(QueryClientProvider, { client: new QueryClient() }, createElement(RouterProvider, { router: router as never })) };
}

let t: TestTerm | null = null;
let host: { end(): void } | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; host?.end(); host = null; });

test('a hand-off page never loads its view: the shell draws the title and the Handoff block', async () => {
  host = beginTermSession({ webOrigin: 'https://hub.example.com' });
  const page = definePage({ ...base, handoff: { reason: 'page.handoff', what: 'page.what' } } as never) as PageManifest; // contract-any: test manifest
  const mounted = withPageHandoff(page);
  const View = (await mounted.load()).default;
  expect(viewLoaded).toBe(0);
  const { element } = routed(() => createElement(FocusRoot, null, createElement(View)), '/boardx');
  t = await drawTest(element, { width: 70, height: 14 });
  const f = await t.settle();
  expect(f).toContain('Board');
  expect(f).toContain('⇗ Tiles are live browser frames.');
  expect(f).toContain('Open the Board on the web:');
  expect(f.replace(/[│\s]/g, '')).toContain('https://hub.example.com/auth/home#/boardx');
});

test('a page without handoff is mounted unchanged', () => {
  const page = definePage(base as never) as PageManifest; // contract-any: test manifest
  expect(withPageHandoff(page)).toBe(page);
  expect(() => handoffView(page)).toThrow();
});

test('definePage refuses a hand-off reason that is missing or empty', () => {
  expect(() => definePage({ ...base, handoff: { reason: 'page.nope' } } as never)).toThrow(/bad handoff/); // contract-any: test manifest
  expect(() => definePage({ ...base, handoff: { reason: 'page.empty' } } as never)).toThrow(/bad handoff/); // contract-any: test manifest
  expect(() => definePage({ ...base, handoff: { reason: 'page.handoff', what: 'page.empty' } } as never)).toThrow(/bad handoff/); // contract-any: test manifest
});
