// "Only these IPs": a list of IPv4 addresses and ranges, at a computer and at a project. The pure rules: what a typed
// list is, which document reads as the choice (a list made elsewhere included, its group names kept), the document a
// save writes, what proves a write whose answer was lost (exactly the ranges sent), and how leaving the choice for
// people or keys removes every address group in the never-wider order.
import { describe, expect, it } from 'vitest';
import { bodyFor, coversIp, ipGroupName, IPS_MAX, ipsGroups, ipsOf, ipsText, modeOf, MY_IP_GROUP, parseIps, rangeOk, readsAs, rulesFrom, sameRanges, shownRange, writeVerdict } from './parts/access.logic';
import { addrGoing, addSteps, finishSteps, peopleOf, type Step } from './parts/access.picked';
import { ipsConfirmLines, projectBodyFor, projectMode, projectReadsAs, projectWriteVerdict, rulesConfirmLines } from './parts/projectPerms.logic';

const PID = 'a'.repeat(24);
const CID = 'c'.repeat(24);
const ALL = { '*': true, logs: true };
const doc = (data: Record<string, unknown>, version = 3) => rulesFrom({ data: { project: PID, computer: CID, file_version: version, ...data } })!;
const list = (groups: Record<string, string>, version = 3) => doc({
  groups: Object.fromEntries(Object.entries(groups).map(([n, range]) => [n, { type: 'ip', range }])),
  permissions: Object.fromEntries(Object.keys(groups).map((n) => [n, ALL])),
  default: 'deny',
}, version);
const HOME = '203.0.113.7/32';
const OFFICE = '198.51.100.0/24';

describe('Only these IPs: the typed list', () => {
  it('one address is its /32; a range needs zero host bits; each entry once, in typed order', () => {
    expect(parseIps('203.0.113.7, 198.51.100.0/24\n203.0.113.7/32')).toEqual({ ranges: [HOME, OFFICE], errors: [], tooMany: false });
    expect(ipsText([HOME, OFFICE])).toBe('203.0.113.7\n198.51.100.0/24');
    expect(shownRange(HOME)).toBe('203.0.113.7');
  });

  it('refuses, never repairs: IPv6, a bad address, a bad size, host bits, leading zeros and /0 (every address)', () => {
    const p = parseIps('2001:db8::7 300.1.1.1 10.0.0.0/33 198.51.100.7/24 010.0.0.1 0.0.0.0/0 203.0.113.7');
    expect(p.ranges).toEqual([HOME]);
    expect(p.errors).toEqual([
      { entry: '2001:db8::7', code: 'ipv6' },
      { entry: '300.1.1.1', code: 'bad_ip' },
      { entry: '10.0.0.0/33', code: 'bad_prefix' },
      { entry: '198.51.100.7/24', code: 'host_bits' },
      { entry: '010.0.0.1', code: 'bad_ip' },
      { entry: '0.0.0.0/0', code: 'all' },
    ]);
    for (const bad of ['0.0.0.0/0', '203.0.113.7', '198.51.100.7/24', '010.0.0.0/8', '2001:db8::/32', '', 7, null]) expect(rangeOk(bad)).toBe(false);
    expect(rangeOk(OFFICE)).toBe(true);
  });

  it('never looser than the API: every range the Hub takes fits the API pattern', () => {
    const API = /^(\d{1,3}\.){3}\d{1,3}\/(?:[0-9]|[12][0-9]|3[0-2])$/;
    for (const r of parseIps('203.0.113.7 198.51.100.0/24 10.0.0.0/8 192.0.2.128/25').ranges) expect(r).toMatch(API);
  });

  it('too many entries is said, never cut', () => {
    const many = Array.from({ length: IPS_MAX + 1 }, (_, i) => `198.51.100.${i}`).join(' ');
    const p = parseIps(many);
    expect(p.tooMany).toBe(true);
    expect(p.ranges).toHaveLength(IPS_MAX + 1);
  });

  it('whether an address is inside the list', () => {
    expect(coversIp([HOME, OFFICE], '203.0.113.7')).toBe(true);
    expect(coversIp([HOME, OFFICE], '198.51.100.200')).toBe(true);
    expect(coversIp([HOME, OFFICE], '198.51.101.1')).toBe(false);
    expect(coversIp([HOME], '203.0.113.8')).toBe(false);
    expect(coversIp([OFFICE], '2001:db8::7')).toBe(false);
    expect(coversIp(['128.0.0.0/1'], '200.1.2.3')).toBe(true);
    expect(coversIp(['128.0.0.0/1'], '100.1.2.3')).toBe(false);
  });
});

