// Vitest: every connection state the agent names reads as itself, not as "Stopped" (a reconnecting,
// standby or blocked app is not stopped); and closing asks about an owner code only while it is shown: once the app has its owner
// closing asks nothing, and the code is kept, so a later ownerless read (or an owned read older than the code) loses nothing.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, userEvent, waitFor } from '@app/testing';
import { CoreQueryProvider } from '@core';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { beginIssue, heldCode, offerCode, resetCodesForTests } from './codes';
import { channelOf, type BotView, type Change, type Channel, type ChannelChange, type ChannelSettings, type ChannelVars, type Right } from './data';
import { ChatAppsTab } from './parts/ChatAppsTab';
import strings from './strings.en.json';

afterEach(() => {
  cleanup();
  resetCodesForTests();
});

const bot = { key: 'c1~global~chief', uid: 'u-chief', id: 'chief', name: 'Chief' } as unknown as BotView;
const ana = { id: 'pr-1', platformUser: '1001', name: 'Ana', rights: ['chat'] as Right[], owner: true, lang: '' };
const app = (o: Partial<Channel> = {}): Channel => ({
  id: 'ch-x', kind: 'telegram', label: 'X', enabled: true, state: 'running', needsOwner: false, people: 1, chats: 0, homeChat: null, reason: '',
  principals: [ana], chatRows: [], view: { settings: {}, effective: { dm_policy: { value: 'pairing', source: 'channel' } } }, notes: [], ...o,
});
const change = { run: async () => ({ outcome: 'done' }), outcome: 'idle', running: false, readBack: async () => true, dismiss: () => undefined, reset: () => undefined } as unknown as Change<ChannelChange, ChannelVars>;
const pause = { ...change } as unknown as Change<unknown, { paused: boolean }>;
const settings = { ok: true, paused: false } as unknown as ChannelSettings;

let setOwned: (o: boolean) => void = () => undefined;
function Live({ first, channels }: { first: boolean; channels?: Channel[] }) {
  const [owned, set] = useState(first);
  setOwned = set;
  const list = channels ?? [app(owned ? {} : { state: 'needs_owner', needsOwner: true, people: 0, principals: [] })];
  return <ChatAppsTab bot={bot} channels={list} settings={settings} loading={false} change={change} pause={pause} />;
}
async function show(path: string, first = true, channels?: Channel[]) {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <Live first={first} channels={channels} /> }), history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(
      <CoreQueryProvider>
        <RouterProvider router={router} />
      </CoreQueryProvider>,
    );
    await router.load();
  });
}

describe('the connection state the agent reports', () => {
  it.each([
    ['connected', 'running'],
    ['connecting', 'starting'],
    ['awaiting_owner', 'needs_owner'],
    ['paused', 'paused'],
    ['auth_failed', 'auth_failed'],
    ['degraded', 'degraded'],
    ['standby', 'standby'],
    ['conflict', 'conflict'],
    ['realm_unserved', 'realm_unserved'],
    ['stopping', 'stopping'],
    ['stopped', 'stopped'],
    ['something_new', 'stopped'],
  ] as const)('%s reads as %s', (agent, page) => {
    expect(channelOf({ id: 'ch-x', kind: 'telegram', state: agent }).state).toBe(page);
  });

  it.each([
    ['degraded', 'Having trouble'],
    ['standby', 'On standby'],
    ['conflict', 'Connection blocked'],
    ['realm_unserved', 'Not served here'],
    ['stopping', 'Stopping'],
  ] as const)('an app card the agent reports %s says "%s", not Stopped', async (state, words) => {
    expect(strings[`chan.state.${state}`]).toBe(words);
    // The card's state comes through channelOf from the agent's own word, as the page reads it.
    await show('/bots', true, [app({ state: channelOf({ id: 'ch-x', kind: 'telegram', state }).state })]);
    expect(await screen.findByText(words)).toBeInTheDocument();
    expect(screen.queryByText(strings['chan.state.stopped'])).toBeNull();
  });
});

describe('an owner code that was used', () => {
  const issue = () =>
    act(() => {
      const r = beginIssue('u-chief', 'ch-x');
      offerCode('u-chief', 'ch-x', r, { code: 'OWN-12345', expiresAt: 0, kind: 'owner' });
    });

  it('while the app still waits for its owner, closing asks first (the code is shown once)', async () => {
    await show('/bots?app=ch-x', false);
    await issue();
    expect(await screen.findByText(strings['chan.codeNote'])).toBeInTheDocument();
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText(strings['secret.closeAsk'])).toBeInTheDocument();
  });

  it('once the app has its owner, closing asks nothing', async () => {
    await show('/bots?app=ch-x', false);
    await issue();
    expect(await screen.findByText(strings['chan.codeNote'])).toBeInTheDocument();
    act(() => setOwned(true));
    expect(await screen.findByText(strings['flow.owner.paired'].replace('{{name}}', 'Ana'))).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText(strings['secret.closeAsk'])).toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('an owned read that is older than the code loses nothing: when the app reads ownerless again the same code shows, and closing asks', async () => {
    await show('/bots?app=ch-x', false);
    await issue();
    expect(await screen.findByText(strings['chan.codeNote'])).toBeInTheDocument();
    act(() => setOwned(true));
    await screen.findByText(strings['flow.owner.paired'].replace('{{name}}', 'Ana'));
    expect(heldCode('u-chief', 'ch-x')?.code).toBe('OWN-12345');
    act(() => setOwned(false));
    expect(await screen.findByText(strings['chan.codeNote'])).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText(strings['secret.closeAsk'])).toBeInTheDocument();
  });
});
