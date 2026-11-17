// The AI sub-pages' realm (aiRealm.ts). Under All realms the current computer's own: Global for a computer in no
// realm, its realm for one, and no one realm ('all': the page asks) for several, for a computer the list does not hold,
// or for a row whose realm_ids is not a list of realm ids. Any other realm at the top is the page's realm as it is.
import { describe, expect, it } from 'vitest';
import { aiRealmOf } from './aiRealm';
import { membershipOf, realmOf } from './logic';

const C = 'c0a7150000000000000000a1';
const R1 = 'a'.repeat(24);
const R2 = 'b'.repeat(24);
const row = (realm_ids: unknown) => ({ id: C, name: 'atlas', realm_ids });

describe('aiRealmOf', () => {
  it('a realm or Global at the top is the page\'s realm, whatever the list says', () => {
    expect(aiRealmOf(R1, C, [row([R2])])).toBe(R1);
    expect(aiRealmOf('global', C, [row([R1])])).toBe('global');
    expect(aiRealmOf(R1, C, undefined)).toBe(R1);
  });

  it('under All realms: no realm is Global, one realm is that realm, several leave no one realm', () => {
    expect(aiRealmOf('all', C, [row([])])).toBe('global');
    expect(aiRealmOf('all', C, [row([R1])])).toBe(R1);
    expect(aiRealmOf('all', C, [row([R1, R2])])).toBe('all');
  });

  it('under All realms with no computer, no list, or the computer not in it: not told', () => {
    expect(aiRealmOf('all', null, [row([R1])])).toBe('all');
    expect(aiRealmOf('all', C, undefined)).toBe('all');
    expect(aiRealmOf('all', C, [])).toBe('all');
    expect(aiRealmOf('all', C, [{ ...row([R1]), id: 'other' }])).toBe('all');
    expect(aiRealmOf('all', C, [null, 'x', 7])).toBe('all');
  });

  it('a row with no realm list is not told (never Global)', () => {
    expect(aiRealmOf('all', C, [{ id: C, name: 'atlas' }])).toBe('all');
    expect(aiRealmOf('all', C, [row(null)])).toBe('all');
    expect(aiRealmOf('all', C, [row(R1)])).toBe('all');
  });

  it('the row is judged as New chat judges its computer (membershipOf, then realmOf): one rule', () => {
    const cases: unknown[][] = [[], [R1], [R1, R2], ['nope'], ['nope', R1], [R1.toUpperCase()], [R1, R1], [7, R1], [null]];
    for (const ids of cases) {
      const told = membershipOf({ id: C, realm_ids: ids }, C);
      expect(aiRealmOf('all', C, [row(ids)])).toBe(told === null ? 'all' : realmOf(told, null) ?? 'all');
    }
  });

  it('a row holding anything but realm ids is not told, never Global: no entry is left out to make it fit', () => {
    expect(aiRealmOf('all', C, [row(['nope'])])).toBe('all');
    expect(aiRealmOf('all', C, [row([7, R1])])).toBe('all');
    expect(aiRealmOf('all', C, [row(['nope', R1])])).toBe('all');
    expect(aiRealmOf('all', C, [row([R1.toUpperCase()])])).toBe('all');
  });
});
