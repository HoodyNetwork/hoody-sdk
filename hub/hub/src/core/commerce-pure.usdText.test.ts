// usdText: the wallet amount formatter, moved verbatim from Billing's usd() so every page can use it.
// The same table as Billing's old usd tests.
import { describe, expect, it } from 'vitest';
import { usdText } from './commerce-pure';
import { commerceRules } from './index';

describe('usdText_matches_old_usd', () => {
  it('formats the API wire form with thousands separators', () => {
    expect(usdText('0.00')).toBe('$0.00');
    expect(usdText('12.50')).toBe('$12.50');
    expect(usdText('999.99')).toBe('$999.99');
    expect(usdText('1234.50')).toBe('$1,234.50');
    expect(usdText('1000000.00')).toBe('$1,000,000.00');
  });

  it('anything that is not a D.CC amount is a dash, never a guess', () => {
    for (const bad of ['12.5', '-1.00', '1e3', '012.00', '', 'abc', '12.50 ', ' 1.00', null, undefined, 12, 12.5, {}]) {
      expect(usdText(bad), String(bad)).toBe('—');
    }
  });

  it('is reachable as commerceRules.usdText', () => {
    expect(commerceRules.usdText('1234.50')).toBe('$1,234.50');
  });
});
