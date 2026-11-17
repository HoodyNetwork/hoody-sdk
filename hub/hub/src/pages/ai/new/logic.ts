// New chat's choices: what the person picks before the first message, the words each choice shows and the choice
// remembered for next time. Pure: no React, no requests.
//
// - Agent: Work on this computer (`general`), Just chat (`chat`) or another agent of the computer's list. Product-owned
//   agents (`bot`, `script-writer`, `github-installer`) are never offered. What an agent can do is derived from its
//   effective tools (agents/tools.ts reachOf over GET /agents and GET /tools), never fixed text; a `chat` someone
//   changed says so.
// - Until the person picks an agent themselves, a new chat starts on the agent the computer's agent reports as its
//   configured default (General as shipped): it works on this computer.
// - Folder: home ('') or an absolute folder, fixed once the chat starts.
// - Approvals: Default or Strict. Runs with: Hoody models or Claude Code (only when Claude Code is ready on the computer).
// - The model: a provider/model spec for Hoody models (default hoody-ai/hoody-free, never an Anthropic fallback); '' for
//   Claude Code means Claude Code's own default model.
// - Remembered per account: the agent the person picked (none until they pick), approvals and runs with; never the
//   folder or the model.
import { providers } from '@core';
import { utf8Bytes } from '@core/pure';
import { pathSplit } from '@kit/pure';
import type { StartAuto, StartOpts } from '@kit';
import type { AgentRow } from '../agents/logic';
import { changedChat, reachOf, type CatalogTool, type Reach } from '../agents/tools';
import type { ClaudeCode } from '../types';

export type AgentPick = { kind: 'chat' } | { kind: 'general' } | { kind: 'other'; name: string };
export type Approvals = 'default' | 'strict';
export type RunsWith = 'hoody' | 'claude';

export interface Choices {
  agent: AgentPick;
  /** '' = the home folder; else an absolute path; null = a typed path that is not a valid folder yet (nothing chosen). */
  folder: string | null;
  approvals: Approvals;
  runsWith: RunsWith;
  /** Hoody models: a provider/model spec. Claude Code: '' (its default) or a claude-code model spec. */
  model: string;
}

export const JUST_CHAT = 'chat';
export const GENERAL = 'general';
/** Agents New chat never offers: Hoody owns them and starts them itself. */
const NEVER = new Set(['bot', 'script-writer', 'github-installer']);

/** What the person remembers between visits (stored per account, as this JSON); the folder and the model are not kept. */
export interface Remembered {
  /** The stored shape's mark: a Just chat stored under it is the person's own pick (see parseRemembered). */
  v: 2;
  /** The agent the person picked themselves; null while they have picked none (the computer's default agent applies). */
  agent: AgentPick | null;
  approvals: Approvals;
  runsWith: RunsWith;
  /** Read only, never stored: a Just chat kept from before picks were marked was not kept as a pick (the page says so). */
  chatDropped?: true;
}

export const FIRST: Remembered = Object.freeze({ v: 2, agent: null, approvals: 'default', runsWith: 'hoody' });

const NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The stored preference, checked: anything malformed is the first run (no agent picked, Default, Hoody models).
 * A value without the `v: 2` mark is from when Just chat was also what a first run showed: its Just chat cannot be told
 * from "never picked", so it is not kept as a pick (`chatDropped`); General or a named agent there was always a pick
 * and stays one.
 */
export function parseRemembered(raw: unknown): Remembered {
  if (!obj(raw)) return FIRST;
  const marked = raw.v === 2;
  if (raw.v !== undefined && !marked) return FIRST;
  const a = raw.agent;
  let agent: AgentPick | null;
  let chatDropped = false;
  if (marked && (a === null || a === undefined)) agent = null;
  else if (obj(a) && a.kind === 'chat') {
    agent = marked ? { kind: 'chat' } : null;
    chatDropped = !marked;
  } else if (obj(a) && a.kind === 'general') agent = { kind: 'general' };
  else if (obj(a) && a.kind === 'other' && typeof a.name === 'string' && NAME.test(a.name) && !NEVER.has(a.name) && a.name !== JUST_CHAT && a.name !== GENERAL) agent = { kind: 'other', name: a.name };
  else return FIRST;
  const approvals = raw.approvals === 'strict' ? 'strict' : raw.approvals === 'default' ? 'default' : null;
  const runsWith = raw.runsWith === 'claude' ? 'claude' : raw.runsWith === 'hoody' ? 'hoody' : null;
  if (!approvals || !runsWith) return FIRST;
  return { v: 2, agent, approvals, runsWith, ...(chatDropped ? { chatDropped: true as const } : {}) };
}

