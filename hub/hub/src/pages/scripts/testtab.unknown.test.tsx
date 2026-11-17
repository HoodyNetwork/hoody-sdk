// Vitest on the Test tab: an answer that came with an unknown outcome (a 5xx held pending) is labelled as unknown, never "Failed" (C9);
// a definite 4xx answer is still "Failed", and a good one "Passed".
import { CoreQueryProvider, queryClient } from '@core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, onFetch, R1, settle, TARGET } from '@core/test/env';

const world = vi.hoisted(() => ({ status: 200, outcome: 'done' as 'done' | 'pending' }));
vi.mock('./data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useTests: () => ({ data: { revision: 'abcdef0123456789', cases: [] }, refetch: async () => undefined }),
  useRunTest: () => ({ held: null, mutateAsync: async () => ({ outcome: world.outcome, data: { status: world.status, ms: 3, body: 'text' } }) }),
}));

import { TestTab } from './parts/TestTab';
import strings from './strings.en.json';
import type { CompScripts } from './types';

const item = { id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: 'default/1/a.ts', name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, managed: false } as never;
const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', serverName: 'sv1', realmIds: [R1], origin: 'https://x', err: null, caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, instances: [], rows: [], agentRealm: R1 } as unknown as CompScripts;
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  onFetch(() => ({ status: 200, body: { data: {} } }));
  setTarget(TARGET);
});

const press = async (status: number, outcome: 'done' | 'pending') => {
  world.status = status;
  world.outcome = outcome;
  render(<TestTab item={item} comp={comp} />, { wrapper: CoreQueryProvider });
  await act(async () => { fireEvent.click(await screen.findByRole('button', { name: strings['test.send'] })); await flush(); });
  return await screen.findByRole('status');
};
const pill = (a: HTMLElement) => a.textContent ?? '';

describe('Test tab: the label of an answer', () => {
  it('a 502 held pending is labelled as an unknown outcome with its status, never Failed', async () => {
    const fig = await press(502, 'pending');
    expect(pill(fig)).toContain(`${strings['test.unknown']} · 502`);
    expect(pill(fig)).not.toContain(strings['test.failed']);
  });
  it('a 404 answer is Failed, a 200 answer is Passed', async () => {
    const fig = await press(404, 'done');
    expect(pill(fig)).toContain(`${strings['test.failed']} · 404`);
  });
  it('a 200 answer is Passed', async () => {
    const fig = await press(200, 'done');
    expect(pill(fig)).toContain(`${strings['test.ok']} · 200`);
  });
});
