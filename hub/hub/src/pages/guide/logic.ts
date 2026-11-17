// Pure functions of the guide page (no React, no I/O): the door table, template filling, address
// building and masking, section navigation, and the stored-state parser.
import { cliCommand, currentPlatformHosts, platformText, type CodeLine, type PlatformHosts } from '@kit';
import { KIT_PROGRAMS, type KitProgramKey } from '../computers/links';

// ── Sections ───────────────────────────────────────────────────────────────────────

export const SECTIONS = ['ask', 'connect', 'skills', 'build', 'links', 'bots', 'tools', 'try', 'realms', 'topics', 'keys', 'look'] as const;
export type SectionId = (typeof SECTIONS)[number];

export function isSection(v: string | undefined): v is SectionId {
  return v !== undefined && (SECTIONS as readonly string[]).includes(v);
}

/** The id of the section `delta` places from `current` (clamped); with no current, the first. */
export function stepSection(visible: readonly SectionId[], current: SectionId | undefined, delta: -1 | 1): SectionId | undefined {
  if (visible.length === 0) return undefined;
  const i = current ? visible.indexOf(current) : -1;
  if (i < 0) return visible[0];
  return visible[Math.min(Math.max(i + delta, 0), visible.length - 1)];
}

/**
 * Scroll-spy: the last section whose top has passed `line` (30 % of the content viewport); at the
 * end of the scroll the last section is current, unless a jump went to another section there
 * (`held`): the Guide has no scroll room below its last section, so a section near the end
 * cannot reach the line, and the one the reader picked stays marked. `tops` maps a section id to
 * its top; an empty map answers the first section.
 */
export function currentSection(tops: ReadonlyMap<SectionId, number>, order: readonly SectionId[], line = 96, atEnd = false, atStart = false, held?: SectionId): SectionId | undefined {
  if (atStart) return order[0];
  if (atEnd && held !== undefined && order.includes(held)) return held;
  if (atEnd && order.length > 0) return order[order.length - 1];
  let found: SectionId | undefined = order[0];
  for (const id of order) {
    const top = tops.get(id);
    if (top !== undefined && top <= line) found = id;
  }
  return found;
}

// ── Facts and templates ────────────────────────────────────────────────────────────

export interface GuideComputer {
  id: string;
  name: string;
  project: string;
  /** Server node name used in addresses. */
  node: string;
  /** Server display name, e.g. "n12 Singapore". */
  serverName?: string;
  flag?: string;
  running: boolean;
  /** SSH host name of the computer, when it has one. */
  ssh?: string;
}

export interface GuideFacts {
  /** false while the computer list could not be read: unknown is never "none". */
  known: boolean;
  computer: GuideComputer | null;
  /** The platform domain addresses are built on. */
  domain: string;
  /** Label of a working Bot URL, or null when the account has no Bot yet. */
  botLabel: string | null;
  /** Documentation base (https only), or empty when none is configured. */
  docsBase: string;
  realm: { name: string; all: boolean };
  /** The hosts of the platform the Hub runs on; the door table's hoody.com lines point at them. Absent: hoody.com. */
  hosts?: PlatformHosts;
}

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/;
const HOST_RE = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function isHost(v: unknown): v is string {
  return typeof v === 'string' && HOST_RE.test(v);
}

/**
 * Fills {c} {p} {node} {domain} {label} from facts. A fact that is missing or not a plain host
 * label is never filled in: the whole line comes back empty and the caller says why.
 */
export function fillTemplate(tpl: string, f: Pick<GuideFacts, 'computer' | 'domain' | 'botLabel'>): string {
  let missing = false;
  const out = tpl.replace(/\{(c|p|node|domain|label)\}/g, (_m, k: string) => {
    const v: unknown =
      k === 'c' ? f.computer?.id : k === 'p' ? f.computer?.project : k === 'node' ? f.computer?.node : k === 'domain' ? f.domain : f.botLabel;
    const ok = typeof v === 'string' && (k === 'domain' ? HOST_RE.test(v) : k === 'label' ? LABEL_RE.test(v) : ID_RE.test(v));
    if (!ok) {
      missing = true;
      return '';
    }
    return v;
  });
  return missing ? '' : out;
}

// ── Doors (commands are identical in every language; hoody.com
// and its hosts are pointed at the platform the Hub runs on when a door is resolved) ──

export type DoorId = 'ai' | 'coding' | 'cli' | 'sdk' | 'http' | 'mcp' | 'models' | 'boturl' | 'chat' | 'ssh' | 'browser';

