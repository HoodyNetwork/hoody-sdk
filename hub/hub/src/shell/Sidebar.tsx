// The left sidebar: brand cell, nav items grouped from page manifests (main has no
// label; "On <computer>" and "Account" are labelled), "Rent servers" and Help pinned at the bottom. Collapse is a small
// button on the sidebar's edge just under the brand (no whole row for it); the edge is also the resize handle the
// shell passes in. Rail mode shows icons with tooltips; on phones the sidebar is the "More" drawer.
// "Rent servers" opens the Market page's rent view, its default Listings tab, inside the Hub (market is
// 'ready'; a build that hides it shows no entry). A soft accent tint marks it, nothing moving.
import { Button as AriaButton, Link as AriaLink } from 'react-aria-components';
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { IconButton, cx } from '@kit/controls/Button';
import { SR_ONLY } from '@kit/controls/SrOnly';
import { BrandMark } from '@kit/data/BrandMark';
import { Icon } from '@kit/icons';
import { Tooltip } from '@kit/overlays/Popover';
import { useKeyshortcuts } from '@kit/keyshortcuts';
import { usePathname } from '@kit/nav';
import type { NavGroup, PageManifest } from '@kit/page';
import { makeT, useStrings } from '@kit/strings';
import { useAskWaiting } from '../ask';
import { countText, initials, useShellData } from './context';
import { CountMark } from './CountMark';
import { navEntries } from './nav';
import { NavCountProbe } from './navCount';
import { usePageLink } from './pageLinks';
import { preloadPage } from './preload';
import strings from './strings.en.json';
import { openComputerSwitcher, useComputerSwitcherReady } from './Switchers';
import s from './Sidebar.module.css';

const GROUPS: readonly NavGroup[] = ['main', 'build', 'account'];

