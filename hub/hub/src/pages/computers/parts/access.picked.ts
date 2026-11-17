// "Only people or keys I pick": the drawer's own entries in a computer's access rules, and the writes that
// add or remove one, one step at a time.
//
// Contract, in plain words:
//   - An entry is a group the drawer made: `hub-person-<name>` (a password group: the person signs in with the
//     browser's own sign-in box) or `hub-key-<name>` (a token group read from a query parameter: a key link).
//     Groups with any other name are not the drawer's and are never written here.
//   - Leaving "Only my IP" for this choice removes the drawer's own address group (MY_IP_GROUP) after the new
//     entry's programs and before "everyone else kept out"; a document still holding it beside entries is a cut
//     add (unfinished), never Advanced, so Finish adding can remove it.
//   - Leaving "Only these IPs" does the same with every address group of that list (access.logic.ts ipsOf), in the
//     same place of the order. A cut add that still holds address groups the Hub named for their own range (ipGroupName) is
//     unfinished too; one that still holds an address group somebody else named reads as Advanced (the Hub never
//     removes a group it cannot tell is part of the list it was leaving).
//   - entriesOf(rules) is the entries when the document is one the drawer wrote for this choice (only its own
//     groups, each granted programs in full, everyone else kept out, the addresses on, no hooks); null for any
//     other document, which stays Advanced.
//   - A change is a list of steps, each one API write with If-Match on the version the previous answer (or a fresh
//     read) gave. Adding: the group, then each program it may open, then "everyone else kept out" last, so a cut
//     sequence never opens more than before and never keeps the person out of what was already granted.
//     Removing: one write (removing a group removes what it may open).
//   - Steps carry names and kinds only. A password or key exists only in the component that typed or made it,
//     until its own step is sent: never in a step, a held change, a log or an Agent snapshot.
//   - remainingSteps(steps, fresh) is what a fresh read proves is still missing, in order. stepDone says whether a
//     read shows one step in place; the caller never sends a step whose own answer was lost while the version is
//     unchanged (the write may still land).

import { type AccessRules, ipGroupName, ipsOf, MY_IP_GROUP, rangeOk } from './access.logic';

export const PERSON_PREFIX = 'hub-person-';
export const KEY_PREFIX = 'hub-key-';
/** The query parameter a key link carries its key in. */
export const KEY_PARAM = 'hub_key';
/** The longest entry name (after the prefix). */
export const ENTRY_NAME_MAX = 32;

export type EntryKind = 'person' | 'key';

export interface Entry {
  group: string;
  kind: EntryKind;
  /** The name as the person typed it, from the group name (lower case, words joined by "-"). */
  name: string;
  /** Programs the entry may open; '*' is every program (it never includes logs). */
  programs: string[];
}

/** The group name for an entry, or null when the name has nothing usable: lower case letters, digits and single
 *  "-" between words, at most ENTRY_NAME_MAX. */
export function entryGroup(kind: EntryKind, name: string): string | null {
  const slug = name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug || slug.length > ENTRY_NAME_MAX) return null;
  return (kind === 'person' ? PERSON_PREFIX : KEY_PREFIX) + slug;
}

function kindOfGroup(name: string, kind: AccessRules['groups'][number]['kind']): EntryKind | null {
  if (name.startsWith(PERSON_PREFIX) && name.length > PERSON_PREFIX.length && kind === 'password') return 'person';
  if (name.startsWith(KEY_PREFIX) && name.length > KEY_PREFIX.length && kind === 'token') return 'key';
  return null;
}

/** The drawer's people-and-keys document, finished or not: only its own groups (at least one entry), each granted
 *  programs in full or nothing yet, no rule for a missing group, the addresses on, no hooks, and "everyone else"
 *  stated. The "Only my IP" address group may still be there beside them (`myIp`: an add from that choice cut
 *  before it was removed). `unfinished` when everyone else is still let in, the address group is still there or an
 *  entry may open nothing: an add that was cut before its last step; `open` while everyone else is still let in.
 *  Null for any other document (Advanced). */
