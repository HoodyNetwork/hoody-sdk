// Chat apps: what waits on the person in each app (a group that asks to be approved, no owner yet, a failed sign-in,
// Telegram privacy on), the per-platform words of the group flow (the command as the app accepts it), and the app's
// Setup track (setupSteps, nextStep). Pure: everything is read from the channel list the Bot pane already fetches.
import { effectiveOf } from './chatSettings';
import { ownerless, type Channel } from './data';

/** The note the agent attaches while the Telegram bot's privacy mode is on: in groups it gets only commands and replies to it. */
export const PRIVACY_NOTE = 'telegram_privacy_on';

export type Waiting =
  | { kind: 'requested'; count: number; section: 'chats' }
  | { kind: 'owner'; section: 'setup' }
  | { kind: 'signin'; section: 'setup' }
  | { kind: 'webhook'; section: 'setup' }
  | { kind: 'privacy'; section: 'setup' };

export const privacyOn = (c: Pick<Channel, 'kind' | 'notes'>): boolean => c.kind === 'telegram' && c.notes.some((n) => n.code === PRIVACY_NOTE);

/** What waits on the person in one app, most urgent first. A paused app asks nothing (the person paused it), and while the
 * Bot has its chat apps paused no app asks anything. */
export function waitingOf(c: Channel, botPaused = false): Waiting[] {
  const out: Waiting[] = [];
  if (botPaused || c.state === 'paused') return out;
  if (c.state === 'auth_failed') out.push({ kind: 'signin', section: 'setup' });
  if (c.reason === 'webhook_set') out.push({ kind: 'webhook', section: 'setup' });
  if (ownerless(c)) out.push({ kind: 'owner', section: 'setup' });
  // Only a group asks to join (its /bind); a private chat never waits for approval.
  const asks = c.chatRows.filter((x) => x.kind === 'group' && x.state === 'requested').length;
  if (asks > 0) out.push({ kind: 'requested', count: asks, section: 'chats' });
  if (privacyOn(c)) out.push({ kind: 'privacy', section: 'setup' });
  return out;
}

/** The Chat apps tab badge: one per thing to do (each group that asks counts once); 0 while the Bot has its apps paused. */
export function badgeCount(channels: readonly Channel[] | undefined, botPaused = false): number {
  let n = 0;
  for (const c of channels ?? []) for (const w of waitingOf(c, botPaused)) n += w.kind === 'requested' ? w.count : 1;
  return n;
}

const DEFAULT_PREFIX: Record<Channel['kind'], string> = { telegram: '/', slack: '!', discord: '!' };
const ALL_COMMANDS = ['status', 'stop', 'bind', 'unbind', 'help'];

/** A chat command as the app accepts it now (its prefix and its command list), or null when the app has it turned off. */
export function commandText(c: Pick<Channel, 'kind' | 'view'>, cmd: string): string | null {
  const p = effectiveOf(c.view, 'command_prefix');
  const prefix = typeof p === 'string' && p !== '' ? p : DEFAULT_PREFIX[c.kind];
  const list = effectiveOf(c.view, 'chat_commands');
  const on = Array.isArray(list) ? list.includes(cmd) : ALL_COMMANDS.includes(cmd);
  return on ? `${prefix}${cmd}` : null;
}

/** In groups the Bot reads only messages for it (a mention, a reply, a command) unless the app turned that off. */
export const mentionOnly = (c: Pick<Channel, 'view'>): boolean => effectiveOf(c.view, 'mention_only') !== false;

export type GroupMode = 'off' | 'owner_approves' | 'allowlist' | 'open';
const GROUP_MODES: readonly GroupMode[] = ['off', 'owner_approves', 'allowlist', 'open'];

/**
 * How the app admits groups (its group_mode): off ignores groups, owner_approves needs the owner's approval, allowlist needs the
 * group listed in allowed_chats and approved, open reads any group where the Bot is addressed. Absent = the agent's default;
 * a value this page does not know = null, and the steps then make no claim about it.
 */
export function groupMode(c: Pick<Channel, 'view'>): GroupMode | null {
  const v = effectiveOf(c.view, 'group_mode');
  if (v === undefined || v === null) return 'owner_approves';
  return GROUP_MODES.find((m) => m === v) ?? null;
}

/** How long an owner or invite code works, in minutes. */
export function pairingMinutes(c: Pick<Channel, 'view'>): number {
  const v = effectiveOf(c.view, 'pairing_ttl_minutes');
  return typeof v === 'number' && v > 0 ? v : 15;
}

