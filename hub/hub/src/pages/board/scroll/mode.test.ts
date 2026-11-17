import { describe, expect, it } from 'vitest';
import { parseMode, withMode } from './mode';

describe('a Board\'s stored mode', () => {
  it('only the exact value scroll means Scroll; anything else is Fit', () => {
    expect(parseMode('scroll')).toBe('scroll');
    for (const v of [undefined, null, '', 'fit', 'Scroll', ' scroll', 1, true, {}, ['scroll']]) expect(parseMode(v)).toBeUndefined();
  });
  it('Scroll sets the field, Fit removes it, and the same mode gives the same object', () => {
    const b: { id: string; name: string; mode?: 'scroll' } = { id: 'b1', name: '' };
    const on = withMode(b, 'scroll');
    expect(on).toEqual({ id: 'b1', name: '', mode: 'scroll' });
    expect(withMode(on, 'scroll')).toBe(on);
    const off = withMode(on, undefined);
    expect(off).not.toHaveProperty('mode');
    expect(JSON.stringify(off)).toBe(JSON.stringify(b));
    expect(withMode(b, undefined)).toBe(b);
  });
  it('a stray stored value is cleared by Fit', () => {
    const odd = { id: 'b1', mode: 'fit' as unknown as 'scroll' };
    expect(withMode(odd, undefined)).toEqual({ id: 'b1' });
  });
});
