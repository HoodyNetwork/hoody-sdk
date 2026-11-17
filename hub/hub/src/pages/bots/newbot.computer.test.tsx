// Vitest: the New Bot drawer picks its computer with the kit ComputerPicker: each running computer
// shows its name, its place (city · server: server names are public) and its realm, and the list can be
// searched. A stopped computer, or one of another realm, is not offered.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, userEvent, waitFor, within } from '@app/testing';
import { CoreQueryProvider } from '@core';
import pickerStrings from '@kit/pickers/ComputerPicker.strings.en.json';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type * as Data from './data';
import { registerTargets, type Change, type Computer, type LinkOffer, type NewBotResult, type NewBotVars, type RealmInfo } from './data';
import { NewBotDrawer } from './parts/NewBotDrawer';
import strings from './strings.en.json';

// The drawer takes its computer's create from data.ts (useCreateBot): these cases hand it the stub instead.
const h = vi.hoisted(() => ({ create: undefined as unknown }));
vi.mock('./data', async (real) => ({ ...(await real<typeof Data>()), useCreateBot: () => h.create }));

const comp = (id: string, name: string, more: Partial<Computer> = {}): Computer => ({ id, name, server: `srv-${id}`, flag: '🇸🇬', state: 'running', listState: 'ok', suspended: 0, hasMore: false, ...more });
const REALMS: RealmInfo[] = [{ id: 'r1', name: 'Acme client', isGlobal: false }];
const runs: NewBotVars[] = [];
const create = {
  run: async (v: NewBotVars) => { runs.push(v); return { outcome: 'done' as const }; }, outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
  readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
} as unknown as Change<NewBotResult, NewBotVars>;

async function mount(computers: Computer[], initialComputer?: string, currentComputer?: string, offer?: LinkOffer) {
  h.create = create;
  runs.length = 0;
  registerTargets(computers.map((c) => ({ id: c.id, project_id: 'p-1', server_name: c.server })));
  const ui = <NewBotDrawer open onClose={() => undefined} computers={computers} realms={REALMS} bots={[]} models={[]} offer={offer} initialComputer={initialComputer} currentComputer={currentComputer} onOpenBot={() => undefined} />;
  const router = createRouter({ routeTree: createRootRoute({ component: () => ui }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
}
// Create judges the model first: this harness answers no model reads, so once the read settles as failed the
// starting Hoody Free needs the person's say-so, and the second Create sends.
async function createBot() {
  await userEvent.click(screen.getByRole('button', { name: strings['newBot.create'] }));
  await userEvent.click(await screen.findByRole('button', { name: strings['model.useAnyway'] }, { timeout: 8000 }));
  await userEvent.click(screen.getByRole('button', { name: strings['newBot.create'] }));
  await waitFor(() => expect(runs).toHaveLength(1));
}
const trigger = () => screen.getByRole('button', { name: new RegExp(strings['picker.computer.label']) });

describe('New Bot: Auto-approve', () => {
  it('starts On with its effect in words, is created On, and Off when the person turned it off first', async () => {
    await mount([comp('c1', 'Atlas')], 'c1');
    const sw = () => screen.getByRole('switch', { name: strings['newBot.auto'] });
    expect(sw()).toBeChecked();
    expect(screen.getByText(strings['newBot.autoOn'])).toBeInTheDocument();
    await createBot();
    expect(runs.map((v) => v.yolo)).toEqual([true]);
    await userEvent.click(sw());
    expect(sw()).not.toBeChecked();
    expect(screen.getByText(strings['newBot.autoOff'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['newBot.create'] }));
    await waitFor(() => expect(runs.map((v) => v.yolo)).toEqual([true, false]));
  });

  it('turning it back On after Off names the effect first; Cancel leaves it Off', async () => {
    await mount([comp('c1', 'Atlas')], 'c1');
    const sw = () => screen.getByRole('switch', { name: strings['newBot.auto'] });
    await userEvent.click(sw());
    expect(sw()).not.toBeChecked();
    await userEvent.click(sw());
    const d = await screen.findByRole('alertdialog');
    expect(within(d).getByText(strings['autoapprove.confirmTitle'])).toBeInTheDocument();
    expect(sw()).not.toBeChecked();
    await userEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    expect(sw()).not.toBeChecked();
    await userEvent.click(sw());
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['autoapprove.confirmGo'] }));
    expect(sw()).toBeChecked();
  });
});

