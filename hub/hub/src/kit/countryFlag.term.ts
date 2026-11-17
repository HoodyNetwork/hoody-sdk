// countryFlag in the terminal: the plain upper-case code ("SG"), never the regional-indicator emoji (two cells wide,
// colour, font-dependent). Same test as the web's: '' for anything but two ASCII letters.
import type * as Web from './countryFlag';

/** The upper-case ISO 3166 alpha-2 code ("sg" → "SG"); '' for anything else. */
export const countryFlag: typeof Web.countryFlag = (code) =>
  typeof code === 'string' && /^[A-Za-z]{2}$/.test(code) ? code.toUpperCase() : '';
