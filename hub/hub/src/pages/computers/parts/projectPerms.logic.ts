// Project permissions: what a project passes to every computer in it, its
// people (members) and its access rules, as pure functions the Permissions drawer, the Projects list and the
// rules, people writes and computers tab share. No request here and no second rules parser: access rules are
// read with access.logic.ts (rulesFrom, plainOpen, summaryOf).
//
// Key sessions: a shared-access (token) session sends no project-wide or member request at all,
// whatever its leaves, and says why; callers decide it with useCan('account'), which is exactly "not a token session"
// (core token.ts can: 'account' is never part of shared access), never with a route's own leaf.
//
// Levels are the API's `read < edit < delete` (the API's own order); the owner is above all
// three. What each level allows is one literal table (LEVEL_LINES): the level help, the "what each level can do"
// list and lost() all read it, so they never disagree.
import { heldRanges, ipsGroups, modeOf, MY_IP_GROUP, plainOpen, readsAs, shownRange, summaryOf, V4, type AccessRules, type SumLine } from './access.logic';
import type { Computer } from '../types';

export type Level = 'read' | 'edit' | 'delete';
export const LEVELS: readonly Level[] = ['read', 'edit', 'delete'];
const RANK: Record<Level, number> = { read: 1, edit: 2, delete: 3 };

/** What each level adds over the one below (string keys), in order: a level can do its own lines and every lower one's. */
export const LEVEL_LINES: Readonly<Record<Level, readonly string[]>> = {
  read: ['pp.can.see', 'pp.can.network', 'pp.can.snapshotList'],
  edit: ['pp.can.power', 'pp.can.workspace', 'pp.can.snapshots', 'pp.can.networkChange', 'pp.can.rename', 'pp.can.peopleUpToEdit'],
  delete: ['pp.can.rules', 'pp.can.peopleAll', 'pp.can.deleteAll'],
};

/** The tags a level carries (least privilege made visible): Work on opens a shell; Full control shows
 *  secrets, deletes everything and gives others Full control. */
export const LEVEL_TAGS: Readonly<Record<Level, readonly string[]>> = {
  read: [],
  edit: ['pp.tag.shell'],
  delete: ['pp.tag.shell', 'pp.tag.secrets', 'pp.tag.deleteAll', 'pp.tag.grantsAll'],
};

/** Every line a level allows, lowest level's first. */
export function linesOf(level: Level): string[] {
  return LEVELS.filter((l) => RANK[l] <= RANK[level]).flatMap((l) => LEVEL_LINES[l]);
}

/** The lines a change from `from` to `to` takes away (empty for a raise or no change). */
export function lost(from: Level, to: Level): string[] {
  return LEVELS.filter((l) => RANK[l] > RANK[to] && RANK[l] <= RANK[from]).flatMap((l) => LEVEL_LINES[l]);
}

export interface Member {
  /** The membership row's id (a later change or removal names it). Never shown. */
  id: string;
  /** The member's account id. Never shown (idText ends only, where at all). */
  accountId: string;
  /** alias, else username; '' when the answer has neither (shown as the unnamed text, never the id). */
  name: string;
  /** The account's username ('' when the answer has none): what a held add by username is matched against. */
  username: string;
  level: Level;
  /** The row is the project owner's own (the API does not refuse one): shown as Owner, never counted as a person. */
  owner: boolean;
}

export interface Roster {
  members: Member[];
  /** Rows with a level the Hub does not know: counted in a line, never shown as a level. */
  unknown: number;
  /** The API's total, when it says; more than the rows read means the list was cut (the counts say "at least"). */
  total: number | null;
}

const isLevel = (v: unknown): v is Level => v === 'read' || v === 'edit' || v === 'delete';
const rec = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined);
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The roster answer (`GET /projects/:pid/permissions`: data.permissions rows with user {id, username, alias}, and
 *  data.pagination.total) as members. null for a body without a rows list: a read error, never "nobody". `owner`:
 *  the project's owner account when known; its row, if any, is marked. */
