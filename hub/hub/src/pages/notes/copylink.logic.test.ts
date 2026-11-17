// Vitest: a note's Copy link is the note's own address in its computer's Notes (the notes-…
// program address, what Open note opens), never the Hub's own address; Copy read-only link is that address with Notes'
// view option mode=readonly. Nothing is linked when the Notes address or an id is not one a link can carry.
import { describe, expect, it } from 'vitest';
import { noteLink } from './logic';

const BASE = 'https://p1a2b3-c0ffee-notes-1.sg-sin-1.computers.hoody.com/';
const U = '0190a1b2c3d4e5f6a7b8c9d0';
const N = '0a1b2c3d4e5f6a7b8c9d0e1f';

describe('noteLink', () => {
  it('is the note page of the computer\'s Notes program', () => {
    expect(noteLink(BASE, U, N)).toBe(`https://p1a2b3-c0ffee-notes-1.sg-sin-1.computers.hoody.com/notebook/${U}/${N}`);
  });

  it('read-only adds the Notes view option mode=readonly, and nothing else', () => {
    expect(noteLink(BASE, U, N, true)).toBe(`https://p1a2b3-c0ffee-notes-1.sg-sin-1.computers.hoody.com/notebook/${U}/${N}?mode=readonly`);
  });

  it('takes only the origin of the Notes address', () => {
    expect(noteLink('https://h.example.test/x/y?z=1#f', U, N)).toBe(`https://h.example.test/notebook/${U}/${N}`);
  });

  it('is null when there is no https Notes address or an id a link cannot carry', () => {
    for (const ro of [false, true]) {
      expect(noteLink(null, U, N, ro)).toBeNull();
      expect(noteLink('http://h.example.test/', U, N, ro)).toBeNull();
      expect(noteLink('javascript:alert(1)', U, N, ro)).toBeNull();
      expect(noteLink(BASE, 'short', N, ro)).toBeNull();
      expect(noteLink(BASE, U, '../../x', ro)).toBeNull();
    }
  });
});
