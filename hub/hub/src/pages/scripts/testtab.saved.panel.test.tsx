// Vitest at the Test tab's Saved tests card: it is padded like every other card, so its rows and their Run test /
// Remove test actions keep the card's inline edges instead of touching its border.
import { CoreQueryProvider, queryClient } from '@core';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, onFetch, R1, TARGET } from '@core/test/env';

vi.mock('./data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useTests: () => ({ data: { revision: 'abcdef0123456789', cases: [{ id: 't1', name: 'Says hello', method: 'GET', route: '/a' }] }, refetch: async () => undefined }),
  useRunTest: () => ({ held: null, mutateAsync: async () => ({ outcome: 'done', data: { status: 200, ms: 3, body: 'ok' } }) }),
}));

import { TestTab } from './parts/TestTab';
import strings from './strings.en.json';
import type { CompScripts } from './types';

const item = { id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: 'default/1/a.ts', name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, managed: false } as never;
const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', serverName: 'sv1', realmIds: [R1], origin: 'https://x', err: null, caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, instances: [], rows: [], agentRealm: R1 } as unknown as CompScripts;

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  onFetch(() => ({ status: 200, body: { data: {} } }));
  setTarget(TARGET);
});

describe('the Saved tests card', () => {
  it('pads its body like every card: the saved rows sit inside it, not on its border', () => {
    render(<TestTab item={item} comp={comp} />, { wrapper: CoreQueryProvider });
    const card = screen.getByRole('heading', { name: strings['test.saved'] }).closest('section')!;
    const body = card.querySelector('.panelBody')!;
    expect(body).toBeTruthy();
    expect(body.classList.contains('flush')).toBe(false);
    expect(within(body as HTMLElement).getByText('Says hello')).toBeTruthy();
  });
});
