// The computers page's questions: every view lists them as its "Questions" section, and the drawers link to
// single answers (a peek over the drawer). Consent and destructive lines stay where they are; this file holds the background only.
import type { FaqItem, Translate } from '@kit';
import type strings from './strings.en.json';

type T = Translate<typeof strings>;

export type FaqId = 'whatYouGet' | 'realmsAndProjects' | 'whoCanOpen' | 'firewall' | 'proxyAndExit' | 'ownDomain' | 'sshAndTerminal' | 'snapshotsAndBackups';

export function pageFaq(t: T): { items: FaqItem[]; byId: Record<FaqId, FaqItem> } {
  const items = [
    { id: 'whatYouGet', q: t('faq.whatYouGet.q'), a: t('faq.whatYouGet.a') },
    { id: 'realmsAndProjects', q: t('faq.realmsAndProjects.q'), a: t('faq.realmsAndProjects.a') },
    { id: 'whoCanOpen', q: t('faq.whoCanOpen.q'), a: t('faq.whoCanOpen.a') },
    { id: 'firewall', q: t('faq.firewall.q'), a: t('faq.firewall.a') },
    { id: 'proxyAndExit', q: t('faq.proxyAndExit.q'), a: t('faq.proxyAndExit.a') },
    { id: 'ownDomain', q: t('faq.ownDomain.q'), a: t('faq.ownDomain.a') },
    { id: 'sshAndTerminal', q: t('faq.sshAndTerminal.q'), a: t('faq.sshAndTerminal.a') },
    { id: 'snapshotsAndBackups', q: t('faq.snapshotsAndBackups.q'), a: t('faq.snapshotsAndBackups.a') },
  ];
  return {
    items,
    byId: {
      whatYouGet: items[0]!, realmsAndProjects: items[1]!, whoCanOpen: items[2]!, firewall: items[3]!,
      proxyAndExit: items[4]!, ownDomain: items[5]!, sshAndTerminal: items[6]!, snapshotsAndBackups: items[7]!,
    },
  };
}