/** The stored shape of a choice (plain JSON, what parseRemembered reads): the picked agent (null: none picked),
 *  approvals and runs with; never the folder or the model. */
export function rememberedOf(c: { agent: AgentPick | null; approvals: Approvals; runsWith: RunsWith }): Remembered {
  const agent: AgentPick | null = c.agent === null ? null : c.agent.kind === 'other' ? { kind: 'other', name: c.agent.name } : { kind: c.agent.kind };
  return { v: 2, agent, approvals: c.approvals, runsWith: c.runsWith };
}

export function agentName(p: AgentPick): string {
  return p.kind === 'chat' ? JUST_CHAT : p.kind === 'general' ? GENERAL : p.name;
}

/** The agents offered beside General and Just chat: the computer's agents less those two and those Hoody owns. */
export function otherAgents(rows: readonly AgentRow[]): AgentRow[] {
  return rows.filter((r) => r.name !== JUST_CHAT && r.name !== GENERAL && !r.productOwned && !NEVER.has(r.name));
}

/**
 * The agent a new chat starts on while the person has picked none: the one the computer's agent reports as its
 * configured default (General as shipped), when New chat offers it. General when the list is not read, marks none,
 * marks more than one, or marks an agent New chat never offers (product-owned).
 */
export function defaultAgent(rows: readonly AgentRow[] | undefined): AgentPick {
  const marked = (rows ?? []).filter((r) => r.isDefault);
  const d = marked.length === 1 ? marked[0] : undefined;
  if (!d || !rows || d.name === GENERAL) return { kind: 'general' };
  if (d.name === JUST_CHAT) return { kind: 'chat' };
  return otherAgents(rows).some((r) => r.name === d.name) ? { kind: 'other', name: d.name } : { kind: 'general' };
}

/** The agent picker's groups, in order: the two usual ways to start, then where an agent comes from. */
export const PICK_GROUPS = ['start', 'builtin', 'yours', 'folder', 'other'] as const;
export type PickGroup = (typeof PICK_GROUPS)[number];

/** One agent as the picker lists it. */
export interface PickRow {
  /** The agent's name on the computer: the row's id. */
  name: string;
  pick: AgentPick;
  description: string;
  group: PickGroup;
  /** How far its tools reach; null while that is not known (the agents or the tool catalogue are unread). */
  reach: Reach | null;
  /** A `chat` whose file is the person's own. */
  changed: boolean;
  /** A file of the person's own. */
  yours: boolean;
  /** '' = it uses the chat's model. */
  model: string;
  /** The computer's configured default agent. */
  isDefault: boolean;
}

const pickGroup = (r: AgentRow): PickGroup => {
  if (r.name === GENERAL || r.name === JUST_CHAT) return 'start';
  if (r.provenance === 'user') return 'yours';
  if (r.provenance === 'project') return 'folder';
  return r.provenance === null ? 'other' : 'builtin';
};

/**
 * The picker's rows: General and Just chat first (when the computer lists them), then every other agent New chat
 * offers, by name. Product-owned agents are never listed. `reach` is null whenever the tool catalogue is not the whole
 * catalogue (unread, failed or partial): nothing about what an agent can do is guessed.
 */
export function pickRows(rows: readonly AgentRow[], cat: readonly CatalogTool[] | null | undefined): PickRow[] {
  const row = (r: AgentRow): PickRow => ({
    name: r.name,
    pick: r.name === GENERAL ? { kind: 'general' } : r.name === JUST_CHAT ? { kind: 'chat' } : { kind: 'other', name: r.name },
    description: r.description,
    group: pickGroup(r),
    reach: cat ? reachOf(r, cat) : null,
    changed: changedChat(r),
    yours: r.yours,
    model: r.model,
    isDefault: r.isDefault,
  });
  const start = [GENERAL, JUST_CHAT].flatMap((n) => rows.filter((r) => r.name === n && !r.productOwned));
  return [...start, ...otherAgents(rows)].map(row);
}

/** What the picker's filter matches a row on: its reach, and `yours` for the person's own agents. */
export function pickFilterValues(r: PickRow): string[] {
  return [...(r.reach ? [r.reach] : []), ...(r.yours ? ['yours'] : [])];
}