describe('Only these IPs: which document reads as the choice', () => {
  it('the Hub\'s own list, and a list made elsewhere under any group names', () => {
    const own = list({ [ipGroupName(HOME)]: HOME, [ipGroupName(OFFICE)]: OFFICE });
    expect(ipGroupName(OFFICE)).toBe('hub-ip-198-51-100-0-24');
    expect(modeOf(own, 'no')).toEqual({ kind: 'ips', entries: [{ group: 'hub-ip-203-0-113-7-32', range: HOME }, { group: 'hub-ip-198-51-100-0-24', range: OFFICE }] });
    const elsewhere = list({ office: OFFICE, home: HOME });
    expect(modeOf(elsewhere, 'no')).toEqual({ kind: 'ips', entries: [{ group: 'office', range: OFFICE }, { group: 'home', range: HOME }] });
    expect(projectMode(elsewhere)).toBe('ips');
  });

  it('one Only my IP group alone stays Only my IP; with a second address it is the list', () => {
    expect(modeOf(list({ [MY_IP_GROUP]: HOME }), 'no')).toEqual({ kind: 'myIp', ip: '203.0.113.7' });
    expect(modeOf(list({ [MY_IP_GROUP]: HOME, office: OFFICE }), 'no').kind).toBe('ips');
  });

  it('anything narrower, wider or odd stays Advanced: never offered for a rewrite', () => {
    const adv = (r: ReturnType<typeof doc>) => expect(modeOf(r, 'no')).toEqual({ kind: 'advanced', why: ['rules'] });
    // an address group that may open only one program
    adv(doc({ groups: { office: { type: 'ip', range: OFFICE } }, permissions: { office: { terminal: true } }, default: 'deny' }));
    // no logs rule, or a refused program
    adv(doc({ groups: { office: { type: 'ip', range: OFFICE } }, permissions: { office: { '*': true } }, default: 'deny' }));
    adv(doc({ groups: { office: { type: 'ip', range: OFFICE } }, permissions: { office: { '*': true, logs: false } }, default: 'deny' }));
    // everyone else let in
    adv(doc({ groups: { office: { type: 'ip', range: OFFICE } }, permissions: { office: ALL }, default: 'allow' }));
    // a range the Hub would refuse to write: host bits, every address, the same range twice
    adv(list({ office: '198.51.100.7/24' }));
    adv(list({ all: '0.0.0.0/0' }));
    adv(list({ a: OFFICE, b: OFFICE }));
    // another kind of group beside it, a group with no rule, a rule for a missing group
    adv(doc({ groups: { office: { type: 'ip', range: OFFICE }, team: { type: 'password', username: 'x', password: 'y' } }, permissions: { office: ALL, team: ALL }, default: 'deny' }));
    adv(doc({ groups: { office: { type: 'ip', range: OFFICE }, home: { type: 'ip', range: HOME } }, permissions: { office: ALL }, default: 'deny' }));
    adv(doc({ groups: { office: { type: 'ip', range: OFFICE } }, permissions: { office: ALL, ghost: ALL }, default: 'deny' }));
    // more entries than the Hub edits
    adv(list(Object.fromEntries(Array.from({ length: IPS_MAX + 1 }, (_, i) => [`g${i}`, `198.51.100.${i}/32`]))));
    expect(ipsOf(list({ office: OFFICE }))).toEqual([{ group: 'office', range: OFFICE }]);
  });

  it('hooks, the addresses switched off or a project rule keep it Advanced, as for every choice', () => {
    expect(modeOf(list({ office: OFFICE }), 'yes')).toEqual({ kind: 'advanced', why: ['project'] });
    expect(modeOf({ ...list({ office: OFFICE }), proxyOff: true, proxy: false }, 'no')).toEqual({ kind: 'advanced', why: ['proxyOff'] });
  });
});

