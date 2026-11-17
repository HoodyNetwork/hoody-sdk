// /ai/f/<key> → the folder. The key is base64url (no padding) of the UTF-8 path; anything else is no folder.
import { describe, expect, it } from 'vitest';
import { folderKey, folderName, folderOfKey } from './key';

describe('folderKey / folderOfKey', () => {
  it('round-trips any absolute path, with no "/", "%" or padding in the key', () => {
    for (const p of ['/', '/home/ada/shop', '/srv/a:b/c', '/tmp/100%25/x', '/srv/a b/é/x:y', '/a?q#h', '/日本/データ', '/x/😀']) {
      const k = folderKey(p);
      expect(k).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(folderOfKey(k)).toBe(p);
    }
    expect(folderKey('/')).toBe('Lw');
    expect(folderKey('/home/ada/shop')).toBe('L2hvbWUvYWRhL3Nob3A');
    // Bytes that encode to "+" and "/" in standard base64 come out as "-" and "_".
    expect(folderKey('/>>>?')).toBe('Lz4-Pj8');
    expect(folderOfKey('Lz4-Pj8')).toBe('/>>>?');
  });
  it('a key that is not exactly that form is no folder (never the root)', () => {
    const bad = [
      '', null, undefined, 'Lw=', 'Lw==', 'L w', 'Lw/', 'L%77', '%2F', '%2Fhome', 'L', // padding, other characters, the old form, a bad length
      folderKey('home/ada'), // relative
      folderKey('/a\nb'), folderKey('/a\u007fb'), // control characters
      btoa('ÿþ').replace(/=+$/, ''), // not UTF-8
      'Lx', // not canonical: decodes to "/" with stray bits
    ];
    for (const k of bad) expect(folderOfKey(k)).toBeNull();
  });
});

describe('folderName', () => {
  it('the last name, or / for the root; a trailing slash is ignored', () => {
    expect(folderName('/home/ada/shop')).toBe('shop');
    expect(folderName('/srv/a:b/c/')).toBe('c');
    expect(folderName('/')).toBe('/');
  });
});
