// The Desktop tab of a computer that is not the shell's current one must not hand off with the
// SHELL's computer in the address: the web Hub opened
// another computer's page. The hand-off names the computer whose desktop this is: the one in the desktop's own address
// (https://<project>-<computer>-…), verified against the shell's list like any other (placeQuery).
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import '../../term/env/router-globals';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/history';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { FocusRoot } from '../../term/prim';
import { parseSearch, stringifySearch } from '../../term/app/router';
import { beginTermSession } from '../../term/env/session';
import { ShellDataProvider, type ShellData } from '../../shell/context';
import { DesktopFrame } from './parts/DesktopFrame';

const R = '0123456789abcdef01234567';
const ATLAS = 'c0a7150000000000000000a1';
const CEDAR = 'c0a7150000000000000000c3';
const PROJECT = '6a0000000000000000000001';
/** The shell's current computer is cedar; the Desktop tab open is atlas's. */
const SHELL: ShellData = { realms: [{ id: R, name: 'Personal' } as ShellData['realms'][number]], realmId: R, computers: [{ id: ATLAS, name: 'atlas' }, { id: CEDAR, name: 'cedar' }], computerId: CEDAR };

function paged(children: () => ReactNode): ReactNode {
  const root = createRootRoute({ component: () => <ShellDataProvider value={SHELL}>{children()}</ShellDataProvider> });
  const page = createRoute({ getParentRoute: () => root, path: '/computers/$', component: () => null });
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
  const router = createRouter({ routeTree: root.addChildren([index, page]), history: createMemoryHistory({ initialEntries: ['/computers?sel=atlas.00a1&tab=desktop'] }), origin: 'http://hub.term', parseSearch, stringifySearch } as never);
  return <QueryClientProvider client={new QueryClient()}><FocusRoot><RouterProvider router={router as never} /></FocusRoot></QueryClientProvider>;
}

let t: TestTerm | null = null;
let host: { end(): void } | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; host?.end(); host = null; });

const flat = (f: string): string => f.split('\n').map((l) => l.replace(/^[│\s]+|[│\s]+$/g, '')).join('');

test('the hand-off names the desktop\'s computer, not the shell\'s current one', async () => {
  host = beginTermSession({ webOrigin: 'https://hub.example.com' });
  t = await drawTest(paged(() => <DesktopFrame url={`https://${PROJECT}-${ATLAS}-desktop-1.n12.fixture.invalid/`} allow="" title="Desktop 1 of atlas" />), { width: 100, height: 10 });
  const f = flat(await t.settle());
  expect(f).toContain(`https://hub.example.com/auth/home?realm=0123…4567&computer=c0a7…00a1#/computers`);
  expect(f).not.toContain('00c3');
});

test('an address that names no computer sends none (never the shell\'s)', async () => {
  host = beginTermSession({ webOrigin: 'https://hub.example.com' });
  for (const url of ['', 'http://6a0000000000000000000001-c0a7150000000000000000a1-desktop-1.n12.fixture.invalid/', 'https://desktop.example.com/']) {
    t = await drawTest(paged(() => <DesktopFrame url={url} allow="" title="Desktop" />), { width: 100, height: 10 });
    const f = flat(await t.settle());
    expect({ url, f: f.includes('https://hub.example.com/auth/home?realm=0123…4567#/computers') }).toEqual({ url, f: true });
    expect({ url, cedar: f.includes('00c3') }).toEqual({ url, cedar: false });
    t.renderer.destroy(); t = null;
  }
});