describe('Only these IPs: the document a save writes', () => {
  const open = doc({ groups: {}, permissions: {}, default: 'allow', enable_proxy: true });

  it('one group per range, each allowed everything and logs, everyone else kept out', () => {
    const b = bodyFor(open, modeOf(open, 'no'), { kind: 'ips', ranges: [HOME, OFFICE] }, CID);
    expect(b).toEqual({
      project: PID, computer: CID, enable_proxy: true,
      groups: { 'hub-ip-203-0-113-7-32': { type: 'ip', range: HOME }, 'hub-ip-198-51-100-0-24': { type: 'ip', range: OFFICE } },
      permissions: { 'hub-ip-203-0-113-7-32': ALL, 'hub-ip-198-51-100-0-24': ALL },
      default: 'deny',
    });
    // what was written reads back as the choice, with exactly those ranges
    const back = modeOf(doc({ ...b }, 4), 'no');
    expect(back.kind === 'ips' && back.entries.map((e) => e.range)).toEqual([HOME, OFFICE]);
  });

  it('a range the document already holds keeps its group\'s name; a removed one goes; a new one gets the Hub\'s name', () => {
    const cur = list({ office: OFFICE, home: HOME });
    const g = ipsGroups(cur, [OFFICE, '192.0.2.9/32']);
    expect(g).toEqual({ groups: { office: { type: 'ip', range: OFFICE }, 'hub-ip-192-0-2-9-32': { type: 'ip', range: '192.0.2.9/32' } }, permissions: { office: ALL, 'hub-ip-192-0-2-9-32': ALL } });
    expect(projectBodyFor(cur, { kind: 'ips', ranges: [OFFICE, '192.0.2.9/32'] }, PID)).toEqual({ project: PID, ...g, default: 'deny' });
  });

  it('from Only my IP the stored address is renamed into the list, so the document never reads as Only my IP again', () => {
    const mine = list({ [MY_IP_GROUP]: HOME });
    const b = bodyFor(mine, modeOf(mine, 'no'), { kind: 'ips', ranges: [HOME, OFFICE] }, CID)!;
    expect(Object.keys(b.groups as object)).toEqual(['hub-ip-203-0-113-7-32', 'hub-ip-198-51-100-0-24']);
  });

  it('writes nothing for an empty list, a refused range, a range twice, too many, or over rules set elsewhere', () => {
    const m = modeOf(open, 'no');
    expect(bodyFor(open, m, { kind: 'ips', ranges: [] }, CID)).toBeNull();
    expect(bodyFor(open, m, { kind: 'ips', ranges: ['0.0.0.0/0'] }, CID)).toBeNull();
    expect(bodyFor(open, m, { kind: 'ips', ranges: ['203.0.113.7'] }, CID)).toBeNull();
    expect(bodyFor(open, m, { kind: 'ips', ranges: [HOME, HOME] }, CID)).toBeNull();
    expect(bodyFor(open, m, { kind: 'ips', ranges: Array.from({ length: IPS_MAX + 1 }, (_, i) => `198.51.100.${i}/32`) }, CID)).toBeNull();
    const elsewhere = doc({ groups: { team: { type: 'password', username: 'x', password: 'y' } }, permissions: { team: { terminal: true } }, default: 'deny' });
    expect(bodyFor(elsewhere, modeOf(elsewhere, 'no'), { kind: 'ips', ranges: [HOME] }, CID)).toBeNull();
    expect(projectBodyFor(elsewhere, { kind: 'ips', ranges: [HOME] }, PID)).toBeNull();
  });

  it('a list of several groups can be left for Only my IP, Private or Anyone', () => {
    const cur = list({ office: OFFICE, home: HOME });
    const m = modeOf(cur, 'no');
    expect(bodyFor(cur, m, { kind: 'private' }, CID)).toEqual({ project: PID, computer: CID, groups: {}, permissions: {}, default: 'deny' });
    expect(Object.keys((bodyFor(cur, m, { kind: 'myIp', ip: '203.0.113.7' }, CID)!.groups as object))).toEqual([MY_IP_GROUP]);
  });
});