export function membersFrom(answer: unknown, owner?: string): Roster | null {
  const data = rec(rec(answer)?.data);
  const rows = data?.permissions;
  if (!Array.isArray(rows)) return null;
  const members: Member[] = [];
  let unknown = 0;
  for (const r of rows) {
    const x = rec(r);
    const user = rec(x?.user);
    const level = x?.permission_level;
    if (!isLevel(level)) {
      unknown++;
      continue;
    }
    const accountId = text(x?.user_id) || text(user?.id);
    members.push({ id: text(x?.id), accountId, name: text(user?.alias) || text(user?.username), username: text(user?.username), level, owner: !!owner && accountId === owner });
  }
  const t = rec(data?.pagination)?.total;
  return { members, unknown, total: typeof t === 'number' && Number.isFinite(t) ? t : null };
}

/** The people the project is shared with: every row but an owner's own. */
export function peopleOf(r: Roster): Member[] {
  return r.members.filter((m) => !m.owner);
}

/** The list was read whole (its total known and every row in it, none of an unknown level): counts are exact. An
 *  answer without a total proves nothing about the rows it did not send (C9). */
export function rosterWhole(r: Roster): boolean {
  return r.unknown === 0 && r.total !== null && r.total <= r.members.length;
}

export type Mine = 'owner' | Level | 'unknown';

/** The caller's place on a project: owner only when the project's owner is known and is the caller; else the caller's
 *  own row's level; else unknown (no member-only behaviour, the owner's actions). */
export function myLevel(project: { owner?: string }, roster: Roster | null | undefined, uid: string | null | undefined): Mine {
  if (!project.owner || !uid) return 'unknown';
  if (project.owner === uid) return 'owner';
  const own = roster?.members.find((m) => m.accountId === uid && !m.owner);
  return own ? own.level : 'unknown';
}

/** The project is someone else's (its owner is known and is not the caller): the Shared with you tag. */
export function sharedWithMe(project: { owner?: string }, uid: string | null | undefined): boolean {
  return !!project.owner && !!uid && project.owner !== uid;
}

/** The levels the caller may give or set (the API's own rule: nobody grants, sets or
 *  removes above their own level; edit and above may change people at all; the owner counts as delete). */
export function levelsFor(mine: Mine): Level[] {
  if (mine === 'owner') return [...LEVELS];
  if (mine === 'unknown' || mine === 'read') return [];
  return LEVELS.filter((l) => RANK[l] <= RANK[mine]);
}

/** The project actions a caller's place allows (the API's own rule: rename
 *  needs Work on, delete needs Full control): See offers neither, Work on Rename, Full control both. The owner,
 *  and a place the Hub can't read, keep both actions, which the API still judges. Delete is one dialog for everyone
 *  it counts the project's computers, which a member may read too. */
export type ProjectActions = { rename: boolean; delete: boolean };
export function projectActions(mine: Mine): ProjectActions {
  if (mine === 'owner' || mine === 'unknown' || mine === 'delete') return { rename: true, delete: true };
  return { rename: mine === 'edit', delete: false };
}

// People writes: add one account, change a member's level,
// remove them. A membership row carries no version, so a write whose answer was lost can still land after any read:
// a read only says how the list reads now (heldNow), never whether the request went through.

/** What Add sends for the text typed: an account ID (24 hex) as user_id, anything else as a username (the API takes
 *  exactly one of them). */
export type AddTarget = { user_id: string } | { username: string };
const ACCOUNT_ID = /^[0-9a-f]{24}$/;
const USERNAME = /^[A-Za-z0-9_-]{1,100}$/;

/** The account the Add form names, or why it can't name another account (string keys). The caller's own account
 *  (by ID or username) and the owner's (by ID only: the owner's username is not known here, and the API may add it,
 *  201, whose row then shows as Owner) are refused before anything is sent. */
export function addTargetOf(typed: string, me: { id?: string | null; username?: string | null }, owner?: string): { target: AddTarget } | { problem: 'pp.add.bad' | 'pp.add.self' | 'pp.add.owner' } {
  const v = typed.trim();
  const id = v.toLowerCase();
  if (ACCOUNT_ID.test(id)) {
    if (me.id && id === me.id.toLowerCase()) return { problem: 'pp.add.self' };
    if (owner && id === owner.toLowerCase()) return { problem: 'pp.add.owner' };
    return { target: { user_id: id } };
  }
  if (!USERNAME.test(v)) return { problem: 'pp.add.bad' };
  if (me.username && v.toLowerCase() === me.username.toLowerCase()) return { problem: 'pp.add.self' };
  return { target: { username: v } };
}

