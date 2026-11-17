// The live mount's membership table (live-membership.ts):
// unknown, withheld, other-account and other-realm targets are refused while core's routingAllows answers true.
import { describe, expect, test } from 'bun:test';
import { MembershipTable, destinationVerdict, memberRowOf, membershipCallOf, type MemberCall, type MemberSelection, type MemberTarget, type MemberVerdict } from './live-membership';

const ACCOUNT = '64f0ada00000000000000001';
const R1 = '1'.repeat(24), R2 = '2'.repeat(24);
const P1 = 'a'.repeat(24), P2 = 'b'.repeat(24);
const C1 = 'c'.repeat(24), C2 = 'd'.repeat(24), C3 = 'e'.repeat(24);
const places = { apiOrigin: 'https://api.example.invalid', realmApiDomain: 'realms.example.invalid' };
const row = (id: string, o: { project?: string; server?: unknown; realms?: unknown } = {}): Record<string, unknown> =>
  ({ id, project_id: o.project ?? P1, server_name: 'server' in o ? o.server : 'node-1', realm_ids: 'realms' in o ? o.realms : [R1] });
const list = (rows: unknown[], pagination?: Record<string, number>): unknown => ({ data: { computers: rows, ...(pagination ? { pagination } : {}) } });
const target = (computer: string, o: Partial<MemberTarget> = {}): MemberTarget => ({ account: ACCOUNT, project: P1, computer, server: 'node-1', ...o });
const IN_R1: MemberSelection = { realm: R1, pin: null };
const ALL: MemberSelection = { realm: null, pin: null };
const call = (url: string): MemberCall => membershipCallOf('GET', url, places)!;
const LIST_R1 = `https://${R1}.realms.example.invalid/api/v1/computers`;
const LIST_ALL = 'https://api.example.invalid/api/v1/computers';
/** core's routingAllows forced true (it answers true while it has no evidence, routing.ts:55): only the table can refuse. */
const routingTrue = (): boolean => true;
const read = (t: MembershipTable, url: string, body: unknown, ok = true): void => { const c = call(url); t.answer(c, t.begin(), ok, body); };

describe('which reads fill the table', () => {
  test('the computer list, a project\'s computer list, one computer; on the API origin or a realm host of the realm API domain', () => {
    expect(membershipCallOf('GET', LIST_ALL, places)).toMatchObject({ kind: 'list', scope: { realm: null, project: null }, page: 1 });
    expect(membershipCallOf('GET', `${LIST_ALL}/?page=2&limit=50`, places)).toMatchObject({ kind: 'list', scope: { realm: null, project: null }, page: 2 });
    expect(membershipCallOf('GET', `${LIST_ALL}?realm_id=${R2}`, places)).toMatchObject({ kind: 'list', scope: { realm: R2, project: null } });
    expect(membershipCallOf('GET', LIST_R1, places)).toMatchObject({ kind: 'list', scope: { realm: R1, project: null } });
    expect(membershipCallOf('GET', `https://api.example.invalid/api/v1/projects/${P2}/computers?page=3`, places)).toMatchObject({ kind: 'list', scope: { realm: null, project: P2 }, page: 3 });
    expect(membershipCallOf('GET', `${LIST_ALL}/${C1.toUpperCase()}?runtime=1`, places)).toEqual({ kind: 'one', computer: C1, realm: null });
    // The enumeration ignores the page only: another limit or filter is another enumeration.
    expect(call(`${LIST_ALL}?page=1&limit=50`).kind === 'list' && (call(`${LIST_ALL}?page=1&limit=50`) as { enumeration: string }).enumeration)
      .toBe((call(`${LIST_ALL}?limit=50&page=2`) as { enumeration: string }).enumeration);
    expect((call(`${LIST_ALL}?limit=50`) as { enumeration: string }).enumeration).not.toBe((call(`${LIST_ALL}?limit=20`) as { enumeration: string }).enumeration);
  });
  test('anything else writes nothing', () => {
    for (const [m, u] of [
      ['POST', LIST_ALL],
      ['GET', 'https://api.example.invalid.evil.test/api/v1/computers'],
      ['GET', `https://${R1}.realms.example.invalid.evil.test/api/v1/computers`],
      ['GET', `https://${R1}.other.example.invalid/api/v1/computers`],
      ['GET', `http://${R1}.realms.example.invalid/api/v1/computers`],
      ['GET', 'https://user@api.example.invalid/api/v1/computers'],
      ['GET', `${LIST_R1}?realm_id=${R2}`],
      ['GET', `${LIST_ALL}?realm_id=nope`],
      ['GET', `${LIST_ALL}?page=1&page=2`],
      ['GET', `${LIST_ALL}?page=0`],
      ['GET', 'https://api.example.invalid/api/v1/computers/nope'],
      ['GET', `https://api.example.invalid/api/v1/computers/${C1}/stats`],
      ['GET', 'https://api.example.invalid/api/v1/projects'],
      ['GET', 'not a url'],
    ] as const) expect(membershipCallOf(m, u, places), `${m} ${u}`).toBeNull();
  });
  test('a row names a computer and its project; a server that is not an address label is withheld; unreadable realms = none', () => {
    expect(memberRowOf(row(C1.toUpperCase()), 1)).toEqual({ computer: C1, project: P1, server: 'node-1', realms: [R1], gen: 1 });
    expect(memberRowOf({ id: C1 }, 1)).toBeNull();
    expect(memberRowOf(row('x'), 1)).toBeNull();
    for (const s of [null, undefined, '', 7, 'Node 1', 'a.b', '-x']) expect(memberRowOf(row(C1, { server: s }), 1)!.server, String(s)).toBe('');
    expect(memberRowOf(row(C1, { realms: [R1, 'x'] }), 1)!.realms).toEqual([]);
    expect(memberRowOf(row(C1, { realms: undefined }), 1)!.realms).toEqual([]);
  });
});