/** A short plain-words step name above a line; the text is the page string `cap.<id>`. */
export type CapId =
  | 'paste'
  | 'skill'
  | 'sdkSkill'
  | 'install'
  | 'installNpm'
  | 'signIn'
  | 'list'
  | 'prompt'
  | 'openAgent'
  | 'signInComputer'
  | 'connect'
  | 'callApi'
  | 'agentApi'
  | 'sshHoody'
  | 'sshComputer'
  | 'openHoody'
  | 'openComputer'
  | 'botAddress'
  | 'mcpAddress'
  | 'openaiBase'
  | 'anthropicBase'
  | 'claudeCode';

type CodeLang = NonNullable<CodeLine['lang']>;

export type DoorLine =
  | { kind: 'command'; text: string; cap?: CapId; lang?: CodeLang }
  | { kind: 'template'; text: string; cap?: CapId; lang?: CodeLang }
  /** A hoody CLI command, its arguments only: resolved with kit cliCommand (names the platform only off the CLI's default one). */
  | { kind: 'cli'; args: string; cap?: CapId }
  | { kind: 'path' }
  | { kind: 'ssh'; cap?: CapId };

export interface Door {
  id: DoorId;
  /** Needs a key to work: the panel links to where keys are made. */
  key?: boolean;
  lines: readonly DoorLine[];
  docs?: { label: 'link.cliRef' | 'link.sdkStart'; path: string };
  /** A host the door's block links to under its lines (the one-line installer, the SDK page). */
  host?: 'install' | 'sdk';
}

const cmd = (text: string, cap?: CapId, lang?: CodeLang): DoorLine => ({ kind: 'command', text, cap, lang });
const tpl = (text: string, cap?: CapId, lang?: CodeLang): DoorLine => ({ kind: 'template', text, cap, lang });
const cli = (args: string, cap?: CapId): DoorLine => ({ kind: 'cli', args, cap });

export const DOORS: readonly Door[] = [
  { id: 'ai', lines: [cmd('@https://hoody.com Connect to Hoody', 'paste')] },
  { id: 'coding', key: true, lines: [cmd('npx skills add https://hoody.com/SKILLS/SKILL.md', 'skill'), cmd('npx skills add HoodyNetwork/hoody-sdk', 'sdkSkill')] },
  {
    id: 'cli',
    lines: [
      cmd('curl -fsSL https://install.hoody.com | sh', 'install'),
      cmd('npm install -g hoody-sdk', 'installNpm'),
      // The sign-in names the platform only when it is not the CLI's default (kit cliCommand); the CLI saves it with
      // the session, so the bare commands below reach the same platform (hoody-sdk cli/auth-persist.ts issuerValues).
      cli('login', 'signIn'),
      cmd('hoody computers list', 'list'),
      tpl('hoody agent prompt "Build a sample HTML dashboard on this computer." -c {c}', 'prompt'),
      tpl('hoody agent {c}', 'openAgent'),
      tpl('hoody agent login -c {c}', 'signInComputer'),
    ],
    docs: { label: 'link.cliRef', path: '/foundation/cli/' },
    host: 'install',
  },
  {
    id: 'sdk',
    key: true,
    lines: [
      cmd('npm install hoody-sdk', 'install', 'shell'),
      tpl(
        "import { HoodyClient } from 'hoody-sdk';\nconst hoody = new HoodyClient({ baseURL: 'https://api.hoody.com', token: process.env.HOODY_TOKEN });\nconst box = await hoody.withComputer('{c}');",
        'connect',
      ),
    ],
    docs: { label: 'link.sdkStart', path: '/getting-started/quickstart/' },
    host: 'sdk',
  },
  {
    id: 'http',
    key: true,
    lines: [cmd('curl -H "Authorization: Bearer $HOODY_TOKEN" https://api.hoody.com/api/v1/computers/', 'callApi', 'shell'), tpl('https://{p}-{c}-agent-1.{node}.{domain}/api/v1/agent', 'agentApi')],
  },
  { id: 'mcp', lines: [tpl('https://{label}.hoody.bot/mcp', 'mcpAddress')] },
  {
    id: 'models',
    lines: [
      tpl('https://{label}.hoody.bot/v1', 'openaiBase'),
      tpl('https://{label}.hoody.bot', 'anthropicBase'),
      tpl('ANTHROPIC_BASE_URL=https://{label}.hoody.bot ANTHROPIC_API_KEY="$HOODY_BOT_KEY" claude', 'claudeCode', 'shell'),
    ],
  },
  { id: 'boturl', lines: [tpl('https://{label}.hoody.bot', 'botAddress')] },
  { id: 'chat', lines: [{ kind: 'path' }] },
  { id: 'ssh', lines: [cmd('ssh hoody.com', 'sshHoody'), { kind: 'ssh', cap: 'sshComputer' }] },
  { id: 'browser', lines: [cmd('https://hub.hoody.com', 'openHoody'), tpl('https://{p}-{c}-agent-1.{node}.{domain}', 'openComputer')] },
];

