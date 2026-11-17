// Page layouts besides list/detail: TablePage, DetailPage (header, sticky
// tabs, facts rail), SettingsPage (section rail, setting rows, sticky save bar), DashboardPage
// (widget tracks) and WizardPage (stepper, body, summary, footer). Each page picks one; pages
// never write a media query (the container queries live here, keyed on the content class).
import { type KeyboardEvent, type ReactNode, type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link as AriaLink } from 'react-aria-components';
import { computerColor } from '@core';
import { StripMore, Tabs, useStripEdges } from '../controls/Tabs';
import { Button, cx } from '../controls/Button';
import { Disclosure } from '../controls/Disclosure';
import { Icon } from '../icons';
import { useSearchParam } from '../nav';
import { ActionMenu, type MenuEntry } from '../overlays/Overlays';
import { useContentNarrow } from '../media';
import { motionOff } from '../perf';
import { Skeleton, type SkeletonProps } from '../states/States';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import { CardEdge, CardScope, useCardCut } from './CardEdge';
import { InfoTip } from '../overlays/InfoTip';
import { ActionBar } from './anatomy/ActionBar';
import { useFocusFollow } from './anatomy/focusFollow';
import { headPrimary, primaryMoved } from './anatomy/Section';
import anatomyStrings from './anatomy/strings.en.json';
import { StateBody } from './anatomy/StateBody';
import type { EmptySpec, SectionProps, SectionState } from './anatomy/types';
import an from './anatomy/anatomy.module.css';
import { Faq, type FaqSpec } from './Faq';
import { DetailHeader } from './ListDetailPage';
import { PageHeader, type PageHeaderProps, PrimaryButton } from './PageHeader';
import { useDetailPane } from './pane';
import { SectionMenuItem, SectionMenuList } from './SectionMenu';
import { type PageViews, ViewStrip } from './views';
import type { WizardStep } from './wizardStep';
import s from './Layouts.module.css';
import './here.css';

// ── Panel: a titled level-1 card (only where the content is a distinct object) ────────

export interface PanelProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** No inner padding (tables, lists that run edge to edge). */
  flush?: boolean;
  tone?: CardTone;
  /** A note after the content (a list cut short, what a table leaves out), in its own padded slot: it never touches
   * the edge of a flush table above it. */
  notice?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** A card's tone: it recolours the frame through --card-edge, so the corner edge draws the same colour; warn
 * also tints the card. Pages pass it instead of colouring a card themselves. */
export type CardTone = 'default' | 'warn' | 'danger';

const toneClass = (tone: CardTone | undefined) => (tone === 'danger' ? s.panelDanger : tone === 'warn' ? s.panelWarn : undefined);

export function Panel({ title, description, actions, flush, tone = 'default', notice, className, children }: PanelProps) {
  const cut = useCardCut();
  return (
    <section {...cut} className={cx(s.panel, toneClass(tone), className)}>
      <CardEdge />
      <CardScope>
      {(title || actions) && (
        <header className={s.panelHead}>
          <div className={s.panelTitles}>
            {title && <h2 className={s.panelTitle}>{title}</h2>}
            {description && <p className={s.panelDesc}>{description}</p>}
          </div>
          {actions && <div className={s.panelActions}>{actions}</div>}
        </header>
      )}
      <div className={cx(s.panelBody, flush && s.flush)}>{children}</div>
      {notice && <div className={cx(s.panelNotice, flush && s.panelNoticeFlush)}>{notice}</div>}
      </CardScope>
    </section>
  );
}

/** A flat section inside a detail's main column: a title row one button high, optional description, content; sections
 * are separated by 24 px and a hairline. The legacy section: a new one is an AnatomySection (anatomy/Section.tsx),
 * which also draws the count, the actions and the loading, empty and failed states. */
export function Section({ title, description, actions, children, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx(s.section, className)}>
      <header className={s.sectionHead}>
        <h3 className={s.sectionTitle}>{title}</h3>
        {actions && <div className={s.panelActions}>{actions}</div>}
      </header>
      {description && <p className={s.panelDesc}>{description}</p>}
      <div className={s.sectionBody}>{children}</div>
    </section>
  );
}

// ── TablePage ───────────────────────────────────────────────────────────────────────

/**
 * The root of a `layout: 'custom'` page: the same page gutter (`--pad-page`), top and bottom space
 * as the kit layouts, so a PageHeader and the content under it line up with every other page.
 * `capped` keeps the content to the reading width the detail and settings layouts use.
 */
export function PageFrame({ children, capped, className }: { children: ReactNode; capped?: boolean; className?: string }) {
  return <div className={cx(s.page, capped && s.capped, className)}>{children}</div>;
}

export interface PageLoadingProps {
  /** The page's title: the h1, as the loaded page draws it. */
  title: string;
  /** The page's subtitle, when it is known before the page is. */
  subtitle?: ReactNode;
  /** The page's tab strip, when it is known before the page is: under the header, as on the loaded page. */
  tabs?: ReactNode;
  /** The shape of the loading lines. Defaults to a detail's. */
  variant?: SkeletonProps['variant'];
  rows?: number;
}

/**
 * A page that is not there yet: its header stays, and the loading lines stand where its content will be. The one
 * recipe for "the page is loading": the router draws it while a page's view loads; a page whose first read is out
 * draws the same thing with its own layout (its header, and a Skeleton as the content).
 */
export function PageLoading({ title, subtitle, tabs, variant = 'detail', rows = 8 }: PageLoadingProps) {
  return (
    <PageFrame>
      <PageHeader title={title} {...(subtitle !== undefined ? { subtitle } : {})} {...(tabs !== undefined ? { tabsFollow: true } : {})} />
      {tabs}
      <div data-page-loading="">
        <Skeleton variant={variant} rows={rows} />
      </div>
    </PageFrame>
  );
}

export interface CanvasPageProps {
  /** The page's name: a visually hidden h1, where the shell's route focus lands. */
  title: string;
  children: ReactNode;
  className?: string;
}

/**
 * The root of a `layout: 'canvas'` page (Board): no header row, no padding, no max
 * width; it fills the content height and its children fill it. The page draws its own controls.
 */
export function CanvasPage({ title, children, className }: CanvasPageProps) {
  return (
    <div className={cx(s.canvas, className)}>
      <h1 className={s.srOnly} data-hub-title="" tabIndex={-1}>
        {title}
      </h1>
      <div className={s.canvasBody}>{children}</div>
    </div>
  );
}

