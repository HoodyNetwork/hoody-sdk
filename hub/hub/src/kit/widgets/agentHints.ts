// Platform hosts and the "Use with your agent" hints (AgentHint.tsx draws them). The Hub is served at api.<domain>, so
// the domain it runs on names the hosts its commands point at. Only hosts seen to answer a HEAD request on a platform
// are listed for it; any other host falls back to its hoody.com value, which always answers. The pure half (no
// location, no storage) is platformText.ts, re-exported here.

import type { Translate } from '../strings';
import type hintStrings from './AgentHint.strings.en.json';
import { hostEnv } from '../../core/host-env';
import { cliCommand, platformHosts, platformText, type PlatformHosts } from './platformText';

export { cliCommand, platformHosts, platformText, type PlatformHosts } from './platformText';

/** The hosts of the page this runs in; hoody.com when there is no page host. */
export function currentPlatformHosts(): PlatformHosts {
  try {
    // The host's page address (web: the page's location; a terminal has none, or the web Hub's for share links).
    const origin = hostEnv().pageAddress?.origin;
    return platformHosts(origin ? new URL(origin).host : '');
  } catch {
    return platformHosts('');
  }
}

// ── "Use with your agent" hints, keyed by page ───────────────────────────────────────────────────────────
// Each page's sentence is the string hint.<page>.what of AgentHint, its prompts are built below (mainPrompt,
// starterPrompt); every call they describe is in the Hoody skill (hoody-sdk docs/agent/skills): notes (pages and append),
// api (containers start/stop, bot-urls with keys and panic, vault keys, auth tokens list and delete), exec (a .ts or
// .js file in the scripts folder is an HTTP endpoint), daemon (programs, start, logs), agent (Bots: list, messages, log,
// gates waiting for a person; a Bot lives on the agent of a computer, so its page signs in like a computer program).

/** How the agent reaches what the page shows: the account API with a key, or a program on the computer. */
export type AgentHintReach = 'account' | 'computer';

export const AGENT_HINT_PAGES = ['notes', 'computers', 'scripts', 'bots', 'vault', 'keys', 'logs', 'programs', 'vms', 'api', 'schedules', 'tunnels', 'files'] as const;
export type AgentHintPage = (typeof AGENT_HINT_PAGES)[number];

export const AGENT_HINT_REACH: Readonly<Record<AgentHintPage, AgentHintReach>> = {
  notes: 'computer',
  computers: 'account',
  scripts: 'computer',
  bots: 'computer',
  vault: 'account',
  keys: 'account',
  logs: 'computer',
  programs: 'computer',
  vms: 'computer',
  api: 'account',
  schedules: 'computer',
  tunnels: 'computer',
  files: 'computer',
};

// ── Scope ──────────────────────────────────────────────────────────────────────────────────────────────────
// Every prompt names exactly what it acts on, filled from the page's live context: a realm by its nickname and its full
// 24-hex id, a computer by its own name and full id (never a routing node, never the Hub's name.last4 handle), the
// Global vault under All realms, and the whole account for keys. All realms and no computer are said in words, never
// left out. Account-wide keys are never said to be a realm's: in a realm the prompt takes the keys that can act there.
// A page passes facts (core's useAgentScopeFacts); the page's kind below decides what its prompt names.

/** A realm as a prompt names it: its full id, and its nickname when it has one (null: none, never the short id). */
export interface AgentHintRealm {
  readonly id: string;
  readonly name: string | null;
}

/** A computer as a prompt names it: its full id, and its own name when known (null: unknown, never a routing node). */
export interface AgentHintComputer {
  readonly id: string;
  readonly name: string | null;
}

/** What a page shows now: the selected realm (null: All realms) and the computer it acts on (null: none chosen), with
 *  the one realm that computer is named in (null when no single realm holds it for this view). */
export interface AgentHintFacts {
  readonly realm: AgentHintRealm | null;
  readonly computer: { readonly computer: AgentHintComputer; readonly realm: AgentHintRealm | null } | null;
  /** The page holds a computer filter that names no computer it can name (a handle not yet rewritten, junk): the agent
   *  asks which one, never the page's unfiltered set. */
  readonly ask?: boolean;
}

