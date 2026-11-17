// The VMs page's questions: the list screen lists them as its "Questions" section, the page's guide in long form (what a
// VM is, what it needs, its screen, Windows, ports, why one failed, the console line).
import type { FaqItem, Translate } from '@kit';
import type strings from './strings.en.json';

type T = Translate<typeof strings>;

export type VmsFaqId = 'what' | 'bareMetal' | 'screen' | 'windows' | 'ports' | 'failed' | 'console';

export function pageFaq(t: T): { items: FaqItem[]; byId: Record<VmsFaqId, FaqItem> } {
  const items = [
    { id: 'what', q: t('faq.what.q'), a: t('faq.what.a') },
    { id: 'bareMetal', q: t('faq.bareMetal.q'), a: t('faq.bareMetal.a') },
    { id: 'screen', q: t('faq.screen.q'), a: t('faq.screen.a') },
    { id: 'windows', q: t('faq.windows.q'), a: t('faq.windows.a') },
    { id: 'ports', q: t('faq.ports.q'), a: t('faq.ports.a') },
    { id: 'failed', q: t('faq.failed.q'), a: t('faq.failed.a') },
    { id: 'console', q: t('faq.console.q'), a: t('faq.console.a') },
  ];
  return { items, byId: { what: items[0]!, bareMetal: items[1]!, screen: items[2]!, windows: items[3]!, ports: items[4]!, failed: items[5]!, console: items[6]! } };
}