export interface TablePageProps<K extends string = string> {
  header: PageHeaderProps;
  /** The page's view switch, as DetailPage's and ListDetailPage's: under the header and above the notice, so the bar
   * keeps its y when a switch changes the layout (a view may be another layout). */
  views?: PageViews<K>;
  /** Banner area above the table (outcomes, notices). */
  notice?: ReactNode;
  /** Optional StatStrip above the table. */
  stats?: ReactNode;
  /** The DataTable; it brings its own toolbar (search, chips, count, view menu). */
  children: ReactNode;
  /** The page's questions: the last region after the table. The page then scrolls as one document, so
   * the table grows with its rows instead of scrolling inside a box cut at the viewport. */
  faq?: FaqSpec;
  className?: string;
}

export function TablePage<K extends string = string>({ header, views, notice, stats, children, faq, className }: TablePageProps<K>) {
  return (
    <div className={cx(s.page, s.fill, faq && s.fillFaq, className)}>
      <PageHeader {...header} tabsFollow={header.tabsFollow ?? views !== undefined} />
      {views && <ViewStrip views={views} className={s.noticeStack} />}
      {notice && <div className={s.noticeStack}>{notice}</div>}
      {stats && <div className={s.statsWrap}>{stats}</div>}
      <div className={s.tableBody}>{children}</div>
      {faq && <Faq faq={faq} titleLevel={2} className={s.faq} />}
    </div>
  );
}

// ── DetailPage ──────────────────────────────────────────────────────────────────────

export interface DetailTab {
  id: string;
  label: string;
  /** A small count or status after the label. */
  badge?: ReactNode;
  content: ReactNode;
}

export interface DetailPageProps<K extends string = string> {
  /** PageHeader's props without `context`: in a ListDetail pane the header is a DetailHeader, which has no context row,
   * so a context line would show on the full page and vanish in the pane. Refused here instead (`never`, so a
   * PageHeaderProps value that carries one does not pass either). In the pane, `primary` is the last action button
   * (styled by `primaryQuiet`; it never floats) and `leading` sits before the name as on the full page;
   * `breadcrumbs`, `size`, `primaryAsFab` and `tabsFollow` are full-page only: the DetailHeader has no place for them,
   * so a pane draws none of them. The ⋯ is DetailPage's own `menu` prop (both branches draw it), so `header.menu` is
   * refused too. */
  header: Omit<PageHeaderProps, 'context' | 'menu'> & { context?: never; menu?: never };
  /** The page's view switch: under the header and above the banner in both branches, at the same place as
   * a ListDetailPage's, so the bar keeps its y when a switch changes the layout. */
  views?: PageViews<K>;
  /** Page-level notices, between the header and the body in both branches: the same place as a
   * ListDetailPage's banner. Before `notice`, which holds the object's own notices; the view switch is `views`. */
  banner?: ReactNode;
  notice?: ReactNode;
  /** Tabs; the open one is kept in the URL (?tab=<id>). Without tabs, `children` is the body. */
  tabs?: readonly DetailTab[];
  tabParam?: string;
  /** Facts rail (facts, ids, links, help): 280 px on the end side at >= 1180, above the main column below. */
  aside?: ReactNode;
  /** The ⋯ menu of a detail shown in a ListDetail pane: the header's last control, after the pane control. */
  menu?: readonly MenuEntry[];
  /** The ⋯ menu's name ("Actions for atlas"); defaults to "More actions". */
  menuLabel?: string;
  /** Actions that stay in reach while the body scrolls (sticky at the pane's or page's bottom). */
  footer?: ReactNode;
  /** The computer's colour, for a page about one computer: one 4 px band on the element that stays on screen. In a
   * pane at 600 px or more of content that is the sticky header; below that, and on a full page (whose header never
   * sticks), it is the sticky tab bar. Normalised here; a missing or invalid colour draws no band. Without `tabs` there
   * is no sticky bar to carry it, so only the pane header shows it. */
  accent?: string;
  /** The page's questions: the last region of the main column, under every tab and before the facts rail. */
  faq?: FaqSpec;
  /** The body's data state, the strict Section's contract (SectionState): while it is not ready the kit draws it
   * (StateBody) in the main column, in place of `children` (each tab's content, with tabs), or above it with the kept
   * rows partial and stale. The header, tabs, facts rail and questions stay. */
  state?: SectionState;
  /** Required when the state can be empty. */
  empty?: EmptySpec;
  children?: ReactNode;
  className?: string;
}

/** One object. As a full page it has a PageHeader; inside a ListDetail pane it draws the 64 px
 * DetailHeader with the pane control (Hide list / ×) instead. */
export function DetailPage<K extends string = string>({ header, views, banner, notice, tabs, tabParam = 'tab', aside, menu, menuLabel, footer, accent, faq, state, empty, children, className }: DetailPageProps<K>) {
  const pane = useDetailPane();
  const label = typeof header.title === 'string' ? header.title : undefined;
  const grid = (main: ReactNode) => (
    <div className={s.detailBody}>
      <div className={cx(s.detailGrid, aside !== undefined && s.withAside)}>
        {aside !== undefined && <aside className={s.detailAside}>{aside}</aside>}
        <div className={s.detailMain}>
          {/* The state draws where the main column's content goes (each tab's, with tabs); the facts rail and the
              questions stay, as a Section keeps its head. */}
          <StateBody state={state} empty={empty} primary={undefined}>
            {main}
          </StateBody>
          {faq && <Faq faq={faq} titleLevel={pane ? 3 : 2} className={s.faq} />}
        </div>
      </div>
    </div>
  );
  const band = computerColor({ color: accent }) ?? undefined;
  const content = tabs ? <Tabs items={tabs.map((x) => ({ ...x, content: grid(x.content) }))} param={tabParam} label={label ?? ''} sticky panelClassName={s.tabPanel} accent={band} accentWhen={pane ? 'narrow' : 'always'} /> : grid(children);
  if (pane) {
    return (
      <div className={cx(s.inPane, className)}>
        <DetailHeader
          title={header.title}
          leading={header.leading}
          status={header.meta}
          meta={header.subtitle}
          actions={
            header.primary ? (
              <>
                {header.actions}
                <PrimaryButton action={header.primary} quiet={header.primaryQuiet} />
              </>
            ) : (
              header.actions
            )
          }
          menu={menu}
          menuLabel={menuLabel}
          accent={band}
        />
        {views && <ViewStrip views={views} className={cx(s.noticeStack, s.paneNotice)} />}
        {banner && <div className={cx(s.noticeStack, s.paneNotice)}>{banner}</div>}
        {notice && <div className={cx(s.noticeStack, s.paneNotice)}>{notice}</div>}
        <div className={s.paneBody}>{content}</div>
        {footer && <div className={cx(s.detailFooter, s.paneFooter)}>{footer}</div>}
      </div>
    );
  }
  return (
    <div className={cx(s.page, s.capped, className)}>
      <PageHeader {...header} tabsFollow={header.tabsFollow ?? (views !== undefined || (tabs !== undefined && !banner && !notice))} menu={menu && menu.length > 0 ? <ActionMenu items={menu} label={menuLabel} plain /> : undefined} />
      {views && <ViewStrip views={views} className={s.noticeStack} />}
      {banner && <div className={s.noticeStack}>{banner}</div>}
      {notice && <div className={s.noticeStack}>{notice}</div>}
      {content}
      {footer && <div className={s.detailFooter}>{footer}</div>}
    </div>
  );
}

