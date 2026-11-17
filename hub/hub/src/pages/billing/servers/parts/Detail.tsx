// The listing inspector: the spec sheet, the term picker, the order as a ledger, delivery and what happens after the
// term as facts, and "Good to know" as a list in the open, in the order DetailSections gives them; and the sticky footer
// with what the balance says above the buy button.
// The buy button is a link to billing's checkout drawer; nothing is bought from here.
import { deliveryLine } from './Detail.pure';
import { DetailSections } from './DetailSections';
export { placeLine } from './Detail.pure';
import { Button, DetailBody, DetailFooter, Facts, ItemList, Ledger, Notice, RadioGroup, Stack, SubSection, followPageLink, useGo, usePageLink, useStrings, type Fact } from '@kit';
import { listingRules } from '@core';
import { links as billing } from '../../links';
import { type Listing, type Term, buyable, factsOf, money, moneyIn, shortfall, splitTerm } from '../logic';
import strings from '../strings.en.json';
import type { T } from './words';
import s from './Detail.module.css';

export interface DetailProps {
  listing: Listing;
  term: Term | null;
  onDays: (days: string) => void;
}

/**
 * Everything the listing says, as one spec sheet: core's listing facts, the very list Billing's checkout shows. A fact
 * the row left out reads "Not listed"; several disk groups go one per line. Location stays although the header names
 * the city: the fact also holds the data centre, the region and the country's name. Delivery and setup are left to the
 * order facts below, which word them as sentences.
 */
