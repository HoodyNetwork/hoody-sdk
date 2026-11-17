import { describe, expect, it } from 'vitest';
import { utf8Bytes } from './utf8';

describe('utf8Bytes', () => {
  it('counts bytes, not characters or UTF-16 units', () => {
    expect(utf8Bytes('')).toBe(0);
    expect(utf8Bytes('atlas')).toBe(5);
    expect(utf8Bytes('é')).toBe(2);
    expect(utf8Bytes('€')).toBe(3);
    expect(utf8Bytes('😀')).toBe(4); // length 2 as a string
    expect(utf8Bytes('a\n€😀')).toBe(1 + 1 + 3 + 4);
  });

  it('counts a lone surrogate as the replacement character it is sent as', () => {
    expect(utf8Bytes('\ud83d')).toBe(3);
  });

  it('agrees with the size of the same text as a Blob', () => {
    for (const s of ['plain', 'naïve café', '日本語のテキスト', '👩‍👩‍👧 family', 'tab\tand\u0000nul']) {
      expect(utf8Bytes(s), s).toBe(new Blob([s]).size);
    }
  });
});
