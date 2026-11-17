// Vitest: a group asking a chat app to be let in, and Telegram privacy, are seen without opening the app.
// The agent's channel summary carries requested_chats and the app's notes (capability bot_channel_waiting), a chat its can_read.
// The Bots table's Chat apps cell says "2 groups waiting" and "Telegram privacy on"; the Bot's header offers "2 groups are waiting"
// (to Chat apps); the Bots badge and Home's "Bots are waiting for you" count such a Bot (core botNeedsYou); a Telegram group the bot
// cannot read says so on its row. An older agent's summary (no fields) shows none of it.
import { renderPage, screen, userEvent, within } from '@app/testing';
import { botNeedsYou, botWaiting } from '@core';
import { beforeAll, describe, expect, it } from 'vitest';
import { channelOf, chatsWaitingOf, privacyOnOf, rowOf } from './data';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const KEY = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
// The Bot's header button when two groups wait (the chatsWaiting fixture).
const GROUPS_2 = strings['bot.primary.groupWaiting_other'].replace('{{count}}', '2');
const summary = { kind: 'telegram', requested_chats: 2, notes: [{ code: 'telegram_privacy_on', field: 'group_mode', reason: 'x' }] };

describe('reading the summary', () => {
  it('counts the waiting groups over every app and sees the privacy note; an older agent shows nothing', () => {
    const b = { id: 'chief', realm: 'global', channels: [summary, { kind: 'slack', requested_chats: 1, notes: [] }] };
    expect(chatsWaitingOf(b)).toBe(3);
    expect(privacyOnOf(b)).toBe(true);
    const r = rowOf(b, 'c1');
    expect([r.chatsWaiting, r.privacyOn]).toEqual([3, true]);
    const old = rowOf({ id: 'chief', realm: 'global', channels: [{ kind: 'telegram', state: 'connected' }] }, 'c1');
    expect([old.chatsWaiting, old.privacyOn]).toEqual([0, false]);
    expect(chatsWaitingOf({ channels: [{ requested_chats: -1 }, { requested_chats: 'x' }, { requested_chats: Number.NaN }] })).toBe(0);
  });

  it('a chat keeps can_read only when the agent says it', () => {
    const ch = channelOf({ id: 'ch', kind: 'telegram', chats: [{ id: 'a', kind: 'group', can_read: false }, { id: 'b', kind: 'group', can_read: true }, { id: 'c', kind: 'group' }] });
    expect(ch.chatRows.map((c) => c.canRead)).toEqual([false, true, undefined]);
  });

  it('the badge counts a Bot whose app holds a waiting group; the waiting status stays the gate rule', () => {
    const b = { id: 'chief', channels: [summary] };
    expect(botNeedsYou(b)).toBe(true);
    expect(botWaiting(b)).toBe(false);
    expect(botNeedsYou({ id: 'x', channels: [{ requested_chats: 0 }] })).toBe(false);
    expect(botNeedsYou({ id: 'x', pending_gate: { gate_id: 'g1' } })).toBe(true);
  });
});

// A paused app asks nothing anywhere, not only on the Chat apps tab. The
// daemon marks every app paused while the Bot has its chat apps paused (state_reason bot_paused), so the app's own state
// is the one rule for the list's tags, the Bot's "2 groups are waiting", and the Bots badge and Home's count.
describe('a paused app asks nothing outside the Chat apps tab either', () => {
  const paused = { ...summary, state: 'paused' };
  it('its waiting groups and privacy note are not counted, while an unpaused app beside it still is', () => {
    expect(chatsWaitingOf({ channels: [paused] })).toBe(0);
    expect(privacyOnOf({ channels: [paused] })).toBe(false);
    const mixed = { id: 'chief', realm: 'global', channels: [paused, { kind: 'slack', state: 'connected', requested_chats: 1, notes: [] }] };
    expect(chatsWaitingOf(mixed)).toBe(1);
    expect(privacyOnOf(mixed)).toBe(false);
    const r = rowOf({ id: 'chief', realm: 'global', channels: [paused] }, 'c1');
    expect([r.chatsWaiting, r.privacyOn]).toEqual([0, false]);
  });

  it('the Bots badge and Home do not count a Bot whose only asking app is paused; a waiting gate still counts', () => {
    expect(botNeedsYou({ id: 'chief', channels: [paused] })).toBe(false);
    expect(botNeedsYou({ id: 'chief', channels: [paused, { ...summary, state: 'connected' }] })).toBe(true);
    expect(botNeedsYou({ id: 'chief', channels: [paused], pending_gate: { gate_id: 'g1' } })).toBe(true);
  });
});

describe('on the page', () => {
  it('the Bots table says how many groups wait and that Telegram privacy is on', async () => {
    await renderPage(page, { state: 'chatsWaiting' });
    const row = (await screen.findAllByText('Chief')).map((el) => el.closest('tr')).find(Boolean) as HTMLElement;
    expect(within(row).getByText('2 groups waiting')).toBeInTheDocument();
    // The app's name is drawn with its mark (ChatNames), so the words are split across elements.
    expect(row.textContent).toMatch(/Telegram\s*privacy on/);
  });

  it('the Bot header offers the waiting group and opens Chat apps', async () => {
    await renderPage(page, { state: 'chatsWaiting', path: `/bots?sel=${encodeURIComponent(KEY)}` });
    await userEvent.click(await screen.findByRole('button', { name: GROUPS_2 }));
    expect(await screen.findByText('Support chat')).toBeInTheDocument();
  });

  // The Bot's view can be a refetch behind the pause, so its attention still names a
  // chat app while the channel settings say paused. A paused app asks nothing: the header offers no Fix for it (the Chat apps badge is
  // hidden by the same fact, apps.table.test).
  it.each(['chatsWaitingPausedBot', 'chatAppAttentionPausedBot', 'chatAppsBothPausedBot'] as const)('%s: while the chat apps are paused the header offers no Fix or groups waiting', async (state) => {
    await renderPage(page, { state, path: `/bots?sel=${encodeURIComponent(KEY)}&tab=apps` });
    await screen.findByRole('button', { name: strings['chan.resumeAll'] });
    expect(screen.queryByRole('button', { name: GROUPS_2 })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['bot.primary.fixApps'] })).toBeNull();
  });

  it('a model that needs a key keeps its Fix to the settings while the chat apps are paused, and names no group', async () => {
    await renderPage(page, { state: 'needsKeyChatsPausedBot', path: `/bots?sel=${encodeURIComponent(KEY)}&tab=apps` });
    await screen.findByRole('button', { name: strings['chan.resumeAll'] });
    expect(screen.getByRole('button', { name: strings['bot.primary.fix'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: GROUPS_2 })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['bot.primary.fixApps'] })).toBeNull();
  });

  it('a Telegram group the bot cannot read says so on its row; a group it reads does not', async () => {
    await renderPage(page, { state: 'chatsWaiting', path: `/bots?sel=${encodeURIComponent(KEY)}&tab=apps&app=ch-tg` });
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.rail.chats'] }));
    // The group's name also shows in the drawer's title and summary: find the row from its note instead.
    const notes = await screen.findAllByText(strings['chan.chat.cantRead']);
    expect(notes).toHaveLength(1);
    const row = notes[0]!.closest('tr') as HTMLElement;
    expect(within(row).getByText('Support chat')).toBeInTheDocument();
  });
});
