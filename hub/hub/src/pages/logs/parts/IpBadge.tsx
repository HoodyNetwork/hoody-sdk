// IpBadge: a visitor address with its country when the platform knows it: the flag and the two-letter code after the
// address. Where the country is not known (an address the platform does not look up, no answer, a failed lookup, or the
// lookup still out) the address stands alone. The flag's slot is always there, empty, so every address in a column starts
// at the same place and a row does not move when its country arrives.
import { CountryFlag } from '@kit';
import { listingRules, type GeoState } from '@core';
import s from './Logs.module.css';
import type { T } from './words';

export interface IpBadgeProps {
  t: T;
  ip: string;
  geo: GeoState;
}

export function IpBadge({ t, ip, geo }: IpBadgeProps) {
  const country = geo.s === 'known' ? geo.country : '';
  const name = country ? listingRules.countryName(country) : '';
  return (
    <>
      <span className={s.ipFlag} data-geo={geo.s}>{geo.s === 'known' && <CountryFlag code={country} label={t('ip.from', { country: name })} />}</span>
      <span className={s.ipText} title={geo.s === 'unknown' ? t('ip.unknown') : undefined}>{ip}</span>
      {geo.s === 'known' && <span className={s.ipCode} aria-hidden="true">{country}</span>}
    </>
  );
}