// ── SettingsPage ────────────────────────────────────────────────────────────────────

/** A SettingsPage section. Beside its own fields it takes AnatomySection's slots (one section
 *  container), drawn by the same kit parts: the head's count, About and ActionBar (the primary off while the
 *  section is not read), notices above the body, the promise, the state's body in place of `content`, and the note. */
export interface SettingsSection extends Pick<SectionProps, 'count' | 'info' | 'promise' | 'actions' | 'notices' | 'state' | 'empty' | 'note'> {
  id: string;
  title: string;
  description?: ReactNode;
  content: ReactNode;
  tone?: 'default' | 'danger';
  /** A table section (sessions, keys) that may span the form and summary columns: at
   * >= 1180 with a summary rail, it and every later section move under both columns. */
  wide?: boolean;
}

export interface SettingsPageProps<K extends string = string> {
  header: PageHeaderProps;
  /** The page's view switch, as DetailPage's and ListDetailPage's: under the header and above the notice,
   * closing the header (its `tabsFollow` unless the header object says otherwise). A view can be another route. */
  views?: PageViews<K>;
  notice?: ReactNode;
  sections: readonly SettingsSection[];
  /** Summary rail (300 px at >= 1180; a strip above the form at M; folded below). */
  summary?: ReactNode;
  /** The sticky save bar (a kit FormFooter); pass it only while the form is dirty. */
  footer?: ReactNode;
  /** The page's questions: after the last section and before the summary and save bar, and the last
   * rail entry ("Questions"), which jumps to it like the others. */
  faq?: FaqSpec;
  /** URL search parameter that names the section in view. */
  sectionParam?: string;
  className?: string;
}

/** How long a section says "here": the length of --dur-4, which reduced motion zeroes. */
export const HERE_MS = 1200;
/** The one section marked "here" now: a later jump (marked or not) ends it first. */
let here: { el: HTMLElement; timer: number } | null = null;

/** Ends the "here" mark, or only one inside `within` (a page that unmounts its sections). */
export function clearSectionHere(within?: Element | null): void {
  if (!here || (within !== undefined && !within?.contains(here.el))) return;
  // A test file's environment may be gone by the time a stray mark is cleared: there is then no timer left to stop.
  if (typeof window !== 'undefined') window.clearTimeout(here.timer);
  here.el.removeAttribute('data-hub-here');
  here = null;
}

/** Marks a section "here" for HERE_MS (data-hub-here, styled in here.css); a new mark restarts it. */
function markHere(el: HTMLElement): void {
  clearSectionHere();
  // Off for one style pass (cleared above) so the fade starts over.
  void el.offsetWidth;
  el.setAttribute('data-hub-here', '');
  const timer = window.setTimeout(() => {
    if (here?.el === el) clearSectionHere();
  }, HERE_MS);
  here = { el, timer };
}

/** The section a smooth jump is scrolling to, and until when (a smooth scroll ends well within it). */
let gliding: { el: HTMLElement; until: number } | null = null;
const GLIDE_MS = 2000;

/**
 * Scrolls a settings section to the top of the page's scroller. Scrolls only #hub-main:
 * scrollIntoView would also scroll the shell's own (overflow hidden) grid and push the top bar off
 * screen. The sticky phone strip's height and the section's scroll margin are kept clear. For
 * page code that moves between its own sections (a shortcut that is not a rail item).
 * A jump the reader made (smooth) to a section that already shows whole, or one that moves nothing
 * (the page cannot scroll further), also marks the section "here": a scroll the
 * eye cannot follow, or none, would leave the reader asking which section the link meant. A landing
 * (smooth false) never marks. Every jump ends an earlier mark, and always scrolls (to where it already
 * is, too): that stops an earlier jump's smooth scroll still on its way. A landing on the section a jump is
 * still scrolling to does nothing: it is that jump's own ?section= write.
 */
export function scrollSettingsSection(el: HTMLElement | null | undefined, smooth: boolean): void {
  const root = document.getElementById('hub-main');
  if (!el || !root) return;
  // A landing on the section a jump is still scrolling to is that jump's own ?section= write: it would cut the glide short.
  // Any other landing ends the glide it interrupts (a later landing on that section is a new one).
  if (smooth) gliding = { el, until: Date.now() + GLIDE_MS };
  else if (gliding?.el === el && Date.now() < gliding.until) return;
  else gliding = null;
  const nav = el.closest<HTMLElement>(`.${s.settingsGrid}`)?.querySelector<HTMLElement>(`.${s.settingsNav}`);
  const strip = nav && getComputedStyle(nav).flexDirection === 'row' ? nav.offsetHeight : 0;
  const margin = parseFloat(getComputedStyle(el).scrollMarginBlockStart) || 0;
  const box = el.getBoundingClientRect();
  const view = root.getBoundingClientRect();
  const top = box.top - view.top + root.scrollTop - strip - margin;
  const goal = Math.min(Math.max(0, top), Math.max(0, root.scrollHeight - root.clientHeight));
  const still = Math.abs(goal - root.scrollTop) < 1;
  if (smooth) {
    if (still || (box.top >= view.top + strip && box.bottom <= view.bottom)) markHere(el);
    else clearSectionHere();
  }
  const reduce = motionOff();
  root.scrollTo({ top: goal, behavior: smooth && !reduce ? 'smooth' : 'auto' });
}

