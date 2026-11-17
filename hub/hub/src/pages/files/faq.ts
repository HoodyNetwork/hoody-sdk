// The Files page's questions: every tab lists them as the page's "Questions" section. They hold the
// background the Mount dialog, the Storage tab and the Use from your PC tab explain in place; consent, security and
// destructive lines stay where they are.
import type { FaqItem, Translate } from '@kit';
import type strings from './strings.en.json';

type T = Translate<typeof strings>;

export type FaqId = 'mountDevice' | 'mountLinux' | 'mountCli' | 'pcNeeds' | 'pcShare' | 'storageConnect' | 'storageUploadWait' | 'limits';

export function pageFaq(t: T): { items: FaqItem[]; byId: Record<FaqId, FaqItem> } {
  const items = [
    { id: 'mountDevice', q: t('faq.mountDevice.q'), a: t('faq.mountDevice.a') },
    { id: 'mountLinux', q: t('faq.mountLinux.q'), a: t('faq.mountLinux.a') },
    { id: 'mountCli', q: t('faq.mountCli.q'), a: t('faq.mountCli.a') },
    { id: 'pcNeeds', q: t('faq.pcNeeds.q'), a: t('faq.pcNeeds.a') },
    { id: 'pcShare', q: t('faq.pcShare.q'), a: t('faq.pcShare.a') },
    { id: 'storageConnect', q: t('faq.storageConnect.q'), a: t('faq.storageConnect.a') },
    { id: 'storageUploadWait', q: t('faq.storageUploadWait.q'), a: t('faq.storageUploadWait.a') },
    { id: 'limits', q: t('faq.limits.q'), a: t('faq.limits.a') },
  ];
  return {
    items,
    byId: {
      mountDevice: items[0]!, mountLinux: items[1]!, mountCli: items[2]!, pcNeeds: items[3]!,
      pcShare: items[4]!, storageConnect: items[5]!, storageUploadWait: items[6]!, limits: items[7]!,
    },
  };
}
