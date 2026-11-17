// The project permissions logic: levels, rules and who may change them.
import { describe, expect, it } from 'vitest';
import { explainProjectStart, projectSnapshotOf, rulesFrom, summaryOf, type AccessRules } from './access.logic';
import { counts, levelsFor, projectComputersOf, linesOf, LEVEL_LINES, lost, mayChangeRules, membersFrom, myLevel, ownOf, peopleFact, projectBodyFor, projectFact, projectMode, projectReadsAs, projectSummary, projectWriteVerdict, rulesConfirmLines, rulesReadProblem, sharedWithMe, sourceOf } from './projectPerms.logic';

// Builds a fake credential from parts, so no source line holds a whole key-shaped string.
const fake = (...p: string[]) => p.join('');

const ME = 'a'.repeat(24);
const OTHER = 'b'.repeat(24);
const row = (id: string, level: string, user: { id: string; username?: string; alias?: string | null }) => ({ id, user_id: user.id, permission_level: level, user });
const answer = (rows: unknown[], total?: number) => ({ data: { permissions: rows, pagination: { total: total ?? rows.length } } });
const doc = (d: Record<string, unknown>): AccessRules => rulesFrom({ data: { file_version: 3, project: 'e'.repeat(24), ...d } })!;

describe('project permissions logic', () => {
  it('membersFrom: alias over username, an unknown level counted and never shown, the owner row marked, ids never names', () => {
    const r = membersFrom(answer([row('m1', 'edit', { id: OTHER, username: 'jane', alias: 'Jane S' }), row('m2', 'read', { id: 'c'.repeat(24), username: 'bob' }), row('m3', 'admin', { id: 'd'.repeat(24), username: 'x' }), row('m4', 'delete', { id: ME, username: 'ada' })]), ME)!;
    expect(r.members.map((m) => [m.name, m.level, m.owner])).toEqual([['Jane S', 'edit', false], ['bob', 'read', false], ['ada', 'delete', true]]);
    expect(r.unknown).toBe(1);
    expect(r.members.every((m) => !m.name.includes(m.accountId))).toBe(true);
    expect(membersFrom({ data: {} })).toBeNull();
    // Owner unknown: no owner row is claimed.
    expect(membersFrom(answer([row('m4', 'delete', { id: ME, username: 'ada' })]))!.members[0]!.owner).toBe(false);
  });

  it('myLevel: owner by the known owner; a member by its own row; neither, or no owner known, is unknown', () => {
    const r = membersFrom(answer([row('m1', 'edit', { id: ME, username: 'ada' })]))!;
    expect(myLevel({ owner: ME }, r, ME)).toBe('owner');
    expect(myLevel({ owner: OTHER }, r, ME)).toBe('edit');
    expect(myLevel({ owner: OTHER }, membersFrom(answer([]))!, ME)).toBe('unknown');
    expect(myLevel({}, r, ME)).toBe('unknown');
    expect(sharedWithMe({ owner: OTHER }, ME)).toBe(true);
    expect(sharedWithMe({ owner: ME }, ME)).toBe(false);
    expect(sharedWithMe({}, ME)).toBe(false);
  });

  it('levelsFor and lost follow the one level table', () => {
    expect(levelsFor('owner')).toEqual(['read', 'edit', 'delete']);
    expect(levelsFor('delete')).toEqual(['read', 'edit', 'delete']);
    expect(levelsFor('edit')).toEqual(['read', 'edit']);
    expect(levelsFor('read')).toEqual([]);
    expect(levelsFor('unknown')).toEqual([]);
    expect(lost('delete', 'read')).toEqual([...LEVEL_LINES.edit, ...LEVEL_LINES.delete]);
    expect(lost('delete', 'edit')).toEqual(expect.arrayContaining(['pp.can.rules', 'pp.can.peopleAll', 'pp.can.deleteAll']));
    expect(lost('edit', 'read')).toEqual(LEVEL_LINES.edit);
    expect(lost('read', 'delete')).toEqual([]);
    expect(linesOf('edit')).toEqual([...LEVEL_LINES.read, ...LEVEL_LINES.edit]);
  });

  it('peopleFact: only you, a count, at least (cut or unknown level), failed, key, reading', () => {
    expect(peopleFact(membersFrom(answer([]))!)).toEqual({ key: 'pp.fact.onlyYou' });
    expect(peopleFact(membersFrom(answer([row('m1', 'read', { id: OTHER })]))!)).toEqual({ key: 'pp.fact.people', count: 1, atLeast: false });
    expect(peopleFact(membersFrom(answer([row('m1', 'read', { id: OTHER })], 7))!)).toEqual({ key: 'pp.fact.people', count: 1, atLeast: true });
    // Only rows of an unknown level: nobody named, nothing proved.
    expect(peopleFact(membersFrom(answer([row('m1', 'boss', { id: OTHER })]))!)).toEqual({ key: 'pp.fact.people.uncounted' });
    expect(peopleFact(membersFrom(answer([row('m1', 'boss', { id: OTHER }), row('m2', 'read', { id: ME })]))!)).toEqual({ key: 'pp.fact.people', count: 1, atLeast: true });
    // No total, or one that is not a number: never "Only you" and never an exact count.
    expect(peopleFact(membersFrom({ data: { permissions: [] } })!)).toEqual({ key: 'pp.fact.people.uncounted' });
    expect(peopleFact(membersFrom({ data: { permissions: [], pagination: { total: 'many' } } })!)).toEqual({ key: 'pp.fact.people.uncounted' });
    expect(peopleFact(membersFrom({ data: { permissions: [row('m1', 'read', { id: OTHER })] } })!)).toEqual({ key: 'pp.fact.people', count: 1, atLeast: true });
    // The owner's own row is not a person.
    expect(peopleFact(membersFrom(answer([row('m1', 'delete', { id: ME })]), ME)!)).toEqual({ key: 'pp.fact.onlyYou' });
    expect(peopleFact('failed')).toEqual({ key: 'pp.fact.people.failed' });
    expect(peopleFact('key')).toEqual({ key: 'pp.fact.people.key' });
    expect(peopleFact(undefined)).toBeNull();
  });

  it('projectFact: the default document is none; deny with no groups, or addresses off, is set; unread is failed', () => {
    expect(projectFact(doc({ groups: {}, permissions: {}, default: 'allow' }))).toBe('pp.fact.rules.none');
    expect(projectFact(doc({ groups: {}, permissions: {}, default: 'deny' }))).toBe('pp.fact.rules.set');
    expect(projectFact(doc({ groups: {}, permissions: {}, default: 'allow', enable_proxy: false }))).toBe('pp.fact.rules.set');
    expect(projectFact(null)).toBe('pp.fact.rules.failed');
    expect(projectFact('key')).toBe('pp.fact.rules.key');
  });

  it("projectMode: plain, the Hub's own Only my IP and Private, and everything else advanced", () => {
    expect(projectMode(doc({ groups: {}, permissions: {}, default: 'allow' }))).toBe('none');
    expect(projectMode(doc({ groups: {}, permissions: {}, default: 'deny' }))).toBe('private');
    expect(projectMode(doc({ groups: { 'hub-my-ip': { type: 'ip', range: '203.0.113.7/32' } }, permissions: { 'hub-my-ip': { '*': true, logs: true } }, default: 'deny' }))).toBe('myIp');
    expect(projectMode(doc({ groups: { team: { type: 'password', password: 'x' } }, permissions: { team: { '*': true } }, default: 'deny' }))).toBe('advanced');
    expect(projectMode(doc({ groups: {}, permissions: {}, default: 'allow', enable_proxy: false }))).toBe('advanced');
    expect(projectMode(doc({ groups: { a: { type: 'ip', range: '10.0.0.1/32' }, b: { type: 'ip', range: '10.0.0.2/32' } }, permissions: {}, default: 'deny' }))).toBe('advanced');
  });

  it("summaryOf for a project says no hooks line and no project lines; the computer's summary is unchanged", () => {
    const r = doc({ groups: {}, permissions: {}, default: 'deny', hooks: { request: [{ url: 'https://example.com' }] } });
    const computer = summaryOf(r, 'yes').map((l) => l.key);
    const project = projectSummary(r).map((l) => l.key);
    expect(project).not.toContain('sum.hooks');
    expect(project).not.toContain('sum.ownLead');
    expect(project).not.toContain('sum.projectToo');
    expect(computer).toContain('sum.ownLead');
    expect(computer).toContain('sum.projectToo');
  });

  it('ownOf: the container state wins over scope; scope project or none is not known (an Anyone computer under a Private project)', () => {
    expect(ownOf({ proxy_permissions_computer_state: 'missing', proxy_permissions_scope: 'computer' })).toBe('no');
    expect(ownOf({ proxy_permissions_computer_state: 'default' })).toBe('yes');
    expect(ownOf({ proxy_permissions_computer_state: 'applied' })).toBe('yes');
    expect(ownOf({ proxy_permissions_computer_state: 'invalid' })).toBe('failed');
    expect(ownOf({ proxy_permissions_scope: 'project' })).toBe('notKnown');
    expect(ownOf({ proxy_permissions_scope: 'none' })).toBe('notKnown');
    expect(ownOf({ proxy_permissions_scope: 'both' })).toBe('yes');
    expect(ownOf({ proxy_permissions_scope: 'unknown' })).toBe('failed');
    expect(ownOf({})).toBe('failed');
  });

  it('sourceOf: the whole table; anything not certain is null', () => {
    expect(sourceOf('no', 'yes')).toBe('pp.cx.by.project');
    expect(sourceOf('no', 'no')).toBe('pp.cx.by.open');
    expect(sourceOf('yes', 'yes')).toBe('pp.cx.by.both');
    expect(sourceOf('yes', 'no')).toBe('pp.cx.by.own');
    for (const own of ['yes', 'no', 'notKnown', 'failed'] as const) expect(sourceOf(own, 'unknown')).toBeNull();
    for (const p of ['yes', 'no'] as const) {
      expect(sourceOf('notKnown', p)).toBeNull();
      expect(sourceOf('failed', p)).toBeNull();
    }
  });

  it('counts: of the computers shown, with the ones that cannot be told apart', () => {
    expect(counts([{ proxy_permissions_computer_state: 'missing' }, { proxy_permissions_scope: 'both' }, { proxy_permissions_scope: 'project' }])).toEqual({ shown: 3, full: 1, own: 1, unknown: 1 });
    expect(counts([])).toEqual({ shown: 0, full: 0, own: 0, unknown: 0 });
  });
});

