// The header every layout starts with: a breadcrumb row, the title row (title, status, a subtitle of up to two lines, a
// context line) and the actions on the end side, primary last. The page's primary action goes in `primary`: on
// phone-width content (< 600) it leaves the header and becomes the floating action button above the bottom bar, and the
// breadcrumbs fold to "‹ Parent". Also here: Toolbar, the row of controls above content. An archetype draws the header
// from its `header` prop; a page calls PageHeader itself only under a PageFrame.
import { type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Breadcrumb, Breadcrumbs as AriaBreadcrumbs, Link as AriaLink } from 'react-aria-components';
import { Button, cx } from '../controls/Button';
import { chipGlyph } from '../controls/chipGlyph';
import { Icon, type IconName, type PxIconName } from '../icons';
import { useAskDock } from '../ask';
import { rowContentSig, titledRowNeed, useMedia, useRowFit } from '../media';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import { Tooltip } from '../overlays/Popover';
import { InClampedSubtitle } from './subtitleScope';
import s from './PageHeader.module.css';

export interface Crumb {
  label: string;
  /** Hash path; the last crumb (current page) has none. */
  href?: string;
  /** The accessible name when the label alone does not say where it goes (a folded "…"). */
  name?: string;
}

export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  const t = useStrings(kitStrings);
  const parent = [...items.slice(0, -1)].reverse().find((c) => c.href);
  return (
    <>
      <AriaBreadcrumbs className={s.crumbs} aria-label={t('breadcrumbs')}>
        {items.map((c, i) => (
          <Breadcrumb key={`${i}-${c.label}`} className={s.crumb}>
            <AriaLink href={c.href} className={s.crumbLink} aria-label={c.name}>
              {c.label}
            </AriaLink>
            {i < items.length - 1 && (
              <Icon name="chevron-right" size="sm" className={s.crumbSep} />
            )}
          </Breadcrumb>
        ))}
      </AriaBreadcrumbs>
      {parent && (
        <AriaLink href={parent.href} className={s.crumbBack}>
          <Icon name="chevron-left" size="sm" />
          {parent.label}
        </AriaLink>
      )}
    </>
  );
}

export interface PrimaryAction {
  label: string;
  icon?: IconName;
  /** The button's end glyph when the label's own is wrong for it ("Add funds" shows the dollar). Without it the Button
   * picks: the plus for a "New …" label, else the arrow; the floating button picks the same way. */
  glyph?: PxIconName;
  onPress: () => void;
  isDisabled?: boolean;
  /** Why it is off, while `isDisabled`: the button stays focusable and says so (Button's `disabledReason`). */
  disabledReason?: string;
  busy?: boolean;
}

export interface PageHeaderProps {
  title: ReactNode;
  /** Text of up to two lines; a longer one is clamped, which clips anything grown past its line box, so it holds no
   * ContextLine (a dev build throws when it does). */
  subtitle?: ReactNode;
  /** A kit ContextLine (and any control beside it): its own row under the subtitle, never clamped, so the grown tap
   * targets of its links are hit where they are drawn. */
  context?: ReactNode;
  /** Status pills or chips next to the title. */
  meta?: ReactNode;
  breadcrumbs?: readonly Crumb[];
  /** Secondary controls on the end side, rendered as given: the page keeps them few and puts the
   * rest in its own ⋯ ActionMenu (the header does not collapse them). When they leave the title too
   * little room, they move to a line of their own under it (see PageHeader). */
  actions?: ReactNode;
  /** The page's ⋯ control (an icon-only ActionMenu): last in the header on a one-line row. When the row wraps (stacked,
   * or under 600 px) it stays on the title row at the inline end, before the actions in focus order, and the actions
   * take the line below: it never takes a line of its own. */
  menu?: ReactNode;
  /** The page's one primary action: last in the header, the floating button on phone width. */
  primary?: PrimaryAction;
  /** A leading element: an avatar or an icon tile. */
  leading?: ReactNode;
  /** 'lg' = the dashboard greeting (28 px); 'sm' = compact 56 px header (ListDetail with a selection). */
  size?: 'lg' | 'md' | 'sm';
  /** A tab strip is drawn directly under this header: the strip's line closes the
   * header, so the header draws no line of its own. DetailPage and ListDetailPage set it for their own `views` and
   * `tabs`; a page that draws a strip itself says so here. */
  tabsFollow?: boolean;
  /** Set false where the primary must not float (a detail pane is open). */
  primaryAsFab?: boolean;
  /** One accent per screen: set by the page (ListDetailPage forwards `header.primaryQuiet`) when the
   * detail's own primary is the accent, so the page's turns secondary. It styles the header button only; the Fab ignores it. */
  primaryQuiet?: boolean;
  className?: string;
}

const XS = 600;