/** What a prompt names, decided by agentHintScope. */
export type AgentHintScope =
  | { readonly kind: 'keys'; readonly realm: AgentHintRealm | null }
  | { readonly kind: 'realm'; readonly realm: AgentHintRealm }
  | { readonly kind: 'allRealms' }
  | { readonly kind: 'vault'; readonly realm: AgentHintRealm }
  | { readonly kind: 'globalVault' }
  | { readonly kind: 'realmComputers'; readonly realm: AgentHintRealm }
  | { readonly kind: 'computer'; readonly computer: AgentHintComputer; readonly realm: AgentHintRealm | null }
  | { readonly kind: 'pick'; readonly realm: AgentHintRealm | null };

/** What each page's prompt is about, matching how the API scopes each: keys are the account's, and in a realm the
 *  prompt takes only the keys that can act there (pages/keys logic worksIn: realm_ids names the realm, or is empty);
 *  the computers list and the vault are the selected realm's (the vault's All realms is the Global vault); Bots are on
 *  the realm's computers, or one computer when the page filters to it; the API page lists every operation, so its
 *  prompt takes the selected realm like the computers list; the others act on one computer. */
export const AGENT_HINT_SCOPE: Readonly<Record<AgentHintPage, 'keys' | 'realm' | 'vault' | 'computers' | 'computer'>> = {
  notes: 'computer',
  computers: 'realm',
  scripts: 'computer',
  bots: 'computers',
  vault: 'vault',
  keys: 'keys',
  logs: 'computer',
  programs: 'computer',
  vms: 'computer',
  api: 'realm',
  schedules: 'computer',
  tunnels: 'computer',
  files: 'computer',
};

/** The scope a page's prompt names, from the page's facts. */
export function agentHintScope(page: AgentHintPage, facts: AgentHintFacts): AgentHintScope {
  const { realm, computer } = facts;
  switch (AGENT_HINT_SCOPE[page]) {
    case 'keys':
      return { kind: 'keys', realm };
    case 'realm':
      return realm ? { kind: 'realm', realm } : { kind: 'allRealms' };
    case 'vault':
      return realm ? { kind: 'vault', realm } : { kind: 'globalVault' };
    case 'computers':
      if (computer) return { kind: 'computer', computer: computer.computer, realm: computer.realm };
      if (facts.ask) return { kind: 'pick', realm };
      return realm ? { kind: 'realmComputers', realm } : { kind: 'allRealms' };
    case 'computer':
      return computer ? { kind: 'computer', computer: computer.computer, realm: computer.realm } : { kind: 'pick', realm };
  }
}

/** One line of a prompt's target block: what it is (hint.tgt.label.<k>, hint.tgt.word.<k> in the one-line form) and
 *  the thing itself, by name and full id or in words. */
export interface TargetPart {
  readonly k: 'computer' | 'realm' | 'computers' | 'vault' | 'keys';
  readonly v: string;
  /** The words in the one-line form when they read better without the label ("in all realms"). */
  readonly inline?: string;
}

/** A scope as a prompt carries it: the target lines, the stop-and-ask line (null when nothing can be missing), the
 *  keys rule in a realm (null elsewhere), and the one line the surface shows on why the prompt names it. */
export interface AgentHintTarget {
  readonly parts: readonly TargetPart[];
  readonly stop: string | null;
  readonly note: string | null;
  readonly why: string;
}

