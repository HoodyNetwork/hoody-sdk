// The New ticket drawer's limits line: shown when any row is at or one short of its
// maximum, one sentence per such row. The numbers always come from GET /support/limits, never from constants.
import { InfoTip, formatNumber, useStrings } from '@kit';
import { nearLimits, type Limits as LimitsData } from '../logic';
import strings from '../strings.en.json';
import s from './parts.module.css';

export function Limits({ limits }: { limits: LimitsData | undefined }) {
  const t = useStrings(strings);
  const rows = nearLimits(limits);
  if (!limits || rows.length === 0) return null;
  return (
    <div className={s.limits} role="note">
      <ul className={s.limitRows}>
        {rows.map((k) => {
          const r = limits[k];
          return r ? <li key={k}>{t(`limits.${k}`, { used: formatNumber(r.used), max: formatNumber(r.max) })}</li> : null;
        })}
      </ul>
      <InfoTip text={t('limits.tip')} subject={t('limits.tipSubject')} />
    </div>
  );
}
