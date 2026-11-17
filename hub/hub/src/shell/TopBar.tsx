// The top bar, left to right: the context switcher (realm | computer), the ⌘K
// search field, a spacer, Ask, the bell, the parts pages contribute, the account menu. Phone keeps the context chip, search
// and bell; navigation there is the bottom bar. The actions are one row of plates of one height with one gap between
// them: the bell and the icon-only Ask are framed kit icon buttons there, like their worded neighbours; on the phone,
// where nothing in the bar has a frame, the bell has none either.
import { useLayoutEffect, useRef } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { askOn, useAskDock } from '@kit/ask';
import { useAskActivityLabel, useAskWaiting } from '../ask';
import { Button, IconButton, cx } from '@kit/controls/Button';
import { Kbd } from '@kit/controls/Kbd';
import { Icon } from '@kit/icons';
import { useKeyshortcuts } from '@kit/keyshortcuts';
import { useMedia } from '@kit/media';
import { useGo } from '@kit/nav';
import { useStrings } from '@kit/strings';
import { askButtonName } from './askName';
import { countText, useShellData } from './context';
import { CountMark } from './CountMark';
import { followPageLink, usePageLink } from './pageLinks';
import { AccountMenu, ComputerSwitcher, PhoneContext, RealmSwitcher } from './Switchers';
import strings from './strings.en.json';
import s from './TopBar.module.css';
import { TopBarParts } from './TopBarParts';

export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export interface TopBarProps {
  onOpenPalette: () => void;
  onOpenShortcuts: () => void;
  className?: string;
  /** Under a phone's full-screen Ask sheet: out of the tab order and the accessibility tree. */
  inert?: boolean;
}

export function TopBar({ onOpenPalette, onOpenShortcuts, className, inert = false }: TopBarProps) {
  const t = useStrings(strings);
  const ask = useAskDock();
  const waiting = useAskWaiting();
  // How many conversations run now, from the agent's own state; shown while the panel is closed, never
  // when not known.
  const act = useAskActivityLabel();
  const running = !ask.isOpen && act.label ? act.activity?.running ?? 0 : 0;
  const askName = askButtonName({ ask: t('top.ask'), waiting: t('top.askWaiting') }, waiting, running ? act.label : '', !!act.activity?.waiting);
  const go = useGo();
  const data = useShellData();
  const unread = data.unread ?? 0;
  const inbox = usePageLink('notifications');
  const paletteKey = t(IS_MAC ? 'kbd.paletteMac' : 'kbd.paletteOther');
  const searchKeys = useKeyshortcuts<HTMLButtonElement>(IS_MAC ? 'Meta+K' : 'Control+K');
  // The width under which search and Ask are icons (TopBar.module.css takes the same number for the search field).
  const narrow = useMedia('(width < 1024px)');
  // The phone bar (TopBar.module.css takes the same number): no frames there, so the bell is the frameless icon button.
  const phone = useMedia('(width < 768px)');
  // Across that width the AI button is replaced by another element (worded button, icon button). The render that
  // crosses it still sees the old button in the DOM: if it had focus, the new one takes it once committed, so a
  // keyboard user resizing or zooming keeps their place.
  const askBox = useRef<HTMLSpanElement>(null);
  const shownNarrow = useRef(narrow);
  const askRefocus = useRef(false);
  if (shownNarrow.current !== narrow) askRefocus.current = !!askBox.current?.contains(document.activeElement);
  useLayoutEffect(() => {
    shownNarrow.current = narrow;
    if (!askRefocus.current) return;
    askRefocus.current = false;
    askBox.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [narrow]);
  return (
    <header className={cx(s.bar, className)} inert={inert}>
      <div className={s.context}>
        <RealmSwitcher />
        <ComputerSwitcher />
        <PhoneContext />
      </div>
      {/* Named by the words it shows, the key hint included (Label in Name), also below 1024 where only the icon shows.
          A space keeps the words apart in the text tools read (a flex box draws none). */}
      <AriaButton ref={searchKeys} className={s.search} onPress={onOpenPalette} aria-label={t('top.searchNamed', { key: paletteKey })}>
        <Icon name="search" size="sm" />
        <span className={s.searchText}>{t('top.search')}</span>{' '}
        <Kbd>{paletteKey}</Kbd>
      </AriaButton>
      <span className={s.spacer} />
      <div className={s.end}>
        {askOn() && (
          <span ref={askBox} className={s.ask}>
            {/* Below 1024 the bar has no room for the word: the kit's framed icon button, toggled while the dock is open. */}
            {narrow ? (
              <IconButton icon="sparkle" label={askName} variant="secondary" pressed={ask.isOpen} aria-keyshortcuts={IS_MAC ? 'Meta+J' : 'Control+J'} onPress={ask.toggle} />
            ) : (
              <Button variant="ghost" icon="sparkle" aria-label={askName} pressed={ask.isOpen} aria-keyshortcuts={IS_MAC ? 'Meta+J' : 'Control+J'} onPress={ask.toggle}>
                {t('top.ask')}
              </Button>
            )}
            {running > 0 ? <CountMark n={running} tone="accent" className={s.count} /> : waiting && <span className={s.askDot} aria-hidden="true" />}
          </span>
        )}
        {/* No bell where this load hides Notifications: there is no inbox to open. */}
        {inbox && (
          <span className={s.bell}>
            <IconButton icon="bell" label={unread > 0 ? t('top.notificationsCount', { count: countText(unread, data.unreadCapped) }) : t('top.notifications')} variant={phone ? 'ghost' : 'secondary'} onPress={() => followPageLink(inbox, go)} />
            {unread > 0 && <CountMark n={unread} capped={!!data.unreadCapped} tone="accent" className={s.bellCount} />}
          </span>
        )}
        <TopBarParts />
        <span className={s.account}>
          <AccountMenu onOpenShortcuts={onOpenShortcuts} />
        </span>
      </div>
    </header>
  );
}