/** The address groups a cut add can leave beside the entries: the "Only my IP" group, and groups carrying exactly the
 *  name the Hub gives their own range for "Only these IPs". Any other address group is not the Hub's (Advanced). */
function addrGroups(r: AccessRules): string[] {
  return r.groups.filter((g) => g.kind === 'ip' && (g.name === MY_IP_GROUP || (typeof g.range === 'string' && rangeOk(g.range) && g.name === ipGroupName(g.range)))).map((g) => g.name);
}

/** `myIp`: an address group is still beside the entries; `listLeft` (only when so): one of them came from "Only these
 *  IPs", so the words say "addresses" and never name the wrong choice. */
export function peopleOf(r: AccessRules): { entries: Entry[]; unfinished: boolean; open: boolean; myIp: boolean; listLeft?: true } | null {
  if (r.allowByDefault === null || r.proxyOff || r.hooks > 0 || r.groups.length === 0) return null;
  const entries: Entry[] = [];
  const addr = addrGroups(r);
  for (const g of r.groups) {
    if (r.groups.filter((x) => x.name === g.name).length > 1) return null;
    const grant = r.grants.find((x) => x.group === g.name);
    if (grant && grant.programs.some((p) => p.rule !== 'all')) return null;
    if (addr.includes(g.name)) continue;
    const kind = kindOfGroup(g.name, g.kind);
    if (!kind) return null;
    entries.push({ group: g.name, kind, name: g.name.slice(kind === 'person' ? PERSON_PREFIX.length : KEY_PREFIX.length), programs: grant ? grant.programs.map((p) => p.program) : [] });
  }
  if (entries.length === 0 || r.grants.some((x) => !r.groups.some((g) => g.name === x.group))) return null;
  const myIp = addr.length > 0;
  return { entries, unfinished: r.allowByDefault !== false || myIp || entries.some((e) => e.programs.length === 0), open: r.allowByDefault === true, myIp, ...(addr.some((g) => g !== MY_IP_GROUP) ? { listLeft: true as const } : {}) };
}

/** The drawer's entries when the document is one it wrote for this choice and finished; null otherwise. */
export function entriesOf(r: AccessRules): Entry[] | null {
  const p = peopleOf(r);
  return p && !p.unfinished ? p.entries : null;
}

/** What finishes a cut add from the rules alone, once every entry may open something: the "Only my IP" address
 *  group removed when still there, then "everyone else kept out". An entry that may open nothing is only removed
 *  (its programs were never recorded anywhere but the cut add). */
export function finishSteps(r: AccessRules): Step[] {
  const p = peopleOf(r);
  if (!p || !p.unfinished || p.entries.some((e) => e.programs.length === 0)) return [];
  return [...addrGroups(r).map((group): Step => ({ op: 'drop', group })), ...(r.allowByDefault === false ? [] : [{ op: 'deny' } as Step])];
}

export type Step =
  | { op: 'group'; group: string; kind: EntryKind }
  | { op: 'grant'; group: string; program: string }
  | { op: 'deny' }
  | { op: 'drop'; group: string };

/** The steps that add an entry able to open `programs` ('*' for every program; logs only when named) to rules `r`:
 *  the "Only my IP" address group, when `r` has it, goes after the entry's programs and before "everyone else kept
 *  out" (a cut add never keeps out more than before, and a finished one leaves only the drawer's entries). */
export function addSteps(group: string, kind: EntryKind, programs: readonly string[], r: AccessRules): Step[] {
  const unique = [...new Set(programs)];
  // Every address group that goes: the whole list when `r` is "Only these IPs" (whatever its groups are named), else
  // the "Only my IP" group and any group the Hub named for a list (a cut add's leftovers).
  const list = ipsOf(r);
  const going = list ? list.map((e) => e.group) : addrGroups(r);
  const leave: Step[] = going.map((g): Step => ({ op: 'drop', group: g }));
  return [{ op: 'group', group, kind }, ...unique.map((program): Step => ({ op: 'grant', group, program })), ...leave, { op: 'deny' }];
}

