// AI settings > Rules and MCP, "One folder" (FolderField with commitTyped): a typed path is chosen on Enter or on leaving
// the box, once per change, never per keystroke. The commit listened for the web input's own key and blur events through
// an element ref; a terminal field has no element, so choosing "Another folder…" threw and the field never came up.
// Here the path field comes up, typing chooses nothing, Enter chooses the path once, an unchanged Enter or leaving sends
// nothing again, and leaving with a new path chooses it. The field taken away while it still has the focus (the place
// switched to the realm by something other than a move out of the box) still chooses what was typed. The field reads
// the computer's folders through core (nothing to read here), so each test boots core on its fixtures in a mount session.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import '../../../term/env/router-globals';
import { bootFixtureCore } from '@core';
import { bump } from '@core/ctx';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/history';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { TextField } from '@kit';
import { beginTermSession, type TermSession } from '../../../term/env/session';
import { FocusRoot } from '../../../term/prim';
import { parseSearch, stringifySearch } from '../../../term/app/router';
import { act, queryAllByRole, semanticsOf, type SemRoot } from '../../../term/prim/semantics';
import { drawTest, type TestTerm } from '../../../term/prim/testing';
import type { FoldersRead } from './data';
import { FolderField } from './Options';
import strings from './NewChat.strings.en.json';

let t: TestTerm | null = null;
let session: TermSession | null = null;
beforeEach(() => { session = beginTermSession(); bootFixtureCore({}); });
afterEach(() => { t?.renderer.destroy(); t = null; bump('signout'); session?.end(); session = null; });

const HOME = '/home/ada';
// A home folder the agent reported and no computer to read: the path is typed (nothing is listed or read).
const folders: FoldersRead = { folders: [], state: 'ok', retry: null, home: HOME, target: null };
let chosen: Array<string | null> = [];

function Host() {
  const [v, setV] = useState<string | null>(HOME);
  return (
    <>
      <FolderField computer="atlas" folders={folders} value={v} onChange={(x) => { chosen.push(x); setV(x); }} noHome commitTyped />
      <TextField label="Next" value="" onChange={() => {}} />
    </>
  );
}

/** The place switched to the realm from outside the field: `toRealm()` takes the field away, the focus left where it is. */
let toRealm: () => void = () => {};
function Switch() {
  const [on, setOn] = useState(true);
  toRealm = () => setOn(false);
  return on ? <Host /> : null;
}

/** The field under a memory router with a query client and the focus root, as a page has it. */
function mounted(Body: () => ReactNode = Host): ReactNode {
  const root = createRootRoute({ component: () => <Body /> });
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
  const router = createRouter({ routeTree: root.addChildren([index]), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://hub.term', parseSearch, stringifySearch } as never);
  return <QueryClientProvider client={new QueryClient()}><FocusRoot><RouterProvider router={router as never} /></FocusRoot></QueryClientProvider>;
}

/** Draws what the keys did, lets the field's deferred commit run (a zero-delay timer), and draws again. */
async function tick(): Promise<string> {
  await t!.settle();
  await new Promise((r) => setTimeout(r, 20));
  return t!.settle();
}
const pathBox = () => queryAllByRole(semanticsOf(t!.renderer as unknown as SemRoot), 'combobox', { name: strings['folder.path'] });

/** The folder Select: open it, move to "Another folder…", pick it; the path field comes up. */
async function anotherFolder(): Promise<void> {
  t!.mockInput.pressTab();
  t!.mockInput.pressEnter();
  let f = await t!.settle();
  expect(f).toContain(strings['folder.another']);
  t!.mockInput.pressArrow('down');
  await t!.settle();
  t!.mockInput.pressEnter();
  f = await tick();
  expect(pathBox()[0], f).toBeDefined();
  expect(f).toContain(strings['folder.path']);
}

test('One folder, Another folder…: the path field comes up; Enter or leaving the box chooses the typed path once', async () => {
  chosen = [];
  t = await drawTest(mounted(), { width: 100, height: 30 });
  await t.settle();
  await anotherFolder();
  chosen = [];

  const [box] = pathBox();
  act(box!, 'type', '/srv/data');
  let f = await tick();
  expect(chosen, f).toEqual([]);
  t.mockInput.pressEnter();
  f = await tick();
  expect(chosen, f).toEqual(['/srv/data']);
  // An unchanged Enter, then leaving the box: nothing is sent again.
  t.mockInput.pressEnter();
  await tick();
  t.mockInput.pressTab();
  f = await tick();
  expect(chosen, f).toEqual(['/srv/data']);

  // A new path, then leaving the box without Enter: that path is chosen.
  const [again] = pathBox();
  act(again!, 'setValue', '/srv/web');
  f = await tick();
  expect(chosen, f).toEqual(['/srv/data']);
  t.mockInput.pressTab();
  f = await tick();
  expect(chosen, f).toEqual(['/srv/data', '/srv/web']);
}, 30_000);

test('One folder: a path typed, then the field taken away while it has the focus: the path is still chosen', async () => {
  chosen = [];
  t = await drawTest(mounted(Switch), { width: 100, height: 40 });
  await t.settle();
  await anotherFolder();
  chosen = [];

  const [box] = pathBox();
  act(box!, 'type', '/srv/data');
  let f = await tick();
  expect(chosen, f).toEqual([]);
  // The box still has the focus as it goes: it never reports losing it.
  toRealm();
  f = await tick();
  expect(pathBox(), f).toEqual([]);
  expect(chosen, f).toEqual(['/srv/data']);
}, 30_000);
