// People you invited: the totals as band words ("None yet", "Fewer than 3", the number from 3), each with what it counts.
// Never arithmetic, never who. A kit StatStrip that gives each stat a row on a phone (narrow="rows").
import { AnatomySection, InfoTip, StatStrip } from '@kit';
import { bandWords, type Me } from '../logic';
import type { T } from './types';

export function Counts({ t, me }: { t: T; me: Me }) {
  const w = (b: string | null) => {
    const x = bandWords(b);
    return <bdi>{t(x.k, x.v)}</bdi>;
  };
  // What each count counts, with its InfoTip (Paying says it is not the Creator count).
  const tip = (hint: string, text: string, subject: string) => (
    <InfoTip text={text} subject={subject}>
      {hint}
    </InfoTip>
  );
  return (
    <AnatomySection id="referral-people" title={t('counts.label')} description={t('counts.caption')} state={{ kind: 'ready' }}>
      <StatStrip
        label={t('counts.label')}
        narrow="rows"
        items={[
          { label: t('counts.signedUp'), value: w(me.counts.signedUp), detail: tip(t('counts.signedUpHint'), t('tip.signedUp'), t('counts.signedUp')) },
          { label: t('counts.paying'), value: w(me.counts.paying), detail: tip(t('counts.payingHint'), t('tip.paying'), t('counts.paying')) },
          { label: t('counts.active'), value: w(me.counts.active), detail: tip(t('counts.activeHint'), t('tip.active'), t('counts.active')) },
        ]}
      />
    </AnatomySection>
  );
}
