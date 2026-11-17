// The New realm page's questions: what a realm is, what a new one holds, and how to switch
// or remove one. Every answer was checked against the Hub and API source.
import type { FaqItem, Translate } from '@kit';
import type strings from './strings.en.json';

type T = Translate<typeof strings>;

export function pageFaq(t: T): { items: FaqItem[]; byId: Record<'whatIs' | 'startsWith' | 'pickMoves' | 'projects' | 'keysShares' | 'whatElse' | 'cost' | 'nameColour' | 'switchRemove', FaqItem> } {
  const items = [
    { id: 'whatIs', q: t('faq.whatIs.q'), a: t('faq.whatIs.a') },
    { id: 'startsWith', q: t('faq.startsWith.q'), a: t('faq.startsWith.a') },
    { id: 'pickMoves', q: t('faq.pickMoves.q'), a: t('faq.pickMoves.a') },
    { id: 'projects', q: t('faq.projects.q'), a: t('faq.projects.a') },
    { id: 'keysShares', q: t('faq.keysShares.q'), a: t('faq.keysShares.a') },
    { id: 'whatElse', q: t('faq.whatElse.q'), a: t('faq.whatElse.a') },
    { id: 'cost', q: t('faq.cost.q'), a: t('faq.cost.a') },
    { id: 'nameColour', q: t('faq.nameColour.q'), a: t('faq.nameColour.a') },
    { id: 'switchRemove', q: t('faq.switchRemove.q'), a: t('faq.switchRemove.a') },
  ];
  return { items, byId: { whatIs: items[0]!, startsWith: items[1]!, pickMoves: items[2]!, projects: items[3]!, keysShares: items[4]!, whatElse: items[5]!, cost: items[6]!, nameColour: items[7]!, switchRemove: items[8]! } };
}
