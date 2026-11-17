// Vitest: the script alert's link, followed, opens the Test tab of the script that answered, in its own exec folder
// (folder 1, and default/3 at ?exec=3), so the answer shown there stays where the person left it.
import { computerHandle, CoreQueryProvider, fixtureWorld } from '@core';
import { renderPage, screen } from '@app/testing';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { settle } from '@core/test/env';

const world = vi.hoisted(() => ({ alerts: [] as unknown[][] }));
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), notifyAlert: async (...a: unknown[]) => { world.alerts.push(a); return true; } }));
vi.mock('./data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useRunTest: () => ({ held: null, mutateAsync: async () => ({ outcome: 'done', data: { status: 200, ms: 3, body: '{}' } }) }),
}));

import { TestTab } from './parts/TestTab';
import page from './page';
import strings from './strings.en.json';
import type { CompScripts } from './types';

const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };

async function alertLinkFor(path: string): Promise<string> {
  const handle = computerHandle({ id: fixtureWorld.current.id, name: fixtureWorld.current.name });
  const item = { id: `${handle}~x`, compId: fixtureWorld.current.id, compName: fixtureWorld.current.name, compHandle: handle, path, name: 'x', route: '/x', description: '', status: 'working', schedule: null, keyed: false, calls: 0, managed: false } as never;
  const comp = { id: fixtureWorld.current.id, name: fixtureWorld.current.name, handle, state: 'on', caps: { tests: false }, instances: [], rows: [] } as unknown as CompScripts;
  world.alerts = [];
  render(<TestTab item={item} comp={comp} />, { wrapper: CoreQueryProvider });
  await act(async () => { fireEvent.click(await screen.findByRole('button', { name: strings['test.send'] })); await flush(); });
  expect(world.alerts).toHaveLength(1);
  const to = (world.alerts[0]![1] as { to: string }).to;
  cleanup();
  return to;
}

describe('script alert link', () => {
  it.each([
    ['folder 1', 'default', 'default/1/daily-digest.ts', 'Daily digest', false],
    ['folder 3', 'folder3', 'default/3/inventory.ts', 'Inventory count', true],
  ])('%s: the link opens that script on its Test tab', async (_n, state, path, heading, exec3) => {
    const to = await alertLinkFor(path);
    expect(to).toContain('tab=test');
    expect(to.includes('exec=3')).toBe(exec3);
    expect((world.alerts[0]![1] as { tag: string }).tag.includes('exec=3')).toBe(exec3);
    await renderPage(page, { state, path: to });
    expect((await screen.findAllByRole('heading', { name: heading }, { timeout: 8000 })).length).toBeGreaterThan(0);
    const tabs = await screen.findAllByRole('tablist');
    const test = tabs.flatMap((l) => within(l).queryAllByRole('tab', { name: strings['tab.test'] }))[0];
    expect(test).toHaveAttribute('aria-selected', 'true');
  });
});
