// Computer firewall: the pure rules behind the Network tab's Firewall section.
//
// The Hoody API keeps a computer's rules as two lists, inbound (ingress)
// and outbound (egress). A rule has no id: a delete or an on/off switch names the rule by its fields and the host
// acts on the first rule that matches them, so the page always sends every field of the rule it shows. There is no
// edit route: an edit adds the new rule, then deletes the old one. An add of a rule that is already there answers
// 200 with `duplicate: true`, so adding never makes a second copy.
//
// How the host applies rules (the API's own words): drop (Block) and reject (Refuse) rules apply before allow rules
// whatever their order, and traffic no rule matches is allowed in both directions. Order therefore never matters,
// and allow rules alone restrict nothing; the presets are built from blocks for that reason.
import { ASK_CONTEXT_MARK, ASK_MAX_TEXT, askPlain, cleanAgentText, makeT, scrubSecrets, type Translate } from '@kit';
import { hasSecretRun, hideSecretRuns, maskSeenIds } from './access.logic';
import strings from './Firewall.strings.en.json';

export type Direction = 'ingress' | 'egress';
export type Action = 'allow' | 'reject' | 'drop';
export type Protocol = 'tcp' | 'udp' | 'icmp4';
export type RuleState = 'enabled' | 'disabled';
type T = Translate<typeof strings>;

/** One rule as the API lists it (wire field names), with the list it came from. */
export interface FwRule {
  direction: Direction;
  action: Action;
  protocol: Protocol;
  description: string;
  destination_port?: string;
  source?: string;
  destination?: string;
  source_port?: string;
  state: RuleState;
  icmp_type?: string;
  icmp_code?: string;
}

/** A computer's firewall as read. `unreadable`: rules the page could not read (shown as a count, never dropped
 *  silently). The gauge numbers are null when the answer left them out. */
export interface FwList {
  computer: string;
  ingress: FwRule[];
  egress: FwRule[];
  unreadable: number;
  /** The same count per direction: a direction with an unreadable rule never reads as "no rules", and no delete or
   *  switch is judged in it (where that rule sits in the host's order is unknown). */
  unreadableIn: number;
  unreadableOut: number;
  count: number | null;
  maxRules: number | null;
  bytes: number | null;
  maxBytes: number | null;
}

const ACTIONS: readonly Action[] = ['allow', 'reject', 'drop'];
const PROTOCOLS: readonly Protocol[] = ['tcp', 'udp', 'icmp4'];
const TEXT_FIELDS = ['destination_port', 'source', 'destination', 'source_port', 'icmp_type', 'icmp_code'] as const;
type TextField = (typeof TEXT_FIELDS)[number];

const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Comma lists the way the host stores them: items trimmed, no empty items, joined by ','. */
export const tidyList = (s: string): string =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .join(',');

function ruleOf(raw: unknown, direction: Direction): FwRule | null {
  const r = obj(raw);
  if (!r) return null;
  if (!ACTIONS.includes(r.action as Action) || !PROTOCOLS.includes(r.protocol as Protocol) || typeof r.description !== 'string') return null;
  if (r.state !== undefined && r.state !== 'enabled' && r.state !== 'disabled') return null;
  const out: FwRule = { direction, action: r.action as Action, protocol: r.protocol as Protocol, description: r.description, state: (r.state as RuleState | undefined) ?? 'enabled' };
  for (const k of TEXT_FIELDS) {
    const v = r[k];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v !== 'string' && typeof v !== 'number') return null;
    out[k] = String(v);
  }
  return out;
}

/** GET /computers/:id/firewall/rules → the page's shape, or null when it does not hold both lists (unreadable,
 *  never "no rules"). */