/** Below this many px a page title is squeezed: the header stacks instead (title on its own line, actions under it). */
const PAGE_TITLE_FLOOR = 240;
const pageRowNeed = titledRowNeed(PAGE_TITLE_FLOOR);

/** True while the element is narrower than the XS content class. */
function useNarrow<E extends HTMLElement>(): [RefObject<E | null>, boolean] {
  const ref = useRef<E>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => entry && setNarrow(entry.contentRect.width < XS));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, narrow];
}

/** The ⋯ slot changes place when the row wraps (a new element in the other position): a focus held inside the old slot
 *  moves to the new slot's first control, never to the page body. The old slot is still in the document when its ref
 *  is cleared, so the check reads where focus is before it goes. An open ⋯ menu closes at that change, and its focus is not
 *  carried; a closed one keeps focus. */
function useCarriedFocus(): (el: HTMLDivElement | null) => void {
  const node = useRef<HTMLDivElement | null>(null);
  const carry = useRef(false);
  return useCallback((el: HTMLDivElement | null) => {
    if (el === null) {
      carry.current = Boolean(node.current?.contains(document.activeElement));
      // Only the slot mounted in the same commit takes it: a ⋯ that leaves the header and comes back later does not.
      queueMicrotask(() => { carry.current = false; });
    } else if (carry.current) {
      carry.current = false;
      el.querySelector<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')?.focus({ preventScroll: true });
    }
    node.current = el;
  }, []);
}

export function PageHeader({
  title,
  subtitle,
  context,
  meta,
  breadcrumbs,
  actions,
  menu,
  primary,
  leading,
  size = 'md',
  primaryAsFab = true,
  primaryQuiet = false,
  tabsFollow = false,
  className,
}: PageHeaderProps) {
  const [ref, narrow] = useNarrow<HTMLElement>();
  const fab = primary !== undefined && narrow && primaryAsFab;
  // The title row fits its own width: when the actions leave the title less than PAGE_TITLE_FLOOR (or the
  // row overflows), the title takes the whole line and wraps, and the actions take the line below.
  const rowRef = useRef<HTMLDivElement>(null);
  const stacked = useRowFit(rowRef, 1, typeof title === 'string' ? title : '', true, pageRowNeed, rowContentSig) === 1;
  // The ⋯: last on a one-line row; on a wrapped row (stacked, or under 600 px) it keeps the title row and the actions go
  // below, so it comes before them in the DOM there and Tab follows what is seen.
  const menuSlot = useCarriedFocus();
  const headMenu = menu ? (
    <div ref={menuSlot} className={s.menuEnd} data-head-menu="">
      {menu}
    </div>
  ) : null;
  return (
    <header ref={ref} className={cx(s.header, s[size], tabsFollow && s.tabsFollow, className)}>
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
      <div ref={rowRef} className={cx(s.row, stacked && s.stacked)}>
        {leading && <div className={s.leading}>{leading}</div>}
        <div className={s.titles}>
          <div className={s.titleLine}>
            <h1 className={s.title} tabIndex={-1} data-hub-title="">
              {title}
            </h1>
            {meta && <div className={s.meta}>{meta}</div>}
          </div>
          {subtitle && (
            <p className={s.subtitle}>
              <InClampedSubtitle.Provider value>{subtitle}</InClampedSubtitle.Provider>
            </p>
          )}
          {context && <div className={s.context}>{context}</div>}
        </div>
        {(stacked || narrow) && headMenu}
        {(actions || (primary && !fab)) && (
          <div className={s.actions}>
            {actions}
            {primary && !fab && <PrimaryButton action={primary} quiet={primaryQuiet} />}
          </div>
        )}
        {!(stacked || narrow) && headMenu}
      </div>
      {fab && <Fab action={primary} />}
    </header>
  );
}

/** A page's primary action as a header button: last in a PageHeader, and last in the DetailHeader of a DetailPage shown
 * in a ListDetail pane (Layouts). `quiet` (the header's `primaryQuiet`) styles it secondary. */
export function PrimaryButton({ action, quiet = false }: { action: PrimaryAction; quiet?: boolean }) {
  return (
    <Button variant={quiet ? 'secondary' : 'primary'} icon={action.icon} {...(action.glyph ? { chipIcon: action.glyph } : {})} onPress={action.onPress} isDisabled={action.isDisabled} disabledReason={action.disabledReason} busy={action.busy}>
      {action.label}
    </Button>
  );
}

/** True below 768 px, where the Ask dock opens as a full sheet over the bottom bar. */
const usePhoneSheet = (): boolean => useMedia('(width < 768px)');

/** True when the float's glyph names its action by itself (Button's own rule, chipGlyph: any glyph but the generic
 * arrow), so the float may shrink to it; an arrow alone would be an unlabelled button on touch, where the name's tooltip
 * never opens. */