/** The section id of the FAQ in the rail, the scroll spy and ?section=. */
const FAQ_SECTION = 'faq';

/** One SettingsPage section: its own component so each section keeps its own focus-follow, as an
 *  AnatomySection does when its primary moves between the head and the empty state. */
function SettingsSectionCard({ x, wide, cut }: { x: SettingsSection; wide: true | undefined; cut: ReturnType<typeof useCardCut> }) {
  const ta = useStrings(anatomyStrings);
  // AnatomySection's rules for the head: the primary leaves for the empty state, and is off while nothing is read.
  const moved = primaryMoved(x.state, x.empty);
  // Focus follows the primary between the head and the empty state.
  const follow = useFocusFollow(moved);
  const primary = headPrimary(x.actions?.primary, x.state, { loading: ta('stillReading'), notRead: ta('notRead') });
  const showCount = x.count !== undefined && x.count.total > 0 && (x.state === undefined || x.state.kind === 'ready');
  const slots = x.notices || x.promise || x.state || x.note;
  const slotted = !!(slots || x.actions || showCount || x.info);
  const title = (
    <h2 className={s.settingsTitle} id={`hub-set-${x.id}`} tabIndex={-1}>
      {x.title}
    </h2>
  );
  return (
    <section
      {...cut}
      ref={(el) => {
        follow.root.current = el;
      }}
      onFocus={follow.onFocus}
      onBlur={follow.onBlur}
      data-section={x.id}
      data-wide={wide}
      data-hub-state={x.state?.kind}
      className={cx(s.settingsSection, x.tone === 'danger' && s.settingsDanger, slotted && an.rhythm)}
      aria-labelledby={`hub-set-${x.id}`}
    >
      <CardEdge />
      {x.actions || showCount || x.info ? (
        <div className={cx(s.settingsSectionHead, s.settingsHeadRow)}>
          <div className={s.panelTitles}>
            <div className={an.titleLine}>
              {title}
              {showCount && <span className={an.count}>{x.count!.total}</span>}
              {x.info && <InfoTip text={x.info} subject={x.title} />}
            </div>
            {x.description && <p className={s.panelDesc}>{x.description}</p>}
          </div>
          {x.actions && <ActionBar label={x.title} {...x.actions} primary={primary} withoutPrimary={moved} />}
        </div>
      ) : (
        // Without the head slots, the head as it always was.
        <div className={s.settingsSectionHead}>
          {title}
          {x.description && <p className={s.panelDesc}>{x.description}</p>}
        </div>
      )}
      <div className={s.settingsSectionBody}>
        <CardScope>
          {slots ? (
            <>
              {x.notices && <div className={an.notices}>{x.notices}</div>}
              {x.promise && <p className={an.promise}>{x.promise}</p>}
              <StateBody state={x.state} empty={x.empty} primary={x.actions?.primary}>
                {x.content}
              </StateBody>
              {x.note && <p className={an.note}>{x.note}</p>}
            </>
          ) : (
            x.content
          )}
        </CardScope>
      </div>
    </section>
  );
  }