export function listOf(raw: unknown, computer: string): FwList | null {
  const d = obj(obj(raw)?.data);
  if (!d || !Array.isArray(d.ingress) || !Array.isArray(d.egress)) return null;
  const bad = { ingress: 0, egress: 0 };
  const take = (xs: unknown[], dir: Direction) =>
    xs.flatMap((x) => {
      const r = ruleOf(x, dir);
      if (!r) bad[dir]++;
      return r ? [r] : [];
    });
  const ingress = take(d.ingress, 'ingress');
  const egress = take(d.egress, 'egress');
  return { computer, ingress, egress, unreadable: bad.ingress + bad.egress, unreadableIn: bad.ingress, unreadableOut: bad.egress, count: num(d.rule_count), maxRules: num(d.max_rules), bytes: num(d.byte_count), maxBytes: num(d.max_bytes) };
}

// Only the all-addresses range, or no address at all, is anywhere: a bare 0.0.0.0 is one address.
const ANY = new Set(['0.0.0.0/0', '']);
const addressesOf = (r: Pick<FwRule, 'direction' | 'source' | 'destination'>): string => (r.direction === 'ingress' ? r.source : r.destination) ?? '';
const spaced = (list: string) => tidyList(list).split(',').join(', ');

/** One rule as table cells (the Firewall rules table): the verb, what it matches ("TCP port 443", "ping"), the other end
 *  ("anywhere" or the addresses) and the source ports, if any. The same words as ruleSentence, split. */
export function ruleParts(r: FwRule, t: T): { verb: string; what: string; where: string; sourcePorts: string | null } {
  let what: string;
  if (r.protocol === 'icmp4') {
    what = r.icmp_type === undefined ? t('fw.icmp.all') : r.icmp_type === '8' && (r.icmp_code === undefined || r.icmp_code === '0') ? t('fw.icmp.ping') : r.icmp_code === undefined ? t('fw.icmp.type', { type: r.icmp_type }) : t('fw.icmp.typeCode', { type: r.icmp_type, code: r.icmp_code });
  } else {
    const ports = r.destination_port ? tidyList(r.destination_port) : '';
    const portText = !ports ? t('fw.port.all') : /^\d+$/.test(ports) ? t('fw.port.one', { ports }) : t('fw.port.many', { ports: spaced(ports) });
    what = `${t(r.protocol === 'tcp' ? 'fw.proto.tcp' : 'fw.proto.udp')} ${portText}`;
  }
  const a = tidyList(addressesOf(r));
  return { verb: t(`fw.verb.${r.action}`), what, where: ANY.has(a) ? t('fw.anywhere') : spaced(a), sourcePorts: r.source_port ? spaced(r.source_port) : null };
}

/** One rule in words: "Allow TCP port 443 from anywhere", "Block ping to 10.0.0.0/8". */
export function ruleSentence(r: FwRule, t: T): string {
  const p = ruleParts(r, t);
  const sentence = t('fw.sentence', { verb: p.verb, what: p.what, where: t(r.direction === 'ingress' ? 'fw.from' : 'fw.to', { where: p.where }) });
  return p.sourcePorts ? `${sentence} ${t('fw.sourcePorts', { ports: p.sourcePorts })}` : sentence;
}

// ── the form ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface FwForm {
  direction: Direction;
  action: Action;
  protocol: Protocol;
  description: string;
  /** destination_port (TCP/UDP). */
  ports: string;
  /** source (inbound) or destination (outbound); empty is anywhere. */
  addresses: string;
  sourcePorts: string;
  icmpType: string;
  icmpCode: string;
  enabled: boolean;
}
export type FwField = 'description' | 'ports' | 'addresses' | 'sourcePorts' | 'icmpType' | 'icmpCode';
export type FwProblem = 'needed' | 'bad' | 'long' | 'needsType';

export const blankForm = (direction: Direction): FwForm => ({ direction, action: 'drop', protocol: 'tcp', description: '', ports: '', addresses: '', sourcePorts: '', icmpType: '', icmpCode: '', enabled: true });

/** The Hoody API's length bounds. */
export const MAX = { description: 255, addresses: 512, ports: 64, icmp: 8 } as const;

