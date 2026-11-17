// The views of the page: Inbox (/notifications), Notices (/notifications/notices) and Get notified
// (/notifications/learn). The Inbox and Notices draw them as route tabs in their list toolbar (links, so Back walks between them and either is a deep link); Get notified passes
// them as its SettingsPage's view switch (usePageViews), which goes to the other route.
import { Tabs, countText, useGo, useShellData, useStrings, type PageViews } from '@kit';
import { links } from '../links';
import strings from '../strings.en.json';

export type TabId = 'inbox' | 'notices' | 'learn';

/** The view switch of a page that draws them through its layout (`views`): the same label, items and badge as PageTabs. */
export function usePageViews(current: TabId, unread: number | undefined): PageViews<TabId> {
  const t = useStrings(strings);
  const capped = useShellData().unreadCapped ?? false;
  const go = useGo();
  return {
    label: t('h.tabs.label'),
    value: current,
    onChange: (id) => go(id === 'inbox' ? links.inbox : id === 'notices' ? links.notices : links.learn),
    items: [
      { id: 'inbox', label: t('h.tab.inbox'), badge: unread && unread > 0 ? countText(unread, capped) : undefined },
      { id: 'notices', label: t('h.tab.notices') },
      { id: 'learn', label: t('h.tab.learn') },
    ],
  };
}

export function PageTabs({ current, unread }: { current: TabId; unread: number | undefined }) {
  const t = useStrings(strings);
  // The page reads the exact total; the shell's summary says when the server capped it (same text as the bell).
  const capped = useShellData().unreadCapped ?? false;
  return (
    <Tabs
      label={t('h.tabs.label')}
      value={current}
      items={[
        { id: 'inbox', label: t('h.tab.inbox'), href: links.inbox, badge: unread && unread > 0 ? countText(unread, capped) : undefined },
        { id: 'notices', label: t('h.tab.notices'), href: links.notices },
        { id: 'learn', label: t('h.tab.learn'), href: links.learn },
      ]}
    />
  );
}
