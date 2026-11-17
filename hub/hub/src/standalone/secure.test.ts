// What the one-file Hub's sign-in needs from the page: a secure context, or a file opened from this computer whose
// browser still gives it WebCrypto (crypto.subtle, for PKCE and the vault). Without crypto.subtle the page is refused.
import { describe, expect, it } from 'vitest';
import { secureEnough } from './secure';

const subtle = { digest: () => Promise.resolve(new ArrayBuffer(32)) };

describe('secureEnough', () => {
  it('a secure context is enough, whatever the address', () => {
    expect(secureEnough({ protocol: 'https:' }, true, subtle)).toBe(true);
    expect(secureEnough({ protocol: 'http:' }, true, subtle)).toBe(true);
  });
  it('a file on this computer counts when the browser says not secure, or says nothing, but gives crypto.subtle', () => {
    expect(secureEnough({ protocol: 'file:' }, false, subtle)).toBe(true);
    expect(secureEnough({ protocol: 'file:' }, undefined, subtle)).toBe(true);
  });
  it('a file without a usable crypto.subtle is refused', () => {
    expect(secureEnough({ protocol: 'file:' }, false, null)).toBe(false);
    expect(secureEnough({ protocol: 'file:' }, undefined, {})).toBe(false);
  });
  it('plain http on another host is still refused, as is https the browser calls not secure', () => {
    expect(secureEnough({ protocol: 'http:' }, false, subtle)).toBe(false);
    expect(secureEnough({ protocol: 'http:' }, undefined, subtle)).toBe(false);
    expect(secureEnough({ protocol: 'https:' }, false, subtle)).toBe(false);
  });
  it('no location and no flag: refused', () => {
    expect(secureEnough(undefined, undefined, subtle)).toBe(false);
  });
});
