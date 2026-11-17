// Vitest: notifications as discovery. While a Test tab send is out, its answer panel carries the
// "script" hint beside the busy line; once the answer is in, the hint goes. The hint's own rules are
// shell/notify/NotifyHint.test.tsx's: here it is a marker that records its kind.
import { CoreQueryProvider, queryClient } from '@core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, onFetch, R1, settle, TARGET } from '@core/test/env';

const world = vi.hoisted(() => ({ answer: null as null | ((v: unknown) => void) }));
vi.mock('./data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useTests: () => ({ data: { revision: 'abcdef0123456789', cases: [] }, refetch: async () => undefined }),
  useRunTest: () => ({ held: null, mutateAsync: () => new Promise((resolve) => { world.answer = resolve; }) }),
}));
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, NotifyHint: ({ kind }: { kind: string }) => <i data-testid="notify-hint" data-kind={kind} /> };
});

import { TestTab } from './parts/TestTab';
import strings from './strings.en.json';
import type { CompScripts } from './types';

const item = { id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: 'default/1/a.ts', name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, managed: false } as never;
const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', serverName: 'sv1', realmIds: [R1], origin: 'https://x', err: null, caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, instances: [], rows: [], agentRealm: R1 } as unknown as CompScripts;
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };
const hints = () => screen.queryAllByTestId('notify-hint').map((e) => e.getAttribute('data-kind'));

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  onFetch(() => ({ status: 200, body: { data: {} } }));
  setTarget(TARGET);
  world.answer = null;
});

describe('notification hints', () => {
  it('a send still out shows the script hint; the answer coming in removes it', async () => {
    render(<TestTab item={item} comp={comp} />, { wrapper: CoreQueryProvider });
    expect(hints()).toEqual([]);
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: strings['test.send'] })); await flush(); });
    expect(hints()).toEqual(['script']);
    await act(async () => { world.answer?.({ outcome: 'done', data: { status: 200, ms: 3, body: '{}' } }); await flush(); });
    expect(hints()).toEqual([]);
  });
});
