// The start realm of `hoody hub`. Nothing is sent: the
// alias map and GET /realms are fakes; `idsForAlias` is a stand-in with the CLI's folding (lowercase + trim).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Order: --realm > HOODY_REALM > HOODY_REALM_ID > profile > account default > All realms, each named in the line | 'order' |
// | 2 | 24-hex is an id (no name read); global/all are All realms, never names | 'ids and all' |
// | 3 | A name: one id → it; none → refused with the shown value and the names; two → ambiguous, `name  id`, pass the id | 'names' |
// | 4 | Names unreadable: the CLI's sentence, exit 1 | 'names unreadable' |
// | 5 | An access key's realm is never widened: another realm or All realms refused (exit 2); none asked → its realm | 'access key' |
// | 6 | A typed value is never echoed raw (controls, bidi, length) | 'shown value' |
// | 7 | Nothing asked: the last run's realm while still listed > account default > the realm with the most computers (never an empty one) > All realms | 'saved and fullest' |
// | 8 | No answer to the realm list: All realms, and the line says the list could not be read (never "no default realm set") | 'order' |
import { describe, expect, test } from 'bun:test';
import { resolveStartRealm, shownRealmValue, type StartRealmInput } from './start-realm';

const A = '64f0ada000000000000000aa', B = '64f0ada000000000000000bb', C = '64f0ada000000000000000cc';
const MAP = { [A]: 'Work', [B]: 'Home', [C]: 'home ' };
const fold = (s: string): string => s.trim().toLowerCase();
const ids = (map: Readonly<Record<string, string>>, alias: string): string[] => Object.entries(map).filter(([, n]) => fold(n) === fold(alias)).map(([id]) => id).sort();

function input(over: Partial<StartRealmInput> = {}, log: string[] = []): StartRealmInput {
  return {
    env: {},
    names: async () => { log.push('names'); return { ok: true, map: MAP }; },
    idsForAlias: ids,
    realms: async () => { log.push('realms'); return [{ id: B, name: 'Home', is_default: false }, { id: A, name: 'Work', is_default: true }]; },
    ...over,
  };
}

