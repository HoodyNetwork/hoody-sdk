// Chat app settings: what the Hub knows about the agent's settings registry without asking it. The registry places each
// setting (main, all, read-only or changed by its own action), picks its control and checks a number's range before a send.
// The agent stays the validator, and every value shown is the agent's `effective` value, never a default kept here.
// chatSettings.test.ts compares the names, scopes and kinds with the agent's published schema.
import type { ChannelKind } from './data';

export type SettingScope = 'bot' | 'channel' | 'chat';
export type SettingKind = 'bool' | 'int' | 'num' | 'enum' | 'set' | 'ids' | 'chat';
/** main: the plain controls; all: under All settings; ro: shown, never sent; act: changed by its own action. */
export type SettingPlace = 'main' | 'all' | 'ro' | 'act';
export type SettingGroup = 'Access' | 'Gates' | 'Updates' | 'Format' | 'Limits' | 'Commands' | 'Advanced';

export interface SettingRow {
  name: string;
  group: SettingGroup;
  scopes: readonly SettingScope[];
  kind: SettingKind;
  /** enum and set: the allowed values. */
  values: readonly string[] | null;
  /** int and ids: the range (ids: the most items). */
  min: number;
  max: number;
  place: SettingPlace;
  /** 0 is also allowed (off). */
  zeroOff: boolean;
  /** The only platform it applies to. */
  only: ChannelKind | null;
  /** A change applies when the chat app reconnects. */
  restart: boolean;
}

export const SETTING_GROUPS: readonly SettingGroup[] = ['Access', 'Gates', 'Updates', 'Format', 'Limits', 'Commands', 'Advanced'];
export const SET_RIGHTS = ['chat', 'control', 'gates'] as const;
export const LANGS = ['en', 'de', 'fr', 'es', 'pt', 'it', 'ja', 'zh'] as const;
export const PUSH_EVENTS = ['report', 'gate', 'gone', 'stop', 'waiter', 'limit', 'budget', 'error', 'provider', 'not_sent', 'reset'] as const;
export const CHAT_COMMANDS = ['status', 'stop', 'bind', 'unbind', 'help'] as const;

