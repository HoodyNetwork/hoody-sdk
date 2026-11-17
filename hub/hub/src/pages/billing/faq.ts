// The billing page's questions: the page lists them as its "Questions" section, and the wallet lines, the AI usage and
// subscriptions sections, the Add funds drawer and the upgrade drawer link to single answers. The decision text (the Stop tracking
// dialogs, the auto-renew confirm, purchase terms, outcome notices) stays where the person decides.
import type { FaqItem, Translate } from '@kit';
import type strings from './strings.en.json';

type T = Translate<typeof strings>;

export function pageFaq(t: T): {
  items: FaqItem[];
  byId: Record<'addFunds' | 'stopTracking' | 'autoRenew' | 'retrySafe' | 'upgrade' | 'freeServer' | 'aiAllowance' | 'walletCredit', FaqItem>;
} {
  const items = [
    { id: 'addFunds', q: t('faq.addFunds.q'), a: t('faq.addFunds.a') },
    { id: 'stopTracking', q: t('faq.stopTracking.q'), a: t('faq.stopTracking.a') },
    { id: 'autoRenew', q: t('faq.autoRenew.q'), a: t('faq.autoRenew.a') },
    { id: 'retrySafe', q: t('faq.retrySafe.q'), a: t('faq.retrySafe.a') },
    { id: 'upgrade', q: t('faq.upgrade.q'), a: t('faq.upgrade.a') },
    { id: 'freeServer', q: t('faq.freeServer.q'), a: t('faq.freeServer.a') },
    { id: 'aiAllowance', q: t('faq.aiAllowance.q'), a: t('faq.aiAllowance.a') },
    { id: 'walletCredit', q: t('faq.walletCredit.q'), a: t('faq.walletCredit.a') },
  ];
  return {
    items,
    byId: {
      addFunds: items[0]!,
      stopTracking: items[1]!,
      autoRenew: items[2]!,
      retrySafe: items[3]!,
      upgrade: items[4]!,
      freeServer: items[5]!,
      aiAllowance: items[6]!,
      walletCredit: items[7]!,
    },
  };
}