/** What a held people write named (data.ts MemberHeldId): an add's username or user_id, a row's id and account. */
export interface HeldNames { username?: string; user_id?: string; mid?: string; account?: string }

/** A row the held write named, by any name it carried (only to say how the list reads now: the hold is per project,
 *  never per account). */
export function heldNames(h: HeldNames, m: Member): boolean {
  const acct = h.user_id ?? h.account;
  return (!!h.mid && m.id === h.mid) || (!!acct && m.accountId === acct) || (!!h.username && !!m.username && m.username.toLowerCase() === h.username.toLowerCase());
}

export type MemberOp = 'add' | 'set' | 'remove';

/** The page's words for a refused people write (string key), or null for the kit's own words. A 403 carries no code
 *  telling a platform account, a level ceiling or a realm scope apart, so each op has one refusal text. A 404 says
 *  only that what was named was not found: never who is or is not on the project, nor whether an
 *  account exists; any statement about the list comes from a fresh read of it. */
export function memberRefusal(op: MemberOp, status: number | undefined, code: string | undefined): string | null {
  if (op === 'add' && (status === 409 || code === 'PERMISSION_ALREADY_EXISTS')) return 'pp.add.exists';
  if (status === 404) return op === 'add' ? 'pp.add.notFound' : 'pp.member.notFound';
  if (status === 403) return op === 'add' ? 'pp.add.refused' : 'pp.member.refused';
  return null;
}

/** How the roster reads now for what a held write named, only from a list read whole: its level,
 *  the owner's own row (an add by username can name the owner) or absent. A list not read whole (a page failed, past
 *  the bound, no total, unknown levels) is cut, even when it shows the row: it states nothing about the member. */
export function heldNow(r: Roster, h: HeldNames): Level | 'owner' | 'absent' | 'cut' {
  if (!rosterWhole(r)) return 'cut';
  const row = r.members.find((m) => heldNames(h, m));
  if (row) return row.owner ? 'owner' : row.level;
  return 'absent';
}

export type PeopleFact = { key: 'pp.fact.onlyYou' } | { key: 'pp.fact.people'; count: number; atLeast: boolean } | { key: 'pp.fact.people.failed' } | { key: 'pp.fact.people.key' } | { key: 'pp.fact.people.uncounted' } | null;

/** The list's people fact: null while reading; the key text on a key session (nothing was read). */
export function peopleFact(r: Roster | null | 'failed' | 'key' | undefined): PeopleFact {
  if (r === 'key') return { key: 'pp.fact.people.key' };
  if (r === 'failed') return { key: 'pp.fact.people.failed' };
  if (!r) return null;
  const n = peopleOf(r).length;
  if (n === 0 && rosterWhole(r)) return { key: 'pp.fact.onlyYou' };
  // Nobody the Hub can name, but the list is not proved whole: never "Only you", never "at least 0".
  if (n === 0) return { key: 'pp.fact.people.uncounted' };
  return { key: 'pp.fact.people', count: n, atLeast: !rosterWhole(r) };
}

export type RulesFact = 'pp.fact.rules.set' | 'pp.fact.rules.none' | 'pp.fact.rules.failed' | 'pp.fact.rules.key' | 'pp.fact.rules.level';

/** The list's access-rules fact from the project's own document: the stored or default open document
 *  is "no access rules", it changes nothing on any computer. A project's hooks never run, so they make no rules.
 *  'level': the server refused the read (a member below Full control). */
export function projectFact(rules: AccessRules | null | 'failed' | 'key' | 'level'): RulesFact {
  if (rules === 'key') return 'pp.fact.rules.key';
  if (rules === 'level') return 'pp.fact.rules.level';
  if (rules === null || rules === 'failed') return 'pp.fact.rules.failed';
  return plainOpen({ ...rules, hooks: 0 }) && rules.proxy !== false ? 'pp.fact.rules.none' : 'pp.fact.rules.set';
}

