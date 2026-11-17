// The left rail that owns its screen edge to edge (the AI tab), on the one rail grid (kit/tokens.css --rail-*). Nothing here
// pads the whole: each part keeps to the grid, so the head, the nav, a list's rows and the foot share one lead column and one
// text edge. RailFrame sets the width both hosts read: its own grid, and SplitLayout when a conversation's frame places the
// rail itself. The handle lies over the rail's end edge, so it needs no grid column in either.
import type { ComponentPropsWithRef, MouseEvent, ReactNode } from 'react';
import { Link } from '../controls/Link';
import { cx } from '../controls/Button';
import { StripMore, useStripEdges } from '../controls/Tabs';
import { Icon, type IconName } from '../icons';
import { useGo } from '../nav';
import { EmptyRail } from '../states/emptyScope';
import { ListPaneContext, type ListPane } from './pane';
import { SectionMenuItem, SectionMenuList } from './SectionMenu';
import s from './RailPane.module.css';

const RAIL_LIST: ListPane = { presentation: 'list', rail: true, flush: true };

export interface RailFrameProps extends Omit<ComponentPropsWithRef<'div'>, 'className' | 'style'> {
  /** The rail's drawn width, px. */
  width: number;
  /** The page region's height, px, so the sticky rail is exactly as tall as what shows; null before it is measured. */
  regionHeight: number | null;
  /** One slot, no rail column: a conversation's frame places the rail itself, or the rail and the page take turns. */
  single?: boolean;
}

export function RailFrame({ width, regionHeight, single, children, ...rest }: RailFrameProps) {
  const style = { '--rail-width': `${width}px`, ...(regionHeight ? { '--rail-region-h': `${regionHeight}px` } : {}) } as React.CSSProperties;
  return (
    <div {...rest} className={s.frame} data-rail-single={single ? '' : undefined} style={style}>
      {children}
    </div>
  );
}

export interface RailPaneProps {
  label: string;
  /** The page's one primary action, above the nav. */
  head?: ReactNode;
  /** A RailNav. */
  nav?: ReactNode;
  /** The list or the strip; it takes the height left and scrolls itself. */
  children?: ReactNode;
  /** A RailFoot. */
  foot?: ReactNode;
  /** A PaneSeparator, when the rail sits beside the page. */
  handle?: ReactNode;
  /** The rail is the whole screen: its nav goes two across in two rows and its foot stays above the bottom bar. */
  strip?: boolean;
}

export function RailPane({ label, head, nav, children, foot, handle, strip }: RailPaneProps) {
  return (
    <nav className={cx(s.rail, strip && s.strip)} aria-label={label}>
      {head && <div className={s.head}>{head}</div>}
      {nav}
      <div className={s.body}>
        <ListPaneContext.Provider value={RAIL_LIST}>
          <EmptyRail>{children}</EmptyRail>
        </ListPaneContext.Provider>
      </div>
      {foot}
      {handle && <div className={s.handle}>{handle}</div>}
    </nav>
  );
}

export interface RailNavItem {
  id: string;
  href: string;
  icon: IconName;
  label: string;
  current?: boolean;
  /** The needs-you mark at the end edge. */
  mark?: boolean;
  /** Drawn under the row: its RailSubnav. */
  below?: ReactNode;
}

/** The destinations: one row each, icon in the lead column, label on the text edge. */
export function RailNav({ label, items }: { label: string; items: readonly RailNavItem[] }) {
  return (
    <ul className={s.navList} aria-label={label}>
      {items.map((d) => (
        <li key={d.id}>
          <Link href={d.href} variant="plain" className={s.navItem} {...(d.current ? { 'aria-current': 'page' as const } : {})}>
            <Icon name={d.icon} size="sm" />
            <span className={s.navLabel}>{d.label}</span>
            {d.mark && <span className={s.navMark} aria-hidden="true" />}
          </Link>
          {d.below}
        </li>
      ))}
    </ul>
  );
}

export interface RailSubnavItem {
  id: string;
  href: string;
  label: string;
  current?: boolean;
}

/** A destination's own screens, the kit's section menu: nested under its row, its text on the rail's text edge. `strip`: the
 *  same links across, above the screen, where the rail is not beside it. Wider than the screen, the strip scrolls sideways
 *  inside itself with the kit's edge chevrons and fades (useStripEdges, as the settings strip), so the page never does. */
export function RailSubnav({ label, items, strip }: { label: string; items: readonly RailSubnavItem[]; strip?: boolean }) {
  // Two components, so a change of `strip` remounts the strip and its edge watch starts on the element it reads.
  return strip ? <SubnavStrip label={label} items={items} /> : (
    <div className={s.sub}>
      <SectionMenuList role="list" /* reason: the links stay a named list for a screen reader; the kit's column is a plain div */ aria-label={label}>
        <SubnavItems items={items} />
      </SectionMenuList>
    </div>
  );
}

function SubnavStrip({ label, items }: { label: string; items: readonly RailSubnavItem[] }) {
  const edges = useStripEdges<HTMLDivElement>(items.find((k) => k.current)?.id, '[aria-current]');
  return (
    <div className={s.subStrip}>
      <StripMore side="start" edges={edges.edges} scroller={edges.ref} />
      <SectionMenuList
        role="list" /* reason: the links stay a named list for a screen reader; the kit's column is a plain div */
        aria-label={label}
        className={cx(s.subStripList, edges.fadeClassName)}
        ref={edges.ref}
      >
        <SubnavItems items={items} />
      </SectionMenuList>
      <StripMore side="end" edges={edges.edges} scroller={edges.ref} />
    </div>
  );
}

function SubnavItems({ items }: { items: readonly RailSubnavItem[] }) {
  const go = useGo();
  return items.map((k) => (
    <div key={k.id} role="listitem" /* reason: the list's own items, around the kit's links */>
      <SectionMenuItem
        href={`#${k.href}`}
        current={k.current === true}
        {...(k.current ? { 'aria-current': 'page' as const } : {})}
        onClick={(e: MouseEvent<HTMLAnchorElement>) => {
          // A new tab, copy-link or modified click keeps the real URL.
          if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          go(k.href);
        }}
      >
        {k.label}
      </SectionMenuItem>
    </div>
  ));
}

export interface RailFootProps {
  icon: IconName;
  title: string;
  /** The line under the title; nothing is drawn when empty. */
  note?: string;
  /** Row 2, under where: a notice with its own action (PauseControl `rail`). The row takes no room while it draws nothing. */
  action?: ReactNode;
  /** Row 1's end edge, beside the title: the pane's one menu (an icon button). */
  end?: ReactNode;
  /** Under the rows. */
  children?: ReactNode;
}

/** The foot: on the grid, as many rows as it needs. Row 1 says where, with the pane's menu at its end edge; row 2 is a notice. */
export function RailFoot({ icon, title, note, action, end, children }: RailFootProps) {
  return (
    <div className={s.foot}>
      <div className={s.where}>
        <Icon name={icon} size="sm" />
        <span className={s.whereText}>
          <strong>{title}</strong>
          {note ? <span>{note}</span> : null}
        </span>
        {end ? <span className={s.whereEnd}>{end}</span> : null}
      </div>
      {action ? <div className={s.footActions}>{action}</div> : null}
      {children}
    </div>
  );
}