/** The target of a scope, in words (t: AgentHint's strings). Every scope names its realm, or says all realms. */
export function agentHintTarget(t: Translate<typeof hintStrings>, scope: AgentHintScope): AgentHintTarget {
  const thing = (x: { id: string; name: string | null }) => (x.name && x.name.trim() ? t('hint.thing.named', { name: x.name, id: x.id }) : t('hint.thing.unnamed', { id: x.id }));
  const realm = (r: AgentHintRealm): TargetPart => ({ k: 'realm', v: thing(r) });
  const allRealms: TargetPart = { k: 'realm', v: t('hint.tgt.allRealms'), inline: t('hint.tgt.inAllRealms') };
  switch (scope.kind) {
    case 'keys':
      return scope.realm
        ? { parts: [realm(scope.realm), { k: 'keys', v: t('hint.tgt.keysRealm') }], stop: t('hint.stop.realm'), note: t('hint.tgt.keysRule', { id: scope.realm.id }), why: t('hint.why.keysRealm') }
        : { parts: [allRealms, { k: 'keys', v: t('hint.tgt.keysAll') }], stop: null, note: null, why: t('hint.why.keysAll') };
    case 'realm':
      return { parts: [realm(scope.realm), { k: 'computers', v: t('hint.tgt.realmComputers') }], stop: t('hint.stop.realm'), note: null, why: t('hint.why.realm') };
    case 'allRealms':
      return { parts: [allRealms, { k: 'computers', v: t('hint.tgt.allComputers') }], stop: null, note: null, why: t('hint.why.allRealms') };
    case 'vault':
      return { parts: [realm(scope.realm), { k: 'vault', v: t('hint.tgt.vault') }], stop: t('hint.stop.realm'), note: null, why: t('hint.why.realm') };
    case 'globalVault':
      return { parts: [allRealms, { k: 'vault', v: t('hint.tgt.globalVault') }], stop: null, note: null, why: t('hint.why.globalVault') };
    case 'realmComputers':
      return { parts: [realm(scope.realm), { k: 'computers', v: t('hint.tgt.realmComputers') }], stop: t('hint.stop.realm'), note: null, why: t('hint.why.realm') };
    case 'computer':
      return scope.realm
        ? { parts: [{ k: 'computer', v: thing(scope.computer) }, realm(scope.realm)], stop: t('hint.stop.computer'), note: null, why: t('hint.why.computer') }
        : { parts: [{ k: 'computer', v: thing(scope.computer) }, { k: 'realm', v: t('hint.tgt.anyRealm'), inline: t('hint.tgt.inAnyRealm') }], stop: t('hint.stop.computerOnly'), note: null, why: t('hint.why.computerOnly') };
    case 'pick':
      return scope.realm
        ? { parts: [{ k: 'computer', v: t('hint.tgt.noComputer') }, realm(scope.realm)], stop: t('hint.stop.realm'), note: null, why: t('hint.why.pick') }
        : { parts: [{ k: 'computer', v: t('hint.tgt.noComputer') }, allRealms], stop: null, note: null, why: t('hint.why.pick') };
  }
}

/** Where the Guide teaches skills, connecting an agent, and keys. */
export const SKILLS_GUIDE_HREF = '/guide#skills';
export const CONNECT_GUIDE_HREF = '/guide#connect';
export const KEYS_GUIDE_HREF = '/guide#keys';
/** The Keys page with its New key form open for the shell's realm (keys links.create: the form preselects that realm
 *  when one is selected), and the Computers list (computers links.list). */
export const NEW_KEY_HREF = '/keys?new=1';
export const COMPUTERS_HREF = '/computers';

// ── Prompts and what an agent can do, per page ────────────────────────────────────────────────────────────
// Every prompt is written for an agent: the target block, then what to do, then the rules. The MAIN prompt of a page
// hands the work over: the agent first asks the person what they want (hint.<page>.ask), says its plan in one line and
// waits, does it (hint.<page>.do), and reports what matters on that page (hint.<page>.report). The STARTERS are one task
// each (hint.<page>.task.<id>, titled hint.<page>.title.<id>), with the same target in one line. A prompt for a remote
// agent starts with the skill line; the Hoody Agent (the Hub's own) gets the same prompt without it. Every call a prompt
// or a can-do row names is in the Hoody skill (notes: pages, databases and records, Markdown export, collaborators;
// exec: scripts as HTTP endpoints, dependencies, @schedule, logs and stats; daemon: programs add/start/stop/restart/boot,
// logs and their stream, stats; api: computers list/operations/stats/snapshots, vault keys with If-None-Match, auth
// tokens with permissions, realms and expiry, bot-urls with keys and panic; agent: Bots, messages, gates waiting for a
// person; cron: entries and their runs; curl: scheduled requests; tunnel: sessions, bindings, the expose and pull
// commands; files: read, write, glob, grep, history, chmod, chown, downloads, archives). The Computers page also has one row for work inside a computer (terminal, files, browser, display kits).

