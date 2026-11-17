// A country flag in the terminal: never the regional-indicator emoji (wide, colour, font-dependent). The two-letter
// code is drawn as muted text, named as on the web (the label, default the upper-case code). Nothing for an unknown
// code: the same test as the web's (countryFlag answers '' for anything but two ASCII letters).
import type * as Web from './CountryFlag';
import { Text } from '../../term/prim';
import { countryFlag } from '../format';

export type { CountryFlagProps } from './CountryFlag';

export const CountryFlag: typeof Web.CountryFlag = ({ code, label }) => {
  if (!countryFlag(code)) return null;
  const shown = String(code).toUpperCase();
  return <Text colour="muted" sem={{ role: 'img', name: label ?? shown }}>{shown}</Text>;
};
