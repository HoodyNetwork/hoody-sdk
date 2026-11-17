// The notifications page's questions: the Get notified page shows them as its "Questions" section, and the
// Inbox's empty state and the browser card link to single answers.
import type { FaqItem, Translate } from '@kit';
import type strings from './strings.en.json';

type T = Translate<typeof strings>;

export function pageFaq(t: T): { items: FaqItem[]; byId: Record<'kinds' | 'bellInbox' | 'timing' | 'browser' | 'email' | 'iphone' | 'android', FaqItem> } {
  const items = [
    { id: 'kinds', q: t('faq.kinds.q'), a: t('faq.kinds.a') },
    { id: 'bellInbox', q: t('faq.bellInbox.q'), a: t('faq.bellInbox.a') },
    { id: 'timing', q: t('faq.timing.q'), a: t('faq.timing.a') },
    { id: 'browser', q: t('faq.browser.q'), a: t('faq.browser.a') },
    { id: 'email', q: t('faq.email.q'), a: t('faq.email.a') },
    { id: 'iphone', q: t('faq.iphone.q'), a: t('faq.iphone.a') },
    { id: 'android', q: t('faq.android.q'), a: t('faq.android.a') },
  ];
  return { items, byId: { kinds: items[0]!, bellInbox: items[1]!, timing: items[2]!, browser: items[3]!, email: items[4]!, iphone: items[5]!, android: items[6]! } };
}