/**
 * The line under an agent choice. `reach` follows the agent's effective tools; `loading` while the agents or the tool
 * catalogue are still being read; `unread` when either read failed (no line is guessed); `missing` when the computer
 * lists no such agent. `changed` marks a `chat` whose file is the person's own.
 */
export type AgentLine =
  | { kind: 'reach'; reach: Reach; changed: boolean }
  | { kind: 'loading' }
  | { kind: 'unread' }
  | { kind: 'missing' };

export function agentLine(name: string, rows: readonly AgentRow[] | undefined, cat: readonly CatalogTool[] | null | undefined, read: { failed: boolean }): AgentLine {
  if (read.failed) return { kind: 'unread' };
  if (rows === undefined || cat === undefined) return { kind: 'loading' };
  // A catalogue answer that is not the whole catalogue (null) cannot prove a list is read-only.
  if (cat === null) return { kind: 'unread' };
  const row = rows.find((r) => r.name === name);
  if (!row) return { kind: 'missing' };
  return { kind: 'reach', reach: reachOf(row, cat), changed: changedChat(row) };
}

/** Claude Code can run a chat on this computer: installed, signed in, turned on and startable. */
export function claudeReady(c: ClaudeCode | null): boolean {
  return !!c && c.state === 'signed_in' && c.enabled && c.startable;
}

/**
 * Runs with as the screen holds it: the person's pick, but Claude Code only while it is ready (a remembered Claude Code
 * pick waits, shown as Hoody models, until the computer can run it). Before the Claude read settles, a remembered
 * Claude Code pick still shows as Hoody models: nothing is offered that cannot run.
 */
export function runsWithNow(wanted: RunsWith, claude: ClaudeCode | null): RunsWith {
  return wanted === 'claude' && claudeReady(claude) ? 'claude' : 'hoody';
}

/** The model a backend starts with: Hoody models → the free Hoody model; Claude Code → its own default (''). */
export function defaultModel(r: RunsWith): string {
  return r === 'hoody' ? providers.FREE : '';
}

/** A folder New chat can name: absolute, valid text, no control character, at most 4096 bytes of UTF-8. */
export function folderOk(path: string): boolean {
  if (!path.startsWith('/')) return false;
  if (/[\u0000-\u001f\u007f]/.test(path)) return false;
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(path)) return false;
  return utf8Bytes(path) <= 4096;
}

/** A typed folder (the folder field's text: relative to the home folder, or an absolute path as typed) as the absolute folder
 *  it names, or null while it names none: nothing typed, a relative path while the home folder is unknown, a path that leaves the home folder by name ("~" first, or "..":
 *  the kit's pathSplit rule), or one folderOk refuses. A trailing "/" (a picked folder) is dropped. An absolute path is taken
 *  as typed and never listed (the agent's own folder checks still apply). */
export function typedFolder(text: string, home: string | null): string | null {
  if (text === '') return null;
  const abs = text.startsWith('/') ? text : home && pathSplit(text) !== 'outside' ? `${home.replace(/\/+$/u, '')}/${text}` : null;
  if (abs === null) return null;
  const path = abs.replace(/\/+$/u, '') || '/';
  return folderOk(path) ? path : null;
}

/** The folders offered: those chats ran in on this computer, valid, without duplicates, home excluded, in order. */
export function folderChoices(folders: readonly string[]): string[] {
  const out: string[] = [];
  for (const f of folders) if (folderOk(f) && !out.includes(f)) out.push(f);
  return out;
}

/** A folder's short name for the Options summary: its last part. */
export function folderName(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts.length ? (parts[parts.length - 1] as string) : '/';
}

/** No model is ready on the computer: a trusted ready list that names none (a failed or untrusted read proves nothing). */
export function noModelReady(ev: providers.Evidence | null): boolean {
  if (!ev || ev.catalogue.state !== 'ok') return false;
  const cat = ev.catalogue.value.cat;
  return providers.readyTrusted(cat) && !!cat.readySpecs && Object.keys(cat.readySpecs).length === 0;
}

/** The chip's model name, by the one rule (providers.modelNameOf); `word` when a Hoody model's whole name is hidden. */
export function modelName(ev: providers.Evidence | null, spec: string, word: string): string {
  return providers.modelNameOf(spec, ev && ev.catalogue.state === 'ok' ? ev.catalogue.value.cat : null, word);
}

/** What the start is handed: the agent, Hoody's model or Claude Code with its model, the folder (absent: home) and
 *  Strict. Null while nothing can start: a typed folder that is not a folder yet, or Hoody models without a model. */