describe('project access rules logic', () => {
  it("projectFact: a project's hooks make no rules (the edge never runs them); a 403 refusal is its own fact", () => {
    expect(projectFact(doc({ groups: {}, permissions: {}, default: 'allow', hooks: { terminal: [{ url: 'https://h.example' }] } }))).toBe('pp.fact.rules.none');
    expect(projectFact(doc({ groups: { a: { type: 'ip', range: '10.0.0.1/32' } }, permissions: { a: { '*': true } }, default: 'deny' }))).toBe('pp.fact.rules.set');
    expect(projectFact('level')).toBe('pp.fact.rules.level');
    expect(projectFact('failed')).toBe('pp.fact.rules.failed');
  });

  it("rulesReadProblem: only the server's 403 says the level; any other failure is failed", () => {
    expect(rulesReadProblem({ status: 403 })).toBe('level');
    expect(rulesReadProblem({ status: 404 })).toBe('failed');
    expect(rulesReadProblem({ status: 500 })).toBe('failed');
    expect(rulesReadProblem(new Error('x'))).toBe('failed');
    expect(rulesReadProblem(null)).toBe('failed');
    // A framed page's refusal is a 403 that sent nothing: failed (its own words), never the level.
    expect(rulesReadProblem({ status: 403, code: 'FRAMED_ACTION_REFUSED', framed: true, notSent: true })).toBe('failed');
  });

  it("summaryOf for a project: no own-rules lead, no project or hooks line; addresses off says the project's words", () => {
    const ip = doc({ groups: { 'hub-my-ip': { type: 'ip', range: '203.0.113.7/32' } }, permissions: { 'hub-my-ip': { '*': true } }, default: 'deny', hooks: { t: [{}] } });
    expect(summaryOf(ip, 'yes', 'project').map((l) => l.key)).toEqual(['sum.only']);
    expect(summaryOf(ip, 'yes').map((l) => l.key)).toEqual(['sum.ownLead', 'sum.only', 'sum.projectToo', 'sum.hooks']);
    expect(summaryOf(doc({ groups: {}, permissions: {}, default: 'allow', enable_proxy: false }), 'no', 'project').map((l) => l.key)).toEqual(['sum.offProject']);
    expect(summaryOf(doc({ groups: {}, permissions: {}, default: 'allow', enable_proxy: false }), 'no').map((l) => l.key)).toEqual(['sum.off']);
  });

  it('the project snapshot: the document without any credential, then each computer shown with its own-rules state', () => {
    const raw = { data: { file_version: 7, groups: { team: { type: 'password', username: 'ops', password: fake('pw-', 'SECRET-1'), salt: 'salt-SECRET-2' }, bots: { type: 'token', token: 'tok-SECRET-3' } }, permissions: { team: { terminal: true } }, default: 'deny' } };
    const { text, left } = projectSnapshotOf('Web', rulesFrom(raw)!, [{ name: 'atlas', own: 'yes' }, { name: 'zephyr', own: 'no' }, { name: 'orion', own: 'notKnown' }, { name: 'vega', own: 'failed' }]);
    expect(left).toBe(0);
    expect(text).not.toMatch(/SECRET/);
    expect(text).toContain('Access rules of project "Web"');
    expect(text).toContain('Computers of this project shown in the Hub (4):');
    expect(text).toContain('computer "atlas": has rules of its own');
    expect(text).toContain('computer "zephyr": has no rules of its own');
    expect(text).toContain('computer "orion": the Hub cannot tell');
    expect(text).toContain('computer "vega": the Hub could not read');
    // No computer shown: the project block alone, never "(0)".
    expect(projectSnapshotOf('Web', rulesFrom(raw)!, []).text).not.toContain('Computers of this project');
  });

  it('the project snapshot is bounded and counts what it left out; the Explain start fits its room', () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ name: `computer-${i}`, own: 'no' as const }));
    const d = doc({ groups: {}, permissions: {}, default: 'allow' });
    const { text, left } = projectSnapshotOf('Web', d, many, 2000);
    expect(text.length).toBeLessThanOrEqual(2000);
    expect(left).toBeGreaterThan(0);
    const q = explainProjectStart('Web', d, many, 3000);
    expect(q.text.length + q.context.length).toBeLessThanOrEqual(3000);
    expect(q.text).toMatch(/Do not change anything/);
  });
});

