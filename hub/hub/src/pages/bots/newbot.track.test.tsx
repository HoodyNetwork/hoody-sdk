// Vitest: the New Bot drawer's steps: the kit Track appears only once creation runs, never
// over the empty form. Running, the Bot step waits; an unanswered create cannot tell; a stop names where it stopped (a failed step
// needs the person); a step the person left out (no link) reads skipped. Rows only: no step opens a body here.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, within } from '@app/testing';
import { CoreQueryProvider } from '@core';
import { describe, expect, it, vi } from 'vitest';
import type * as Data from './data';
import { registerTargets, type Change, type Computer, type NewBotResult, type NewBotVars } from './data';
import { NewBotDrawer } from './parts/NewBotDrawer';
import strings from './strings.en.json';

// The drawer takes its computer's create from data.ts (useCreateBot): these cases hand it the stub instead.
const h = vi.hoisted(() => ({ create: undefined as unknown }));
vi.mock('./data', async (real) => ({ ...(await real<typeof Data>()), useCreateBot: () => h.create }));

const atlas: Computer = { id: 'c1', name: 'Atlas', server: 'srv-c1', flag: '🇸🇬', state: 'running', listState: 'ok', suspended: 0, hasMore: false } as Computer;
const changeOf = (outcome: string, data?: NewBotResult) =>
  ({ run: async () => ({ outcome }), outcome, data, code: undefined, details: undefined, idem: undefined, running: outcome === 'running', readBack: async () => true, dismiss: () => undefined, held: () => undefined, dismissShown: async () => true, reset: () => undefined }) as unknown as Change<NewBotResult, NewBotVars>;

async function mount(create: Change<NewBotResult, NewBotVars>) {
  h.create = create;
  registerTargets([{ id: 'c1', project_id: 'p-1', server_name: 'srv-c1' }]);
  const ui = <NewBotDrawer open onClose={() => undefined} computers={[atlas]} realms={[]} bots={[]} models={[]} offer={undefined} initialComputer="c1" onOpenBot={() => undefined} />;
  const router = createRouter({ routeTree: createRootRoute({ component: () => ui }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
}
const track = () => screen.queryByRole('list', { name: strings['newBot.steps'] });
const stateOf = (id: string) => track()?.querySelector(`[data-step="${id}"]`)?.getAttribute('data-state');

describe('New Bot steps', () => {
  it('the empty form shows no steps', async () => {
    await mount(changeOf('idle'));
    expect(screen.getByRole('button', { name: strings['newBot.create'] })).toBeInTheDocument();
    expect(track()).toBeNull();
  });

  it('while creating, the steps show and the Bot step waits', async () => {
    await mount(changeOf('running'));
    expect(track()).not.toBeNull();
    expect(stateOf('bot')).toBe('wait');
  });

  it('an unanswered create cannot tell whether the Bot was made', async () => {
    await mount(changeOf('pending'));
    expect(stateOf('bot')).toBe('unknown');
  });

  it('done without a link: the Bot done, and only the steps the create was sent with are rows (none reads "to do")', async () => {
    await mount(changeOf('done', { state: 'done', botKey: 'c1~global~atlas', link: null, secret: null }));
    expect(stateOf('bot')).toBe('done');
    const t = track() as HTMLElement;
    expect(t.querySelectorAll('[data-step]')).toHaveLength(1);
    expect(within(t).queryAllByRole('button')).toHaveLength(0);
  });

  it('the link switch is locked while the create is unresolved, so the steps keep the choice it was sent with', async () => {
    await mount(changeOf('running'));
    expect(screen.getByRole('switch', { name: strings['newBot.link'] })).toBeDisabled();
  });

  it('an unanswered create keeps the link switch locked too', async () => {
    await mount(changeOf('pending'));
    expect(screen.getByRole('switch', { name: strings['newBot.link'] })).toBeDisabled();
  });
});
