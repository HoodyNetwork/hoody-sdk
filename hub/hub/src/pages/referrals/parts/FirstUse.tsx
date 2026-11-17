// Before joining: the member page's own grid instead of a small centred
// box. Row A holds the Join card (8 columns) beside a 4-column card; then the level cards untagged with How it works.
// No People and no Monthly. Can join: the Join card carries the three program facts from the API (the share, the
// Creator share at its number, what credit pays for) and Join…; the side card says what joining gives. Not eligible:
// See plans and "Which purchases count"; Joining paused: no action. Both put the facts in the side card ("What you
// earn"). A fact the API did not send is left out, never guessed: no share -> "a share"; no Creator share or number ->
// no Creator line.
import { FaqLink, PlanCard } from '@kit';
import type { ReactNode } from 'react';
import { pageFaq } from '../faq';
import type { Me, State } from '../logic';
import { Levels } from './LevelLadder';
import s from './parts.module.css';
import type { T } from './types';

type FirstState = Extract<State, 'notEligible' | 'paused' | 'canJoin'>;

/** The program facts as the API sends them, one line each; a line whose data is missing is dropped. */
export function programFacts(t: T, me: Me): string[] {
  const facts = [me.ratePercent ? t('first.fact.rate', { rate: me.ratePercent }) : t('first.fact.rateUnknown')];
  if (me.creatorRatePercent && me.creatorThreshold !== null) facts.push(t('first.fact.creator', { rate: me.creatorRatePercent, n: me.creatorThreshold }));
  facts.push(t('first.fact.credit'));
  return facts;
}

export function FirstUse({ t, me, state, action }: { t: T; me: Me; state: FirstState; action?: ReactNode }) {
  const { byId } = pageFaq(t);
  const facts = programFacts(t, me);
  const join = state === 'canJoin';
  const peeks =
    state === 'notEligible' ? (
      <FaqLink item={byId.eligible}>{t('first.eligibleLink')}</FaqLink>
    ) : join ? (
      <>
        <FaqLink item={byId.window}>{t('first.peek.window')}</FaqLink> <FaqLink item={byId.hold}>{t('first.peek.hold')}</FaqLink>
      </>
    ) : undefined;
  return (
    <>
      <div className={s.cols}>
        <div className={s.span8}>
          <PlanCard
            name={t(`first.${state}.title`)}
            tone={join ? 'accent' : 'default'}
            lead={t(`first.${state}.body`)}
            specs={join ? facts : []}
            note={peeks}
            action={action}
          />
        </div>
        <div className={s.span4}>
          {join ? (
            <PlanCard name={t('first.get.title')} specs={[t('first.get.link'), t('first.get.credit'), t('first.get.totals')]} />
          ) : (
            <PlanCard name={t('first.earn.title')} specs={facts} />
          )}
        </div>
      </div>
      <Levels t={t} me={me} preview />
    </>
  );
}
