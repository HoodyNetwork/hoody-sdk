// Withdraw Referral credit: information only, it sends nothing. The API has
// no withdrawal route or flag, so nothing here says withdrawal is on: one sentence says who may ask (a Creator), where
// this account stands and, for a Creator, how (ask Hoody support about withdrawing; no withdrawal
// switch is described). The rule itself lives in the page FAQ (the dialog links its answer). Every figure comes from
// `me`: the Creator number only when the API sent one. Earning paused adds no rule of its own (neither the API nor the
// public docs have one): the level decides; Removed never sees the button (CreditCard).
import { Dialog } from '@kit';
import { pageFaq } from '../faq';
import type { Me } from '../logic';
import type { T } from './types';

export function WithdrawInfo({ t, me, isOpen, onOpenChange }: { t: T; me: Me; isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const body =
    me.level === 'creator'
      ? t('withdraw.creator')
      : me.creatorThreshold !== null
        ? t('withdraw.referrerN', { n: me.creatorThreshold })
        : t('withdraw.referrer');
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t('withdraw.title')}
      overlayId="referrals-withdraw"
      body={body}
      faq={{ item: pageFaq(t).byId.withdraw, label: t('withdraw.more') }}
      primaryLabel={t('withdraw.close')}
      onPrimary={() => onOpenChange(false)}
      primaryChip={false}
      hideCancel
      initialFocus="primary"
    />
  );
}