/** Doors with a Bot behind them: they fill from the account's working Bot URL. */
export const BOT_DOORS: readonly DoorId[] = ['boturl', 'models', 'mcp', 'chat'];
export const CONNECT_DOORS: readonly DoorId[] = ['ai', 'coding', 'cli', 'sdk', 'http', 'ssh', 'browser'];

export function isDoor(v: string | undefined): v is DoorId {
  return DOORS.some((d) => d.id === v);
}

export function doorById(id: DoorId): Door {
  const d = DOORS.find((x) => x.id === id);
  if (!d) throw new Error(`unknown door ${id}`);
  return d;
}

/** One piece of a resolved line: plain text, or a token for a fact that is not known yet. */
export type LinePart = string | { placeholder: 'computer' | 'bot' };

export interface ResolvedLine {
  kind: 'command' | 'path';
  cap?: CapId;
  /** The line's own language, where it differs from the door's. */
  lang?: CodeLang;
  /** What is drawn: text pieces and placeholder tokens (ids still whole; the view masks them). */
  parts: readonly LinePart[];
  /** The complete text to copy, or '' while any part is a placeholder. */
  text: string;
  /** The facts the line still waits for. */
  needs: readonly ('bot' | 'computer')[];
}

const NO_FACTS: GuideFacts = { known: false, computer: null, domain: '', botLabel: null, docsBase: '', realm: { name: '', all: false } };

/** A template as parts: each fact that is missing or not a plain host label becomes a placeholder, never a gap. */
function templateParts(tpl: string, f: Pick<GuideFacts, 'computer' | 'domain' | 'botLabel'>): LinePart[] {
  return tpl
    .split(/(\{(?:c|p|node|domain|label)\})/)
    .filter((x) => x !== '')
    .map((piece): LinePart => {
      const m = /^\{(c|p|node|domain|label)\}$/.exec(piece);
      if (!m) return piece;
      const k = m[1];
      const v: unknown = k === 'c' ? f.computer?.id : k === 'p' ? f.computer?.project : k === 'node' ? f.computer?.node : k === 'domain' ? f.domain : f.botLabel;
      const ok = typeof v === 'string' && (k === 'domain' ? HOST_RE.test(v) : k === 'label' ? LABEL_RE.test(v) : ID_RE.test(v));
      return ok ? v : { placeholder: k === 'label' ? 'bot' : 'computer' };
    });
}

function line(parts: readonly LinePart[], cap?: CapId, lang?: CodeLang): ResolvedLine {
  const needs = [...new Set(parts.flatMap((p) => (typeof p === 'string' ? [] : [p.placeholder])))];
  return { kind: 'command', cap, lang, parts, text: needs.length ? '' : parts.join(''), needs };
}

/** The lines of a door with facts filled in; a fact that is not known yet shows as a placeholder in the real command. */
export function resolveDoor(door: Door, facts: GuideFacts = NO_FACTS): ResolvedLine[] {
  const out: ResolvedLine[] = [];
  // The platform comes from the page itself, so commands match it while the facts are loading or failed.
  const hosts = facts.hosts ?? currentPlatformHosts();
  const host = (text: string) => platformText(text, hosts);
  for (const l of door.lines) {
    if (l.kind === 'command') out.push(line([host(l.text)], l.cap, l.lang));
    else if (l.kind === 'cli') out.push(line([cliCommand(l.args, hosts)], l.cap));
    else if (l.kind === 'path') out.push({ kind: 'path', parts: [], text: '', needs: [] });
    else if (l.kind === 'ssh') {
      const host = facts.computer?.ssh;
      if (!facts.computer) out.push(line(['ssh ', { placeholder: 'computer' }], l.cap));
      else if (isHost(host)) out.push(line([`ssh ${host}`], l.cap));
    } else out.push(line(templateParts(host(l.text), facts), l.cap, l.lang));
  }
  return out;
}

