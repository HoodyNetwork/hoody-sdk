// Vitest: the realm's "keep frames loaded on other pages" choice in the stored Boards: set and
// cleared, read back only as true, written as stored, and merged with another tab by the side that changed it.
import { describe, expect, it } from 'vitest';
import { freshRealm, setKeepLoaded, type RealmBoards } from './boards';
import { merge } from './merge';
import { parseRealmBoards, toStored } from './persist';

let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
const base = freshRealm(rand);
const on = setKeepLoaded(base, true);

describe('setKeepLoaded', () => {
  it('turns it on and off, and leaves the state as it was when nothing changes', () => {
    expect(on.keep).toBe(true);
    expect('keep' in setKeepLoaded(on, false)).toBe(false);
    expect(setKeepLoaded(on, true)).toBe(on);
    expect(setKeepLoaded(base, false)).toBe(base);
  });
});

describe('persist: keep', () => {
  it('round-trips true and writes nothing when off', () => {
    expect(parseRealmBoards(toStored(on)).state.keep).toBe(true);
    expect('keep' in toStored(base)).toBe(false);
    expect('keep' in parseRealmBoards(toStored(base)).state).toBe(false);
  });

  it('reads anything but true as off', () => {
    for (const v of ['true', 1, {}, false, null]) {
      expect('keep' in parseRealmBoards({ ...toStored(base), keep: v }).state).toBe(false);
    }
  });
});

describe('merge: keep follows the side that changed it', () => {
  const m = (b: RealmBoards, mine: RealmBoards, theirs: RealmBoards) => merge(b, mine, theirs).state.keep ?? false;
  it('this tab turned it on, the other did not touch it: on', () => { expect(m(base, on, base)).toBe(true); });
  it('the other tab turned it on, this tab did not touch it: on', () => { expect(m(base, base, on)).toBe(true); });
  it('this tab turned it off, the other did not touch it: off', () => { expect(m(on, base, on)).toBe(false); });
  it('the other tab turned it off, this tab did not touch it: off', () => { expect(m(on, on, base)).toBe(false); });
});