describe('changing the project rules', () => {
  const PID = 'e'.repeat(24);
  const ipDoc = (ip = '203.0.113.7', extra: Record<string, unknown> = {}) => doc({ groups: { 'hub-my-ip': { type: 'ip', range: `${ip}/32` } }, permissions: { 'hub-my-ip': { '*': true, logs: true } }, default: 'deny', ...extra });
  const shut = (extra: Record<string, unknown> = {}) => doc({ groups: {}, permissions: {}, default: 'deny', ...extra });
  const open = (extra: Record<string, unknown> = {}) => doc({ groups: {}, permissions: {}, default: 'allow', enable_proxy: true, ...extra });
  const at = (r: AccessRules, version: number): AccessRules => ({ ...r, version });

  it('who may change them: the owner and a Full control member only', () => {
    expect(mayChangeRules('owner')).toBe(true);
    expect(mayChangeRules('delete')).toBe(true);
    for (const m of ['edit', 'read', 'unknown'] as const) expect(mayChangeRules(m)).toBe(false);
  });

  it('projectBodyFor: the whole document for Only my IP and Private, the project named, enable_proxy kept as stored', () => {
    expect(projectBodyFor(open(), { kind: 'myIp', ip: '198.51.100.4' }, PID)).toEqual({ project: PID, enable_proxy: true, groups: { 'hub-my-ip': { type: 'ip', range: '198.51.100.4/32' } }, permissions: { 'hub-my-ip': { '*': true, logs: true } }, default: 'deny' });
    expect(projectBodyFor(ipDoc(), { kind: 'private' }, PID)).toEqual({ project: PID, groups: {}, permissions: {}, default: 'deny' });
    // No project rules is the DELETE: no document.
    expect(projectBodyFor(ipDoc(), { kind: 'none' }, PID)).toBeNull();
    // Never over a document set elsewhere (it would be lost), never for an address that is not one IPv4 address.
    expect(projectBodyFor(doc({ groups: { team: { type: 'password' } }, permissions: { team: { files: true } }, default: 'deny' }), { kind: 'private' }, PID)).toBeNull();
    expect(projectBodyFor(shut({ hooks: { terminal: [{ url: 'https://h.example' }] } }), { kind: 'private' }, PID)).toBeNull();
    expect(projectBodyFor(shut({ enable_proxy: false }), { kind: 'private' }, PID)).toBeNull();
    expect(projectBodyFor(open(), { kind: 'myIp', ip: '2001:db8::7' }, PID)).toBeNull();
    expect(projectBodyFor(open(), { kind: 'myIp', ip: '203.0.113.7/32' }, PID)).toBeNull();
    expect(projectBodyFor(open(), { kind: 'private' }, 'not-an-id')).toBeNull();
  });

  it('projectReadsAs: the open document is No project rules; Only my IP needs the same address', () => {
    expect(projectReadsAs(open(), { kind: 'none' })).toBe(true);
    expect(projectReadsAs(shut(), { kind: 'none' })).toBe(false);
    expect(projectReadsAs(shut(), { kind: 'private' })).toBe(true);
    expect(projectReadsAs(ipDoc(), { kind: 'myIp', ip: '203.0.113.7' })).toBe(true);
    expect(projectReadsAs(ipDoc(), { kind: 'myIp', ip: '198.51.100.4' })).toBe(false);
    expect(projectReadsAs(ipDoc(), { kind: 'private' })).toBe(false);
  });

  it('projectWriteVerdict: only a newer version of this project proves it; reads as asked = applied, else not_applied', () => {
    const i = { project: PID, want: 'private', from: 3 };
    const of = (r: AccessRules, pid = PID) => [[{ [pid]: r }]];
    expect(projectWriteVerdict(i, of(at(shut(), 3)))).toBeUndefined();
    expect(projectWriteVerdict(i, of(at(shut(), 2)))).toBeUndefined();
    expect(projectWriteVerdict(i, of(at(shut(), 4)))).toBe('applied');
    expect(projectWriteVerdict(i, of(at(open(), 4)))).toBe('not_applied');
    // Another project's answer proves nothing about this one.
    expect(projectWriteVerdict(i, of(at(shut(), 9), 'f'.repeat(24)))).toBeUndefined();
    expect(projectWriteVerdict(i, [[]])).toBeUndefined();
    // A removed document reads as the open one at the next version (the API's version floor).
    expect(projectWriteVerdict({ project: PID, want: 'none', from: 3 }, of(at(open(), 4)))).toBe('applied');
    expect(projectWriteVerdict({ project: PID, want: 'none', from: 3 }, of(at(shut(), 4)))).toBe('not_applied');
    expect(projectWriteVerdict({ project: PID, want: 'myIp', ip: '203.0.113.7', from: 3 }, of(at(ipDoc(), 4)))).toBe('applied');
    expect(projectWriteVerdict({ project: PID, want: 'myIp', ip: '198.51.100.4', from: 3 }, of(at(ipDoc(), 4)))).toBe('not_applied');
    // An identity recorded without what it needs proves nothing.
    expect(projectWriteVerdict({ project: PID, from: 3 }, of(at(shut(), 4)))).toBeUndefined();
    expect(projectWriteVerdict({ want: 'private', from: 3 }, of(at(shut(), 4)))).toBeUndefined();
  });

  it('rulesConfirmLines: the mode line first; owner counts only when non-zero, the exact effect only for those following only the project; a member gets noList', () => {
    const keys = (l: ReturnType<typeof rulesConfirmLines>) => l.map((x) => x.key);
    for (const kind of ['none', 'private'] as const) {
      expect(keys(rulesConfirmLines({ kind }, null))).toEqual([`pp.rules.confirm.mode.${kind}`, 'pp.rules.confirm.noList', 'pp.rules.confirm.others', 'pp.rules.confirm.delay']);
    }
    const member = rulesConfirmLines({ kind: 'myIp', ip: '203.0.113.7' }, null);
    expect(member[0]).toEqual({ key: 'pp.rules.confirm.mode.myIp', vars: { ip: '203.0.113.7' } });
    expect(keys(member)).not.toContain('pp.rules.confirm.full');
    const owner = rulesConfirmLines({ kind: 'myIp', ip: '203.0.113.7' }, { shown: 3, full: 1, own: 1, unknown: 1 });
    expect(owner).toEqual([
      { key: 'pp.rules.confirm.mode.myIp', vars: { ip: '203.0.113.7' } },
      { key: 'pp.rules.confirm.full', vars: { full: 1 }, effect: { key: 'pp.rules.eff.myIp.full', vars: { ip: '203.0.113.7' } } },
      { key: 'pp.rules.confirm.own', vars: { own: 1 } },
      { key: 'pp.rules.confirm.unknown', vars: { unknown: 1 } },
      { key: 'pp.rules.confirm.others' },
      { key: 'pp.rules.confirm.delay' },
    ]);
    expect(keys(rulesConfirmLines({ kind: 'private' }, { shown: 2, full: 0, own: 2, unknown: 0 }))).toEqual(['pp.rules.confirm.mode.private', 'pp.rules.confirm.own', 'pp.rules.confirm.others', 'pp.rules.confirm.delay']);
    // An empty project (owner, nothing shown): the mode line and the lines every confirm carries.
    expect(keys(rulesConfirmLines({ kind: 'none' }, { shown: 0, full: 0, own: 0, unknown: 0 }))).toEqual(['pp.rules.confirm.mode.none', 'pp.rules.confirm.others', 'pp.rules.confirm.delay']);
  });

  it("counts: a computer with its own hub-my-ip, a program cell or addresses off counts as own (no exact promise); a stored default one too; no state is never 'follows'", () => {
    expect(counts([{ proxy_permissions_computer_state: 'applied' }, { proxy_permissions_computer_state: 'default' }, { proxy_permissions_computer_state: 'missing' }, { proxy_permissions_scope: 'project' }, { proxy_permissions_computer_state: 'invalid' }])).toEqual({ shown: 5, full: 1, own: 2, unknown: 2 });
  });
});