describe('Only these IPs: what proves a write whose answer was lost', () => {
  const sent = [HOME, OFFICE].sort();
  const answers = (id: string, r: unknown) => [[{ [id]: r }]];

  it('same version: nothing yet; a newer version with exactly the ranges sent: applied; any other set: not applied', () => {
    const id = { computer: CID, want: 'ips', ips: sent, from: 3 };
    expect(writeVerdict(id, answers(CID, list({ a: HOME, b: OFFICE }, 3)))).toBeUndefined();
    expect(writeVerdict(id, answers(CID, list({ a: OFFICE, b: HOME }, 4)))).toBe('applied');
    expect(writeVerdict(id, answers(CID, list({ a: HOME }, 4)))).toBe('not_applied');
    expect(writeVerdict(id, answers(CID, list({ a: HOME, b: OFFICE, c: '192.0.2.9/32' }, 4)))).toBe('not_applied');
    expect(writeVerdict({ computer: CID, want: 'ips', from: 3 }, answers(CID, list({ a: HOME, b: OFFICE }, 4)))).toBe('not_applied');
  });

  it('the project write: the same rule', () => {
    const id = { project: PID, want: 'ips', ips: sent, from: 3 };
    expect(projectWriteVerdict(id, answers(PID, list({ a: HOME, b: OFFICE }, 3)))).toBeUndefined();
    expect(projectWriteVerdict(id, answers(PID, list({ a: HOME, b: OFFICE }, 4)))).toBe('applied');
    expect(projectWriteVerdict(id, answers(PID, list({ a: HOME }, 4)))).toBe('not_applied');
    expect(projectReadsAs(list({ a: HOME }), { kind: 'ips', ips: [HOME] })).toBe(true);
    expect(projectReadsAs(list({ a: HOME }), { kind: 'ips' })).toBe(false);
  });

  it('readsAs and sameRanges compare sets, never order', () => {
    expect(sameRanges([HOME, OFFICE], [OFFICE, HOME])).toBe(true);
    expect(sameRanges([HOME], [HOME, OFFICE])).toBe(false);
    expect(sameRanges([HOME, HOME], [HOME, OFFICE])).toBe(false);
    expect(readsAs({ kind: 'private' }, { kind: 'private' })).toBe(true);
    expect(readsAs({ kind: 'myIp', ip: '203.0.113.7' }, { kind: 'myIp', ip: '203.0.113.8' })).toBe(false);
  });
});

describe('Only these IPs: the confirm lines', () => {
  it('the mode line names every address; then what is no longer allowed and an address the list leaves out', () => {
    const lines = rulesConfirmLines({ kind: 'ips', ranges: [HOME, OFFICE] }, { shown: 1, full: 1, own: 0, unknown: 0 }, { removed: ['192.0.2.9/32'], me: { ip: '192.0.2.9', inside: false } });
    expect(lines.map((l) => l.key)).toEqual(['pp.rules.confirm.mode.ips', 'pp.rules.confirm.ips.removed', 'pp.rules.confirm.ips.out', 'pp.rules.confirm.full', 'pp.rules.confirm.others', 'pp.rules.confirm.delay']);
    expect(lines[0]?.vars).toEqual({ ips: '203.0.113.7, 198.51.100.0/24' });
    expect(lines[1]?.vars).toEqual({ ips: '192.0.2.9' });
    expect(lines[3]?.effect).toEqual({ key: 'pp.rules.eff.ips.full' });
  });

  it('an address inside the list adds nothing; IPv6 and an unread address are said', () => {
    expect(ipsConfirmLines({ removed: [], me: { ip: '203.0.113.7', inside: true } })).toEqual([]);
    expect(ipsConfirmLines({ removed: [], me: 'v6' })).toEqual([{ key: 'pp.rules.confirm.ips.v6' }]);
    expect(ipsConfirmLines({ removed: [], me: 'unknown' })).toEqual([{ key: 'pp.rules.confirm.ips.unknown' }]);
  });
});

