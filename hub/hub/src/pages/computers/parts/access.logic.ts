// Who can open a computer's programs: its own access rules document (GET /computers/:id/proxy/permissions),
// read into a shape with no secret in it, and which of the drawer's choices it is.
//
// Contract, in plain words:
//   - rulesFrom(answer): the document's version, its groups (name and kind; an IP group keeps its range, every
//     other credential is dropped), what each group may open, the default, whether the proxy is switched off,
//     and how many hooks it has. null when the answer is not a document. Group names are the author's text: the
//     drawer shows them masked like any id (a name may be a 24-hex id).
//   - A grant: true or '*' is every instance; a number, a list or a "start-end" range is some (http and https
//     take ports only); false or an empty list is none; any other value is unknown, never shown as denied.
//   - modeOf(rules, projectRules): 'anyone' only for the plain open document (no groups, no grants, default
//     allow, proxy on, no hooks); 'private' only for the shut one (the same, default deny: nobody gets in by
//     address); 'myIp' only for the exact document the drawer writes (one group MY_IP_GROUP of
//     one IPv4 /32, allowed everything and logs, default deny); 'ips' ("Only these IPs") for a document whose every
//     group is one IPv4 range, each allowed everything and logs, default deny, whatever the groups are named (a
//     list made elsewhere is read, and its names are kept: ipsOf); 'people' only for a document of the drawer's own
//     person and key-link groups (access.picked.ts peopleOf, finished or cut short); anything else, or any rule on the computer's
//     project (or not knowing), is 'advanced': shown, never changed here, so nothing set elsewhere is lost.
//   - The proxy merges the project's document under the computer's (the computer's wins, groups add up), so a
//     project rule can let more people in than the computer's choice says: the drawer only offers its choices
//     when the project has none.

import { ALLOWLIST_MAX, ipv4Problem, type IpProblemCode, maskAddress, parseAllowlist } from '@core';
import { shownText } from '@kit';
import { type Entry, peopleOf } from './access.picked';

export const MY_IP_GROUP = 'hub-my-ip';
/** The name the Hub gives a group it adds for "Only these IPs": the prefix, then the range with "-" for "." and "/". */
export const IP_GROUP_PREFIX = 'hub-ip-';
/** The most addresses "Only these IPs" takes (the API's own limit is 256 groups in a document). */
export const IPS_MAX = ALLOWLIST_MAX;

/** One address of "Only these IPs": its group as stored, and its range (canonical IPv4 CIDR, never /0). */
export interface IpEntry {
  group: string;
  range: string;
}

/** What one group may open: every instance of a program, none, or some (by number). */
export interface Grant {
  program: string;
  rule: 'all' | 'none' | 'some' | 'unknown';
  /** 'some': which instances or ports, as written ("1, 2", "8080", "8000-8100"). Numbers only, never a credential. */
  spec?: string;
}

export interface AccessRules {
  /** file_version: the write's If-Match is `file:v<version>`. 0 before the first write. */
  version: number;
  /** The document's project id (a write must name it); null when the answer has none. Never shown. */
  project: string | null;
  groups: Array<{ name: string; kind: 'ip' | 'password' | 'jwt' | 'token' | 'identity' | 'mixed' | 'other'; range?: string }>;
  grants: Array<{ group: string; programs: Grant[] }>;
  /** default 'allow' (true), 'deny' (false); null when 'inherit', missing or unknown. */
  allowByDefault: boolean | null;
  /** default 'inherit': the computer uses its project's, so with no project rules it lets everyone in (defaultOf). */
  inherits?: boolean;
  proxyOff: boolean;
  /** enable_proxy as stored: true, false, or null when the computer does not set it (its project's value applies). */
  proxy: boolean | null;
  hooks: number;
}

export type ProjectRules = 'yes' | 'no' | 'unknown';
export type AdvancedWhy = 'proxyOff' | 'hooks' | 'rules' | 'project' | 'projectUnknown';
export type AccessMode = { kind: 'anyone' } | { kind: 'private' } | { kind: 'myIp'; ip: string } | { kind: 'ips'; entries: IpEntry[] } | { kind: 'people'; entries: Entry[]; unfinished: boolean; open: boolean; myIp: boolean; listLeft?: true } | { kind: 'advanced'; why: AdvancedWhy[] };

type Raw = Record<string, unknown>;
const rec = (v: unknown): Raw | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : null);
const KINDS = ['ip', 'password', 'jwt', 'token'] as const;
const V4_32 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}\/32$/;

function grantOf(v: unknown): Grant['rule'] {
  if (v === true || v === '*') return 'all';
  if (v === false || (Array.isArray(v) && v.length === 0)) return 'none';
  if ((typeof v === 'number' && Number.isInteger(v)) || Array.isArray(v) || (typeof v === 'string' && /^\d+-\d+$/.test(v))) return 'some';
  return 'unknown';
}

