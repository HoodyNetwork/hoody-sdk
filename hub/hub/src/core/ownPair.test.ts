// ownPair.ts: a sign-in flow takes back only the account keys that still hold its own values.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dropOwnPair } from './ownPair';

const KEYS = ['access_token', 'access_token_expires_at', 'refresh_token', 'refresh_token_expires_at'];
const seed = (access: string, refresh: string): void => {
  localStorage.setItem('access_token', access); localStorage.setItem('access_token_expires_at', 'ae');
  localStorage.setItem('refresh_token', refresh); localStorage.setItem('refresh_token_expires_at', 're');
};
const left = (): Array<string | null> => KEYS.map((k) => localStorage.getItem(k));
const OWN = { token: 'a.b.c', refreshToken: 'd.e.f' };

describe('dropOwnPair', () => {
  afterEach(() => { for (const k of KEYS) localStorage.removeItem(k); });

  it('removes both tokens and their expiries while they hold this flow\'s values', () => {
    seed('a.b.c', 'd.e.f');
    dropOwnPair(OWN);
    expect(left()).toEqual([null, null, null, null]);
  });

  it('leaves a pair another sign-in wrote since untouched', () => {
    seed('x.y.z', 'u.v.w');
    dropOwnPair(OWN);
    expect(left()).toEqual(['x.y.z', 'ae', 'u.v.w', 're']);
  });

  it('each key is judged alone: a refresh token another writer replaced is kept', () => {
    seed('a.b.c', 'u.v.w');
    dropOwnPair(OWN);
    expect(left()).toEqual([null, null, 'u.v.w', 're']);
  });

  it('a refused removal does not skip the later keys', () => {
    seed('a.b.c', 'd.e.f');
    const real = localStorage.removeItem.bind(localStorage);
    const spy = vi.spyOn(localStorage, 'removeItem').mockImplementation((k: string) => { if (k === 'access_token') throw new Error('refused'); real(k); });
    try { dropOwnPair(OWN); } finally { spy.mockRestore(); }
    expect(left()).toEqual(['a.b.c', null, null, null]);
  });
});