describe('New Bot: the computer picker', () => {
  it('lists running computers with their place and realm, finds one by typing, and picks it', async () => {
    await mount([
      comp('c1', 'Atlas', { city: 'Singapore', realmIds: ['r1'] }),
      comp('c2', 'Borealis'),
      comp('c3', 'Cinder', { state: 'stopped' }),
      comp('c4', 'Dune', { listState: 'other_realm' }),
    ]);
    await userEvent.click(trigger());
    const list = await screen.findByRole('dialog', { name: strings['picker.computer.label'] });
    expect(within(list).getByText('Singapore · srv-c1')).toBeInTheDocument();
    expect(within(list).getByText('srv-c2')).toBeInTheDocument();
    // More than one realm in the list: the realm is the group's heading, drawn once; its rows still say it to assistive tech.
    const acme = within(list).getByRole('group', { name: 'Acme client' });
    const atlas = within(acme).getByRole('radio', { name: /Atlas/ });
    expect(atlas).toHaveAccessibleName(/Acme client/);
    expect(within(atlas).getByText('Acme client')).toHaveClass(/srOnly/);
    expect(within(list).queryByText('Cinder')).toBeNull();
    expect(within(list).queryByText('Dune')).toBeNull();
    await userEvent.type(within(list).getByRole('searchbox', { name: pickerStrings.search }), 'bor');
    expect(within(list).queryByText('Atlas')).toBeNull();
    await userEvent.click(within(list).getByText('Borealis'));
    expect(screen.queryByRole('dialog', { name: strings['picker.computer.label'] })).toBeNull();
    expect(trigger()).toHaveTextContent('Borealis');
    // The computer picked is the one the Bot is created on.
    await createBot();
    expect(runs.map((v) => v.computerId)).toEqual(['c2']);
  });

  it('starts on the computer the page opened it for, and creates the Bot there', async () => {
    await mount([comp('c1', 'Atlas'), comp('c2', 'Borealis')], 'c2');
    expect(trigger()).toHaveTextContent('Borealis');
    await createBot();
    expect(runs.map((v) => v.computerId)).toEqual(['c2']);
  });

  it('with no running computer says so, and the model cannot be changed yet', async () => {
    await mount([comp('c3', 'Cinder', { state: 'stopped' })]);
    expect(screen.getByText(strings['newBot.host.none'])).toBeInTheDocument();
    expect(trigger()).toHaveTextContent(strings['picker.computer.placeholder']);
    expect(screen.getByRole('button', { name: strings['newBot.model.changeName'] })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: strings['newBot.create'] })).toBeDisabled();
  });
});