/** The ranges an add removes from rules `r` (the groups addSteps drops), for its confirm. */
export function addrGoing(r: AccessRules): string[] {
  const names = (ipsOf(r)?.map((e) => e.group)) ?? addrGroups(r);
  return r.groups.filter((g) => names.includes(g.name) && typeof g.range === 'string').map((g) => g.range as string);
}

/** The steps that remove an entry. With its last entry gone the document keeps everyone out (Private). */
export function removeSteps(group: string): Step[] {
  return [{ op: 'drop', group }];
}

/** Whether a read shows the step in place. */
export function stepDone(step: Step, r: AccessRules): boolean {
  switch (step.op) {
    case 'group':
      return r.groups.some((g) => g.name === step.group && kindOfGroup(g.name, g.kind) === step.kind);
    case 'grant':
      return r.grants.some((x) => x.group === step.group && x.programs.some((p) => p.program === step.program && p.rule === 'all'));
    case 'deny':
      return r.allowByDefault === false;
    case 'drop':
      return !r.groups.some((g) => g.name === step.group) && !r.grants.some((x) => x.group === step.group);
  }
}

/** The steps a fresh read proves still missing, in order. A grant whose group is missing stays (its group step,
 *  missing too, comes first). */
export function remainingSteps(steps: readonly Step[], r: AccessRules): Step[] {
  return steps.filter((s) => !stepDone(s, r));
}

/** The address a key link opens: the program's address with the key as KEY_PARAM. The key also travels in the
 *  browser's history, the address bar, logs of what was visited and the address sent to other sites the program
 *  links to, which the confirm says plainly. */