/** How a failed project-rules read reads: 403 is the server's own refusal (not Full control), anything else failed.
 *  A framed page's refusal is a 403 too, but nothing was sent (core's FRAMED_ACTION_REFUSED): failed, with its own
 *  words, never a statement about the caller's level. */
export function rulesReadProblem(e: unknown): 'level' | 'failed' {
  const x = e as { status?: unknown; code?: unknown } | null;
  return x?.status === 403 && x.code !== 'FRAMED_ACTION_REFUSED' ? 'level' : 'failed';
}

/** The project document's summary: the computer drawer's sentences, as a project says them (no hooks line). */
export function projectSummary(rules: AccessRules): SumLine[] {
  return summaryOf(rules, 'no', 'project');
}

export type ProjectMode = 'none' | 'myIp' | 'ips' | 'private' | 'advanced';

/** Which choice a project document is, read by the computer drawer's own modeOf so the two never
 *  disagree: none = the open document; myIp / private = exactly what the Hub writes; ips = a list of address ranges,
 *  each allowed everything (access.logic.ts ipsOf); anything else (people or key groups, hooks, addresses off, any
 *  other rule set elsewhere) is advanced. */
export function projectMode(r: AccessRules): ProjectMode {
  const m = modeOf(r, 'no');
  return m.kind === 'anyone' ? 'none' : m.kind === 'myIp' || m.kind === 'ips' || m.kind === 'private' ? m.kind : 'advanced';
}

// Changing the project's rules: No project rules
// (the document removed), Only my IP or Private (the whole document written), each against the version read
// (If-Match: it applies at most once). Offered only over a document that is one of the three, so nothing set
// elsewhere is lost.

/** What the Access rules tab can write. */
export type ProjectWant = { kind: 'none' } | { kind: 'private' } | { kind: 'myIp'; ip: string } | { kind: 'ips'; ranges: string[] };

/** Who may change the project's rules: the owner and a Full control member. Unknown claims nothing. */
export function mayChangeRules(mine: Mine): boolean {
  return mine === 'owner' || mine === 'delete';
}

/** The whole document to PUT for Only my IP or Private, or null: No project rules is a DELETE (no document), the
 *  current document is not one of the three, the project id is not one, or the address is not one IPv4 address. The
 *  stored enable_proxy is kept as is (unset stays unset). Never a credential: the two documents carry none. */
export function projectBodyFor(r: AccessRules, want: ProjectWant, pid: string): Record<string, unknown> | null {
  if (want.kind === 'none' || projectMode(r) === 'advanced' || !/^[0-9a-f]{24}$/.test(pid)) return null;
  if (want.kind === 'myIp' && !V4.test(want.ip)) return null;
  const head = { project: pid, ...(r.proxy === true ? { enable_proxy: true } : {}) };
  if (want.kind === 'ips') {
    // Only these IPs: one group per range; a range the document already holds keeps its group's name (ipsGroups).
    const g = ipsGroups(r, want.ranges);
    return g ? { ...head, ...g, default: 'deny' } : null;
  }
  // '*' never covers logs at the edge, so the rule names logs too (as the computer drawer's own).
  if (want.kind === 'myIp') return { ...head, groups: { [MY_IP_GROUP]: { type: 'ip', range: `${want.ip}/32` } }, permissions: { [MY_IP_GROUP]: { '*': true, logs: true } }, default: 'deny' };
  return { ...head, groups: {}, permissions: {}, default: 'deny' };
}

/** The document reads as the choice (the open document is No project rules; Only my IP needs the same address). */
export function projectReadsAs(r: AccessRules, want: { kind: ProjectWant['kind']; ip?: string; ips?: readonly string[] | null }): boolean {
  const m = modeOf(r, 'no');
  if (want.kind === 'none') return m.kind === 'anyone';
  // Only these IPs needs exactly the same set of ranges (readsAs).
  return readsAs(m, want);
}

/** A held project-rules write's identity (data.ts projectRulesSet / projectRulesClear). */
export interface ProjectRulesIdentity {
  project: string;
  want: ProjectWant['kind'];
  ip?: string;
  /** Only these IPs: the ranges sent, sorted. */
  ips?: string[];
  from: number;
}

