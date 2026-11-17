// The tunnels page's questions: the list lists them as its "Questions" section, and the Setup drawer, the
// reconnecting note and a web address's "Not loading?" link (the detail's tips) link to single answers.
import type { FaqItem, Translate } from '@kit';
import type strings from './strings.en.json';

type T = Translate<typeof strings>;

export function pageFaq(t: T): { items: FaqItem[]; byId: Record<'what' | 'twoWays' | 'ports' | 'riskyPorts' | 'password' | 'fails' | 'notLoading' | 'reconnecting', FaqItem> } {
  const items = [
    { id: 'what', q: t('faq.what.q'), a: t('faq.what.a') },
    { id: 'twoWays', q: t('faq.twoWays.q'), a: t('faq.twoWays.a') },
    { id: 'ports', q: t('faq.ports.q'), a: t('faq.ports.a') },
    { id: 'riskyPorts', q: t('faq.riskyPorts.q'), a: t('faq.riskyPorts.a') },
    { id: 'password', q: t('faq.password.q'), a: t('faq.password.a') },
    { id: 'fails', q: t('faq.fails.q'), a: t('faq.fails.a') },
    { id: 'notLoading', q: t('faq.notLoading.q'), a: t('faq.notLoading.a') },
    { id: 'reconnecting', q: t('faq.reconnecting.q'), a: t('faq.reconnecting.a') },
  ];
  return { items, byId: { what: items[0]!, twoWays: items[1]!, ports: items[2]!, riskyPorts: items[3]!, password: items[4]!, fails: items[5]!, notLoading: items[6]!, reconnecting: items[7]! } };
}
