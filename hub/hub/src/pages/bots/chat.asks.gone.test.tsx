// Vitest: a chat's Approve and Forget dialogs are bound to that chat. A refresh that takes the chat away, or shows the group
// approved already, closes the dialog, so Confirm never sends for a chat that is gone or settled.
import { screen, userEvent, waitFor, within } from '@app/testing';
import { useState } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Change, Channel, ChannelChange, ChannelVars } from './data';
import { ChatsSection as ChatsBody } from './parts/ChatChats';
import { emptyDraft as noDraft } from './parts/ChatSettings';
import { mount } from './routed';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const eff = (e: Record<string, [unknown, string]>) => Object.fromEntries(Object.entries(e).map(([k, [value, source]]) => [k, { value, source }]));
const chatView = { settings: {}, effective: eff({ mention_only: [true, 'default'], reply_style: ['thread', 'default'], format: ['rich', 'default'], rate_user_per_min: [10, 'default'], rate_user_per_hour: [20, 'default'], rate_user_per_day: [100, 'default'], rate_chat_per_min: [20, 'default'] }) };
const channel: Channel = {
  id: 'ch-x', kind: 'telegram', label: 'X', enabled: true, state: 'running', needsOwner: false, people: 0, chats: 2, homeChat: null, reason: '', principals: [],
  chatRows: [
    { id: 'd1', platformChat: '1', kind: 'dm', title: 'Ana', state: 'approved', view: chatView },
    { id: 'g1', platformChat: '-1', kind: 'group', title: 'Team', state: 'requested', view: chatView },
  ],
  view: { settings: {}, effective: eff({ dm_policy: ['owner', 'default'], group_mode: ['owner_approves', 'default'], gate_deciders: ['owner', 'default'], push_events: [['report'], 'default'], home_chat: [null, 'default'], mention_only: [true, 'default'], part_chars: [4096, 'default'], max_parts: [8, 'default'], hide_secrets: [true, 'default'], channel_lease: [true, 'default'], blocked_users: [[], 'default'] }) },
  notes: [],
};

function Host({ ch, calls }: { ch: Channel; calls: ChannelVars[] }) {
  const [draft, setDraft] = useState(noDraft);
  const change = {
    run: async (v: ChannelVars) => { calls.push(v); return { outcome: 'done' as const }; },
    outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
    readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
  } as unknown as Change<ChannelChange, ChannelVars>;
  return <ChatsBody channel={ch} change={change} draft={draft} onDraft={setDraft} />;
}
const teamRow = () => screen.getByRole('row', { name: /Team/ });
const without = (id: string): Channel => ({ ...channel, chatRows: channel.chatRows.filter((c) => c.id !== id) });

describe('a chat that goes away while its Approve or Forget dialog is open', () => {
  it('Approve closes when the group is gone, and sends nothing', async () => {
    const calls: ChannelVars[] = [];
    const { rerender } = await mount(<Host ch={channel} calls={calls} />);
    await userEvent.click(within(teamRow()).getByRole('button', { name: strings['chan.chat.approve'] }));
    await screen.findByRole('alertdialog', { name: /Team/ });
    await rerender(<Host ch={without('g1')} calls={calls} />);
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: /Team/ })).toBeNull());
    expect(calls).toEqual([]);
  });

  it('Approve closes when a refresh shows the group approved already', async () => {
    const calls: ChannelVars[] = [];
    const { rerender } = await mount(<Host ch={channel} calls={calls} />);
    await userEvent.click(within(teamRow()).getByRole('button', { name: strings['chan.chat.approve'] }));
    await screen.findByRole('alertdialog', { name: /Team/ });
    await rerender(<Host ch={{ ...channel, chatRows: channel.chatRows.map((c) => (c.id === 'g1' ? { ...c, state: 'approved' as const } : c)) }} calls={calls} />);
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: /Team/ })).toBeNull());
    expect(calls).toEqual([]);
  });

  it('Forget closes when the chat is gone, and sends nothing', async () => {
    const calls: ChannelVars[] = [];
    const { rerender } = await mount(<Host ch={channel} calls={calls} />);
    await userEvent.click(within(teamRow()).getByRole('button', { name: 'Row actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['chan.chat.forget']}`) }));
    await screen.findByRole('alertdialog', { name: /Team/ });
    await rerender(<Host ch={without('g1')} calls={calls} />);
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: /Team/ })).toBeNull());
    expect(calls).toEqual([]);
  });

  it('a dialog whose chat is still there stays open', async () => {
    const calls: ChannelVars[] = [];
    const { rerender } = await mount(<Host ch={channel} calls={calls} />);
    await userEvent.click(within(teamRow()).getByRole('button', { name: strings['chan.chat.approve'] }));
    await screen.findByRole('alertdialog', { name: /Team/ });
    await rerender(<Host ch={without('d1')} calls={calls} />);
    expect(screen.getByRole('alertdialog', { name: /Team/ })).toBeInTheDocument();
  });
});