export function SettingsPage<K extends string = string>({ header, views, notice, sections, summary, footer, faq, sectionParam = 'section', className }: SettingsPageProps<K>) {
  const t = useStrings(kitStrings);
  const cut = useCardCut();
  const body = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useSearchParam(sectionParam);
  const [spy, setSpy] = useState<string | undefined>(undefined);
  // The rail's entries: the sections, then the FAQ (a section of the page like the others for the jump and the spy).
  const entries = useMemo<readonly { id: string; title: string }[]>(
    () => (faq ? [...sections, { id: FAQ_SECTION, title: t('faq.title') }] : sections),
    [sections, faq, t],
  );
  const active = spy ?? (entries.some((x) => x.id === current) ? current : entries[0]?.id);
  // The phone strip fades the side that has more and keeps the current item in view.
  const strip = useStripEdges<HTMLDivElement>(active, '[aria-current]');
  const nav = useRef<HTMLElement>(null);
  // While a jump scrolls smoothly, the spy holds the jumped-to item instead of passing through.
  const jumping = useRef(0);
  const scrollToSection = (el: HTMLElement | null | undefined, smooth: boolean) => {
    if (!el) return;
    jumping.current = Date.now() + 800;
    scrollSettingsSection(el, smooth);
  };
  const jump = (id: string, focusTitle = true) => {
    const el = body.current?.querySelector<HTMLElement>(`[data-section="${CSS.escape(id)}"]`);
    scrollToSection(el, true);
    if (focusTitle) el?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    setSpy(id);
    setCurrent(id === entries[0]?.id ? undefined : id, { replace: true, keepScroll: true });
  };
  // j/k and the arrow keys walk the index; focus stays in it so the walk can go on.
  const onNavKey = (e: KeyboardEvent<HTMLElement>) => {
    const step = e.key === 'j' || e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'k' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0 || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    const i = entries.findIndex((x) => x.id === active);
    const next = entries[Math.min(entries.length - 1, Math.max(0, i + step))];
    if (!next) return;
    jump(next.id, false);
    nav.current?.querySelector<HTMLElement>(`[data-nav="${CSS.escape(next.id)}"]`)?.focus();
  };
  // Scroll-spy: the current item is the topmost section whose heading shows above 30 % of the
  // scroller, else the last section whose top has passed that line;
  // at the very bottom it is the last section.
  const ids = entries.map((x) => x.id).join('|');
  useEffect(() => {
    const root = document.getElementById('hub-main');
    const host = body.current;
    if (!root || !host) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (Date.now() < jumping.current) return;
      const els = [...host.querySelectorAll<HTMLElement>('[data-section]')];
      const box = root.getBoundingClientRect();
      const line = box.top + box.height * 0.3;
      const atEnd = root.scrollTop + root.clientHeight >= root.scrollHeight - 2;
      let id = els[0]?.dataset.section;
      for (const el of els) if (el.getBoundingClientRect().top <= line) id = el.dataset.section;
      // A heading still showing above the line wins over a later one that also passed it: near
      // the end, sections that cannot scroll to the top would otherwise mark the next one early.
      const shown = els.find((el) => {
        const top = el.getBoundingClientRect().top;
        return top >= box.top && top <= line;
      });
      if (shown) id = shown.dataset.section;
      if (atEnd && root.scrollTop > 0) {
        // At the bottom the last section counts as current, unless the one already current (a
        // jump or deep link to a short section near the end) still shows its heading. Landing
        // here with nothing current yet (a page's own anchor scroll) takes the topmost heading in
        // view instead: that is the section the anchor named.
        const inView = (el: HTMLElement | undefined) => {
          const top = el?.getBoundingClientRect().top;
          return top !== undefined && top >= box.top && top < box.bottom;
        };
        const last = els[els.length - 1]?.dataset.section ?? id;
        setSpy((prev) => {
          if (prev === undefined) return els.find((e) => inView(e))?.dataset.section ?? last;
          return inView(els.find((e) => e.dataset.section === prev)) ? prev : last;
        });
        return;
      }
      if (id) setSpy(id);
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [ids]);
  // A "here" mark on one of these sections ends with the page.
  useEffect(() => {
    const host = body.current;
    return () => clearSectionHere(host);
  }, []);
  // Deep link: scroll to the section named in the URL, each time it names another (a command or link on the page
  // that is already open writes ?section= again), not only the first time. A reader's own jump writes the param too:
  // its landing is skipped by scrollSettingsSection while that jump still glides.
  const handled = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!current || handled.current === current) {
      if (!current) {
        handled.current = undefined;
        gliding = null;
      }
      return;
    }
    handled.current = current;
    scrollToSection(body.current?.querySelector<HTMLElement>(`[data-section="${CSS.escape(current)}"]`), false);
    setSpy(current);
  }, [current]);
  const rail = entries.length > 1;
  // Wide split: only beside a summary rail; without one every section has the column.
  const firstWide = summary === undefined ? -1 : sections.findIndex((x) => x.wide);
  const head = firstWide < 0 ? sections : sections.slice(0, firstWide);
  const tail = firstWide < 0 ? [] : sections.slice(firstWide);
  const renderSection = (x: SettingsSection) => <SettingsSectionCard key={x.id} x={x} wide={(firstWide >= 0 && x.wide) || undefined} cut={cut} />;
  const saveBar = footer && <div className={s.saveBar}>{footer}</div>;
  // The FAQ closes the form part (or the wide part when there is one), ahead of the save bar.
  const faqSection = faq && (
    <div key={FAQ_SECTION} data-section={FAQ_SECTION} className={s.settingsFaq}>
      <Faq faq={faq} titleLevel={2} />
    </div>
  );
  return (
    <div className={cx(s.page, s.capped, className)}>
      <PageHeader {...header} tabsFollow={header.tabsFollow ?? views !== undefined} />
      {views && <ViewStrip views={views} className={s.noticeStack} />}
      {notice && <div className={s.noticeStack}>{notice}</div>}
      <div className={cx(s.settingsGrid, rail && s.withRail, summary !== undefined && s.withSummary, tail.length > 0 && s.hasWide)} ref={body}>
        {rail && (
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- j/k and arrows rove over the nav's own buttons
          <nav className={s.settingsNav} aria-label={t('settings.sections')} ref={nav} onKeyDown={onNavKey}>
            <StripMore side="start" edges={strip.edges} scroller={strip.ref} />
            <SectionMenuList className={cx(s.settingsNavList, strip.fadeClassName)} ref={strip.ref}>
              {entries.map((x) => (
                <SectionMenuItem
                  key={x.id}
                  current={x.id === active}
                  data-nav={x.id}
                  tabIndex={x.id === active ? 0 : -1}
                  className={s.settingsNavItem}
                  aria-current={x.id === active ? 'true' : undefined}
                  aria-keyshortcuts="j k"
                  onClick={() => jump(x.id)}
                >
                  {x.title}
                </SectionMenuItem>
              ))}
            </SectionMenuList>
            <StripMore side="end" edges={strip.edges} scroller={strip.ref} />
          </nav>
        )}
        <div className={cx(s.settingsBody, tail.length > 0 && s.settingsHead)}>
          {head.map(renderSection)}
          {tail.length === 0 && faqSection}
          {tail.length === 0 && saveBar}
        </div>
        {summary !== undefined && (
          // The aside holds the summary's place in the grid. Beside a wide part the card inside it is what sticks;
          // otherwise the aside does (see the CSS).
          <aside className={s.settingsSummary}>
            <div {...cut} className={s.settingsSummaryCard}>
              <CardEdge />
              <CardScope>{summary}</CardScope>
            </div>
          </aside>
        )}
        {tail.length > 0 && (
          <div className={cx(s.settingsBody, s.settingsWide)} data-hub-wide-part="">
            {tail.map(renderSection)}
            {faqSection}
            {saveBar}
          </div>
        )}
      </div>
    </div>
  );
}

/** One setting row: kit/forms/SettingRow, re-exported so pages keep importing it from here. */
export { SettingRow } from '../forms/SettingRow';

// ── DashboardPage ───────────────────────────────────────────────────────────────────

export interface DashboardPageProps {
  header: PageHeaderProps;
  notice?: ReactNode;
  /** Widgets (kit Widget) in reading order; dense packing fills the gaps. */
  children: ReactNode;
  /** The page's questions: full width after the widgets. */
  faq?: FaqSpec;
  className?: string;
  /**
   * 'dense' (default): a later small widget may move up into an earlier hole. 'ordered': the visual order is the DOM
   * (and Tab) order, for a page whose order the person chooses; the row fill below still closes each row's gap.
   */
  flow?: 'dense' | 'ordered';
}

/** The last row fills: the last widget of every incomplete row widens to the
 * row's end, so the grid never shows a hole. Re-run on resize and when widgets change. */