export interface SidebarProps {
  pages: readonly PageManifest[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate: () => void;
  /** The phone drawer (always full width, account item at the bottom). */
  drawer?: boolean;
  /** The resize handle on the sidebar's end edge (the shell's PaneSeparator); none in the drawer. */
  handle?: ReactNode;
  className?: string;
}

function isCurrent(path: string, page: PageManifest): boolean {
  return path === page.path || path.startsWith(`${page.path}/`) || (page.path === '/' && path === '');
}

/** A count beside an item: accent for "needs you", neutral for unread and for a page's own count. */
export interface NavBadge {
  count: number;
  tone: 'needs' | 'unread' | 'count';
  text: string;
  /** The count is a lower bound: the mark shows "N+". */
  capped?: boolean;
  /** Accessible name of the item with its count, e.g. "Bots, 2 waiting for you". */
  label: string;
  /** Shown on hover and focus (a page's own count: "3 programs on this Board"). */
  tip?: string;
  /** A dot with no number (the AI entry while a dock conversation waits: how many is not known to the shell). */
  dot?: boolean;
}

/** The rent entry: a real link, tinted, icon + tooltip on the rail. */
function RentItem({ href, label, rail, onNavigate }: { href: string; label: string; rail: boolean; onNavigate: () => void }) {
  const link = (
    <AriaLink href={href} className={cx(s.item, s.rent)} aria-label={rail ? label : undefined} onPress={onNavigate}>
      <span className={s.itemIconWrap}>
        <Icon name="server" />
      </span>
      <span className={s.itemLabel}>{label}</span>
    </AriaLink>
  );
  if (!rail) return link;
  return (
    <Tooltip content={label} placement="end">
      {link}
    </Tooltip>
  );
}

// Memo, given whether it is current rather than the path: a page switch re-renders only the two items it changes.
const NavItem = memo(function NavItem({ page, current, rail, badge, onNavigate }: { page: PageManifest; current: boolean; rail: boolean; badge?: NavBadge; onNavigate: () => void }) {
  const pt = makeT(page.strings);
  const label = pt(page.nav?.label ?? page.title);
  const link = (
    <AriaLink
      href={page.path}
      className={cx(s.item, current && s.current)}
      aria-current={current ? 'page' : undefined}
      aria-label={badge ? badge.label : rail ? label : undefined}
      onPress={onNavigate}
      // The page's view loads while the pointer rests on its link, the link has focus, or a press starts.
      onHoverStart={() => preloadPage(page)}
      onFocus={() => preloadPage(page)}
      onPressStart={() => preloadPage(page)}
    >
      <span className={s.itemIconWrap}>
        <Icon name={page.nav?.icon ?? 'apps'} />
        {/* A page's own count is not an alert: the rail shows it in the tooltip, never as a dot. */}
        {badge && badge.tone !== 'count' && <span className={cx(s.railDot, badge.tone === 'needs' && s.needs, badge.dot && s.dotAlways)} aria-hidden="true" />}
      </span>
      <span className={s.itemLabel}>{label}</span>
      {/* The name starts with the words the item shows, its count included (Label in Name): a space keeps the label
          and the count apart in the text tools read (a flex box draws none). */}
      {badge && !badge.dot && ' '}
      {badge && !badge.dot && (
        <CountMark n={badge.count} capped={badge.capped} tone={badge.tone === 'needs' ? 'accent' : 'neutral'} className={s.count} />
      )}
    </AriaLink>
  );
  const tip = badge?.tip;
  // A counted item keeps its tooltip wrapper while its count comes and goes, so the link is never remounted (focus stays).
  // On the rail the tip is the name, then the count sentence on its own line; in the open sidebar the count sentence.
  if (!rail && !tip && !page.navCount) return link;
  return (
    <Tooltip content={rail ? label : (tip ?? '')} lines={rail && tip ? [tip] : undefined} placement="end" isDisabled={!rail && !tip}>
      {link}
    </Tooltip>
  );
});

type NavItemProps = Parameters<typeof NavItem>[0];

/**
 * An item whose page counts something (its manifest's navCount): the page's reader gives the total, shown as a
 * neutral count when known and above 0 (hidden at 0 and while unknown), named in the item's accessible name and in its
 * hover and focus tip. A badge the shell sets itself wins.
 */
function CountedNavItem({ page, badge, ...rest }: NavItemProps) {
  const [total, setTotal] = useState<number | null>(null);
  const counted = useMemo<NavBadge | undefined>(() => {
    const nc = page.navCount;
    if (!nc || total === null) return undefined;
    const pt = makeT(page.strings);
    const name = pt(page.nav?.label ?? page.title);
    return { count: total, text: countText(total), tone: 'count', label: pt(nc.label, { name, count: total }), tip: pt(nc.tip, { count: total }) };
  }, [page, total]);
  return (
    <>
      <NavItem page={page} badge={badge ?? counted} {...rest} />
      <NavCountProbe page={page} onTotal={setTotal} />
    </>
  );
}

/** A menu item, counted when its page has a navCount, in every group. */
function MenuItem(props: NavItemProps) {
  return props.page.navCount ? <CountedNavItem {...props} /> : <NavItem {...props} />;
}

export function Sidebar({ pages, collapsed, onToggleCollapsed, onNavigate, drawer, handle, className }: SidebarProps) {
  const t = useStrings(strings);
  const path = usePathname();
  const data = useShellData();
  const rail = collapsed && !drawer;
  const collapseKeys = useKeyshortcuts<HTMLButtonElement>('[');
  // The page groups scroll above the fixed foot on a short window: the current page's row is kept
  // in view there, scrolling the groups alone and only as far as needed, on arrival, when the form (rail) changes and
  // when the groups' box or a group in it changes size (the window's height also sets the row height, "Fluid
  // fit"; a group grows when a row or the "On <computer>" switch arrives after the first paint).
  const groupsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const groups = groupsRef.current;
    if (!groups) return;
    const keep = () => {
      const row = groups.querySelector('[aria-current="page"]')?.closest('li');
      if (!row) return;
      const box = row.getBoundingClientRect();
      const view = groups.getBoundingClientRect();
      if (box.top < view.top) groups.scrollTop -= view.top - box.top;
      else if (box.bottom > view.bottom) groups.scrollTop += Math.min(box.bottom - view.bottom, box.top - view.top);
    };
    keep();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(keep);
    ro.observe(groups);
    for (const g of groups.children) ro.observe(g);
    return () => ro.disconnect();
  }, [path, rail]);
  const entries = navEntries(pages);
  const inGroup = (g: NavGroup) => entries.filter((e) => e.group === g).map((e) => e.page);
  const askWaiting = useAskWaiting();
  const badgeOf = (p: PageManifest): NavBadge | undefined => {
    const waiting = data.botsWaiting ?? 0;
    const unread = data.unread ?? 0;
    const name = makeT(p.strings)(p.nav?.label ?? p.title);
    if (p.id === 'bots' && waiting > 0) {
      const atLeast = !!data.botsWaitingAtLeast;
      const text = countText(waiting, atLeast);
      return { count: waiting, text, capped: atLeast, tone: 'needs', label: atLeast ? t('nav.badge.waitingAtLeast', { name, shown: text, count: Math.min(waiting, 99) }) : t('nav.badge.waiting', { name, count: text }) };
    }
    // No gates count reaches the shell (the AI tab reads its own), so the AI entry shows the dock's waiting dot.
    if (p.id === 'ai' && askWaiting) return { count: 0, text: '', tone: 'needs', dot: true, label: t('nav.badge.aiWaiting', { name }) };
    if (p.id === 'notifications' && unread > 0) {
      const text = countText(unread, data.unreadCapped);
      return { count: unread, text, capped: !!data.unreadCapped, tone: 'unread', label: t('nav.badge.unread', { name, count: text }) };
    }
    return undefined;
  };
  const computer = data.computers.find((c) => c.id === data.computerId);
  const groupLabel = (g: NavGroup): string | undefined =>
    g === 'main' ? undefined : g === 'build' ? (computer ? t('nav.group.buildOn', { name: computer.name }) : t('nav.group.buildNone')) : t('nav.group.account');
  // "On <computer>" opens the top bar's computer switcher (no second picker), once one is mounted
  // and there is a computer to choose; otherwise it stays plain text. In the phone drawer the drawer closes first so
  // the sheet's switcher it opens is on top.
  const switcherReady = useComputerSwitcherReady();
  const canSwitch = switcherReady && data.computers.length > 0;
  const openSwitcher = () => {
    if (!drawer) return openComputerSwitcher();
    onNavigate();
    requestAnimationFrame(() => openComputerSwitcher());
  };
  const help = inGroup('help');
  const initial = initials(data.account?.name);
  // Account settings inside the Hub when served; no entry when hidden.
  const accountLink = usePageLink('account');
  const rentLink = usePageLink('market');
  // "Fluid fit": the rows share the window's height, so the row height divides by the rows drawn here
  // (the page groups, Rent servers, Help and, in the drawer, the account row), never a fixed count
  // (Sidebar.module.css --nav-item-h). Collapse has no row of its own.
  const footLast = drawer ? !!(data.account && accountLink) : false;
  const rows = GROUPS.reduce((n, g) => n + inGroup(g).length, 0) + (rentLink ? 1 : 0) + help.length + (footLast ? 1 : 0);
  return (
    <nav className={cx(s.sidebar, rail && s.rail, drawer && s.drawer, className)} style={{ '--nav-rows': rows } as CSSProperties} aria-label={t('nav.label')}>
      {/* First, so the foot stays the nav's last block (the lines and fluid fit read it there). */}
      {!drawer && handle}
      <div className={s.brand}>
        {/* The kit's brand. The rail keeps the mark alone; `.logo` is the hook a touch screen's rail hides it by. */}
        <BrandMark words={!rail} className={s.logo} />
        {!drawer && (
          // The wrapper places the button on the edge and shows it on hover or focus; the button itself is the kit's. The
          // chevron points toward the edge the sidebar folds to: the start edge, which is the right in a right-to-left page.
          <span className={s.collapse}>
            <IconButton ref={collapseKeys} icon={rail === (document.documentElement.dir === 'rtl') ? 'chevron-left' : 'chevron-right'} label={rail ? t('nav.expand') : t('nav.collapse')} size="xs" variant="secondary" tooltipPlacement="end" onPress={onToggleCollapsed} />
          </span>
        )}
      </div>
      <div ref={groupsRef} className={s.groups}>
        {GROUPS.map((g) => {
          const group = inGroup(g);
          if (group.length === 0) return null;
          const label = groupLabel(g);
          return (
            <div key={g} className={cx(s.group, g === 'account' && s.account)} role="group" aria-label={label}>
              {label && g === 'build' && canSwitch ? (
                <AriaButton className={cx(s.groupLabel, s.groupSwitch)} onPress={openSwitcher}>
                  <span className={s.groupSwitchText}>{label}</span>
                  <span className={SR_ONLY}>{t('keys.computer')}</span>
                  <Icon name="chevron-down" size="sm" className={s.groupSwitchIcon} />
                </AriaButton>
              ) : (
                label && (
                  <div className={s.groupLabel} aria-hidden="true">
                    {label}
                  </div>
                )
              )}
              <ul className={s.list}>
                {group.map((p) => (
                  <li key={p.id}>
                    <MenuItem page={p} current={isCurrent(path, p)} rail={rail} badge={badgeOf(p)} onNavigate={onNavigate} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <div className={s.foot}>
        <ul className={s.list}>
          {rentLink && (
            <li className={s.rentRow}>
              <RentItem href={rentLink.href} label={t('nav.rent')} rail={rail} onNavigate={onNavigate} />
            </li>
          )}
          {help.map((p) => (
            <li key={p.id}>
              <MenuItem page={p} current={isCurrent(path, p)} rail={rail} badge={badgeOf(p)} onNavigate={onNavigate} />
            </li>
          ))}
          {drawer && data.account && accountLink && (
            <li>
              <AriaLink href={accountLink.href} className={s.item} onPress={onNavigate}>
                <span className={s.avatar} aria-hidden="true">
                  {initial}
                </span>
                <span className={s.itemLabel}>{data.account.name}</span>
              </AriaLink>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
}
