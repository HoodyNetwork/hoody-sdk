// The wallet band's Referral credit lines (WalletRail.tsx), in their own module so the terminal can lay them out
// itself (ReferralLines.term.tsx: the sentence wraps, the links follow on their own row).
import { FaqLink, TextButton, followPageLink, useGo, usePageLink } from '@kit';
import { type Balance } from '../data';
import { centsFromUsd, usd } from '../logic';
import { pageFaq } from '../faq';
import type { T } from './Bits';
import s from './parts.module.css';

/**
 * Referral credit: a line only when the account has some, and an owed line only when
 * something is owed. Most accounts have neither, and the card stays as it is. The first line shown ends with a link to
 * the Referrals page, only while this load serves it.
 */
export function ReferralLines({ t, balance }: { t: T; balance: Balance }) {
  const referrals = usePageLink('referrals');
  const go = useGo();
  const above0 = (v: string | null) => (centsFromUsd(v) ?? 0) > 0;
  const credit = above0(balance.referral);
  const owed = above0(balance.owed);
  if (!credit && !owed) return null;
  const { byId } = pageFaq(t);
  const more = (
    <>
      {referrals && (
        <>
          {' · '}
          <TextButton onPress={() => followPageLink(referrals, go)}>{t('referralLink')}</TextButton>
        </>
      )}
      {' · '}
      <FaqLink item={byId.walletCredit}>{t('credit.more')}</FaqLink>
    </>
  );
  return (
    <>
      {credit && (
        <p className={s.cardNote} data-referral="">
          {t('referralLine', { amount: usd(balance.referral) })}
          {more}
        </p>
      )}
      {owed && (
        <p className={s.cardNote} data-owed="">
          {t('owedLine', { amount: usd(balance.owed) })}
          {!credit && more}
        </p>
      )}
    </>
  );
}
