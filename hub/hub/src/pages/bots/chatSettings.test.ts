// Vitest: the settings registry against the agent's published schema (chatSettings.schema.json, frozen from the agent), the
// placement of every setting, value checks, request bodies, and what counts as a change.
import { describe, expect, it } from 'vitest';
import {
  SETTING_GROUPS,
  SETTING_ROWS,
  chatSettingsBody,
  botSettingsBody,
  channelSettingsBody,
  enumFor,
  parseSetting,
  settingDiffers,
  settingRow,
  settingRows,
  type SettingRow,
  type SettingsView,
} from './chatSettings';
import FX from './chatSettings.schema.json';
import strings from './strings.en.json';

const names = (rows: readonly SettingRow[]) => rows.map((r) => r.name).sort();
const row = (n: string): SettingRow => settingRow(n) as SettingRow;
type Sch = { type: string; enum?: string[]; minimum?: number; maximum?: number };

describe('the registry matches the agent schema', () => {
  it('channel scope: the same 52 settings (settings plus top-level enabled and home_chat)', () => {
    expect(names(settingRows('channel', ''))).toEqual(Object.keys(FX.channel).sort());
    expect(Object.keys(FX.channel)).toHaveLength(52);
  });
  it('Bot scope: the same 6 settings, and chat scope the same 7', () => {
    expect(names(settingRows('bot', ''))).toEqual(Object.keys(FX.bot).sort());
    expect(names(settingRows('chat', ''))).toEqual(Object.keys(FX.chat).sort());
  });
  it('56 settings in all, each named once', () => {
    expect(SETTING_ROWS).toHaveLength(56);
    expect(new Set(SETTING_ROWS.map((r) => r.name)).size).toBe(56);
  });
  it('kinds, enums and ranges agree with the schema at every scope', () => {
    const bad: string[] = [];
    for (const [scope, fx] of [['channel', FX.channel], ['bot', FX.bot], ['chat', FX.chat]] as const) {
      for (const [name, sch] of Object.entries(fx as Record<string, Sch>)) {
        const r = row(name);
        const want = ({ boolean: ['bool'], integer: ['int'], number: ['num'], string: ['enum', 'chat'], array: ['set', 'ids'] } as Record<string, string[]>)[sch.type] ?? [];
        if (!want.includes(r.kind)) bad.push(`${scope}.${name}: kind ${r.kind} vs ${sch.type}`);
        if (sch.enum && JSON.stringify(r.values) !== JSON.stringify(sch.enum)) bad.push(`${scope}.${name}: enum`);
        if (r.kind === 'int') {
          const lo = r.zeroOff ? 0 : r.min;
          if (sch.minimum !== undefined && sch.minimum !== lo) bad.push(`${scope}.${name}: min ${lo} vs ${sch.minimum}`);
          if (sch.maximum !== undefined && sch.maximum !== r.max) bad.push(`${scope}.${name}: max ${r.max} vs ${sch.maximum}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
  it('the agent unset lists cover every setting the Hub can send', () => {
    const sendable = (scope: 'channel' | 'bot') => settingRows(scope, '').filter((r) => r.place !== 'ro' && r.place !== 'act' && r.name !== 'home_chat');
    for (const r of sendable('channel')) expect(FX.channel_unset).toContain(r.name);
  });
  it('every setting, group, value and note has words', () => {
    const missing: string[] = [];
    for (const r of SETTING_ROWS) {
      if (r.place !== 'act' && r.name !== 'channels_paused' && !(`set.n.${r.name}` in strings)) missing.push(`set.n.${r.name}`);
      for (const v of r.values ?? []) {
        const wording = ['dm_policy', 'group_mode', 'gate_deciders', 'push_events', 'unpaired_reply', 'command_denied_reply', 'gate_cards', 'gate_detail', 'push_detail', 'reply_style', 'format', 'parse_mode', 'split_at', 'default_rights', 'pairing_rights', 'chat_commands', 'shared_identity'];
        if (wording.includes(r.name) && !(`set.v.${r.name}.${v}` in strings)) missing.push(`set.v.${r.name}.${v}`);
      }
    }
    for (const g of SETTING_GROUPS) if (!(`set.g.${g}` in strings)) missing.push(`set.g.${g}`);
    expect(missing).toEqual([]);
  });
});

describe('placement: every setting has one home', () => {
  it('main holds the five plain controls', () => {
    expect(names(settingRows('channel', '', 'main'))).toEqual(['dm_policy', 'gate_deciders', 'group_mode', 'home_chat', 'push_events']);
  });
  it('read-only rows are shown, never sent', () => {
    expect(names(SETTING_ROWS.filter((r) => r.place === 'ro'))).toEqual(['channel_lease', 'hide_secrets', 'shared_identity']);
    expect(channelSettingsBody({ hide_secrets: false, channel_lease: false, shared_identity: 'off', format: 'plain' })).toEqual({ settings: { format: 'plain' } });
  });
  it('enabled and channels_paused change only through their own actions', () => {
    expect(names(SETTING_ROWS.filter((r) => r.place === 'act'))).toEqual(['channels_paused', 'enabled']);
    expect(channelSettingsBody({ enabled: false })).toBeUndefined();
  });
  it('platform-only rows show only for their platform', () => {
    expect(names(settingRows('channel', 'slack'))).toContain('connection_opens_per_hour');
    expect(names(settingRows('channel', 'telegram'))).not.toContain('connection_opens_per_hour');
    expect(names(settingRows('channel', 'discord'))).toContain('identify_per_day');
    expect(names(settingRows('channel', 'telegram'))).toContain('parse_mode');
  });
});

describe('value checks', () => {
  it('integers within range, zero allowed where it means off', () => {
    expect(parseSetting(row('max_parts'), 'telegram', '5')).toEqual({ ok: true, value: 5 });
    expect(parseSetting(row('max_parts'), 'telegram', '21').ok).toBe(false);
    expect(parseSetting(row('max_parts'), 'telegram', '1.5').ok).toBe(false);
    expect(parseSetting(row('gate_ttl_minutes'), 'telegram', '0')).toEqual({ ok: true, value: 0 });
    const neg = parseSetting(row('gate_ttl_minutes'), 'telegram', '-1');
    expect(neg.ok ? '' : neg.why.key).toBe('set.outOfRangeOff');
  });
  it('part_chars tops out at the platform limit', () => {
    expect(parseSetting(row('part_chars'), 'discord', '2001').ok).toBe(false);
    expect(parseSetting(row('part_chars'), 'discord', '2000').ok).toBe(true);
    expect(parseSetting(row('part_chars'), 'telegram', '4096').ok).toBe(true);
  });
  it('the / command prefix is Telegram only', () => {
    expect(enumFor(row('command_prefix'), 'telegram')).toContain('/');
    expect(enumFor(row('command_prefix'), 'slack')).not.toContain('/');
    expect(parseSetting(row('command_prefix'), 'discord', '/').ok).toBe(false);
  });
  it('sets keep registry order, unknown members refused', () => {
    expect(parseSetting(row('push_events'), '', ['gate', 'report'])).toEqual({ ok: true, value: ['report', 'gate'] });
    expect(parseSetting(row('push_events'), '', ['nope']).ok).toBe(false);
  });
  it('id lists split on commas and lines, deduplicated, controls refused, capped', () => {
    expect(parseSetting(row('blocked_users'), '', '12, 34\n12')).toEqual({ ok: true, value: ['12', '34'] });
    expect(parseSetting(row('blocked_users'), '', 'a\u0007b').ok).toBe(false);
    expect(parseSetting(row('blocked_users'), '', Array.from({ length: 201 }, (_, i) => `u${i}`).join('\n')).ok).toBe(false);
  });
  it('home chat: a chat id of this app, or empty to remove it', () => {
    expect(parseSetting(row('home_chat'), '', 'c1', ['c1', 'c3']).ok).toBe(true);
    expect(parseSetting(row('home_chat'), '', 'c2', ['c1', 'c3']).ok).toBe(false);
    expect(parseSetting(row('home_chat'), '', '', ['c1'])).toEqual({ ok: true, value: null });
  });
  it('null always means use the default, whatever the kind', () => {
    for (const r of SETTING_ROWS) expect(parseSetting(r, 'telegram', null)).toEqual({ ok: true, value: null });
  });
  it('a number setting above zero only', () => {
    expect(parseSetting(row('outbound_rate'), '', '0.5')).toEqual({ ok: true, value: 0.5 });
    expect(parseSetting(row('outbound_rate'), '', '0').ok).toBe(false);
    expect(parseSetting(row('outbound_rate'), '', 'abc').ok).toBe(false);
  });
  it('the send rate stops at the platform limit of one message a second, and says so', () => {
    for (const kind of ['telegram', 'slack', 'discord']) {
      expect(parseSetting(row('outbound_rate'), kind, '1')).toEqual({ ok: true, value: 1 });
      expect(parseSetting(row('outbound_rate'), kind, '2')).toEqual({ ok: false, why: { key: 'set.aboveCeiling', max: 1 } });
    }
  });
  it('an id in a list must have the shape of the platform, a user id for blocked people and a chat id for chats', () => {
    // Telegram: signed integers
    expect(parseSetting(row('blocked_users'), 'telegram', '123\n-456').ok).toBe(true);
    expect(parseSetting(row('blocked_users'), 'telegram', 'abc')).toEqual({ ok: false, why: { key: 'set.badId' } });
    // Slack: users are U or W ids, conversations C, D or G ids
    expect(parseSetting(row('blocked_users'), 'slack', 'U01ABCDEF').ok).toBe(true);
    expect(parseSetting(row('blocked_users'), 'slack', 'C01ABCDEF').ok).toBe(false);
    expect(parseSetting(row('blocked_users'), 'slack', '123').ok).toBe(false);
    expect(parseSetting(row('blocked_chats'), 'slack', 'C01ABCDEF').ok).toBe(true);
    expect(parseSetting(row('allowed_chats'), 'slack', 'U01ABCDEF').ok).toBe(false);
    // Discord: snowflakes
    expect(parseSetting(row('blocked_users'), 'discord', '123456789012345678').ok).toBe(true);
    expect(parseSetting(row('blocked_users'), 'discord', 'abc').ok).toBe(false);
    expect(parseSetting(row('allowed_chats'), 'discord', '1234').ok).toBe(false);
  });
});

describe('request bodies', () => {
  it('home_chat goes at the top level and the rest inside settings, in one body', () => {
    expect(channelSettingsBody({ dm_policy: 'open', home_chat: 'c1', format: null })).toEqual({ home_chat: 'c1', settings: { dm_policy: 'open', format: null } });
    expect(channelSettingsBody({ home_chat: null })).toEqual({ home_chat: null });
  });
  it('names that are not channel settings are left out; nothing left means no body', () => {
    expect(channelSettingsBody({ rate_bot_per_day: 5, nope: 1 })).toBeUndefined();
    expect(channelSettingsBody({})).toBeUndefined();
  });
  it('a chat takes only its own seven settings, all inside settings', () => {
    expect(chatSettingsBody({ mention_only: false, dm_policy: 'open', reply_style: null })).toEqual({ settings: { mention_only: false, reply_style: null } });
    expect(chatSettingsBody({ dm_policy: 'open' })).toBeUndefined();
  });
});

describe('the Bot-wide body', () => {
  it('holds only the Bot settings that have no action of their own, at the top level', () => {
    expect(botSettingsBody({ lang: 'de', max_channels: 3, rate_bot_per_day: null })).toEqual({ lang: 'de', max_channels: 3, rate_bot_per_day: null });
    expect(botSettingsBody({ channels_paused: true, hide_secrets: false, shared_identity: 'off', dm_policy: 'open' })).toBeUndefined();
  });
});

describe('what counts as a change', () => {
  const view: SettingsView = {
    settings: { dm_policy: 'open', blocked_users: [] },
    effective: {
      dm_policy: { value: 'open', source: 'channel' },
      group_mode: { value: 'owner_approves', source: 'default' },
      mention_only: { value: true, source: 'default' },
      home_chat: { value: null, source: 'default' },
      blocked_users: { value: [], source: 'channel' },
    },
  };
  it('the same value as is stored or in force is no change', () => {
    expect(settingDiffers(view, 'dm_policy', 'open')).toBe(false);
    expect(settingDiffers(view, 'group_mode', 'owner_approves')).toBe(false);
    expect(settingDiffers(view, 'group_mode', 'open')).toBe(true);
  });
  it('a stored value is compared before the effective one', () => {
    const forced: SettingsView = { settings: { mention_only: false }, effective: { mention_only: { value: true, source: 'channel' } } };
    expect(settingDiffers(forced, 'mention_only', false)).toBe(false);
    expect(settingDiffers(forced, 'mention_only', true)).toBe(true);
  });
  it('use the default is a change only when the scope stores the setting or set the value in force', () => {
    expect(settingDiffers(view, 'dm_policy', null)).toBe(true);
    expect(settingDiffers(view, 'blocked_users', null)).toBe(true);
    expect(settingDiffers(view, 'group_mode', null)).toBe(false);
    expect(settingDiffers(view, 'home_chat', null)).toBe(false);
    expect(settingDiffers({ settings: {}, effective: { home_chat: { value: 'c1', source: 'channel' } } }, 'home_chat', null)).toBe(true);
  });
  it('lists compare by content, not identity', () => {
    expect(settingDiffers({ settings: {}, effective: { push_events: { value: ['report'], source: 'default' } } }, 'push_events', ['report'])).toBe(false);
  });
});