describe('the project computer list', () => {
  it('projectComputersOf: whole rows and the API total, else null (a read error), never a partial list or "no computers"', () => {
    const a = { id: 'a'.repeat(24), name: 'atlas', status: 'running', project_id: 'p' };
    expect(projectComputersOf({ data: { computers: [a], pagination: { total: 7 } } })).toEqual({ rows: [a], total: 7 });
    expect(projectComputersOf({ data: { computers: [], pagination: { total: 0 } } })).toEqual({ rows: [], total: 0 });
    // One malformed row makes the answer unreadable: dropping it would count a partial list as the list.
    for (const r of [{ name: 'no id', status: 'running' }, null, { id: '', name: 'x', status: 'running' }, { id: 'b'.repeat(24), status: 'running' }, { id: 'b'.repeat(24), name: 3, status: 'running' }, { id: 'b'.repeat(24), name: 'x' }, { id: 'b'.repeat(24), name: 'x', status: 7 }]) {
      expect(projectComputersOf({ data: { computers: [a, r], pagination: { total: 2 } } })).toBeNull();
    }
    // A total the answer does not state, or one below the rows it sent, is not an answer we can count against.
    expect(projectComputersOf({ data: { computers: [a] } })).toBeNull();
    for (const total of [-1, '3', 1.5, Number.NaN, 0]) expect(projectComputersOf({ data: { computers: [a], pagination: { total } } })).toBeNull();
    for (const bad of [null, {}, { data: {} }, { data: { computers: 'x' } }]) expect(projectComputersOf(bad)).toBeNull();
  });

  it('projectComputersOf: the expiry flag (host_reinstalled) is a boolean or absent; anything else makes the answer unreadable', () => {
    const a = { id: 'a'.repeat(24), name: 'atlas', status: 'running', project_id: 'p' };
    const gone = { id: 'c'.repeat(24), name: 'cedar', status: 'host_reinstalled', project_id: 'p', server_expired: true, server_expired_reason: 'r' };
    const live = { ...a, server_expired: false };
    expect(projectComputersOf({ data: { computers: [a, gone, live], pagination: { total: 3 } } })).toEqual({ rows: [a, gone, live], total: 3 });
    for (const v of [null, 'true', 1, 0, {}]) {
      expect(projectComputersOf({ data: { computers: [a, { ...gone, server_expired: v }], pagination: { total: 2 } } })).toBeNull();
    }
  });
});