/** The Hoody API's checks: ports 1-65535, a range low-high, lists by comma. */
export function parsePorts(input: string): Array<readonly [number, number]> | null {
  const spans: Array<readonly [number, number]> = [];
  for (const item of input.split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(item.trim());
    if (!m) return null;
    const start = Number(m[1]);
    const end = m[2] === undefined ? start : Number(m[2]);
    if (start < 1 || end > 65535) return null;
    if (m[2] !== undefined && start >= end) return null;
    spans.push([start, end]);
  }
  return spans;
}
const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4_OR_CIDR = new RegExp(`^${OCTET}(?:\\.${OCTET}){3}(?:/(\\d{1,2}))?$`);
/** Comma-separated IPv4 addresses or CIDR ranges (the API's isValidIPv4List). */
export const validAddresses = (input: string): boolean =>
  input.split(',').every((item) => {
    const m = IPV4_OR_CIDR.exec(item.trim());
    return m !== null && (m[1] === undefined || Number(m[1]) <= 32);
  });
const validIcmp = (s: string) => /^\d+$/.test(s) && Number(s) <= 255;

/** Every field's first problem. Empty optional fields are fine; ports are required for TCP and UDP. */
export function formProblems(f: FwForm): Partial<Record<FwField, FwProblem>> {
  const p: Partial<Record<FwField, FwProblem>> = {};
  const desc = f.description.trim();
  if (!desc) p.description = 'needed';
  else if (desc.length > MAX.description) p.description = 'long';
  if (f.protocol !== 'icmp4') {
    const ports = tidyList(f.ports);
    if (!ports) p.ports = 'needed';
    else if (ports.length > MAX.ports) p.ports = 'long';
    else if (!parsePorts(ports)) p.ports = 'bad';
    const sp = tidyList(f.sourcePorts);
    if (sp && sp.length > MAX.ports) p.sourcePorts = 'long';
    else if (sp && !parsePorts(sp)) p.sourcePorts = 'bad';
  } else {
    const ty = f.icmpType.trim();
    const co = f.icmpCode.trim();
    if (ty && (ty.length > MAX.icmp || !validIcmp(ty))) p.icmpType = 'bad';
    if (co && (co.length > MAX.icmp || !validIcmp(co))) p.icmpCode = 'bad';
    else if (co && !ty) p.icmpCode = 'needsType';
  }
  const a = tidyList(f.addresses);
  if (a && a.length > MAX.addresses) p.addresses = 'long';
  else if (a && !validAddresses(a)) p.addresses = 'bad';
  return p;
}
export const formReady = (f: FwForm): boolean => Object.keys(formProblems(f)).length === 0;

/** The add body: only the fields the protocol takes, lists tidied, anywhere left out. */
export function bodyOf(f: FwForm): Record<string, string> {
  const b: Record<string, string> = { action: f.action, protocol: f.protocol, description: f.description.trim() };
  if (f.protocol !== 'icmp4') {
    b.destination_port = tidyList(f.ports);
    const sp = tidyList(f.sourcePorts);
    if (sp) b.source_port = sp;
  } else {
    if (f.icmpType.trim()) b.icmp_type = f.icmpType.trim();
    if (f.icmpType.trim() && f.icmpCode.trim()) b.icmp_code = f.icmpCode.trim();
  }
  const a = tidyList(f.addresses);
  if (a) b[f.direction === 'ingress' ? 'source' : 'destination'] = a;
  b.state = f.enabled ? 'enabled' : 'disabled';
  return b;
}
/** The rule an add of this form makes. */
export const ruleOfForm = (f: FwForm): FwRule => ({ direction: f.direction, ...(bodyOf(f) as Omit<FwRule, 'direction'>) });

/** A shown rule back into the form (an edit starts from it). */
export const formOf = (r: FwRule): FwForm => ({
  direction: r.direction,
  action: r.action,
  protocol: r.protocol,
  description: r.description,
  ports: r.destination_port ?? '',
  // Kept as listed (0.0.0.0/0 too): an empty field would send no address, a different rule to the host.
  addresses: addressesOf(r),
  sourcePorts: r.source_port ?? '',
  icmpType: r.icmp_type ?? '',
  icmpCode: r.icmp_code ?? '',
  enabled: r.state === 'enabled',
});