type Scopes = 'b' | 'c' | 'bc' | 'ct';
const SCOPE: Record<string, SettingScope> = { b: 'bot', c: 'channel', t: 'chat' };
interface Flags {
  z?: true;
  k?: ChannelKind;
  r?: true;
}
// [name, group, scopes, kind, enum values or [min, max], place, flags]
type Reg = readonly [string, SettingGroup, Scopes, SettingKind, readonly string[] | readonly [number, number] | null, SettingPlace, Flags?];
const REG: readonly Reg[] = [
  ['dm_policy', 'Access', 'c', 'enum', ['owner', 'allowlist', 'pairing', 'open'], 'main'],
  ['group_mode', 'Access', 'c', 'enum', ['off', 'owner_approves', 'allowlist', 'open'], 'main'],
  ['mention_only', 'Access', 'ct', 'bool', null, 'all'],
  ['default_rights', 'Access', 'c', 'set', SET_RIGHTS, 'all'],
  ['blocked_users', 'Access', 'c', 'ids', [0, 200], 'all'],
  ['blocked_chats', 'Access', 'c', 'ids', [0, 200], 'all'],
  ['allowed_chats', 'Access', 'c', 'ids', [0, 200], 'all'],
  ['unpaired_reply', 'Access', 'c', 'enum', ['hint', 'silent'], 'all'],
  ['command_denied_reply', 'Access', 'c', 'enum', ['hint', 'silent'], 'all'],
  ['pairing_ttl_minutes', 'Access', 'c', 'int', [1, 1440], 'all'],
  ['pairing_rights', 'Access', 'c', 'set', SET_RIGHTS, 'all'],
  ['max_principals', 'Access', 'c', 'int', [1, 32], 'all'],
  ['pairing_user_burn_tries', 'Access', 'c', 'int', [1, 20], 'all'],
  ['pairing_user_burn_minutes', 'Access', 'c', 'int', [1, 1440], 'all'],
  ['pairing_code_burn_tries', 'Access', 'c', 'int', [5, 200], 'all'],
  ['gate_cards', 'Gates', 'c', 'enum', ['on', 'links', 'off'], 'all'],
  ['gate_deciders', 'Gates', 'c', 'enum', ['none', 'owner', 'named', 'principals'], 'main'],
  ['decide_in_groups', 'Gates', 'c', 'bool', null, 'all'],
  ['gate_detail', 'Gates', 'c', 'enum', ['summary', 'minimal'], 'all'],
  ['gate_ttl_minutes', 'Gates', 'c', 'int', [1, 10080], 'all', { z: true }],
  ['push_events', 'Updates', 'c', 'set', PUSH_EVENTS, 'main'],
  ['push_detail', 'Updates', 'c', 'enum', ['brief', 'full'], 'all'],
  ['wake_replies', 'Updates', 'c', 'bool', null, 'all'],
  ['mirror_other_doors', 'Updates', 'c', 'bool', null, 'all'],
  ['home_chat', 'Updates', 'c', 'chat', null, 'main'],
  ['no_reply_notice', 'Updates', 'c', 'bool', null, 'all'],
  ['delivery_expiry_hours', 'Updates', 'c', 'int', [1, 168], 'all'],
  ['typing', 'Format', 'c', 'bool', null, 'all'],
  ['reply_style', 'Format', 'ct', 'enum', ['thread', 'reply', 'plain'], 'all'],
  ['format', 'Format', 'ct', 'enum', ['rich', 'plain'], 'all'],
  ['parse_mode', 'Format', 'c', 'enum', ['html', 'plain'], 'all', { k: 'telegram' }],
  ['part_chars', 'Format', 'c', 'int', [200, 4096], 'all'],
  ['split_at', 'Format', 'c', 'enum', ['paragraph', 'line', 'word'], 'all'],
  ['max_parts', 'Format', 'c', 'int', [1, 20], 'all'],
  ['overflow_note', 'Format', 'c', 'bool', null, 'all'],
  ['lang', 'Format', 'bc', 'enum', LANGS, 'all'],
  ['show_sender_name', 'Format', 'c', 'bool', null, 'all'],
  ['max_text_bytes', 'Limits', 'c', 'int', [256, 65536], 'all'],
  ['rate_user_per_min', 'Limits', 'ct', 'int', [0, 600], 'all'],
  ['rate_user_per_hour', 'Limits', 'ct', 'int', [0, 3600], 'all'],
  ['rate_user_per_day', 'Limits', 'ct', 'int', [0, 20000], 'all'],
  ['rate_chat_per_min', 'Limits', 'ct', 'int', [0, 600], 'all'],
  ['rate_bot_per_day', 'Limits', 'b', 'int', [0, 3000], 'all'],
  ['outbound_rate', 'Limits', 'c', 'num', null, 'all'],
  ['reconnect_backoff_max_seconds', 'Limits', 'c', 'int', [5, 600], 'all'],
  ['identify_per_hour', 'Limits', 'c', 'int', [1, 60], 'all', { k: 'discord' }],
  ['identify_per_day', 'Limits', 'c', 'int', [1, 500], 'all', { k: 'discord' }],
  ['connection_opens_per_hour', 'Limits', 'c', 'int', [1, 120], 'all', { k: 'slack' }],
  ['command_prefix', 'Commands', 'c', 'enum', ['!', '.', ';', '~', '/'], 'all'],
  ['chat_commands', 'Commands', 'c', 'set', CHAT_COMMANDS, 'all'],
  ['hide_secrets', 'Advanced', 'bc', 'bool', null, 'ro'],
  ['enabled', 'Advanced', 'c', 'bool', null, 'act', { r: true }],
  ['channels_paused', 'Advanced', 'b', 'bool', null, 'act'],
  ['shared_identity', 'Advanced', 'b', 'enum', ['off'], 'ro', { r: true }],
  ['max_channels', 'Advanced', 'b', 'int', [1, 8], 'all'],
  ['channel_lease', 'Advanced', 'c', 'bool', null, 'ro', { r: true }],
];

export const SETTING_ROWS: readonly SettingRow[] = REG.map(([name, group, scopes, kind, v, place, f]) => {
  const range = kind === 'int' || kind === 'ids';
  const bounds = range ? (v as readonly [number, number]) : null;
  return {
    name,
    group,
    scopes: scopes.split('').map((c) => SCOPE[c] as SettingScope),
    kind,
    values: range ? null : (v as readonly string[] | null),
    min: bounds?.[0] ?? 0,
    max: bounds?.[1] ?? 0,
    place,
    zeroOff: f?.z === true,
    only: f?.k ?? null,
    restart: f?.r === true,
  };
});

