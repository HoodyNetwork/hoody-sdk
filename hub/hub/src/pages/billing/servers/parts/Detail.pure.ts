// A listing's delivery and place lines (split out of Detail.tsx so the terminal build shares them; Detail.tsx
// re-exports placeLine and uses deliveryLine).
import { countryFlag } from '@kit';
import { listingRules } from '@core';
import { type Listing, delivery } from '../logic';
import { type T, countryName } from './words';

export function deliveryLine(t: T, l: Listing): string {
  const d = delivery(l.deliveryHours);
  const base = d.k === 'now' ? listingRules.instantPromise.review : d.k === 'hours' ? t('delivery.line.hours', { n: d.n, count: d.n }) : d.k === 'days' ? t('delivery.line.days', { n: d.n }) : t('delivery.line.unknown');
  return l.setupMinutes !== null && d.k !== 'unknown' ? `${base} ${t('delivery.line.setup', { n: l.setupMinutes })}` : base;
}

/** "Falkenstein · delivered right away": the place line under the inspector title. */
export function placeLine(t: T, l: Listing): string {
  const d = delivery(l.deliveryHours);
  const when = d.k === 'now' ? t('header.delivery.now') : d.k === 'hours' ? t('header.delivery.hours', { n: d.n, count: d.n }) : d.k === 'days' ? t('header.delivery.days', { n: d.n }) : t('header.delivery.unknown');
  const place = `${countryFlag(l.country)} ${l.city || (l.country ? countryName(l.country) : '')}`.trim();
  return place ? t('header.meta', { place, delivery: when }) : when;
}
