// The scripts page's questions: the list pane lists them as its "Questions" section, New script shows them under its
// steps, and the Settings and Overview tabs link to single answers. The decisions stay where the person decides: the
// key-shown-once lines, what is hidden from the assistant, the public-link warnings, the delete consequences, the discard
// and held-change notices and the restore consent line.
import type { FaqItem, Translate } from '@kit';
import type strings from './strings.en.json';

type T = Translate<typeof strings>;

export function pageFaq(t: T): {
  items: FaqItem[];
  byId: Record<'whatIsScript' | 'needCode' | 'whatCan' | 'assistant' | 'schedule' | 'publicLink' | 'accessKey' | 'secrets' | 'settingsAtTop' | 'versionsAndDelete', FaqItem>;
} {
  const items = [
    { id: 'whatIsScript', q: t('faq.whatIsScript.q'), a: t('faq.whatIsScript.a') },
    { id: 'needCode', q: t('faq.needCode.q'), a: t('faq.needCode.a') },
    { id: 'whatCan', q: t('faq.whatCan.q'), a: t('faq.whatCan.a') },
    { id: 'assistant', q: t('faq.assistant.q'), a: t('faq.assistant.a') },
    { id: 'schedule', q: t('faq.schedule.q'), a: t('faq.schedule.a') },
    { id: 'publicLink', q: t('faq.publicLink.q'), a: t('faq.publicLink.a') },
    { id: 'accessKey', q: t('faq.accessKey.q'), a: t('faq.accessKey.a') },
    { id: 'secrets', q: t('faq.secrets.q'), a: t('faq.secrets.a') },
    { id: 'settingsAtTop', q: t('faq.settingsAtTop.q'), a: t('faq.settingsAtTop.a') },
    { id: 'versionsAndDelete', q: t('faq.versionsAndDelete.q'), a: t('faq.versionsAndDelete.a') },
  ];
  return {
    items,
    byId: {
      whatIsScript: items[0]!,
      needCode: items[1]!,
      whatCan: items[2]!,
      assistant: items[3]!,
      schedule: items[4]!,
      publicLink: items[5]!,
      accessKey: items[6]!,
      secrets: items[7]!,
      settingsAtTop: items[8]!,
      versionsAndDelete: items[9]!,
    },
  };
}