function glyphNamesAction(action: PrimaryAction): boolean {
  return chipGlyph(action.glyph, undefined, action.label) !== 'arrow';
}

/** The floating action button: --fab-h high, at the bottom end above the tab bar; while the content scrolls down it
 * shrinks to its glyph when the glyph names the action (glyphNamesAction), and grows back on scroll up. Hidden while the phone Ask sheet is open (the bottom bar it sits
 * above is hidden then too). */
export function Fab({ action }: { action: PrimaryAction }) {
  const [small, setSmall] = useState(false);
  const ask = useAskDock();
  const phone = usePhoneSheet();
  const collapsible = glyphNamesAction(action);
  useEffect(() => {
    const main = document.getElementById('hub-main');
    if (!main) return;
    let last = main.scrollTop;
    const onScroll = () => {
      const y = main.scrollTop;
      if (Math.abs(y - last) < 8) return;
      setSmall(collapsible && y > last && y > 48);
      last = y;
    };
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => main.removeEventListener('scroll', onScroll);
  }, [collapsible]);
  if (ask.isOpen && phone) return null;
  // Shrunk only while the glyph names the action: an action that changes to an arrow-only one while shrunk grows back
  // at once, without waiting for the next scroll.
  const shrunk = small && collapsible;
  return createPortal(
    // data-hub-fab: the shell keeps the button's room under the content only while one is drawn (shell/AppShell.module.css).
    <div className={cx(s.fab, shrunk && s.fabSmall)} data-hub-fab="">
      {/* The end glyph is the header button's own (the action's glyph, else the plus for a "New …" create, else the
          arrow). The label stays mounted (collapsed to 0 by CSS), so the width can animate, focus never moves and the name
          is the same in both states; collapsed, the name also shows as a tooltip. */}
      <Tooltip content={action.label} isDisabled={!shrunk} data-hub-fab-tip="">
        <Button variant="primary" chip {...(action.glyph ? { chipIcon: action.glyph } : {})} onPress={action.onPress} isDisabled={action.isDisabled} disabledReason={action.disabledReason} busy={action.busy} aria-label={action.label}>
          {action.label}
        </Button>
      </Tooltip>
    </div>,
    document.body,
  );
}

/** A toolbar's control size: 'default' is the toolbar family (40, 44 on a coarse pointer); '32' is the compact rail
 *  (32, 44 on a coarse pointer) of a dense page such as Files. It sets `--tb-ctl-h` and `--tog-h` only, so only
 *  controls that ask for the toolbar size (Button/IconButton size="toolbar", a table's search, filters and view
 *  choice) follow it; an md control inside keeps its own size. */
export type ToolbarSize = 'default' | '32';

/** The attribute that carries a toolbar size (kit/tokens.css `[data-tb-size]`). Every size carries it: 'default' is the scope's
 *  inner boundary, so a default toolbar nested in a 32 scope stays default. */
export function toolbarSizeProps(size: ToolbarSize | undefined): { 'data-tb-size': ToolbarSize } {
  return { 'data-tb-size': size === '32' ? '32' : 'default' };
}

/** A toolbar size for a bar a page builds itself (the Files pane head and folder bar): one plain block wrapper that
 *  carries the size; a page that needs it laid out passes its own layout className. Never a page-set attribute. */
export function ToolbarScope({ size, children, className }: { size: ToolbarSize; children: ReactNode; className?: string }) {
  return <div className={className} {...toolbarSizeProps(size)}>{children}</div>;
}

/** A row of controls above content: search, filters, view options on the start side; actions on the end. Use it only
 * for a control row above content; a section's own actions are its ActionBar, and a DataTable brings its own toolbar. A
 * `notice` (a loading or unavailable note, an outcome's sentence) takes its own line under the controls, outside the
 * controls' group, so it never changes how the controls share the row. The root is the same with or without a notice,
 * so a notice coming or going never remounts the controls (a focused control keeps focus). `label` names the group.
 * A group, never role="toolbar": React Aria disables a ToggleButtonGroup's (segmented control's)
 * arrow keys inside any [role="toolbar"], and this row has no arrow keys of its own to give. */
export function Toolbar({ start, end, notice, className, label, size = 'default' }: { start?: ReactNode; end?: ReactNode; notice?: ReactNode; className?: string; label?: string; size?: ToolbarSize }) {
  return (
    <div className={cx(s.toolbarWithNotice, className)} {...toolbarSizeProps(size)}>
      <div className={s.toolbar} role="group" {...(label ? { 'aria-label': label } : {})}>
        <div className={s.toolbarStart}>{start}</div>
        {end && <div className={s.toolbarEnd}>{end}</div>}
      </div>
      {notice && <div className={s.toolbarNotice}>{notice}</div>}
    </div>
  );
}
