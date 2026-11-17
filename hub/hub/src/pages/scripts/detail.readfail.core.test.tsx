// Vitest on core's real read source: the script detail hands the Ask drawer the state
// of its file read, so a failed read never reads as "no code". The real Detail (useEditor, tabs, on its Code tab, the drawer opened by ?ai=1)
// runs in a memory router; the file read answers an empty file, then a background refetch fails, which keeps the empty text.
// The reason Try again gives must turn from the no-code one to the loading one. Replaced: the sign-in box only records the
// reason it is given. Pins Detail.tsx's readFailed wiring.
import { queryClient } from '@core';
import { act, render, screen, userEvent } from '@app/testing';
// eslint-disable-next-line no-restricted-imports -- a test harness for the component, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a router harness for Detail's URL state (tab, ai), not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import { boot, onFetch, R1, settle } from '@core/test/env';
// eslint-disable-next-line hub/page-boundaries -- the harness reads the URL the way the app does (every value a string), not page code
import { parseSearch, stringifySearch } from '../../app/router';
import type * as AgentSignInModule from './parts/AgentSignIn';
import strings from './strings.en.json';
import type { CompScripts } from './types';

const blockedSeen = vi.hoisted(() => [] as Array<string | undefined>);
vi.mock('./parts/AgentSignIn', async (orig) => {
  const real = await orig<typeof AgentSignInModule>();
  return { ...real, AgentSignIn: (p: Parameters<typeof real.AgentSignIn>[0]) => { blockedSeen.push(p.blocked); return real.AgentSignIn(p); } };
});

import { toItems } from './logic';
import { Detail } from './parts/Detail';

const comp = {
  id: 'c0a7150000000000000000a1', name: 'atlas', handle: 'a.0000', state: 'on', serverName: 'sv1', realmIds: [R1], origin: '', err: null,
  caps: { now: null, revisions: true, history: true, env: true, executions: true, tests: true, publishable: true },
  agent: { templates: true, writer: true, writerOwner: 'fp1', guardedDelete: true }, agentRealm: 'global', aliasesRead: true,
  rows: [{ path: 'default/1/probe.ts', isDirectory: false }], summary: {}, instances: {}, aliases: [], deleted: [],
} as unknown as CompScripts;
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };

describe('the script detail after a failed read of its file', () => {
  it('an empty file read, then a failed background refetch: the drawer\'s Try again turns from the no-code reason to the loading one', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    blockedSeen.length = 0;
    let readFails = false;
    onFetch((c) => (c.url.includes('/api/v1/exec/scripts/read') && !c.url.includes('/history/')
      ? (readFails ? { status: 500, body: { error: { code: 'INTERNAL', message: 'read failed' } } } : { status: 200, body: { data: { revision: 'r1', content: '' } } })
      : { status: 200, body: { data: {} } }));
    const item = toItems([comp])[0]!;
    expect(item.path).toBe('default/1/probe.ts');
    const router = createRouter({
      routeTree: createRootRoute({ component: () => <Detail item={item} comp={comp} onChanged={() => undefined} onDeleted={() => undefined} /> }),
      history: createMemoryHistory({ initialEntries: ['/?tab=code&ai=1'] }),
      parseSearch, // the app's own search format: every value a string (ai=1 is '1', as Detail reads it)
      stringifySearch,
    });
    await act(async () => { render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>); await router.load(); await flush(); });
    await userEvent.type(await screen.findByRole('textbox', { name: strings['ai.ask'] }), 'make it say b');
    await vi.waitFor(() => expect(blockedSeen.at(-1)).toBe(strings['retryWhy.code']));

    readFails = true;
    await act(async () => { await queryClient.refetchQueries({ type: 'active' }); await flush(); });
    await vi.waitFor(() => expect(blockedSeen.at(-1)).toBe(strings['retryWhy.loading']));
  });
});
