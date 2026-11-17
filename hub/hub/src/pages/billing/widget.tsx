// Home widget "Billing": the wallet balance and the paid servers that need money first, in 32 px rows, with View all.
// C9: a balance or a list that did not load is said to have not loaded (Try again), never shown as 0 or as "no servers".
// The card's own frame carries "View all", so the body has none. A framed Hub reads nothing here: Billing is a sensitive page and opens in the Hub's own tab.
import { EmptyState, ErrorState, Link, Skeleton, type Tone, WidgetList, WidgetRow, WidgetStat, useStrings } from '@kit';
import { isFramed } from '@core';
import { useBalance, useSubs } from './data';
import { usd } from './logic';
import { links } from './links';
import strings from './strings.en.json';
import s from './widget.module.css';
import { widgetSubs } from './widget.logic';
import type { SubRow } from './logic';
import type { Balance } from './data';
import type { RawSub } from './types';

const toneOf = (t: SubRow['tone']): Tone => (t === 'busy' ? 'info' : t === 'muted' ? 'neutral' : t);

export default function BillingWidget() {
  return isFramed() ? <Framed /> : <Body />;
}

function Framed() {
  const t = useStrings(strings);
  return <EmptyState size="compact" icon="hoody-balance" title={t('widget.framed')} action={<Link href={window.location.href}>{t('top.framedOpen')}</Link>} />;
}

function Body() {
  const t = useStrings(strings);
  const balance = useBalance();
  const subs = useSubs();
  if (balance.isPending && subs.isPending) return <Skeleton variant="widget" />;
  const rows = subs.data ? widgetSubs(subs.data.subs as RawSub[]) : [];
  // A refresh that failed leaves the last read on screen: say it is not current, with a way to read again.
  const stale = (balance.isError && !!balance.data) || (subs.isError && !!subs.data);
  const refresh = () => {
    if (balance.isError) void balance.refetch();
    if (subs.isError) void subs.refetch();
  };
  return (
    <>
      {balance.isPending ? (
        <Skeleton rows={1} variant="text" />
      ) : balance.isError && !balance.data ? (
        <ErrorState size="compact" title={t('balanceErr')} onRetry={() => void balance.refetch()} />
      ) : (
        <WidgetStat value={usd((balance.data as Balance).general)} caption={t('widget.balance')} />
      )}
      {subs.isPending ? (
        <Skeleton rows={2} variant="widget" />
      ) : subs.isError && !subs.data ? (
        <ErrorState size="compact" title={t('subs.loadErr')} onRetry={() => void subs.refetch()} />
      ) : rows.length > 0 ? (
        <>
          <p className={s.section}>{t('widget.servers')}</p>
          <WidgetList label={t('widget.servers')}>
            {rows.map((r) => (
              <WidgetRow
                key={r.id}
                label={r.host}
                href={links.subscriptions}
                tone={toneOf(r.tone)}
                meta={r.dates ? t(r.dates.k, r.dates.v) : undefined}
                pill={r.pay !== null || r.tone === 'warn' || r.tone === 'danger' ? { tone: toneOf(r.tone), text: t(r.chip.k, r.chip.v) } : undefined}
              />
            ))}
          </WidgetList>
        </>
      ) : subs.data?.partial ? null : (
        <EmptyState size="compact" title={t('widget.none')} />
      )}
      {subs.data?.partial && <p className={s.note}>{t('subs.partial', { shown: subs.data.partial.shown, total: subs.data.partial.total })}</p>}
      {stale && <ErrorState size="compact" title={t('widget.stale')} onRetry={refresh} />}
    </>
  );
}
