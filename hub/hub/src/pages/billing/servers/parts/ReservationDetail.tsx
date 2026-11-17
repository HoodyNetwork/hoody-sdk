// The reservation inspector: the terms quoted when it was paid for (delivery, setup time, the hold after the term),
// what it cost as a ledger, and what it was delivered as; its footer opens the computers on the delivered server.
// Read-only: the reservation list's own row, no extra read (GET /reservations returns the same fields as
// GET /reservations/{id}).
import { Button, DetailBody, DetailFooter, Facts, Ledger, NotifyHint, Stack, SubSection, followPageLink, formatDateTime, useGo, usePageLink, useStrings, type Fact } from '@kit';
import { type Reservation, delivery, money } from '../logic';
import strings from '../strings.en.json';
import { deliveryText, readyText } from './words';

export interface ReservationDetailProps {
  reservation: Reservation;
  now: number;
}

export function ReservationDetail({ reservation: r, now }: ReservationDetailProps) {
  const t = useStrings(strings);
  const q = r.quoted;
  const dash = t('res.dash');
  const terms: Fact[] = [
    { label: t('res.fact.ordered'), value: r.createdAt ? formatDateTime(new Date(r.createdAt).toISOString()) : dash },
    { label: t('col.res.term'), value: r.days === null ? dash : t('res.days', { n: r.days }) },
    { label: t('res.fact.delivery'), value: q.deliveryHours === null ? dash : deliveryText(t, delivery(q.deliveryHours)) },
    { label: t('res.fact.setup'), value: q.setupMinutes === null ? dash : t('res.minutes', { n: q.setupMinutes }) },
    ...(r.state === 'pending' ? [{ label: t('col.res.ready'), value: readyText(t, r.readyBy, now).text }] : []),
    // What happens after the term, as quoted (a 0-day hold too): the data is deleted.
    ...(q.holdDays !== null ? [{ label: t('term.after'), value: q.holdDays > 0 ? t('term.hold', { count: q.holdDays }) : t('term.hold.none'), wide: true }] : []),
  ];
  // Money shows only when the API sent it (a caller without the billing right gets none of it).
  const quoted = [
    ...(q.rentalCents === null ? [] : [{ id: 'rental', label: t('res.fact.rental'), amount: money(q.rentalCents) }]),
    ...(q.setupFeeCents === null ? [] : [{ id: 'setup', label: t('res.fact.setupFee'), amount: money(q.setupFeeCents) }]),
  ];
  const hasMoney = quoted.length > 0 || r.paidCents !== null;
  const delivered: Fact[] = [
    ...(r.serverId ? [{ label: t('res.fact.server'), id: r.serverId }] : []),
    ...(r.rentalId ? [{ label: t('res.fact.rentalId'), id: r.rentalId }] : []),
  ];
  return (
    <DetailBody>
      <Stack gap={5}>
        <SubSection title={t('res.detail.terms')}>
          <Facts columns={2} items={terms} label={t('res.detail.terms')} />
          {r.state === 'pending' ? <NotifyHint kind="purchase" /> : null}
        </SubSection>
        {hasMoney ? (
          <SubSection title={t('res.detail.paid')}>
            <Ledger label={t('res.detail.paid')} rows={quoted} {...(r.paidCents === null ? {} : { total: { label: t('col.res.paid'), amount: money(r.paidCents) } })} />
          </SubSection>
        ) : null}
        {delivered.length ? (
          <SubSection title={t('res.detail.delivered')}>
            <Facts columns={1} items={delivered} label={t('res.detail.delivered')} />
          </SubSection>
        ) : null}
      </Stack>
    </DetailBody>
  );
}

/** The reservation inspector's footer: the computers on the server it was delivered as. The page gives the pane this
 * footer only for a delivered reservation while the Hub serves Computers, so no empty bar is ever drawn. */
export function ReservationFooter({ reservation: r }: { reservation: Reservation }) {
  const t = useStrings(strings);
  const go = useGo();
  const computersLink = usePageLink('computers');
  const serverId = r.serverId;
  if (!serverId || !computersLink) return null;
  return (
    <DetailFooter>
      <Button variant="secondary" onPress={() => (computersLink.kind === 'hub' ? go(`${computersLink.href}?server=${encodeURIComponent(serverId)}`) : followPageLink(computersLink, go))}>
        {t('res.viewServer')}
      </Button>
    </DetailFooter>
  );
}