export function startOptsOf(c: Choices): StartOpts | null {
  if (c.folder === null || (c.folder !== '' && !folderOk(c.folder))) return null;
  if (c.runsWith === 'hoody' && !c.model) return null;
  return {
    agent: agentName(c.agent),
    ...(c.runsWith === 'claude' ? { claude: { model: c.model } } : { model: c.model }),
    ...(c.folder ? { cwd: c.folder } : {}),
    strict: c.approvals === 'strict',
  };
}

/** What a chat started now does about approvals, as the page says it before Send. `strict`: it asks every time. For Default,
 *  what the start itself does before the first message (the starter's `auto`): `everything`: Allow everything is switched on, so
 *  actions run without asking; `asks`: it asks when an action needs the person; `unknown`: the agent has not said yet. */
export type ApprovalsStart = 'strict' | 'everything' | 'asks' | 'unknown';
export function approvalsStart(approvals: Approvals, auto: StartAuto | undefined): ApprovalsStart {
  if (approvals === 'strict') return 'strict';
  return auto === 'on' ? 'everything' : auto === 'off' || auto === 'none' ? 'asks' : 'unknown';
}

/** A picked agent as this page may use it: a named agent only while the agents read offers it (never a product-owned
 *  or missing one), else null (no pick: the computer's default agent applies); until that read answers it stays as
 *  picked (nothing can start meanwhile). */
export function reconcileAgent(pick: AgentPick, rows: readonly AgentRow[] | undefined): AgentPick | null {
  if (pick.kind !== 'other' || !rows) return pick;
  return otherAgents(rows).some((r) => r.name === pick.name) ? pick : null;
}

/**
 * The agent a New chat link names (`/ai/new?agent=<name>`, the agent page's "New chat with this agent"), against the
 * computer's list. `pick` is the agent to start on, or null when the link gives none (the usual agent applies, with
 * `missing`: the name is not an agent New chat offers here, gone or product-owned; `bad`: the text is no agent name).
 * While the list is unread a listed-looking name is kept (reconcileAgent), and nothing starts until it is read.
 */
export type LinkedAgent = { pick: AgentPick; note: null } | { pick: null; note: { kind: 'missing'; name: string } | { kind: 'bad' } };

export function linkedAgent(raw: string, rows: readonly AgentRow[] | undefined): LinkedAgent {
  if (!NAME.test(raw)) return { pick: null, note: { kind: 'bad' } };
  if (raw === JUST_CHAT) return { pick: { kind: 'chat' }, note: null };
  if (raw === GENERAL) return { pick: { kind: 'general' }, note: null };
  const pick: AgentPick = { kind: 'other', name: raw };
  if (NEVER.has(raw) || reconcileAgent(pick, rows) !== pick) return { pick: null, note: { kind: 'missing', name: raw } };
  return { pick, note: null };
}

/** What Runs with may say about Claude Code: proven ready, checking (no answer yet), unknown (the reads failed, or the
 *  agent could not tell), or proven not ready (needs setup). */
export type ClaudeView = 'ready' | 'checking' | 'unknown' | 'notReady';
const CLAUDE_UNKNOWN: ReadonlySet<ClaudeCode['state']> = new Set(['unknown', 'check_failed', 'sign_in_unknown']);
export function claudeView(c: ClaudeCode | null, failed: boolean): ClaudeView {
  if (claudeReady(c)) return 'ready';
  if (failed) return 'unknown';
  if (!c) return 'checking';
  return CLAUDE_UNKNOWN.has(c.state) ? 'unknown' : 'notReady';
}

/** "No AI model is ready" holds only for Hoody models (Claude Code brings its own) and only on proof (noModelReady). */
export function noModelFor(runsWith: RunsWith, ev: providers.Evidence | null): boolean {
  return runsWith === 'hoody' && noModelReady(ev);
}

/** Claude Code's row of GET /acp/agents, parsed: every field claudeOf reads, typed as the agent's status row.
 *  Fields the agent sends `omitempty` are false or '' when absent. */
export interface AcpClaude {
  readonly installed: boolean;
  readonly enabled: boolean;
  readonly startable: boolean;
  readonly loggedIn: 'unknown' | 'logged_in' | 'logged_out' | 'error';
  readonly installState: '' | 'ok' | 'missing_binary' | 'missing_launcher' | 'unsupported_version' | 'probe_failure';
  readonly missingLauncher: boolean;
  readonly loginVerified: boolean;
  readonly setupUser: string;
  readonly installHint: string;
  readonly loginHint: string;
}
/** The parsed answer: Claude Code's row, or null when the agent lists no Claude Code. */
export interface AcpAgents {
  readonly claude: AcpClaude | null;
}

