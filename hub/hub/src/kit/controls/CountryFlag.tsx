// A country flag: the regional-indicator glyph of an ISO 3166 alpha-2 code, with its name for assistive tech
// and the tooltip. Nothing for an unknown code. The glyph is only ever built by `countryFlag` (std.flag).
import { countryFlag } from '../format';

export interface CountryFlagProps {
  /** An alpha-2 code in any case; anything else renders nothing. */
  code: string | null | undefined;
  /** The accessible name (default the upper-case code). */
  label?: string;
}

export function CountryFlag({ code, label }: CountryFlagProps) {
  const glyph = countryFlag(code);
  if (!glyph) return null;
  const name = label ?? String(code).toUpperCase();
  return (
    <span role="img" aria-label={name} title={name}>
      {glyph}
    </span>
  );
}
