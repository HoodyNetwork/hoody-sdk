// Vitest: what waits on the person in a chat app, the Chat apps badge, the bind command as each app accepts
// it, the Bot's private-chat address, the code lifetime and the Setup track's privacy step, all read from the channel list.
import { describe, expect, it } from 'vitest';
import { badgeCount, botAddress, commandText, groupMode, mentionOnly, pairingMinutes, privacyOn, setupSteps, waitingOf } from './chatFlow';
import { channelOf, type Channel, type ChatRow } from './data';

const view = (eff: Record<string, unknown> = {}) => ({ settings: {}, effective: Object.fromEntries(Object.entries(eff).map(([k, v]) => [k, { value: v, source: 'channel' }])) });
const owner = { id: 'p1', platformUser: '11', name: 'Ana', rights: ['chat' as const, 'control' as const], owner: true, lang: '' };
const chat = (id: string, kind: ChatRow['kind'], state: string): ChatRow => ({ id, platformChat: id, kind, title: id, state, view: view() });
const app = (o: Partial<Channel> = {}): Channel => ({
  id: 'ch', kind: 'telegram', label: 'App', enabled: true, state: 'running', needsOwner: false, people: 1, chats: 0, homeChat: null, reason: '',
  principals: [owner], chatRows: [], view: view(), notes: [], ...o,
});
const PRIVACY = [{ code: 'telegram_privacy_on', field: 'group_mode' }];

describe('waitingOf', () => {
  it('a running app with an owner and no asks waits for nothing', () => {
    expect(waitingOf(app())).toEqual([]);
  });

  it('counts each group that asks to be approved and opens on Chats', () => {
    const c = app({ chatRows: [chat('g1', 'group', 'requested'), chat('g2', 'group', 'requested'), chat('g3', 'group', 'approved'), chat('d1', 'dm', 'approved')] });
    expect(waitingOf(c)).toEqual([{ kind: 'requested', count: 2, section: 'chats' }]);
  });

  it('a private chat never counts as asking to join (only a group binds)', () => {
    expect(waitingOf(app({ chatRows: [chat('d1', 'dm', 'requested')] }))).toEqual([]);
  });

  it('names a refused token, a webhook, no owner and Telegram privacy, most urgent first, each on Setup', () => {
    const c = app({ state: 'auth_failed', reason: 'webhook_set', principals: [], notes: PRIVACY, chatRows: [chat('g', 'group', 'requested')] });
    expect(waitingOf(c).map((w) => [w.kind, w.section])).toEqual([
      ['signin', 'setup'],
      ['webhook', 'setup'],
      ['owner', 'setup'],
      ['requested', 'chats'],
      ['privacy', 'setup'],
    ]);
  });

  it('no owner: the agent says so, or none of its people is one', () => {
    expect(waitingOf(app({ needsOwner: true })).map((w) => w.kind)).toEqual(['owner']);
    expect(waitingOf(app({ principals: [{ ...owner, owner: false }] })).map((w) => w.kind)).toEqual(['owner']);
  });

  it('the privacy note counts only on Telegram', () => {
    expect(privacyOn(app({ notes: PRIVACY }))).toBe(true);
    expect(privacyOn(app({ kind: 'slack', notes: PRIVACY }))).toBe(false);
    expect(privacyOn(app({ notes: [{ code: 'mention_only_capability_unknown', field: 'mention_only' }] }))).toBe(false);
  });
});

describe('a paused app asks nothing', () => {
  const asking = { principals: [], notes: PRIVACY, chatRows: [chat('g1', 'group', 'requested')], reason: 'webhook_set' };
  it('an app the person paused has no waiting lines, whatever it would otherwise ask', () => {
    expect(waitingOf(app({ ...asking, state: 'paused' }))).toEqual([]);
  });

  it('while the Bot has its chat apps paused, every app asks nothing, a running one too', () => {
    expect(waitingOf(app(asking), true)).toEqual([]);
    expect(waitingOf(app({ ...asking, state: 'auth_failed' }), true)).toEqual([]);
  });

  it('the same app, not paused, still asks', () => {
    expect(waitingOf(app(asking)).length).toBeGreaterThan(0);
    expect(waitingOf(app(asking), false).length).toBeGreaterThan(0);
  });

  it('the badge counts only the apps that are not paused, and 0 while the Bot has them paused', () => {
    const paused = app({ ...asking, state: 'paused' });
    const sl = app({ id: 'sl', kind: 'slack', principals: [] });
    expect(badgeCount([paused, sl])).toBe(1);
    expect(badgeCount([paused, sl], true)).toBe(0);
  });
});

describe('badgeCount', () => {
  it('adds every waiting thing over every app, one per asking group, privacy on included', () => {
    const tg = app({ notes: PRIVACY, chatRows: [chat('g1', 'group', 'requested'), chat('g2', 'group', 'requested')] });
    const sl = app({ id: 'sl', kind: 'slack', needsOwner: true, principals: [] });
    expect(badgeCount([tg, sl])).toBe(4);
  });

  it('is 0 before the list is read and for apps that wait for nothing', () => {
    expect(badgeCount(undefined)).toBe(0);
    expect(badgeCount([app()])).toBe(0);
  });
});