/** A delete or on/off filter: every field of the rule as listed, state included. The host's first match is this rule
 *  only when matchesOf says so (an unsent field matches anything there). Never `all`, never a field the direction does
 *  not have (the API refuses those: FIREWALL_UNKNOWN_FILTER). An on/off switch overwrites `state` with the new one,
 *  which the host does not match on (the host firewall script's toggle criteria). */
export function matchBodyOf(r: FwRule): Record<string, string> {
  const f: Record<string, string> = { action: r.action, protocol: r.protocol, description: r.description };
  for (const k of TEXT_FIELDS) {
    if (r[k] === undefined) continue;
    if (k === 'source' && r.direction !== 'ingress') continue;
    if (k === 'destination' && r.direction !== 'egress') continue;
    f[k] = r[k] as string;
  }
  f.state = r.state;
  return f;
}

/** What the change lock is keyed on: the rule's shape, tidied (two spellings of one rule share a lock). Never used
 *  to find a rule or prove a change: the API and host compare fields literally, so those use exactKey/shapeKey. */
export function ruleKey(r: FwRule): string {
  const tidy = (k: TextField) => (r[k] === undefined ? '' : tidyList(r[k] as string));
  return JSON.stringify([r.direction, r.action, r.protocol, r.description.trim(), tidy('destination_port'), r.direction === 'ingress' ? tidy('source') : tidy('destination'), tidy('source_port'), tidy('icmp_type'), tidy('icmp_code')]);
}

/** A rule's literal identity, state included, as the API and host compare it (field for field, untrimmed): the API
 *  refuses a second rule with the same exact key, so it names one rule in a list. */
export const exactKey = (r: FwRule): string => JSON.stringify([r.direction, Object.entries(matchBodyOf(r)).sort(([a], [b]) => (a < b ? -1 : 1))]);
/** The same literal identity without the state: what an on/off switch matches on. */
export const shapeKey = (r: FwRule): string => exactKey({ ...r, state: 'enabled' });

// ── lock-out ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** The TCP ports the Hoody kits (terminal, files and the others) are reached on inside a computer: the Hoody API's
 *  defaults. The edge reaches every kit over these, so a block
 *  on one cuts that kit off. A host may override them; the API's own warning after an add names the real ones. */
export const KIT_PORTS: readonly number[] = [4, 5, 44, 45, 46, 48, 50, 55, 59, 60, 61, 74, 75, 76, 77, 78, 3971, 3998, 3999, 23333];
export const SSH_PORT = 22;
const GUARDED = [...KIT_PORTS].sort((a, b) => a - b);

/** The ports this rule, once on, would block among those given; every one when the rule names no port. */
function blockedOf(f: FwForm, ports: readonly number[]): number[] {
  if (!f.enabled || f.direction !== 'ingress' || f.action === 'allow' || f.protocol !== 'tcp') return [];
  // No port at all: a rule the host holds without one (older rules) blocks every TCP port. A form cannot be sent
  // without ports, so this only ever judges an existing rule being turned on.
  if (tidyList(f.ports) === '') return [...ports];
  const spans = parsePorts(tidyList(f.ports));
  if (!spans) return [];
  return ports.filter((p) => spans.some(([a, b]) => p >= a && p <= b));
}

/** The Hoody kit ports this rule, once on, would block; [] when none. The edge reaches the kits over the computer's
 *  network, through this firewall, so blocking one cuts that kit off from the Hub (typed confirmation). The source
 *  is not considered: the edge reaches the computer from addresses the page cannot know. */
export function cutsOff(f: FwForm): number[] {
  return blockedOf(f, GUARDED);
}

/** Whether this rule, once on, blocks inbound TCP 22. SSH from Hoody keeps working (it reaches the computer through
 *  the host's own exec channel, never through this firewall), so this is a plain note, never a typed confirm. */
export function blocksSsh(f: FwForm): boolean {
  return blockedOf(f, [SSH_PORT]).length > 0;
}

