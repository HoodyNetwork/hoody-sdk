// The account page's questions: the page lists them as its "Questions" section, and the passcode row,
// the passcode sheet, the email sheet, the two-step row and the Remove all local data dialog link to single answers.
import type { FaqItem, Translate } from '@kit';
import type strings from './strings.en.json';

type T = Translate<typeof strings>;
type Id = 'lockProtects' | 'lockScope' | 'removeLocal' | 'emailChange' | 'endSession' | 'twoStep' | 'checkAgain' | 'agentDays';

export function pageFaq(t: T): { items: FaqItem[]; byId: Record<Id, FaqItem> } {
  const items = [
    { id: 'lockProtects', q: t('faq.lockProtects.q'), a: t('faq.lockProtects.a') },
    { id: 'lockScope', q: t('faq.lockScope.q'), a: t('faq.lockScope.a') },
    { id: 'removeLocal', q: t('faq.removeLocal.q'), a: t('faq.removeLocal.a') },
    { id: 'emailChange', q: t('faq.emailChange.q'), a: t('faq.emailChange.a') },
    { id: 'endSession', q: t('faq.endSession.q'), a: t('faq.endSession.a') },
    { id: 'twoStep', q: t('faq.twoStep.q'), a: t('faq.twoStep.a') },
    { id: 'checkAgain', q: t('faq.checkAgain.q'), a: t('faq.checkAgain.a') },
    { id: 'agentDays', q: t('faq.agentDays.q'), a: t('faq.agentDays.a') },
  ];
  return {
    items,
    byId: {
      lockProtects: items[0]!, lockScope: items[1]!, removeLocal: items[2]!, emailChange: items[3]!,
      endSession: items[4]!, twoStep: items[5]!, checkAgain: items[6]!, agentDays: items[7]!,
    },
  };
}