describe('Only these IPs: leaving it for people or keys', () => {
  it('every address group of the list goes after the new entry\'s programs and before "everyone else kept out"', () => {
    const cur = list({ office: OFFICE, [ipGroupName(HOME)]: HOME });
    expect(addSteps('hub-person-ana', 'person', ['terminal'], cur)).toEqual([
      { op: 'group', group: 'hub-person-ana', kind: 'person' },
      { op: 'grant', group: 'hub-person-ana', program: 'terminal' },
      { op: 'drop', group: 'office' },
      { op: 'drop', group: 'hub-ip-203-0-113-7-32' },
      { op: 'deny' },
    ]);
  });

  it('a cut add that still holds the Hub\'s address groups is unfinished, and Finish removes them', () => {
    const cut = doc({
      groups: { 'hub-ip-203-0-113-7-32': { type: 'ip', range: HOME }, 'hub-person-ana': { type: 'password', username: 'ana', password: 'x' } },
      permissions: { 'hub-ip-203-0-113-7-32': ALL, 'hub-person-ana': { terminal: true } },
      default: 'deny',
    });
    expect(peopleOf(cut)).toEqual({ entries: [{ group: 'hub-person-ana', kind: 'person', name: 'ana', programs: ['terminal'] }], unfinished: true, open: false, myIp: true, listLeft: true });
    expect(finishSteps(cut)).toEqual([{ op: 'drop', group: 'hub-ip-203-0-113-7-32' }]);
  });

  it('an address group somebody else named beside entries stays Advanced: the Hub never removes it on its own', () => {
    const mixed = doc({
      groups: { office: { type: 'ip', range: OFFICE }, 'hub-person-ana': { type: 'password', username: 'ana', password: 'x' } },
      permissions: { office: ALL, 'hub-person-ana': { terminal: true } },
      default: 'deny',
    });
    expect(peopleOf(mixed)).toBeNull();
    expect(modeOf(mixed, 'no')).toEqual({ kind: 'advanced', why: ['rules'] });
  });
});

// Never wider, on every way into and out of the choice. A whole-document change is ONE write (the PUT replaces the
// document under If-Match), so there is no state between the old and the new choice. Only the way to "people or keys"
// takes several writes: after each one the document lets in nothing but what the old list or the new entry lets in.
describe('Only these IPs: never wider on any transition', () => {
  const open = doc({ groups: {}, permissions: {}, default: 'allow' });
  const shut = doc({ groups: {}, permissions: {}, default: 'deny' });
  const mine = list({ [MY_IP_GROUP]: HOME });
  const cur = list({ office: OFFICE, [ipGroupName(HOME)]: HOME });
  const people = doc({ groups: { 'hub-person-ana': { type: 'password', username: 'ana', password: 'x' } }, permissions: { 'hub-person-ana': { terminal: true } }, default: 'deny' });
  /** What a written document lets in: its ranges, and whether everyone else gets in. */
  const lets = (b: Record<string, unknown> | null) => ({
    ranges: Object.values((b?.groups ?? {}) as Record<string, { type: string; range?: string }>).filter((g) => g.type === 'ip').map((g) => g.range).sort(),
    others: Object.values((b?.groups ?? {}) as Record<string, { type: string }>).filter((g) => g.type !== 'ip').length,
    everyone: b?.default !== 'deny',
  });

  it.each([['Anyone', open], ['Private', shut], ['Only my IP', mine], ['people or keys', people], ['another list', cur]] as const)('from %s to the list: one write, holding exactly the list and nobody else', (_n, from) => {
    const b = bodyFor(from, modeOf(from, 'no'), { kind: 'ips', ranges: [OFFICE] }, CID);
    expect(lets(b)).toEqual({ ranges: [OFFICE], others: 0, everyone: false });
  });

  it('from the list to Anyone, Private or Only my IP: one write, holding exactly the new choice', () => {
    const m = modeOf(cur, 'no');
    expect(lets(bodyFor(cur, m, { kind: 'private' }, CID))).toEqual({ ranges: [], others: 0, everyone: false });
    expect(lets(bodyFor(cur, m, { kind: 'myIp', ip: '203.0.113.7' }, CID))).toEqual({ ranges: [HOME], others: 0, everyone: false });
    expect(lets(bodyFor(cur, m, { kind: 'anyone' }, CID))).toEqual({ ranges: [], others: 0, everyone: true });
  });

  it('the project writes: one write each way, the same documents', () => {
    for (const from of [open, shut, mine, cur]) expect(lets(projectBodyFor(from, { kind: 'ips', ranges: [OFFICE] }, PID))).toEqual({ ranges: [OFFICE], others: 0, everyone: false });
    expect(lets(projectBodyFor(cur, { kind: 'private' }, PID))).toEqual({ ranges: [], others: 0, everyone: false });
    expect(lets(projectBodyFor(cur, { kind: 'myIp', ip: '203.0.113.7' }, PID))).toEqual({ ranges: [HOME], others: 0, everyone: false });
    // No project rules is a DELETE: no document is built for it.
    expect(projectBodyFor(cur, { kind: 'none' }, PID)).toBeNull();
  });

  it('from the list to people or keys: after every write only the old addresses or the new entry get in, and everyone else stays out', () => {
    type Raw = { groups: Record<string, Record<string, unknown>>; permissions: Record<string, Record<string, unknown>>; default: string };
    let raw: Raw = { groups: { office: { type: 'ip', range: OFFICE }, 'hub-ip-203-0-113-7-32': { type: 'ip', range: HOME } }, permissions: { office: { ...ALL }, 'hub-ip-203-0-113-7-32': { ...ALL } }, default: 'deny' };
    const apply = (r: Raw, s: Step): Raw => {
      const n: Raw = JSON.parse(JSON.stringify(r)) as Raw;
      if (s.op === 'group') n.groups[s.group] = { type: 'password', username: 'ana', password: 'x' };
      else if (s.op === 'grant') n.permissions[s.group] = { ...(n.permissions[s.group] ?? {}), [s.program]: true };
      else if (s.op === 'deny') n.default = 'deny';
      else { delete n.groups[s.group]; delete n.permissions[s.group]; }
      return n;
    };
    const steps = addSteps('hub-person-ana', 'person', ['terminal'], doc(raw));
    const old = [HOME, OFFICE].sort();
    const seen: string[][] = [];
    for (const s of steps) {
      raw = apply(raw, s);
      const now = lets(raw);
      seen.push(now.ranges as string[]);
      // Never everyone; never an address the old list did not hold; never a group other than the new entry.
      expect(now.everyone).toBe(false);
      for (const r of now.ranges) expect(old).toContain(r);
      expect(Object.keys(raw.groups).filter((g) => raw.groups[g]?.type !== 'ip')).toEqual(['hub-person-ana']);
    }
    // The addresses only shrink, and go only after the entry may open its programs.
    expect(seen).toEqual([old, old, [HOME], [], []]);
    expect(raw).toEqual({ groups: { 'hub-person-ana': { type: 'password', username: 'ana', password: 'x' } }, permissions: { 'hub-person-ana': { terminal: true } }, default: 'deny' });
    // An answer lost between two of these writes leaves an add that reads as unfinished, with the addresses still in:
    const cut = doc({ groups: { 'hub-ip-203-0-113-7-32': { type: 'ip', range: HOME }, 'hub-person-ana': { type: 'password', username: 'ana', password: 'x' } }, permissions: { 'hub-ip-203-0-113-7-32': ALL, 'hub-person-ana': { terminal: true } }, default: 'deny' });
    expect(peopleOf(cut)?.unfinished).toBe(true);
  });
});