describe('New Bot: starts on the computer the top bar shows', () => {
  it('preselects the shown computer when it runs in this realm, and creates the Bot there', async () => {
    await mount([comp('c1', 'Atlas'), comp('c2', 'Borealis'), comp('c5', 'Ember')], undefined, 'c2');
    expect(trigger()).toHaveTextContent('Borealis');
    expect(screen.queryByText(/Choose another computer/)).toBeNull();
    await createBot();
    expect(runs.map((v) => v.computerId)).toEqual(['c2']);
  });

  it('the computer the page opened it for wins over the shown one', async () => {
    await mount([comp('c1', 'Atlas'), comp('c2', 'Borealis')], 'c1', 'c2');
    expect(trigger()).toHaveTextContent('Atlas');
  });

  it('a shown computer that is not running is not picked: one line says why and the choice stays open', async () => {
    await mount([comp('c1', 'Atlas'), comp('c3', 'Cinder', { state: 'stopped' })], undefined, 'c3');
    expect(trigger()).toHaveTextContent(strings['picker.computer.placeholder']);
    expect(screen.getByText(strings['newBot.host.notRunning'].replace('{{name}}', 'Cinder'))).toBeInTheDocument();
    // The line leaves once the person chooses.
    await userEvent.click(trigger());
    await userEvent.click(within(await screen.findByRole('dialog', { name: strings['picker.computer.label'] })).getByText('Atlas'));
    expect(trigger()).toHaveTextContent('Atlas');
    expect(screen.queryByText(/Choose another computer/)).toBeNull();
  });

  it('a shown computer that serves another realm is not picked, and the line says so', async () => {
    await mount([comp('c1', 'Atlas'), comp('c2', 'Borealis'), comp('c4', 'Dune', { listState: 'other_realm' })], undefined, 'c4');
    expect(trigger()).toHaveTextContent(strings['picker.computer.placeholder']);
    expect(screen.getByText(strings['newBot.host.otherRealm'].replace('{{name}}', 'Dune'))).toBeInTheDocument();
  });

  it('a shown computer the list does not hold says nothing; the only running computer is picked as before', async () => {
    await mount([comp('c1', 'Atlas'), comp('c3', 'Cinder', { state: 'stopped' })], undefined, 'c-gone');
    expect(trigger()).toHaveTextContent('Atlas');
    expect(screen.queryByText(/Choose another computer/)).toBeNull();
  });

  it('computers that arrive after the drawer opened still start it on the shown one, never over the person\'s own pick', async () => {
    runs.length = 0;
    h.create = create;
    const list = [comp('c1', 'Atlas'), comp('c2', 'Borealis')];
    registerTargets(list.map((c) => ({ id: c.id, project_id: 'p-1', server_name: c.server })));
    // The page's reads as they change over time: the computers list arrives, then the top bar moves.
    let set: (v: { computers: Computer[]; current: string }) => void = () => undefined;
    function Host() {
      const [v, setV] = useState<{ computers: Computer[]; current: string }>({ computers: [], current: 'c2' });
      set = setV;
      return <NewBotDrawer open onClose={() => undefined} computers={v.computers} realms={REALMS} bots={[]} models={[]} offer={undefined} currentComputer={v.current} onOpenBot={() => undefined} />;
    }
    const router = createRouter({ routeTree: createRootRoute({ component: Host }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
    await act(async () => {
      render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
      await router.load();
    });
    expect(trigger()).toHaveTextContent(strings['picker.computer.placeholder']);
    act(() => set({ computers: list, current: 'c2' }));
    await waitFor(() => expect(trigger()).toHaveTextContent('Borealis'));
    // The person picks Atlas; the top bar moving afterwards changes nothing here.
    await userEvent.click(trigger());
    await userEvent.click(within(await screen.findByRole('dialog', { name: strings['picker.computer.label'] })).getByText('Atlas'));
    act(() => set({ computers: list, current: 'c5' }));
    act(() => set({ computers: [...list, comp('c5', 'Ember')], current: 'c5' }));
    expect(trigger()).toHaveTextContent('Atlas');
  });
});

describe('New Bot: Public link', () => {
  it('turning it on and off by keyboard keeps focus on the switch while the address line comes and goes', async () => {
    await mount([comp('c1', 'Atlas')], 'c1', undefined, { door: 'ready', suggestedLabel: 'quiet-heron', zone: 'bot.example.test' });
    const sw = () => screen.getByRole('switch', { name: strings['newBot.link'] });
    act(() => sw().focus());
    expect(sw()).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(sw()).toBeChecked();
    expect(await screen.findByText('https://quiet-heron.bot.example.test')).toBeInTheDocument();
    expect(sw()).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(sw()).not.toBeChecked();
    expect(screen.queryByText('https://quiet-heron.bot.example.test')).toBeNull();
    expect(sw()).toHaveFocus();
  });
});

// Auto-approve Off is the agent's default mode for the Bot's helpers: rules and hooks can let a step run without asking,
// so no Off text promises asking before risky steps.
describe('Auto-approve Off text promises no asking it cannot keep', () => {
  it('every Off description is qualified', () => {
    const PROMISE = /\b(asks?|ask you)( you)? (before|first)\b/i;
    const off = [strings['newBot.autoOff'], strings['behaviour.yoloOff'], strings['faq.autoApprove.a'].split('With it off, ')[1]];
    for (const s of off) {
      expect(s).not.toMatch(PROMISE);
      expect(s).toMatch(/rules and hooks can let a step run without asking/);
    }
  });
});