describe('commandText', () => {
  it('uses each platform default prefix when the app reports none: / on Telegram, ! on Slack and Discord', () => {
    expect(commandText(app(), 'bind')).toBe('/bind');
    expect(commandText(app({ kind: 'slack' }), 'bind')).toBe('!bind');
    expect(commandText(app({ kind: 'discord' }), 'bind')).toBe('!bind');
  });

  it("uses the app's own prefix", () => {
    expect(commandText(app({ kind: 'discord', view: view({ command_prefix: '~' }) }), 'bind')).toBe('~bind');
  });

  it('is null when the app turned the command off, and present when its list has it', () => {
    expect(commandText(app({ view: view({ chat_commands: ['status', 'help'] }) }), 'bind')).toBeNull();
    expect(commandText(app({ view: view({ chat_commands: ['bind'] }) }), 'bind')).toBe('/bind');
  });
});

describe('the app settings the steps quote', () => {
  it('mentions only is on unless the app turned it off', () => {
    expect(mentionOnly(app())).toBe(true);
    expect(mentionOnly(app({ view: view({ mention_only: false }) }))).toBe(false);
  });

  it('the code lifetime is pairing_ttl_minutes, 15 when unknown', () => {
    expect(pairingMinutes(app({ view: view({ pairing_ttl_minutes: 30 }) }))).toBe(30);
    expect(pairingMinutes(app())).toBe(15);
    expect(pairingMinutes(app({ view: view({ pairing_ttl_minutes: 0 }) }))).toBe(15);
  });
});

describe('botAddress', () => {
  it('Telegram: @name and a t.me link to its private chat', () => {
    expect(botAddress(app({ identity: { name: 'A', username: 'atlas_bot', inviteUrl: '' } }))).toEqual({ at: '@atlas_bot', link: 'https://t.me/atlas_bot' });
  });

  it('Discord: @name, no link (its invite link is for servers)', () => {
    expect(botAddress(app({ kind: 'discord', identity: { name: 'A', username: 'atlas', inviteUrl: 'https://discord.com/x' } }))).toEqual({ at: '@atlas', link: '' });
  });

  it('none when the name is unknown or not a plain username', () => {
    expect(botAddress(app())).toBeNull();
    expect(botAddress(app({ identity: { name: 'A', username: 'evil/../x', inviteUrl: '' } }))).toBeNull();
  });
});

describe('channelOf identity', () => {
  it('reads the username without its @ and keeps only an https invite link', () => {
    const c = channelOf({ id: 'c', kind: 'discord', identity: { name: 'Bot', username: '@atlas', invite_url: 'https://discord.com/oauth2/authorize?client_id=1' } });
    expect(c.identity).toEqual({ name: 'Bot', username: 'atlas', inviteUrl: 'https://discord.com/oauth2/authorize?client_id=1' });
    expect(channelOf({ id: 'c', kind: 'discord', identity: { invite_url: 'javascript:alert(1)' } }).identity?.inviteUrl).toBe('');
  });

  it('no identity when the agent has not read the Bot yet', () => {
    expect(channelOf({ id: 'c', kind: 'telegram' }).identity).toBeUndefined();
  });
});

// The agent sends no Telegram privacy note both when privacy is off and when it never
// checked, so a missing note proves nothing (C9); and the group steps follow the app's group access setting.
describe('privacy and group steps', () => {
  it('Telegram without the privacy note: the privacy step is unknown, never ticked done', () => {
    const p = setupSteps(app()).find((x) => x.id === 'privacy');
    expect(p).toMatchObject({ state: 'unknown', segment: 'unknown' });
  });

  it('Telegram with the privacy note: the privacy step is to do, not unknown', () => {
    const p = setupSteps(app({ notes: PRIVACY })).find((x) => x.id === 'privacy');
    expect(p).toMatchObject({ state: 'now', segment: 'limited' });
  });

  it('no other step is ever unknown', () => {
    for (const kind of ['slack', 'discord'] as const) expect(setupSteps(app({ kind })).some((x) => x.state === 'unknown' || x.segment === 'unknown')).toBe(false);
    expect(setupSteps(app()).filter((x) => x.state === 'unknown').map((x) => x.id)).toEqual(['privacy']);
  });

  it('groupMode reads the effective group access; the agent default when absent; nothing for a value it does not know', () => {
    expect(groupMode(app())).toBe('owner_approves');
    for (const m of ['off', 'owner_approves', 'allowlist', 'open'] as const) expect(groupMode(app({ view: view({ group_mode: m }) }))).toBe(m);
    expect(groupMode(app({ view: view({ group_mode: 'later' }) }))).toBeNull();
  });
});