describe('Only these IPs: what a change removes is said, and only the Hub\'s own groups are touched', () => {
  const ANA = { type: 'password', username: 'ana', password: 'x' };

  it('a group the rules hold keeps its name when another address is added, whatever the name (a computer may narrow it by name)', () => {
    // A computer under this project can hold `hub-ip-office: { logs: false }`: renaming the project's group would drop that.
    const g = ipsGroups(list({ 'hub-ip-office': OFFICE }), [OFFICE, HOME]);
    expect(g?.groups).toEqual({ 'hub-ip-office': { type: 'ip', range: OFFICE }, 'hub-ip-203-0-113-7-32': { type: 'ip', range: HOME } });
    expect(Object.keys(ipsGroups(list({ office: OFFICE }), [OFFICE, HOME])?.groups ?? {})).toEqual(['office', 'hub-ip-203-0-113-7-32']);
    expect(Object.keys(projectBodyFor(list({ 'hub-ip-office': OFFICE }), { kind: 'ips', ranges: [OFFICE, HOME] }, PID)?.groups ?? {})).toEqual(['hub-ip-office', 'hub-ip-203-0-113-7-32']);
  });

  it('a new range never takes a name the rules already hold: it gets its own name with a number, and Save is never dead', () => {
    // "hub-ip-203-0-113-7-32" holds the office range here; the list asks for the office and for 203.0.113.7.
    const odd = list({ 'hub-ip-203-0-113-7-32': OFFICE });
    expect(ipsGroups(odd, [OFFICE, HOME])?.groups).toEqual({ 'hub-ip-203-0-113-7-32': { type: 'ip', range: OFFICE }, 'hub-ip-203-0-113-7-32-2': { type: 'ip', range: HOME } });
    expect(bodyFor(odd, modeOf(odd, 'no'), { kind: 'ips', ranges: [OFFICE, HOME] }, CID)).not.toBeNull();
    // Also when the group holding that name goes in the same save: the name does not move to another range.
    expect(ipsGroups(odd, [HOME])?.groups).toEqual({ 'hub-ip-203-0-113-7-32-2': { type: 'ip', range: HOME } });
  });

  it('a project has no people or keys of its own: its lines never say any are removed', () => {
    expect(ipsConfirmLines({ removed: [], ended: 2, me: { ip: '203.0.113.7', inside: true } })).toEqual([]);
  });

  it('an add names the addresses it removes: the whole list, or Only my IP\'s', () => {
    expect(addrGoing(list({ office: OFFICE, [ipGroupName(HOME)]: HOME })).sort()).toEqual([OFFICE, HOME].sort());
    expect(addrGoing(list({ [MY_IP_GROUP]: HOME }))).toEqual([HOME]);
    expect(addrGoing(doc({ groups: { 'hub-person-ana': ANA }, permissions: { 'hub-person-ana': { terminal: true } }, default: 'deny' }))).toEqual([]);
  });

  it('an address group beside people that the Hub did not name for its range is not a leftover: Advanced, nothing offered', () => {
    const foreign = doc({ groups: { 'hub-ip-office': { type: 'ip', range: '10.0.0.0/8' }, 'hub-person-ana': ANA }, permissions: { 'hub-ip-office': { terminal: true }, 'hub-person-ana': { terminal: true } }, default: 'deny' });
    expect(peopleOf(foreign)).toBeNull();
    expect(modeOf(foreign, 'no').kind).toBe('advanced');
    expect(finishSteps(foreign)).toEqual([]);
    // The Hub's own leftover still reads as a cut add.
    const own = doc({ groups: { [ipGroupName(OFFICE)]: { type: 'ip', range: OFFICE }, 'hub-person-ana': ANA }, permissions: { [ipGroupName(OFFICE)]: ALL, 'hub-person-ana': { terminal: true } }, default: 'deny' });
    expect(peopleOf(own)).toMatchObject({ unfinished: true, listLeft: true });
  });
});