/** The document in an answer, with no credential kept; null when there is none. */
export function rulesFrom(answer: unknown): AccessRules | null {
  const d = rec(rec(answer)?.data);
  if (!d) return null;
  const version = typeof d.file_version === 'number' && Number.isInteger(d.file_version) && d.file_version >= 0 ? d.file_version : null;
  if (version === null) return null;
  const groups: AccessRules['groups'] = Object.entries(rec(d.groups) ?? {}).map(([name, g]) => {
    const one = rec(g);
    if (!one) return { name, kind: Array.isArray(g) ? 'mixed' : 'other' };
    const kind = one.type === 'hoody-identity' ? 'identity' : (KINDS as readonly unknown[]).includes(one.type) ? (one.type as (typeof KINDS)[number]) : 'other';
    return kind === 'ip' && typeof one.range === 'string' ? { name, kind, range: one.range } : { name, kind };
  });
  const grants = Object.entries(rec(d.permissions) ?? {}).map(([group, p]) => ({
    group,
    programs: Object.entries(rec(p) ?? {}).map(([program, v]) => {
      const rule = grantOf(v);
      const nums = Array.isArray(v) ? v.every((x) => typeof x === 'number' && Number.isInteger(x)) : true;
      return rule === 'some' && nums ? { program, rule, spec: Array.isArray(v) ? v.join(', ') : String(v) } : { program, rule };
    }),
  }));
  const hooks = Object.values(rec(d.hooks) ?? {}).reduce<number>((n, h) => n + (Array.isArray(h) ? h.length : 1), 0);
  return {
    version,
    project: typeof d.project === 'string' && /^[0-9a-f]{24}$/.test(d.project) ? d.project : null,
    groups,
    grants,
    allowByDefault: d.default === 'allow' ? true : d.default === 'deny' ? false : null,
    ...(d.default === 'inherit' ? { inherits: true } : {}),
    proxyOff: d.enable_proxy === false,
    proxy: typeof d.enable_proxy === 'boolean' ? d.enable_proxy : null,
    hooks,
  };
}

/** Project rules from a computer's proxy_permissions_scope: 'project' or 'both' means the project has some. */
export function projectRulesOf(scope: string | undefined): ProjectRules {
  if (scope === 'project' || scope === 'both') return 'yes';
  return scope === 'none' || scope === 'computer' ? 'no' : 'unknown';
}

/** The untouched open document: no group, no grant, default allow, proxy on, no hooks. */
export function plainOpen(r: AccessRules): boolean {
  return r.groups.length === 0 && r.grants.length === 0 && r.allowByDefault === true && !r.proxyOff && r.hooks === 0;
}


/** The default that applies: the document's own, or, when it inherits, the project's when the project has no rules
 *  (allow). Null when it depends on project rules, and when it is missing (never guessed). */
function defaultOf(r: AccessRules, project: ProjectRules): boolean | null {
  return r.allowByDefault ?? (r.inherits && project === 'no' ? true : null);
}

// ---- "Only these IPs": the ranges, and the document that holds them ----

/** A range an access rule can take from the Hub: canonical IPv4 CIDR with a prefix from 1 to 32 and zero host bits.
 *  Never looser than the API (its own check also takes leading zeros and host bits; the edge refuses leading zeros).
 *  /0 is every address, which is no list. */
export function rangeOk(range: unknown): range is string {
  return typeof range === 'string' && range.includes('/') && !range.endsWith('/0') && ipv4Problem(range) === null;
}

/** A range as shown and typed: one address without its "/32". */
export const shownRange = (range: string): string => (range.endsWith('/32') ? range.slice(0, -3) : range);

/** The group name the Hub gives a new range. */
export const ipGroupName = (range: string): string => IP_GROUP_PREFIX + range.replace(/[./]/g, '-');

export interface ParsedIps {
  /** The valid ranges, each once, in typed order (one address is its /32). */
  ranges: string[];
  /** Every refused entry as typed, with why: the kit list's reasons, or 'all' for a /0. */
  errors: Array<{ entry: string; code: IpProblemCode | 'all' }>;
  tooMany: boolean;
}

/** The typed list of "Only these IPs" (spaces, commas or new lines between entries). An entry is refused, never
 *  repaired; nothing is dropped behind the person's back. */
export function parseIps(text: string): ParsedIps {
  const p = parseAllowlist(text, IPS_MAX);
  const ranges: string[] = [];
  const errors: ParsedIps['errors'] = [...p.errors];
  for (const e of p.entries) {
    const range = e.includes('/') ? e : `${e}/32`;
    if (range.endsWith('/0')) errors.push({ entry: e, code: 'all' });
    else if (!ranges.includes(range)) ranges.push(range);
  }
  return { ranges, errors, tooMany: ranges.length > IPS_MAX };
}

/** The list as the field shows it: one entry per line. */
export const ipsText = (ranges: readonly string[]): string => ranges.map(shownRange).join('\n');

/** The same set of ranges, in any order. */
export function sameRanges(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));
}

const num = (ip: string): number => ip.split('.').reduce((n, o) => n * 256 + Number(o), 0);
/** Whether one IPv4 address is inside any of the ranges (to say whether the person's own address stays in). */
export function coversIp(ranges: readonly string[], ip: string): boolean {
  if (!V4.test(ip)) return false;
  return ranges.some((r) => {
    if (!rangeOk(r)) return false;
    const [net, bits] = r.split('/') as [string, string];
    const size = 2 ** (32 - Number(bits));
    return Math.floor(num(ip) / size) === Math.floor(num(net) / size);
  });
}

/** Group names the Hub never writes as a key: `__proto__` set on an object changes its prototype instead of adding
 *  an entry, so the group would vanish from the saved document, and the proxy skips a group with any of the three.
 *  The API still keeps an old group so named. */
const RESERVED_NAMES: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/** The entries when the document is "Only these IPs": one group or more (at most IPS_MAX), every one a single IPv4
 *  range the Hub can take (rangeOk), no range twice, each allowed exactly everything and logs, no rule for a missing
 *  group, everyone else kept out. The groups' names are whatever their author gave them, except a reserved name
 *  (RESERVED_NAMES): that document stays Advanced. Null for any other
 *  document. (The proxy switch and hooks are judged by the caller, as for every choice.) */
