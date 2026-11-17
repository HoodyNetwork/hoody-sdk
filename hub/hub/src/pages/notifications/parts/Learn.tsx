// "Get notified": what you get notified about, where you see it, browser alerts and phones. A SettingsPage so
// the four sections share the section rail; #kinds / #where / #browser / #phone deep-link (the hints on other
// pages and the bell point here). The browser card owns the permission state machine.
import { SECTIONS, isSectionId } from '@core';
import { FaqLink, Icon, SettingGroup, SettingRow, SettingsPage, useLocationHash, useStrings, type FaqItem, type IconName, type Translate } from '@kit';
import { useEffect, useRef } from 'react';
import { useAccountId, useBrowserOverride, useUnreadCount } from '../data';
import { pageFaq } from '../faq';
import { GROUPS } from '../logic';
import strings from '../strings.en.json';
import { BrowserCard } from './BrowserCard';
import { landOnSection } from './landSection';
import { usePageViews } from './PageTabs';
import s from './Learn.module.css';

/** Each kind of notice as a row. A row list with literal keys, so the search index can read every label. */
const kindRows = (t: Translate<typeof strings>) => ({
  failed: { label: t('h.item.failed') },
  running: { label: t('h.item.running') },
  expired: { label: t('h.item.expired') },
  rental: { label: t('h.item.rental') },
  order: { label: t('h.item.order') },
  share: { label: t('h.item.share') },
  reminder: { label: t('h.item.reminder') },
  renewed: { label: t('h.item.renewed') },
  stopped: { label: t('h.item.stopped') },
  deleted: { label: t('h.item.deleted') },
  security: { label: t('h.item.security') },
  keys: { label: t('h.item.keys') },
  payment: { label: t('h.item.payment') },
  projects: { label: t('h.item.projects') },
  standing: { label: t('h.item.standing') },
  maintenance: { label: t('h.item.maintenance') },
  announce: { label: t('h.item.announce') },
});

/** One way a notice reaches you: its name, one line, and a link to the answer that explains it. */
function Way({ icon, title, line, item, more }: { icon: IconName; title: string; line: string; item: FaqItem; more: string }) {
  return (
    <div className={s.way}>
      <div className={s.wayTitle}>
        <Icon name={icon} size="sm" /> {title}
      </div>
      <p>{line}</p>
      <p className={s.help}>
        <FaqLink item={item}>{more}</FaqLink>
      </p>
    </div>
  );
}

export function Learn() {
  const t = useStrings(strings);
  const unread = useUnreadCount();
  // Inbox | Get notified: the layout's view switch, under the header (the Inbox draws the same tabs in its toolbar)
  const views = usePageViews('learn', unread);
  const account = useAccountId();
  const { loading, override } = useBrowserOverride();
  const { items, byId } = pageFaq(t);
  const kinds = kindRows(t);

  // The anchor this page was opened on ('/notifications/learn#kinds' gives 'kinds'), read once: the landing is on arrival.
  const anchor = useLocationHash();
  const arrivedOn = useRef(anchor);
  useEffect(() => {
    const id = arrivedOn.current;
    const section = SECTIONS.find((x) => id === x || id.endsWith(`#${x}`));
    if (!section || !isSectionId(section)) return;
    landOnSection(section);
  }, []);

  const sections = [
    {
      id: 'kinds',
      title: t('h.kinds.h'),
      description: t('h.kinds.lead'),
      content: (
        <>
          {/* One group per kind of notice: each row is the event and where it goes (the Hub, or the Hub and email). */}
          {GROUPS.map((g) => (
            <SettingGroup key={g.id} title={t(`h.group.${g.id}`)}>
              {g.items.map((item) => {
                const row = kinds[item];
                return (
                  <SettingRow key={item} label={row.label} data-kind-row={item}>
                    {t(g.mail.includes(item) ? 'h.goes.hubEmail' : 'h.goes.hub')}
                  </SettingRow>
                );
              })}
            </SettingGroup>
          ))}
          <p className={s.help}>
            <FaqLink item={byId.kinds}>{t('h.kinds.more')}</FaqLink>
          </p>
        </>
      ),
    },
    {
      id: 'where',
      title: t('h.where.h'),
      content: (
        <>
          <div className={s.ways}>
            <Way icon="bell" title={t('h.where.bell.h')} line={t('h.where.bell.short')} item={byId.bellInbox} more={t('h.where.bell.more')} />
            <Way icon="board" title={t('h.where.inbox.h')} line={t('h.where.inbox.short')} item={byId.bellInbox} more={t('h.where.inbox.more')} />
            <Way icon="browser" title={t('h.where.browser.h')} line={t('h.where.browser.short')} item={byId.browser} more={t('h.where.browser.more')} />
            <Way icon="mail" title={t('h.where.email.h')} line={t('h.where.email.short')} item={byId.email} more={t('h.where.email.more')} />
          </div>
        </>
      ),
    },
    {
      id: 'browser',
      title: t('h.browser.h'),
      description: t('h.browser.what'),
      // The choice is the shown account's (keyed by its uid): no card until that account is known, and a new
      // card (fresh state) for another one.
      content:
        loading || !account.data ? null : (
          <BrowserCard key={`${account.data.id}:${override ? JSON.stringify(override) : 'real'}`} uid={account.data.id} override={override} />
        ),
    },
    {
      id: 'phone',
      title: t('h.phone.h'),
      content: (
        <div className={s.prose}>
          <p>{t('h.phone.open')}</p>
          <p>{t('h.phone.alerts')}</p>
          <p className={s.help}>
            <FaqLink item={byId.iphone}>{t('h.phone.ios.h')}</FaqLink> · <FaqLink item={byId.android}>{t('h.phone.android.h')}</FaqLink>
          </p>
        </div>
      ),
    },
  ];

  return (
    <SettingsPage header={{ title: t('title'), subtitle: t('lead'), tabsFollow: true }} views={views} sections={sections} faq={{ items }} />
  );
}