/** What a fresh read of the project's rules proves about a held write (If-Match makes it apply at most once, and only
 *  over version `from`; a removed document reads as the open one at the next version, the API's version floor):
 *  - still `from`, older, or no fresh document of this project: nothing yet (undefined), it may still be on its way;
 *  - a newer version that reads as asked: 'applied';
 *  - a newer version that reads otherwise: changed elsewhere, so it can never apply now ('not_applied'). */
export function projectWriteVerdict(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | 'not_applied' | undefined {
  const i = (identity ?? {}) as Partial<ProjectRulesIdentity>;
  if (typeof i.project !== 'string' || typeof i.from !== 'number' || (i.want !== 'none' && i.want !== 'myIp' && i.want !== 'ips' && i.want !== 'private')) return undefined;
  let r: AccessRules | undefined;
  for (const a of answers[0] ?? []) {
    const one = (a as Record<string, AccessRules | undefined> | null)?.[i.project];
    if (one) r = one;
  }
  if (!r || r.version <= i.from) return undefined;
  return projectReadsAs(r, { kind: i.want, ...(i.ip !== undefined ? { ip: i.ip } : {}), ips: heldRanges(i.ips) }) ? 'applied' : 'not_applied';
}

/** One line of the confirm (a strings key and its values); `effect`: a key whose text fills its {{effect}}. */
export interface ConfirmLine {
  key: string;
  vars?: Record<string, string | number>;
  effect?: { key: string; vars?: Record<string, string> };
}

/** The confirm of a project-rules change: the chosen mode's line always first; then, when the caller could
 *  list the project's computers (`shown`, the owner), how many of those shown follow only the project (with the exact
 *  effect), keep rules of their own, or could not be told, each only when there are any; else (a member) that the Hub
 *  can't list them; then the lines every confirm carries. Never a promise for a computer with rules of its own. */
/** What a confirm of Only these IPs also says. `removed`: ranges the document holds now that the list leaves out.
 *  `me`: the caller's own address as read at the press, when it is one IPv4 address and whether the list covers it;
 *  'v6' on an IPv6 connection (no rule can let it in); 'unknown' when it could not be read. */
export interface IpsConfirm {
  removed: readonly string[];
  me: { ip: string; inside: boolean } | 'v6' | 'unknown';
  /** People and keys the stored rules hold, which the change removes (a computer only; the drawer's own line). */
  ended?: number;
}

/** The lines a project's Only these IPs adds after its mode line: what is no longer allowed, then the caller's own
 *  address when the list leaves it out (or it can't be told). An address the list covers adds nothing. The computer's
 *  drawer draws its own lines from the same facts (AccessDrawer: the confirm's consequences). */
export function ipsConfirmLines(x: IpsConfirm): ConfirmLine[] {
  const out: ConfirmLine[] = [];
  if (x.removed.length) out.push({ key: 'pp.rules.confirm.ips.removed', vars: { ips: x.removed.map(shownRange).join(', ') } });
  if (x.me === 'v6') out.push({ key: 'pp.rules.confirm.ips.v6' });
  else if (x.me === 'unknown') out.push({ key: 'pp.rules.confirm.ips.unknown' });
  else if (!x.me.inside) out.push({ key: 'pp.rules.confirm.ips.out', vars: { ip: x.me.ip } });
  return out;
}

export function rulesConfirmLines(want: ProjectWant, shown: ReturnType<typeof counts> | null, ips?: IpsConfirm): ConfirmLine[] {
  const ip: Record<string, string> | undefined = want.kind === 'myIp' ? { ip: want.ip } : want.kind === 'ips' ? { ips: want.ranges.map(shownRange).join(', ') } : undefined;
  const out: ConfirmLine[] = [{ key: `pp.rules.confirm.mode.${want.kind}`, ...(ip ? { vars: ip } : {}) }];
  // Only these IPs, and Only my IP over other addresses (what goes is named).
  if (ips && (want.kind === 'ips' || want.kind === 'myIp')) out.push(...ipsConfirmLines(ips));
  if (!shown) out.push({ key: 'pp.rules.confirm.noList' });
  else {
    if (shown.full > 0) out.push({ key: 'pp.rules.confirm.full', vars: { full: shown.full }, effect: { key: `pp.rules.eff.${want.kind}.full`, ...(want.kind === 'myIp' ? { vars: { ip: want.ip } } : {}) } });
    if (shown.own > 0) out.push({ key: 'pp.rules.confirm.own', vars: { own: shown.own } });
    if (shown.unknown > 0) out.push({ key: 'pp.rules.confirm.unknown', vars: { unknown: shown.unknown } });
  }
  out.push({ key: 'pp.rules.confirm.others' }, { key: 'pp.rules.confirm.delay' });
  return out;
}

export type Own = 'yes' | 'no' | 'notKnown' | 'failed';

/** Whether a computer has access rules of its own: from the API's container state when the answer carries it (
 *  missing = no; default/applied = yes; anything else = could not tell), else from its scope, which cannot tell "no
 *  document" from "a default document": project/none = not known (an "Anyone" computer under a "Private" project
 *  reads as none), computer/both = yes, unknown or absent = failed. */
export function ownOf(c: { proxy_permissions_scope?: string; proxy_permissions_computer_state?: string }): Own {
  const st = c.proxy_permissions_computer_state;
  if (st !== undefined) return st === 'missing' ? 'no' : st === 'default' || st === 'applied' ? 'yes' : 'failed';
  const sc = c.proxy_permissions_scope;
  if (sc === 'computer' || sc === 'both') return 'yes';
  return sc === 'project' || sc === 'none' ? 'notKnown' : 'failed';
}

export type Source = 'pp.cx.by.project' | 'pp.cx.by.open' | 'pp.cx.by.both' | 'pp.cx.by.own';

/** How a computer's addresses are decided, only where both facts are certain; null (shown "—") otherwise. */
export function sourceOf(own: Own, project: 'yes' | 'no' | 'unknown'): Source | null {
  if (project === 'unknown' || (own !== 'yes' && own !== 'no')) return null;
  if (own === 'no') return project === 'yes' ? 'pp.cx.by.project' : 'pp.cx.by.open';
  return project === 'yes' ? 'pp.cx.by.both' : 'pp.cx.by.own';
}

/** Of the computers shown (never a claim about the whole project): how many follow only the project, how many have
 *  rules of their own, how many could not be told. */
export function counts(computers: readonly Parameters<typeof ownOf>[0][]): { shown: number; full: number; own: number; unknown: number } {
  let full = 0;
  let own = 0;
  let unknown = 0;
  for (const c of computers) {
    const o = ownOf(c);
    if (o === 'no') full++;
    else if (o === 'yes') own++;
    else unknown++;
  }
  return { shown: computers.length, full, own, unknown };
}

/** One computer of a project's list (GET /projects/:id/computers), with the own-document state when the API sends it. */
export type ProjectComputer = Computer & {
  proxy_permissions_computer_state?: string;
  /** The API's expiry flag: its server ended or was reinstalled. Only such a row offers Delete in the tab. */
  server_expired?: boolean;
};

/** A project's computer list as the API answered one page of it: its rows and the API's own total, or null when
 *  the answer is not whole (no list; a row without a non-empty string id, a string name and a string status, or with a
 *  server_expired that is not a boolean; a total that is missing, not a whole number, or below the rows sent). null is
 *  a read error, never "no computers" and never a partial list counted as the list. */
export function projectComputersOf(raw: unknown): { rows: ProjectComputer[]; total: number } | null {
  const d = raw && typeof raw === 'object' ? (raw as { data?: unknown }).data : undefined;
  const list = d && typeof d === 'object' ? (d as { computers?: unknown }).computers : undefined;
  if (!Array.isArray(list)) return null;
  const whole = (r: unknown): r is ProjectComputer => !!r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string' && (r as { id: string }).id !== '' && typeof (r as { name?: unknown }).name === 'string' && typeof (r as { status?: unknown }).status === 'string'
    && ['undefined', 'boolean'].includes(typeof (r as { server_expired?: unknown }).server_expired);
  if (!list.every(whole)) return null;
  const total = (d as { pagination?: { total?: unknown } }).pagination?.total;
  if (typeof total !== 'number' || !Number.isInteger(total) || total < list.length) return null;
  return { rows: list, total };
}