export function ipsOf(r: AccessRules): IpEntry[] | null {
  if (r.allowByDefault !== false || r.groups.length === 0 || r.groups.length > IPS_MAX || r.grants.length !== r.groups.length) return null;
  const entries: IpEntry[] = [];
  for (const g of r.groups) {
    if (g.kind !== 'ip' || RESERVED_NAMES.has(g.name) || !rangeOk(g.range) || entries.some((e) => e.group === g.name || e.range === g.range)) return null;
    const grant = r.grants.filter((x) => x.group === g.name);
    const p = grant[0]?.programs ?? [];
    if (grant.length !== 1 || p.length !== 2 || !p.every((x) => (x.program === '*' || x.program === 'logs') && x.rule === 'all') || p[0]?.program === p[1]?.program) return null;
    entries.push({ group: g.name, range: g.range });
  }
  return entries;
}

/** The groups and permissions of "Only these IPs" for `ranges`, over rules `r`. A range `r` already holds keeps its
 *  group's name, whatever it is: a computer's own rules name a project's group to narrow it, and a renamed group would
 *  lose that. The one exception is the "Only my IP" group, which is that choice's own. A new range gets ipGroupName,
 *  or that name with a number when a group `r` holds (kept or going) already has it, so no name ever moves from one
 *  range to another. Null when a range is not one the Hub takes, or the list is empty, too long or names a range twice. */
export function ipsGroups(r: AccessRules, ranges: readonly string[]): { groups: Record<string, unknown>; permissions: Record<string, unknown> } | null {
  if (ranges.length === 0 || ranges.length > IPS_MAX || new Set(ranges).size !== ranges.length || !ranges.every(rangeOk)) return null;
  const keptName = (range: string) => r.groups.find((g) => g.kind === 'ip' && g.range === range && g.name !== MY_IP_GROUP && !RESERVED_NAMES.has(g.name))?.name;
  const taken = new Set(r.groups.map((g) => g.name));
  const groups: Record<string, unknown> = {};
  const permissions: Record<string, unknown> = {};
  for (const range of ranges) {
    let name = keptName(range);
    if (name === undefined) {
      const own = ipGroupName(range);
      name = own;
      for (let n = 2; taken.has(name); n++) name = `${own}-${n}`;
      taken.add(name);
    }
    groups[name] = { type: 'ip', range };
    // '*' never covers logs at the edge, so each rule names logs too (as Only my IP's own).
    permissions[name] = { '*': true, logs: true };
  }
  return { groups, permissions };
}

/** Which choice the document is; 'advanced' for anything the drawer did not write. */
export function modeOf(rules: AccessRules, project: ProjectRules): AccessMode {
  const r: AccessRules = { ...rules, allowByDefault: defaultOf(rules, project) };
  const why: AdvancedWhy[] = [];
  if (project === 'yes') why.push('project');
  if (project === 'unknown') why.push('projectUnknown');
  if (r.proxyOff) why.push('proxyOff');
  if (r.hooks > 0) why.push('hooks');
  const bare = r.groups.length === 0 && r.grants.length === 0;
  const open = bare && r.allowByDefault === true;
  const shut = bare && r.allowByDefault === false;
  const g = r.groups[0];
  const p = r.grants[0];
  const mine = r.groups.length === 1 && r.grants.length === 1 && g?.name === MY_IP_GROUP && g.kind === 'ip' && typeof g.range === 'string'
    && V4_32.test(g.range) && p?.group === MY_IP_GROUP && r.allowByDefault === false
    && p.programs.length === 2 && p.programs.every((x) => (x.program === '*' || x.program === 'logs') && x.rule === 'all')
    && p.programs[0]?.program !== p.programs[1]?.program;
  const people = peopleOf(r);
  // One "Only my IP" group alone is that choice; any other list of ranges is "Only these IPs".
  const ips = mine ? null : ipsOf(r);
  if (!open && !shut && !mine && !ips && !people) why.push('rules');
  if (why.length) return { kind: 'advanced', why };
  if (people) return { kind: 'people', ...people };
  if (mine && g?.range) return { kind: 'myIp', ip: g.range.slice(0, -3) };
  if (ips) return { kind: 'ips', entries: ips };
  return shut ? { kind: 'private' } : { kind: 'anyone' };
}

// ---- the plain summary the drawer shows (no AI), and the snapshot an Agent conversation is started with ----

/** One summary sentence: a strings key (AccessDrawer.strings.en.json `sum.*`) and its values. */
export interface SumLine {
  key: 'sum.ownLead' | 'sum.anyone' | 'sum.anyoneGroups' | 'sum.only' | 'sum.nobody' | 'sum.noDefault' | 'sum.off' | 'sum.offProject' | 'sum.projectToo' | 'sum.projectUnknown' | 'sum.hooks';
  vars?: Record<string, string | number>;
}

/** Who can open the programs, in a few fixed sentences read straight from the document (the rules win over any
 *  Agent answer). Group names are masked like any id.
 *  Only when the project has no rules is that who gets in. Otherwise the sentences say what the computer's own
 *  rules say, then that the project's apply too: they can let more people in, ask for a password or switch the
 *  addresses off, and the Hub cannot tell from an answer whether the computer has a document of its own (a
 *  deleted one still answers with a version; one from before versions answers 0), so it never says who gets in. */
/** `subject` 'project': a project's own document: no own-rules lead, no project lines and no hooks line (the edge
 *  never runs a project's hooks; the project tab says so itself). */