function useFillRows(ref: RefObject<HTMLDivElement | null>): void {
  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid || typeof ResizeObserver === 'undefined') return;
    let busy = false;
    const apply = () => {
      if (busy) return;
      busy = true;
      const items = [...grid.children].filter((el): el is HTMLElement => el instanceof HTMLElement);
      for (const el of items) {
        if (el.dataset.hubFill) {
          el.style.removeProperty('grid-column');
          delete el.dataset.hubFill;
        }
      }
      const cs = getComputedStyle(grid);
      const tracks = cs.gridTemplateColumns.split(' ').filter(Boolean).length;
      const gap = parseFloat(cs.columnGap) || 0;
      const col = (grid.clientWidth - gap * (tracks - 1)) / Math.max(1, tracks);
      const rows = new Map<number, HTMLElement[]>();
      for (const el of items) rows.set(el.offsetTop, [...(rows.get(el.offsetTop) ?? []), el]);
      if (tracks > 1) {
        for (const row of rows.values()) {
          const last = row.reduce((a, b) => (b.offsetLeft > a.offsetLeft ? b : a));
          if (grid.clientWidth - (last.offsetLeft + last.offsetWidth) < col / 2) continue;
          const start = Math.round(last.offsetLeft / (col + gap)) + 1;
          last.style.gridColumn = `${start} / -1`;
          last.dataset.hubFill = '1';
        }
      }
      requestAnimationFrame(() => {
        busy = false;
      });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(grid);
    const mo = new MutationObserver(apply);
    mo.observe(grid, { childList: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [ref]);
}

export function DashboardPage({ header, notice, children, faq, className, flow = 'dense' }: DashboardPageProps) {
  const grid = useRef<HTMLDivElement>(null);
  useFillRows(grid);
  return (
    <div className={cx(s.page, s.capped, className)}>
      <PageHeader size="lg" {...header} />
      {notice && <div className={s.noticeStack}>{notice}</div>}
      <div className={cx(s.dashGrid, flow === 'ordered' && s.dashOrdered)} data-flow={flow} ref={grid}>
        {children}
      </div>
      {faq && <Faq faq={faq} titleLevel={2} className={s.faq} />}
    </div>
  );
}

export interface WidgetProps extends PanelProps {
  /** Tracks spanned: s = 1, m = 2, l = all (clamped to the track count). */
  size?: 's' | 'm' | 'l';
  /** "View all ›" link to the page that holds everything. `end`: the link is the header's last item, in link
   * blue, its text ending at the card's padding line; the ⋯ menu comes before it. Without it, today's placement. */
  viewAll?: { href: string; label?: string; end?: boolean };
  /** The widget's ⋯ menu, always shown. */
  menu?: readonly MenuEntry[];
  /** The body is as high as its content (a one-line card), without the usual minimum height. */
  fit?: boolean;
  /** Cards that end level beside each other: the same head and body height, the body ending level with no line of its own. 'rows' scrolls whole rows (--card-level-row) and snaps to them; 'fill' gives its content the body. On a phone the body takes its content's height. */
  level?: 'rows' | 'fill';
}

export function Widget({ size = 'm', className, viewAll, menu, actions, title, description, flush, tone, notice, fit, level, children }: WidgetProps) {
  const t = useStrings(kitStrings);
  const cut = useCardCut();
  const hasHead = title !== undefined || actions !== undefined || viewAll !== undefined || (menu !== undefined && menu.length > 0);
  const link = viewAll && (
    <AriaLink href={viewAll.href} className={cx(s.viewAll, viewAll.end && s.viewAllEnd)}>
      {viewAll.label ?? t('widget.viewAll')}
      <Icon name="chevron-right" size="sm" />
    </AriaLink>
  );
  return (
    <section {...cut} className={cx(s.panel, s.widget, s[`w_${size}`], level && s.widgetLevel, toneClass(tone), className)}>
      <CardEdge />
      <CardScope>
      {hasHead && (
        <header className={cx(s.panelHead, s.widgetHead)}>
          <div className={s.panelTitles}>
            {title && <h2 className={cx(s.panelTitle, s.widgetTitle)}>{title}</h2>}
            {description && <p className={s.panelDesc}>{description}</p>}
          </div>
          {actions && <div className={s.panelActions}>{actions}</div>}
          {viewAll && !viewAll.end && link}
          {menu && menu.length > 0 && (
            <span className={s.widgetMenu}>
              <ActionMenu items={menu} size="sm" />
            </span>
          )}
          {viewAll?.end && link}
        </header>
      )}
      <div className={cx(s.panelBody, s.widgetBody, flush && s.flush, fit && s.widgetFit, level === 'rows' && s.levelRows, level === 'fill' && s.levelFill)}>{children}</div>
      {notice && <div className={cx(s.panelNotice, flush && s.panelNoticeFlush)}>{notice}</div>}
      </CardScope>
    </section>
  );
}

// ── WizardPage ──────────────────────────────────────────────────────────────────────

export type { WizardStep } from './wizardStep';

export interface WizardPageProps {
  header: PageHeaderProps;
  steps: readonly WizardStep[];
  /** Index of the current step (the page owns it; useWizardStep keeps it in the URL). */
  current: number;
  /** Done steps are clickable; pass the setter from useWizardStep. */
  onStep?: (index: number) => void;
  notice?: ReactNode;
  /** Summary rail (price, choices so far): 300 px at >= 1180, below the body at M. */
  summary?: ReactNode;
  children: ReactNode;
  /** The page's questions: the page's last block, after the step body, the summary and the footer's buttons (as on every
   *  other page). A step change never moves focus into it. */
  faq?: FaqSpec;
  /** Full-width notes between the body and the footer row (a refusal, an unknown outcome), never inside the row.
   *  Presentational: showing one moves no focus; the page moves focus itself after the person's own action. */
  footNote?: ReactNode;
  /** The 64 px sticky footer: Back (start), Cancel, Next / final action (end). WizardFooter lays it out in one row. */
  footer?: ReactNode;
  className?: string;
  /** default: a left step list beside a 640 px body (realms). flow: a step strip over the page, the body takes the width
   *  (beside `aside` when given), and the footer follows the step's content, sticking to the window bottom only while
   *  the step is taller than the window (New script). */
  variant?: 'default' | 'flow';
  /** flow only: the side card beside a fill-in step (sticky at the top). Absent: the step takes the whole width (a
   *  review step). Below 840 it folds into a Disclosure above the step, titled `asideTitle`. */
  aside?: ReactNode;
  /** flow only: the aside's accessible name, and its Disclosure title below 840. */
  asideTitle?: string;
}

export interface TileProps {
  /** The edge alone, without the fill (a tile that holds a control, such as Home's "All shortcuts"). */
  plain?: boolean;
  /** stack (default): the content in a column, start-aligned and centred in the tile's height (keycaps above their
   *  words); center: one row, centred across (a control). */
  layout?: 'stack' | 'center';
  children: ReactNode;
}

/** A tile of a page's tile grid: a faint 1 px solid edge (its own text colour at 14%), the --hx-tile-fill
 *  fill, and the tile's padding. A div, so it can be a row of a <dl> or a cell of the grid; the page places it, and a
 *  narrow grid may set --tile-pad-y (default --sp-3) to tighten the tiles' height. */
export function Tile({ plain, layout = 'stack', children }: TileProps) {
  return <div className={cx(s.tile, layout === 'center' ? s.tileCenter : s.tileStack, !plain && s.tileFill)}>{children}</div>;
}

export { useWizardStep, type WizardStepOptions } from './wizardStep';

/** A field a person can reach: a kit Select's trigger (button with a listbox popup) counts, and so does the first
 *  control of a group named by a field label (`role=group` + `aria-labelledby`: SecretField's Show, a DateTimeField);
 *  a control hidden from assistive tech (React Aria's native select inside an aria-hidden box, anything inert or
 *  hidden) never does. */
const WIZARD_FIELD =
  'input:not([type=hidden]):not(:disabled), textarea:not(:disabled), select:not(:disabled), button[aria-haspopup=listbox]:not(:disabled), [role=group][aria-labelledby] button:not(:disabled), [contenteditable=true]';
const unreachable = (el: Element) => el.closest('[aria-hidden="true"], [inert], [hidden]') !== null;
// The page's FAQ sits in the body after the step; a step change never lands on it.
const firstReachable = (root: HTMLElement | null | undefined, sel: string) =>
  root ? (Array.from(root.querySelectorAll<HTMLElement>(sel)).find((el) => !unreachable(el) && el.closest(`.${s.faq}`) === null) ?? null) : null;

/** Where focus goes on a step transition: the step's own `[data-wizard-focus]`, else its first reachable field, else
 *  its first heading, else the page heading. */
function wizardFocusTarget(body: HTMLElement | null, page: HTMLElement | null): HTMLElement | null {
  const pick = firstReachable(body, '[data-wizard-focus]') ?? firstReachable(body, WIZARD_FIELD) ?? firstReachable(body, 'h1, h2, h3, h4');
  return pick ?? page?.querySelector<HTMLElement>('h1') ?? null;
}

/** Brings a flow step's focus target into view in the page scroller after a transition (focus moved with preventScroll):
 *  advancing from the stuck footer of a long, scrolled step would otherwise leave focus above the window. Scrolls only
 *  #hub-main (scrollIntoView would also scroll the shell grid), keeps the target's scroll margins clear (the end one
 *  holds the stuck footer) and the scroller's scroll padding (the phone bar), and moves nothing when the target
 *  already shows. */
function revealWizardTarget(el: HTMLElement): void {
  const root = document.getElementById('hub-main');
  if (!root || !root.contains(el)) return;
  const cs = getComputedStyle(el);
  const before = parseFloat(cs.scrollMarginBlockStart) || 0;
  const after = parseFloat(cs.scrollMarginBlockEnd) || 0;
  const box = el.getBoundingClientRect();
  const view = root.getBoundingClientRect();
  // The scroller's own scroll padding is room something lies over (the phone bar at its end): not in view either.
  const rs = getComputedStyle(root);
  const top = view.top + (parseFloat(rs.scrollPaddingBlockStart) || 0);
  const bottom = view.bottom - (parseFloat(rs.scrollPaddingBlockEnd) || 0);
  if (box.top >= top + before && box.bottom <= bottom - after) return;
  const goal = Math.min(Math.max(0, root.scrollTop + box.top - top - before), Math.max(0, root.scrollHeight - root.clientHeight));
  root.scrollTo({ top: goal, behavior: 'auto' });
}

export interface WizardFooterProps {
  /** Back: a button at the start, its label hidden below 480 px (its name stays "Back"). Absent: nothing there. */
  back?: { onPress: () => void; isDisabled?: boolean };
  /** The step's main action, at the end. */
  primary: ReactNode;
  /** A second action beside the primary (before it). */
  secondary?: ReactNode;
  /** One muted line above the row: what the primary does next, or why it is closed. Never inside the row. */
  note?: ReactNode;
  /** The note's id: the page puts it in its primary's aria-describedby, so a closed primary says why. */
  noteId?: string;
}

/** A wizard's footer row: Back at the start, the secondary and primary actions at the end, one row at every width.
 *  With a `note`, the line sits above the row (the row itself stays one row). */
export function WizardFooter({ back, primary, secondary, note, noteId }: WizardFooterProps) {
  const t = useStrings(kitStrings);
  const row = (
    <>
      {back ? (
        <Button icon="arrow-left" chip={false} aria-label={t('wizard.back')} isDisabled={back.isDisabled} onPress={back.onPress} className={s.wizardBack}>
          <span className={s.wizardBackLabel}>{t('wizard.back')}</span>
        </Button>
      ) : (
        <span />
      )}
      <div className={s.wizardFootEnd}>
        {secondary}
        {primary}
      </div>
    </>
  );
  if (note === undefined || note === null || note === false) return row;
  return (
    <div className={s.wizardFootStack}>
      <p id={noteId} className={s.wizardFootLine}>{note}</p>
      <div className={s.wizardFootRow}>{row}</div>
    </div>
  );
}

/** The flow wizard's step strip: one framed bar of equal segments. A done step is a button back to it ("Go back to
 *  step 2: Where it answers"), the current one carries aria-current and the accent bar, a later one is aria-disabled. */
function StepStrip({ steps, current, onStep }: { steps: readonly WizardStep[]; current: number; onStep?: (index: number) => void }) {
  const t = useStrings(kitStrings);
  return (
    <nav className={s.strip} aria-label={t('wizard.steps')}>
      <ol className={s.stripList}>
        {steps.map((x, i) => {
          const done = i < current;
          const now = i === current;
          const inner = (
            <>
              <span className={s.stripNum}>{done ? <Icon name="check" size="sm" /> : i + 1}</span>
              <span className={s.stripLabel}>{x.label}</span>
              {now ? <span className={s.stripNow}>{t('wizard.now')}</span> : null}
            </>
          );
          return (
            <li
              key={x.id}
              className={cx(s.stripStep, done && s.stripDone, now && s.stripCurrent)}
              aria-current={now ? 'step' : undefined}
              aria-disabled={!done && !now ? true : undefined}
              title={x.label}
            >
              {done && onStep ? (
                <button type="button" className={s.stripBtn} aria-label={t('wizard.goBack', { n: i + 1, label: x.label })} onClick={() => onStep(i)}>
                  {inner}
                </button>
              ) : (
                <span className={s.stripBtn}>{inner}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function WizardPage({ header, steps, current, onStep, notice, summary, children, faq, footNote, footer, className, variant = 'default', aside, asideTitle }: WizardPageProps) {
  const t = useStrings(kitStrings);
  const cut = useCardCut();
  const step = steps[current];
  const pageRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const shown = useRef(current);
  const [announce, setAnnounce] = useState('');
  // Only a real step transition moves focus and announces the step: never the first mount, a re-render, typing,
  // a check's answer or a note appearing.
  useEffect(() => {
    if (shown.current === current) return;
    shown.current = current;
    const el = wizardFocusTarget(bodyRef.current, pageRef.current);
    if (el) {
      if (!el.matches('input, textarea, select, button, a[href], [tabindex], [contenteditable=true]')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
      if (variant === 'flow') revealWizardTarget(el);
    }
    if (step) setAnnounce(t('wizard.announce', { n: current + 1, total: steps.length, label: step.label }));
  }, [current, step, steps.length, t, variant]);
  // Below 840 (the same container the compact step line reads) the flow's aside folds into a Disclosure above the step.
  const [narrowAnchor, narrow] = useContentNarrow(840);
  // The flow's footer sticks to the bottom over a long step: its drawn height (a note line makes it taller) is the room
  // every control in the step keeps below itself when focus or a scroll brings it into view (--flow-foot-h).
  const flowMainRef = useRef<HTMLDivElement>(null);
  const flowFootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const main = flowMainRef.current;
    const foot = flowFootRef.current;
    if (variant !== 'flow' || !main || !foot || typeof ResizeObserver === 'undefined') return;
    const apply = () => main.style.setProperty('--flow-foot-h', `${Math.ceil(foot.getBoundingClientRect().height)}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(foot);
    return () => ro.disconnect();
  }, [variant, footer]);
  if (variant === 'flow') {
    const hasAside = aside !== undefined && aside !== null && aside !== false;
    return (
      <div ref={pageRef} className={cx(s.page, s.wizard, s.wizardFlow, className)}>
        <div ref={narrowAnchor} className={s.flowBlock}>
          <PageHeader {...header} />
          <StepStrip steps={steps} current={current} {...(onStep ? { onStep } : {})} />
          <div className={s.wizardCompact}>
            <span>
              {t('wizard.step', { n: current + 1, total: steps.length })}
              {step && ` · ${step.label}`}
            </span>
            {/* The strip's compact form: one square segment per step (done ink, current accent), as the kit Meter. */}
            <span className={s.flowSegments} aria-hidden="true">
              {steps.map((x, i) => (
                <span key={x.id} className={cx(s.flowSegment, i < current && s.flowSegmentDone, i === current && s.flowSegmentNow)} />
              ))}
            </span>
          </div>
          {notice && <div className={s.noticeStack}>{notice}</div>}
          <div className={cx(s.flowGrid, hasAside && !narrow && s.flowWithAside)}>
            <div ref={flowMainRef} className={s.flowMain}>
              {hasAside && narrow ? (
                <Disclosure title={asideTitle ?? ''} className={s.flowAsideFold}>
                  {aside}
                </Disclosure>
              ) : null}
              <div ref={bodyRef} className={s.wizardBody}>
                {children}
              </div>
              {footNote ? <div className={s.wizardFootNote}>{footNote}</div> : null}
              {/* Right under the step: it rests below a short step and sticks to the window bottom on a long one. */}
              {footer && <div ref={flowFootRef} className={cx(s.wizardFooter, s.flowFooter)}>{footer}</div>}
              {/* The page's questions are the page's last block, after the step's buttons, as on every other page. Below
                  the footer in the flow, they scroll it away instead of sitting under it. */}
              {faq && <Faq faq={faq} titleLevel={2} className={s.faq} />}
            </div>
            {hasAside && !narrow ? (
              <aside className={s.flowAside} aria-label={asideTitle}>
                {aside}
              </aside>
            ) : null}
          </div>
        </div>
        <div className={s.srOnly} role="status" aria-live="polite" data-wizard-announce="">
          {announce}
        </div>
      </div>
    );
  }
  return (
    <div ref={pageRef} className={cx(s.page, s.wizard, className)}>
      <div className={s.wizardBlock}>
        <PageHeader {...header} />
        <div className={s.wizardCompact}>
          <span>
            {t('wizard.step', { n: current + 1, total: steps.length })}
            {step && ` · ${step.label}`}
          </span>
          <span className={s.progress}>
            <span className={s.progressBar} style={{ inlineSize: `${((current + 1) / Math.max(1, steps.length)) * 100}%` }} />
          </span>
        </div>
        {notice && <div className={s.noticeStack}>{notice}</div>}
        <div className={cx(s.wizardGrid, summary !== undefined && s.withSummary)}>
          <ol className={s.steps} aria-label={t('wizard.steps')}>
            {steps.map((x, i) => (
              <li key={x.id} className={cx(s.step, i < current && s.stepDone, i === current && s.stepCurrent)} aria-current={i === current ? 'step' : undefined}>
                {i < current && onStep ? (
                  <button type="button" className={s.stepBtn} onClick={() => onStep(i)}>
                    <span className={s.stepNum}>
                      <Icon name="check" size="sm" />
                    </span>
                    <span className={s.stepLabel}>{x.label}</span>
                  </button>
                ) : (
                  <span className={s.stepBtn}>
                    <span className={s.stepNum}>{i < current ? <Icon name="check" size="sm" /> : i + 1}</span>
                    <span className={s.stepLabel}>{x.label}</span>
                  </span>
                )}
              </li>
            ))}
          </ol>
          <div ref={bodyRef} className={s.wizardBody}>
            {children}
          </div>
          {summary !== undefined && (
            <aside {...cut} className={s.wizardSummary}>
              <CardEdge />
              <CardScope>{summary}</CardScope>
            </aside>
          )}
        </div>
        {footNote ? <div className={s.wizardFootNote}>{footNote}</div> : null}
      </div>
      <div className={s.srOnly} role="status" aria-live="polite" data-wizard-announce="">
        {announce}
      </div>
      {footer && <div className={s.wizardFooter}>{footer}</div>}
      {/* The page's questions are the page's last block, after the footer's buttons, under the whole wizard at its block
          width, not in the step column: the two-column FAQ needs the width, and a step change never moves focus into them
          (focus goes to the body). */}
      {faq && (
        <div className={cx(s.wizardBlock, s.wizardFaqBlock)}>
          <Faq faq={faq} titleLevel={2} className={s.faq} />
        </div>
      )}
    </div>
  );
}