const BY_NAME = new Map(SETTING_ROWS.map((r) => [r.name, r]));
export const settingRow = (name: string): SettingRow | undefined => BY_NAME.get(name);

/** Top-level members of a channel PATCH: the agent refuses them inside `settings`. */
const TOP = new Set(['enabled', 'home_chat']);

const PART_MAX: Record<string, number> = { telegram: 4096, slack: 3900, discord: 2000 };

/** The rows a channel of platform `kind` shows at `scope`, in table order; `place` narrows to one placement. */
export function settingRows(scope: SettingScope, kind: ChannelKind | '', place?: SettingPlace): SettingRow[] {
  return SETTING_ROWS.filter((r) => r.scopes.includes(scope) && (!r.only || !kind || r.only === kind) && (!place || r.place === place));
}

/** The rows under "All settings": everything shown that is not a main control or its own action. */
export const allSettingRows = (scope: SettingScope, kind: ChannelKind | ''): SettingRow[] => settingRows(scope, kind).filter((r) => r.place === 'all' || r.place === 'ro');

export const maxFor = (r: SettingRow, kind: string): number => (r.name === 'part_chars' ? (PART_MAX[kind] ?? r.max) : r.max);
export const enumFor = (r: SettingRow, kind: string): readonly string[] => (r.name === 'command_prefix' && kind !== 'telegram' ? (r.values ?? []).slice(0, 4) : (r.values ?? []));

/** Why a typed value was refused: a strings key (and its values) for the field's message. */
export type SettingRefusal = { key: 'set.outOfRange' | 'set.outOfRangeOff' | 'set.aboveCeiling' | 'set.badId' | 'set.invalid'; min?: number; max?: number };
export type Parsed = { ok: true; value: unknown } | { ok: false; why: SettingRefusal };

const ID_TEXT = /^[^\u0000-\u001f\u007f]{1,256}$/;
const INVALID: Parsed = { ok: false, why: { key: 'set.invalid' } };

/** The most messages per second one chat takes: the agent's ceiling for every platform. */
export const OUTBOUND_RATE_MAX = 1;

// The id shapes the agent checks (a Telegram id is a signed integer; Slack users are U or W ids and conversations C, D or G ids; a
// Discord id is a snowflake). Checked here only so a wrong id is explained before a send; the agent stays the validator.
const ID_SHAPE: Record<string, { user: RegExp; chat: RegExp }> = {
  telegram: { user: /^-?[0-9]{1,20}$/, chat: /^-?[0-9]{1,20}$/ },
  slack: { user: /^[UW][A-Z0-9]{2,20}$/, chat: /^[CDG][A-Z0-9]{2,20}$/ },
  discord: { user: /^[0-9]{17,20}$/, chat: /^[0-9]{17,20}$/ },
};
/** The one list of user ids; the other id lists hold chat ids. */
const USER_ID_LIST = 'blocked_users';

/** Has this id the shape of a user or a chat id of the platform? An unknown platform is not judged. */
export function platformIdOk(kind: string, role: 'user' | 'chat', id: string): boolean {
  const shape = ID_SHAPE[kind]?.[role];
  return shape === undefined || shape.test(id);
}

/** The most characters (code points) the agent takes for the name of a chat app or of a person. */
export const NAME_MAX = 64;
export const tooLong = (text: string): boolean => [...text].length > NAME_MAX;

/** A chat that may be the home chat: a direct message, or an approved group. */
export const homeChatOptions = <C extends { kind: string; state: string }>(chats: readonly C[]): C[] => chats.filter((c) => c.kind === 'dm' || (c.kind === 'group' && c.state === 'approved'));