export function summaryOf(r: AccessRules, project: ProjectRules, subject: 'computer' | 'project' = 'computer'): SumLine[] {
  const out: SumLine[] = [];
  const computer = subject === 'computer';
  if (computer && project !== 'no') out.push({ key: 'sum.ownLead' });
  if (r.proxyOff) out.push({ key: computer ? 'sum.off' : 'sum.offProject' });
  else if ((computer ? defaultOf(r, project) : r.allowByDefault) === true) out.push({ key: r.groups.length ? 'sum.anyoneGroups' : 'sum.anyone' });
  else if (r.allowByDefault === false) {
    const names = r.groups.map((g) => maskAddress(g.name));
    out.push(names.length ? { key: 'sum.only', vars: { groups: names.join(', '), count: names.length } } : { key: 'sum.nobody' });
  } else out.push({ key: 'sum.noDefault' });
  if (computer && project === 'yes') out.push({ key: 'sum.projectToo' });
  if (computer && project === 'unknown') out.push({ key: 'sum.projectUnknown' });
  if (computer && r.hooks > 0) out.push({ key: 'sum.hooks', vars: { count: r.hooks } });
  return out;
}

/** The longest snapshot an Agent conversation starts with; what does not fit is counted, never silently dropped. */
export const SNAPSHOT_MAX = 6000;

// Author text (a computer, group or program name) goes in quoted and escaped, with every 24-hex run masked, so a
// name can neither carry an id nor break out of its line.
const q = (v: string) => JSON.stringify(maskAddress(v.length > 120 ? `${v.slice(0, 119)}…` : v));

const KIND_TEXT: Record<AccessRules['groups'][number]['kind'], string> = {
  ip: 'IP range', password: 'password sign-in', jwt: 'signed token (JWT)', token: 'access token',
  identity: 'Hoody account sign-in', mixed: 'any of several sign-ins', other: 'another kind of sign-in',
};

function grantText(p: Grant): string {
  const what = p.program === '*' ? '"*" (every program; never grants the group logs)' : q(p.program);
  if (p.rule === 'all') return what;
  if (p.rule === 'none') return `${what}: refused`;
  if (p.rule === 'some') return `${what}: only ${p.spec ?? 'some instances or ports'}`;
  return `${what}: a rule the Hub can't read`;
}

/** The lines of one document, secret-free (built from AccessRules, which keeps no credential). */
function docLines(r: AccessRules): string[] {
  const lines = [
    // The version alone never says whether the document exists (a deleted one keeps a version; one stored before
    // versions answers 0): printed as it is.
    `  version: ${r.version}`,
    `  programs' web addresses: ${r.proxy === false ? 'switched off' : r.proxy === true ? 'on' : 'not set here (the project value applies, on unless it says off)'}`,
    `  everyone not in a group: ${r.allowByDefault === true ? 'let in, after the group checks (a password group asks for sign-in first on the programs it names; a group\'s refusal applies to its own members)' : r.allowByDefault === false ? 'kept out' : r.inherits ? 'as the project\'s default says (let in when the project has no rules)' : 'not stated'}`,
  ];
  if (!r.groups.length) lines.push('  groups: none');
  for (const g of r.groups) {
    const grant = r.grants.find((x) => x.group === g.name);
    const opens = !grant ? 'nothing granted' : grant.programs.length ? grant.programs.map(grantText).join('; ') : 'nothing';
    lines.push(`  group ${q(g.name)}: ${KIND_TEXT[g.kind]}${g.kind === 'ip' && g.range ? ` ${q(g.range)}` : ''}; may open: ${opens}`);
  }
  for (const grant of r.grants) {
    if (!r.groups.some((g) => g.name === grant.group)) lines.push(`  rule for undefined group ${q(grant.group)}: ${grant.programs.map(grantText).join('; ') || 'nothing'}`);
  }
  if (r.hooks > 0) lines.push(`  hooks: ${r.hooks} (each runs a script on the visits it matches)`);
  return lines;
}

/** A project document's lines: as a computer's, but its hooks never run (the edge runs a computer's own only). */
function projectDocLines(r: AccessRules): string[] {
  const lines = docLines({ ...r, hooks: 0 });
  if (r.hooks > 0) lines.push(`  hooks: ${r.hooks} (a project's hooks are not used: only a computer's own hooks run)`);
  return lines;
}

// How the edge reads the two documents together (the reverse proxy's permissions matrix):
// said once in every snapshot, so the Agent never guesses it.
const HOW_RULES = [
  'How the rules combine: the project\'s groups and the computer\'s add up. A computer group with the same name replaces the project group\'s sign-in, but program rules merge program by program: the computer\'s rule for a program wins, the project\'s rules for other programs stay.',
  'The computer\'s address switch and its "everyone not in a group" win when the computer sets them; otherwise the project\'s apply. The Hub cannot always tell whether the computer has a document of its own, so when the project has rules, who gets in depends on both.',
  'Logs: a group gets logs only from its own "logs" rule, never from "*" (under "let in", people not in a group still get logs). Under "let in", for a group with no "logs" rule of its own, its "*": refused also refuses its members logs, and a password group whose "*" is not refused asks for sign-in on logs.',
];

const MODE_TEXT: Record<AccessMode['kind'], string> = {
  anyone: 'Anyone with the address', myIp: 'Only my IP', ips: 'Only these IPs (the address ranges listed in the document)', private: 'Private (nobody by address)', people: 'Only people or key links picked in the Permissions tab (password sign-in, or a key in the link)', advanced: 'Rules set outside the Hub',
};

export interface SnapshotOf {
  /** The computer's shown name (author text: quoted, ids masked). */
  name: string;
  rules: AccessRules;
  project: ProjectRules;
  /** The project's own document when it was read; undefined when not read. */
  projectRules?: AccessRules | null;
}

/** The text an Agent conversation about one computer's access starts with, with how many lines did not fit. */
export function snapshotOf(x: SnapshotOf, max = SNAPSHOT_MAX): { text: string; left: number } {
  const mode = modeOf(x.rules, x.project);
  const head = [
    `Access rules of computer ${q(x.name)} (who can open its programs, such as terminal, files and screen, through their web addresses).`,
    `The Hub reads this as: ${MODE_TEXT[mode.kind]}.`,
    ...HOW_RULES,
    'Computer document:',
  ];
  const project = x.projectRules
    ? ['Project document:', ...docLines(x.projectRules)]
    : [`Project document: ${x.project === 'yes' ? 'it has rules, not included here' : x.project === 'no' ? 'none (the API says the project has no rules)' : 'unknown (the Hub could not tell)'}`];
  return bounded([...head, ...docLines(x.rules), ...project], [], max);
}

