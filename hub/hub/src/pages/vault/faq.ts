// The vault page's questions: the list lists them as its "Questions" section, and the entry panel, the New/Replace
// drawer and the Export dialog link to single answers.
import { hostEnv } from '@core';
import type { FaqItem, Translate } from '@kit';
import type strings from './strings.en.json';

type T = Translate<typeof strings>;

export function pageFaq(t: T): { items: FaqItem[]; byId: Record<'vaultFor' | 'scope' | 'showValue' | 'encrypt' | 'valueInput' | 'metadata' | 'export', FaqItem> } {
  const items = [
    { id: 'vaultFor', q: t('faq.vaultFor.q'), a: t('faq.vaultFor.a') },
    { id: 'scope', q: t('faq.scope.q'), a: t('faq.scope.a') },
    { id: 'showValue', q: t('faq.showValue.q'), a: t('faq.showValue.a') },
    { id: 'encrypt', q: t('faq.encrypt.q'), a: t('faq.encrypt.a') },
    { id: 'valueInput', q: t('faq.valueInput.q'), a: t('faq.valueInput.a') },
    { id: 'metadata', q: t('faq.metadata.q'), a: t('faq.metadata.a') },
    // Export saves a file to the device; a terminal has no download and its menu has no Export (view.tsx), so the
    // answer there says where Export is.
    { id: 'export', q: t('faq.export.q'), a: hostEnv().browserPage === true ? t('faq.export.a') : t('faq.export.a.terminal') },
  ];
  return { items, byId: { vaultFor: items[0]!, scope: items[1]!, showValue: items[2]!, encrypt: items[3]!, valueInput: items[4]!, metadata: items[5]!, export: items[6]! } };
}
