// Vitest: the chat app drawer while a change's outcome is not known, and the add flow's keyboard path.
// - A token replacement whose answer was lost keeps Save off (in the token row's editor and in a refused token's step) until
//   the outcome is known, so a token typed meanwhile is never emptied by a press the change's hold then refuses.
// - Next in the add flow opens the connect step and moves focus to it (the button pressed is gone with its step).
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, userEvent, within } from '@app/testing';
import { CoreQueryProvider } from '@core';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { resetCodesForTests } from './codes';
import type { BotView, Change, Channel, ChannelChange, ChannelSettings, ChannelVars, Right } from './data';
import { ChatAppsTab } from './parts/ChatAppsTab';
import strings from './strings.en.json';

afterEach(() => resetCodesForTests());

const step = (k: keyof typeof strings) => new RegExp(`^${strings[k]}`);
const bot = { key: 'c1~global~chief', uid: 'u-chief', id: 'chief', name: 'Chief' } as unknown as BotView;
const ana = { id: 'pr-1', platformUser: '1001', name: 'Ana', rights: ['chat'] as Right[], owner: true, lang: '' };
const app = (state: Channel['state']): Channel => ({
  id: 'ch-x', kind: 'telegram', label: 'X', enabled: true, state, needsOwner: false, people: 1, chats: 0, homeChat: null, reason: '',
  principals: [ana], chatRows: [], view: { settings: {}, effective: { dm_policy: { value: 'pairing', source: 'channel' } } }, notes: [],
});
const idle = { run: async () => ({ outcome: 'done' }), outcome: 'idle', running: false, readBack: async () => true, dismiss: () => undefined, reset: () => undefined };
const settings = { ok: true, paused: false } as unknown as ChannelSettings;

/** A change whose first send is answered "pending" (its answer lost); it then reads pending, as the page's change does. */
function Live({ first, calls }: { first: Channel | undefined; calls: ChannelVars[] }) {
  const [outcome, setOutcome] = useState('idle');
  const change = {
    ...idle,
    outcome,
    run: async (v: ChannelVars) => {
      calls.push(v);
      // The hold refuses a second send while the first one's outcome is unknown.
      if (outcome === 'pending') return { outcome: 'not_sent', code: 'held' };
      setOutcome('pending');
      return { outcome: 'pending' };
    },
  } as unknown as Change<ChannelChange, ChannelVars>;
  return <ChatAppsTab bot={bot} channels={first ? [first] : []} settings={settings} loading={false} change={change} pause={idle as unknown as Change<unknown, { paused: boolean }>} />;
}
async function show(first: Channel | undefined, path: string) {
  const calls: ChannelVars[] = [];
  const router = createRouter({ routeTree: createRootRoute({ component: () => <Live first={first} calls={calls} /> }), history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(
      <CoreQueryProvider>
        <RouterProvider router={router} />
      </CoreQueryProvider>,
    );
    await router.load();
  });
  return { calls, drawer: await screen.findByRole('dialog') };
}
const tokenInput = (d: HTMLElement) => within(d).getAllByLabelText(strings['chan.token']).find((el) => el.tagName === 'INPUT') as HTMLInputElement;

describe('a token replacement whose answer was lost', () => {
  it("the token row's editor keeps Save off while the outcome is unknown, and a token typed meanwhile stays", async () => {
    const { calls, drawer: d } = await show(app('running'), '/bots?app=ch-x');
    await userEvent.click(within(d).getByRole('button', { name: strings['setup.token.replace'] }));
    await userEvent.type(tokenInput(d), '1:first');
    await userEvent.click(within(d).getByRole('button', { name: strings['chan.replaceGo'] }));
    expect(calls).toHaveLength(1);
    await screen.findByText(strings['chan.maybe']);
    // The editor stays open (the token was not proven replaced); the person pastes again.
    await userEvent.type(tokenInput(d), '1:second');
    const save = within(d).getByRole('button', { name: strings['chan.replaceGo'] });
    expect(save).toBeDisabled();
    await userEvent.click(save);
    expect(calls).toHaveLength(1);
    expect(tokenInput(d).value).toBe('1:second');
  });

  it("a refused token's step keeps its Replace off while the outcome is unknown, and a token typed meanwhile stays", async () => {
    const { calls, drawer: d } = await show(app('auth_failed'), '/bots?app=ch-x');
    await userEvent.type(tokenInput(d), '1:first');
    await userEvent.click(within(d).getByRole('button', { name: strings['chan.replaceGo'] }));
    expect(calls).toHaveLength(1);
    await screen.findByText(strings['chan.maybe']);
    await userEvent.type(tokenInput(d), '1:second');
    const go = within(d).getByRole('button', { name: strings['chan.replaceGo'] });
    expect(go).toBeDisabled();
    await userEvent.click(go);
    expect(calls).toHaveLength(1);
    expect(tokenInput(d).value).toBe('1:second');
  });
});

describe('the add flow by keyboard', () => {
  it('Next opens the connect step and moves focus into it', async () => {
    const { drawer: d } = await show(undefined, '/bots?app=new');
    const next = within(d).getAllByRole('button', { name: strings['ui.next'] })[0] as HTMLElement;
    next.focus();
    await userEvent.keyboard('{Enter}');
    const connect = await within(d).findByRole('region', { name: step('chan.addFlow.step.connect') });
    expect(connect.contains(document.activeElement)).toBe(true);
  });
});