/** One computer of a project in its snapshot: whether it has an access document of its own (projectPerms.logic.ts
 *  ownOf: 'yes', 'no', or not known). */
export interface ProjectSnapshotComputer {
  name: string;
  own: 'yes' | 'no' | 'notKnown' | 'failed';
}

const OWN_TEXT: Record<ProjectSnapshotComputer['own'], string> = {
  yes: 'has rules of its own (it inherits the project\'s groups and rules)',
  no: 'has no rules of its own (the project\'s rules decide)',
  notKnown: 'the Hub cannot tell whether it has rules of its own',
  failed: 'the Hub could not read whether it has rules of its own',
};

/** The text an Agent conversation about a project's access rules starts with: the project document, never
 *  a credential, then each computer shown with whether it has rules of its own. A project with no computer shown
 *  gives the project block alone. Bounded like the others. */
export function projectSnapshotOf(name: string, rules: AccessRules, computers: readonly ProjectSnapshotComputer[], max = SNAPSHOT_MAX): { text: string; left: number } {
  const lines = [
    `Access rules of project ${q(name)}: every computer in it inherits them, now and later, in every realm.`,
    `The Hub reads this as: ${MODE_TEXT[modeOf({ ...rules, hooks: 0 }, 'no').kind]}.`,
    ...HOW_RULES,
    'Project document:',
    ...projectDocLines(rules),
  ];
  if (computers.length) lines.push(`Computers of this project shown in the Hub (${computers.length}):`);
  for (const c of computers) lines.push(`  computer ${q(c.name)}: ${OWN_TEXT[c.own]}`);
  return bounded(lines, [], max);
}

/** One computer in a realm-wide snapshot: its rules, or null when they could not be read. */
export interface RealmItem {
  name: string;
  rules: AccessRules | null;
  project: ProjectRules;
}

/** The realm-wide snapshot: every computer read, in order, bounded; `left` counts the lines that did not fit and
 *  `skipped` the computers not read at all (passed by the caller, said in the text). */
export function realmSnapshotOf(items: readonly RealmItem[], skipped = 0, max = SNAPSHOT_MAX): { text: string; left: number } {
  const lines = ['Access rules of the computers in this realm (who can open their programs through their web addresses).', ...HOW_RULES];
  for (const it of items) {
    if (!it.rules) {
      lines.push(`Computer ${q(it.name)}: rules could not be read.`);
      continue;
    }
    lines.push(`Computer ${q(it.name)}: ${MODE_TEXT[modeOf(it.rules, it.project).kind]}; project rules: ${it.project === 'yes' ? 'yes' : it.project === 'no' ? 'no' : 'unknown'}`, ...docLines(it.rules));
  }
  // Said outside the cut, so a long document never hides how many computers were not read at all.
  return bounded(lines, skipped > 0 ? [`${skipped} more computer${skipped === 1 ? '' : 's'} not read (left out to keep this short).`] : [], max);
}

/** A realm-wide snapshot as the parts a person reads it in: how the rules combine (everything before the first
 *  computer), then one part per computer, then what the snapshot says it left out. Joined with a line break, the
 *  parts' texts are the snapshot, character for character: a part is only a place to fold it. */
