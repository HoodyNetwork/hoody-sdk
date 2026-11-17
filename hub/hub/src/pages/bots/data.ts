// The bots page's data: every route it may send, and its queries and mutations, in one place.
//
// Live: reads go through coreSource over the routes below (the real OpenAPI shapes, mapped in the
// selects); changes go through useLockedChange over api(), so a change is never resent and a lost
// answer is read back first (C9). Under a fixture transport (tests, hub:dev, hub:shots) both answer
// from fixtures. The page shows the Bots of every running computer of the selected realm: one list
// read per computer (useBotLists), joined in useBots. Agent routes go to the Bot's own computer's
// agent, Bot URL routes to the Hoody API.
import { alive, api, budgetedStream, capture, hostEnv, outcomeOf, coreSource, refreshFresh, botsListRoute, botWaiting, routingNode, myIpRoute, computerLifecycle, heldChanges, changeHoldRefs, useChangesVersion, sourceReads, containersRoute, computerState, defineRoute, useCurrentComputer, fixtureModeActive, fixtureComputer, useLockedChange, useRealms as useCoreRealms, realmLabel, realmDomain, providers, agent, computerBotsRead, noteBotTarget, versionRoute, stringOrEmpty as str, type HeldChange, type HoldRef, type BotList, type Target, type Ctx as PressCtx, pageFixtures } from '@core';
import { agentSignedOut, countryFlag, ipDetailsFrom, type IpDetails, type OutcomeKind } from '@kit';
import { readBotMessage } from '@ask/io';
import { useEffect, useMemo, useRef, useState } from 'react';
import { botSettingsBody, channelSettingsBody, chatSettingsBody, type SettingsView } from './chatSettings';
import { zoneOfApiHost } from './botZone';
import { beginIssue, clearCode, offerCode } from './codes';
import { MINT_LOCKED, botIdFromName, botKey, parseBotKey, zoneOfLinks, zoneOfUrl } from './logic';
import { LABEL_WORDS, botModelLabel, specLabel } from './models.logic';
import { startLogWaker } from './logstream';
import { BOT_PROOFS, CLOSED_PROOF_PAGE, closedPagesFor, rawDelegateIdle, rawListOk } from './parts/proofs';

// ── types ───────────────────────────────────────────────────────────────────────────

export type BotStatus = 'waiting' | 'working' | 'queued' | 'paused' | 'idle';
export type LinkStatus = 'active' | 'disabled' | 'detached' | 'frozen' | 'unknown';
export type KeyStatus = 'active' | 'paused' | 'expired';
export type ComputerState = 'running' | 'stopped' | 'starting';
export type ListState = 'ok' | 'failed' | 'other_realm';

export interface Computer {
  id: string;
  name: string;
  /** Server display name and its flag (an emoji or a short code). */
  server: string;
  flag: string;
  /** The server's city, when the API gives it (the computer picker's place). */
  city?: string;
  /** The realms the computer is in, when the API lists them (the computer picker's realm chip). */
  realmIds?: readonly string[];
  /** The computer's colour as the API keeps it: drawn only through the kit's ComputerMark, which normalises it. */
  color?: string;
  state: ComputerState;
  /** What reading this computer's Bots gave. */
  listState: ListState;
  /** The Bots read failed because the agent there is signed out (kit agentSignedOut): a sign-in, not a retry, brings them back. */
  agentOut?: true;
  /** Bots paused after a sign-in change; Resume brings them back. */
  suspended: number;
  /** More Bots exist than the first page shows. */
  hasMore: boolean;
}

/** What reading one computer's Bots gave. */
export interface ComputerBots {
  rows: BotRow[];
  suspended: number;
  hasMore: boolean;
}

export interface RealmInfo {
  id: string;
  name: string;
  /** 'global' for the Global realm. */
  isGlobal: boolean;
}

export interface BotRow {
  /** `<computer>~<realm>~<id>` */
  key: string;
  id: string;
  uid: string;
  name: string;
  role: string;
  realm: string;
  realmName: string;
  computerId: string;
  status: BotStatus;
  queued: number;
  model: string;
  modelLabel: string;
  lastActivityAt: string | null;
  link: LinkStatus | 'none';
  /** The chat apps set up for this Bot (one entry per kind), from the channels the list already carries. */
  chatApps: ChannelKind[];
  /** Groups asking one of the Bot's chat apps to be let in (agent capability bot_channel_waiting; 0 when the agent does not report it). */
  chatsWaiting: number;
  /** A chat app of the Bot is a Telegram bot with privacy mode on: in groups it sees only commands and replies to it. */
  privacyOn: boolean;
  /** Another agent program serves this Bot: listed, no actions. */
  locked: boolean;
}

export interface Gate {
  id: string;
  generation: number;
  type: 'confirm' | 'question';
  /** Untrusted text from the delegate. */
  summary: string;
  tool: string | null;
  /** Shown only under Advanced details. */
  advanced: { helper: string; rule: string } | null;
}

/** What a chat app's attention is about: its sign-in was refused, or it has no owner yet. */
export type AttentionWhy = 'auth_failed' | 'awaiting_owner';

export interface BotView {
  key: string;
  id: string;
  uid: string;
  name: string;
  role: string;
  instructions: string;
  model: string;
  modelLabel: string;
  provider: { id: string; label: string; ready: 'ready' | 'needs_key' | 'unknown' };
  yolo: boolean;
  /** Open helpers whose mode does not match `yolo` yet: waiting for their session to confirm, or refused by their approval policy. Absent on an old read. */
  yoloUnapplied?: { pending: number; refused: number };
  gate: Gate | null;
  turnRunning: boolean;
  turnId: string | null;
  /** The Bot's own session (view.session_id) as the view names it now; it changes at a reset. null: none yet. Never cached. */
  sessionId?: string | null;
  sessionModel: string | null;
  pausedAtLimit: boolean;
  /** The actions it took on its own since a person last wrote, and its limit (the agent's `autonomy`); absent when the read has none. */
  autonomy?: { used: number; max: number };
  queued: number;
  /** Set when the read did not report `turn_running` (a boolean) and `queued` (a count) as such: whether a turn runs or
   *  messages wait is then unknown, never "finished" (`turnRunning` false and `queued` 0 are only the fallbacks). */
  turnUnread?: true;
  tasksOpen: number;
  allowedComputers: string[] | null;
  allowedAgents: string[] | null;
  guardrails: string[];
  guardrailCheck: 'strict' | 'lenient' | 'off';
  guardrailRevision: number;
  checkerOk: boolean;
  routing: 'off' | 'suggest' | 'auto';
  /** Routing with its two tiers, as the agent holds it (absent on an old read: Routing reads as off). */
  routingSet?: RoutingSet;
  async: boolean;
  waitSeconds: number;
  /** Whether MCP answers end with the count of waiting messages and approvals (agent mcp_hints); null or absent when the read does not carry it: the switch is then not shown. */
  mcpHints?: boolean | null;
  realtimeMaxItems: number;
  speech: { enabled: boolean; ready: boolean | null; why: string | null; config: SpeechConfig | null };
  /** Today's speech use and limits (agent capability bot_speech_usage); null (or absent) when the read carries none or an incomplete one, never zeros. */
  speechUsage?: SpeechUsage | null;
  /** Which helpers the Bot hands work to (the agent's effective values); `known` is false for an agent that does not report them. */
  workers: Workers;
  /** Capabilities the agent has: identity-checked actions need botExpect. */
  caps: { botExpect: boolean; botGateHttp: boolean; botTurnCancel: boolean };
  /** An attention line, by row. */
  attention: Array<{ row: 'model' | 'guardrails' | 'channels'; key: 'provider' | 'checker' | 'chatapp' | 'chatwait'; why?: AttentionWhy }>;
  createdAt: string;
}

export type WorkerBackend = 'llm' | 'acp';