// ── Links: every address of the picked computer ────────────────────────────────────

/** A path appended to a program's address in Every link: exec answers a hello there. */
const LINK_PATH: Readonly<Partial<Record<KitProgramKey, string>>> = { exec: '/api/hello' };

/** One row of Every link: the program key (a program.* string of the page), its kit slug, instance, the path appended,
 *  and whether it offers Open (a page to open in a browser; exec too, whose path answers in one). */
export type LinkRow = readonly [KitProgramKey | 'http', string, number, string, boolean];

/** The computers page's program list (computers/links.ts KIT_PROGRAMS, the same Connect shows), then a web port. */
export const LINKS: readonly LinkRow[] = [
  ...KIT_PROGRAMS.map((p): LinkRow => [p.key, p.slug, 1, LINK_PATH[p.key] ?? '', p.use === 'open' || p.key in LINK_PATH]),
  ['http', 'http', 8080, '/', true],
];

/** Examples of programs Every link leaves out, for its "same pattern" note: none is in KIT_PROGRAMS. */
export const MORE_LINK_SLUGS = ['run', 'tunnel'] as const;

/** The address of a kit program on the computer, or '' when a fact is missing or malformed. */
export function kitUrl(facts: Pick<GuideFacts, 'computer' | 'domain'>, slug: string, instance: number): string {
  const c = facts.computer;
  if (!c || !isHost(facts.domain)) return '';
  const part = `${slug}-${instance}`;
  if (![c.project, c.id, c.node].every((v) => typeof v === 'string' && ID_RE.test(v)) || !/^[a-z0-9-]+$/.test(part)) return '';
  return `https://${c.project}-${c.id}-${part}.${c.node}.${facts.domain}`;
}

/** Masks the long ids (computer, project) inside an address: what is shown never carries a full id. */
export function maskAddress(url: string, ids: readonly string[]): string {
  let out = url;
  for (const id of ids) if (id.length >= 12) out = out.replace(id, `${id.slice(0, 4)}…${id.slice(-4)}`);
  return out;
}

/** A documentation link: https only, base plus a fixed path; anything else hides the link. */
export function docsUrl(base: string, path: string): string {
  if (!/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(base) || !/^\/[a-z0-9/_-]*$/i.test(path)) return '';
  return `${base.replace(/\/+$/, '')}${path}`;
}

// ── Per-account guide state (hub_guide_v1), read fail-closed ───────────────────────

export interface GuideEntry {
  seen: 0 | 1;
  s2: 0 | 1;
  hid: 0 | 1;
  door: DoorId | '';
  done: Record<'computer' | 'ask' | 'key' | 'bot', 0 | 1>;
  at: number;
}

const UID_RE = /^(?!__proto__$)[A-Za-z0-9_-]{1,64}$/;
const MAX_ACCOUNTS = 8;
const DONE_KEYS = ['computer', 'ask', 'key', 'bot'] as const;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** One entry, member by member: a damaged value can only show the landing again or untick a step. */
export function cleanEntry(e: unknown): GuideEntry {
  const r = isObj(e) ? e : {};
  const d = isObj(r.done) ? r.done : {};
  const done = { computer: 0, ask: 0, key: 0, bot: 0 } as GuideEntry['done'];
  for (const k of DONE_KEYS) done[k] = d[k] === 1 ? 1 : 0;
  const door = typeof r.cl === 'string' && isDoor(r.cl) ? r.cl : '';
  return {
    seen: r.seen === 1 ? 1 : 0,
    s2: r.s2 === 1 ? 1 : 0,
    hid: r.hid === 1 ? 1 : 0,
    door,
    done,
    at: typeof r.at === 'number' && Number.isFinite(r.at) && r.at > 0 ? r.at : 0,
  };
}

/** The stored document: accounts with a valid id, newest first, at most eight. */
export function parseGuideState(raw: string | null): Record<string, GuideEntry> {
  let doc: unknown;
  try {
    doc = raw ? JSON.parse(raw) : null;
  } catch {
    return {};
  }
  if (!isObj(doc) || doc.v !== 1 || !isObj(doc.a)) return {};
  const entries = Object.entries(doc.a)
    .filter(([uid]) => UID_RE.test(uid))
    .map(([uid, e]) => [uid, cleanEntry(e)] as const)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAX_ACCOUNTS);
  return Object.fromEntries(entries);
}