describe('the start realm', () => {
  test('saved and fullest', async () => {
    const rows = [{ id: C, computers: 2 }, { id: B, name: 'Home', computers: 7 }, { id: A, name: 'Work', computers: 7 }];
    const realms = async (): Promise<typeof rows> => rows;
    // Nothing saved: the realm with the most computers; a tie goes to the first id.
    expect(await resolveStartRealm(input({ realms }))).toEqual({ ok: true, realm: A, source: 'most-computers', line: 'realm Work, the realm with the most computers' });
    // The last run's realm wins while the account still lists it, even with fewer computers; a name is optional.
    expect(await resolveStartRealm(input({ realms, saved: C }))).toEqual({ ok: true, realm: C, source: 'saved', line: `realm ${C}, where you left off` });
    expect(await resolveStartRealm(input({ realms, saved: B.toUpperCase() }))).toMatchObject({ realm: B, source: 'saved', line: 'realm Home, where you left off' });
    // All realms was the last place: no list is needed.
    const log: string[] = [];
    expect(await resolveStartRealm(input({ saved: 'all' }, log))).toEqual({ ok: true, realm: 'all', source: 'saved', line: 'All realms, where you left off' });
    expect(log).toEqual([]);
    // A saved realm the account no longer lists, a value of another shape, or no answer to the list: skipped.
    expect(await resolveStartRealm(input({ realms, saved: 'f'.repeat(24) }))).toMatchObject({ realm: A, source: 'most-computers' });
    expect(await resolveStartRealm(input({ realms, saved: 'Work' }))).toMatchObject({ realm: A, source: 'most-computers' });
    expect(await resolveStartRealm(input({ realms: async () => { throw new Error('no answer'); }, saved: C }))).toEqual({ ok: true, realm: 'all', source: 'first-run', line: 'All realms, the realm list could not be read' });
    // Never an empty realm by itself: no computers anywhere, counts missing or of another shape -> All realms.
    for (const empty of [[{ id: A, computers: 0 }, { id: B, computers: 0 }], [{ id: A }, { id: B }], [{ id: A, computers: '9' }, { id: B, computers: -3 }, { id: C, computers: 1.5 }], []]) {
      expect(await resolveStartRealm(input({ realms: async () => empty }))).toEqual({ ok: true, realm: 'all', source: 'first-run', line: 'All realms, no default realm set' });
    }
    expect(await resolveStartRealm(input({ realms: async () => [{ id: A, computers: 0 }, { id: B, computers: 1 }] }))).toMatchObject({ realm: B, source: 'most-computers' });
    // The account's default row still comes before the count; anything asked for comes before all of it.
    expect(await resolveStartRealm(input({ realms: async () => [{ id: A, is_default: true, computers: 0 }, { id: B, computers: 9 }] }))).toMatchObject({ realm: A, source: 'account-default' });
    expect(await resolveStartRealm(input({ realms, saved: C, profile: B }))).toMatchObject({ realm: B, source: 'profile' });
    expect(await resolveStartRealm(input({ realms, saved: C, flag: 'global' }))).toMatchObject({ realm: 'all', source: 'flag' });
    // An access key's own realm is never replaced by a saved one.
    expect(await resolveStartRealm(input({ realms, saved: C, keyRealm: A }))).toMatchObject({ realm: A, source: 'key' });
  });
  test('order', async () => {
    const all = { flag: A, env: { HOODY_REALM: B, HOODY_REALM_ID: C }, profile: B };
    expect(await resolveStartRealm(input(all))).toEqual({ ok: true, realm: A, source: 'flag', line: `realm ${A}, from --realm` });
    expect(await resolveStartRealm(input({ ...all, flag: undefined }))).toMatchObject({ realm: B, source: 'HOODY_REALM', line: `realm ${B}, from HOODY_REALM` });
    expect(await resolveStartRealm(input({ ...all, flag: '  ', env: { HOODY_REALM_ID: C } }))).toMatchObject({ realm: C, source: 'HOODY_REALM_ID', line: `realm ${C}, from HOODY_REALM_ID` });
    expect(await resolveStartRealm(input({ profile: B }))).toMatchObject({ realm: B, source: 'profile', line: `realm ${B}, from the CLI's default` });
    const log: string[] = [];
    expect(await resolveStartRealm(input({}, log))).toEqual({ ok: true, realm: A, source: 'account-default', line: "realm Work, the account's default" });
    expect(log).toEqual(['realms']);
    // No default row (or two marked default): All realms, as the web Hub's first run.
    const none = { ok: true, realm: 'all', source: 'first-run', line: 'All realms, no default realm set' } as const;
    expect(await resolveStartRealm(input({ realms: async () => [{ id: A, is_default: false }] }))).toEqual(none);
    // No answer to the list (a 5xx, a timeout): the same realm, but the line never claims there is no default.
    expect(await resolveStartRealm(input({ realms: async () => { throw new Error('down'); } }))).toEqual({ ...none, line: 'All realms, the realm list could not be read' });
    expect(await resolveStartRealm(input({ realms: async () => [{ id: A, is_default: true }, { id: B, is_default: true }] }))).toEqual(none);
    expect(await resolveStartRealm(input({ realms: async () => [{ id: 'nothex', is_default: true }] }))).toEqual(none);
    expect(await resolveStartRealm(input({ realms: async () => [{ id: A, is_default: 'yes' }] }))).toEqual(none);
  });

  test('ids and all', async () => {
    const log: string[] = [];
    expect(await resolveStartRealm(input({ flag: A.toUpperCase() }, log))).toMatchObject({ ok: true, realm: A });
    for (const v of ['global', 'all', 'ALL', ' Global ']) {
      expect(await resolveStartRealm(input({ flag: v }, log))).toEqual({ ok: true, realm: 'all', source: 'flag', line: 'All realms, from --realm' });
    }
    expect(await resolveStartRealm(input({ env: { HOODY_REALM: 'global' } }, log))).toMatchObject({ realm: 'all', line: 'All realms, from HOODY_REALM' });
    // A realm NAMED like an id or "all" is never looked up.
    const tricky = input({ flag: 'all', names: async () => { log.push('names'); return { ok: true, map: { [A]: 'all' } }; } }, log);
    expect(await resolveStartRealm(tricky)).toMatchObject({ realm: 'all' });
    expect(log).toEqual([]);
  });

  test('names', async () => {
    expect(await resolveStartRealm(input({ flag: 'work' }))).toEqual({ ok: true, realm: A, source: 'flag', line: 'realm work, from --realm' });
    // The environment takes a name too, through the same resolver.
    expect(await resolveStartRealm(input({ env: { HOODY_REALM_ID: 'Work' } }))).toMatchObject({ realm: A, source: 'HOODY_REALM_ID' });
    expect(await resolveStartRealm(input({ flag: 'Play' }))).toEqual({ ok: false, exit: 1, lines: ['error: no realm is named "Play".', 'Realm names: Home, Work, home '] });
    expect(await resolveStartRealm(input({ flag: 'Play', names: async () => ({ ok: true, map: {} }) }))).toEqual({ ok: false, exit: 1, lines: ['error: no realm is named "Play".', 'This account has no realm names.'] });
    expect(await resolveStartRealm(input({ flag: 'HOME' }))).toEqual({
      ok: false, exit: 1,
      lines: ['error: more than one realm is named "HOME"; pass the realm id (--realm <24-hex id>):', `  Home  ${B}`, `  home   ${C}`],
    });
  });

  test('names unreadable', async () => {
    const line = 'This token cannot read realm aliases; pass the realm id (--realm <24-hex id>).';
    expect(await resolveStartRealm(input({ flag: 'work', names: async () => ({ ok: false, line }) }))).toEqual({ ok: false, exit: 1, lines: [line] });
    expect(await resolveStartRealm(input({ flag: 'work', names: async () => { throw new Error('x'); } }))).toEqual({ ok: false, exit: 1, lines: ['error: could not read the realm names; pass the realm id (--realm <24-hex id>).'] });
  });

  test('access key', async () => {
    const log: string[] = [];
    expect(await resolveStartRealm(input({ keyRealm: A }, log))).toEqual({ ok: true, realm: A, source: 'key', line: `realm ${A}, the access key's own realm` });
    expect(log).toEqual([]);
    expect(await resolveStartRealm(input({ keyRealm: A, flag: 'work' }))).toMatchObject({ ok: true, realm: A, source: 'flag' });
    const refused = { ok: false, exit: 2, lines: [`error: this access key is limited to realm ${A}.`] } as const;
    expect(await resolveStartRealm(input({ keyRealm: A, flag: B }))).toEqual(refused);
    expect(await resolveStartRealm(input({ keyRealm: A, profile: 'global' }))).toEqual(refused);
    expect(await resolveStartRealm(input({ keyRealm: B, env: { HOODY_REALM: 'Work' } }))).toEqual({ ...refused, lines: [`error: this access key is limited to realm ${B}.`] });
    // A key realm that is not a realm id is refused, never printed.
    expect(await resolveStartRealm(input({ keyRealm: 'x\u001b[31m' }))).toEqual({ ok: false, exit: 2, lines: ["error: this access key's realm cannot be read."] });
    expect(await resolveStartRealm(input({ keyRealm: `${A}0`, flag: A }))).toEqual({ ok: false, exit: 2, lines: ["error: this access key's realm cannot be read."] });
    // A key on no realm: as an account (its default realm read).
    expect(await resolveStartRealm(input({ keyRealm: null }))).toMatchObject({ realm: A, source: 'account-default' });
  });

  test('shown value', async () => {
    expect(shownRealmValue('a\u001b[31mb\u202ec\n')).toBe('a?[31mb?c?');
    expect(shownRealmValue('x'.repeat(90))).toBe(`${'x'.repeat(80)}…`);
    const r = await resolveStartRealm(input({ flag: 'evil\u001b]0;t\u0007' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.lines[0]).toBe('error: no realm is named "evil?]0;t?".');
    expect(await resolveStartRealm(input({ realms: async () => [{ id: A, name: 'W\u001bork', is_default: true }] }))).toMatchObject({ line: "realm W?ork, the account's default" });
  });
});