export function realmSnapshotParts(text: string): { k: 'how' | 'computer' | 'left'; name?: string; text: string }[] {
  const out: { k: 'how' | 'computer' | 'left'; name?: string; lines: string[] }[] = [];
  for (const line of text.split('\n')) {
    const m = /^Computer (".*?"|\S+): /.exec(line);
    const left = /^\(\d+ more lines? left out /.test(line) || /^\d+ more computers? not read /.test(line);
    const last = out[out.length - 1];
    if (m) out.push({ k: 'computer', name: nameOf(m[1] as string), lines: [line] });
    else if (left && last?.k !== 'left') out.push({ k: 'left', lines: [line] });
    else if (last) last.lines.push(line);
    else out.push({ k: 'how', lines: [line] });
  }
  return out.map(({ lines, ...rest }) => ({ ...rest, text: lines.join('\n') }));
}

/** One computer's snapshot (snapshotOf) as the parts a person reads it in: how the rules combine (its sentences, up to
 *  the "Computer document:" line), then the documents (a listing, from that line on). Joined with a line break, the
 *  parts' texts are the snapshot, character for character. A snapshot cut before its documents is one listing part. */
export function snapshotParts(text: string): { k: 'how' | 'documents'; text: string }[] {
  const lines = text.split('\n');
  const at = lines.indexOf('Computer document:');
  if (at < 1) return [{ k: 'documents', text }];
  return [{ k: 'how', text: lines.slice(0, at).join('\n') }, { k: 'documents', text: lines.slice(at).join('\n') }];
}

/** A name as the snapshot quotes it (q above), read back; as written when it is not a quoted string. */
function nameOf(quoted: string): string {
  try {
    const v: unknown = JSON.parse(quoted);
    return typeof v === 'string' ? v : quoted;
  } catch {
    return quoted;
  }
}

function bounded(lines: string[], tail: string[] = [], max = SNAPSHOT_MAX): { text: string; left: number } {
  const kept: string[] = [];
  let size = tail.reduce((n, l) => n + l.length + 1, 0);
  for (const l of lines) {
    if (size + l.length + 1 > max - 80) break;
    kept.push(l);
    size += l.length + 1;
  }
  const left = lines.length - kept.length;
  if (left > 0) kept.push(`(${left} more line${left === 1 ? '' : 's'} left out to keep this short; say so if they matter.)`);
  return { text: [...kept, ...tail].join('\n'), left };
}

// The two Explain questions. Each is shown and sent as the new conversation's first message; the snapshot goes with
// it as the message's Context (the kit's startAgentConversation), shown under the question, never hidden.
const CONTEXT_RULES = 'Answer only from the snapshot in the Context below. Quote the rule you are reading. If the snapshot does not say, answer "I\'m not sure" rather than guess. Never ask for or repeat passwords, tokens or secrets: the snapshot leaves them out on purpose.';

/** "Explain with the Agent": who can open the computer, from the snapshot. */
export const EXPLAIN_QUESTION = [
  'Explain in plain English who can open this computer\'s programs and from where, what is blocked, what a person who only has a program\'s address can and cannot do, and anything risky. Do not change anything.',
  CONTEXT_RULES,
].join('\n');

/** "Explain access" (Computers list): who can open each computer, as a short list. The answer is read beside the
 *  list, so the question asks for one bullet per computer and a few risks, never an essay over every rule; a short
 *  Markdown list, which the Agent panel draws as a list (the kit's Markdown renderer). */
export const EXPLAIN_ALL_QUESTION = [
  'Answer as a short Markdown list, with nothing before it. One bullet per computer in the Context: its name in bold, then one short line saying who can open its programs (for example: anyone with the address; only 203.0.113.0/24; only the people and key links in its rules; nobody), adding "project rules too" when they apply. Then the line "**Risks**" and at most three bullets under it, or the line "No risks found." If the Context says some computers were not read, say how many in one last line. No tables, no headings, no explanation of how rules work. Do not change anything.',
  'Answer only from the snapshot in the Context below. If it does not say, write "not sure". Never ask for or repeat passwords, tokens or secrets: the snapshot leaves them out on purpose.',
].join('\n');

/** Which note an Explain button shows: a start that may have reached the Agent outranks a read that failed (another
 *  button may have started the same question while this one's read was out), so it is never described as not sent. */
export function askNote(outcome: 'sent' | 'notSent' | 'unknown' | null, unread: boolean): 'unknown' | 'unread' | 'notSent' | null {
  if (outcome === 'unknown') return 'unknown';
  if (unread) return 'unread';
  return outcome === 'notSent' ? 'notSent' : null;
}

/** "Explain with the Agent" on a project's Permissions: who can open the programs of its computers. */
export const EXPLAIN_PROJECT_QUESTION = [
  'Explain in plain English who can open the programs of this project\'s computers and from where: for computers without rules of their own, and for those with rules of their own (they inherit the project\'s groups and rules). Name what is blocked and anything risky. Do not change anything.',
  CONTEXT_RULES,
].join('\n');

/** A question and the snapshot sent with it as its Context. */
export interface AgentQuestion {
  text: string;
  context: string;
  /** The request in one line, when the question has one: the Agent panel shows it as the message (kit AgentQuestion). */
  title?: string;
}

/** The Explain question with its snapshot, both within `room` characters (the Agent's message limit less the
 *  Context marker): the snapshot gets what the question leaves, and says what it left out, so the kit never has
 *  to cut it. */
export function explainStart(x: SnapshotOf, room: number): AgentQuestion {
  return { text: EXPLAIN_QUESTION, context: snapshotOf(x, room - EXPLAIN_QUESTION.length).text };
}

/** The project question with its snapshot within `room` characters. */
export function explainProjectStart(name: string, rules: AccessRules, computers: readonly ProjectSnapshotComputer[], room: number): AgentQuestion {
  return { text: EXPLAIN_PROJECT_QUESTION, context: projectSnapshotOf(name, rules, computers, room - EXPLAIN_PROJECT_QUESTION.length).text };
}

/** The realm-wide question with its snapshot within `room` characters; it still says how many computers were not read. */
export function explainAllStart(items: readonly RealmItem[], skipped: number, room: number): AgentQuestion {
  return { text: EXPLAIN_ALL_QUESTION, context: realmSnapshotOf(items, skipped, room - EXPLAIN_ALL_QUESTION.length).text };
}

/** The longest request "Tell the Agent what you want" takes; a longer one is refused, never cut. */
export const CHANGE_MAX = 1000;

/** Why a "Tell the Agent what you want" request cannot go: empty, longer than CHANGE_MAX (refused, never cut: a cut
 *  request could drop what the person asked), or holding what may be a password or key: a run of 16 or more letters,
 *  digits, "+", "/" or "=" that mixes any two of capitals, small letters and digits. Every password and key link the
 *  drawer makes (makeSecret: 20 or 32 characters drawn from capitals, small letters and digits) is such a run unless
 *  all its characters come from one class (about 1 in 10^7 for 20 characters). A whole 24-hex id is the one exception: it
 *  is masked in the message. The cost is that a long mixed name ("ProductionAdmins2", "AlexanderHamilton@...") is
 *  refused too, and the drawer says why. Such a run is never sent, not even masked: the Agent never needs one, and
 *  the tools it changes the rules with cannot add a password, token or JWT group anyway. */
export function changeProblem(request: string): 'empty' | 'long' | 'secret' | null {
  const ask = request.trim();
  if (!ask) return 'empty';
  if (ask.length > CHANGE_MAX) return 'long';
  return hasSecretRun(ask) ? 'secret' : null;
}

// The one rule for "may be a password or key" in what an Agent conversation is given (changeProblem above; the
// Firewall's Agent start uses it too): a run of 16 or more letters, digits, "+", "/" or "=" that mixes any two of
// capitals, small letters and digits, a whole 24-hex id excepted (masked instead, maskSeenIds). The run is read as a
// reader sees the text (the kit's shownText: no control, format character, combining mark, variation selector or blank
// filler), so nothing that shows nothing splits it; the text itself is never rewritten except where a run is hidden or
// an id shortened (an emoji's joiner, a script's marks and bidi marks elsewhere stay as written).
const RUN = /[A-Za-z0-9+/=]{16,}/g;
const ID = /[0-9a-f]{24}/gi;
const secretRun = (run: string) => !/^[0-9a-f]{24}$/i.test(run) && [/[A-Z]/, /[a-z]/, /\d/].filter((c) => c.test(run)).length >= 2;
/** Each match of `re` in the text as a reader sees it (shownText) replaced, in the text as written, by `to(match)`
 *  (undefined: kept): the written span runs from the match's first seen character to its last, what shows nothing
 *  inside it included. */
function replaceSeen(text: string, re: RegExp, to: (seen: string) => string | undefined): string {
  let seen = '';
  const at: number[] = [];
  let i = 0;
  for (const ch of text) {
    if (shownText(ch) !== '') {
      seen += ch;
      for (let k = 0; k < ch.length; k++) at.push(i + k);
    }
    i += ch.length;
  }
  let out = '';
  let from = 0;
  for (const m of seen.matchAll(re)) {
    const v = to(m[0]);
    if (v === undefined || m[0].length === 0) continue;
    const a = at[m.index]!;
    const b = at[m.index + m[0].length - 1]! + 1;
    out += text.slice(from, a) + v;
    from = b;
  }
  return out + text.slice(from);
}
/** Whether the text holds a run that may be a password or key, at any length (the length limit is the caller's). */
export function hasSecretRun(text: string): boolean {
  return (shownText(text).match(RUN) ?? []).some(secretRun);
}
/** The text with each run that may be a password or key replaced by "[hidden]", for author text the person did not
 *  type for the Agent (a rule's description): never refused, never sent whole. */
export function hideSecretRuns(text: string): string {
  return replaceSeen(text, RUN, (run) => (secretRun(run) ? '[hidden]' : undefined));
}
/** The text with every 24-hex id shortened (core maskAddress), an id split by something that shows nothing included. */
export function maskSeenIds(text: string): string {
  return maskAddress(replaceSeen(text, ID, (id) => maskAddress(id)));
}

// What the change conversation is told after the person's request. The Agent's own tools do the work: the get tool
// reads the rules with every credential withheld, the set tool shows the person a before → after card and writes
// once on approval (the agent's own tools). Both act on the computer the conversation is bound to.
const CHANGE_RULES = [
  'Make this change to this computer\'s access rules (who can open its programs through their web addresses).',
  'Read the current rules with hoody_proxy_permissions_get first: the snapshot in the Context below is what the Hub showed and may be out of date. Then change them only with hoody_proxy_permissions_set, which shows the person a before → after card to approve. Change only what was asked; keep every other group and rule. If the change could lock the person out (for example "only my IP" when you do not know their address), say so and ask before writing.',
  'You cannot add password, token or signed-token (JWT) groups: for people who sign in with a password, or links with a key, tell the person to add them in this computer\'s Permissions tab ("Only people or keys I pick"). Never ask for or repeat passwords, tokens or secrets: the snapshot leaves them out on purpose.',
  'If the tools are missing or refuse, say what happened and change nothing another way (not through the hoody command line, files on the computer, or the API).',
].join('\n');

/** The longest request that travels as the message's title (the kit's ASK_LABEL_MAX), and what the title's marker takes
 *  of the room (the kit's ASK_REQUEST_MARK, rounded up). */
const CHANGE_TITLE_MAX = 120;
const TITLE_MARK = 20;

/** "Tell the Agent what you want": the person's request (ids masked: a pasted id never reaches the Agent whole),
 *  then how to make the change, with the drawer's snapshot as the Context in what is left of `room`; null when
 *  changeProblem refuses the request. */
export function changeStart(request: string, x: SnapshotOf, room: number): AgentQuestion | null {
  if (changeProblem(request)) return null;
  const ask = maskAddress(request.trim());
  // A short request on one line is the message's title: the Agent panel shows the person's own words and keeps how to
  // make the change with the context, one press away. A longer one is sent, and shown, as before.
  if (!ask.includes('\n') && ask.length <= CHANGE_TITLE_MAX) return { title: ask, text: CHANGE_RULES, context: snapshotOf(x, room - ask.length - TITLE_MARK - CHANGE_RULES.length).text };
  const text = `${ask}\n\n${CHANGE_RULES}`;
  return { text, context: snapshotOf(x, room - text.length).text };
}

// ---- the write: only from a document the drawer can read whole, and proved by a fresh read ----

/** What the drawer can write: the documents it understands. `ranges`: canonical IPv4 CIDR (parseIps). */
export type Want = { kind: 'anyone' } | { kind: 'private' } | { kind: 'myIp'; ip: string } | { kind: 'ips'; ranges: string[] };
/** One IPv4 address (the only kind an access rule can take for Only my IP). */
export const V4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** The whole document to PUT for `want`, or null when the drawer must not write: the current document is not one
 *  of its own three (anything set elsewhere would be lost: groups, grants, hooks, the proxy off, any project
 *  rule), it names no project, or the address is not one IPv4 address. The stored enable_proxy is kept as is
 *  (unset stays unset). Never a credential: the three documents carry none. */
export function bodyFor(r: AccessRules, mode: AccessMode, want: Want, container: string): Record<string, unknown> | null {
  // The people-and-keys document may hold many groups: every one is the drawer's own (peopleOf), so none is lost.
  // "Only these IPs" likewise: every group is one of its ranges (ipsOf), shown in the list the person edits.
  if (mode.kind === 'advanced' || r.hooks > 0 || r.proxyOff || (mode.kind !== 'people' && mode.kind !== 'ips' && (r.groups.length > 1 || r.grants.length > 1)) || !r.project) return null;
  if (!/^[0-9a-f]{24}$/.test(container)) return null;
  if (want.kind === 'myIp' && !V4.test(want.ip)) return null;
  const head = { project: r.project, computer: container, ...(r.proxy === true ? { enable_proxy: true } : {}) };
  if (want.kind === 'ips') {
    const g = ipsGroups(r, want.ranges);
    return g ? { ...head, ...g, default: 'deny' } : null;
  }
  if (want.kind === 'myIp') {
    // '*' never covers logs at the edge, so the drawer's own rule names logs too.
    return { ...head, groups: { [MY_IP_GROUP]: { type: 'ip', range: `${want.ip}/32` } }, permissions: { [MY_IP_GROUP]: { '*': true, logs: true } }, default: 'deny' };
  }
  return { ...head, groups: {}, permissions: {}, default: want.kind === 'anyone' ? 'allow' : 'deny' };
}

/** One write's variables (data.ts `access`): the computer, what was asked, the version it was made against and
 *  the whole document (bodyFor). */
export interface AccessWrite {
  id: string;
  want: Want;
  from: number;
  body: Record<string, unknown>;
}

/** The held write's identity: the computer, what was asked, and the version it was made against. */
/** The computer's own stored document (proxy_permissions_computer_state): missing (none: it follows only its
 *  project), default (one that changes nothing), applied (one with rules), invalid (unreadable, applies nothing),
 *  unknown (the API could not check). Undefined: an answer without the field (an older API). */
export type OwnState = 'missing' | 'default' | 'applied' | 'invalid' | 'unknown';
export function ownStateOf(v: unknown): OwnState | undefined {
  return v === 'missing' || v === 'default' || v === 'applied' || v === 'invalid' || v === 'unknown' ? v : undefined;
}

/** "Use only the project's rules": DELETE the computer's own document, If-Match the version read. */
export interface ClearWrite {
  id: string;
  from: number;
}

/** What a fresh read-back proves about a sent clear (reads: accessRules, accessOwn, accessScope). Only a state that
 *  reads 'missing' proves it: no document of its own is stored now. Anything else proves nothing and the change stays
 *  held, a newer version included: core reads the two in parallel, so a present state may have been read before our
 *  own DELETE committed (the reads are ordered: never a terminal "moved"). */
export function clearVerdict(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const i = (identity ?? {}) as { computer?: unknown; from?: unknown; clear?: unknown };
  if (typeof i.computer !== 'string' || typeof i.from !== 'number' || i.clear !== true) return undefined;
  let own: unknown;
  for (const a of answers[1] ?? []) {
    const one = (a as Record<string, unknown> | null)?.[i.computer];
    if (one !== undefined) own = one;
  }
  return own === 'missing' ? 'applied' : undefined;
}

/** After a clear that is still held: what the fresh reads show (Check again's line). 'stillThere' when the computer
 *  keeps a document at the version the DELETE was sent on, 'newer' for any other version (written after the send,
 *  a document made again after a delete included, or ours raced the read: never said as definite). */
export function clearHeldLine(from: number, version: number | undefined, own: OwnState | undefined): 'stillThere' | 'newer' | null {
  if (own !== 'default' && own !== 'applied') return null;
  if (version === undefined) return null;
  return version === from ? 'stillThere' : 'newer';
}

export interface WriteIdentity {
  computer: string;
  want: Want['kind'];
  ip?: string;
  /** "Only these IPs": the ranges sent, sorted. */
  ips?: string[];
  from: number;
}

/** A held write's ranges, when its identity carries a list of strings. */
export function heldRanges(v: unknown): string[] | null {
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null;
}

/** The rules read as what a write asked for: the same choice, and for the two address choices the same address or
 *  exactly the same set of ranges (one more or one fewer is not what was asked). */
export function readsAs(m: AccessMode, want: { kind: string; ip?: string | undefined; ips?: readonly string[] | null | undefined }): boolean {
  if (m.kind !== want.kind) return false;
  if (m.kind === 'myIp') return m.ip === want.ip;
  if (m.kind === 'ips') return !!want.ips && sameRanges(m.entries.map((e) => e.range), want.ips);
  return true;
}

/** What a fresh read of the access rules proves about a held write (If-Match makes it apply at most once, and
 *  only over version `from`):
 *  - the version is still `from`: nothing yet (undefined). A lost PUT may still be on its way, and the API takes it
 *    while the stored version is `from`; a read does not stop it, so it stays held until the version moves;
 *  - a newer version that is what was asked: 'applied';
 *  - a newer version that is something else: changed elsewhere, so it can never apply now ('not_applied');
 *  - no fresh document for this computer (or an older version): proves nothing (undefined). */
export function writeVerdict(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | 'not_applied' | undefined {
  const i = (identity ?? {}) as Partial<WriteIdentity>;
  if (typeof i.computer !== 'string' || typeof i.from !== 'number') return undefined;
  let r: AccessRules | null | undefined;
  for (const a of answers[0] ?? []) {
    const one = (a as Record<string, AccessRules | null> | null)?.[i.computer];
    if (one) r = one;
  }
  if (!r || r.version < i.from) return undefined;
  if (r.version === i.from) return undefined;
  if (typeof i.want !== 'string') return 'not_applied';
  return readsAs(modeOf(r, 'no'), { kind: i.want, ip: i.ip, ips: heldRanges(i.ips) }) ? 'applied' : 'not_applied';
}
