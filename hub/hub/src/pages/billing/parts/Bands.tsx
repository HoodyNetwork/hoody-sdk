// Page bands above the sections: the payment return, a purchase that may have gone through, a suspended account.
// Inline first: these stay on the page until the person reads them, never fade like a toast.
import { Button } from '@kit';
import { useEffect, useState } from 'react';
import { useGo, useLocationHash, useSearch } from '@kit';
import { type UnknownCheckout, dropPaymentReturn, useBalance, usePaymentReturn, usePlans, useResume, useSubs } from '../data';
import { heldRef, heldRows, returnView } from '../logic';
import { type BillingView, links, viewOf } from '../links';
import type { ReturnState } from '../types';
import { usePlace } from '../pagelinks';
import { Band, type T, say } from './Bits';
import s from './parts.module.css';

/** The view these bands are drawn in: a checkout they open keeps it behind the drawer and returns to it. */
function useHereView(): BillingView {
  const q = useSearch();
  const anchor = useLocationHash();
  return viewOf(q.view, anchor ? '#' + anchor : '');
}

const HELD_BANDS = 3;

/**
 * A server on hold, on every Billing view: a person comes here to fix it, and the view they land on may not list it. One
 * band per server, with the same button and the same checkout as its row in Wallet & usage; past HELD_BANDS, one line
 * counts the rest and goes to Wallet & usage, so the bands never push the page far down.
 * A failed refresh keeps the last read's bands and says they may be out of date, except on Wallet & usage, whose
 * subscriptions table already says so with its own Retry (one failed read, one warning). Pay now stays: the checkout shows a load
 * error and is not ready while the list read fails, and once ready it sends only at a fresh pay quote's charge as the
 * ceiling. A list cut short (partial) may leave held servers out of the bands and the count, so it
 * says so, except on Wallet & usage, whose table already says the list is incomplete.
 */
export function HeldServerBands({ t, banned }: { t: T; banned: boolean }) {
  const subs = useSubs();
  const plans = usePlans();
  const go = useGo();
  const here = useHereView();
  const rows = subs.data ? heldRows(subs.data.subs, plans.data) : [];
  const more = rows.length - HELD_BANDS;
  const stale = here !== 'wallet' && subs.isError && subs.data !== undefined && rows.length > 0;
  const partial = here === 'wallet' ? null : (subs.data?.partial ?? null);
  return (
    <>
      {stale && (
        <Band
          tone="warn"
          dataAttr="held-stale" /* noDetails: a refresh that failed, the bands below are the last read */
          actions={
            <Button variant="secondary" size="sm" onPress={() => void subs.refetch()}>
              {t('action.tryAgain')}
            </Button>
          }
        >
          {t('subs.heldStale')}
        </Band>
      )}
      {rows.slice(0, HELD_BANDS).map((r) => {
        const label = r.pay === 'retry' ? t('subs.resumeRetry') : t('subs.payNow');
        return (
          <Band
            key={r.id}
            tone={r.tone === 'danger' ? 'danger' : 'warn'}
            dataAttr="held-server" /* noDetails: a server on hold is a state of the account, not a rejection */
            actions={
              <Button
                variant="secondary"
                size="sm"
                isDisabled={banned}
                disabledReason={t('mkt.suspended')}
                onPress={() => go(links.checkout('pay', { sub: r.id, view: 'wallet' }))}
                aria-label={t('subs.payNamed', { action: label, title: r.title, host: r.host })}
              >
                {r.pay === 'retry' ? t('subs.resumeRetry') : t('subs.payNow')}
              </Button>
            }
          >
            {t('subs.heldBand', { name: r.host, state: say(t, r.words) })}
          </Band>
        );
      })}
      {more > 0 && (
        <Band
          tone="warn"
          dataAttr="held-more" /* noDetails: a count of servers on hold, not a rejection */
          actions={
            <Button variant="secondary" size="sm" onPress={() => go(links.view('wallet'))}>
              {t('view.wallet')}
            </Button>
          }
        >
          {t('subs.heldMore', { count: more })}
        </Band>
      )}
      {partial && (
        <Band
          tone="warn"
          dataAttr="held-partial" /* noDetails: the server list was cut short, not a rejection */
          actions={
            <Button variant="secondary" size="sm" onPress={() => void subs.refetch()}>
              {t('action.tryAgain')}
            </Button>
          }
        >
          {t('subs.heldPartial', { shown: partial.shown, total: partial.total })}
        </Band>
      )}
    </>
  );
}