export const AGENT_HINT_STARTERS: Readonly<Record<AgentHintPage, readonly string[]>> = {
  notes: ['tasks', 'export'],
  computers: ['usage', 'stopped', 'snapshot'],
  scripts: ['webhook', 'schedule', 'failing'],
  bots: ['waiting', 'answer', 'urls'],
  vault: ['names', 'add'],
  keys: ['unused', 'noExpiry'],
  logs: ['errors', 'watch'],
  programs: ['failed', 'usage'],
  vms: ['failed', 'make'],
  api: ['find', 'example'],
  schedules: ['list', 'failed'],
  tunnels: ['shared', 'alias'],
  files: ['find', 'changed'],
};

/** Who the prompt is for: a remote agent (it starts with the skill line) or the Hub's own Hoody Agent (it does not). */
export type PromptFor = 'remote' | 'hoody';

type T = Translate<typeof hintStrings>;
type K = keyof typeof hintStrings;
const key = (k: string) => k as K;

/** A page's main prompt: the hand-off where the agent asks the person what they want first. */
export function mainPrompt(t: T, page: AgentHintPage, target: AgentHintTarget, to: PromptFor): string {
  const lines: string[] = [];
  if (to === 'remote') lines.push(t('hint.p.skill'), '');
  lines.push(t('hint.p.target'));
  for (const p of target.parts) lines.push(t('hint.p.part', { label: t(key(`hint.tgt.label.${p.k}`)), value: p.v }));
  if (target.note) lines.push(target.note);
  if (target.stop) lines.push(target.stop);
  lines.push('', t('hint.p.steps'));
  const steps = [t(key(`hint.${page}.ask`)), t('hint.p.plan'), t(key(`hint.${page}.do`)), t(key(`hint.${page}.report`))];
  steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  lines.push('', t('hint.p.rules'), `- ${t('hint.rule.secrets')}`, `- ${t('hint.rule.scope')}`, `- ${t('hint.rule.ask')}`);
  return lines.join('\n');
}

/** A starter: one task on the same target, the target in one line. */
export function starterPrompt(t: T, page: AgentHintPage, id: string, target: AgentHintTarget, to: PromptFor): string {
  const parts = target.parts.map((p) => p.inline ?? t('hint.p.inline', { label: t(key(`hint.tgt.word.${p.k}`)), value: p.v })).join(', ');
  const where = [t('hint.p.targetLine', { parts }), target.note, target.stop].filter(Boolean).join(' ');
  const lines = [where, t('hint.p.task', { task: t(key(`hint.${page}.task.${id}`)) }), t('hint.p.firstLine'), t('hint.p.rulesLine')];
  if (to === 'remote') lines.unshift(t('hint.p.skill'));
  return lines.join('\n');
}

/** What an agent with the skill can do with this page's things: the rows can.<page>.<n>, n from 1. */
export const AGENT_HINT_CAN: Readonly<Record<AgentHintPage, number>> = {
  notes: 4,
  computers: 5,
  scripts: 4,
  bots: 4,
  vault: 3,
  keys: 4,
  logs: 3,
  programs: 4,
  vms: 4,
  api: 3,
  schedules: 5,
  tunnels: 4,
  files: 5,
};

/** What the same agent can do everywhere in Hoody, in a few groups: the title all.<group>.title and the rows
 *  all.<group>.<n>, n from 1. Every page's Can do tab shows it under the page's own rows, so no page reads as the
 *  limit of the agent. Each row names operations of the Hoody skill: the api namespace (computers, snapshots, env,
 *  network, firewall, proxy permissions and aliases, storage shares, servers, wallet, vault, botUrls) and the kits
 *  inside a computer (terminal, files, browser, display, vm, daemon, cron, exec, curl, watch, proxyLogs, sqlite, notes,
 *  agent with its Bots and sessions), and Hoody AI, which answers from inside a computer. */
