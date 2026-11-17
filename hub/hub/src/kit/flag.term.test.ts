// countryFlag in the terminal: the upper-case code, never the regional-indicator emoji (two cells, colour, font).
// Imported through format.ts as every caller does, so this also pins the countryFlag.term.ts sibling being picked up.
import { describe, expect, it } from 'bun:test';
import { countryFlag } from './format';
import { flagCode } from './pickers/ComputerPicker.pure';

describe('countryFlag (terminal)', () => {
  it('is the upper-case code, not the emoji', () => {
    expect(countryFlag('SG')).toBe('SG');
    expect(countryFlag('de')).toBe('DE');
    expect([...countryFlag('US')].some((c) => c.codePointAt(0)! >= 0x1f1e6)).toBe(false);
  });
  it('is empty for anything that is not two letters (same test as the web)', () => {
    for (const v of [undefined, null, '', 'S', 'SGP', '12', 'é1', 7, {}]) expect(countryFlag(v)).toBe('');
  });
  it('round-trips through the picker flagCode (terminal Lead draws CountryFlag from it)', () => {
    expect(flagCode(countryFlag('sg'))).toBe('SG');
    expect(flagCode('🇸🇬')).toBe('SG');
    expect(flagCode('sg')).toBe(null);
    expect(flagCode('SGP')).toBe(null);
  });
});