/** The payment-return band: checking, received, in review, failed, cancelled, processing, could not verify. */
export function ReturnBand({ t }: { t: T }) {
  const ret = usePaymentReturn();
  const resume = useResume();
  const go = useGo();
  const view = useHereView();
  const market = usePlace('market');
  const [dismissed, setDismissed] = useState(false);
  // A verified credit changes the wallet: read the balance again rather than wait out the stale window.
  const balance = useBalance();
  // A verified credit, or a review that already credited: both changed the wallet.
  const credited = ret.data?.state === 'received' || (ret.data?.state === 'review' && ret.data.credited);
  useEffect(() => {
    if (credited) void balance.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credited]);
  if (dismissed || ret.isError) return null;
  const st: ReturnState | null = ret.isPending ? { state: 'checking' } : (ret.data ?? null);
  if (!st || st.state === 'gone') return null;
  const v = returnView(st);
  const received = st.state === 'received';
  const r = resume.data ?? null;
  return (
    <Band
      tone={v.tone}
      dataAttr={`return-${st.state}`}
      outcome={st.state === 'failed' ? 'failed' : undefined}
      actions={
        <>
          {/* Only a verified credit offers the way back, and only to the purchase that was waiting. */}
          {received && r?.kind === 'buy' && (
            <Button variant="secondary" size="sm" onPress={() => go(links.checkout('buy', { plan: r.plan, view }))}>
              {t('market.continuePurchase')}
            </Button>
          )}
          {received && r?.kind === 'pay' && (
            <Button variant="secondary" size="sm" onPress={() => go(links.checkout('pay', { sub: r.sub, view }))}>
              {t('subs.continuePay')}
            </Button>
          )}
          {received && r?.kind === 'market' && market && (
            <Button variant="secondary" size="sm" onPress={market.open}>
              {t('toMarket')}
            </Button>
          )}
          {/* The press reads the payment's status again and sends nothing else: it says Check again, as the words beside it do. */}
          {v.refresh && (
            <Button size="sm" icon="reload" onPress={() => void ret.refetch()}>
              {t('buy.checkAgain')}
            </Button>
          )}
          {!v.busy && (
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                dropPaymentReturn();
                setDismissed(true);
              }}
            >
              {t('dismiss')}
            </Button>
          )}
        </>
      }
    >
      {say(t, v.word)}
    </Band>
  );
}

/** A purchase whose outcome is unknown: it may have gone through. Check again opens the checkout in check mode, which only reads and sends nothing. */
export function UnknownBands({ t, items }: { t: T; items: readonly UnknownCheckout[] }) {
  const go = useGo();
  // A pay or upgrade link names its server by the whole id: an ending may be shared, or name another server once the list changes.
  const linkOf = (x: UnknownCheckout['target']) => (x.subId ? { ...x, sub: x.subId } : x);
  const view = useHereView();
  return (
    <>
      {items.map((u) => (
        <Band
          key={u.key}
          tone="warn"
          dataAttr="unknown"
          outcome="pending"
          actions={
            <Button
              size="sm"
              icon="reload"
              onPress={() =>
                void (u.target.kind === 'rent' || u.target.kind === 'reserve' ? Promise.resolve(null) : heldRef(u.key)).then(
                  (held) => go(links.checkoutFor(linkOf(u.target), { check: true, view, held })),
                  // No fingerprint (no WebCrypto): the drawer names no kept request, and opening by handle alone could pick another server's.
                  () => go(links.checkoutFor(linkOf(u.target), { check: true, view, held: 'none' })),
                )
              }
            >
              {t('buy.checkAgain')}
            </Button>
          }
        >
          <strong>{t('band.unknownTitle', { title: u.title })}</strong>{' '}
          <span className={s.muted}>{u.sending ? t('band.sendingBody') : t('band.unknownBody')}</span>
          {u.persisted === false && <span className={s.muted}> {t('band.notSaved')}</span>}
        </Band>
      ))}
    </>
  );
}

/** The suspended-account band. `error`: the read refused 403 ACCOUNT_BANNED behind it (its details); none when only
 * an account state says banned (no failed request to explain). */
export function BannedBand({ t, onCheck, checking, error = null }: { t: T; onCheck: () => void; checking: boolean; error?: unknown }) {
  return (
    <Band
      tone="danger"
      dataAttr="banned"
      error={error}
      actions={
        <Button size="sm" busy={checking} onPress={onCheck}>
          {t('band.checkStatus')}
        </Button>
      }
    >
      <strong>{t('band.suspendedTitle')}</strong> <span className={s.muted}>{t('band.suspendedBody')}</span>
    </Band>
  );
}
