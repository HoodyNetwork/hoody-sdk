// Vitest: when links.script cannot address the script (its path is in
// no exec folder, or is not a file the page lists as a script), the alert that a send answered opens the Scripts list and
// its tag is the item id. testtab.alert.test.tsx covers the addressable case; notifyAlert is a spy here.
import { CoreQueryProvider, queryClient } from '@core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, onFetch, R1, settle, TARGET } from '@core/test/env';

const world = vi.hoisted(() => ({ answer: null as null | ((v: unknown) => void), alerts: [] as unknown[][] }));
vi.mock('./data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useTests: () => ({ data: { revision: 'abcdef0123456789', cases: [] }, refetch: async () => undefined }),
  useRunTest: () => ({ held: null, mutateAsync: () => new Promise((resolve) => { world.answer = resolve; }) }),
}));
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, notifyAlert: async (...a: unknown[]) => { world.alerts.push(a); return true; } };
});

import { TestTab } from './parts/TestTab';
import strings from './strings.en.json';
import type { CompScripts } from './types';

const itemAt = (path: string) => ({ id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path, name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, managed: false }) as never;
const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', serverName: 'sv1', realmIds: [R1], origin: 'https://x', err: null, caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, instances: [], rows: [], agentRealm: R1 } as unknown as CompScripts;
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  onFetch(() => ({ status: 200, body: { data: {} } }));
  setTarget(TARGET);
  world.answer = null;
  world.alerts = [];
});

describe('script alert fallback', () => {
  it.each([
    ['a path in no exec folder', 'jobs/a.ts'],
    ['a file the page does not list as a script', 'default/1/readme.txt'],
  ])('%s: the alert opens the Scripts list, tagged by the item id', async (_n, path) => {
    render(<TestTab item={itemAt(path)} comp={comp} />, { wrapper: CoreQueryProvider });
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: strings['test.send'] })); await flush(); });
    await act(async () => { world.answer?.({ outcome: 'done', data: { status: 200, ms: 3, body: '{}' } }); await flush(); });
    expect(world.alerts).toEqual([['script', { title: strings['test.alertTitle'], body: strings['test.alertBody'], tag: 'atlas.1111~a.ts', to: '/scripts' }]]);
  });
});
