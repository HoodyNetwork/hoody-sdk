// Vitest: the Test tab's browser alert. A send that answers hands notifyAlert one 'script' alert, with fixed words
// (never the script's name, request or answer) and the script's own page; a send that does not answer hands it none.
// notifyAlert's own rules (on, away, passcode) are shell/notify's: here it is a spy.
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

const item = { id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: 'default/1/a.ts', name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, managed: false } as never;
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

describe('script alert', () => {
  const sendAnd = async (answer: unknown) => {
    render(<TestTab item={item} comp={comp} />, { wrapper: CoreQueryProvider });
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: strings['test.send'] })); await flush(); });
    expect(world.alerts).toEqual([]);
    await act(async () => { world.answer?.(answer); await flush(); });
  };

  it('a send that answers alerts once, with fixed words and the script page', async () => {
    await sendAnd({ outcome: 'done', data: { status: 500, ms: 3, body: '{"secret":"atlas-token"}' } });
    expect(world.alerts).toEqual([['script', { title: strings['test.alertTitle'], body: strings['test.alertBody'], tag: '/scripts?sel=atlas.1111~a.ts', to: '/scripts?sel=atlas.1111~a.ts&tab=test' }]]);
    const text = JSON.stringify(world.alerts);
    expect(text).not.toContain('atlas-token');
    expect(text).not.toContain('default/1/a.ts');
  });

  it('a send that may have gone through alerts nothing', async () => {
    await sendAnd({ outcome: 'pending' });
    expect(world.alerts).toEqual([]);
  });

  it.each([['failed'], ['stale']])('a send whose outcome is %s alerts nothing', async (outcome) => {
    await sendAnd({ outcome, data: { status: 200, ms: 3, body: '{}' } });
    expect(world.alerts).toEqual([]);
  });

  it('a send refused before it went out alerts nothing', async () => {
    await sendAnd({ outcome: 'not_sent', code: 'x' });
    expect(world.alerts).toEqual([]);
  });
});