const LOGGED_IN: readonly AcpClaude['loggedIn'][] = ['unknown', 'logged_in', 'logged_out', 'error'];
const INSTALL_STATES: readonly AcpClaude['installState'][] = ['', 'ok', 'missing_binary', 'missing_launcher', 'unsupported_version', 'probe_failure'];

/** The ONE parser of GET /acp/agents ({status, report:{agents:[…]}}): exactly `report.agents`, every row named, at most
 *  one Claude Code row, and every field of it claudeOf reads, typed. null (unknown, never "not set up") for anything
 *  else: no list, a second list (`items`) beside it, a wrong type or value, or a row that contradicts itself (a missing
 *  launcher on an installed agent; a verified sign-in that is not signed in). */
export function parseAcpAgents(body: unknown): AcpAgents | null {
  if (!obj(body) || !obj(body.report) || 'items' in body.report || !Array.isArray(body.report.agents)) return null;
  const agents: unknown[] = body.report.agents;
  if (!agents.every((r) => obj(r) && typeof r.name === 'string' && r.name !== '')) return null;
  const c = (agents as Record<string, unknown>[]).filter((r) => r.name === 'claude');
  if (c.length > 1) return null;
  const r = c[0];
  if (!r) return { claude: null };
  const bool = (k: string, omitempty: boolean): boolean | null => (r[k] === undefined && omitempty ? false : typeof r[k] === 'boolean' ? (r[k] as boolean) : null);
  const text = (k: string): string | null => (r[k] === undefined ? '' : typeof r[k] === 'string' ? (r[k] as string) : null);
  const installed = bool('installed', false);
  const startable = bool('startable', false);
  const enabled = bool('enabled', true);
  const missingLauncher = bool('missing_launcher', true);
  const loginVerified = bool('login_verified', true);
  const loggedIn = LOGGED_IN.find((v) => v === r.logged_in);
  const installState = INSTALL_STATES.find((v) => v === text('install_state'));
  const setupUser = text('setup_user');
  const installHint = text('install_hint');
  const loginHint = text('login_hint');
  if (installed === null || startable === null || enabled === null || missingLauncher === null || loginVerified === null) return null;
  if (loggedIn === undefined || installState === undefined || setupUser === null || installHint === null || loginHint === null) return null;
  if ((missingLauncher && installed) || (loginVerified && loggedIn !== 'logged_in')) return null;
  return { claude: { installed, enabled, startable, loggedIn, installState, missingLauncher, loginVerified, setupUser, installHint, loginHint } };
}

/** The only body claudeOf is handed: rebuilt from the parsed value field by field (never the raw answer), so the
 *  classifier cannot read a row or field the parser did not. */
export function acpWire(p: AcpAgents): { report: { agents: Record<string, unknown>[] } } {
  const c = p.claude;
  if (!c) return { report: { agents: [] } };
  const row: Record<string, unknown> = { name: 'claude', installed: c.installed, enabled: c.enabled, startable: c.startable, logged_in: c.loggedIn, missing_launcher: c.missingLauncher, login_verified: c.loginVerified };
  if (c.installState !== '') row.install_state = c.installState;
  if (c.setupUser !== '') row.setup_user = c.setupUser;
  if (c.installHint !== '') row.install_hint = c.installHint;
  if (c.loginHint !== '') row.login_hint = c.loginHint;
  return { report: { agents: [row] } };
}

/** GET /sessions/cwds' folders: the whole list of valid absolute paths (folderOk), or null when any part is unreadable (never a
 *  shortened list, so a bad entry never reads as "no folders yet"). */
export function foldersOf(body: unknown): string[] | null {
  const c = obj(body) ? body.cwds : undefined;
  if (!Array.isArray(c)) return null;
  return c.every((x) => typeof x === 'string' && folderOk(x)) ? (c as string[]) : null;
}

/** GET /sessions/cwds' `home`: the folder a new session starts in when it names no folder (the same in every realm), or null
 *  when it is not known: an agent that does not report it (older), one that could not read it, or a value that is not an
 *  absolute path. Never '' (an empty folder is not the home folder). */
export function homeOf(body: unknown): string | null {
  const h = obj(body) ? body.home : undefined;
  return typeof h === 'string' && folderOk(h) ? h : null;
}
