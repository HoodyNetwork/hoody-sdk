// Vitest (forms-bots): replacing the token of a chat app that takes two tokens (the Bot token and the app token). With
// only one pasted, "Replace the token" stays off; the empty field now says it is needed too (before: off with no word; only
// the add flow named the missing token). An app with one token says nothing.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, userEvent, within } from '@app/testing';
import { CoreQueryProvider } from '@core';
import { afterEach, describe, expect, it } from 'vitest';
import { resetCodesForTests } from './codes';
import type { BotView, Change, Channel, ChannelChange, ChannelSettings, ChannelVars, Right } from './data';
import { ChatAppsTab } from './parts/ChatAppsTab';
import strings from './strings.en.json';

afterEach(() => resetCodesForTests());

const bot = { key: 'c1~global~chief', uid: 'u-chief', id: 'chief', name: 'Chief' } as unknown as BotView;
const ana = { id: 'pr-1', platformUser: '1001', name: 'Ana', rights: ['chat'] as Right[], owner: true, lang: '' };
const app = (kind: Channel['kind'], state: Channel['state']): Channel => ({
  id: 'ch-x', kind, label: 'X', enabled: true, state, needsOwner: false, people: 1, chats: 0, homeChat: null, reason: '',
  principals: [ana], chatRows: [], view: { settings: {}, effective: { dm_policy: { value: 'pairing', source: 'channel' } } }, notes: [],
});
const settings = { ok: true, paused: false } as unknown as ChannelSettings;

async function show(first: Channel) {
  const calls: ChannelVars[] = [];
  const idle = { outcome: 'idle', running: false, readBack: async () => true, dismiss: () => undefined, reset: () => undefined };
  const change = {
    ...idle,
    run: async (v: ChannelVars) => {
      calls.push(v);
      return { outcome: 'done' };
    },
  } as unknown as Change<ChannelChange, ChannelVars>;
  const pause = { ...idle, run: async () => ({ outcome: 'done' }) } as unknown as Change<unknown, { paused: boolean }>;
  const ui = <ChatAppsTab bot={bot} channels={[first]} settings={settings} loading={false} change={change} pause={pause} />;
  const router = createRouter({ routeTree: createRootRoute({ component: () => ui }), history: createMemoryHistory({ initialEntries: ['/bots?app=ch-x'] }) });
  await act(async () => {
    render(
      <CoreQueryProvider>
        <RouterProvider router={router} />
      </CoreQueryProvider>,
    );
    await router.load();
  });
  return { calls, d: await screen.findByRole('dialog') };
}
const input = (d: HTMLElement, key: 'chan.token' | 'chan.appToken') => within(d).getAllByLabelText(strings[key]).find((el) => el.tagName === 'INPUT') as HTMLInputElement;
const replace = (d: HTMLElement) => within(d).getByRole('button', { name: strings['chan.replaceGo'] });

describe('Replace the token: an app with two tokens', () => {
  it("the token row's editor: with only the Bot token pasted the app token field says it is needed, and Replace is off", async () => {
    const { calls, d } = await show(app('slack', 'running'));
    await userEvent.click(within(d).getByRole('button', { name: strings['setup.token.replace'] }));
    expect(within(d).queryByText(strings['chan.replace.needAppToken'])).toBeNull();
    await userEvent.type(input(d, 'chan.token'), 'xoxb-first');
    expect(replace(d)).toBeDisabled();
    expect(within(d).getByText(strings['chan.replace.needAppToken'])).toBeVisible();
    // The second token: the line goes and the replace is sent once, with both.
    await userEvent.type(input(d, 'chan.appToken'), 'xapp-first');
    expect(within(d).queryByText(strings['chan.replace.needAppToken'])).toBeNull();
    expect(replace(d)).not.toBeDisabled();
    await userEvent.click(replace(d));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ action: 'credentials', channelId: 'ch-x' });
  });

  it('only the app token pasted: the Bot token field says it is needed', async () => {
    const { d } = await show(app('slack', 'running'));
    await userEvent.click(within(d).getByRole('button', { name: strings['setup.token.replace'] }));
    await userEvent.type(input(d, 'chan.appToken'), 'xapp-first');
    expect(replace(d)).toBeDisabled();
    expect(within(d).getByText(strings['chan.replace.needToken'])).toBeVisible();
  });

  it("a refused token's step says the same", async () => {
    const { d } = await show(app('slack', 'auth_failed'));
    await userEvent.type(input(d, 'chan.token'), 'xoxb-first');
    expect(replace(d)).toBeDisabled();
    expect(within(d).getByText(strings['chan.replace.needAppToken'])).toBeVisible();
  });

  it('control: an app with one token says nothing and its Replace is on once the token is pasted', async () => {
    const { d } = await show(app('telegram', 'running'));
    await userEvent.click(within(d).getByRole('button', { name: strings['setup.token.replace'] }));
    await userEvent.type(input(d, 'chan.token'), '1:first');
    expect(replace(d)).not.toBeDisabled();
    expect(within(d).queryByText(strings['chan.replace.needAppToken'])).toBeNull();
    expect(within(d).queryByText(strings['chan.replace.needToken'])).toBeNull();
  });
});