export const AGENT_CAN_EVERYWHERE = [
  { id: 'servers', rows: 6 },
  { id: 'inside', rows: 5 },
  { id: 'programs', rows: 6 },
  { id: 'data', rows: 3 },
  { id: 'ai', rows: 5 },
] as const;
export type AgentCanGroup = (typeof AGENT_CAN_EVERYWHERE)[number]['id'];

// ── Set up: the ways an agent gets Hoody, by kind of agent ──────────────────────────────────────────────────
// The commands are the Guide's door table (pages/guide/logic.ts DOORS: coding, ai, cli), written for hoody.com and
// pointed at the platform when shown; agentHints.test.ts holds them equal to it.

export const AGENT_KINDS = ['coding', 'chat', 'cli'] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

/** One setup line: its caption (hint.setup.cap.<cap>) and the command for hoody.com, or a hoody CLI command's arguments. */
export type SetupLine = { readonly cap: string; readonly command: string; readonly cli?: undefined } | { readonly cap: string; readonly cli: string; readonly command?: undefined };

export const AGENT_SETUPS: Readonly<Record<AgentKind, readonly SetupLine[]>> = {
  coding: [
    { cap: 'skill', command: 'npx skills add https://hoody.com/SKILLS/SKILL.md' },
    { cap: 'sdkSkill', command: 'npx skills add HoodyNetwork/hoody-sdk' },
  ],
  chat: [{ cap: 'paste', command: '@https://hoody.com Connect to Hoody' }],
  cli: [
    { cap: 'install', command: 'curl -fsSL https://install.hoody.com | sh' },
    { cap: 'installNpm', command: 'npm install -g hoody-sdk' },
    { cap: 'signIn', cli: 'login' },
    { cap: 'list', command: 'hoody computers list' },
  ],
};

/** A kind's setup lines as shown and copied on the platform of `hosts`. */
export function setupLines(kind: AgentKind, hosts: PlatformHosts): { cap: string; text: string }[] {
  return AGENT_SETUPS[kind].map((l) => ({ cap: l.cap, text: l.cli !== undefined ? cliCommand(l.cli, hosts) : platformText(l.command, hosts) }));
}

const AGENT_KEY = 'hub.v3.agentHint.agent';

/** The kind of agent last picked in this browser; coding agents when none was, or storage is unreadable. */
export function readAgentKind(): AgentKind {
  try {
    const raw = hostEnv().local?.getItem(AGENT_KEY) ?? null;
    return (AGENT_KINDS as readonly (string | null)[]).includes(raw) ? (raw as AgentKind) : 'coding';
  } catch {
    return 'coding';
  }
}

/** Remembers the kind of agent in this browser; false when storage refused (the choice holds until the page is left). */
export function saveAgentKind(kind: AgentKind): boolean {
  try {
    const store = hostEnv().local;
    if (!store) return false;
    store.setItem(AGENT_KEY, kind);
    return true;
  } catch {
    return false;
  }
}

const HIDDEN_KEY = 'hub.v3.agentHint.hidden';

/** Pages whose hint was hidden in this browser; empty when storage is unreadable (the hint then shows). */
export function readHiddenHints(): Set<AgentHintPage> {
  try {
    const raw: unknown = JSON.parse(hostEnv().local?.getItem(HIDDEN_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((p): p is AgentHintPage => (AGENT_HINT_PAGES as readonly unknown[]).includes(p)) : []);
  } catch {
    return new Set();
  }
}

/** Hides a page's hint in this browser; false when storage refused (the hint is hidden until the page is left). */
export function hideHint(page: AgentHintPage): boolean {
  try {
    const next = readHiddenHints();
    next.add(page);
    const store = hostEnv().local;
    if (!store) return false;
    store.setItem(HIDDEN_KEY, JSON.stringify([...next]));
    return true;
  } catch {
    return false;
  }
}