// ── presets ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type PresetId = 'inboundExceptWeb' | 'privateOut' | 'addresses' | 'mail';
export const PRESETS: readonly PresetId[] = ['inboundExceptWeb', 'privateOut', 'addresses', 'mail'];
/** The private IPv4 ranges (RFC 1918). */
export const PRIVATE_RANGES = '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16';
const st = makeT(strings);

/** The spans of 1..max not in `keep` (sorted, inclusive). */
export function complementSpans(keep: readonly number[], max = 65535): Array<[number, number]> {
  const k = [...new Set(keep)].filter((p) => p >= 1 && p <= max).sort((a, b) => a - b);
  const out: Array<[number, number]> = [];
  let next = 1;
  for (const p of k) {
    if (p > next) out.push([next, p - 1]);
    next = p + 1;
  }
  if (next <= max) out.push([next, max]);
  return out;
}

/** Port spans as port lists of at most `limit` characters each (one rule each). */
function chunkSpans(spans: ReadonlyArray<readonly [number, number]>, limit: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const [a, b] of spans) {
    const item = a === b ? String(a) : `${a}-${b}`;
    const next = cur ? `${cur},${item}` : item;
    if (next.length > limit && cur) {
      out.push(cur);
      cur = item;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

/** The rules a preset adds. `addresses` takes the list typed for "Block these addresses"; a bad or empty one gives
 *  no rule. */
export function presetRules(id: PresetId, input: { addresses?: string }): FwRule[] {
  if (id === 'mail') return [{ direction: 'egress', action: 'drop', protocol: 'tcp', description: st('fw.preset.mail.desc'), destination_port: '25', state: 'enabled' }];
  // Every port but 53, so the computer can still look names up when its resolver sits on a private address.
  if (id === 'privateOut') return (['tcp', 'udp'] as const).map((protocol) => ({ direction: 'egress', action: 'drop', protocol, description: st('fw.preset.private.desc'), destination_port: '1-52,54-65535', destination: PRIVATE_RANGES, state: 'enabled' }));
  if (id === 'inboundExceptWeb') {
    const lists = chunkSpans(complementSpans([SSH_PORT, 80, 443, ...KIT_PORTS]), MAX.ports);
    return lists.map((ports, i) => ({ direction: 'ingress', action: 'drop', protocol: 'tcp', description: st('fw.preset.inbound.desc', { part: i + 1, parts: lists.length }), destination_port: ports, state: 'enabled' }));
  }
  const a = tidyList(input.addresses ?? '');
  if (!a || a.length > MAX.addresses || !validAddresses(a)) return [];
  return (['tcp', 'udp'] as const).map((protocol) => ({ direction: 'ingress', action: 'drop', protocol, description: st('fw.preset.addresses.desc'), destination_port: '1-65535', source: a, state: 'enabled' }));
}

// ── naming one rule ──────────────────────────────────────────────────────────────────────────────────────────────

/** The host deletes or switches the FIRST rule (in list order, that direction) whose fields equal every field sent,
 *  exactly (the host firewall script's match rule); a field not sent matches anything. So a rule without, say, a source is also
 *  matched by a rule that has one. A delete matches the state too; a switch does not (it sends the new state, which the
 *  host ignores when it picks the rule). hitsOf: the places of every rule this rule's body names, in list order. */
function hitsOf(list: readonly FwRule[], index: number, op: 'remove' | 'toggle'): number[] {
  const target = list[index];
  if (!target) return [];
  const body = matchBodyOf(target);
  if (op === 'toggle') delete body.state;
  const field = (r: FwRule, k: string) => (r as unknown as Record<string, unknown>)[k];
  return list.flatMap((r, i) => (r.direction === target.direction && Object.entries(body).every(([k, v]) => field(r, k) === v) ? [i] : []));
}
/** Before either the page counts the rules a body names: `others` how many besides this one, `first` whether this one
 *  is the first (the one the host would act on). */
export function matchesOf(list: readonly FwRule[], index: number, op: 'remove' | 'toggle'): { first: boolean; others: number } {
  const hits = hitsOf(list, index, op);
  return { first: hits.length > 0 && hits[0] === index, others: Math.max(0, hits.length - 1) };
}
/** The rule the host would delete (or switch) for this rule's fields: the first one matching every field sent; -1 for
 *  no rule at that place. */
export const hostPickOf = (list: readonly FwRule[], index: number, op: 'remove' | 'toggle'): number => hitsOf(list, index, op)[0] ?? -1;

// ── editing ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type EditPlan = { kind: 'none' } | { kind: 'toggle'; state: RuleState } | { kind: 'replace'; add: FwRule };

/** What saving an edit sends: nothing, one on/off switch, or the new rule added and then the old one deleted. */
export function editPlan(old: FwRule, f: FwForm): EditPlan {
  const next = ruleOfForm(f);
  if (ruleKey(next) === ruleKey(old)) return next.state === old.state ? { kind: 'none' } : { kind: 'toggle', state: next.state };
  return { kind: 'replace', add: next };
}

// ── proofs (C9: only a fresh read of that computer frees a held change) ────────────────────────────────────────────

type Answers = readonly (readonly unknown[])[];
const listsOf = (answers: Answers, computer: unknown): FwList[] =>
  typeof computer === 'string' && computer ? (answers[0] ?? []).filter((a): a is FwList => !!obj(a) && (a as FwList).computer === computer && Array.isArray((a as FwList).ingress)) : [];
const all = (l: FwList) => [...l.ingress, ...l.egress];
interface RuleIdentity { computer?: string; key?: string; shape?: string; from?: RuleState; state?: RuleState }
const readable = (ls: FwList[]) => ls.filter((l) => l.unreadable === 0);

/** An add: a read holding exactly that rule, state included. */
export const addProved = (identity: unknown, answers: Answers): 'applied' | undefined => {
  const i = (identity ?? {}) as RuleIdentity;
  return listsOf(answers, i.computer).some((l) => all(l).some((r) => exactKey(r) === i.key)) ? 'applied' : undefined;
};
/** A delete: a fully readable read without exactly that rule (absence is never read from an incomplete list). */
export const removeProved = (identity: unknown, answers: Answers): 'applied' | undefined => {
  const i = (identity ?? {}) as RuleIdentity;
  const ls = readable(listsOf(answers, i.computer));
  return ls.some((l) => !all(l).some((r) => exactKey(r) === i.key)) ? 'applied' : undefined;
};
/** An on/off switch: a fully readable read holding the rule in the new state and none of its shape in the old one.
 *  The page sends a switch only when no other rule shares the match (matchesOf 'toggle': others 0). */
export const toggleProved = (identity: unknown, answers: Answers): 'applied' | undefined => {
  const i = (identity ?? {}) as RuleIdentity;
  return readable(listsOf(answers, i.computer)).some((l) => all(l).some((r) => shapeKey(r) === i.shape && r.state === i.state) && !all(l).some((r) => shapeKey(r) === i.shape && r.state === i.from)) ? 'applied' : undefined;
};
/** A reset: a read with no rule left. */
export const resetProved = (identity: unknown, answers: Answers): 'applied' | undefined => {
  const i = (identity ?? {}) as RuleIdentity;
  return listsOf(answers, i.computer).some((l) => all(l).length === 0 && l.unreadable === 0) ? 'applied' : undefined;
};

// ── the Agent snapshot ───────────────────────────────────────────────────────────────────────────────────────────

const SNAP_MAX = 200;

/** What the Agent is given: the computer's name (never its id), how rules apply, and every rule in words and fields.
 *  The name and every rule field are read as text that may hold anything (a description is author text; the other
 *  fields are as read, unchecked): each is made one plain line (agentLine), the whole rule line then goes through
 *  agentSafe (anything that may be a password or key hidden, every 24-hex id shortened), and when that changed a line
 *  the snapshot says so, so the Agent reads the rules with its own tools before naming one. Rules past SNAP_MAX, or
 *  past `room` characters, are left out whole and counted, never cut silently. */
export function snapshotText(name: string, l: FwList, t: T, room = Infinity): string {
  return snapshotOf(name, l, t, room).text;
}
function snapshotOf(name: string, l: FwList, t: T, room: number): { text: string; listed: number; total: number } {
  const lines = [t('fw.snap.head', { name: agentName(name) })];
  // Room is kept for the closing lines (the cut, the unreadable count and the hidden-text note), so they always fit.
  const tail = 2 * (t('fw.snap.cut', { count: 9999 }).length + t('fw.snap.unreadable', { count: 9999 }).length + t('fw.snap.hidden').length);
  let hid = false;
  let used = lines[0]!.length;
  const rules = all(l);
  if (l.count !== null && l.maxRules !== null) lines.push(t('fw.snap.count', { count: l.count, max: l.maxRules }));
  if (rules.length === 0 && l.unreadable === 0) lines.push(t('fw.snap.none'));
  const push = (line: string) => {
    lines.push(line);
    used += line.length + 1;
  };
  let listed = 0;
  for (const dir of ['ingress', 'egress'] as const) {
    const rs = l[dir];
    if (!rs.length) continue;
    const head = t(dir === 'ingress' ? 'fw.snap.inbound' : 'fw.snap.outbound');
    for (const [i, r] of rs.entries()) {
      const off = r.state === 'disabled' ? ` ${t('fw.snap.off')}` : '';
      // Every field as one line first (the Hub's key patterns hidden in the text as read, then no control or lone
      // surrogate that JSON would write as an escape splitting a run), then the whole line made safe: what is checked
      // is the text the Agent gets. `plain` is the same line with nothing hidden, for the note.
      const lineOf = (x: FwRule) => `- ${ruleSentence(x, t)}${off} ${JSON.stringify(matchBodyOf(x))}`;
      const plain = lineOf(agentRule(r, oneLine));
      const line = agentSafe(lineOf(agentRule(r, agentLine)));
      const need = line.length + 1 + (i === 0 ? head.length + 1 : 0);
      if (listed >= SNAP_MAX || used + need + tail > room) break;
      if (i === 0) push(head);
      push(line);
      listed++;
      if (line !== plain) hid = true;
    }
  }
  if (rules.length > listed) lines.push(t('fw.snap.cut', { count: rules.length - listed }));
  if (l.unreadable > 0) lines.push(t('fw.snap.unreadable', { count: l.unreadable }));
  if (hid) lines.push(t('fw.snap.hidden'));
  return { text: lines.join('\n'), listed, total: rules.length };
}

/** Text as the Agent may read it: the Hub's key patterns hidden (kit scrubSecrets, which reads
 *  past what shows nothing), then each run the Access drawer's Tell refuses (access.logic hideSecretRuns), then every
 *  24-hex id shortened (maskSeenIds). Both read the text as a reader sees it, so a joiner, a mark or a variation
 *  selector inside a key or an id never hides it; everything else is left as written. */
export function agentSafe(s: string): string {
  return maskSeenIds(hideSecretRuns(scrubSecrets(s)));
}
/** One line: the kit's Agent-text clean-up (cleanAgentText: escape sequences whole, controls and bidi overrides out,
 *  CR and the Unicode line separators as line breaks), then tabs and line breaks as one space and no lone surrogate
 *  left: nothing JSON would write as an escape ("\u0001", "\ud800") that splits a run in what the Agent reads. */
const oneLine = (s: string): string => cleanAgentText(s).text.replace(/[\t\n]+/g, ' ').replace(/\p{Cs}/gu, '');
/** oneLine, with the Hub's key patterns hidden first in the text as read (kit scrubSecrets): the clean-up can take
 *  out what stood between a word and a key ("foo\u0001sk-..."), and a key glued to a word is no longer one. */
const agentLine = (s: string): string => oneLine(scrubSecrets(s));
/** The rule with every text field as one line (`line`: agentLine, or oneLine for the line with nothing hidden). */
function agentRule(r: FwRule, line: (s: string) => string): FwRule {
  const flat: FwRule = { ...r, description: line(r.description) };
  for (const k of TEXT_FIELDS) if (r[k] !== undefined) flat[k] = line(r[k] as string);
  return flat;
}
/** The computer's name as the Agent reads it: one plain line, made safe like any other text (agentSafe). */
const agentName = (name: string): string => agentSafe(agentLine(name).trim());

// ── the Agent start ──────────────────────────────────────────────────────────────────────────────────────

/** What the section hands startAgentConversation: "Explain my firewall" (a fixed question) or "Tell the Agent what
 *  you want" (the person's words), with the snapshot and the guidance as context. The snapshot is sized so the whole
 *  message fits the Agent's limit (ASK_MAX_TEXT) and rules left out are counted; a request too long to carry the
 *  guidance and the rules whole comes back with fits: false and is never sent. */
export function agentStartOf(ask: { kind: 'explain' } | { kind: 'tell'; request: string }, name: string, l: FwList, t: T): { text: string; context: string; source: string; fits: boolean; secret: boolean } {
  // The computer's name is text that may hold anything: made safe like a description (agentName).
  const shown = agentName(name);
  // A Tell that may hold a password or key (the Access drawer's rule, at any length, or a Hub key pattern) is refused
  // whole, never sent, not even masked: the Agent never needs one. It is checked as the kit sends it (askPlain, after
  // the kit's Agent-text clean-up: no escape sequence or control) and as a reader sees it (hasSecretRun, scrubSecrets),
  // and sent as the person wrote it with its ids shortened.
  const said = ask.kind === 'tell' ? cleanAgentText(askPlain(ask.request)).text.trim() : '';
  // The Hub's key patterns are also read in the request as typed: the clean-up and askPlain can take out what stood
  // between a word and a key, and a key glued to a word is no longer one.
  const secret = ask.kind === 'tell' && (hasSecretRun(said) || scrubSecrets(said) !== said || scrubSecrets(ask.request) !== ask.request);
  const text = ask.kind === 'explain' ? t('fw.agent.explainAsk', { name: shown }) : maskSeenIds(said);
  const guide = t(ask.kind === 'explain' ? 'fw.agent.explainGuide' : 'fw.agent.tellGuide', { name: shown });
  // Characters the engine counts are never more than UTF-16 units, so .length keeps this on the safe side.
  const room = ASK_MAX_TEXT - text.length - ASK_CONTEXT_MARK.length - guide.length - 2;
  const snap = snapshotOf(name, l, t, Math.max(room, 0));
  const context = `${guide}\n\n${snap.text}`;
  // The whole message must fit as built: the kit would otherwise clip the context (the guidance first, then the
  // rules), and a request sent without its rules is worse than a request refused. `fits` is false then.
  // A snapshot that lists none of the rules there are would leave the Agent nothing to read: refused too.
  const fits = !secret && text !== '' && room > 0 && (snap.total === 0 || snap.listed > 0) && text.length + ASK_CONTEXT_MARK.length + context.length <= ASK_MAX_TEXT;
  return { text, context, source: t('fw.title'), fits, secret };
}

/** One plain line per direction, from the rules alone (no AI), so an Agent answer is never the only summary. */
export function summaryOf(l: FwList, t: T): string {
  const part = (dir: 'ingress' | 'egress') => {
    const rs = l[dir];
    const bad = dir === 'ingress' ? l.unreadableIn : l.unreadableOut;
    const label = t(dir === 'ingress' ? 'fw.sum.in' : 'fw.sum.out');
    if (bad > 0) return `${label} ${t('fw.sum.unknown', { count: bad })}`;
    if (!rs.length) return `${label} ${t('fw.sum.none')}`;
    const on = rs.filter((r) => r.state !== 'disabled');
    const bits = [];
    const blocks = on.filter((r) => r.action !== 'allow').length;
    const allows = on.length - blocks;
    if (blocks) bits.push(t('fw.sum.blocks', { count: blocks }));
    if (allows) bits.push(t('fw.sum.allows', { count: allows }));
    if (rs.length - on.length) bits.push(t('fw.sum.off', { count: rs.length - on.length }));
    return `${label} ${bits.join(', ')}.`;
  };
  return `${part('ingress')} ${part('egress')}`;
}
