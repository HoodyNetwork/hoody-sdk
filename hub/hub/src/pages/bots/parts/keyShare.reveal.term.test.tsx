// Bots, a fresh key's codes in the terminal: the code with the key is drawn only after Show, and hides again by the
// rules a SecretField follows here (kit useRevealGuard): when the terminal loses focus (focus reporting, the renderer's
// "blur"), and when no key is pressed for the reveal idle time. It used to hide only on the host's visibility change,
// which a terminal never sends, so a scannable key stayed on screen.
import { afterEach, expect, test } from 'bun:test';
import '../../../term/env/router-globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/history';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { FocusRoot } from '../../../term/prim';
import { parseSearch, stringifySearch } from '../../../term/app/router';
import { __secretIdleSeams } from '../../../term/app/secret-screen-ctx';
import { act, queryAllByRole, semanticsOf, type SemRoot } from '../../../term/prim/semantics';
import { drawTest, type TestTerm } from '../../../term/prim/testing';
import { KeyShare } from './KeyShare';
import strings from '../strings.en.json';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; __secretIdleSeams.reset(); });

// A made-up key and address (never a real one).
const SECRET = 'bk_test_0000';
const URL_ = 'https://chief.bots.example.test/';

function mounted(): ReactNode {
  const root = createRootRoute({ component: () => <KeyShare secret={SECRET} url={URL_} /> });
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
  const router = createRouter({ routeTree: root.addChildren([index]), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://hub.term', parseSearch, stringifySearch } as never);
  return <QueryClientProvider client={new QueryClient()}><FocusRoot><RouterProvider router={router as never} /></FocusRoot></QueryClientProvider>;
}
const buttons = (name: string) => queryAllByRole(semanticsOf(t!.renderer as unknown as SemRoot), 'button', { name });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Draws the codes and presses Show: the code with the key is shown (its button now says Hide). */
async function showKeyed(): Promise<void> {
  t = await drawTest(mounted(), { width: 120, height: 60 });
  const f = await t.settle();
  const [show] = buttons(strings['keyShare.qrShow']);
  expect(show, f).toBeDefined();
  act(show!, 'press');
  const g = await t.settle();
  expect(buttons(strings['keyShare.qrHide']).length, g).toBe(1);
}

test('the code with the key hides again when the terminal loses focus', async () => {
  await showKeyed();
  (t!.renderer as unknown as { emit(e: string): void }).emit('blur');
  const f = await t!.settle();
  expect(buttons(strings['keyShare.qrHide']), f).toEqual([]);
  expect(buttons(strings['keyShare.qrShow']).length, f).toBe(1);
});

test('the code with the key hides again after the idle time with no key press', async () => {
  __secretIdleSeams.setMs(150);
  await showKeyed();
  await wait(450);
  const f = await t!.settle();
  expect(buttons(strings['keyShare.qrHide']), f).toEqual([]);
  expect(buttons(strings['keyShare.qrShow']).length, f).toBe(1);
});