/** A value typed or picked → the value to send, or why not. null puts the setting back to what it inherits. */
export function parseSetting(r: SettingRow, kind: string, raw: unknown, homeIds: readonly string[] = []): Parsed {
  if (raw === null) return { ok: true, value: null };
  switch (r.kind) {
    case 'bool':
      return typeof raw === 'boolean' ? { ok: true, value: raw } : INVALID;
    case 'int': {
      const s = String(raw).trim();
      const n = /^-?[0-9]{1,9}$/.test(s) ? Number(s) : NaN;
      const max = maxFor(r, kind);
      if (!Number.isNaN(n) && ((r.zeroOff && n === 0) || (n >= r.min && n <= max))) return { ok: true, value: n };
      return { ok: false, why: { key: r.zeroOff ? 'set.outOfRangeOff' : 'set.outOfRange', min: r.min, max } };
    }
    case 'num': {
      const text = String(raw).trim();
      const x = Number(text);
      if (text === '' || !Number.isFinite(x) || x <= 0) return INVALID;
      if (r.name === 'outbound_rate' && x > OUTBOUND_RATE_MAX) return { ok: false, why: { key: 'set.aboveCeiling', max: OUTBOUND_RATE_MAX } };
      return { ok: true, value: x };
    }
    case 'enum':
      return typeof raw === 'string' && enumFor(r, kind).includes(raw) ? { ok: true, value: raw } : INVALID;
    case 'set': {
      if (!Array.isArray(raw) || raw.some((x) => !(r.values ?? []).includes(String(x)))) return INVALID;
      return { ok: true, value: (r.values ?? []).filter((v) => raw.includes(v)) };
    }
    case 'ids': {
      const ids = String(raw).split(/[\n,]/).map((v) => v.trim()).filter(Boolean);
      const out: string[] = [];
      const role = r.name === USER_ID_LIST ? 'user' : 'chat';
      for (const id of ids) {
        if (!ID_TEXT.test(id)) return INVALID;
        if (!platformIdOk(kind, role, id)) return { ok: false, why: { key: 'set.badId' } };
        if (!out.includes(id)) out.push(id);
      }
      return out.length <= r.max ? { ok: true, value: out } : INVALID;
    }
    case 'chat':
      if (raw === '') return { ok: true, value: null };
      return typeof raw === 'string' && homeIds.includes(raw) ? { ok: true, value: raw } : INVALID;
  }
}

/** What a scope reports: what it stores itself (`settings`) and the value that applies (`effective`, with where it came from). */
export interface SettingsView {
  settings: Readonly<Record<string, unknown>>;
  effective: Readonly<Record<string, { value: unknown; source: string }>>;
}

export const effectiveOf = (v: SettingsView, name: string): unknown => v.effective[name]?.value;
export const sourceOf = (v: SettingsView, name: string): string => {
  const s = v.effective[name]?.source;
  return s === 'bot' || s === 'channel' || s === 'chat' || s === 'default' ? s : '';
};
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Is a chosen value a change? Against what the scope stores when it stores one (an effective value may be forced, as
 * Discord's mention_only is without message content), else against the effective value. null ("use the default") is a change
 * when the scope stores the setting or the value in force was set at the channel or the chat (a home chat).
 */
export function settingDiffers(v: SettingsView, name: string, value: unknown): boolean {
  const stored = Object.prototype.hasOwnProperty.call(v.settings, name) ? v.settings[name] : undefined;
  if (value === null) {
    const from = sourceOf(v, name);
    return stored !== undefined || from === 'channel' || from === 'chat';
  }
  return !same(value, stored !== undefined ? stored : effectiveOf(v, name));
}

/**
 * The body of a channel PATCH for a set of changes ({name: value | null}). enabled and home_chat go at the top level, the
 * rest inside `settings`; a name that is read-only, has its own action, or is not a channel setting is left out. undefined
 * when nothing is left to send.
 */
export function channelSettingsBody(changes: Readonly<Record<string, unknown>>): Record<string, unknown> | undefined {
  const body: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(changes)) {
    const r = BY_NAME.get(name);
    if (!r || !r.scopes.includes('channel') || r.place === 'ro' || r.place === 'act') continue;
    if (TOP.has(name)) body[name] = value;
    else inner[name] = value;
  }
  if (Object.keys(inner).length > 0) body.settings = inner;
  return Object.keys(body).length > 0 ? body : undefined;
}

/** The body of a Bot-wide settings PATCH: its members are top-level, and only the Bot's own settings (not pause, which has its action). */
export function botSettingsBody(changes: Readonly<Record<string, unknown>>): Record<string, unknown> | undefined {
  const body: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(changes)) {
    const r = BY_NAME.get(name);
    if (r && r.scopes.includes('bot') && r.place === 'all') body[name] = value;
  }
  return Object.keys(body).length > 0 ? body : undefined;
}

/** The same for a chat's settings: only names that apply at chat scope, all inside `settings`. */
export function chatSettingsBody(changes: Readonly<Record<string, unknown>>): Record<string, unknown> | undefined {
  const inner: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(changes)) if (BY_NAME.get(name)?.scopes.includes('chat')) inner[name] = value;
  return Object.keys(inner).length > 0 ? { settings: inner } : undefined;
}
