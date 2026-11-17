// Vitest: freeAddress, the address New script offers in place of a taken one: itself when free, else the next number,
// and always one the address field accepts.
import { describe, expect, it } from 'vitest';
import { addressOk, freeAddress } from './logic';

describe('freeAddress', () => {
  it('is the address itself when free, else the next number', () => {
    expect(freeAddress('/a', ['/b'])).toBe('/a');
    expect(freeAddress('/a', ['/a'])).toBe('/a-2');
    expect(freeAddress('/a', ['/a', '/a-2'])).toBe('/a-3');
  });
  it('keeps every candidate an address the form accepts: a long address is cut to make room for the number', () => {
    const long = (n: number) => `/${'a'.repeat(n - 1)}`;
    for (const n of [198, 199, 200]) {
      const r = freeAddress(long(n), [long(n)]);
      expect(r.length).toBeLessThanOrEqual(200);
      expect(addressOk(r)).toBe(true);
      expect(r.endsWith('-2')).toBe(true);
    }
    const taken = [long(200), ...Array.from({ length: 9 }, (_, i) => `${long(200).slice(0, 198)}-${i + 2}`)];
    const r = freeAddress(long(200), taken);
    expect(r.length).toBeLessThanOrEqual(200);
    expect(addressOk(r)).toBe(true);
    expect(r.endsWith('-10')).toBe(true);
  });
  it('goes on past -99 and never returns an address that is held', () => {
    const taken = ['/a', ...Array.from({ length: 98 }, (_, i) => `/a-${i + 2}`)];
    expect(freeAddress('/a', taken)).toBe('/a-100');
  });
});