export function keyLink(programUrl: string, key: string): string | null {
  let u: URL;
  try {
    u = new URL(programUrl);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  u.searchParams.set(KEY_PARAM, key);
  return u.toString();
}

// Letters and digits that are hard to misread (no 0/O, 1/l/I). A made secret is never 64 hex characters, which the
// API would store as an already-hashed password.
const SECRET_ABC = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A new password or key from the browser's random source: `length` characters, about 5.8 bits each. */
export function makeSecret(length: number, random: (n: Uint8Array<ArrayBuffer>) => Uint8Array = (n) => crypto.getRandomValues(n)): string {
  let out = '';
  while (out.length < length) {
    for (const b of random(new Uint8Array(length))) {
      // Rejection keeps every character equally likely (256 is not a multiple of the alphabet's size).
      if (b < 256 - (256 % SECRET_ABC.length) && out.length < length) out += SECRET_ABC[b % SECRET_ABC.length];
    }
  }
  return out;
}

/** What a held step records: the computer, the version its write was made against, and the step (names only). */
export type StepIdentity = { computer: string; from: number } & Step;

/** A held step's verdict from a fresh read of the rules (the answers of the 'accessRules' read). The version still
 *  `from`: unknown, the write may still land. Moved on: 'applied' when the read shows the step in place, else
 *  'not_applied' (another write went first; a fresh read decides what is still missing). */
export function stepVerdict(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | 'not_applied' | undefined {
  const i = (identity ?? {}) as Partial<StepIdentity>;
  if (typeof i.computer !== 'string' || typeof i.from !== 'number' || typeof i.op !== 'string') return undefined;
  let r: AccessRules | null | undefined;
  for (const a of answers[0] ?? []) {
    const one = (a as Record<string, AccessRules | null> | null)?.[i.computer];
    if (one) r = one;
  }
  if (!r || r.version <= i.from) return undefined;
  return stepDone(i as Step, r) ? 'applied' : 'not_applied';
}

/** The name a person signs in with: their entry name (the group name without its prefix). */
export const personName = (group: string): string => (group.startsWith(PERSON_PREFIX) ? group.slice(PERSON_PREFIX.length) : group);

/** One step's variables (data.ts step changes). `secret` and `salt` go only with a group step, from the component
 *  that made them: core never keeps the variables of these secret routes (their lock is the computer alone). */
export interface StepWrite {
  id: string;
  from: number;
  step: Step;
  secret?: string;
  salt?: string;
}

/** The change (data.ts key) that sends a step. */
export type StepKey = 'accessPerson' | 'accessKey' | 'accessGrant' | 'accessDeny' | 'accessDrop';
export function stepKey(step: Step): StepKey {
  if (step.op === 'group') return step.kind === 'person' ? 'accessPerson' : 'accessKey';
  return step.op === 'grant' ? 'accessGrant' : step.op === 'deny' ? 'accessDeny' : 'accessDrop';
}

/** One send's answer as runSteps reads it (core's SourceResult, narrowed). */
export interface StepAnswer {
  outcome: 'done' | 'pending' | 'failed' | 'not_sent' | 'stale';
  data?: AccessRules | null;
  code?: string;
  status?: number;
  /** A refusal's facts for Details (never a credential: core rebuilds secret routes' refusals from safe fields). */
  retryAfter?: number;
  traceId?: string;
  route?: string;
}

/** How a run ended:
 *  - done: every step is in place in the last answer's document;
 *  - held: a step's answer was lost (or an earlier one is still unread): nothing more was sent, core holds it
 *    until a fresh read proves it, and that step is never sent again unproved (after a Dismiss, too, nothing of
 *    this change goes again until the rules read newer than `from`, the version it was sent against);
 *  - stale: 412, the rules changed elsewhere: nothing was written by that step; read again;
 *  - refused: the API refused the step (nothing written by it); earlier steps stand;
 *  - unread: the step answered done but neither its answer nor a fresh read after it shows it in a version newer
 *    than `from` (the version it was sent against): nothing of it is sent again until a read newer than `from`
 *    decides what is missing. */
export type RunEnd =
  | { kind: 'done'; rules: AccessRules }
  | { kind: 'held'; step: Step; from: number }
  | { kind: 'stale'; step: Step; answer: StepAnswer }
  | { kind: 'refused'; step: Step; answer: StepAnswer }
  | { kind: 'unread'; step: Step; from: number };

/** Sends the steps a document (a fresh read) shows missing, one at a time, each against the version the previous
 *  answer, or a fresh read after it, gave; stops at the first answer that is not a plain done shown in place. The
 *  API's step answers may carry no version (their document then reads as null): `read` re-reads the rules (null
 *  when that read fails), and only a document newer than the step's own version showing it lets the run go on.
 *  `send` builds the variables (the secret of a group step comes from the caller's component state, never a step). */
export async function runSteps(steps: readonly Step[], start: AccessRules, send: (step: Step, from: number) => Promise<StepAnswer>, read: () => Promise<AccessRules | null>): Promise<RunEnd> {
  let r = start;
  const shows = (step: Step, from: number, x: AccessRules | null | undefined): x is AccessRules => !!x && x.version > from && stepDone(step, x);
  // Each step is sent at most once per run: a done answer that neither it nor a fresh read shows ends the run (unread).
  for (let n = 0; n <= steps.length; n++) {
    const step = remainingSteps(steps, r)[0];
    if (!step) return { kind: 'done', rules: r };
    if (n === steps.length) return { kind: 'unread', step, from: r.version };
    const from = r.version;
    const a = await send(step, from).catch((): StepAnswer => ({ outcome: 'pending' }));
    if (a.outcome === 'pending' || (a.outcome === 'not_sent' && (a.code === 'READ_BACK_FIRST' || a.code === 'HELD_BY_OTHER'))) return { kind: 'held', step, from };
    if (a.outcome !== 'done') {
      return a.outcome === 'stale' || a.status === 412 || a.code === 'PRECONDITION_FAILED' ? { kind: 'stale', step, answer: a } : { kind: 'refused', step, answer: a };
    }
    if (shows(step, from, a.data)) {
      r = a.data;
      continue;
    }
    const fresh = await read().catch(() => null);
    if (!shows(step, from, fresh)) return { kind: 'unread', step, from };
    r = fresh;
  }
  return { kind: 'unread', step: steps[0] as Step, from: r.version };
}
