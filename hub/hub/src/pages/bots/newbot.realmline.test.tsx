// Vitest: the New Bot drawer says before the send which realm the Bot goes in, as the
// computer field's own description (beside the picker, not the row's help). All realms with the account: a Global Bot.
// One realm: nothing to say. A token session pinned to All realms (an all-realms key, no realm menu) makes a Global Bot
// too, said in the key's words; a Global Bot's link is account-only (core refuses it unsent in a token session), so the
// link switch is off there and says why.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, within } from '@app/testing';
import { answers, bootFixtureCore, CoreQueryProvider, fixtureSession, reply } from '@core';
import { describe, expect, it, vi } from 'vitest';
import type * as Data from './data';
import { createBotFlow, registerTargets, ROUTES, type Change, type Computer, type NewBotResult, type NewBotVars } from './data';
import { NewBotDrawer } from './parts/NewBotDrawer';
import strings from './strings.en.json';

// The drawer takes its computer's create from data.ts (useCreateBot): these cases hand it the stub instead.
const h = vi.hoisted(() => ({ create: undefined as unknown }));
vi.mock('./data', async (real) => ({ ...(await real<typeof Data>()), useCreateBot: () => h.create }));

const atlas: Computer = { id: 'c1', name: 'Atlas', server: 'srv-c1', flag: '🇸🇬', state: 'running', listState: 'ok', suspended: 0, hasMore: false };
const create = {
  run: async () => ({ outcome: 'done' as const }), outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
  readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
} as unknown as Change<NewBotResult, NewBotVars>;
const TOKEN_ALL = fixtureSession({ kind: 'token', caps: ['computers.read', 'projects.read'], realm: 'all' });

async function mount() {
  h.create = create;
  registerTargets([{ id: atlas.id, project_id: 'p-1', server_name: atlas.server }]);
  const ui = <NewBotDrawer open onClose={() => undefined} computers={[atlas]} realms={[]} bots={[]} models={[]} offer={undefined} initialComputer="c1" onOpenBot={() => undefined} />;
  const router = createRouter({ routeTree: createRootRoute({ component: () => ui }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
  const d = await screen.findByRole('dialog', { name: strings['newBot.title'] });
  return { d, picker: within(d).getByRole('button', { name: new RegExp(strings['picker.computer.label']) }), createButton: within(d).getByRole('button', { name: strings['newBot.create'] }) };
}

describe('New Bot: the realm line beside the computer', () => {
  it('All realms, signed in with the account: the computer field says it will be a Global Bot', async () => {
    bootFixtureCore({ realm: 'all' });
    const { d, picker, createButton } = await mount();
    expect(picker).toHaveAccessibleDescription(expect.stringContaining(strings['newBot.realmGlobal']));
    expect(within(d).getByText(strings['newBot.realmGlobal'])).toBeVisible();
    expect(createButton).not.toBeDisabled();
  });

  it('one realm selected: no realm line', async () => {
    const { d, picker } = await mount();
    expect(within(d).queryByText(strings['newBot.realmGlobal'])).toBeNull();
    expect(picker).not.toHaveAccessibleDescription(expect.stringContaining(strings['newBot.realmGlobal']));
  });

  it('a token session pinned to All realms: the field says it will be a Global Bot, Create is on, the link switch is off and says why', async () => {
    bootFixtureCore({ realm: 'all', rules: [TOKEN_ALL] });
    const { d, picker, createButton } = await mount();
    expect(picker).toHaveAccessibleDescription(expect.stringContaining(strings['newBot.realmTokenAll']));
    expect(within(d).queryByText(strings['newBot.realmGlobal'])).toBeNull();
    expect(createButton).not.toBeDisabled();
    const link = within(d).getByRole('switch', { name: strings['newBot.link'] });
    expect(link).toBeDisabled();
    expect(link).not.toBeChecked();
    expect(within(d).getByText(strings['newBot.linkTokenAll'])).toBeVisible();
  });

  it('signed in with the account in All realms, the link switch stays on offer', async () => {
    bootFixtureCore({ realm: 'all' });
    const { d } = await mount();
    expect(within(d).getByRole('switch', { name: strings['newBot.link'] })).not.toBeDisabled();
    expect(within(d).queryByText(strings['newBot.linkTokenAll'])).toBeNull();
  });
});

describe('New Bot: a token session pinned to All realms', () => {
  it('the create is sent once and makes a Global Bot', async () => {
    const sent: string[] = [];
    bootFixtureCore({ realm: 'all', rules: [TOKEN_ALL, reply(ROUTES.create, () => {
      sent.push('create');
      return answers.ok({ id: 'support', realm: 'global', uid: 'u-1' });
    })] });
    registerTargets([{ id: atlas.id, project_id: 'p-1', server_name: atlas.server }]);
    const r = await createBotFlow({ name: 'Support', computerId: 'c1', model: '', instructions: '', withLink: false, label: '', yolo: true });
    expect(sent).toEqual(['create']);
    expect(r).toMatchObject({ state: 'done', botKey: 'c1~global~support' });
  });
});
