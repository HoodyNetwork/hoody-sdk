// The wallet band: ONE card holding the balance (and why it is there) and the GitHub bonus as a second line under it.
// The balance is the wallet's USD string; a failed read says so and offers Try again, it never shows a guess. The band
// is the page's first card, above the sections, at every width. Add funds is never in the band: the page header has it at every width (the floating button on a phone),
// so the page shows it once.
import { Band, Button, ErrorState, Skeleton, StatusPill } from '@kit';
import { useState } from 'react';
import { type Balance, useBalance, useBonus, useClaimBonus } from '../data';
import { bonusView, usd } from '../logic';
import type { BonusResult, RawBonus } from '../types';
import { type T, say } from './Bits';
import { HoldDismiss } from './HoldDismiss';
import { ReferralLines } from './ReferralLines';
import s from './parts.module.css';

/** The wallet: one card, the balance on top, the bonus (when the account has an offer) under it. */
export function WalletBand({ t }: { t: T }) {
  return (
    <section className={`${s.card} ${s.walletBand}`} aria-labelledby="bill-wallet" data-card="wallet">
      <WalletTop t={t} />
      <BonusLine t={t} />
    </section>
  );
}

function WalletTop({ t }: { t: T }) {
  const balance = useBalance();
  return (
    <div className={s.walletTop}>
      <div className={s.walletMain}>
        <h2 id="bill-wallet" className={`${s.cardLabel} ${s.walletLabel}`}>
          {t('wallet')}
        </h2>
        {balance.isPending ? (
          <Skeleton rows={2} variant="text" />
        ) : balance.isError ? (
          <ErrorState size="compact" title={t('balanceErr')} onRetry={() => void balance.refetch()} />
        ) : (
          <>
            <p className={s.balance} data-balance="">
              {usd((balance.data as Balance).general)}
            </p>
            <p className={s.cardNote}>{t('generalNote')}</p>
            <ReferralLines t={t} balance={balance.data as Balance} />
          </>
        )}
      </div>
    </div>
  );
}

/** Nothing at all unless the account can take part: an offer that can only be refused is noise. */
function BonusLine({ t }: { t: T }) {
  const bonus = useBonus();
  const claim = useClaimBonus();
  const [res, setRes] = useState<BonusResult | null>(null);
  if (bonus.isPending || bonus.isError) return null;
  // Core's claim lock outlives this card and frees only when a read shows the offer claimed: until then the offer is unknown, even after a remount.
  const v = bonusView(bonus.data as RawBonus | null, res ?? (claim.pending ? { result: 'retry' } : null));
  if (!v) return null;
  const onClaim = () => {
    // After an unknown claim the action reads the offer again; it never sends a second claim.
    if (v.unknown) {
      // Core's read-back releases its claim lock only after a fresh, successful read of the offer.
      void claim.readBack().then(async (ok) => {
        const r = await bonus.refetch();
        if (ok && !r.isError) setRes(null);
      });
      return;
    }
    void claim.run().then((r) => {
      if (r.outcome === 'done' && r.data) setRes(r.data);
      // A refusal because an earlier claim is unread is that claim still being unknown, never a new error.
      else if (r.code === 'READ_BACK_FIRST') setRes({ result: 'retry' });
      // Unknown: never "no bonus"; the claim is one per account, so reading the offer again is the check.
      else if (r.outcome === 'pending') {
        setRes({ result: 'retry' });
        void bonus.refetch();
      } else setRes({ result: 'error' });
    });
  };
  return (
    <div className={s.walletBonus} role="group" aria-labelledby="bill-bonus" data-card="bonus">
      <div className={s.cardHead}>
        <h2 id="bill-bonus" className={`${s.cardLabel} ${s.walletLabel}`}>
          {t('bonus.ghBonusTitle')}
        </h2>
        {v.badge && <StatusPill tone={v.badge.tone}>{say(t, v.badge.word)}</StatusPill>}
      </div>
      {v.lines.map((w) => (
        <p key={w.k} className={s.bonusAmount}>
          {say(t, w)}
        </p>
      ))}
      {v.claim && (
        <>
          {v.note && (
            <Band tone="warn" size="table">
              {say(t, v.note)}
            </Band>
          )}
          <div className={s.cardActions}>
            <Button variant="secondary" busy={claim.running} isDisabled={v.cooling} onPress={onClaim}>
              {claim.running
                ? t('bonus.ghBonusClaiming')
                : v.unknown
                  ? t('bonus.ghBonusCheck')
                  : v.retry
                    ? t('bonus.ghBonusTryAgain')
                    : t('bonus.ghBonusClaim')}
            </Button>
            {v.unknown && claim.pending && !claim.running && (
              <HoldDismiss
                t={t}
                find={claim.holds}
                onDismiss={(h) =>
                  void claim.dismissHeld(h).then((freed) => {
                    // A hold that moved on frees nothing: the offer stays unknown and is read again.
                    if (freed) setRes(null);
                    void bonus.refetch();
                  })
                }
              />
            )}
            {v.user && (
              <span className={s.bonusUser}>
                {t('bonus.ghBonusAccountLabel')} <bdi>{t('bonus.handle', { user: v.user })}</bdi>
              </span>
            )}
          </div>
          <p className={s.cardNote}>{t('bonus.ghBonusTerms')}</p>
        </>
      )}
    </div>
  );
}
