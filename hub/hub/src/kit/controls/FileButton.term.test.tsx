// FileButton.term: under a router (as on a page) an idle button is the hand-off line with its copy-link key; a busy or
// disabled one is its faint label with the reason, and offers no hand-off (nothing to Tab to, `c` copies nothing).
// Busy must disable it the way isDisabled does.
import { afterEach, expect, test } from 'bun:test';
import { copiesOf, drawTest, type TestTerm } from '../../term/prim/testing';
import '../../term/env/router-globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/history';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { FocusRoot } from '../../term/prim';
import { parseSearch, stringifySearch } from '../../term/app/router';
import { beginTermSession } from '../../term/env/session';
import { FileButton } from './FileButton';

/** A router like the terminal Hub's: one splat route per declared page path. Only a declared page path travels in a
 *  hand-off address (handoff.pure declaredRoute); the catch-all termHarness `routed` declares none (address = Hub root). */
function paged(children: () => ReactNode, at: string): { element: ReactNode } {
  const root = createRootRoute({ component: () => <>{children()}</> });
  const keys = createRoute({ getParentRoute: () => root, path: '/keys/$', component: () => null });
  const router = createRouter({ routeTree: root.addChildren([keys]), history: createMemoryHistory({ initialEntries: [at] }), origin: 'http://hub.term', parseSearch, stringifySearch } as never);
  return { element: <QueryClientProvider client={new QueryClient()}><FocusRoot><RouterProvider router={router as never} /></FocusRoot></QueryClientProvider> };
}

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

async function draw(props: { busy?: boolean; isDisabled?: boolean; disabledReason?: string }): Promise<{ f: string; copied: string[] }> {
  const session = beginTermSession({ webOrigin: 'https://hub.example.com' });
  try {
    const { element } = paged(() => <FileButton label="Upload key" onFiles={() => {}} {...props} />, '/keys');
    t = await drawTest(element, { width: 100, height: 6 });
    const copied = copiesOf(t.renderer) as string[];
    await t.settle();
    t.mockInput.pressTab();
    await t.settle();
    t.mockInput.pressKey('c');
    return { f: await t.settle(), copied };
  } finally { session.end(); }
}

const ADDR = 'https://hub.example.com/auth/home#/keys';

test('idle: the hand-off line with its address; c is its copy key (the headless terminal refuses the copy)', async () => {
  const { f } = await draw({});
  expect(f).toContain('needs the web Hub.');
  expect(f).toContain(ADDR);
  expect(f).toMatch(/\[[^\]]*(Copy link|Copy failed|Copied)[^\]]*\]/);
});

test('busy: the faint label with "…", no hand-off, nothing copied', async () => {
  const { f, copied } = await draw({ busy: true });
  expect(f).toContain('[… Upload key]');
  expect(f).not.toContain(ADDR);
  expect(f).not.toContain('Copy');
  expect(copied).toEqual([]);
});

test('disabled: the label and the caller\'s reason, no hand-off, nothing copied', async () => {
  const { f, copied } = await draw({ isDisabled: true, disabledReason: 'Stop the computer first.' });
  expect(f).toContain('[Upload key] Stop the computer first.');
  expect(f).not.toContain(ADDR);
  expect(f).not.toContain('Copy');
  expect(copied).toEqual([]);
});
