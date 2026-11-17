// The hand-off's drawn keys work on a fresh screen: a block hand-off takes the focus when nothing has it, so `c`, `r`
// and `o` act without a Tab, an F6 or a click first. It never takes the focus from a control that has it, and a line
// hand-off never asks for it.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import '../../term/env/router-globals';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/history';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { FocusRoot, Pressable, Text } from '../../term/prim';
import { parseSearch, stringifySearch } from '../../term/app/router';
import { Handoff } from './Handoff';
import { beginTermSession } from '../../term/env/session';

function paged(children: () => ReactNode, at = '/board'): { element: ReactNode } {
  const root = createRootRoute({ component: () => <>{children()}</> });
  const pages = ['/board', '/keys'].map((p) => createRoute({ getParentRoute: () => root, path: `${p}/$`, component: () => null }));
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
  const router = createRouter({ routeTree: root.addChildren([index, ...pages]), history: createMemoryHistory({ initialEntries: [at] }), origin: 'http://hub.term', parseSearch, stringifySearch } as never);
  return { element: <QueryClientProvider client={new QueryClient()}><FocusRoot><RouterProvider router={router as never} /></FocusRoot></QueryClientProvider> };
}

let t: TestTerm | null = null;
let host: { end(): void } | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; host?.end(); host = null; });
const copies = (): string[] => {
  const copied: string[] = [];
  (t!.renderer as unknown as { copyToClipboardOSC52: (s: string) => boolean }).copyToClipboardOSC52 = (s) => { copied.push(s); return true; };
  return copied;
};

test('fresh screen: c copies and r shows the QR code with no Tab first', async () => {
  host = beginTermSession({ webOrigin: 'https://hub.example.com' });
  const { element } = paged(() => <Handoff reason="The Board needs a browser." what="Board" to="/board" />);
  t = await drawTest(element, { width: 100, height: 40 });
  const copied = copies();
  await t.settle();
  t.mockInput.pressKey('c');
  expect(await t.settle()).toContain('[✓ Copied]');
  expect(copied).toEqual(['https://hub.example.com/auth/home#/board']);
  t.mockInput.pressKey('r');
  expect(await t.settle()).toContain('QR code: the Board on the web');
});

test('fresh screen with a browser: o opens it with no Tab first (the first action is Open)', async () => {
  const opened: string[] = [];
  host = beginTermSession({ webOrigin: 'https://hub.example.com', openExternal: (u: string) => { opened.push(u); } });
  const { element } = paged(() => <Handoff reason="The Board needs a browser." what="Board" to="/board" />);
  t = await drawTest(element, { width: 100, height: 12 });
  await t.settle();
  t.mockInput.pressKey('o');
  await t.settle();
  expect(opened).toEqual(['https://hub.example.com/auth/home#/board']);
});

test('it never takes the focus from a control that has it: the keys stay with that control', async () => {
  host = beginTermSession({ webOrigin: 'https://hub.example.com' });
  const seen: string[] = [];
  const { element } = paged(() => (
    <>
      <Pressable autoFocus onPress={() => undefined} onKey={(k) => { seen.push(k.name); return true; }} sem={{ name: 'Other' }}><Text>Other</Text></Pressable>
      <Handoff reason="The Board needs a browser." what="Board" to="/board" />
    </>
  ));
  t = await drawTest(element, { width: 100, height: 14 });
  const copied = copies();
  await t.settle();
  t.mockInput.pressKey('c');
  expect(await t.settle()).not.toContain('Copied');
  expect(copied).toEqual([]);
  expect(seen).toEqual(['c']);
});

test('a line hand-off never asks for the focus: c does nothing until it is focused', async () => {
  host = beginTermSession({ webOrigin: 'https://hub.example.com' });
  const { element } = paged(() => <Handoff reason="Needs a browser." size="line" what="colour picker" to="/keys" />);
  t = await drawTest(element, { width: 100, height: 8 });
  const copied = copies();
  await t.settle();
  t.mockInput.pressKey('c');
  await t.settle();
  expect(copied).toEqual([]);
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressKey('c');
  await t.settle();
  expect(copied).toEqual(['https://hub.example.com/auth/home#/keys']);
});
