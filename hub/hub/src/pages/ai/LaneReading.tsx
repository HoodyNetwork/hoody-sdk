// One lane's reading in the allowance table: the percent in words, then its bar. The terminal draws the same two on one
// row of the cell (LaneReading.term.tsx).
import { Meter, useStrings } from '@kit';
import strings from './Allowance.strings.en.json';

export interface LaneReadingProps {
  /** Percent used, 0-100. */
  pct: number;
  /** The bar's accessible name, with the lane and its reading in words. */
  label: string;
  tone: 'neutral' | 'warn' | 'danger';
}

export function LaneReading({ pct, label, tone }: LaneReadingProps) {
  const t = useStrings(strings);
  return (
    <>
      {t('aiu.pct', { pct })}{' '}
      <Meter value={pct} size="sm" label={label} tone={tone} />
    </>
  );
}
