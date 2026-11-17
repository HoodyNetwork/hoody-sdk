// The Bots page's questions: the list lists them as its "Questions" section, and the empty list, the Link tab, the
// link drawers, the chat-app setup and the Settings drawer link to single answers. The decision text (the Auto-approve confirms,
// revoke and delete dialogs, outcome notices) stays where the person decides. The key count and the call limits in the answers are
// the ones logic.ts enforces (KEYS_MAX, LIMITS); faq.test.ts fails when they part.
import type { FaqItem, Translate } from '@kit';
import type strings from './strings.en.json';

type T = Translate<typeof strings>;

export function pageFaq(t: T): {
  items: FaqItem[];
  byId: Record<'whatIsBot' | 'defaultBot' | 'linkKeys' | 'corsLimits' | 'autoApprove' | 'chatOwner' | 'telegramPrivacy' | 'groupChats' | 'models', FaqItem>;
} {
  const items = [
    { id: 'whatIsBot', q: t('faq.whatIsBot.q'), a: t('faq.whatIsBot.a') },
    { id: 'defaultBot', q: t('faq.defaultBot.q'), a: t('faq.defaultBot.a') },
    { id: 'linkKeys', q: t('faq.linkKeys.q'), a: t('faq.linkKeys.a') },
    { id: 'corsLimits', q: t('faq.corsLimits.q'), a: t('faq.corsLimits.a') },
    { id: 'autoApprove', q: t('faq.autoApprove.q'), a: t('faq.autoApprove.a') },
    { id: 'chatOwner', q: t('faq.chatOwner.q'), a: t('faq.chatOwner.a') },
    { id: 'telegramPrivacy', q: t('faq.telegramPrivacy.q'), a: t('faq.telegramPrivacy.a') },
    { id: 'groupChats', q: t('faq.groupChats.q'), a: t('faq.groupChats.a') },
    { id: 'models', q: t('faq.models.q'), a: t('faq.models.a') },
  ];
  return {
    items,
    byId: {
      whatIsBot: items[0]!,
      defaultBot: items[1]!,
      linkKeys: items[2]!,
      corsLimits: items[3]!,
      autoApprove: items[4]!,
      chatOwner: items[5]!,
      telegramPrivacy: items[6]!,
      groupChats: items[7]!,
      models: items[8]!,
    },
  };
}