describe('Only these IPs: a group with a name JavaScript objects reserve', () => {
  // The API keeps an old group named __proto__, constructor or prototype. Written as a key, __proto__ would vanish
  // from the saved document, and the proxy skips all three. Such a document is never the list: the Hub leaves it whole.
  const want = { kind: 'ips' as const, ranges: [HOME, OFFICE] };
  for (const name of ['__proto__', 'constructor', 'prototype']) {
    it(`${name}: the rules stay Advanced and nothing is written, on a computer and on a project`, () => {
      for (const r of [list({ [name]: HOME }), list({ [name]: HOME, office: OFFICE })]) {
        expect(r.groups.map((g) => g.name)).toContain(name);
        expect(ipsOf(r)).toBeNull();
        expect(modeOf(r, 'no')).toEqual({ kind: 'advanced', why: ['rules'] });
        expect(bodyFor(r, modeOf(r, 'no'), want, CID)).toBeNull();
        expect(projectMode(r)).toBe('advanced');
        expect(projectBodyFor(r, want, PID)).toBeNull();
        expect(projectReadsAs(r, { kind: 'ips', ips: r.groups.map((g) => g.range as string) })).toBe(false);
      }
    });

    it(`${name}: the groups a save builds never use the name, and what is sent holds every range`, () => {
      const g = ipsGroups(list({ [name]: HOME }), want.ranges)!;
      const sent = JSON.parse(JSON.stringify(g)) as { groups: Record<string, { range: string }>; permissions: Record<string, unknown> };
      expect(Object.keys(sent.groups).sort()).toEqual([ipGroupName(OFFICE), ipGroupName(HOME)].sort());
      expect(Object.values(sent.groups).map((x) => x.range).sort()).toEqual([OFFICE, HOME].sort());
      expect(Object.keys(sent.permissions).sort()).toEqual(Object.keys(sent.groups).sort());
    });
  }
});
