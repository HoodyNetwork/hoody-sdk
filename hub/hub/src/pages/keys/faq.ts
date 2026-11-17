// The keys page's questions: every tab lists them as its "Questions" section, and the key drawers and
// the made-share panel link to single answers.
import type { FaqItem, Translate } from '@kit';
import type strings from './strings.en.json';

type T = Translate<typeof strings>;

export function pageFaq(t: T): {
  items: FaqItem[];
  byId: Record<'secretOnce' | 'whatIsKey' | 'realms' | 'rights' | 'endsAndAddresses' | 'sshKey' | 'shareRealm' | 'shareMessage', FaqItem>;
} {
  const items = [
    { id: 'secretOnce', q: t('faq.secretOnce.q'), a: t('faq.secretOnce.a') },
    { id: 'whatIsKey', q: t('faq.whatIsKey.q'), a: t('faq.whatIsKey.a') },
    { id: 'realms', q: t('faq.realms.q'), a: t('faq.realms.a') },
    { id: 'rights', q: t('faq.rights.q'), a: t('faq.rights.a') },
    { id: 'endsAndAddresses', q: t('faq.endsAndAddresses.q'), a: t('faq.endsAndAddresses.a') },
    { id: 'sshKey', q: t('faq.sshKey.q'), a: t('faq.sshKey.a') },
    { id: 'shareRealm', q: t('faq.shareRealm.q'), a: t('faq.shareRealm.a') },
    { id: 'shareMessage', q: t('faq.shareMessage.q'), a: t('faq.shareMessage.a') },
  ];
  return {
    items,
    byId: {
      secretOnce: items[0]!,
      whatIsKey: items[1]!,
      realms: items[2]!,
      rights: items[3]!,
      endsAndAddresses: items[4]!,
      sshKey: items[5]!,
      shareRealm: items[6]!,
      shareMessage: items[7]!,
    },
  };
}
