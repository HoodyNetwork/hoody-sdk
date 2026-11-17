// countryFlag: the one flag helper (was four copies in pages and the shell).
import { describe, expect, it } from 'vitest';
import { countryFlag } from './format';

describe('countryFlag', () => {
  it('turns an ISO 3166 alpha-2 code into its flag, in any case', () => {
    expect(countryFlag('SG')).toBe('🇸🇬');
    expect(countryFlag('de')).toBe('🇩🇪');
  });
  it('is empty for anything that is not two letters', () => {
    for (const v of [undefined, null, '', 'S', 'SGP', '12', 'é1', 7, {}]) expect(countryFlag(v)).toBe('');
  });
});