/** A thinking setting the agent takes for a routing tier ('' sends none: the agent's or the model's own). */
export const ROUTE_THINKING = ['', 'off', 'on', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type RouteThinking = (typeof ROUTE_THINKING)[number];
/** One routing tier: the model a helper starts on and its thinking. */
export interface RouteTier {
  model: string;
  thinking: RouteThinking;
}
/** Routing (the agent's shape): off; suggest records a pick only; auto starts each Hoody-model helper on the tier it picks. */
export interface RoutingSet {
  mode: 'off' | 'suggest' | 'auto';
  light: RouteTier | null;
  heavy: RouteTier | null;
}

/** The routing a Bot read holds; an unknown mode reads as off, a tier without a model as none. */
export function routingSetOf(raw: unknown): RoutingSet {
  const r = obj(raw);
  const mode = r?.mode === 'suggest' || r?.mode === 'auto' ? r.mode : 'off';
  const tier = (x: unknown): RouteTier | null => {
    const t = obj(x);
    const model = str(t?.model).trim();
    if (!model) return null;
    const th = str(t?.thinking).trim();
    return { model, thinking: (ROUTE_THINKING as readonly string[]).includes(th) ? (th as RouteThinking) : '' };
  };
  return { mode, light: tier(r?.light), heavy: tier(r?.heavy) };
}

/** The agents of the Bot's realm, as Settings > Helpers shows them: the AI helper's model and each agent with the model it names. */
export interface HelperAgents {
  /** The model of the realm's default chat agent ('' when it names none: Hoody Free). */
  helperModel: string;
  /** The bot agent's model pin, the AI page's Bots default ('' when it names none: the shipped Hoody Free). */
  botModel: string;
  agents: Array<{ name: string; model: string }>;
}

/** The Bot's own agent is never a helper (the agent refuses it), so it is not offered. */
export function helperAgentsOf(raw: unknown): HelperAgents {
  // An answer without the list says nothing about the agents (never "none", never Hoody Free).
  if (!Array.isArray(obj(raw)?.items)) throw new Error('no agents list');
  let helperModel = '';
  let botModel = '';
  const agents: HelperAgents['agents'] = [];
  const seen = new Set<string>();
  for (const a of items(raw)) {
    const name = str(a?.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const model = str(a?.model);
    if (a?.is_configured_default === true && helperModel === '') helperModel = model;
    if (name === 'bot') botModel = model;
    else agents.push({ name, model });
  }
  agents.sort((x, y) => x.name.localeCompare(y.name, 'en', { sensitivity: 'base', numeric: true }));
  return { helperModel, botModel, agents };
}

/** The Bot's worker policy as the agent reports it: the backend new helpers run on, the backends it may name, and Claude Code's agent and model. */
export interface Workers {
  known: boolean;
  backend: WorkerBackend;
  allowed: WorkerBackend[];
  agent: string;
  model: string;
  /** The helper options (agent capability bot_worker_options); absent from an agent too old to report them, never guessed. */
  options?: WorkerOptions;
}

/**
 * What new helpers start with beyond their backend: a Hoody-model helper's model and thinking ('' = the agent's own choice: the model its
 * agent names, else the AI helper's model), used only when no Routing tier applies; a Claude Code helper's effort ('' = this computer's
 * Claude Code setting).
 */
export interface WorkerOptions {
  model: string;
  thinking: RouteThinking;
  effort: WorkerEffort;
}
/** The efforts the agent takes for a Claude Code helper ('' = this computer's Claude Code setting). */
export const WORKER_EFFORTS = ['', ...agent.EFFORTS] as const;
export type WorkerEffort = (typeof WORKER_EFFORTS)[number];

export interface LinkKey {
  id: string;
  name: string;
  prefix: string;
  enabled: boolean;
  allowlist: string[];
  expiresAt: string | null;
  notes: string;
  /** The note for whoever holds the key (the agent returns it to the key's own caller); '' when none. */
  holderNote: string;
  createdAt: string;
  rotatedAt: string | null;
}

export interface Propagation {
  state: 'applied' | 'pending' | 'failed' | 'unknown';
  pending: number;
  failed: number;
  succeeded: number;
  targets: number;
}

export interface BotLink {
  id: string;
  label: string;
  url: string;
  status: LinkStatus;
  statusReason: string | null;
  ownerEnabled: boolean;
  cors: boolean;
  limits: Partial<Record<'key_rpm' | 'bot_rpm' | 'key_concurrency' | 'bot_concurrency', number>>;
  keys: LinkKey[];
  keysKnown: boolean;
  propagation: Propagation | null;
  /** The server's created time (a link under a minute old may still be spreading); '' when not sent. */
  createdAt: string;
}

/** The doors that keep "Give it a link" closed, each with its own `link.door.*` words. 'off': Bot links are off on the
 *  platform (the suggestion route answers 503 BOTS_DISABLED), so no address is offered at all. */
export const LINK_DOORS_CLOSED = ['unavailable', 'unsupported', 'off'] as const;

/** What "Give it a link" needs: whether the public door is ready, a generated label and the zone. */
export interface LinkOffer {
  door: 'ready' | (typeof LINK_DOORS_CLOSED)[number];
  suggestedLabel: string;
  zone: string;
  /** 'platform': the zone was derived from the platform, with no proof Bot links are on there (the API refuses a new
   *  link while they are off), so its address shows only as a labelled preview. Absent: the API's own address or a link's. */
  zoneFrom?: 'platform';
}

export interface Delegate {
  sessionId: string;
  title: string;
  state: 'working' | 'waiting' | 'idle' | 'stopping' | 'closed';
  /** Where it runs. */
  computerId: string;
  model: string;
  waitingOn: string | null;
  startedAt: string;
  /** Open, no open gate and an idle step reported (`rawDelegateIdle`): what lets a stop (not closing) be proved. Absent = not known idle. */
  idle?: boolean;
}

export type LogKind = 'user' | 'bot' | 'note' | 'report' | 'gone' | 'provider' | 'error' | 'stop';

export interface LogRow {
  seq: number;
  kind: LogKind;
  /** Untrusted text. */
  text: string;
  at: string;
  /** For runtime rows: raw text kept for Advanced details. */
  raw: string | null;
  delegateTitle: string | null;
  /** The session the row is about, as the agent wrote it (a task's for its runtime rows); null or absent when it named none. */
  sessionId?: string | null;
  /** A user row's door and sender as the agent recorded them; null on rows without (a plain post, or written before it was recorded). */
  sender: { via: string; who: string } | null;
  /** A spoken user row's voice (agent capability bot_log_voice); null (or absent) on every other row, and on a row the agent wrote without it. */
  voice?: LogVoice | null;
  /** The messages the turn this row ends answered (message_ids: on the Bot's reply and its turn's [error], [provider], [limit] rows); absent on every other row. */
  messageIds?: readonly string[];
}

/** Where a spoken message came in (the agent's botVoiceMeta.origin); 'unknown' for a door this Hub does not name yet. */
export type VoiceOrigin = 'rest' | 'mcp' | 'ws' | 'realtime' | 'twilio' | 'unknown';
export const VOICE_ORIGINS: readonly VoiceOrigin[] = ['rest', 'mcp', 'ws', 'realtime', 'twilio', 'unknown'];

/** A spoken user row's voice field. `conn`/`utt` name the voice connection's utterance it was made from (a voice
 *  connection only): `conn` exactly as the agent wrote it, `utt` a safe integer; both null from any other door. */
export interface LogVoice {
  origin: VoiceOrigin;
  durationMs: number;
  lang: string | null;
  conn: string | null;
  utt: number | null;
}

export interface LogPage {
  rows: LogRow[];
  live: 'up_to_date' | 'no_stream' | 'reconnecting';
  hasOlder: boolean;
  archiveRows: number;
}

export type ChannelKind = 'telegram' | 'slack' | 'discord';

export type Right = 'chat' | 'control' | 'gates';
export const RIGHTS: readonly Right[] = ['chat', 'control', 'gates'];

/** One person paired with a chat app (the agent's principal). */
export interface Person {
  id: string;
  /** Their user id in the chat app. */
  platformUser: string;
  name: string;
  rights: readonly Right[];
  owner: boolean;
  lang: string;
}

/** One chat the Bot is in on a chat app. */
export interface ChatRow {
  id: string;
  platformChat: string;
  kind: 'dm' | 'group';
  title: string;
  state: string;
  /** What the chat itself sets, and what applies to it (see SettingsView). */
  view: SettingsView;
  /** What the Hub itself knows about a setting's effect here (a note code and the setting it is about). */
  notes?: readonly { code: string; field: string }[];
  /** A Telegram group only: whether the bot reads every message there (privacy off, or it is an admin of the group); absent when unknown. */
  canRead?: boolean;
}

export interface Channel {
  id: string;
  kind: ChannelKind;
  label: string;
  enabled: boolean;
  /** The agent's connection state, one word each (degraded: reconnecting, rate limited or a local fault;
   *  standby: another channel runs this bot account; conflict: another poller or a webhook holds the account). An unknown word reads 'stopped'. */
  state: 'running' | 'starting' | 'paused' | 'auth_failed' | 'needs_owner' | 'degraded' | 'standby' | 'conflict' | 'realm_unserved' | 'stopping' | 'stopped';
  needsOwner: boolean;
  people: number;
  chats: number;
  /** The chat id updates go to, when one is set. */
  homeChat: string | null;
  /** Why the app is in its state, when the agent says (webhook_set: the agent's conflict state, which reads here as stopped). */
  reason: string;
  principals: readonly Person[];
  chatRows: readonly ChatRow[];
  /** What the app itself sets, and what applies to it. */
  view: SettingsView;
  /** Notes the agent attaches to a setting ({code, field}); shown beside it when there are words. */
  notes: readonly { code: string; field: string }[];
  /** Who the Bot is on the chat app, as the agent last read it (absent until it has): its @username (Telegram, Discord), the Discord invite link. */
  identity?: { name: string; username: string; inviteUrl: string };
}

/** What a person's add or edit sends: only the fields that are set go on the wire. */
export interface PersonInput {
  platformUser?: string;
  name?: string;
  /** A language code; null puts the person back on the chat app's own language. */
  lang?: string | null;
  rights?: readonly Right[];
  owner?: boolean;
}

/** An invite code's rights; the code itself is shown once and never kept. */
export interface InviteInput {
  rights: readonly Right[];
  owner: boolean;
  makeHome: boolean;
}

/** Every chat app change: which app, which action, and the action's own fields (ids and wanted states; secrets only in the token fields). */
export interface ChannelVars {
  channelId: string;
  /** The Bot's uid, set by the hook: with the chat app it names the holder of an issued code. */
  uid?: string;
  /** An issue's request number, taken when the button was pressed (`beginIssue`), so a send admitted late still names its own press. */
  ticket?: number;
  action: string;
  label?: string;
  token?: string;
  appToken?: string;
  kind?: ChannelKind;
  /** The person (or chat) the action is about, by its id. */
  target?: string;
  person?: PersonInput;
  invite?: InviteInput;
  /** Approving a group: the person was told everyone in it can read the Bot's replies there. */
  acknowledgeGroup?: boolean;
  /** Create only, Telegram: remove the bot's webhook if it has one. */
  deleteWebhook?: boolean;
  /** settings and chatSettings: {name: value, or null to use the default}. Names and typed values only; never a secret. */
  settings?: Readonly<Record<string, unknown>>;
}

/** How to get a chat app's credentials, as the agent words it; Slack also carries the app manifest. */
export interface ChannelSetup {
  kind: ChannelKind;
  steps: readonly string[];
  needs: readonly string[];
  /** This agent can connect this chat app now. */
  available: boolean;
  manifest: string;
}

export interface ChannelChange {
  channel?: Channel;
  /** A pairing or owner code was issued: it is in the code holder (codes.ts), never carried in the change's answer, which the page keeps. */
  issued?: boolean;
  /** Only the fake API sets this: a fixed demo code, because it has no agent to issue one. */
  demo?: { code: string; expiresAt: number };
  /** A restart whose pause went in and whose resume was refused: the app is known to be paused. */
  restart?: 'paused';
}

export interface ChannelSettings {
  /** The read carried the pause state (false for a malformed answer: then `paused` proves nothing). */
  ok: boolean;
  paused: boolean;
  maxChannels: number;
  rateBotPerDay: number;
  /** What the Bot itself sets, and what applies (every chat app inherits it unless it sets its own). */
  view: SettingsView;
}

export interface ModelRow {
  spec: string;
  label: string;
  provider: string;
  providerLabel: string;
  source: 'provider' | 'fusion';
  ready: 'ready' | 'needs_key' | 'unknown';
  /** True for the model this computer uses when nothing is chosen. */
  computerDefault: boolean;
  /** The catalogue marks it as taking a thinking level: Routing offers Thinking for it. */
  reasoning?: boolean;
  /** Listed only because some field holds it (not ready, or unread): only the field that holds it offers it. */
  heldOnly?: boolean;
}

export interface NewBotResult {
  state: 'done' | 'botunknown' | 'linkmaybe' | 'nolink' | 'keylost' | 'nokey' | 'keylocked' | 'keyunknown' | 'nametaken' | 'exists' | 'stale';
  botKey: string | null;
  link: BotLink | null;
  /** Shown once through SecretField, then dropped. */
  secret: string | null;
}

export interface MintResult {
  key: LinkKey;
  /** Shown once. */
  secret: string;
  curl: string;
}

// ── routes (the page's whole network surface) ────────────────────────────────────────

const L50 = ['page', 'limit'] as const;
const EXP = ['expect_uid'] as const;
const EXPR = ['expect_uid', 'expect_revision'] as const;
const CH = '/bots/:id/channels/:cid';

/** The one refusal code a key mint keeps (a secret route passes only declared codes): the 2FA lockout. */
const MINT_CODES = [MINT_LOCKED] as const;
/** A NEW key's mint also keeps the API's name refusal (409: this link already has a live key of that name, whatever its case), so the
 *  key form can say it; a rotation sends no name. Codes only: the answer is scrubbed as before and the mint is never sent again. */
const KEY_CREATE_CODES = [MINT_LOCKED, 'BOT_KEY_NAME_TAKEN'] as const;

export const ROUTES = {
  // agent: reads
  models: providers.providerRoutes.models,
  agents: defineRoute({ method: 'GET', path: '/agents', scope: 'agent', realm: 'bot' }),
  // Claude Code on the Bot's computer: whether it runs, and the models its routes accept (core's route and agent.claudeSetOf).
  acp: agent.agentRoutes.acp,
  audioModels: defineRoute({ method: 'GET', path: '/audio/models', scope: 'agent', realm: 'bot', query: ['capability'] }),
  audioVoices: defineRoute({ method: 'GET', path: '/audio/voices', scope: 'agent', realm: 'bot', query: ['model'] }),
  list: botsListRoute,
  resume: defineRoute({ method: 'POST', path: '/bots/resume', scope: 'agent', realm: 'list' }),
  get: defineRoute({ method: 'GET', path: '/bots/:id', scope: 'agent', realm: 'bot' }),
  log: defineRoute({ method: 'GET', path: '/bots/:id/log', scope: 'agent', realm: 'bot', query: ['tail', 'before', 'since', 'limit'] }),
  // The log's SSE stream (state, row, lagged, archived, end): it only wakes log and view reads (logstream.ts). A state frame
  // is the whole Bot view, a row frame one row (a message is at most 64 KiB).
  logStream: defineRoute({ method: 'GET', path: '/bots/:id/stream', scope: 'agent', realm: 'bot', query: ['since'], stream: { id: 1 << 20, noId: 1 << 20 }, maxBytes: 64 << 20, timeoutMs: 20000 }),
  archive: defineRoute({ method: 'GET', path: '/bots/:id/archive', scope: 'agent', realm: 'bot', query: ['before', 'limit'] }),
  delegates: defineRoute({ method: 'GET', path: '/bots/:id/delegates', scope: 'agent', realm: 'bot', query: ['state', ...L50] }),
  voiceCheck: defineRoute({ method: 'GET', path: '/bots/:id/voice/check', scope: 'agent', realm: 'bot' }),
  // The agent process's health: its `started` and `pid` mark one agent runtime (the bots tile, agentMark).
  health: defineRoute({ method: 'GET', path: '/health', scope: 'agent', realm: 'none', maxBytes: 4096 }),
  // agent: changes
  create: defineRoute({
    method: 'POST',
    path: '/bots',
    scope: 'agent',
    realm: 'bot',
    body: ['id', 'name', 'role', 'instructions', 'model', 'guardrails', 'allowed_computers', 'allowed_agents', 'yolo', 'guardrail_check'],
  }),
  patch: defineRoute({
    method: 'PATCH',
    path: '/bots/:id',
    scope: 'agent',
    realm: 'bot',
    query: EXPR,
    body: ['name', 'role', 'instructions', 'model', 'allowed_computers', 'allowed_agents', 'yolo', 'guardrail_check', 'async', 'wait_seconds', 'mcp_hints', 'routing', 'realtime_max_items', 'speech', 'worker_backend', 'allowed_worker_backends', 'worker_delegated_agent', 'worker_delegated_model', 'worker_model', 'worker_thinking', 'worker_delegated_effort'],
  }),
  remove: defineRoute({ method: 'DELETE', path: '/bots/:id', scope: 'agent', realm: 'bot', query: EXP }),
  guardrails: defineRoute({ method: 'PUT', path: '/bots/:id/guardrails', scope: 'agent', realm: 'bot', query: EXPR, body: ['guardrails'] }),
  reset: defineRoute({ method: 'POST', path: '/bots/:id/reset', scope: 'agent', realm: 'bot', query: EXP }),
  forget: defineRoute({ method: 'POST', path: '/bots/:id/forget', scope: 'agent', realm: 'bot', query: EXP }),
  purge: defineRoute({ method: 'POST', path: '/bots/:id/purge', scope: 'agent', realm: 'bot', query: EXP }),
  stopDelegate: defineRoute({ method: 'POST', path: '/bots/:id/delegates/:sid/stop', scope: 'agent', realm: 'bot', body: ['close'], idem: true }),
  sendMessage: defineRoute({ method: 'POST', path: '/bots/:id/messages', scope: 'agent', realm: 'bot', body: ['text'], idem: true }),
  gate: defineRoute({ method: 'POST', path: '/bots/:id/gate', scope: 'agent', realm: 'bot', body: ['gate_id', 'generation', 'request_id', 'confirm', 'answer'] }),
  cancel: defineRoute({ method: 'POST', path: '/bots/:id/cancel', scope: 'agent', realm: 'bot', body: ['turn_id'] }),
  // agent: chat apps
  chanList: defineRoute({ method: 'GET', path: '/bots/:id/channels', scope: 'agent', realm: 'bot', query: L50 }),
  chanSetup: defineRoute({ method: 'GET', path: '/bots/:id/channels/setup', scope: 'agent', realm: 'bot', query: ['kind', 'name'] }),
  chanCreate: defineRoute({
    method: 'POST',
    path: '/bots/:id/channels',
    scope: 'agent',
    realm: 'bot',
    body: ['kind', 'label', 'token', 'app_token', 'delete_webhook', 'enrolment', 'settings'],
    idem: true,
    secret: ['token', 'app_token'],
  }),
  chanGet: defineRoute({ method: 'GET', path: CH, scope: 'agent', realm: 'bot' }),
  chanPatch: defineRoute({ method: 'PATCH', path: CH, scope: 'agent', realm: 'bot', body: ['label', 'enabled', 'home_chat', 'delete_webhook', 'settings', 'unset'] }),
  chanCreds: defineRoute({ method: 'PUT', path: `${CH}/credentials`, scope: 'agent', realm: 'bot', body: ['token', 'app_token'], secret: ['token', 'app_token'] }),
  chanDelete: defineRoute({ method: 'DELETE', path: CH, scope: 'agent', realm: 'bot' }),
  pairCreate: defineRoute({ method: 'POST', path: `${CH}/pairing`, scope: 'agent', realm: 'bot', body: ['rights', 'owner', 'make_home'], secret: true }),
  pairCancel: defineRoute({ method: 'DELETE', path: `${CH}/pairing`, scope: 'agent', realm: 'bot' }),
  personAdd: defineRoute({ method: 'POST', path: `${CH}/principals`, scope: 'agent', realm: 'bot', body: ['platform_user', 'name', 'rights', 'owner'] }),
  personPatch: defineRoute({ method: 'PATCH', path: `${CH}/principals/:pid`, scope: 'agent', realm: 'bot', body: ['rights', 'name', 'lang', 'owner'] }),
  personDelete: defineRoute({ method: 'DELETE', path: `${CH}/principals/:pid`, scope: 'agent', realm: 'bot' }),
  chatPatch: defineRoute({ method: 'PATCH', path: `${CH}/chats/:chat`, scope: 'agent', realm: 'bot', body: ['state', 'acknowledge_group_readers', 'settings', 'unset'] }),
  chatDelete: defineRoute({ method: 'DELETE', path: `${CH}/chats/:chat`, scope: 'agent', realm: 'bot' }),
  chanSettings: defineRoute({ method: 'GET', path: '/bots/:id/channel-settings', scope: 'agent', realm: 'bot' }),
  chanSettingsPatch: defineRoute({
    method: 'PATCH',
    path: '/bots/:id/channel-settings',
    scope: 'agent',
    realm: 'bot',
    body: ['channels_paused', 'lang', 'max_channels', 'rate_bot_per_day', 'shared_identity', 'unset'],
  }),
  // Hoody API: the caller's address as Hoody sees it ("Add my IP"), and Bot URLs (links and keys)
  myIp: myIpRoute,
  // A computer's project, for its owner (Delete Bot: the API lists a computer's Bot URLs to its project's owner alone).
  project: defineRoute({ method: 'GET', path: '/projects/:pid', scope: 'base' }),
  urlList: defineRoute({ method: 'GET', path: '/bot-urls', scope: 'realm', query: ['project_id', 'computer_id', 'limit', 'cursor'] }),
  urlGet: defineRoute({ method: 'GET', path: '/bot-urls/:id', scope: 'realm' }),
  urlSuggest: defineRoute({ method: 'GET', path: '/bot-urls/suggest-label', scope: 'realm' }),
  urlCreate: defineRoute({ method: 'POST', path: '/bot-urls', scope: 'realm', body: ['computer_id', 'bot', 'label', 'cors'] }),
  urlPatch: defineRoute({ method: 'PATCH', path: '/bot-urls/:id', scope: 'realm', body: ['cors', 'enabled', 'limits'] }),
  urlRepoint: defineRoute({ method: 'POST', path: '/bot-urls/:id/repoint', scope: 'realm', body: ['computer_id', 'bot'] }),
  urlDelete: defineRoute({ method: 'DELETE', path: '/bot-urls/:id', scope: 'realm' }),
  urlPanic: defineRoute({ method: 'POST', path: '/bot-urls/:id/panic', scope: 'realm' }),
  keyCreate: defineRoute({ method: 'POST', path: '/bot-urls/:id/keys', scope: 'realm', body: ['name', 'ipv4_allow', 'expires_at', 'notes', 'holder_note'], secret: true, codes: KEY_CREATE_CODES }),
  keyPatch: defineRoute({ method: 'PATCH', path: '/bot-urls/:id/keys/:keyId', scope: 'realm', body: ['name', 'enabled', 'ipv4_allow', 'expires_at', 'notes', 'holder_note'] }),
  keyRotate: defineRoute({ method: 'POST', path: '/bot-urls/:id/keys/:keyId/rotate', scope: 'realm', secret: true, codes: MINT_CODES }),
  keyDelete: defineRoute({ method: 'DELETE', path: '/bot-urls/:id/keys/:keyId', scope: 'realm' }),
  keyRevokeAll: defineRoute({ method: 'POST', path: '/bot-urls/:id/keys/revoke-all', scope: 'realm' }),
} as const;

// ── live shapes (the real API answers → the page's types) ───────────────────────────────

type Raw = Record<string, unknown> | undefined;
const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === 'string');
const items = (raw: unknown): Raw[] => arr(obj(raw)?.items).map(obj);
const dataOf = (raw: unknown): Raw => obj(obj(raw)?.data);

export { specLabel };
/** The model words of a Bot row or view before the agents read: its own model's name, else the Bots default words (never blank). */
const heldLabel = (model: string): string => (model ? specLabel(model) : LABEL_WORDS.unresolved);

/** A listed model's label: the name the agent gave it, by the public-name rule, else the spec's. */
export const modelRowLabel = (m: Raw, spec: string): string => providers.publicName(str(m?.name) || str(m?.label), spec) || specLabel(spec);

export function computerOf(c: Raw): Computer {
  const sv = obj(c?.server);
  const st = computerState(c?.status);
  return {
    id: str(c?.id),
    name: str(c?.name),
    server: str(sv?.name) || str(c?.server_name),
    flag: countryFlag(sv?.country),
    ...(str(sv?.city) ? { city: str(sv?.city) } : {}),
    ...(Array.isArray(c?.realm_ids) ? { realmIds: strs(c?.realm_ids) } : {}),
    ...(typeof c?.color === 'string' ? { color: c.color } : {}),
    state: st === 'attention' ? 'stopped' : st,
    listState: 'ok',
    suspended: 0,
    hasMore: false,
  };
}

const gateOf = (b: Raw): Gate | null => {
  const g = obj(b?.pending_gate);
  if (!g || !botWaiting(b)) return null;
  return { id: str(g.gate_id), generation: num(g.generation), type: g.type === 'question' ? 'question' : 'confirm', summary: str(g.summary), tool: null, advanced: null };
};

/** The Bot's own-action count and limit, when the read carries a limit. */
const autonomyOf = (b: Raw): { used: number; max: number } | undefined => {
  const a = obj(b?.autonomy);
  return a !== undefined && num(a.max) > 0 ? { used: num(a.used), max: num(a.max) } : undefined;
};

const atLimit = (b: Raw): boolean => {
  const a = obj(b?.autonomy);
  return a !== undefined && num(a.max) > 0 && num(a.used) >= num(a.max);
};

function statusOf(b: Raw): BotStatus {
  if (gateOf(b)) return 'waiting';
  if (atLimit(b)) return 'paused';
  if (b?.turn_running === true) return 'working';
  return num(b?.queued) > 0 ? 'queued' : 'idle';
}

const CHANNEL_KINDS: readonly ChannelKind[] = ['telegram', 'slack', 'discord'];

/** The channel summaries of the apps that can ask anything: a paused app asks nothing (the person paused it, or the Bot has
 * its chat apps paused, which the agent reports as each app paused). */
const askingApps = (b: Raw): unknown[] => arr(b?.channels).filter((c) => obj(c)?.state !== 'paused');

/** How many groups ask the Bot's chat apps to be let in, from the channel summaries a Bot read carries. */
export function chatsWaitingOf(b: Raw): number {
  return askingApps(b).reduce<number>((n, c) => {
    const v = obj(c)?.requested_chats;
    return n + (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  }, 0);
}

/** A chat app of the Bot reports Telegram privacy on (the summary's notes, as the app's own settings carry them). */
export function privacyOnOf(b: Raw): boolean {
  return askingApps(b).some((c) => arr(obj(c)?.notes).some((n) => obj(n)?.code === 'telegram_privacy_on'));
}

/** The kinds of chat app in a Bot's `channels`, once each, in a fixed order. */
export function chatAppsOf(b: Raw): ChannelKind[] {
  const kinds = new Set(arr(b?.channels).map((c) => str(obj(c)?.kind)));
  return CHANNEL_KINDS.filter((k) => kinds.has(k));
}

export function rowOf(b: Raw, computerId: string): BotRow {
  const id = str(b?.id);
  const realm = str(b?.realm);
  const model = str(b?.model);
  return {
    key: botKey(computerId, realm, id),
    id,
    uid: str(b?.uid),
    name: str(b?.name) || id,
    role: str(b?.role),
    realm,
    realmName: realm,
    computerId,
    status: statusOf(b),
    queued: num(b?.queued),
    model,
    modelLabel: heldLabel(model),
    lastActivityAt: str(b?.last_activity) || null,
    link: 'none',
    chatApps: chatAppsOf(b),
    chatsWaiting: chatsWaitingOf(b),
    privacyOn: privacyOnOf(b),
    locked: b?.owned_elsewhere === true,
  };
}

function speechConfigOf(sp: Raw): SpeechConfig | null {
  if (!sp) return null;
  return {
    raw: { ...sp },
    sttModel: str(sp.stt_model),
    ttsModel: str(sp.tts_model),
    voice: str(sp.voice),
    language: str(sp.language),
    speed: typeof sp.speed === 'number' && Number.isFinite(sp.speed) ? sp.speed : null,
    speakWakes: sp.speak_wakes === true,
    speakGates: sp.speak_gates !== false,
  };
}

const audioModelsOf = (raw: unknown): AudioModel[] =>
  items(raw)
    .map((m) => ({ id: str(m?.id), capabilities: strs(m?.capabilities), languages: strs(m?.languages), available: m?.available !== false, reason: str(m?.unavailable_reason) }))
    .filter((m) => m.id !== '');

function stageOf(raw: unknown, op: 'stt' | 'tts'): VoiceStage | null {
  const x = obj(raw);
  if (!x) return null;
  const max = x.max_input_chars;
  return {
    ok: x.ok === true,
    model: str(x.model),
    voice: str(x.voice),
    code: str(x.code),
    reason: str(x.reason),
    message: str(x.message),
    retryable: typeof x.retryable === 'boolean' ? x.retryable : null,
    // Only a working speaking stage carries it (bot_voice_check_limits); anything else is unknown, never a limit.
    maxInputChars: op === 'tts' && x.ok === true && typeof max === 'number' && Number.isSafeInteger(max) && max > 0 ? max : null,
  };
}

/** A voice/check answer; one without `ready` is no answer (it throws, so the read fails). */
export function voiceCheckOf(raw: unknown): VoiceCheck {
  const x = obj(raw);
  if (!x || typeof x.ready !== 'boolean') throw new Error('no answer');
  return { ready: x.ready, stt: stageOf(x.stt, 'stt'), tts: stageOf(x.tts, 'tts') };
}

/** A user row's `voice` (as the agent stores it). The origin and duration must be there; `utt` only with a `conn`. */
export function logVoiceOf(raw: unknown): LogVoice | null {
  const v = obj(raw);
  if (!v || typeof v.origin !== 'string' || typeof v.duration_ms !== 'number' || !Number.isFinite(v.duration_ms) || v.duration_ms < 0) return null;
  const origin = (VOICE_ORIGINS as readonly string[]).includes(v.origin) && v.origin !== 'unknown' ? (v.origin as VoiceOrigin) : 'unknown';
  const conn = typeof v.conn === 'string' && v.conn !== '' ? v.conn : null;
  const utt = conn !== null && typeof v.utt === 'number' && Number.isSafeInteger(v.utt) && v.utt > 0 ? v.utt : null;
  return { origin, durationMs: v.duration_ms, lang: typeof v.lang === 'string' && v.lang !== '' ? v.lang : null, conn, utt };
}

// speech_usage's day (a UTC date) and resets_at (RFC 3339) as the agent writes them; anything else is no read.
const USAGE_DAY = /^\d{4}-\d{2}-\d{2}$/;
const USAGE_RESETS = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
/** A YYYY-MM-DD that names a real calendar day (Date would roll 2026-02-30 over to March). */
const calendarDay = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** The Bot read's speech_usage (as the agent sends it): every required field present and a finite, non-negative number,
 *  else null. A partial read is no read: it never shows as zeros. A value that throws when read (a getter, a revoked proxy)
 *  is no read either, so a source other than parsed JSON cannot break the Bot view. */
export function speechUsageOf(raw: unknown): SpeechUsage | null {
  try {
    return readSpeechUsage(raw);
  } catch {
    return null;
  }
}

function readSpeechUsage(raw: unknown): SpeechUsage | null {
  const u = obj(raw);
  if (!u) return null;
  const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  const pair = (v: unknown): { ttsChars: number; sttSeconds: number } | null => {
    const o = obj(v), tts = n(o?.tts_chars), stt = n(o?.stt_seconds);
    return tts === null || stt === null ? null : { ttsChars: tts, sttSeconds: stt };
  };
  const day = u.day, resets = u.resets_at;
  const used = pair(u), limits = pair(u.limits), realmUsed = pair(u.realm_used), realmLimits = pair(u.realm_limits);
  const src = obj(obj(u.limits)?.source);
  const srcOf = (v: unknown): 'bot' | 'default' | null => (v === 'bot' || v === 'default' ? v : null);
  const ttsSrc = srcOf(src?.tts_chars), sttSrc = srcOf(src?.stt_seconds);
  if (typeof day !== 'string' || !USAGE_DAY.test(day) || !calendarDay(day) || typeof resets !== 'string') return null;
  const resetsDay = USAGE_RESETS.exec(resets)?.[1];
  if (resetsDay === undefined || !calendarDay(resetsDay) || !Number.isFinite(Date.parse(resets))) return null;
  if (!used || !limits || !realmUsed || !realmLimits) return null;
  return {
    day,
    resetsAt: resets,
    used,
    limits: { ...limits, source: { ttsChars: ttsSrc, sttSeconds: sttSrc } },
    realmUsed,
    realmLimits,
  };
}

/** The agent's /version names for voice → the Hub's flags. */
const VOICE_CAP_NAMES = {
  check: 'bot_voice_check',
  logVoice: 'bot_log_voice',
  refuseFrame: 'bot_voice_refuse_frame',
  playLead: 'bot_voice_play_lead',
  textKey: 'bot_voice_text_key',
  stopSpeech: 'bot_voice_stop_speech',
  speechUsage: 'bot_speech_usage',
  checkLimits: 'bot_voice_check_limits',
} as const;

/** What a Bot's agent can do for voice. undefined = not known (the /version read has not answered, or failed): never
 *  read as false. A listed capability is true only when supported and available (the ask capOn rule). */
export type VoiceCaps = { readonly [K in keyof typeof VOICE_CAP_NAMES]: boolean | undefined };
export const VOICE_CAPS_UNKNOWN: VoiceCaps = Object.freeze({ check: undefined, logVoice: undefined, refuseFrame: undefined, playLead: undefined, textKey: undefined, stopSpeech: undefined, speechUsage: undefined, checkLimits: undefined });

/** A /version answer → the voice flags. An answer without a capability list is no answer (it throws, so the read fails and stays unknown). */
export function voiceCapsOf(raw: unknown): VoiceCaps {
  const caps = obj(raw)?.capabilities;
  if (!Array.isArray(caps)) throw new Error('no capabilities');
  const listed = new Set<string>();
  for (const c of caps.slice(0, 512)) {
    const x = obj(c);
    if (x && typeof x.name === 'string' && x.supported === true && x.available === true) listed.add(x.name);
  }
  const out = {} as Record<keyof typeof VOICE_CAP_NAMES, boolean>;
  for (const [k, name] of Object.entries(VOICE_CAP_NAMES)) out[k as keyof typeof VOICE_CAP_NAMES] = listed.has(name);
  return Object.freeze(out);
}

const BACKENDS: readonly WorkerBackend[] = ['llm', 'acp'];

/** The worker policy of a Bot read; an agent that reports none (or an unreadable one) is `known: false`, never a guessed policy. */
/** The helpers the Bot's Auto-approve flag has not reached: a `refused` row keeps asking (its approval policy does not allow YOLO); anything else is still being sent. */
export function yoloUnappliedOf(rows: readonly Raw[]): { pending: number; refused: number } {
  const refused = rows.filter((r) => r?.state === 'refused').length;
  return { pending: rows.length - refused, refused };
}

export function workersOf(b: Raw): Workers {
  const allowed = arr(b?.allowed_worker_backends);
  const backend = b?.worker_backend;
  const okList = allowed.length > 0 && allowed.every((x) => BACKENDS.includes(x as WorkerBackend));
  if (!okList || !BACKENDS.includes(backend as WorkerBackend) || !allowed.includes(backend)) return { known: false, backend: 'llm', allowed: ['llm'], agent: '', model: '' };
  const out: Workers = { known: true, backend: backend as WorkerBackend, allowed: BACKENDS.filter((x) => allowed.includes(x)), agent: str(b?.worker_delegated_agent), model: str(b?.worker_delegated_model) };
  const options = workerOptionsOf(b);
  return options ? { ...out, options } : out;
}

/** The helper options of a Bot read: all three reported as the agent's vocabulary, else none (absent, or a value this Hub does not know). */
function workerOptionsOf(b: Raw): WorkerOptions | undefined {
  const model = b?.worker_model;
  const thinking = b?.worker_thinking;
  const effort = b?.worker_delegated_effort;
  if (typeof model !== 'string' || typeof thinking !== 'string' || typeof effort !== 'string') return undefined;
  if (!(ROUTE_THINKING as readonly string[]).includes(thinking) || !(WORKER_EFFORTS as readonly string[]).includes(effort)) return undefined;
  return { model, thinking: thinking as RouteThinking, effort: effort as WorkerEffort };
}

/** One Bot read as the page shows it (exported for its tests). */
export function viewOf(b: Raw, key: string): BotView {
  const model = str(b?.model);
  const sp = obj(b?.speech);
  const ch = arr(b?.channels).map(obj);
  const turn = b?.turn_running === true;
  return {
    key,
    id: str(b?.id),
    uid: str(b?.uid),
    name: str(b?.name),
    role: str(b?.role),
    instructions: str(b?.instructions),
    model,
    modelLabel: heldLabel(model),
    provider: { id: model.split('/')[0] ?? '', label: model.split('/')[0] ?? '', ready: 'unknown' },
    yolo: b?.yolo === true,
    ...(Array.isArray(b?.yolo_unapplied) ? { yoloUnapplied: yoloUnappliedOf(arr(b?.yolo_unapplied).map(obj)) } : {}),
    gate: gateOf(b),
    turnRunning: turn,
    turnId: str(b?.turn_id) || null,
    sessionId: str(b?.session_id) || null,
    sessionModel: str(b?.session_model) || null,
    pausedAtLimit: atLimit(b),
    ...(autonomyOf(b) ? { autonomy: autonomyOf(b) } : {}),
    queued: num(b?.queued),
    ...(typeof b?.turn_running === 'boolean' && typeof b?.queued === 'number' && Number.isInteger(b.queued) && b.queued >= 0 ? {} : { turnUnread: true as const }),
    tasksOpen: num(b?.open_delegates),
    allowedComputers: strs(b?.allowed_computers).length > 0 ? strs(b?.allowed_computers) : null,
    allowedAgents: strs(b?.allowed_agents).length > 0 ? strs(b?.allowed_agents) : null,
    guardrails: str(b?.guardrails).split('\n').filter((l) => l.trim() !== ''),
    guardrailCheck: b?.guardrail_check === 'lenient' || b?.guardrail_check === 'off' ? b.guardrail_check : 'strict',
    guardrailRevision: num(b?.revision),
    checkerOk: true,
    routing: obj(b?.routing)?.mode === 'suggest' || obj(b?.routing)?.mode === 'auto' ? (obj(b?.routing)?.mode as 'suggest' | 'auto') : 'off',
    routingSet: routingSetOf(b?.routing),
    async: b?.async === true,
    waitSeconds: num(b?.wait_seconds),
    mcpHints: typeof b?.mcp_hints === 'boolean' ? b.mcp_hints : null,
    realtimeMaxItems: num(obj(b?.realtime_items)?.max),
    speech: { enabled: str(sp?.tts_model) !== '' || str(sp?.stt_model) !== '', ready: null, why: null, config: speechConfigOf(sp) },
    speechUsage: speechUsageOf(b?.speech_usage),
    workers: workersOf(b),
    caps: { botExpect: true, botGateHttp: true, botTurnCancel: true },
    attention: [
      // A refused sign-in is said before a missing owner: it stops the app, a missing owner only waits.
      ...(ch.some((c) => c?.state === 'auth_failed' || c?.state === 'awaiting_owner')
        ? [{ row: 'channels' as const, key: 'chatapp' as const, why: ch.some((c) => c?.state === 'auth_failed') ? ('auth_failed' as const) : ('awaiting_owner' as const) }]
        : []),
      ...(chatsWaitingOf(b) > 0 ? [{ row: 'channels' as const, key: 'chatwait' as const }] : []),
    ],
    createdAt: str(b?.created),
  };
}

const LOG_KINDS: Record<string, LogKind> = { report: 'report', gone: 'gone', provider: 'provider', error: 'error', stop: 'stop' };

export function logOf(raw: unknown): LogPage {
  const o = obj(raw);
  return {
    rows: items(raw).map((r) => {
      const role = str(r?.role);
      // A stop written in the owner's name is a user row with the runtime kind `stop`: it is a runtime line, not a message anyone sent.
      const kind: LogKind = role === 'user' ? (str(r?.kind) === 'stop' ? 'stop' : 'user') : role === 'bot' ? 'bot' : (LOG_KINDS[str(r?.kind)] ?? 'note');
      const sd = obj(r?.sender);
      const sender = kind === 'user' && sd ? { via: str(sd.via), who: str(sd.who) || str(sd.name) } : null;
      const ids = arr(r?.message_ids).filter((x): x is string => typeof x === 'string' && x !== '');
      return { seq: num(r?.seq), kind, text: str(r?.text), at: str(r?.at), raw: null, delegateTitle: str(r?.delegate_title) || null, sessionId: str(r?.session_id) || null, sender, voice: kind === 'user' ? logVoiceOf(r?.voice) : null, ...(ids.length > 0 ? { messageIds: ids } : {}) };
    }),
    live: 'up_to_date',
    hasOlder: o?.has_more === true,
    archiveRows: 0,
  };
}

function delegateOf(d: Raw): Delegate {
  const step = str(obj(d?.current_step)?.kind);
  const gates = arr(d?.open_gates).map(obj);
  return {
    sessionId: str(d?.session_id),
    title: str(d?.title),
    state: d?.state === 'closed' ? 'closed' : gates.length > 0 ? 'waiting' : step === 'model' || step === 'tool' ? 'working' : 'idle',
    computerId: str(d?.computer),
    model: str(d?.model),
    waitingOn: str(gates[0]?.summary) || null,
    startedAt: str(d?.opened_at),
    idle: rawDelegateIdle(d),
  };
}

const CHAN_STATE: Record<string, Channel['state']> = {
  connected: 'running',
  connecting: 'starting',
  awaiting_owner: 'needs_owner',
  paused: 'paused',
  auth_failed: 'auth_failed',
  degraded: 'degraded',
  standby: 'standby',
  conflict: 'conflict',
  realm_unserved: 'realm_unserved',
  stopping: 'stopping',
  stopped: 'stopped',
};

export function channelOf(c: Raw): Channel {
  const eff = obj(c?.effective);
  const kind = str(c?.kind);
  const principals = arr(c?.principals).map(obj).filter((p): p is Record<string, unknown> => p !== undefined && str(p.id) !== '').map(personOf);
  const view = settingsViewOf(c);
  const notes = arr(eff?.notes).map(obj).filter((n): n is Record<string, unknown> => n !== undefined && str(n.code) !== '' && str(n.field) !== '').map((n) => ({ code: str(n.code), field: str(n.field) }));
  const chatRows = arr(c?.chats).map(obj).filter((x): x is Record<string, unknown> => x !== undefined && str(x.id) !== '').map((x) => chatOf(x, view, kind, notes, str(c?.state_reason)));
  return {
    id: str(c?.id),
    kind: kind === 'slack' || kind === 'discord' ? kind : 'telegram',
    label: str(c?.label),
    enabled: obj(eff?.enabled)?.value !== false,
    state: CHAN_STATE[str(c?.state)] ?? 'stopped',
    needsOwner: c?.needs_owner === true,
    people: principals.length,
    chats: chatRows.length,
    homeChat: str(obj(eff?.home_chat)?.value) || null,
    reason: str(c?.state_reason),
    principals,
    chatRows,
    view,
    notes,
    ...(identityOf(obj(c?.identity)) ?? {}),
  };
}

/** A create answer states the app the add flow then opens on Setup: its id, a kind and state the Hub knows, the owner flag,
 *  and its people and settings. channelOf fills what is missing with defaults (an unknown kind reads as Telegram), so a
 *  partial answer would open an app the answer never described; such an answer names no app. */
function createdChannelStated(c: Record<string, unknown> | undefined): boolean {
  if (!c) return false;
  const kind = c.kind;
  const state = c.state;
  return (
    str(c.id) !== '' &&
    str(c.id) !== 'new' &&
    (kind === 'telegram' || kind === 'slack' || kind === 'discord') &&
    typeof state === 'string' &&
    Object.hasOwn(CHAN_STATE, state) &&
    typeof c.needs_owner === 'boolean' &&
    Array.isArray(c.principals) &&
    obj(c.effective) !== undefined
  );
}

function identityOf(i: Record<string, unknown> | undefined): { identity: NonNullable<Channel['identity']> } | undefined {
  if (!i) return undefined;
  const username = str(i.username).replace(/^@/, '');
  const inviteUrl = /^https:\/\//.test(str(i.invite_url)) ? str(i.invite_url) : '';
  return { identity: { name: str(i.name), username, inviteUrl } };
}

/** An owner code is redeemed only in direct messages set to owner-only or pairing; under any other policy the agent ignores it. A policy the Hub does not know yet is not blocked. */
export const ownerCodeOff = (policy: unknown): boolean => typeof policy === 'string' && policy !== 'owner' && policy !== 'pairing';

/** The app has no owner: the agent says so, or none of its people is one. Its first owner pairs with an owner code (the agent refuses to make anyone the first owner any other way). */
export const ownerless = (c: Pick<Channel, 'needsOwner' | 'principals'>): boolean => c.needsOwner || !c.principals.some((p) => p.owner);

/** The owner ids (unreadable ids left out) of chat app `channelId` of Bot `key`, from a read sent now (core refreshFresh own:
 *  never a read already out, whose list may be older than a code just issued). undefined when there is no
 *  fresh answer: a failed or skipped read, or no list naming that app. */
export async function freshOwnerIds(key: string, channelId: string): Promise<string[] | undefined> {
  try {
    const f = await refreshFresh(source.readTarget('channels'), { own: true });
    if (f.state !== 'fresh') return undefined;
    for (const a of f.answers) {
      const ch = (a.data as Record<string, { channels: Channel[] }> | undefined)?.[key]?.channels.find((c) => c.id === channelId);
      if (ch) return ch.principals.filter((p) => p.owner && p.id !== '').map((p) => p.id);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** The `settings` and `effective` members of a channel or chat as the agent reports them. */
function settingsViewOf(c: Raw): SettingsView {
  const eff = obj(c?.effective) ?? {};
  const effective: Record<string, { value: unknown; source: string }> = {};
  for (const [name, e] of Object.entries(eff)) {
    const o = obj(e);
    if (o && 'value' in o) effective[name] = { value: o.value, source: str(o.source) };
  }
  return { settings: obj(c?.settings) ?? {}, effective };
}

const isRight = (x: string): x is Right => x === 'chat' || x === 'control' || x === 'gates';

function personOf(p: Raw): Person {
  return { id: str(p?.id), platformUser: str(p?.platform_user), name: str(p?.name), rights: strs(p?.rights).filter(isRight), owner: p?.owner === true, lang: str(p?.lang) };
}

/**
 * A chat reports only what it overrides (`settings`), never what applies to it: what applies is the app's own effective value,
 * with the chat's overrides on top, each marked as set for this chat. The one exception is Discord's `mention_only: false`: the
 * agent holds it at true unless the message content permission is known present (`ResolveWithCaps`), and a chat's own answer does
 * not say which. The Hub applies that rule only where the app's answer proves the permission: the app's own `mention_only` is false
 * only with the permission known present, and its note says "unknown" or "missing" otherwise (so does the state reason
 * `message_content_missing`). With none of that the permission is not known here: the override is shown as stored, with no note.
 */
function chatOf(c: Raw, app: SettingsView, kind: string, appNotes: readonly { code: string; field: string }[], reason: string): ChatRow {
  const own = obj(c?.settings) ?? {};
  const effective: Record<string, { value: unknown; source: string }> = { ...app.effective };
  const notes: { code: string; field: string }[] = [];
  const held =
    kind !== 'discord'
      ? ''
      : reason === 'message_content_missing' || appNotes.some((n) => n.field === 'mention_only' && n.code === 'mention_only_capability_missing')
        ? 'mention_only_capability_missing'
        : appNotes.some((n) => n.field === 'mention_only' && n.code === 'mention_only_capability_unknown')
          ? 'mention_only_capability_unknown'
          : '';
  for (const [name, value] of Object.entries(own)) {
    const back = held !== '' && name === 'mention_only' && value === false;
    effective[name] = { value: back ? true : value, source: 'chat' };
    if (back) notes.push({ code: held, field: name });
  }
  const row: ChatRow = { id: str(c?.id), platformChat: str(c?.platform_chat), kind: c?.kind === 'group' ? 'group' : 'dm', title: str(c?.title), state: str(c?.state), view: { settings: own, effective }, notes };
  return typeof c?.can_read === 'boolean' ? { ...row, canRead: c.can_read } : row;
}

export const keyOf = (k: Raw): LinkKey => ({
  id: str(k?.id),
  name: str(k?.name),
  prefix: str(k?.prefix),
  enabled: k?.enabled !== false,
  allowlist: strs(k?.ipv4_allow),
  expiresAt: str(k?.expires_at) || null,
  notes: str(k?.notes),
  holderNote: str(k?.holder_note),
  createdAt: str(k?.created_at),
  rotatedAt: str(k?.rotated_at) || null,
});

const LINK_STATUS: readonly LinkStatus[] = ['active', 'disabled', 'detached', 'frozen'];

function propagationOf(p: Raw): Propagation | null {
  if (!p) return null;
  const st = str(p.state);
  return {
    state: st === 'applied' || st === 'pending' || st === 'failed' ? st : 'unknown',
    pending: num(p.pending_count),
    failed: num(p.failed_count),
    succeeded: num(p.succeeded_count),
    targets: num(p.target_count),
  };
}

/** One Bot URL as the page shows it. `keysKnown` is false when the answer carried no key list: `keys` is then empty and proves nothing. */
export function linkOf(u: Raw, p?: Raw): BotLink {
  const st = str(u?.status);
  const lim = obj(u?.limits) ?? {};
  const limits: BotLink['limits'] = {};
  for (const k of ['key_rpm', 'bot_rpm', 'key_concurrency', 'bot_concurrency'] as const) if (typeof lim[k] === 'number') limits[k] = lim[k];
  return {
    id: str(u?.id),
    label: str(u?.label),
    url: str(u?.url),
    status: (LINK_STATUS as readonly string[]).includes(st) ? (st as LinkStatus) : 'unknown',
    statusReason: str(u?.status_reason) || null,
    ownerEnabled: u?.owner_enabled !== false,
    cors: u?.cors === true,
    limits,
    keys: arr(u?.keys).map(obj).filter((k) => str(k?.status) !== 'revoked').map(keyOf),
    keysKnown: Array.isArray(u?.keys),
    propagation: propagationOf(p),
    createdAt: str(u?.created_at),
  };
}

const mintOf = (d: Raw): MintResult => ({ key: keyOf(obj(d?.key)), secret: str(d?.secret), curl: str(d?.curl) });

// ── sources ─────────────────────────────────────────────────────────────────────────

// Every computer of the realm is read and written, so each agent call names its computer. The table is
// filled by the computers read; a computer it does not know gets a target without a server, which has no
// address: the call fails closed and never lands on the top bar's computer (Bot ids repeat across computers).
const targets = new Map<string, Target>();
export const computerTarget = (computerId: string): Target => targets.get(computerId) ?? { project: { id: '' }, container: { id: computerId } };

/** Remembers each computer's address from a containers answer (the computers read calls it). */
export function registerTargets(rows: ReadonlyArray<Record<string, unknown> | undefined>): void {
  targets.clear();
  for (const c of rows) {
    const id = str(c?.id);
    const server = routingNode(c);
    if (!id || !server) continue;
    const t: Target = { project: { id: str(c?.project_id) }, container: { id, server_name: server } };
    targets.set(id, t);
    noteBotTarget(t); // the per-computer Bots read (core computerBotsRead) takes its target from there
  }
}

// Recovery epochs: how often each computer has come back to running after a computers answer that
// had it not running or not listed. The bots tile keys its Bot read by this count (useTileBotView), so a new epoch
// starts with no data and only an answer to a read sent after the recovery can show. Held here, not in a tile, so a
// remounted tile keeps it.
const wasRunning = new Map<string, boolean>();
const recoveries = new Map<string, number>();
function noteRecoveries(rows: readonly Computer[]): void {
  const listed = new Set<string>();
  for (const c of rows) {
    listed.add(c.id);
    const running = c.state === 'running';
    if (running && wasRunning.get(c.id) === false) recoveries.set(c.id, (recoveries.get(c.id) ?? 0) + 1);
    wasRunning.set(c.id, running);
  }
  for (const id of wasRunning.keys()) if (!listed.has(id)) wasRunning.set(id, false);
}
export const recoveryEpoch = (computerId: string): number => recoveries.get(computerId) ?? 0;
/** Tests only: forgets every recovery epoch. */
export function resetRecoveriesForTests(): void {
  wasRunning.clear();
  recoveries.clear();
}

// Runtime marks: the agent's GET /health `started` (set once when its gateway is built) and `pid`
// name one agent runtime, and the Bot runtime is built with that gateway. A stop and restart that no computers answer
// saw changes the mark, so the bots tile keys its Bot read by it as well (useTileBotView). Only a well-formed answer
// is a mark: anything else is a failed read, and TanStack keeps the last good mark.
const STARTED = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
export function runtimeMarkOf(raw: unknown): string {
  const o = obj(raw);
  const started = o?.started;
  const pid = o?.pid;
  if (o?.status !== 'ok' || typeof started !== 'string' || !STARTED.test(started)) throw new Error('health: no runtime mark');
  const t = Date.parse(started);
  // The exact round trip: a date that rolls over (Feb 30, hour 24) is not the agent's own stamp.
  if (!Number.isFinite(t) || new Date(t).toISOString().replace('.000Z', 'Z') !== started) throw new Error('health: no runtime mark');
  if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 0) throw new Error('health: no runtime mark');
  return `${started}|${pid}`;
}
/** The agentMark read's params: one computer in one recovery epoch (an answer lands only in the epoch that asked). */
type MarkParam = { computerId: string; epoch: number };

/** The Bot's computer and realm, for a read that is the agent's own and names no Bot (the speech models). */
const botScope = (key: string) => {
  const { realm, target } = botCall(key);
  return { realm, target };
};

export const botCall = (key: string) => {
  const p = parseBotKey(key);
  return { params: { id: p?.id ?? '' }, realm: p?.realm, target: computerTarget(p?.computerId ?? '') };
};

/** The view read's params: a Bot key, or the bots tile's {key, epoch} and {key, epoch, mark} (useTileBotView). */
type ViewParam = string | { key: string; epoch: number; mark?: string };
const viewKey = (p: ViewParam): string => (typeof p === 'string' ? p : p.key);

/** The mark of a links-by-Bot map read from one page of a longer list (a key with no '~', so never a Bot's): a Bot missing from
 *  such a map is not known to have no link (useBotLink reads its computer's own list). */
const LINKS_MORE = 'more';
/** One page of GET /bot-urls as links by Bot key, marked LINKS_MORE when the answer says more pages follow. */
function linkMap(raw: unknown): Record<string, BotLink | null> {
  const d = obj(dataOf(raw));
  const out: Record<string, BotLink | null> = {};
  for (const u of arr(d?.bot_urls).map(obj)) {
    const b = obj(u?.bot);
    out[botKey(str(u?.computer_id), str(b?.realm), str(b?.id))] = linkOf(u);
  }
  if (typeof d?.next_cursor === 'string' && d.next_cursor !== '') out[LINKS_MORE] = null;
  return out;
}

/** The shared lock of a message to the Bot (useSay): its held change names the Bot ({botKey}) and keeps the Idempotency-Key. */
export const SAY_LOCK = 'bots.say';
const source = coreSource(
  'bots',
  {
    reads: {
      computers: { route: containersRoute, input: () => ({ query: { limit: 100 } }), select: (raw) => {
          const rows = arr(obj(dataOf(raw))?.computers).map(obj);
          registerTargets(rows);
          const computers = rows.map(computerOf);
          noteRecoveries(computers);
          return computers;
        },
      },
      // One computer's Bots (the page reads every running computer of the realm, see useBotLists): core's one read of
      // it, shared with the Board's Bot tiles (one query key, so a refresh or invalidation here is theirs too).
      computerBots: computerBotsRead,
      bots: {
        route: ROUTES.list,
        input: () => ({ query: { limit: 100 } }),
        select: (raw, computerId: string) => items(raw).map((b) => rowOf(b, computerId)),
        refetchMs: 15000,
      },
      models: {
        route: ROUTES.models,
        input: () => ({ query: { limit: 500 } }),
        select: (raw) =>
          items(raw).map((m): ModelRow => {
            const spec = str(m?.spec) || str(m?.id);
            const provider = str(m?.provider) || (spec.split('/')[0] ?? '');
            return {
              spec,
              label: modelRowLabel(m, spec),
              provider,
              providerLabel: str(m?.provider_label) || provider,
              source: m?.source === 'fusion' ? 'fusion' : 'provider',
              ready: 'unknown',
              computerDefault: false,
              reasoning: m?.reasoning === true,
            };
          }),
      },
      myIp: { route: ROUTES.myIp, select: (raw): IpDetails | null => ipDetailsFrom(raw) },
      // The zone is the platform's Bot link domain. The suggestion carries it only when the API adds the address
      // (`url`); otherwise `useLinkOffer` takes it from a link that already exists, else from the platform.
      linkOffer: { route: ROUTES.urlSuggest, select: (raw) => ({ door: 'ready', suggestedLabel: str(dataOf(raw)?.label), zone: zoneOfUrl(str(dataOf(raw)?.url), str(dataOf(raw)?.label)) }) },
      // The account's links, newest first: one page (the API's largest). A Bot it does not show while more follow is read on linkHere.
      link: {
        route: ROUTES.urlList,
        input: () => ({ query: { limit: 100 } }),
        select: linkMap,
        refetchMs: 30000,
      },
      // One computer's links (one live link per Bot), read only for a Bot the account's page above did not show; read again
      // with that page (useBotLink).
      linkHere: {
        route: ROUTES.urlList,
        input: (computerId: string) => ({ query: { computer_id: computerId, limit: 100 } }),
        select: linkMap,
      },
      view: {
        route: ROUTES.get,
        input: (p: ViewParam) => botCall(viewKey(p)),
        select: (raw, p: ViewParam) => ({ [viewKey(p)]: viewOf(obj(raw), viewKey(p)) }),
        refetchMs: 8000,
      },
      // The tile's runtime mark of one computer (useTileBotView). Every tile of the computer shares the query;
      // overlapping polls join its fetch in flight.
      agentMark: {
        route: ROUTES.health,
        input: (p: MarkParam) => ({ target: computerTarget(p.computerId) }),
        select: (raw) => runtimeMarkOf(raw),
        refetchMs: 15000,
        staleTime: 15000,
      },
      delegates: {
        route: ROUTES.delegates,
        input: (key: string) => ({ ...botCall(key), query: { state: 'open', limit: 0 } }),
        select: (raw, key: string) => ({ [key]: items(raw).map(delegateOf) }),
        refetchMs: 10000,
      },
      // Settings > Helpers: the realm's agents (the AI helper's model, and the agents a task may name) and Claude Code's models.
      helperAgents: { route: ROUTES.agents, input: (key: string) => botScope(key), select: helperAgentsOf, refetchMs: 300000 },
      claudeSet: { route: ROUTES.acp, input: (key: string) => botScope(key), select: (raw): agent.ClaudeSet => agent.claudeSetOf({ ok: true, body: raw }), refetchMs: 300000 },
      // The speech models the Bot's agent offers for one capability, and the voices of one model.
      audioTts: { route: ROUTES.audioModels, input: (key: string) => ({ ...botScope(key), query: { capability: 'tts' } }), select: audioModelsOf, refetchMs: 300000 },
      audioStt: { route: ROUTES.audioModels, input: (key: string) => ({ ...botScope(key), query: { capability: 'stt' } }), select: audioModelsOf, refetchMs: 300000 },
      audioVoices: {
        route: ROUTES.audioVoices,
        input: (p: { key: string; model: string }) => ({ ...botScope(p.key), query: { model: p.model } }),
        select: (raw): Voice[] => items(raw).map((v) => ({ id: str(v?.id), languages: strs(v?.languages) })).filter((v) => v.id !== ''),
        refetchMs: 300000,
      },
      // One press of "Check it works": it reads nothing the person did not ask for and bills nothing; `n` makes every press its own read.
      // What the Bot's agent can do for voice (GET /version on its computer; realm none). A failed read stays unknown.
      voiceCaps: { route: versionRoute, input: (key: string) => ({ target: botCall(key).target }), select: voiceCapsOf, refetchMs: 300000 },
      voiceCheck: {
        route: ROUTES.voiceCheck,
        input: (p: { key: string; n: number }) => botCall(p.key),
        select: voiceCheckOf,
        staleTime: 0,
      },
      // How many finished tasks the Bot has: the agent's own count of the closed list (a one-row read), whatever the open list shows.
      // An answer without the count is no answer (never "none").
      delegatesClosedCount: {
        route: ROUTES.delegates,
        input: (key: string) => ({ ...botCall(key), query: { state: 'closed', page: 1, limit: 1 } }),
        select: (raw, key: string) => {
          const total = obj(obj(raw)?.meta)?.total;
          if (typeof total !== 'number' || !Number.isFinite(total) || total < 0) throw new Error('no count');
          return { [key]: total };
        },
        refetchMs: 10000,
      },
      // One page of the finished tasks, oldest first within the page (the agent lists the closed ones oldest first, so the newest are on the last page).
      delegatesFinished: {
        route: ROUTES.delegates,
        input: (p: { key: string; page: number }) => ({ ...botCall(p.key), query: { state: 'closed', page: p.page, limit: FINISHED_PAGE } }),
        select: (raw, p: { key: string; page: number }) => ({ [p.key]: items(raw).map(delegateOf) }),
        refetchMs: 15000,
      },
      // The closed list in big pages, read only while a stop may have gone through (useStopDelegate): the one proof that a stop that closes
      // did close. Answered under its own key (`closed:<bot>`) so the proof tells it from the open list.
      delegatesClosedProof: {
        route: ROUTES.delegates,
        input: (p: { key: string; page: number }) => ({ ...botCall(p.key), query: { state: 'closed', page: p.page, limit: CLOSED_PROOF_PAGE } }),
        select: (raw, p: { key: string; page: number }) => ({ [`closed:${p.key}`]: items(raw).map(delegateOf) }),
        refetchMs: 15000,
      },
      log: {
        route: ROUTES.log,
        input: (key: string) => ({ ...botCall(key), query: { tail: 'true', limit: 100 } }),
        select: (raw, key: string) => ({ [key]: logOf(raw) }),
        refetchMs: 5000,
      },
      // One page of the Bot's archive (the rows Start over and Forget moved out of the log): the newest 100 before
      // `before`, or the newest 100 when it is absent, oldest first within the page. Read only while its drawer is open.
      archive: {
        route: ROUTES.archive,
        // before only: the agent refuses tail on the archive, and tail with before anywhere.
        // The newest page asks before a seq past any row; the agent clamps it to the newest row + 1.
        input: (p: ArchiveParam) => ({ ...botCall(p.key), query: { limit: 100, before: p.before ?? ARCHIVE_NEWEST } }),
        select: (raw, p: ArchiveParam) => ({ [archiveKey(p.key, p.before)]: logOf(raw) }),
        refetchMs: 60000,
      },
      channels: {
        route: ROUTES.chanList,
        input: (key: string) => ({ ...botCall(key), query: { limit: 50 } }),
        select: (raw, key: string) => ({ [key]: { channels: items(raw).map(channelOf) } }),
        refetchMs: 15000,
      },
      // What to do to get a chat app's credentials (a read; the kind picks the answer).
      channelSetup: {
        route: ROUTES.chanSetup,
        input: (p: { key: string; kind: ChannelKind }) => ({ ...botCall(p.key), query: { kind: p.kind } }),
        select: (raw, p: { key: string; kind: ChannelKind }) => ({ [p.key]: setupOf(raw) ?? null }),
        refetchMs: 600000,
      },
      channelSettings: {
        route: ROUTES.chanSettings,
        input: botCall,
        select: (raw, key: string) => ({ [key]: channelSettingsOf(raw) }),
        refetchMs: 15000,
      },
    },
    changes: {
      // A message to the Bot itself (the Activity tab's composer). One unresolved message per Bot (lockKey: the Bot, never the
      // words): while one may have been sent, every other press is not sent (READ_BACK_FIRST) until its key is read back (useSay.check)
      // or the person stops tracking it. The hold keeps the key across a reload; no read of the log frees it (a log row proves nothing
      // about which press it was): only the by-key read does.
      say: {
        route: ROUTES.sendMessage,
        input: (v: SayVars) => ({ ...botCall(v.botKey), body: { text: v.text } }),
        select: (raw: unknown) => sayAnswerOf(raw),
        // Only an answer that names the message (and, posted, its turn) is done; any other 2xx may have gone through: held, read back.
        settles: (raw: unknown) => sayAnswerOf(raw) !== null,
        reads: ['log', 'view'],
        lock: SAY_LOCK,
        lockKey: (v: SayVars) => ({ botKey: v.botKey }),
      },
    },
  },
  // The ship build (__HUB_FIXTURES__ false) holds no fixture module: the fallback is given only in a fixture build,
  // the only build where coreSource answers from it (fixtureModeActive needs __HUB_FIXTURES__).
  pageFixtures('bots'),
);

/** The computer the top bar selected. */
export function useHere(): string {
  return useCurrentComputer()?.container.id ?? '';
}

/**
 * The top bar's computer as one of the page's `computers` (the New Bot drawer starts on it), or undefined. The page's
 * computers are the same list the top bar reads, so the ids are the same. The fixture world's sample computers keep
 * short ids of their own on this page: there the shown one is found by its name.
 */
export function useShownComputer(computers: readonly Computer[]): string | undefined {
  const id = useHere();
  if (!id) return undefined;
  if (__HUB_FIXTURES__ && fixtureModeActive() && !computers.some((c) => c.id === id)) {
    // The world's computer through the fixture seam (live code imports no fixture module: the terminal ship build).
    const name = fixtureModeActive() ? fixtureComputer(id)?.name : undefined;
    return computers.find((c) => c.name === name)?.id;
  }
  return id;
}

/** What reading one running computer's Bots gave. */
interface ListEntry {
  data: ComputerBots | undefined;
  failed: boolean;
  agentOut: boolean;
  /** Reads this computer's Bots again: true when they read now. */
  reread: () => Promise<boolean>;
}

/** One computer's Bots read as the page tells it: failed only with nothing read yet; signed out when the agent refused it so. */
export function readFailure(q: { isError: boolean; data: unknown; error: unknown } | undefined): { failed: boolean; agentOut: boolean } {
  const failed = q?.isError === true && q.data === undefined;
  return { failed, agentOut: failed && agentSignedOut(q?.error) };
}

/** One read of Bots per running computer of the realm, by computer id (live; fixtures answer 'bots' whole). */
function useBotLists(computers: readonly Computer[] | undefined): Readonly<Record<string, ListEntry>> {
  const ids = fixtureModeActive() ? [] : (computers ?? []).filter((c) => c.state === 'running' && targets.has(c.id)).map((c) => c.id);
  const qs = source.useQueries<BotList, string>('computerBots', ids);
  // The refusal's kind is in the key too: a never-read failure can turn signed out (or back) with status and dataUpdatedAt unchanged.
  const sig = `${ids.join()}|${qs.map((q) => `${q.status}${q.dataUpdatedAt}${readFailure(q).agentOut ? 'o' : ''}`).join()}`;
  const entry = (id: string, l: BotList | undefined): ComputerBots | undefined => (l ? { rows: l.items.map((b) => rowOf(b, id)), suspended: l.suspended, hasMore: l.hasMore } : undefined);
  return useMemo(
    () =>
      Object.fromEntries(
        ids.map((id, i) => {
          const q = qs[i];
          const reread = async () => {
            const r = await q?.refetch();
            return r !== undefined && !r.isError && r.data !== undefined;
          };
          return [id, { data: entry(id, q?.data), ...readFailure(q), reread }];
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sig],
  );
}

/** Every computer of the selected realm, with what reading its Bots gave. */
export function useComputers() {
  const q = source.useQuery<Computer[]>('computers');
  const feed = useBotLists(q.data);
  const data = useMemo(() => {
    if (fixtureModeActive() || !q.data) return q.data;
    return q.data.map((c) => {
      const f = feed[c.id];
      // A running computer with no address (no flat server_name, see registerTargets) is never read: its Bots are unknown,
      // so it shows as a failed read (Try again rereads the computers), never as read with no Bots.
      if (!f && c.state === 'running' && !targets.has(c.id)) return { ...c, listState: 'failed' as const };
      return f ? { ...c, listState: f.failed ? ('failed' as const) : c.listState, ...(f.agentOut ? { agentOut: true as const } : {}), suspended: f.data?.suspended ?? 0, hasMore: f.data?.hasMore ?? false } : c;
    });
  }, [q.data, feed]);
  // A sign-in's own read of the page (AgentSignIn's reread): the computer's Bots, read again now.
  const rereadBots = (computerId: string) => feed[computerId]?.reread() ?? Promise.resolve(false);
  return { ...q, data, rereadBots };
}

/** Every Bot of every running computer of the realm, with its link state joined by UID. */
export function useBots() {
  const live = !fixtureModeActive();
  const q = source.useQuery<BotRow[], string>('bots', useHere(), { enabled: !live });
  const computers = source.useQuery<Computer[]>('computers');
  const feed = useBotLists(computers.data);
  const links = source.useQuery<Record<string, BotLink | null>>('link');
  const realms = useRealms();
  const base = useMemo((): BotRow[] | undefined => {
    if (!live) return q.data;
    if (!computers.data) return undefined;
    return computers.data.flatMap((c) => feed[c.id]?.data?.rows ?? []);
  }, [live, q.data, computers.data, feed]);
  const data = useMemo(() => {
    if (!base) return base;
    const names = new Map((realms.data ?? []).map((r) => [r.id, r.name]));
    return base.map((r) => ({ ...r, realmName: names.get(r.realm) ?? r.realmName, link: (r.link === 'none' ? (links.data?.[r.key]?.status ?? 'none') : r.link) as BotRow['link'] }));
  }, [base, links.data, realms.data]);
  if (!live) return { ...q, data };
  const waiting = computers.isPending || (computers.data ?? []).some((c) => c.state === 'running' && targets.has(c.id) && feed[c.id]?.data === undefined && feed[c.id]?.failed !== true);
  return { data, isPending: waiting, isError: computers.isError, error: computers.error, refetch: () => source.invalidate(['computerBots']) };
}

export function useRealms() {
  const fq = source.useQuery<RealmInfo[]>('realms', undefined, { enabled: fixtureModeActive() });
  const core = useCoreRealms();
  return useMemo(() => {
    if (fixtureModeActive()) return fq;
    const data = core.rows?.map((r): RealmInfo => {
      const n = realmLabel(r.id);
      return { id: r.id, name: n.kind === 'alias' || n.kind === 'short' ? n.text : r.id, isGlobal: r.id === 'global' };
    });
    return { ...fq, data, isPending: core.rows === null, isError: false, error: null };
  }, [fq, core.rows]);
}

/** The caller's address as the platform sees it; read only when Add my IP is pressed (enabled false + refetch). */
export function useMyIp(enabled: boolean) {
  return source.useQuery<IpDetails | null>('myIp', undefined, { enabled });
}

export function useModels() {
  return source.useQuery<ModelRow[]>('models');
}

/** The offer from the suggestion query and the zone a link or the platform gives (`fill`). A current 503
 *  BOTS_DISABLED (Bot links are off on the platform) is the 'off' door with no label and no zone, never a filled one,
 *  also over an earlier answer the query still holds after the refused refetch; a later answer clears the error. Any
 *  other refusal is unchanged. */
export function linkOfferOf<Q extends { data?: LinkOffer; error?: unknown }>(q: Q, fill: Pick<LinkOffer, 'zone' | 'zoneFrom'>): Omit<Q, 'data'> & { data: LinkOffer | undefined } {
  const e = obj(q.error);
  const off: LinkOffer = { door: 'off', suggestedLabel: '', zone: '' };
  if (e?.status === 503 && e.code === 'BOTS_DISABLED') return { ...q, data: off };
  return q.data && q.data.zone === '' && fill.zone !== '' ? { ...q, data: { ...q.data, ...fill } } : { ...q, data: q.data };
}

/** The link offer with its zone: the suggestion's own address, else a link that exists, else the platform's Bot zone
 *  (botZone.ts: the SDK's botZoneFor on the page's realm API domain). '' when none of them gives one. */
export function useLinkOffer() {
  const q = source.useQuery<LinkOffer>('linkOffer');
  const links = source.useQuery<Record<string, BotLink | null>>('link');
  const fill = useMemo((): Pick<LinkOffer, 'zone' | 'zoneFrom'> => {
    const fromLink = zoneOfLinks(Object.values(links.data ?? {}));
    return fromLink !== '' ? { zone: fromLink } : { zone: zoneOfApiHost(realmDomain()), zoneFrom: 'platform' };
  }, [links.data]);
  return useMemo(() => linkOfferOf(q, fill), [q, fill]);
}

/** A per-Bot read waits for its computer's address (live) so it never goes to another computer. */
const on = (key: string | undefined) => ({ enabled: key !== undefined && (fixtureModeActive() || targets.has(parseBotKey(key)?.computerId ?? '')) });

export function useBotView(key: string | undefined) {
  const q = source.useQuery<Record<string, BotView>, string>('view', key ?? '', on(key));
  return { ...q, bot: key && q.data ? q.data[key] : undefined };
}

/** How long the tile waits for its computer's first runtime mark of an epoch before it reads the Bot without one. */
export const HEALTH_WAIT_MS = 3000;

/** True once `active` has held for HEALTH_WAIT_MS under this `scope` (a new scope starts again). */
function useWaitedOut(active: boolean, scope: string): boolean {
  const [outFor, setOutFor] = useState<string | null>(null);
  useEffect(() => {
    if (!active || outFor === scope) return;
    const t = setTimeout(() => setOutFor(scope), HEALTH_WAIT_MS);
    return () => clearTimeout(t);
  }, [active, scope, outFor]);
  return outFor === scope;
}

/** The bots tile's read of one Bot, keyed by its computer's recovery epoch and runtime mark.
 *  - With a good mark of this epoch (agentMark): {key, epoch, mark}, a read of the tile's own; a new mark (a restart
 *    no computers answer saw) starts a key with no data, so a Bot answer from before it is never shown again.
 *  - `healthOn` (the tile is on screen, its computer listed running and reachable) and the epoch's first health
 *    attempt not settled: `waiting`, no Bot read and no Bot shown, for at most HEALTH_WAIT_MS.
 *  - Otherwise (health failed, off, or slow past the bound): today's key, the Bots page's own read at epoch 0, kept
 *    through later polls until a good mark arrives. */
export function useTileBotView(key: string, healthOn = false) {
  const computerId = parseBotKey(key)?.computerId ?? '';
  const epoch = recoveryEpoch(computerId);
  const enabled = healthOn && !fixtureModeActive() && targets.has(computerId);
  const markQ = source.useQuery<string, MarkParam>('agentMark', { computerId, epoch }, { enabled });
  const mark = fixtureModeActive() ? undefined : markQ.data;
  const unsettled = enabled && mark === undefined && !markQ.isFetched;
  const waitedOut = useWaitedOut(unsettled, `${computerId}|${epoch}`);
  const waiting = unsettled && !waitedOut;
  const param: ViewParam = mark !== undefined || waiting ? { key, epoch, mark: mark ?? '' } : epoch ? { key, epoch } : key;
  const q = source.useQuery<Record<string, BotView>, ViewParam>('view', param, { enabled: on(key).enabled && !waiting });
  return { ...q, bot: q.data ? q.data[key] : undefined, waiting };
}

export function useBotLink(key: string | undefined) {
  const q = source.useQuery<Record<string, BotLink | null>>('link');
  const k = key ?? '';
  const computerId = parseBotKey(k)?.computerId ?? '';
  const first = q.data;
  // Not on the account's page while more pages follow: its link (or none) is read on its computer's own list.
  const more = k !== '' && computerId !== '' && first !== undefined && !(k in first) && LINKS_MORE in first;
  const here = source.useQuery<Record<string, BotLink | null>, string>('linkHere', computerId, { enabled: more });
  // Read again each time the account's links are (their refresh, a change's read-back): a change to this link shows here too.
  const refetchHere = useRef(here.refetch);
  refetchHere.current = here.refetch;
  const lastAt = useRef(q.dataUpdatedAt);
  useEffect(() => {
    if (lastAt.current === q.dataUpdatedAt) return;
    lastAt.current = q.dataUpdatedAt;
    if (more) void refetchHere.current();
  }, [q.dataUpdatedAt, more]);
  if (!more) return { ...q, link: k !== '' && first ? (first[k] ?? null) : null };
  // That list answers for it unless it too is a first page without it: then nothing is known (no data, no link).
  const d = here.data;
  const known = d !== undefined && (k in d || !(LINKS_MORE in d));
  return { ...here, data: known ? d : undefined, link: known && d ? (d[k] ?? null) : null };
}

/** Every Bot's link by row key (the list's Copy link reads the address from here). */
export function useLinkUrls() {
  const q = source.useQuery<Record<string, BotLink | null>>('link');
  return {
    ...q,
    urlOf: (key: string): string | null => q.data?.[key]?.url || null,
    /** The read answered that this Bot has no link: it has no address. Unread, failed, a Bot the page did not show while more pages
     *  follow, or a link without an address yet: false. */
    noAddress: (key: string): boolean => !!q.data && (key in q.data || !(LINKS_MORE in q.data)) && (q.data[key] ?? null) === null,
  };
}

export function useDelegates(key: string | undefined) {
  const q = source.useQuery<Record<string, Delegate[]>, string>('delegates', key ?? '', on(key));
  return { ...q, delegates: key && q.data ? (q.data[key] ?? []) : [] };
}

/** Finished tasks one read (and one More) brings. */
export const FINISHED_PAGE = 10;
/** Pages the first opening reads (the newest ones), so a new finish across a page edge does not leave a nearly empty list. */
const FINISHED_FIRST_PAGES = 2;

export interface FinishedList {
  /** The Bot's finished tasks, from the agent's own count; undefined while that is unknown. */
  count: number | undefined;
  /** The finished tasks read so far, newest first, each once. Empty until opened. */
  rows: Delegate[];
  loading: boolean;
  /** A count or page read failed (rows already read stay). */
  error: boolean;
  /** Older finished tasks than the rows are left to read. */
  canMore: boolean;
  more: () => void;
  retry: () => void;
}

/**
 * The Bot's finished tasks. The count is read whenever this is mounted (the Work tab); the tasks themselves only once `open`:
 * the newest pages first (the agent lists oldest first), and More reads the next older page, so every finished task is reachable.
 */
export function useFinishedDelegates(key: string | undefined, open: boolean): FinishedList {
  const enabled = key !== undefined && on(key).enabled;
  const countQ = source.useQuery<Record<string, number>, string>('delegatesClosedCount', key ?? '', { enabled });
  const count = key && countQ.data ? countQ.data[key] : undefined;
  // How many older pages the person asked for; another Bot, or closing the list, starts again.
  const [asked, setAsked] = useState<{ key: string | undefined; extra: number }>({ key, extra: 0 });
  const extra = asked.key === key ? asked.extra : 0;
  useEffect(() => {
    if (!open) setAsked({ key, extra: 0 });
  }, [open, key]);
  const last = count ? Math.ceil(count / FINISHED_PAGE) : 0;
  const wanted = open && enabled && key !== undefined ? Math.min(last, FINISHED_FIRST_PAGES + extra) : 0;
  const pages = Array.from({ length: wanted }, (_, i) => ({ key: key ?? '', page: last - i }));
  const qs = source.useQueries<Record<string, Delegate[]>, { key: string; page: number }>('delegatesFinished', pages);
  const seen = new Set<string>();
  const rows = open && key
    ? qs.flatMap((q) => [...(q.data?.[key] ?? [])].reverse()).filter((d) => !seen.has(d.sessionId) && !!seen.add(d.sessionId))
    : [];
  return {
    count,
    rows,
    loading: open && (countQ.isPending || qs.some((q) => q.isPending && q.fetchStatus !== 'idle')),
    error: open ? countQ.isError || qs.some((q) => q.isError) : false,
    canMore: open && last > wanted && qs.every((q) => q.data !== undefined),
    more: () => setAsked({ key, extra: extra + 1 }),
    retry: () => {
      if (countQ.isError) void countQ.refetch();
      for (const q of qs) if (q.isError) void q.refetch();
    },
  };
}

/** The log poll: its usual pace, and the safety read while the log's stream is live. */
export const LOG_POLL_MS = 5000;
export const LOG_POLL_LIVE_MS = 30000;

/** The Bot's log. With `stream` (the Bot pane), the log's stream wakes a read on each frame while the page is visible, and the
 *  poll slows to LOG_POLL_LIVE_MS while it is live; whenever it is not live the poll keeps LOG_POLL_MS. */
export function useLog(key: string | undefined, o: { stream?: boolean } = {}) {
  const [live, setLive] = useState(false);
  const q = source.useQuery<Record<string, LogPage>, string>('log', key ?? '', { ...on(key), refetchInterval: live ? LOG_POLL_LIVE_MS : LOG_POLL_MS });
  const page = key && q.data ? q.data[key] : undefined;
  const view = source.useQuery<Record<string, BotView>, string>('view', key ?? '', { enabled: false });
  useLogStream(o.stream ? key : undefined, page, q.refetch, view.refetch, setLive);
  return { ...q, page };
}

function useHostVisible(): boolean {
  const [v, setV] = useState(() => hostEnv().visible());
  useEffect(() => hostEnv().onVisibilityChange(() => setV(hostEnv().visible())), []);
  return v;
}

/** The seq a stream resumes after: the newest row the page holds (0 for none: an empty log replays nothing). */
const sinceOf = (page: LogPage | undefined): number => (page ? page.rows.reduce((m, r) => (r.seq > m ? r.seq : m), 0) : 0);

/** One budgeted stream (rank 'bot', the first cut) per Bot pane, held while the page is visible and the log was read once (its
 *  cursor is known). Closed, and the slot released, on unmount, when the page is hidden or the Bot changes. */
function useLogStream(key: string | undefined, page: LogPage | undefined, readLog: () => Promise<unknown>, readView: () => Promise<unknown>, setLive: (v: boolean) => void): void {
  const visible = useHostVisible();
  const read = useRef({ page, readLog, readView });
  useEffect(() => {
    read.current = { page, readLog, readView };
  });
  const ready = key !== undefined && page !== undefined && visible && !fixtureModeActive() && on(key).enabled;
  useEffect(() => {
    if (!ready || key === undefined) return;
    const call = botCall(key);
    const w = startLogWaker({
      open: (h) =>
        budgetedStream(
          ROUTES.logStream,
          { ...call, query: { since: sinceOf(read.current.page) }, onEvent: (name) => h.onEvent(name), onState: h.onState },
          { key: `botlog:${call.realm ?? ''}/${call.params.id}`, rank: 'bot' },
        ),
      readLog: () => read.current.readLog(),
      readView: () => read.current.readView(),
      onLive: setLive,
    });
    return () => {
      w.close();
      setLive(false);
    };
  }, [ready, key, setLive]);
}

/** An archive page's params: the Bot, and the seq the page ends before (absent: the newest page). */
export type ArchiveParam = { key: string; before?: number };
/** The before an archive's newest page asks: past any row (the agent clamps it to the newest row + 1). */
const ARCHIVE_NEWEST = Number.MAX_SAFE_INTEGER;
/** The key an archive page is held under: one per Bot and page. */
export const archiveKey = (key: string, before: number | undefined): string => `${key}|${before ?? ''}`;

/** One page of the Bot's archive, read only while `enabled` (its drawer is open). */
export function useArchive(key: string | undefined, before: number | undefined, enabled: boolean) {
  const q = source.useQuery<Record<string, LogPage>, ArchiveParam>('archive', { key: key ?? '', ...(before !== undefined ? { before } : {}) }, { enabled: enabled && on(key).enabled });
  return { ...q, page: key && q.data ? q.data[archiveKey(key, before)] : undefined };
}

export type OlderLog = { rows: LogRow[]; hasOlder: boolean };

/** The page of messages before `before` (read only; the log shows them above what it already holds). */
export const useLoadOlder = (botKey: string | undefined) =>
  useChange<OlderLog, { before: number }>(
    'loadOlder',
    async (v: { botKey: string; before: number }) => {
      const p = logOf(await api(ROUTES.log, { ...botCall(v.botKey), query: { before: v.before, limit: 100 } }));
      return { rows: p.rows, hasOlder: p.hasOlder };
    },
    [],
    { botKey },
  );

function setupOf(raw: unknown): ChannelSetup | undefined {
  const o = obj(raw);
  const kind = str(o?.kind);
  if (!o || (kind !== 'telegram' && kind !== 'slack' && kind !== 'discord')) return undefined;
  return { kind, steps: strs(o.steps), needs: strs(o.needs), available: o.available === true, manifest: str(o.manifest) };
}

/** The steps to get a chat app's credentials; read only while `enabled` (the form shows them). */
export function useChannelSetup(key: string | undefined, kind: ChannelKind, enabled: boolean) {
  const q = source.useQuery<Record<string, ChannelSetup | null>, { key: string; kind: ChannelKind }>('channelSetup', { key: key ?? '', kind }, { enabled: enabled && on(key).enabled });
  const setup = key && q.data ? q.data[key] : undefined;
  return { ...q, setup: setup && setup.kind === kind ? setup : undefined };
}

export function useChannels(key: string | undefined) {
  const q = source.useQuery<Record<string, { channels: Channel[] }>, string>('channels', key ?? '', on(key));
  const sq = source.useQuery<Record<string, ChannelSettings>, string>('channelSettings', key ?? '', on(key));
  // `settings` stays undefined until the Bot's own setting was read: "not paused" is never assumed.
  return { ...q, chat: key && q.data ? { channels: q.data[key]?.channels ?? [], settings: sq.data?.[key] } : undefined };
}

// ── changes ─────────────────────────────────────────────────────────────────────────
// Each change returns the C9 outcome (done | pending | failed | not_sent | stale). A pending
// change is never sent again: the page shows "may have gone through", reads back, and only then
// offers the action again (useLockedChange; under fixtures the fixture mutation answers).

export type RunOutcome = 'idle' | 'running' | OutcomeKind;

/** One send core holds as "may have gone through" (core held()): its identity (the lockKey value) and its hold token. */
export interface HeldSend {
  readonly identity: unknown;
  readonly hold: string;
}

export interface Change<T, V> {
  /** `cancelled`: the person cancelled the 2FA code prompt (outcome not_sent): nothing to say, the form stays as it was. */
  run: (vars: V) => Promise<{ outcome: OutcomeKind; data?: T; code?: string; cancelled?: true }>;
  outcome: RunOutcome;
  data: T | undefined;
  code: string | undefined;
  /** A definite refusal's details (the agent's error details) and the request id this send used. */
  details: Readonly<Record<string, unknown>> | undefined;
  idem: string | undefined;
  running: boolean;
  /** After pending: re-read the state; the action is offered again afterwards. */
  /** true only when the read proved the outcome (the lock was freed). */
  readBack: () => Promise<boolean>;
  /** "May have gone through", acknowledged: frees this change without proof (the person was warned). */
  dismiss: () => void;
  /** The sends core holds for this change in the current scope, read now: what dismiss() would free, each with its
   *  identity (createBot: { computerId }) and that very send's hold token. Fixture mode holds none: undefined. */
  held: () => ReadonlyArray<HeldSend> | undefined;
  /** The warned Dismiss of exactly `rows`, the sends a warning showed when it armed: each frees only its own send,
   *  never one held after it or under another identity. true when every row was freed, and the hook's own outcome
   *  is idle again; false when one was freed or replaced since (nothing of it is touched). */
  dismissShown: (rows: ReadonlyArray<HeldSend>) => Promise<boolean>;
  /** A fresh form's idle outcome. Never while the change is running (its answer lands as it comes, in fixture mode
   *  too) or may have gone through: those stay shown as they are. */
  reset: () => void;
}

/** The channel-wide settings as the agent reports them: the value that applies (`effective`), else the Bot's own. */
export function channelSettingsOf(raw: unknown): ChannelSettings {
  const o = obj(raw) ?? {};
  const set = obj(o.settings) ?? {};
  const eff = obj(o.effective) ?? {};
  const val = (name: string): unknown => obj(eff[name])?.value ?? set[name];
  return { ok: typeof obj(eff.channels_paused)?.value === 'boolean', paused: val('channels_paused') === true, maxChannels: num(val('max_channels')), rateBotPerDay: num(val('rate_bot_per_day')), view: settingsViewOf(o) };
}

/**
 * The read keys of this page's source a change shows its effect in. A change of one computer's Bot is
 * released only by reads of that computer (a read that names no computer, such as a link list, counts):
 * a read of another computer must not lift its lock.
 */
export const readsOf = (keys: readonly string[], computerId?: string) => sourceReads('bots', keys, computerId ? { computer: computerId } : {});

type Ctx = Record<string, unknown>;
// A live send: the vars (with the hook's context merged in) and the idempotency key → the answer, selected.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Send = (v: any, idem: string) => Promise<unknown>;

/** The change's lock id: it survives a remount, and one Bot's pending change never holds another Bot's. */
// A change that is held per task carries the task in its id: another task's hold is not this one's pending state, and a dismiss frees only its own.
// A create carries its computer (useCreateBot) the same way: another computer's held create is not this one's.
export const changeId = (key: string, ctx: Record<string, unknown>): string => `bots.${key}.${String(ctx.botKey ?? ctx.linkId ?? ctx.computerId ?? '')}${typeof ctx.sessionId === 'string' && ctx.sessionId !== '' ? `.${ctx.sessionId}` : ''}`;

/**
 * What a change shows: the core lock decides pending and running (every mount of the same change sees
 * them, so a remount during a send still reads "running"); the hook's own state shows the rest.
 */
export function shownOutcome(live: boolean, lock: 'free' | 'running' | 'pending', local: RunOutcome): RunOutcome {
  if (!live) return local;
  if (lock === 'pending') return 'pending';
  if (lock === 'running') return 'running';
  // A free lock holds nothing here: a local "may have gone through" was proven by a read-back (core's own, after the
  // send), dismissed elsewhere, or belongs to another realm's lock. It is never shown over a free lock.
  return local === 'running' || local === 'pending' ? 'idle' : local;
}

/**
 * What makes two presses the same create: the Bot, link or key's owner, never the typed name, label or token.
 * While one may have gone through, a press with other text is refused too (core's lockKey).
 */
/** The chat app changes that write its `enabled` (see LOCK_KEYS.channelChange). */
const ENABLED_WRITERS: ReadonlySet<string> = new Set(['restart', 'enable', 'disable', 'webhookRemove']);

export const LOCK_KEYS: Readonly<Record<string, (v: Record<string, unknown>) => unknown>> = {
  createBot: (v) => ({ computerId: v.computerId }),
  createLink: (v) => ({ botKey: v.botKey }),
  mintKey: (v) => ({ linkId: v.linkId }),
  // One unresolved change per app, action and person or chat (ids only: never a name, a code or a token).
  // Every change that writes the app's `enabled` (a restart's pause and resume, enable, disable, the webhook removal's enable)
  // shares one lock per app: a restart's resume can never land after another sender's disable, nor the reverse.
  channelChange: (v) => ({ botKey: v.botKey, action: ENABLED_WRITERS.has(String(v.action)) ? 'enabled' : v.action, channelId: v.channelId, target: v.target ?? '' }),
  // Which section's fields (their names, never their text) and whether the rules go with it: one unresolved save per section.
  saveSettings: (v) => ({ botKey: v.botKey, fields: Object.keys((v.patch as object | undefined) ?? {}).sort().join(','), rules: Array.isArray(v.rules) }),
  rotateKey: (v) => ({ linkId: v.linkId, keyId: v.keyId }),
  keyChange: (v) => ({ linkId: v.linkId, keyId: v.keyId, action: v.action }),
  // One unresolved pause or resume per Bot, whichever way it went: a Resume must not pass a held Pause. What the press wanted is in its identity.
  channelsPause: (v) => ({ botKey: v.botKey }),
  // One unresolved revoke-all per link.
  keyRevokeAll: (v) => ({ linkId: v.linkId }),
  // One unresolved stop per task (ids only): a second stop of it, with or without closing, waits for the first to be read back.
  stopDelegate: (v) => ({ botKey: v.botKey, sessionId: v.sessionId }),
  // One unresolved message per task (ids only, never the text): a second one to it, whatever it says, waits for the first to be settled.
  sendMessage: (v) => ({ botKey: v.botKey, sessionId: v.sessionId }),
  decideGate: (v) => ({ gate: (v.gate as { id?: string } | null)?.id ?? '', generation: (v.gate as { generation?: number } | null)?.generation ?? 0, botKey: v.botKey }),
  // One unresolved action per Bot (a link's delete: per link; a resume: per computer), ids only (parts/proofs.ts botAction).
  botAction: (v) => BOT_PROOFS.botAction.lockKey(v),
};

/** What a held change records as its identity for `proves` when that is more than its lock key (ids and wanted states, never typed text or a secret). */
export const IDENTITIES: Readonly<Record<string, (v: Record<string, unknown>) => unknown>> = {
  channelsPause: (v) => ({ botKey: v.botKey, uid: v.uid, paused: v.paused }),
  // What the stop wanted: the proof needs to know whether it closes the task.
  stopDelegate: (v) => ({ botKey: v.botKey, sessionId: v.sessionId, close: v.close === true }),
  // What the action was and the baseline its press saw (a resume: the paused count), ids and counts only.
  botAction: (v) => BOT_PROOFS.botAction.identity(v),
};

/**
 * The Bot action proof's read 0 (parts/proofs.ts botAction: a computer's own Bots list) from what a read-back fetched: each list
 * as the proof takes it, named by the computer it was read from. A list that did not carry its counts is not `ok`: its paused
 * count may be a default, never a fact.
 */
export function listProofAnswers(answers: readonly unknown[]): readonly unknown[] {
  const out: unknown[] = [];
  for (const a of answers) {
    if (!a || typeof a !== 'object') continue;
    const l = a as Partial<BotList>;
    if (!Array.isArray(l.items) || typeof l.computerId !== 'string' || l.computerId === '') continue;
    const computerId = l.computerId;
    const ok = l.counted === true && rawListOk({ items: l.items, meta: { total: l.items.length }, suspended_count: l.suspended });
    out.push({ ok, computerId, rows: ok ? l.items.map((b) => { const r = rowOf(b as Raw, computerId); return { key: r.key, id: r.id, uid: r.uid, name: r.name, computerId }; }) : [], suspended: l.suspended, hasMore: l.hasMore });
  }
  return out;
}

/**
 * The stop proof's answers (parts/proofs.ts stopDelegate: read 0 the open list, read 1 the closed pages) from the one list a read-back
 * gives. Provenance is the key, never the rows: the open list is the Bot's own answer (`<bot>`), the closed pages are the proof read's
 * answers (`closed:<bot>`). A closed row in the open list is no closed-list proof, and another Bot's answers carry another key.
 */
export function stopProofAnswers(botKey: string, answers: readonly unknown[]): readonly (readonly unknown[])[] {
  const open: unknown[] = [];
  const closed: unknown[] = [];
  const rowsOf = (v: unknown): unknown[] | undefined => (Array.isArray(v) ? v : undefined);
  const facts = (rows: unknown[]): unknown[] => rows.map((d) => (d && typeof d === 'object' ? { sessionId: (d as Delegate).sessionId, state: (d as Delegate).state, idle: (d as Delegate).idle === true } : d));
  for (const a of answers) {
    if (!a || typeof a !== 'object') continue;
    const r = a as Record<string, unknown>;
    const proof = rowsOf(r[`closed:${botKey}`]);
    const mine = rowsOf(r[botKey]);
    if (proof) closed.push({ [botKey]: facts(proof) });
    else if (mine) open.push({ [botKey]: facts(mine) });
  }
  return [open, closed];
}

/** What a fresh read proves about a change nobody got an answer to (no proof: only a dismiss frees it). */
export const PROVES: Readonly<Record<string, (identity: unknown, answers: readonly (readonly unknown[])[]) => 'applied' | undefined>> = {
  // Revoke-all stuck as unknown is applied once the link is listed whole (its keys known) with no key left. A key minted since
  // shows as a key: that stays unknown, never a false "applied". The link is looked for in every list the read-back fetched
  // (KEY_REVOKE_ALL_READS: the account's page, and a computer's own list for a link past that page).
  keyRevokeAll: (identity, answers) => {
    const id = identity as { linkId?: string } | null;
    if (!id?.linkId) return undefined;
    for (const a of answers[0] ?? []) {
      if (!a || typeof a !== 'object') continue;
      for (const l of Object.values(a as Record<string, BotLink | null>)) {
        if (l && l.id === id.linkId) return l.keysKnown && l.keys.length === 0 ? 'applied' : undefined;
      }
    }
    return undefined;
  },
  // A pause or resume stuck as unknown is applied once the settings read shows the wanted state of the SAME Bot: the view read
  // of that refresh must show the uid the press carried (a Bot deleted and made again under the same name is another Bot).
  channelsPause: (identity, answers) => {
    const id = identity as { botKey?: string; uid?: string; paused?: boolean } | null;
    if (!id?.botKey || !id.uid || typeof id.paused !== 'boolean') return undefined;
    // One refresh answers every read of the change in one list (settings, chat apps, view): tell them apart by what they carry.
    const mine = (answers[0] ?? []).map((a) => (a && typeof a === 'object' ? (a as Record<string, unknown>)[id.botKey as string] : undefined)).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
    // The view must be this Bot's own: its id is the key's id (a view without an id, or with another one, is no proof) and its uid the press's.
    const botId = parseBotKey(id.botKey)?.id;
    if (!botId || !mine.some((x) => x.id === botId && x.uid === id.uid)) return undefined;
    const st = mine.find((x) => typeof x.paused === 'boolean' && x.ok === true);
    return st && st.paused === id.paused ? 'applied' : undefined;
  },
  // A stop stuck as unknown is applied only on a positive read: the task listed closed (any page of the closed list), or, for a stop that
  // does not close it, an idle open task. A task missing from the open list proves nothing (parts/proofs.ts stopDelegate).
  stopDelegate: (identity, answers) => {
    const id = identity as { botKey?: unknown } | null;
    if (!id || typeof id.botKey !== 'string') return undefined;
    const p = BOT_PROOFS.stopDelegate;
    return p.proves(p.identity(id as Record<string, unknown>), stopProofAnswers(id.botKey, answers[0] ?? [])) === 'applied' ? 'applied' : undefined;
  },
  // A resume of a computer's paused Bots stuck as unknown is applied once that computer's own list counts none paused, and only
  // for a press that saw some (parts/proofs.ts botAction). The other Bot actions have no read wired here: a warned Dismiss frees them.
  botAction: (identity, answers) => {
    if ((identity as { action?: unknown } | null)?.action !== 'resume') return undefined;
    return BOT_PROOFS.botAction.proves(identity, [listProofAnswers(answers[0] ?? [])]) === 'applied' ? 'applied' : undefined;
  },
  // A gate decision stuck as unknown is applied once the Bot's view no longer shows that gate.
  decideGate: (identity, answers) => {
    const id = identity as { gate?: string; generation?: number; botKey?: string } | null;
    if (!id?.botKey || !id.gate) return undefined;
    const views = (answers[0] ?? []).flatMap((a) => (a && typeof a === 'object' ? [(a as Record<string, BotView>)[id.botKey as string]] : []));
    const v = views.find((x) => x !== undefined);
    if (!v) return undefined;
    return v.gate && v.gate.id === id.gate && v.gate.generation === id.generation ? undefined : 'applied';
  },
};

/** Fixture mode only: a state's answer is fixed data, but some live changes answer by what was sent. These shape the fixed
 *  answer by the call's vars as the live change would, so a fixture page never shows what the live one cannot. */
const FIXTURE_SHAPE: Partial<Record<string, (data: unknown, vars: Record<string, unknown>) => unknown>> = {
  // createBotFlow stops after the Bot when the link switch is off: no link, no key (the drawer once said Link and
  // Key were skipped while it showed a key and an address).
  createBot: (data, vars) => {
    const d = data as NewBotResult | undefined;
    return d && vars.withLink === false && d.state === 'done' ? { ...d, link: null, secret: null } : data;
  },
};

/** The changes whose answer holds a secret (a new or rotated key's, a new Bot's first key). Their hook keeps that answer
 *  only for the change on screen: a slot whose id the hook has left keeps its outcome and nothing else (useChange), and
 *  core's lock keeps no copy of it (LockedOptions.secret: its `last` holds no `data`). */
const SECRET_ANSWERS: ReadonlySet<string> = new Set(['mintKey', 'rotateKey', 'createBot']);

/** What a cancelled 2FA prompt leaves: the hook's state as it was before the press (an earlier outcome or secret stays
 *  shown), and the caller told nothing was sent by the person's own choice (core's LockedResult.cancelled). */
export function afterCancel<S>(before: S): { state: S; answer: { outcome: 'not_sent'; cancelled: true } } {
  return { state: before, answer: { outcome: 'not_sent', cancelled: true } };
}

function useChange<T, V = void>(key: string, send: Send, reads: readonly string[] | ((k: readonly unknown[]) => boolean), ctx: Ctx = {}, fixtureReads: ReadonlyArray<{ refetch: () => unknown }> = []): Change<T, V> {
  const m = source.useMutation<T, unknown>(key);
  const id = changeId(key, ctx);
  // What the read-back reads: the change's read names (only this Bot's computer's, for a change keyed by Bot), or the
  // caller's own predicate (keyRevokeAllReads).
  const readPred = typeof reads === 'function' ? reads : readsOf(reads, parseBotKey(typeof ctx.botKey === 'string' ? ctx.botKey : undefined)?.computerId);
  const locked = useLockedChange<unknown, T>(send as (v: unknown, idem: string) => Promise<T>, [readPred], id, { realm: true, quietCancel: true, ...(LOCK_KEYS[key] ? { lockKey: LOCK_KEYS[key] as (v: unknown) => unknown } : {}), ...(IDENTITIES[key] ? { identity: IDENTITIES[key] as (v: unknown) => unknown } : {}), ...(PROVES[key] ? { proves: PROVES[key] } : {}), ...(SECRET_ANSWERS.has(key) ? { secret: true } : {}) });
  // The hook's own outcome, one slot per change id (`byId`; `at` is the id on screen). The pane stays mounted across a Bot
  // change, so a hook keyed by Bot or link gets another id then: the new id shows its own slot (idle at first, never the
  // last Bot's outcome), and the left slot is kept, so what only the hook knows (a guardrails save whose rules may have gone
  // through, a fixture pending) shows again when its Bot comes back. Every write goes to the slot of the render that made
  // it: a run's late answer lands in its own change's slot, never in the one on screen. A slot of a SECRET_ANSWERS change
  // keeps only its outcome once it is not on screen (left, or answered after the switch): a key is never held in memory
  // or drawn again after a Bot change. A hold, if any, stays in core and shows on its own Bot. The New Bot drawer's create
  // is keyed by its computer the same way (useCreateBot): a computer change shows that computer's slot.
  // `ctx`: the context captured at the press that wrote it. Live, a slot is shown only while that context lives
  // (core alive): a late answer after a realm switch, an account change or a sign-out renders nothing.
  type Own = { outcome: RunOutcome; data?: T; code?: string; details?: Readonly<Record<string, unknown>>; idem?: string; ctx?: PressCtx };
  const [slots, setSlots] = useState<{ at: string; byId: Readonly<Record<string, Own>> }>(() => ({ at: id, byId: {} }));
  const offScreen = (o: Own): Own => (SECRET_ANSWERS.has(key) ? { outcome: o.outcome } : o);
  // A SECRET_ANSWERS change's state without its answer (`data`, where the key rides); outcome, code and the rest kept.
  const withoutKey = (o: Own): Own => {
    if (!SECRET_ANSWERS.has(key)) return o;
    const { data: _data, ...rest } = o;
    return rest;
  };
  if (slots.at !== id) {
    setSlots((sl) => {
      if (sl.at === id) return sl;
      const left = sl.byId[sl.at];
      return { at: id, byId: left ? { ...sl.byId, [sl.at]: offScreen(left) } : sl.byId };
    });
  }
  const slot: Own = slots.byId[id] ?? { outcome: 'idle' };
  const live = !fixtureModeActive();
  const state: Own = live && slot.ctx && !alive(slot.ctx) ? { outcome: 'idle' } : slot;
  const setState = (next: Own | ((o: Own) => Own)): void => {
    setSlots((sl) => {
      const was = sl.byId[id] ?? { outcome: 'idle' };
      const now = typeof next === 'function' ? next(was) : next;
      return { ...sl, byId: { ...sl.byId, [id]: sl.at === id ? now : offScreen(now) } };
    });
  };
  const run: Change<T, V>['run'] = async (vars) => {
    const all = { ...ctx, ...(vars as object) };
    // The press's context (what locked.run captures too): its outcome shows only while it lives.
    const press = live ? capture() : undefined;
    // The state this press started from (the render's): a cancelled 2FA prompt puts it back. A SECRET_ANSWERS change's
    // earlier answer (`data`, the key) is not part of it (withoutKey): the key a press found shown is the pane's to hold
    // and drop, so a cancel never puts a key back in the hook after the pane dropped it.
    const before = withoutKey(state);
    // Fixture mode: a press while this change may have gone through sends nothing and leaves its slot as it is (still
    // pending), so the next press is refused too. Live, core's lock refuses it (READ_BACK_FIRST, set back to pending below).
    if (!live && state.outcome === 'pending') return { outcome: 'not_sent', code: 'READ_BACK_FIRST' };
    // Running, a SECRET_ANSWERS change holds no earlier key either: reset refuses a running change, so a drop of the key
    // shown while this press is out (Done, leaving Link, a page hide) leaves nothing behind in the hook.
    // A slot written in a context that has died carries nothing of it into this press.
    setState((s) => ({ ...(s.ctx && !alive(s.ctx) ? {} : withoutKey(s)), outcome: 'running', ...(press ? { ctx: press } : {}) }));
    if (live) {
      const r = await locked.run(all);
      // The person's own Cancel of the 2FA prompt: no banner, no notice; the change reads as never pressed.
      if (r.cancelled) { const c = afterCancel(before); setState(c.state); return c.answer; }
      const held = r.code === 'READ_BACK_FIRST';
      setState({ outcome: held ? 'pending' : (r.outcome as OutcomeKind), data: r.data as T | undefined, code: r.code, details: r.details, idem: r.idem, ...(press ? { ctx: press } : {}) });
      return { outcome: held ? 'not_sent' : (r.outcome as OutcomeKind), data: r.data as T | undefined, code: r.code };
    }
    try {
      const got = await m.mutateAsync(all);
      const shape = FIXTURE_SHAPE[key];
      const res = shape && got.data !== undefined ? { ...got, data: shape(got.data, all as Record<string, unknown>) as T } : got;
      setState({ outcome: res.outcome, data: res.data, code: res.code });
      return res;
    } catch {
      setState({ outcome: 'failed' });
      return { outcome: 'failed' };
    }
  };
  const readBack = async (): Promise<boolean> => {
    if (live) {
      const proved = await locked.readBack();
      if (proved) setState({ outcome: 'idle' });
      return proved;
    }
    await Promise.all(fixtureReads.map((r) => r.refetch()));
    setState({ outcome: 'idle' });
    return true;
  };
  // Each row by its identity and hold (core dismissOne): a send that replaced one since it was shown is not freed.
  const dismissShown = async (rows: ReadonlyArray<HeldSend>): Promise<boolean> => {
    const freed = !live || (await Promise.all(rows.map((r) => locked.dismissOne(r.identity, { hold: r.hold })))).every(Boolean);
    if (freed) setState({ outcome: 'idle' });
    return freed;
  };
  const pending = live && locked.state === 'pending';
  const outcome = shownOutcome(live, locked.state, state.outcome);
  return { run, outcome, data: state.data, code: state.code, details: state.details, idem: state.idem, running: outcome === 'running', readBack, dismiss: () => { if (live) locked.dismiss(); setState({ outcome: 'idle' }); }, held: () => (live ? locked.held() : undefined), dismissShown, reset: () => !pending && state.outcome !== 'pending' && state.outcome !== 'running' && setState({ outcome: 'idle' }) };
}

const botQuery = (v: { uid?: string; revision?: number }) => ({ expect_uid: v.uid, ...(v.revision !== undefined ? { expect_revision: v.revision } : {}) });
const asObj = (x: unknown): Raw => obj(x);

/** What the Bot holds for its voice (its `speech` setting); null when it holds none (the agent's default voices then apply). */
export interface SpeechConfig {
  /** The object as the agent holds it. A save sends it back whole with only the edited fields changed, since a PATCH replaces `speech` whole. */
  raw: Record<string, unknown>;
  sttModel: string;
  ttsModel: string;
  voice: string;
  language: string;
  speed: number | null;
  speakWakes: boolean;
  speakGates: boolean;
}

export interface AudioModel {
  id: string;
  capabilities: string[];
  languages: string[];
  available: boolean;
  reason: string;
}

export interface Voice {
  id: string;
  languages: string[];
}

/** Today's speech use of a Bot and its realm (UTC day), with the limits that apply: the agent's speech_usage. */
export interface SpeechUsage {
  day: string;
  /** The next UTC midnight (RFC 3339). */
  resetsAt: string;
  used: { ttsChars: number; sttSeconds: number };
  /** The Bot's own limits; `source` says whether each is the Bot's (bot) or the default; null when the agent did not say. */
  limits: { ttsChars: number; sttSeconds: number; source: { ttsChars: 'bot' | 'default' | null; sttSeconds: 'bot' | 'default' | null } };
  realmUsed: { ttsChars: number; sttSeconds: number };
  realmLimits: { ttsChars: number; sttSeconds: number };
}

/** One stage (listening or speaking) of the voice check. */
export interface VoiceStage {
  ok: boolean;
  model: string;
  voice: string;
  code: string;
  reason: string;
  message: string;
  retryable: boolean | null;
  /** The most characters one speech call takes with the resolved model (speaking stage, when ok and known: bot_voice_check_limits); null or absent when not known. */
  maxInputChars?: number | null;
}

export interface VoiceCheck {
  ready: boolean;
  stt: VoiceStage | null;
  tts: VoiceStage | null;
}

export interface BotCtx {
  botKey: string;
  uid: string;
  revision?: number;
}

export interface SettingsPatch {
  name?: string;
  role?: string;
  instructions?: string;
  model?: string;
  yolo?: boolean;
  /** MCP answers end with the count of waiting messages and approvals (Behaviour); sent only to an agent that reports it. */
  mcp_hints?: boolean;
  guardrail_check?: 'strict' | 'lenient' | 'off';
  allowed_computers?: string[];
  allowed_agents?: string[];
  /** The Bot's whole voice setting (a PATCH replaces it); null takes it away, so the default voices apply. */
  speech?: Record<string, unknown> | null;
  /** The Helpers section: the backend new helpers run on, the backends they may be given, and Claude Code's agent and model. */
  worker_backend?: WorkerBackend;
  allowed_worker_backends?: WorkerBackend[];
  worker_delegated_agent?: string;
  worker_delegated_model?: string;
  /** The helper options (Settings > Helpers): a Hoody-model helper's model and thinking, a Claude Code helper's effort; '' takes one away. */
  worker_model?: string;
  worker_thinking?: RouteThinking;
  worker_delegated_effort?: WorkerEffort;
  /** Routing (Settings > Helpers): the whole setting, sent as one; off sends the mode alone. */
  routing?: { mode: RoutingSet['mode']; light?: RouteTier; heavy?: RouteTier };
}

export interface NewBotVars {
  name: string;
  computerId: string;
  model: string;
  instructions: string;
  /** Give it a link and a first key in the same flow (the label is the offered one). */
  withLink: boolean;
  label: string;
  /** Auto-approve for its helpers: a new Bot starts On. */
  yolo: boolean;
}

/** What a step's failure means for the flow: it may have been applied (never sent again) or it was not. */
const maybeApplied = (e: unknown): boolean => outcomeOf(e, true) === 'pending';

/**
 * The realm a new Bot is made in, from the realm the flow captured: with All realms selected a Global Bot (no Bot lives in
 * `all`, and any computer can hold a Global one, one in no realm too); otherwise undefined, so the call carries the
 * captured realm (or a token session's pin) as every agent call does.
 */
export const newBotRealm = (selected: string): string | undefined => (selected === 'all' ? 'global' : undefined);

/**
 * The Bot, then its link, then the first key, strictly in that order, all in the context captured when the flow starts.
 * The Bot's own failure is the change's failure (so a lost answer is the locked, read-back-first outcome). A later step's failure
 * ends the flow with the Bot kept and says where it stopped; a step that may have been applied is never
 * sent again, the person checks the Bot's Link tab. The secret leaves only through the scrub.
 */
export async function createBotFlow(v: NewBotVars): Promise<NewBotResult> {
  const ctx = capture();
  const id = botIdFromName(v.name);
  const into = newBotRealm(ctx.realm);
  const raw = await api(ROUTES.create, { ctx, target: computerTarget(v.computerId), ...(into ? { realm: into } : {}), body: { id, name: v.name, instructions: v.instructions, model: v.model, yolo: v.yolo } });
  const bot = asObj(raw);
  const realm = str(bot?.realm);
  const key = botKey(v.computerId, realm, id);
  const done = (state: NewBotResult['state'], link: BotLink | null = null, secret: string | null = null): NewBotResult => ({ state, botKey: key, link, secret });
  if (!v.withLink) return done('done');
  let link: BotLink;
  try {
    const made = await api(ROUTES.urlCreate, { ctx, body: { computer_id: v.computerId, bot: { realm, id, uid: str(bot?.uid) }, ...(v.label ? { label: v.label } : {}), cors: false } });
    link = linkOf(dataOf(made), obj(obj(made)?.propagation));
  } catch (e) {
    return done(maybeApplied(e) ? 'linkmaybe' : outcomeOf(e, true) === 'stale' ? 'stale' : 'nolink');
  }
  try {
    const minted = await mintCall((scrub) => api(ROUTES.keyCreate, { ctx, params: { id: link.id }, body: { name: 'default', ipv4_allow: [], notes: '' }, scrub }));
    return done('done', link, minted.secret);
  } catch (e) {
    // Only the name refusal (the route keeps that code) means a key of this name is there; any other 409 (a held server's
    // SUBSERVER_DORMANT) made no key. The 2FA lockout (the other code the route keeps) made no key either, and has its own
    // words: the fix is to wait, not just to make a key.
    const code = (e as { code?: unknown } | null)?.code;
    return done(maybeApplied(e) ? 'keyunknown' : outcomeOf(e, true) === 'stale' ? 'stale' : code === 'BOT_KEY_NAME_TAKEN' ? 'exists' : code === MINT_LOCKED ? 'keylocked' : 'nokey', link);
  }
}

/**
 * The New Bot create of one computer, the drawer's: its id carries the computer (changeId), so each computer's create has
 * its own lock and its own outcome (useChange's per-id slots). A create held for another computer is never shown, read back
 * or dismissed under this one, and does not hold this one's Create. No computer yet: an id of its own (Create waits on one).
 */
export const useCreateBot = (computerId: string | undefined) =>
  useChange<NewBotResult, NewBotVars>(
    'createBot',
    createBotFlow,
    ['bots', 'computerBots', 'link'],
    computerId ? { computerId } : {},
  );

export interface SavedSettings {
  /** The revision the PATCH answered with: the Bot's revision after this write. */
  revision?: number;
}

export const useSaveSettings = (c: BotCtx) =>
  useChange<SavedSettings, { patch: SettingsPatch; uid?: string; revision?: number }>(
    'saveSettings',
    async (v: BotCtx & { patch: SettingsPatch }): Promise<SavedSettings> => {
      const raw = await api(ROUTES.patch, { ...botCall(v.botKey), query: botQuery(v), body: v.patch });
      const revision = num(asObj(raw)?.revision) || undefined;
      return revision !== undefined ? { revision } : {};
    },
    ['view', 'bots', 'computerBots'],
    { ...c },
  );

/**
 * The Guardrails section: the mode and computers (PATCH), then the rules (PUT). Both are owner writes that
 * move the Bot's revision, so the second carries the revision the first answered with. The PATCH is the
 * change's own outcome; what became of the rules is its answer, so a half-saved section is said honestly. The rules write's
 * refusal of the fence is kept by its code: 412 revision_mismatch (a write since the PATCH) is 'stale', 412 bot_changed
 * (another Bot under the id) is 'gone'.
 */
export interface GuardrailsResult {
  /** `too_long`: the agent refused the rules because the Bot's card (name, role, instructions and rules together) would be over its bound
   *  (400 bad_request, details.field "guardrails": the only refusal of this write that names the field). The same rules are refused again. */
  rules: 'saved' | 'failed' | 'too_long' | 'unknown' | 'stale' | 'gone';
  /** The Bot's revision after this save's last write that answered: the rules' when saved, the PATCH's when the section is half saved. The form's fence follows it. */
  revision?: number;
}

export async function guardrailsFlow(v: BotCtx & { patch: SettingsPatch; rules: string[] }): Promise<GuardrailsResult> {
  const raw = await api(ROUTES.patch, { ...botCall(v.botKey), query: botQuery(v), body: v.patch });
  const revision = num(asObj(raw)?.revision) || undefined;
  try {
    const put = await api(ROUTES.guardrails, { ...botCall(v.botKey), query: botQuery({ uid: v.uid, ...(revision !== undefined ? { revision } : {}) }), body: { guardrails: v.rules.join('\n') } });
    const last = num(asObj(put)?.revision) || undefined;
    return { rules: 'saved', ...(last !== undefined ? { revision: last } : {}) };
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    const field = asObj((e as { details?: unknown } | null)?.details)?.field;
    const rules = maybeApplied(e) ? 'unknown' : code === 'revision_mismatch' ? 'stale' : code === 'bot_changed' ? 'gone' : code === 'bad_request' && field === 'guardrails' ? 'too_long' : 'failed';
    return { rules, ...(revision !== undefined ? { revision } : {}) };
  }
}

export const useSaveGuardrails = (c: BotCtx) =>
  useChange<GuardrailsResult, { patch: SettingsPatch; rules: string[]; uid?: string; revision?: number }>('saveSettings', guardrailsFlow, ['view', 'bots', 'computerBots'], { ...c });

export interface GateCtx {
  botKey: string;
  gate: Gate | null;
}

export const useDecideGate = (c: GateCtx, reads: ReadonlyArray<{ refetch: () => unknown }> = []) =>
  useChange<{ replayed: boolean }, { approve: boolean; reason?: string; answer?: string }>(
    'decideGate',
    async (v: GateCtx & { approve: boolean; reason?: string; answer?: string }, idem: string) => {
      const g = v.gate;
      if (!g) throw { code: 'NO_GATE', status: 400 };
      const body =
        g.type === 'question'
          ? { gate_id: g.id, generation: g.generation, request_id: idem, answer: { answer: v.answer ?? '' } }
          : { gate_id: g.id, generation: g.generation, request_id: idem, confirm: { approved: v.approve, ...(v.reason ? { reason: v.reason } : {}) } };
      const raw = await api(ROUTES.gate, { ...botCall(v.botKey), body });
      return { replayed: asObj(raw)?.replayed === true };
    },
    ['view', 'log'],
    { ...c },
    reads,
  );

/**
 * A message about one task, sent to the Bot (the agent has no route to a task itself: it passes the words on at the task's next step).
 * Posted once with an Idempotency-Key; nothing proves a lost answer, so it stays unknown until the person has looked at the log.
 */
/** What the Bot did with a task message: posted, queued, or dropped unposted (`dropped`: the agent's reason, '' when it gave
 *  none). A dropped message never reaches the task and its key keeps answering dropped: a new send is a new message. */
export interface TaskMessageAnswer {
  queued: boolean;
  dropped?: string;
}
export async function sendMessageCall(v: { botKey: string; sessionId: string; text: string }, idem: string): Promise<TaskMessageAnswer> {
  const b = botCall(v.botKey);
  const raw = await api(ROUTES.sendMessage, { ...b, body: { text: v.text }, idem });
  const a = asObj(raw);
  if (a?.state === 'dropped') return { queued: false, dropped: typeof a.reason === 'string' ? a.reason : '' };
  return { queued: a?.state === 'queued' };
}

/**
 * The tasks of a Bot with a message that may have been sent (unresolved), from core's holds, so they stay reachable when the task is gone
 * from the list or the page was reloaded. A hold's id carries `bots.sendMessage.<bot>.<task>@<realm>`: read here only to name the task; whether
 * the message is still unresolved is always what that task's own change says (useMessageTask), never this list.
 */
export function heldMessageTasks(botKey: string, refs: readonly Pick<HoldRef, 'id'>[]): string[] {
  const mark = `\u0001l:bots.sendMessage.${botKey}.`;
  const out: string[] = [];
  for (const r of refs) {
    const at = r.id.indexOf(mark);
    if (at < 0) continue;
    const rest = r.id.slice(at + mark.length);
    const sid = rest.slice(0, rest.search(/[@\u0000]/) < 0 ? rest.length : rest.search(/[@\u0000]/));
    if (sid !== '' && !out.includes(sid)) out.push(sid);
  }
  return out;
}

export function useHeldMessageTasks(botKey: string): string[] {
  useChangesVersion(); // re-read when a hold is made or freed
  return botKey === '' ? [] : heldMessageTasks(botKey, changeHoldRefs());
}

/** The realm's agents for Settings > Helpers; undefined while unread or after a failed read (the words then name no model). */
export function useHelperAgents(key: string | undefined, enabled: boolean) {
  const k = agentsKeyOf(key);
  return source.useQuery<HelperAgents, string>('helperAgents', k ?? '', { enabled: enabled && on(k).enabled });
}

/** The agents read is the computer's and realm's, not one Bot's: one key per computer and realm, whichever Bot asks. */
function agentsKeyOf(key: string | undefined): string | undefined {
  const p = parseBotKey(key);
  return p ? botKey(p.computerId, p.realm, 'agents') : key;
}

/** A Bot's model words once the agents read says what the AI page gives it: never blank. */
export function useBotModelLabel(key: string | undefined, bot: { model: string; modelLabel: string } | undefined): string {
  const q = useHelperAgents(key, bot?.model === '');
  if (!bot) return '';
  // A failed read cannot tell, even with an earlier answer kept (the query keeps its last data through a failed refetch).
  return bot.model !== '' ? bot.modelLabel : botModelLabel('', q.isError ? null : q.data, LABEL_WORDS);
}

/** The list's model words: one agents read per computer and realm that holds a Bot following the AI page. */
export function useBotModelLabels<R extends { key: string; model: string; modelLabel: string }>(rows: readonly R[] | undefined): readonly R[] | undefined {
  const keys = [...new Set((rows ?? []).filter((r) => r.model === '').map((r) => agentsKeyOf(r.key)).filter((k): k is string => !!k && on(k).enabled))].sort();
  const qs = source.useQueries<HelperAgents, string>('helperAgents', keys);
  // A failed read cannot tell, even with an earlier answer kept.
  const byKey = new Map(keys.map((k, i) => [k, qs[i]?.isError ? undefined : qs[i]?.data]));
  const sig = keys.map((k) => `${k}=${byKey.get(k)?.botModel ?? '?'}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the reads' answers are in `sig`
  return useMemo(() => rows?.map((r) => (r.model !== '' ? r : { ...r, modelLabel: botModelLabel('', byKey.get(agentsKeyOf(r.key) ?? ''), LABEL_WORDS) })), [rows, sig]);
}

/** Claude Code's models on the Bot's computer; undefined while unread or after a failed read. */
export function useClaudeSet(key: string | undefined, enabled: boolean) {
  return source.useQuery<agent.ClaudeSet, string>('claudeSet', key ?? '', { enabled: enabled && on(key).enabled });
}

/** The speech models of one capability that the Bot's agent offers; undefined while unknown (never an empty list for a failed read). */
export function useAudioModels(key: string | undefined, capability: 'tts' | 'stt', enabled: boolean) {
  const q = source.useQuery<AudioModel[], string>(capability === 'tts' ? 'audioTts' : 'audioStt', key ?? '', { enabled: enabled && on(key).enabled });
  return { ...q, models: q.data ? q.data.filter((m) => m.capabilities.length === 0 || m.capabilities.includes(capability)) : undefined };
}

/** The voices of one speech model; undefined while unknown. */
export function useVoices(key: string | undefined, model: string) {
  const q = source.useQuery<Voice[], { key: string; model: string }>('audioVoices', { key: key ?? '', model }, { enabled: model !== '' && on(key).enabled });
  return { ...q, voices: model !== '' ? q.data : undefined };
}

let checkSeq = 0;
/** What the Bot's agent can do for voice: each flag undefined until its computer's /version answers (and after a failed read), never false for "not known". */
export function useVoiceCaps(key: string | undefined): VoiceCaps {
  const { enabled } = on(key);
  return voiceCapsNow(source.useQuery<VoiceCaps, string>('voiceCaps', key ?? '', { enabled }), enabled);
}

/** The voice flags a read shows now: a failed read, or one that is off (its computer is no longer reachable), is
 *  unknown even when an earlier one answered (the query keeps that answer), so a stale "no" or "yes" never outlives it. */
export function voiceCapsNow(q: { data?: VoiceCaps; isError: boolean }, enabled = true): VoiceCaps {
  return !enabled || q.isError || q.data === undefined ? VOICE_CAPS_UNKNOWN : q.data;
}

/** "Check it works": each press reads the Bot's voice readiness once, anew. The answer is the last press's, never an earlier one's. */
export function useVoiceCheck(key: string | undefined, config: SpeechConfig | null) {
  // What was checked: the Bot and the setting it held. A result belongs to that and goes when it changes (a save, another writer's change).
  const sig = `${key ?? ''}|${JSON.stringify(config?.raw ?? null)}`;
  const [st, setSt] = useState({ n: 0, sig: '' });
  // A press belongs to the settings it was made for: when they change it is spent for good, so coming back to them reads nothing.
  if (st.n > 0 && st.sig !== sig) setSt({ n: 0, sig: '' });
  const live = st.n > 0 && st.sig === sig;
  const q = source.useQuery<VoiceCheck, { key: string; n: number }>('voiceCheck', { key: key ?? '', n: live ? st.n : 0 }, { enabled: live && on(key).enabled });
  return { run: () => setSt({ n: ++checkSeq, sig }), asked: live, checking: live && q.isFetching, result: live ? q.data : undefined, failed: live && !q.isFetching && q.isError };
}

export const useMessageTask = (botKey: string, sessionId: string, reads: ReadonlyArray<{ refetch: () => unknown }> = []) =>
  useChange<TaskMessageAnswer, { sessionId: string; text: string }>('sendMessage', sendMessageCall, ['log', 'view'], { botKey, sessionId }, reads);

/** Stop one turn: the turn is named by the press (the one the person was shown), never read again later, so a turn that started since is
 *  never cancelled; `matched` false says that turn had ended already and nothing was stopped. */
export const useStopTurn = (c: { botKey: string }) =>
  useChange<{ matched: boolean }, { turnId: string }>(
    'stopTurn',
    async (v: { botKey: string; turnId: string }) => {
      const raw = await api(ROUTES.cancel, { ...botCall(v.botKey), body: { turn_id: v.turnId } });
      return { matched: asObj(raw)?.matched === true };
    },
    ['view', 'bots', 'computerBots'],
    { ...c },
  );

export interface SayVars {
  botKey: string;
  text: string;
}
/** What the Bot answered a message: posted (its turn started: turnId) or queued (it waits for the Bot's current turn to end). */
export interface SayAnswer {
  messageId: string;
  state: 'posted' | 'queued';
  turnId: string | null;
}
/** The answer of POST /bots/{id}/messages or of the by-key read; null for any other shape (a 2xx that names no message). */
export function sayAnswerOf(raw: unknown): SayAnswer | null {
  const b = obj(raw);
  const id = str(b?.message_id);
  if (!b || id === '') return null;
  if (b.state === 'queued') return { messageId: id, state: 'queued', turnId: null };
  if (b.state === 'posted' && str(b.turn_id) !== '') return { messageId: id, state: 'posted', turnId: str(b.turn_id) };
  return null;
}

/** The turn a Stop confirm is for, and when the view was read for it. */
export interface FrozenTurn {
  turn: string | null;
  at: number;
}

/**
 * The turn a Stop confirm is for: the first turn the view reads while the confirm is open, frozen until the confirm closes or the Bot
 * changes. A view not read yet (`undefined`) freezes nothing: null, and the confirm waits (a confirm opened by link
 * before the read still opens on the read's turn). No turn at that read (null) freezes none: the confirm stays off. A turn that
 * starts after the freeze is never taken, so Stop never cancels a later turn; the confirm names the read time (`at`) so the person
 * knows which turn stops.
 */
export function useFrozenTurn(open: boolean, botKey: string, viewTurn: string | null | undefined, now: () => number = Date.now): FrozenTurn | null {
  const [f, setF] = useState<(FrozenTurn & { key: string }) | null>(null);
  if (!open) {
    if (f !== null) setF(null);
    return null;
  }
  if (f !== null && f.key === botKey) return { turn: f.turn, at: f.at };
  if (viewTurn === undefined) {
    if (f !== null) setF(null);
    return null;
  }
  const next = { key: botKey, turn: viewTurn, at: now() };
  setF(next);
  return { turn: next.turn, at: next.at };
}

/**
 * The uid a reset, forget, purge or Delete confirm is for: the Bot's uid as the view read it when the confirm opened (`key`
 * names the Bot and the confirm), kept until it closes or the key changes. The change sends it (expect_uid), so a Bot replaced
 * under the same id while the confirm is open (the view's refresh reads a new uid) is refused by the agent, never acted on.
 * A view not read yet keeps nothing (undefined); the confirm then sends the uid the view holds at the press.
 */
export function useFrozenUid(open: boolean, key: string, viewUid: string | undefined): string | undefined {
  const [f, setF] = useState<{ key: string; uid: string } | null>(null);
  if (!open) {
    if (f !== null) setF(null);
    return undefined;
  }
  if (f !== null && f.key === key) return f.uid;
  if (viewUid === undefined) {
    if (f !== null) setF(null);
    return undefined;
  }
  setF({ key, uid: viewUid });
  return viewUid;
}

/** What a Check again of a held message found: the Bot has it (and the hold is freed), or nothing is concluded (it stays held). */
export type SayCheck = { t: 'found'; answer: SayAnswer } | { t: 'missing' } | { t: 'accepting' } | { t: 'unknown' };

/**
 * A message to the Bot (C9): sent once with an Idempotency-Key. A lost answer is held (core's lock, kept across a reload) and never sent
 * again from here: Check again reads the message by the HELD key (GET /bots/{id}/messages/by-key/{key}); only a found message frees
 * the hold. A miss proves nothing (the key may have expired, or the message is still on its way), so it stays held until the person stops
 * tracking it. Only this page's own sends are judged (heldBy 'self').
 */
export function useSay(botKey: string) {
  const m = source.useMutation<SayAnswer | null, SayVars>('say');
  useChangesVersion(); // a hold made or freed (here, another mount, another tab) is read again
  const held = botKey === '' ? undefined : heldChanges(SAY_LOCK).find((h) => (h.identity as { botKey?: unknown } | null)?.botKey === botKey && source.heldBy('say', h) === 'self');
  const [checking, setChecking] = useState(false);
  const check = async (): Promise<SayCheck> => {
    const h = held;
    const p = parseBotKey(botKey);
    if (!h || !h.key || !h.hold || !p) return { t: 'unknown' };
    setChecking(true);
    try {
      const r = await readBotMessage({ target: computerTarget(p.computerId), realm: p.realm, bot: p.id, key: h.key });
      if (r.t !== 'found') return { t: r.t };
      // Freed only for the send that was read (its hold token), and its key dropped: the next message is a new one.
      await m.complete({ botKey, text: '' }, h.hold);
      void source.invalidate(['log', 'view']);
      return { t: 'found', answer: { messageId: r.id, state: r.state, turnId: r.turn ?? null } };
    } finally {
      setChecking(false);
    }
  };
  const send = async (text: string) => m.mutateAsync({ botKey, text });
  const stopTracking = async () => (held?.hold ? m.dismiss({ botKey, text: '' }, held.hold) : false);
  return { send, held: held !== undefined, check, checking, stopTracking, sending: m.isPending };
}

/**
 * Why Delete Bot stopped (the change's `code` on a 'failed' outcome; fixed words, never a value):
 *   BOT_LINK_UNREAD         the Bot's public links could not be read: nothing was sent.
 *   BOT_LINK_OTHER          a link under this Bot's computer, realm and id names another Bot (an earlier one's): nothing was sent.
 *   BOT_LINK_NO_ACCESS      this sign-in may not read or remove public links: nothing was deleted.
 *   BOT_LINK_OWNER_ONLY     only the project's owner may remove the link (403 BOT_URL_OWNER_ONLY), or see it (an empty list read by
 *                           anyone else): the Bot was not deleted.
 *   BOT_LINK_KEPT           the link's removal was refused: the Bot was not deleted.
 *   BOT_LINK_GONE_BOT_KEPT  the link was removed in this run, then the Bot's own delete was refused or not sent: the Bot stays, without a link.
 */
export const DELETE_BOT_CODES = ['BOT_LINK_UNREAD', 'BOT_LINK_OTHER', 'BOT_LINK_NO_ACCESS', 'BOT_LINK_OWNER_ONLY', 'BOT_LINK_KEPT', 'BOT_LINK_GONE_BOT_KEPT'] as const;
export type DeleteBotCode = (typeof DELETE_BOT_CODES)[number];
const deleteStop = (code: DeleteBotCode, e?: unknown): { code: DeleteBotCode; status?: number } => {
  const status = (e as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? { code, status } : { code };
};

/** Whose a link row is: this Bot's (its uid; or its computer, realm and id while a uid is unknown), another Bot's at this
 *  Bot's computer, realm and id (a uid that is not this Bot's), or neither. */
function linkWhose(u: Raw, p: { computerId: string; realm: string; id: string }, uid: string): 'mine' | 'other' | 'none' {
  const b = obj(u?.bot);
  if (uid !== '' && b?.uid === uid) return 'mine';
  if (u?.computer_id !== p.computerId || b?.realm !== p.realm || b?.id !== p.id) return 'none';
  return uid !== '' && b?.uid !== '' ? 'other' : 'mine';
}

/** How many pages of a computer's Bot URLs Delete Bot reads before it calls the list unread (100 a page). */
const LINK_PAGES_MAX = 20;

/**
 * The ids of the public links (Bot URLs) that are this Bot's, from a fresh read of its computer's links, every page:
 * the link of its uid, and a link under its computer, realm and id that names no other uid.
 * Throws when a page fails, the list does not end, or a row cannot be read as written (no id, no Bot under this
 * computer, a cursor that is neither null nor text): an unread list is never "no link".
 * A link under this Bot's computer, realm and id that names ANOTHER uid is some other Bot's (this one was replaced, or the
 * link is an older Bot's): it is never removed here, and the Bot is not deleted past it (BOT_LINK_OTHER; the Link tab removes it).
 * The API lists a computer's links to its project's owner alone and gives anyone else an empty list, never a refusal: a list
 * with no row is "no link" only once the computer's project is read as the caller's own (linksVisible), else BOT_LINK_OWNER_ONLY.
 */
export async function botLinkIds(v: { botKey: string; uid: string }): Promise<string[]> {
  const p = parseBotKey(v.botKey);
  if (!p || p.computerId === '') throw { code: 'BOT_LINK_UNREAD' };
  const ids: string[] = [];
  let rows = 0;
  let cursor: string | undefined;
  for (let page = 0; page < LINK_PAGES_MAX; page++) {
    const d = obj(dataOf(await api(ROUTES.urlList, { query: { computer_id: p.computerId, limit: 100, ...(cursor ? { cursor } : {}) } })));
    if (!d || !Array.isArray(d.bot_urls)) throw { code: 'BOT_LINK_UNREAD' };
    for (const row of d.bot_urls as unknown[]) {
      rows += 1;
      const u = obj(row);
      if (!u || typeof u.id !== 'string' || u.id === '') throw { code: 'BOT_LINK_UNREAD' };
      const b = obj(u.bot);
      const here = u.computer_id === p.computerId;
      if (here && (!b || typeof b.realm !== 'string' || typeof b.id !== 'string' || typeof b.uid !== 'string')) throw { code: 'BOT_LINK_UNREAD' };
      const whose = linkWhose(u, p, v.uid);
      if (whose === 'other') throw { code: 'BOT_LINK_OTHER' };
      if (whose === 'mine' && !ids.includes(u.id)) ids.push(u.id);
    }
    const next = d.next_cursor;
    if (next === null) {
      if (rows === 0) await linksVisible(p.computerId);
      return ids;
    }
    if (typeof next !== 'string' || next === '') throw { code: 'BOT_LINK_UNREAD' };
    cursor = next;
  }
  throw { code: 'BOT_LINK_UNREAD' };
}

/** An empty link list counts only for the owner of the computer's project: read fresh, it must name the account this page
 *  acts for (BOT_LINK_OWNER_ONLY when it names another; BOT_LINK_UNREAD when either is not known). A collaborator's Delete Bot
 *  would otherwise delete the Bot and leave the owner's public link up, a link no page of theirs shows. */
async function linksVisible(computerId: string): Promise<void> {
  const pid = computerTarget(computerId).project.id;
  const me = capture().account;
  if (pid === '' || !me) throw { code: 'BOT_LINK_UNREAD' };
  const owner = str(dataOf(await api(ROUTES.project, { params: { pid } }))?.user_id);
  if (owner === '') throw { code: 'BOT_LINK_UNREAD' };
  if (owner !== me) throw { code: 'BOT_LINK_OWNER_ONLY' };
}

/**
 * Delete Bot: its public link first, then the Bot, strictly in that order, each step sent once. The agent's delete is
 * invisible to the Hoody API, so a Bot deleted before its link would leave a live link no page shows.
 *   - The links are read fresh; an unread list sends nothing (BOT_LINK_UNREAD, BOT_LINK_NO_ACCESS), nor does an empty one read
 *     by someone other than the project's owner (BOT_LINK_OWNER_ONLY: the API shows them none of its links).
 *   - Each link is read again right before its removal; one that no longer names this Bot is left alone. A removal's
 *     answer must name the link and say `removed`, else its outcome is unknown.
 *   - A link's removal that may have gone through is the change's own unknown outcome: the Bot is not deleted, and a
 *     later press reads the links again first (a link that went is not removed twice). A link already gone (404) is gone.
 *   - A refused removal ends the flow with the Bot kept (BOT_LINK_OWNER_ONLY, BOT_LINK_KEPT).
 *   - The Bot's own delete keeps its outcome; refused or never sent after a link went in this run it says so
 *     (BOT_LINK_GONE_BOT_KEPT). Its unknown outcome stays unknown.
 */
export async function deleteBotFlow(v: { botKey: string; uid: string }): Promise<void> {
  let ids: string[];
  try {
    ids = await botLinkIds(v);
  } catch (e) {
    if (outcomeOf(e) === 'stale') throw e;
    const c = (e as { code?: unknown } | null)?.code;
    throw deleteStop(c === 'TOKEN_LACKS' ? 'BOT_LINK_NO_ACCESS' : c === 'BOT_LINK_OTHER' ? 'BOT_LINK_OTHER' : c === 'BOT_LINK_OWNER_ONLY' ? 'BOT_LINK_OWNER_ONLY' : 'BOT_LINK_UNREAD', e);
  }
  let removed = 0;
  const p = parseBotKey(v.botKey);
  for (const id of ids) {
    // The link is read once more right before its removal: the API removes by id whatever the link names by then, so a
    // link re-pointed to another Bot since the list is left alone (it is not this Bot's any more).
    try {
      const u = obj(dataOf(await api(ROUTES.urlGet, { params: { id } })));
      if (!p || !u || u.id !== id) throw { code: 'BOT_LINK_UNREAD' };
      // Re-pointed to another computer it keeps its uid, and it is not this Bot's link any more.
      if (u.computer_id !== p.computerId) continue;
      const b = obj(u.bot);
      if (!b || typeof b.realm !== 'string' || typeof b.id !== 'string' || typeof b.uid !== 'string') throw { code: 'BOT_LINK_UNREAD' };
      if (linkWhose(u, p, v.uid) !== 'mine') continue;
    } catch (e) {
      const x = e as { status?: unknown; code?: unknown } | null;
      if (outcomeOf(e) === 'stale') throw e;
      if (x?.status === 404 && x.code === 'BOT_URL_NOT_FOUND') continue;
      throw deleteStop(x?.code === 'TOKEN_LACKS' ? 'BOT_LINK_NO_ACCESS' : removed > 0 ? 'BOT_LINK_GONE_BOT_KEPT' : 'BOT_LINK_UNREAD', e);
    }
    try {
      const done = obj(dataOf(await api(ROUTES.urlDelete, { params: { id } })));
      // An answer that does not say this link is removed proves nothing: the removal is unknown, the Bot is not deleted.
      if (!done || done.id !== id || done.state !== 'removed') throw { kind: 'pending', code: 'BOT_LINK_REMOVAL_UNPROVEN' };
      removed += 1;
    } catch (e) {
      const x = e as { status?: unknown; code?: unknown } | null;
      const out = outcomeOf(e, true);
      if (out === 'pending' || out === 'stale') throw e;
      if (x?.code === 'TOKEN_LACKS') throw deleteStop('BOT_LINK_NO_ACCESS');
      if (out === 'not_sent') throw e;
      if (x?.status === 404 && x.code === 'BOT_URL_NOT_FOUND') continue;
      throw deleteStop(x?.status === 403 && x.code === 'BOT_URL_OWNER_ONLY' ? 'BOT_LINK_OWNER_ONLY' : 'BOT_LINK_KEPT', e);
    }
  }
  try {
    await api(ROUTES.remove, { ...botCall(v.botKey), query: botQuery({ uid: v.uid }) });
  } catch (e) {
    const out = outcomeOf(e, true);
    if (removed > 0 && (out === 'failed' || out === 'not_sent')) throw deleteStop('BOT_LINK_GONE_BOT_KEPT', e);
    throw e;
  }
}

export type BotActionName = 'reset' | 'forget' | 'purge' | 'delete' | 'resume' | 'deleteLink';
export const useBotAction = (c: { botKey?: string; uid?: string; linkId?: string } = {}) =>
  // `uid` in the vars: the uid a confirm kept (useFrozenUid), sent in place of the hook's.
  // `suspended` (a resume): the paused count the press saw, the baseline its proof needs.
  useChange<void, { action: BotActionName; computerId?: string; uid?: string; suspended?: number }>(
    'botAction',
    async (v: { botKey: string; uid: string; linkId?: string; action: BotActionName; computerId?: string }) => {
      const q = botQuery(v);
      if (v.action === 'resume') await api(ROUTES.resume, { target: computerTarget(v.computerId ?? '') });
      else if (v.action === 'deleteLink') await api(ROUTES.urlDelete, { params: { id: v.linkId ?? '' } });
      else if (v.action === 'delete') await deleteBotFlow(v);
      else await api(ROUTES[v.action], { ...botCall(v.botKey), query: q });
    },
    ['bots', 'computerBots', 'view', 'link', 'log'],
    { ...c },
  );

export const useCreateLink = (c: BotCtx) =>
  useChange<BotLink, { label: string; cors: boolean }>(
    'createLink',
    async (v: BotCtx & { label: string; cors: boolean }) => {
      const p = parseBotKey(v.botKey);
      const raw = await api(ROUTES.urlCreate, { body: { computer_id: p?.computerId ?? '', bot: { realm: p?.realm ?? '', id: p?.id ?? '', uid: v.uid }, ...(v.label ? { label: v.label } : {}), cors: v.cors } });
      return linkOf(dataOf(raw), obj(obj(raw)?.propagation));
    },
    ['link', 'bots', 'computerBots'],
    { ...c },
  );

export const usePatchLink = (linkId: string) =>
  useChange<BotLink, { enabled?: boolean; cors?: boolean; limits?: BotLink['limits'] }>(
    'patchLink',
    async (v: { linkId: string; enabled?: boolean; cors?: boolean; limits?: BotLink['limits'] }) => {
      const { linkId: id, ...body } = v;
      const raw = await api(ROUTES.urlPatch, { params: { id }, body });
      return linkOf(dataOf(raw), obj(obj(raw)?.propagation));
    },
    ['link'],
    { linkId },
  );

export const usePanic = (linkId: string) =>
  useChange<BotLink, void>(
    'panic',
    async (v: { linkId: string }) => {
      const raw = await api(ROUTES.urlPanic, { params: { id: v.linkId } });
      return linkOf(dataOf(raw), obj(obj(raw)?.propagation));
    },
    ['link'],
    { linkId },
  );

/** The live send of Revoke all keys: one POST, nothing else. */
export async function sendKeyRevokeAll(v: { linkId: string }): Promise<{ revoked: number }> {
  const raw = await api(ROUTES.keyRevokeAll, { params: { id: v.linkId } });
  return { revoked: num(dataOf(raw)?.revoked_count) };
}

/** What a Revoke all reads back: the account's links and, for a Bot that page does not show, its computer's own list
 *  (useBotLink), so a link the Link tab shows from either list can be proved (PROVES.keyRevokeAll). */
export const KEY_REVOKE_ALL_READS: readonly string[] = ['link', 'linkHere'];
/** KEY_REVOKE_ALL_READS as the read-back reads them: of the computers' own lists, only the link's Bot's computer's (the
 *  list's param, slot 7 of the key; the target slot is empty for this realm-route read). Another computer's list, still
 *  cached from a Bot opened earlier, cannot hold this link and could only fail the read-back. No computer: all of them. */
export const keyRevokeAllReads = (computerId?: string): ((k: readonly unknown[]) => boolean) => {
  const link = readsOf(['link']);
  const here = readsOf(['linkHere']);
  return (k) => link(k) || (here(k) && (!computerId || k[7] === computerId));
};
export const useKeyRevokeAll = (linkId: string, computerId?: string) => useChange<{ revoked: number }, void>('keyRevokeAll', sendKeyRevokeAll, keyRevokeAllReads(computerId), { linkId });

export const useRepoint = (c: BotCtx & { linkId: string }) =>
  useChange<BotLink, { computerId: string }>(
    'repoint',
    async (v: BotCtx & { linkId: string; computerId: string }) => {
      const p = parseBotKey(v.botKey);
      const raw = await api(ROUTES.urlRepoint, { params: { id: v.linkId }, body: { computer_id: v.computerId, bot: { realm: p?.realm ?? '', id: p?.id ?? '', uid: v.uid } } });
      return linkOf(dataOf(raw), obj(obj(raw)?.propagation));
    },
    ['link'],
    { ...c },
  );

/** A fresh secret: copied out of the answer once and wiped from it before anything else sees it. */
async function mintCall(call: (scrub: (a: unknown) => void) => Promise<unknown>): Promise<MintResult> {
  let held: MintResult | null = null;
  await call((a) => {
    const d = dataOf(a);
    if (!d) return;
    held = mintOf(d);
    for (const k of ['secret', 'curl', 'curl_chat', 'curl_mcp']) d[k] = null;
  });
  if (!held) throw { code: 'SCRUB_FAILED' };
  return held;
}

/**
 * What the key form holds (typed text is sent as is; the holder note is trimmed by the form).
 * `holderNote` undefined means the form did not touch it: an edit then leaves the stored note alone (it may have been written
 * elsewhere since this page loaded it), a new key then has none. An empty string on an edit clears the stored note.
 */
export interface KeyFields {
  name: string;
  allowlist: string[];
  /**
   * The expiry as the API takes it: null (none / clear it) or a UTC RFC 3339 time ending in Z. A new key always has one of the two.
   * On an edit, `undefined` means the person left the date alone: it is not sent, so the stored time (which the form only shows as a
   * day) stays exactly as it is.
   */
  expiresAt?: string | null;
  notes: string;
  holderNote?: string;
}

/** Hoody API's bound on a holder note, in characters (code points, not bytes or UTF-16 units). */
export const HOLDER_NOTE_MAX = 1000;
export const holderNoteTooLong = (s: string): boolean => Array.from(s).length > HOLDER_NOTE_MAX;
/** The owner notes' bound, in characters as the API counts them (BOT_NOTES_MAX). */
export const KEY_NOTES_MAX = 500;
export const keyNotesTooLong = (s: string): boolean => Array.from(s).length > KEY_NOTES_MAX;

/** A new key carries a holder note only when there is one. */
export const mintKeyBody = (f: KeyFields) => ({ name: f.name, ipv4_allow: f.allowlist, ...(f.expiresAt ? { expires_at: f.expiresAt } : {}), notes: f.notes, ...(f.holderNote ? { holder_note: f.holderNote } : {}) });

/**
 * An edit sends every field as the form holds it, except an untouched holder note and an untouched expiry (left out, so the stored
 * ones stay); an empty note clears the note, and a null expiry clears the expiry. The API refuses an empty string as an expiry.
 */
export const editKeyBody = (f: KeyFields) => ({
  name: f.name,
  ipv4_allow: f.allowlist,
  ...(f.expiresAt !== undefined ? { expires_at: f.expiresAt } : {}),
  notes: f.notes,
  ...(f.holderNote !== undefined ? { holder_note: f.holderNote } : {}),
});

export const useMintKey = (linkId: string) =>
  useChange<MintResult, KeyFields>(
    'mintKey',
    (v: KeyFields & { linkId: string }) => mintCall((scrub) => api(ROUTES.keyCreate, { params: { id: v.linkId }, body: mintKeyBody(v), scrub })),
    ['link'],
    { linkId },
  );

export const useRotateKey = (linkId: string) =>
  useChange<MintResult, { keyId: string }>(
    'rotateKey',
    (v: { linkId: string; keyId: string }) => mintCall((scrub) => api(ROUTES.keyRotate, { params: { id: v.linkId, keyId: v.keyId }, scrub })),
    ['link'],
    { linkId },
  );

export const useKeyChange = (linkId: string) =>
  useChange<LinkKey, { keyId: string; action: 'pause' | 'resume' | 'revoke' | 'edit'; fields?: KeyFields }>(
    'keyChange',
    async (v: { linkId: string; keyId: string; action: 'pause' | 'resume' | 'revoke' | 'edit'; fields?: KeyFields }) => {
      const p = { id: v.linkId, keyId: v.keyId };
      if (v.action === 'revoke') {
        await api(ROUTES.keyDelete, { params: p });
        return undefined;
      }
      const f = v.fields;
      const body = v.action === 'edit' && f ? editKeyBody(f) : { enabled: v.action === 'resume' };
      const raw = await api(ROUTES.keyPatch, { params: p, body });
      return keyOf(dataOf(raw));
    },
    ['link'],
    { linkId },
  );

/** Stops a task on the Bot's own computer. */
export async function stopDelegateCall(v: { botKey: string; sessionId: string; close: boolean }, idem: string): Promise<void> {
  const b = botCall(v.botKey);
  await api(ROUTES.stopDelegate, { params: { ...b.params, sid: v.sessionId }, realm: b.realm, target: b.target, body: { close: v.close }, idem });
}

export function useStopDelegate(botKeyOf: string, reads: ReadonlyArray<{ refetch: () => unknown }> = []) {
  const change = useChange<void, { sessionId: string; close: boolean }>(
    'stopDelegate',
    stopDelegateCall,
    ['delegates', 'view', 'delegatesClosedCount', 'delegatesClosedProof'],
    { botKey: botKeyOf },
    reads,
  );
  useClosedProofReads(botKeyOf, change.outcome === 'pending');
  return change;
}

/**
 * The closed list, only while a stop may have gone through (so Check again can read it, and the proof sees every page): its count (the
 * agent's own) gives the pages, one more than it says since the task just closed may add one. Off otherwise: no traffic.
 */
function useClosedProofReads(key: string, pending: boolean): void {
  const enabled = pending && key !== '' && on(key).enabled;
  const countQ = source.useQuery<Record<string, number>, string>('delegatesClosedCount', key, { enabled });
  const count = countQ.data?.[key];
  const pages = enabled ? closedPagesFor((count ?? 0) + 1).map((page) => ({ key, page })) : [];
  source.useQueries<Record<string, Delegate[]>, { key: string; page: number }>('delegatesClosedProof', pages);
}

/**
 * Start one computer through core's shared lifecycle change: its lock is the Computers page's and the Board's too,
 * one hold per physical computer in every realm view. `holds` are the computers whose lifecycle change may have gone
 * through, each marked ours (this page sent it: Check again and a warned Dismiss) or another page's (read-only, a link
 * to that page). Ownership comes from core (heldBy), never from this mount, so a reload or a remount keeps it. Dismiss
 * frees exactly the hold the person was shown (its token), re-read at the press.
 */
const lifecycle = computerLifecycle.forPage('bots');

export interface StartHold {
  computerId: string;
  /** The operation the held change is (start, stop, restart, ...): another page's hold is worded by what it is. */
  op: string;
  /** The hold's token as shown: the Dismiss confirm frees exactly this one, never a later hold of the computer. Null for a
   *  hold that carries none: it still holds the computer and can be checked, but there is nothing to dismiss it by. */
  hold: string | null;
  ours: boolean;
  /** The page that sent it (another page's hold); null when it named none. */
  from: HeldChange['from'];
}

const holdsNow = (): { hold: StartHold; change: HeldChange }[] =>
  heldChanges('computer.lifecycle').flatMap((h) => {
    const ident = h.identity as { computer?: unknown; op?: unknown } | null;
    const id = ident?.computer;
    return typeof id === 'string'
      ? [{ hold: { computerId: id, op: typeof ident?.op === 'string' ? ident.op : '', hold: typeof h.hold === 'string' ? h.hold : null, ours: lifecycle.heldBy(h) === 'self', from: h.from }, change: h }]
      : [];
  });

export function useStartComputer() {
  const m = lifecycle.use();
  useChangesVersion();
  const holds = holdsNow().map((x) => x.hold);
  return {
    holds,
    heldComputer: (id: string): boolean => holds.some((h) => h.computerId === id),
    run: async (v: { computerId: string }) => {
      const r = await m.run({ id: v.computerId, op: 'start' });
      void source.invalidate(['computers', 'computerBots']);
      return r;
    },
    running: m.running,
    readBack: (): Promise<boolean> => lifecycle.readBack(),
    /** Only our own hold, the one the person was shown (its token): a replaced or gone hold frees nothing (false). */
    dismiss: async (shown: { computerId: string; hold: string }): Promise<boolean> => {
      const x = holdsNow().find((y) => y.hold.computerId === shown.computerId && y.hold.hold === shown.hold && y.hold.ours);
      if (!x) return false;
      return lifecycle.dismiss({ id: shown.computerId, op: 'start' }, shown.hold);
    },
  };
}

/** The live send of Pause all / Resume all: one PATCH of the Bot's channel-wide pause setting. */
export async function sendChannelsPause(v: { botKey: string; paused: boolean }): Promise<undefined> {
  await api(ROUTES.chanSettingsPatch, { ...botCall(v.botKey), body: { channels_paused: v.paused } });
  return undefined;
}

/** A chat app change moves what the Bots list carries for its Bot (the groups waiting to be let in, the chat apps set
 *  up, whether it is paused): once one was sent, or a read-back proved one, the list is read again, so the rows and the
 *  Bot's header do not keep the earlier count. The list is no part of what proves the change. */
function listFresh<T, V>(c: Change<T, V>): Change<T, V> {
  const again = (): void => void source.invalidate(['bots', 'computerBots']);
  return {
    ...c,
    run: async (vars) => {
      const r = await c.run(vars);
      if (r.outcome !== 'not_sent') again();
      return r;
    },
    readBack: async () => {
      const proved = await c.readBack();
      if (proved) again();
      return proved;
    },
  };
}

export const useChannelsPause = (c: { botKey: string; uid: string }) =>
  listFresh(useChange<unknown, { paused: boolean }>(
    'channelsPause',
    sendChannelsPause,
    ['channelSettings', 'channels', 'view'],
    { botKey: c.botKey, uid: c.uid },
  ));

/** The live send of every chat app change, by action. */
export async function channelChangeCall(v: ChannelVars & { botKey: string }, idem: string): Promise<ChannelChange | undefined> {
  const b = botCall(v.botKey);
  const p = { ...b.params, cid: v.channelId };
  const secrets = { token: v.token, app_token: v.appToken };
  if (v.action.startsWith('create:')) {
    const raw = await api(ROUTES.chanCreate, { ...b, idem, body: { kind: v.action.slice(7), label: v.label || undefined, delete_webhook: v.deleteWebhook || undefined, ...secrets } });
    const made = obj(raw);
    return (createdChannelStated(made) ? { channel: channelOf(made) } : {}) satisfies ChannelChange;
  }
  const who = { ...p, pid: v.target ?? '' };
  const person = v.person;
  if (v.action === 'botSettings') {
    const body = botSettingsBody(v.settings ?? {});
    if (body) await api(ROUTES.chanSettingsPatch, { ...b, body });
  } else if (v.action === 'credentials') await api(ROUTES.chanCreds, { ...b, params: p, body: secrets });
  else if (v.action === 'remove') await api(ROUTES.chanDelete, { ...b, params: p });
  else if (v.action === 'enable' || v.action === 'disable') await api(ROUTES.chanPatch, { ...b, params: p, body: { enabled: v.action === 'enable' } });
  else if (v.action === 'restart') {
    // Restart and check: a pause then a resume, two writes; the agent reads Telegram's privacy when the app starts.
    // A pause refused changed nothing (failed); a pause unanswered may have gone in and no resume was sent (pending). Once the
    // pause went in, a refused resume leaves the app known paused (an answer, restart: 'paused'); an unanswered one may or may
    // not have turned it back on (pending, code restart_resume_unknown). Nothing here sends either write again.
    await api(ROUTES.chanPatch, { ...b, params: p, body: { enabled: false } });
    try {
      await api(ROUTES.chanPatch, { ...b, params: p, body: { enabled: true } });
    } catch (e) {
      if (outcomeOf(e, true) === 'failed') return { restart: 'paused' } satisfies ChannelChange;
      throw Object.assign(new Error('restart: the resume after the pause has no answer'), { pending: true, code: 'restart_resume_unknown', cause: e });
    }
  }
  else if (v.action === 'cancelCode') {
    await api(ROUTES.pairCancel, { ...b, params: p });
    // The agent keeps one code per chat app and a cancel removes it, whichever kind it was: so does the holder.
    clearCode(v.uid ?? '', v.channelId);
  }
  else if (v.action === 'rename' && v.label) await api(ROUTES.chanPatch, { ...b, params: p, body: { label: v.label } });
  else if (v.action === 'webhookRemove') await api(ROUTES.chanPatch, { ...b, params: p, body: { enabled: true, delete_webhook: true } });
  else if (v.action === 'settings') {
    const body = channelSettingsBody(v.settings ?? {});
    if (body) await api(ROUTES.chanPatch, { ...b, params: p, body });
  } else if (v.action === 'chatSettings' && v.target) {
    const body = chatSettingsBody(v.settings ?? {});
    if (body) await api(ROUTES.chatPatch, { ...b, params: { ...p, chat: v.target }, body });
  } else if (v.action === 'homeSet' && v.target) await api(ROUTES.chanPatch, { ...b, params: p, body: { home_chat: v.target } });
  else if (v.action === 'homeClear') await api(ROUTES.chanPatch, { ...b, params: p, body: { home_chat: null } });
  else if ((v.action === 'chatApprove' || v.action === 'chatMute') && v.target) {
    const approve = v.action === 'chatApprove';
    await api(ROUTES.chatPatch, { ...b, params: { ...p, chat: v.target }, body: approve ? { state: 'approved', acknowledge_group_readers: v.acknowledgeGroup || undefined } : { state: 'muted' } });
  } else if (v.action === 'chatForget' && v.target) await api(ROUTES.chatDelete, { ...b, params: { ...p, chat: v.target } });
  // An owner carries every right: the agent refuses an owner with a rights member, so an owner is sent without one.
  else if (v.action === 'personAdd' && person?.platformUser) await api(ROUTES.personAdd, { ...b, params: p, body: { platform_user: person.platformUser, name: person.name || undefined, ...(person.owner ? { owner: true } : { rights: person.rights }) } });
  else if (v.action === 'personEdit' && v.target && person) await api(ROUTES.personPatch, { ...b, params: who, body: { rights: person.rights, name: person.name, lang: person.lang, owner: person.owner } });
  else if (v.action === 'personRemove' && v.target) await api(ROUTES.personDelete, { ...b, params: who });
  else if (v.action === 'ownerCode' || v.action === 'invite') {
    const inv = v.action === 'invite' ? v.invite : { rights: RIGHTS, owner: true, makeHome: false };
    if (!inv) return undefined;
    // The request number was taken when the button was pressed, so an answer that arrives after a later issue (or a cancel, or the
    // drawer closing, even one admitted after that) is dropped instead of replacing a newer code.
    const uid = v.uid ?? '';
    const request = v.ticket ?? beginIssue(uid, v.channelId);
    // An owner code carries every right and is sent without a rights member (the agent refuses both together).
    const raw = await api(ROUTES.pairCreate, {
      ...b,
      params: p,
      body: { ...(inv.owner ? { owner: true } : { rights: inv.rights }), make_home: inv.makeHome || undefined },
      // The code and the line that repeats it leave the answer here; the code goes to the holder.
      scrub: (a) => {
        const d = obj(a);
        if (!d) return;
        const m = d as Record<string, unknown>;
        m.__code = str(d.code);
        m.__expires = str(d.expires_at);
        d.code = null;
        d.instructions = null;
      },
    });
    const got = obj(raw);
    const code = str(got?.__code);
    const at = Date.parse(str(got?.__expires));
    offerCode(uid, v.channelId, request, { code, expiresAt: Number.isFinite(at) ? at : 0, kind: v.action === 'invite' ? 'invite' : 'owner' });
    return { issued: code !== '' } satisfies ChannelChange;
  }
  return undefined;
}

export const useChannelChange = (botKeyOf: string, uid: string) =>
  listFresh(useChange<ChannelChange, ChannelVars>(
    'channelChange',
    channelChangeCall,
    ['channels', 'view', 'channelSettings'],
    { botKey: botKeyOf, uid },
  ));
