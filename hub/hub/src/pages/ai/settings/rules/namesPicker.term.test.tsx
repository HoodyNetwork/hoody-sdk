// The rule dialog's Tools and Agents pickers in the terminal: the chosen names are tags, the empty list says what it
// covers, a name the list does not hold is typed into the same field and added with Enter (its tag marked as not
// found), and the value is the plain list of names in the order they were added, the same list the comma-separated
// text fields read.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import '../../../../term/env/router-globals';
import { bootFixtureCore } from '@core';
import { bump } from '@core/ctx';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/history';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { beginTermSession, type TermSession } from '../../../../term/env/session';
import { FocusRoot } from '../../../../term/prim';
import { parseSearch, stringifySearch } from '../../../../term/app/router';
import { act, queryAllByRole, semanticsOf, type SemRoot } from '../../../../term/prim/semantics';
import { drawTest, type TestTerm } from '../../../../term/prim/testing';
import { NamesPicker, parseList } from './NamesPicker';
import strings from './Rules.strings.en.json';
import idsStrings from '@kit/data/Ids.strings.en.json';

let t: TestTerm | null = null;
let session: TermSession | null = null;
beforeEach(() => { session = beginTermSession(); bootFixtureCore({}); });
afterEach(() => { t?.renderer.destroy(); t = null; bump('signout'); session?.end(); session = null; });

let value: string[] = [];
function Host({ start }: { start: string[] }) {
  const [names, setNames] = useState<string[]>(start);
  value = names;
  return (
    <NamesPicker
      label={strings['dlg.agentsPick']}
      names={names}
      onChange={setNames}
      noneText={strings['dlg.agentsNone']}
      known={[{ value: 'general', label: 'general' }, { value: 'reviewer', label: 'reviewer' }]}
      loading={false}
      error={undefined}
      onRetry={() => {}}
      hint={strings['dlg.namesHint']}
      notFound={strings['dlg.notFound']}
      valid={(n) => /^[a-z0-9][a-z0-9_-]*$/.test(n)}
      invalidText={strings['problem.agent_name']}
    />
  );
}

function mounted(start: string[]): ReactNode {
  const root = createRootRoute({ component: () => <Host start={start} /> });
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
  const router = createRouter({ routeTree: root.addChildren([index]), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://hub.term', parseSearch, stringifySearch } as never);
  return <QueryClientProvider client={new QueryClient()}><FocusRoot><RouterProvider router={router as never} /></FocusRoot></QueryClientProvider>;
}
const sem = () => semanticsOf(t!.renderer as unknown as SemRoot);

test('no agent chosen: the field says every agent; a typed name is added as a tag, the list stays plain names', async () => {
  t = await drawTest(mounted([]), { width: 100, height: 30 });
  let f = await t.settle();
  expect(f).toContain(strings['dlg.agentsNone']);
  const [box] = queryAllByRole(sem(), 'combobox', { name: strings['dlg.agentsPick'] });
  expect(box, f).toBeDefined();
  act(box!, 'type', 'general, ops-bot');
  f = await t.settle();
  act(box!, 'type', '\r');
  f = await t.settle();
  expect(value, f).toEqual(parseList('general, ops-bot'));
  expect(f).toContain('general');
  expect(f).toContain('ops-bot');
  // ops-bot is not in the computer's list: kept, its tag a term that says so; general's is not.
  expect(queryAllByRole(sem(), 'button', { name: 'ops-bot' }).length, f).toBe(1);
  expect(queryAllByRole(sem(), 'button', { name: 'general' }).length, f).toBe(0);
  expect(f).not.toContain(strings['dlg.agentsNone']);
}, 30_000);

test('an edited rule shows its names as tags, in order; removing one leaves the others', async () => {
  t = await drawTest(mounted(['ghost', 'general']), { width: 100, height: 30 });
  let f = await t.settle();
  expect(f.indexOf('ghost')).toBeGreaterThan(-1);
  expect(f.indexOf('ghost')).toBeLessThan(f.indexOf('general'));
  const removes = queryAllByRole(sem(), 'button', { name: idsStrings['tag.remove'].replace('{{label}}', 'ghost') });
  expect(removes.length, f).toBeGreaterThan(0);
  act(removes[0]!, 'press');
  f = await t.settle();
  expect(value, f).toEqual(['general']);
}, 30_000);