export function specFacts(l: Listing): Fact[] {
  return listingRules
    .listingFacts(factsOf(l))
    .filter((f) => f.key !== 'delivery' && f.key !== 'setup')
    .map((f) => ({
      label: f.label,
      value:
        typeof f.value === 'string' ? (
          listingRules.factText(f.value)
        ) : (
          <ul className={s.lines}>
            {f.value.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        ),
    }));
}

/** What the order says besides its money: how it is delivered and, when the term says, what happens after it (a 0-day
 * hold too: the data is deleted). */
function orderFacts(t: T, l: Listing, term: Term | null): Fact[] {
  return [
    { label: t('detail.delivery'), value: deliveryLine(t, l) },
    ...(term && term.holdDays !== null ? [{ label: t('term.after'), value: term.holdDays > 0 ? t('term.hold', { count: term.holdDays }) : t('term.hold.none') }] : []),
  ];
}

export function Detail({ listing: l, term, onDays }: DetailProps) {
  const t = useStrings(strings);
  const parts = term ? splitTerm(term) : { rental: null, setup: null };
  // The summary's lines add up: one has cents, all show cents.
  const sumLines = [parts.rental, parts.setup, term?.totalCents ?? null];
  return (
    <DetailBody>
      <DetailSections
        specs={<Facts items={specFacts(l)} columns={1} layout="spec" label={t('detail.specs')} />}
        terms={
          l.terms.length > 0 ? (
            <RadioGroup
              label={t('detail.terms')}
              value={term ? String(term.days) : undefined}
              onChange={onDays}
              options={[...l.terms]
                .sort((a, b) => a.days - b.days)
                .map((x) => ({ value: String(x.days), label: t('term.perDays', { days: x.days, amount: money(x.totalCents) }) }))}
            />
          ) : null
        }
        order={
          term ? (
            <SubSection title={t('buy.title')}>
              <Ledger
                label={t('buy.title')}
                rows={[
                  ...(parts.rental !== null ? [{ id: 'rental', label: t('buy.rental'), amount: moneyIn(parts.rental, sumLines) }] : []),
                  ...(parts.setup ? [{ id: 'setup', label: t('buy.setup'), amount: moneyIn(parts.setup, sumLines) }] : []),
                ]}
                total={{ label: t('buy.total'), amount: moneyIn(term.totalCents, sumLines) }}
              />
            </SubSection>
          ) : null
        }
        orderFacts={<Facts items={orderFacts(t, l, term)} columns={1} layout="spec" label={t('detail.delivery')} />}
        perks={<GoodToKnow listing={l} />}
      />
    </DetailBody>
  );
}

/** "Good to know": what is always true of a purchase, then what a pre-order adds, each sentence a row shown without
 * opening anything (the refund terms are read before the buy button, never behind a question). */
function GoodToKnow({ listing: l }: { listing: Listing }) {
  const t = useStrings(strings);
  const items = [
    { id: 'prepaid', title: t('perk.prepaid') },
    { id: 'unlimited', title: t('perk.unlimited') },
    ...(l.kind === 'offer' ? [{ id: 'offer', title: t('perk.offer') }] : []),
  ];
  return (
    <SubSection title={t('detail.perks')} state={{ kind: 'ready' }}>
      <ItemList label={t('detail.perks')} items={items} />
    </SubSection>
  );
}

export interface OrderProps {
  listing: Listing;
  term: Term | null;
  /** What a server purchase can spend in cents (general + Referral credit), or null while loading or unreadable. */
  balance: number | null;
  /** Referral credit in cents (0 when none): when above 0 the footer names both parts. */
  referral?: number;
  /** The general wallet in cents, or null. */
  general?: number | null;
  balanceFailed: boolean;
  banned: boolean;
  /** The page's own address, so checkout returns here. */
  from: string;
  onSimilar: () => void;
}

/** The inspector's sticky footer: what the balance says as its reason line, then the one primary button. A listing
 * that cannot be bought here draws no order button at all, only the reason, and no action row under it. */
export function OrderFooter({ listing: l, term, balance, referral = 0, general = null, balanceFailed, banned, from, onSimilar }: OrderProps) {
  const t = useStrings(strings);
  const go = useGo();
  // Checkout lives on the billing page, which takes the order itself; a load that hides Billing has no link, so no
  // control.
  const billingLink = usePageLink('billing');
  const toBilling = (href: string) => (billingLink?.kind === 'hub' ? go(href) : billingLink ? followPageLink(billingLink, go) : undefined);
  if (!buyable(l) || term === null) {
    // Nothing here can be bought, so no control is primary; Add funds stays reachable where a phone hides the header.
    return (
      <DetailFooter notice={t('buy.unbuyable')}>
        <Button onPress={onSimilar}>{t('buy.similar')}</Button>
        {!banned && billingLink ? (
          <Button variant="secondary" onPress={() => toBilling(billing.funds(from))}>
            {t('buy.addFunds')}
          </Button>
        ) : null}
      </DetailFooter>
    );
  }
  if (banned) return <DetailFooter notice={t('buy.banned')} />;
  if (!billingLink) return <DetailFooter notice={t('buy.unavailable')} />;
  // A Billing link that is not the Hub's own page cannot take the listing and term: only Add funds.
  if (billingLink.kind !== 'hub') {
    return (
      <DetailFooter notice={t('buy.classic')}>
        <Button variant="secondary" onPress={() => toBilling(billing.funds(from))}>
          {t('buy.addFunds')}
        </Button>
      </DetailFooter>
    );
  }
  const gap = shortfall(balance, term.totalCents);
  const href = l.kind === 'offer' ? billing.reserve(l.id, term.days, from) : billing.rent(l.id, term.days, from);
  // What the balance says is the footer's reason line, above the actions: beside them, "You're $… short", Add funds and
  // Rent this server never fit a phone. A sentence, never a status pill: a shortfall takes the kit's warn notice, every
  // other reason is plain text.
  const reason = gap ? (
    gap.ok ? (
      t('buy.enough')
    ) : (
      <Notice level="warn">{t('buy.short', { amount: money(gap.shortBy) })}</Notice>
    )
  ) : balanceFailed ? (
    t('buy.noBalance')
  ) : undefined;
  // With Referral credit the footer says what each part holds; it is spent first on servers.
  const notice =
    gap && referral > 0 && general !== null ? (
      <Stack gap={1}>
        {reason}
        <span data-order-split="">
          {t('bal.wallet', { amount: money(general) })} · {t('bal.referral', { amount: money(referral) })}
        </span>
      </Stack>
    ) : (
      reason
    );
  return (
    <DetailFooter notice={notice}>
      {gap && !gap.ok ? (
        <Button variant="secondary" onPress={() => toBilling(billing.funds(from))}>
          {t('buy.addFunds')}
        </Button>
      ) : null}
      <Button variant="primary" onPress={() => toBilling(href)}>
        {l.kind === 'offer' ? t('buy.reserve') : t('buy.rent')}
      </Button>
    </DetailFooter>
  );
}
