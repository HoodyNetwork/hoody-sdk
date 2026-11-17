// Levels: three cards on the thirds while the account earns. Referrer and Creator each show
// their share as the API sends it (rate_percent, creator_rate_percent) with what they give; the card of this month's
// level is the current one, tagged "Your level this month". Where you stand shows the creator_customers band against the
// Creator number: band words, never a ratio, a bar or a "how many to go". A Creator's Referrer card says "The base share"
// with no number (the API sends none for it). Earning paused and Removed get the plain level tile: no cards and no
// encouragement. Before joining (preview) the same two cards carry no tags and How it works takes the
// third place. A level the API did not name reads as not known (caption, tile): neither card is tagged, never Referrer,
// and this month's share is not put on the Referrer card (rate_percent is the share this month, not the Referrer share).
// The Creator card says when Creator applies (from the month after
// the Creator number of customers earned you credit, new spend only, earned credit unchanged) and that support turns
// withdrawal on; Where you stand says one or two as "Fewer than 3" (the API bands them, docs §Status) and how the count is
// read; How you earn, under the cards and in the preview, answers what earns, for how long, the hold and Creator. The
// 3, 12, 60 and 7 are the program docs' numbers (pinned by codes-levels.test.tsx).
import { AnatomySection, FaqLink, PlanCard, PlanGrid, SrOnly, StatTile, SubSection, Tag } from '@kit';
import { pageFaq } from '../faq';
import { bandWords, type Me } from '../logic';
import s from './parts.module.css';
import type { T } from './types';

const levelText = (t: T, me: Me) =>
  me.level === 'unknown' ? t('level.notKnown') : me.ratePercent ? t(me.level === 'creator' ? 'level.creator' : 'level.referrer', { rate: me.ratePercent }) : t('level.unknown');

/** The level alone (Earning paused, Removed): the share as the API sends it. */
export function LevelTile({ t, me }: { t: T; me: Me }) {
  return <StatTile label={t('level.title')} value={levelText(t, me)} />;
}

/** A share as the API sent it ("5%"); when the API sent none, "A share", so the card's lead ("of what they pay…") still
 *  reads as a sentence, and no number is guessed (the way the base share reads "The base share"). */
const rate = (t: T, r: string) => ({ amount: r ? t('levels.rate', { rate: r }) : t('levels.share') });

export function Levels({ t, me, preview = false }: { t: T; me: Me; preview?: boolean }) {
  const { byId } = pageFaq(t);
  if (preview) return <Preview t={t} me={me} />;
  const creator = me.level === 'creator';
  // A level the API did not name is said to be unknown: neither card is this month's, and Creator is not "next".
  const known = me.level !== 'unknown';
  const n = me.creatorThreshold;
  const yours = <Tag tone="neutral">{t('levels.yours')}</Tag>;
  const band = bandWords(me.creatorCustomers);
  return (
    <AnatomySection id="referral-levels" title={t('ladder.label')} description={known ? t('levels.caption') : t('levels.captionUnknown')} state={{ kind: 'ready' }}>
      <PlanGrid columns={3}>
        {creator ? (
          <PlanCard
            name={t('levels.referrer')}
            price={{ amount: t('levels.base') }}
            lead={n !== null ? t('levels.baseLead', { n }) : t('levels.baseLeadUnknown')}
            specs={[t('levels.pays')]}
          />
        ) : (
          <PlanCard
            name={t('levels.referrer')}
            tone={known ? 'current' : 'default'}
            marks={known ? yours : undefined}
            price={rate(t, known ? me.ratePercent : '')}
            lead={t('levels.referrerLead')}
            specs={[t('levels.fromJoin'), t('levels.pays')]}
          />
        )}
        <PlanCard
          name={t('levels.creator')}
          tone={creator ? 'current' : 'default'}
          marks={creator ? yours : known ? <Tag>{t('levels.next')}</Tag> : undefined}
          price={rate(t, creator ? me.ratePercent : me.creatorRatePercent)}
          lead={creator ? t('levels.creatorNow') : n !== null ? t('levels.creatorLead', { n }) : t('levels.creatorLeadUnknown')}
          specs={creator ? [t('levels.pays'), t('levels.withdraw')] : [t('levels.newSpend'), t('levels.pays'), t('levels.withdraw')]}
        />
        <PlanCard
          name={t('stand.title')}
          // "Fewer than 3" is words in a number slot: the slot shows the figure "< 3" (one line at every width, so the price
          // row keeps its neighbours' height) and a screen reader hears the words once.
          price={{
            amount: (
              <>
                <bdi aria-hidden={band.k === 'band.few' ? 'true' : undefined}>{band.k === 'band.few' ? t('band.fewShort') : t(band.k, band.v)}</bdi>
                {band.k === 'band.few' && <SrOnly>{t('band.few')}</SrOnly>}
              </>
            ),
            per: <bdi>{n === null ? t('stand.ofUnknown') : t(creator ? 'stand.keep' : 'stand.of', { n })}</bdi>,
          }}
          lead={t('stand.lead')}
          note={t('stand.note')}
          action={<FaqLink item={byId.creator}>{t('stand.how')}</FaqLink>}
        />
      </PlanGrid>
      <HowYouEarn t={t} me={me} />
    </AnatomySection>
  );
}

/** How you earn: four short answers on the program's rules, the same in every state that shows levels.
 *  Each is the program docs' own fact (Qualifying spend, Earning period, Credit hold, Rates and levels). */
function HowYouEarn({ t, me }: { t: T; me: Me }) {
  const n = me.creatorThreshold;
  return (
    <SubSection id="referral-earn" title={t('earn.title')} state={{ kind: 'ready' }}>
      <div className={s.earn}>
        <PlanCard name={t('earn.what')} lead={t('earn.what.lead')} note={t('earn.what.not')} />
        <PlanCard name={t('earn.long')} lead={t('earn.long.lead')} note={t('earn.long.bare')} />
        <PlanCard name={t('earn.hold')} lead={t('earn.hold.lead')} note={t('earn.hold.note')} />
        <PlanCard name={t('earn.creator')} lead={n !== null ? t('earn.creator.lead', { n }) : t('earn.creator.leadUnknown')} note={t('earn.creator.kept')} />
      </div>
    </SubSection>
  );
}

/** Before joining: Referrer and Creator as the API sends them, untagged, then How you earn (it replaced How it works). */
function Preview({ t, me }: { t: T; me: Me }) {
  const n = me.creatorThreshold;
  return (
    <AnatomySection id="referral-levels" title={t('ladder.label')} description={t('levels.caption')} state={{ kind: 'ready' }}>
      <PlanGrid columns={2}>
        <PlanCard name={t('levels.referrer')} price={rate(t, me.ratePercent)} lead={t('levels.referrerLead')} specs={[t('levels.fromJoin'), t('levels.pays')]} />
        <PlanCard
          name={t('levels.creator')}
          price={rate(t, me.creatorRatePercent)}
          lead={n !== null ? t('levels.creatorLead', { n }) : t('levels.creatorLeadUnknown')}
          specs={[t('levels.newSpend'), t('levels.pays'), t('levels.withdraw')]}
        />
      </PlanGrid>
      <HowYouEarn t={t} me={me} />
    </AnatomySection>
  );
}