describe('unknown is a refusal, whatever core\'s routing says', () => {
  test('no row, a withheld server, another account, another realm, another project, another server: refused with routingAllows true', () => {
    const t = new MembershipTable(ACCOUNT);
    expect(destinationVerdict(t, target(C1), IN_R1, routingTrue)).toEqual({ ok: false, code: 'TERM_DESTINATION', why: 'unknown' });
    read(t, LIST_R1, list([row(C1), row(C2, { server: null }), row(C3, { realms: [R2] })]));
    expect(destinationVerdict(t, target(C1), IN_R1, routingTrue)).toEqual({ ok: true });
    const cases: Array<[MemberTarget, MemberSelection, Exclude<MemberVerdict, 'ok'>]> = [
      [target(C2), IN_R1, 'withheld'],
      [target(C1, { account: '64f0ada00000000000000002' }), IN_R1, 'other-account'],
      [target(C3), IN_R1, 'other-realm'],
      [target(C1), { realm: R2, pin: null }, 'other-realm'],
      [target(C1), { realm: null, pin: R2 }, 'other-realm'],
      [target(C1, { project: P2 }), IN_R1, 'other-project'],
      [target(C1, { server: 'node-2' }), IN_R1, 'other-server'],
      [target(C1, { server: null }), IN_R1, 'other-server'],
      [target('f'.repeat(24)), IN_R1, 'unknown'],
    ];
    for (const [tg, sel, why] of cases) expect(destinationVerdict(t, tg, sel, routingTrue), why).toEqual({ ok: false, code: 'TERM_DESTINATION', why });
    // "All realms": any realm of the account's own rows; the pin still binds an access key.
    expect(destinationVerdict(t, target(C3), ALL, routingTrue)).toEqual({ ok: true });
    expect(destinationVerdict(t, target(C3), { realm: null, pin: R1 }, routingTrue).ok).toBe(false);
  });
  test('core\'s routing may refuse more, never less', () => {
    const t = new MembershipTable(ACCOUNT);
    read(t, LIST_R1, list([row(C1)]));
    expect(destinationVerdict(t, target(C1), IN_R1, () => false)).toEqual({ ok: false, code: 'TERM_DESTINATION', why: 'routing' });
  });
});