/** The Bot's @name and a link to open a private chat with it, when the app knows them (Telegram: t.me). */
export function botAddress(c: Pick<Channel, 'kind' | 'identity'>): { at: string; link: string } | null {
  const u = c.identity?.username ?? '';
  if (!/^[A-Za-z0-9_]{3,64}$/.test(u)) return null;
  return { at: `@${u}`, link: c.kind === 'telegram' ? `https://t.me/${u}` : '' };
}

/** The Setup track's steps: a webhook that blocks connecting comes first, then the token,
 * the owner, Telegram's privacy, a group and a home chat. Each step says its state for the kit Track and its segment for the
 * Verdict: blocking (needed and not done), limited (works, with a standing condition), optional (may be skipped), unknown
 * (nothing the agent sends says: never drawn as done or as a warning). */
export type SetupStepId = 'webhook' | 'token' | 'owner' | 'privacy' | 'group' | 'home';
export interface SetupStep {
  id: SetupStepId;
  state: 'done' | 'now' | 'later' | 'wait' | 'unknown';
  tone?: 'warn' | 'danger';
  optional: boolean;
  segment: 'done' | 'limited' | 'blocking' | 'optional' | 'todo' | 'unknown';
}

// Connected and reading messages: only these let a person do the owner step now. A paused app's token was accepted (it
// ran), but it reads nothing, so an owner code sent to it waits; every other state says nothing sure about the connection.
const CONNECTED: readonly Channel['state'][] = ['running', 'needs_owner'];

export function setupSteps(c: Channel): SetupStep[] {
  const out: SetupStep[] = [];
  const hook = c.reason === 'webhook_set';
  if (hook) out.push({ id: 'webhook', state: 'now', tone: 'danger', optional: false, segment: 'blocking' });
  const connected = CONNECTED.includes(c.state);
  // A refused token is its own action now: the token step opens with the fields. Starting waits on the agent;
  // stopped, standby, conflict, realm-unserved, stopping and degraded say nothing sure about the connection (C9: unknown,
  // never done and never "connecting").
  if (connected || c.state === 'paused') out.push({ id: 'token', state: 'done', optional: false, segment: 'done' });
  else if (c.state === 'auth_failed') out.push({ id: 'token', state: 'now', tone: 'danger', optional: false, segment: 'blocking' });
  else if (hook) out.push({ id: 'token', state: 'later', optional: false, segment: 'todo' });
  else if (c.state === 'starting') out.push({ id: 'token', state: 'wait', optional: false, segment: 'todo' });
  else out.push({ id: 'token', state: 'unknown', optional: false, segment: 'unknown' });
  if (!ownerless(c)) out.push({ id: 'owner', state: 'done', optional: false, segment: 'done' });
  else out.push({ id: 'owner', state: connected && !hook ? 'now' : 'later', optional: false, segment: 'blocking' });
  // Privacy: the agent's note says it is on; without the note the page cannot tell (it never says off).
  if (c.kind === 'telegram')
    out.push(privacyOn(c) ? { id: 'privacy', state: 'now', tone: 'warn', optional: true, segment: 'limited' } : { id: 'privacy', state: 'unknown', optional: true, segment: 'unknown' });
  const group = c.chatRows.some((x) => x.kind === 'group' && x.state === 'approved');
  out.push(group ? { id: 'group', state: 'done', optional: true, segment: 'done' } : { id: 'group', state: 'later', optional: true, segment: 'optional' });
  out.push(c.homeChat !== null ? { id: 'home', state: 'done', optional: true, segment: 'done' } : { id: 'home', state: 'later', optional: true, segment: 'optional' });
  return out;
}

/** The one step the track opens: the first blocking step, else the first limited one, else the first optional one
 * not done, else none. A step whose state cannot be known is never opened by itself. */
export function nextStep(steps: readonly SetupStep[]): SetupStepId | null {
  const blocking = steps.find((x) => x.segment === 'blocking' && x.state === 'now');
  if (blocking) return blocking.id;
  // A blocking step the agent must finish first (connecting), or a required one nobody can tell, holds the track.
  if (steps.some((x) => x.segment === 'blocking' || (!x.optional && (x.segment === 'todo' || x.segment === 'unknown')))) return null;
  const limited = steps.find((x) => x.segment === 'limited');
  if (limited) return limited.id;
  return steps.find((x) => x.segment === 'optional')?.id ?? null;
}
