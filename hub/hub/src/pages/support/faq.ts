// The Support page's questions: what never goes in a ticket, why messages are plain text, and why there are limits.
// The limits' numbers are never written here: the New ticket drawer shows the account's own.
import type { FaqItem, Translate } from '@kit';
import type strings from './strings.en.json';

type T = Translate<typeof strings>;

export function pageFaq(t: T): { items: FaqItem[]; byId: Record<'secrets' | 'text' | 'limits', FaqItem> } {
  const items = [
    { id: 'secrets', q: t('faq.secrets.q'), a: t('faq.secrets.a') },
    { id: 'text', q: t('faq.text.q'), a: t('faq.text.a') },
    { id: 'limits', q: t('faq.limits.q'), a: t('faq.limits.a') },
  ];
  return { items, byId: { secrets: items[0]!, text: items[1]!, limits: items[2]! } };
}
