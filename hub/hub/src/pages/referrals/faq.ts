// The Referrals page's questions: the program rules, every
// limit included. The page shows them as its "Questions" section wherever it invites or promises earnings; the not-eligible
// line and the Join confirm link to single answers. The share is never a number here: the level card and the Join
// confirm show the API's rate_percent.
import type { FaqItem, Translate } from '@kit';
import type strings from './strings.en.json';

type T = Translate<typeof strings>;

export function pageFaq(t: T): { items: FaqItem[]; byId: Record<'rate' | 'notCounted' | 'window' | 'bareMetal' | 'hold' | 'spend' | 'withdraw' | 'creator' | 'privacy' | 'eligible', FaqItem> } {
  const items = [
    { id: 'rate', q: t('faq.rate.q'), a: t('faq.rate.a') },
    { id: 'notCounted', q: t('faq.notCounted.q'), a: t('faq.notCounted.a') },
    { id: 'window', q: t('faq.window.q'), a: t('faq.window.a') },
    { id: 'bareMetal', q: t('faq.bareMetal.q'), a: t('faq.bareMetal.a') },
    { id: 'hold', q: t('faq.hold.q'), a: t('faq.hold.a') },
    { id: 'spend', q: t('faq.spend.q'), a: t('faq.spend.a') },
    { id: 'withdraw', q: t('faq.withdraw.q'), a: t('faq.withdraw.a') },
    { id: 'creator', q: t('faq.creator.q'), a: t('faq.creator.a') },
    { id: 'privacy', q: t('faq.privacy.q'), a: t('faq.privacy.a') },
    { id: 'eligible', q: t('faq.eligible.q'), a: t('faq.eligible.a') },
  ];
  return { items, byId: { rate: items[0]!, notCounted: items[1]!, window: items[2]!, bareMetal: items[3]!, hold: items[4]!, spend: items[5]!, withdraw: items[6]!, creator: items[7]!, privacy: items[8]!, eligible: items[9]! } };
}
