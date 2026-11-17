// The phone bottom tab bar: Home, AI, Computers, Bots, More. 56 px plus the safe area. The page tabs
// come from the shell's table, shown only for pages this build serves (a hidden page never gets a tab); the manifest
// supplies the label. Bots carries the "needs you" count (an accent badge, as in the sidebar; the current tab itself is
// ink only). The AI tab stands where an Ask tab would: it goes to the AI tab and carries what Ask showed, the dock's running count
// or its waiting dot; on phones the dock opens from a page's own Ask entries (the top bar hides its button). More opens
// the sidebar drawer.
import { Button as AriaButton, Link as AriaLink } from 'react-aria-components';
import { useAskDock } from '@kit/ask';
import { useAskActivityLabel, useAskWaiting } from '../ask';
import { cx } from '@kit/controls/Button';
import { Icon, type IconName } from '@kit/icons';
import { usePathname } from '@kit/nav';
import type { PageManifest } from '@kit/page';
import { makeT, useStrings } from '@kit/strings';
import { askButtonName } from './askName';
import { countText, useShellData } from './context';
import { CountMark } from './CountMark';
import { preloadPage } from './preload';
import strings from './strings.en.json';
import s from './BottomNav.module.css';

type Label = 'bottom.home' | 'bottom.computers' | 'bottom.bots';

// The AI tab has no label key: its text is the AI page's manifest title, as every tab's is, and its name is askButtonName's.
export const BOTTOM_TABS: readonly { id: string; path: `/${string}`; icon: IconName; label?: Label }[] = [
  { id: 'home', path: '/home', icon: 'hoody-overview', label: 'bottom.home' },
  { id: 'ai', path: '/ai', icon: 'hoody-ai' },
  { id: 'computers', path: '/computers', icon: 'hoody-virtual-server', label: 'bottom.computers' },
  { id: 'bots', path: '/bots', icon: 'hoody-bots', label: 'bottom.bots' },
];

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`) || (base === '/home' && (path === '/' || path === ''));

/** `inert`: behind the open phone More drawer (its scrim covers the bar): out of Tab order and of the accessibility tree. */
export function BottomNav({ pages, onMore, moreOpen, className, inert = false }: { pages: readonly PageManifest[]; onMore: () => void; moreOpen: boolean; className?: string; inert?: boolean }) {
  const t = useStrings(strings);
  const path = usePathname();
  const ask = useAskDock();
  const askWaiting = useAskWaiting();
  const act = useAskActivityLabel();
  const askRunning = !ask.isOpen && act.label ? act.activity?.running ?? 0 : 0;
  // As the top bar's (askButtonName): the waiting words name the AI tab themselves ("AI, waiting for you").
  const askName = askButtonName({ ask: t('top.ask'), waiting: t('top.askWaiting') }, askWaiting, askRunning ? act.label : '', !!act.activity?.waiting);
  const { botsWaiting, botsWaitingAtLeast } = useShellData();
  const waiting = botsWaiting ?? 0;
  const atLeast = !!botsWaitingAtLeast;
  const tabs = BOTTOM_TABS.flatMap((tab) => {
    const p = pages.find((x) => x.id === tab.id);
    return p ? [{ ...tab, page: p, path: p.path, text: makeT(p.strings)(p.nav?.label ?? p.title) }] : [];
  });
  const onTab = tabs.some((tab) => under(path, tab.path));
  return (
    <nav className={cx(s.bar, className)} aria-label={t('bottom.label')} hidden={ask.isOpen} inert={inert}>
      {tabs.map((tab) => {
        const current = !ask.isOpen && !moreOpen && under(path, tab.path);
        const needs = tab.id === 'bots' && waiting > 0;
        const count = countText(waiting, atLeast);
        // The AI tab: the dock's running count, else its waiting dot (what the Ask tab showed).
        const ai = tab.id === 'ai';
        const aiRunning = ai ? askRunning : 0;
        const aiWaiting = ai && !aiRunning && askWaiting;
        return (
          <AriaLink
            key={tab.id}
            href={tab.path}
            className={cx(s.tab, current && s.current)}
            aria-current={current ? 'page' : undefined}
            // WCAG 2.5.3: the name starts with the words drawn, in their order (the count badge, then the label), as
            // the sidebar's badged links do; the badge is aria-hidden, so the name carries it.
            aria-label={
              needs
                ? atLeast
                  ? t('bottom.botsWaitingAtLeast', { shown: count, name: tab.text, count: Math.min(waiting, 99) })
                  : t('bottom.botsWaiting', { count, name: tab.text })
                : aiRunning
                  ? t('bottom.aiRunning', { count: countText(aiRunning), name: askName })
                  : aiWaiting
                    ? askName
                    : undefined
            }
            onPress={ask.close}
            // A tap loads the page's view from the moment the finger goes down.
            onPressStart={() => preloadPage(tab.page)}
          >
            <span className={s.icon}>
              <Icon name={tab.icon} />
              {needs && <CountMark n={waiting} capped={atLeast} tone="accent" className={s.count} />}
              {aiRunning > 0 && <CountMark n={aiRunning} tone="accent" className={s.count} />}
              {aiWaiting && <span className={s.dot} aria-hidden="true" />}
            </span>
            {/* reason: a space between the badge and the label, so the text tools read is "2 Bots", not "2Bots" */}
            {(needs || aiRunning > 0) && ' '}
            <span className={s.label}>{tab.text}</span>
          </AriaLink>
        );
      })}
      <AriaButton className={cx(s.tab, (moreOpen || (!onTab && !ask.isOpen)) && s.current)} aria-expanded={moreOpen} onPress={onMore}>
        <span className={s.icon}>
          <Icon name="menu" />
        </span>
        <span className={s.label}>{t('bottom.more')}</span>
      </AriaButton>
    </nav>
  );
}
