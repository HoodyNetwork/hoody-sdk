// The Realm limit's cap states: under, at and over the limit, a token session's answer without `used`, an answer
// without `max`, the top plan at its limit, and no cap at all (today's answer: nothing shown, nothing turned off).
import { describe, expect, it } from 'vitest';
import { isRealmLimit, parseRealmCap, PLAN_REALMS, REALM_LIMIT_CODE, realmCapMore, realmCapView, realmLimitNumbers, TOP_PLAN_REALMS } from './realmLimit';

const view = (cap: unknown) => realmCapView(parseRealmCap({ realm_ids: [], cap }));

describe('the Realm limit cap', () => {
  it('an answer with no cap shows nothing and turns nothing off', () => {
    expect(parseRealmCap({ realm_ids: ['a'] })).toBeNull();
    expect(parseRealmCap(null)).toBeNull();
    expect(parseRealmCap({ cap: null })).toBeNull();
    expect(parseRealmCap({ cap: [] })).toBeNull();
    expect(parseRealmCap({ cap: {} })).toBeNull();
    expect(realmCapView(null)).toEqual({ k: 'none' });
  });
  it('under the limit: use against the limit, not reached, no upgrade', () => {
    expect(view({ max: 5, used: 3, reached: false })).toEqual({ k: 'use', used: 3, max: 5, reached: false, upgrade: false });
  });
  it('at the limit: reached, an upgrade exists', () => {
    expect(view({ max: 5, used: 5, reached: true })).toEqual({ k: 'use', used: 5, max: 5, reached: true, upgrade: true });
  });
  it('over the limit (realms kept from before): the same as at the limit', () => {
    expect(view({ max: 5, used: 8, reached: true })).toEqual({ k: 'use', used: 8, max: 5, reached: true, upgrade: true });
  });
  it('`reached` is read first: the API\'s word wins over the numbers', () => {
    expect(view({ max: 5, used: 5, reached: false })).toMatchObject({ reached: false, upgrade: false });
    expect(view({ max: 5, used: 2, reached: true })).toMatchObject({ reached: true, upgrade: true });
  });
  it('without `reached` nothing is reached: the Hub never works it out from the numbers', () => {
    expect(view({ max: 5, used: 5 })).toMatchObject({ k: 'use', reached: false, upgrade: false });
    expect(view({ max: 5 })).toEqual({ k: 'limit', max: 5, reached: false, upgrade: false });
  });
  it('`used` absent (a sign-in limited to realms): only the limit; absent is unknown, never zero', () => {
    expect(view({ max: 50, reached: true })).toEqual({ k: 'limit', max: 50, reached: true, upgrade: true });
    expect(view({ max: 50, reached: false })).toEqual({ k: 'limit', max: 50, reached: false, upgrade: false });
    expect(parseRealmCap({ cap: { max: 50, reached: false } })?.used).toBeNull();
  });
  it('`max` absent too: nothing to show unless the limit is reached', () => {
    expect(view({ reached: false })).toEqual({ k: 'none' });
    expect(view({ reached: true })).toEqual({ k: 'reached', reached: true, upgrade: false });
    expect(view({ used: 3 })).toEqual({ k: 'none' });
  });
  it('the top plan at its limit: reached, nothing to upgrade to', () => {
    expect(view({ max: TOP_PLAN_REALMS, used: TOP_PLAN_REALMS, reached: true })).toMatchObject({ reached: true, upgrade: false });
    expect(view({ max: PLAN_REALMS.paid, used: PLAN_REALMS.paid, reached: true })).toMatchObject({ reached: true, upgrade: true });
  });
  it('a number that is not a whole count is unknown', () => {
    expect(view({ max: '5', used: -1, reached: true })).toEqual({ k: 'reached', reached: true, upgrade: false });
    expect(view({ max: 5.5, used: 2 })).toEqual({ k: 'none' });
  });
  it('the refusal is known by its code, and carries its numbers', () => {
    expect(isRealmLimit({ code: REALM_LIMIT_CODE, status: 400 })).toBe(true);
    expect(isRealmLimit({ code: 'OTHER' })).toBe(false);
    expect(isRealmLimit(null)).toBe(false);
    expect(realmLimitNumbers({ code: REALM_LIMIT_CODE, data: { max: 5, used: 5 } })).toEqual({ max: 5, used: 5 });
    expect(realmLimitNumbers({ code: REALM_LIMIT_CODE })).toEqual({ max: null, used: null });
  });
  it('the realms each plan includes', () => {
    expect(PLAN_REALMS).toEqual({ free: 5, paid: 50, bareMetal: 1000 });
  });
});

describe('a higher plan is offered only on a known limit', () => {
  it('max absent: reached, but no upgrade', () => {
    expect(view({ reached: true })).toEqual({ k: 'reached', reached: true, upgrade: false });
    expect(realmCapMore(view({ reached: true }))).toBe(false);
    expect(realmCapMore(realmCapView(null))).toBe(false);
  });
  it('a known limit below the top plan, reached or not; never at the top', () => {
    expect(realmCapMore(view({ max: 5, used: 1, reached: false }))).toBe(true);
    expect(realmCapMore(view({ max: 50, reached: true }))).toBe(true);
    expect(realmCapMore(view({ max: TOP_PLAN_REALMS, used: 3, reached: false }))).toBe(false);
  });
});