describe('what writes and removes rows', () => {
  test('a late answer never overwrites a newer one; an identical answer changes nothing', () => {
    let changes = 0;
    const t = new MembershipTable(ACCOUNT, () => { changes++; });
    const a = t.begin(), b = t.begin();
    t.answer(call(LIST_R1), b, true, list([row(C1, { server: 'node-2' })]));
    t.answer(call(LIST_R1), a, true, list([row(C1, { server: 'node-1' })]));
    expect(t.verdict(target(C1, { server: 'node-2' }), IN_R1)).toBe('ok');
    expect(changes).toBe(1);
    read(t, LIST_R1, list([row(C1, { server: 'node-2' })]));
    expect(changes).toBe(1);
    read(t, `${LIST_ALL}/${C1}`, { data: row(C1, { server: 'node-3' }) });
    expect(t.verdict(target(C1, { server: 'node-3' }), IN_R1), 'one computer replaces its row at once').toBe('ok');
    expect(changes).toBe(2);
  });
  test('an answer to a read that was never issued, or issued before a clear (a realm switch), is ignored', () => {
    const t = new MembershipTable(ACCOUNT);
    t.answer(call(LIST_R1), 1, true, list([row(C1)]));
    expect(t.snapshot()).toEqual([]);
    const before = t.begin();
    read(t, LIST_R1, list([row(C2)]));
    t.clear();
    expect(t.snapshot()).toEqual([]);
    t.answer(call(LIST_R1), before, true, list([row(C1)]));
    expect(t.verdict(target(C1), IN_R1)).toBe('unknown');
  });
  test('absent from a complete list: removed; a list that is not complete removes nothing', () => {
    const t = new MembershipTable(ACCOUNT);
    read(t, LIST_R1, list([row(C1), row(C2)]));
    read(t, LIST_R1, list([row(C1)], { total: 1, page: 1, limit: 50, totalPages: 1 }));
    expect(t.verdict(target(C2), IN_R1)).toBe('unknown');
    // Two pages: page 1 alone proves nothing about C3; both pages, and C3 is in neither: gone.
    read(t, LIST_R1, list([row(C1), row(C3)]));
    const p1 = t.begin();
    t.answer(call(`${LIST_R1}?page=1&limit=1`), p1, true, list([row(C1)], { total: 2, page: 1, limit: 1, totalPages: 2 }));
    expect(t.verdict(target(C3), IN_R1)).toBe('ok');
    t.answer(call(`${LIST_R1}?page=2&limit=1`), t.begin(), true, list([row(C2)], { total: 2, page: 2, limit: 1, totalPages: 2 }));
    expect(t.verdict(target(C3), IN_R1)).toBe('unknown');
    expect(t.verdict(target(C1), IN_R1)).toBe('ok');
    expect(t.verdict(target(C2), IN_R1)).toBe('ok');
  });
  test('pages that disagree on the page count, or a later page with no count, never complete an enumeration', () => {
    const t = new MembershipTable(ACCOUNT);
    read(t, LIST_R1, list([row(C3)]));
    t.answer(call(`${LIST_R1}?page=1&limit=1`), t.begin(), true, list([row(C1)], { totalPages: 2 }));
    t.answer(call(`${LIST_R1}?page=2&limit=1`), t.begin(), true, list([row(C2)], { totalPages: 3 }));
    expect(t.verdict(target(C3), IN_R1)).toBe('ok');
    t.answer(call(`${LIST_R1}?page=2&limit=1`), t.begin(), true, list([row(C2)]));
    expect(t.verdict(target(C3), IN_R1)).toBe('ok');
  });
  test('a computer written by a read issued AFTER the enumeration started is not removed by it', () => {
    const t = new MembershipTable(ACCOUNT);
    const p1 = t.begin();
    read(t, `${LIST_ALL}/${C2}`, { data: row(C2) });
    t.answer(call(LIST_R1), p1, true, list([row(C1)]));
    expect(t.verdict(target(C2), IN_R1)).toBe('ok');
  });
  test('a complete list removes only its own scope: another realm\'s or project\'s rows stay', () => {
    const t = new MembershipTable(ACCOUNT);
    read(t, LIST_ALL, list([row(C1), row(C2, { realms: [R2] }), row(C3, { project: P2 })]));
    read(t, LIST_R1, list([row(C3, { project: P2 })]));
    expect(t.verdict(target(C1), IN_R1)).toBe('unknown');
    expect(t.verdict(target(C2), ALL)).toBe('ok');
    read(t, `https://api.example.invalid/api/v1/projects/${P2}/computers`, list([]));
    expect(t.verdict(target(C3, { project: P2 }), ALL)).toBe('unknown');
    expect(t.verdict(target(C2), ALL)).toBe('ok');
  });
  test('a failed list read clears its scope; a failed single read clears that computer; other rows stay', () => {
    const t = new MembershipTable(ACCOUNT);
    read(t, LIST_ALL, list([row(C1), row(C2, { realms: [R2] }), row(C3)]));
    read(t, LIST_R1, { error: 'x' }, false);
    expect(t.verdict(target(C1), ALL)).toBe('unknown');
    expect(t.verdict(target(C3), ALL)).toBe('unknown');
    expect(t.verdict(target(C2), ALL)).toBe('ok');
    read(t, `${LIST_ALL}/${C2}`, null, false);
    expect(t.verdict(target(C2), ALL)).toBe('unknown');
    // A successful answer that does not hold a readable list is a failed read too.
    read(t, LIST_ALL, list([row(C1)]));
    read(t, LIST_ALL, { data: { computers: 'x' } });
    expect(t.verdict(target(C1), ALL)).toBe('unknown');
    // A single answer naming ANOTHER computer is not this computer's row: its row goes.
    read(t, LIST_ALL, list([row(C1)]));
    read(t, `${LIST_ALL}/${C1}`, { data: row(C2) });
    expect(t.verdict(target(C1), ALL)).toBe('unknown');
    expect(t.verdict(target(C2), ALL)).toBe('unknown');
  });
  test('every change calls onChange once (the policy generation bumps)', () => {
    let changes = 0;
    const t = new MembershipTable(ACCOUNT, () => { changes++; });
    read(t, LIST_R1, list([row(C1), row(C2)]));
    expect(changes).toBe(1);
    read(t, LIST_R1, list([row(C1)]));
    expect(changes).toBe(2);
    t.clear();
    expect(changes).toBe(3);
    t.clear();
    expect(changes).toBe(3);
  });
});
