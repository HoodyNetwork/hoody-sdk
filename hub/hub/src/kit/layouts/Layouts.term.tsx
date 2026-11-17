// Page layouts in the terminal. The same props and decisions as Layouts.tsx; the drawing is cells:
// - One scroll owner per region (termScroll.PageBody): a page's header (and a sticky footer: a save bar, a wizard's
//   footer, a detail's actions) stays put, the body scrolls by wheel and PageUp/PageDown/Home/End, and its position is
//   kept per route across navigation. A TablePage without questions does not scroll as a whole: its table scrolls.
// - Layout decisions read the width of the layout's own box (useBoxSize), not the terminal's: breakpoints in
//   termBreaks.ts (rails and summaries beside the body from a width, dashboard tracks by how many cards fit).
// - Cards are bordered boxes; a tone colours the frame and puts a mark before the title, so it reads in mono.
// - A computer's accent colour (DetailPage `accent`) is not drawn: the palette is tokens only.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type * as Web from './Layouts';
import { Button } from '../controls/Button';
import { Disclosure } from '../controls/Disclosure';
import { Link } from '../controls/Link';
import { useLocationHash, usePathname, useSearchParam } from '../nav';
import { ActionMenu } from '../overlays/Overlays';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import { Box, PaneSize, Scroll, Text, useBoxSize, useFocusable, type Key } from '../../term/prim';
import { cellWidth } from '@term/prim';
import { TAB_MORE_CELLS, tabWindow } from '../controls/Tabs.pure';
import type { BoxRenderable } from '../../term/prim/otui';
import { TableHome } from '../../term/prim/TableHome';
import { Skeleton } from '../states/States';
import { StateBody } from './anatomy/StateBody';
import { TermSection } from './anatomy/termSection';
import { Faq } from './Faq';
import { DetailHeader } from './ListDetailPage';
import { DetailStickCtx } from '../../term/jsx/sticky';
import { PageHeader, PrimaryButton } from './PageHeader';
import { useDetailPane } from './pane';
import { ASIDE_COLS, ASIDE_W, CAPPED_PAGE_COLS, CONTENT_MAX_COLS, FORM_MAX_COLS, SETTINGS_RAIL_COLS, SETTINGS_RAIL_W, SHORT_ROWS, WIZARD_STEPS_COLS, dashTracks } from './termBreaks';
import { Inline, QuestionsLast, say, useFocusSem, useTermSize, PageBlock } from './termParts';
import { PageBody, revealAnchor, useRegionRows, type ScrollOwner } from './termScroll';
import { TabStrip } from './termTabs';
import { ViewStrip } from './views';
import { useWizardStep as useStep } from './wizardStep';
import { focusInk, useHoverFill } from '@term/kit';

export type { PageLoadingProps, PanelProps, CardTone, CanvasPageProps, TablePageProps, DetailTab, DetailPageProps, SettingsSection, SettingsPageProps, DashboardPageProps, WidgetProps, WizardStep, WizardPageProps, TileProps, WizardStepOptions, WizardFooterProps } from './Layouts';
export { SettingRow } from '../forms/SettingRow';

/** The route a page's scroll position is kept under. */
const useKeepKey = (): string => usePathname();
/** Rows between stacked parts: none on a short terminal. */
const useGapRows = (): number => (useTermSize().height >= SHORT_ROWS ? 1 : 0);

const TONE_MARK: Record<Web.CardTone, string> = { default: '', warn: '!', danger: '✗' };
const TONE_LINE = { default: 'line', warn: 'warn', danger: 'danger' } as const;

// ── Panel, Section ───────────────────────────────────────────────────────────────────────

export const Panel: typeof Web.Panel = ({ title, description, actions, flush, tone = 'default', notice, children }) => (
  <Box dir="column" border borderColour={TONE_LINE[tone]} padX={flush ? 0 : 1} shrink={0}>
    {(title || actions) && (
      <Box dir="row" wrap gapX={2} justify="between" padX={flush ? 1 : 0}>
        <Box dir="column" shrink={1}>
          <Box dir="row" gap={1}>
            {tone !== 'default' && <Text colour={TONE_LINE[tone]} bold>{TONE_MARK[tone]}</Text>}
            {title ? <Box sem={{ role: 'heading', level: 2, ...(typeof title === 'string' ? { name: title } : {}) }}>{say(title, { bold: true })}</Box> : null}
          </Box>
          {description !== undefined && description !== null && <Inline>{description}</Inline>}
        </Box>
        {actions && <Box dir="row" gap={2} align="center">{actions}</Box>}
      </Box>
    )}
    {children}
    {notice && <Box padX={flush ? 1 : 0}><Inline>{notice}</Inline></Box>}
  </Box>
);

export const Section: typeof Web.Section = ({ title, description, actions, children }) => {
  const gap = useGapRows();
  return (
    <Box dir="column" shrink={0} pad={gap ? { bottom: 1 } : undefined}>
      <Box dir="row" wrap gapX={2} justify="between">{title ? <Box sem={{ role: 'heading', level: 3, ...(typeof title === 'string' ? { name: title } : {}) }}>{say(title, { bold: true })}</Box> : null}{actions && <Box dir="row" gap={2}>{actions}</Box>}</Box>
      {description !== undefined && description !== null && <Inline>{description}</Inline>}
      {children}
    </Box>
  );
};

// ── PageFrame, CanvasPage, TablePage ────────────────────────────────────────────────────

/** A capped page's content: the web's `.capped` width (termBreaks CONTENT_MAX_COLS) at the start edge. The scroll owner
 * around it keeps the pane's whole width, so its scrollbar stays at the pane's end edge on a big screen. */
const Capped = ({ children }: { children: ReactNode }) => <Box dir="column" shrink={0} maxWidth={CONTENT_MAX_COLS}>{children}</Box>;

/** A custom page's root: the page gutter, and the page scrolls as one document (the web's #hub-main). */
export const PageFrame: typeof Web.PageFrame = ({ children, capped }) => {
  const keep = useKeepKey();
  return (
    <PageBody keep={keep} padX={1}>{capped ? <Capped>{children}</Capped> : children}</PageBody>
  );
};

/** A page that is not there yet: its header stays (with its tab strip, when known), and the loading lines stand
 *  where its content will be. */
export const PageLoading: typeof Web.PageLoading = ({ title, subtitle, tabs, variant = 'detail', rows = 8 }) => (
  <PageFrame>
    <PageHeader title={title} {...(subtitle !== undefined ? { subtitle } : {})} {...(tabs !== undefined ? { tabsFollow: true } : {})} />
    {tabs}
    <Skeleton variant={variant} rows={rows} />
  </PageFrame>
);

/** A canvas page: no header row, no padding; its children fill the content area and draw their own controls. The
 * title is the shell's (the top bar names the page), as the web's is a hidden h1. */
// The web names the page with a visually hidden h1 (the canvas draws its own controls): here a heading with no rows.
export const CanvasPage: typeof Web.CanvasPage = ({ title, children }) => (
  <Box dir="column" grow={1} minHeight={0}>
    <Box height={0} sem={{ role: 'heading', level: 1, name: title }} />
    {children}
  </Box>
);

export const TablePage: typeof Web.TablePage = ({ header, views, notice, stats, children, faq }) => {
  const keep = useKeepKey();
  const rows = (
    <>
      {notice}
      {stats && <PageBlock>{stats}</PageBlock>}
      {/* The page's own table: it takes the first focus even with questions under it (↓ moves its rows at once). */}
      <Box dir="column" grow={faq ? 0 : 1} minHeight={0} shrink={faq ? 0 : 1}><TableHome>{children}</TableHome></Box>
    </>
  );
  return (
    <Box dir="column" grow={1} padX={1} minHeight={0}>
      {/* The page's view switch closes the header, as on the web (no gap row between them). */}
      <PageHeader {...header} tabsFollow={header.tabsFollow ?? views !== undefined} />
      {views && <PageBlock><ViewStrip views={views} /></PageBlock>}
      {/* With questions the page scrolls as one document, the table growing with its rows (the web's rule); under a
          short table they sit at the bottom of the scroll area. */}
      {faq ? <PageBody keep={keep}><QuestionsLast faq={<Faq faq={faq} titleLevel={2} />}>{rows}</QuestionsLast></PageBody> : rows}
    </Box>
  );
};

// ── DetailPage ──────────────────────────────────────────────────────────────────────────

function DetailGrid({ aside, faq, state, empty, inPane, children }: { aside?: ReactNode; faq?: Web.DetailPageProps['faq']; state?: Web.DetailPageProps['state']; empty?: Web.DetailPageProps['empty']; inPane: boolean; children: ReactNode }) {
  const [size, onSize] = useBoxSize();
  const beside = aside !== undefined && (size?.width ?? 0) >= ASIDE_COLS;
  // The questions of a short detail sit at the bottom of its scroll area, in flow (the web's
  // `.detailMain > .faq`): the grid is at least the area's height and the free rows go above them. Beside a facts rail
  // the main column keeps its own height (`.withAside > .detailMain { align-self: start }`): they follow the content.
  const region = useRegionRows();
  const last = faq !== undefined && !beside;
  const main = (
    <Box dir="column" grow={1} shrink={1} minWidth={0} gap={0}>
      <StateBody state={state} empty={empty} primary={undefined}>{children}</StateBody>
      {last && <Box grow={1} shrink={1} minHeight={0} />}
      {faq && <Faq faq={faq} titleLevel={inPane ? 3 : 2} />}
    </Box>
  );
  return (
    <Box dir={beside ? 'row' : 'column'} gap={beside ? 2 : 0} onSize={onSize} shrink={0} {...(last ? { minHeight: region ?? 0 } : {})}>
      {/* Facts rail: beside the main column on the end side when there is room; above it otherwise (the web's order). */}
      {aside !== undefined && !beside && <Box dir="column" shrink={0}>{aside}</Box>}
      {main}
      {aside !== undefined && beside && <Box dir="column" width={ASIDE_W} shrink={0}>{aside}</Box>}
    </Box>
  );
}

/** The least body rows a DetailPage keeps between its pinned head and footer; below it the head scrolls with the body. */
const BODY_MIN_ROWS = 4;

export const DetailPage = (<K extends string = string>({ header, views, banner, notice, tabs, tabParam = 'tab', aside, menu, footer, faq, state, empty, children }: Web.DetailPageProps<K>) => {
  const pane = useDetailPane();
  const keep = useKeepKey();
  const [tabValue, setTab] = useSearchParam(tabParam);
  const open = tabs?.find((x) => x.id === tabValue) ?? tabs?.[0];
  const grid = (main: ReactNode) => <DetailGrid aside={aside} faq={faq} state={state} empty={empty} inPane={pane !== null}>{main}</DetailGrid>;
  const strip = tabs && tabs.length > 0 && (
    <TabStrip items={tabs.map(({ id, label, badge }) => ({ id, label, badge }))} value={open?.id}
      onChange={(id) => setTab(id === tabs[0]?.id ? undefined : id, { replace: true })} />
  );
  const content = tabs ? grid(open?.content) : grid(children);
  const cap = pane ? undefined : CONTENT_MAX_COLS;
  // A short region (support's thread at 60x20: a 3-line title and a reply box of 8-14 rows in a 13-row pane) left the
  // body one row between a pinned head and a pinned footer, and they overdrew it. The web's pane scrolls as one, header
  // included, with only the footer sticky. Here, when pinning both would leave the body fewer than BODY_MIN_ROWS rows,
  // the head scrolls with the body and the footer keeps at most the rest (it scrolls inside itself past that). The
  // footer is a Scroll at every size, so its contents (a reply draft, a send's outcome) are never remounted by the
  // switch; the head holds no state. Decided from measured heights (the head's laid out in either place, the footer's
  // content), each the same or taller once short, so the decision cannot flip back and forth.
  const [region, onRegion] = useBoxSize();
  const [top, onTop] = useBoxSize();
  const [foot, onFoot] = useBoxSize();
  const footH = footer ? (foot?.height ?? 0) + 1 : 0;
  const short = region !== null && region.height - (top?.height ?? 0) - footH < BODY_MIN_ROWS;
  const head = pane ? (
    <DetailHeader
      title={header.title}
      status={header.meta}
      meta={header.subtitle}
      actions={header.primary ? <>{header.actions}<PrimaryButton action={header.primary} quiet={header.primaryQuiet} /></> : header.actions}
      menu={menu}
    />
  ) : (
    <PageHeader {...header} actions={<>{header.actions}{menu && menu.length > 0 && <ActionMenu items={menu} />}</>} />
  );
  // A page of its own stops at the web's content cap (a pane takes the room its split gives); the body's scroll owner
  // keeps the whole width. The tab bar stays put (the web's sticky tabs); the open tab's body scrolls under it.
  const topBox = (
    <Box dir="column" shrink={0} maxWidth={cap} onSize={onTop}>
      {head}
      {/* One blank row closes the strip, or the banner and notice under it when there are any (never a blank between
          the strip's rule and a banner). */}
      {views && (banner || notice ? <ViewStrip views={views} /> : <PageBlock><ViewStrip views={views} /></PageBlock>)}
      {(banner || notice) && <PageBlock>{banner}{notice}</PageBlock>}
      {strip}
    </Box>
  );
  const body = pane ? content : <Capped>{content}</Capped>;
  // A DetailPage pins its own head (and moves it into the scroll when short): its DetailHeader and tab strip never stick
  // inside the pane's scroll as a bare DetailHeader does.
  return (
    <DetailStickCtx.Provider value={null}>
    <Box dir="column" grow={1} minHeight={0} padX={pane ? 0 : 1} onSize={onRegion}>
      {!short && topBox}
      <PageBody keep={`${keep}#${open?.id ?? ''}`}>{short && topBox}{body}</PageBody>
      {footer && (
        // The rule is on a Box around the Scroll: an unsized Scroll is capped to its content's height, and a border of
        // its own would take that last row (the reply box's Send).
        <Box dir="column" shrink={0} border={['top']} borderColour="line" maxWidth={cap}>
          <Scroll shrink={0} followFocus {...(short && region ? { maxHeight: Math.max(1, region.height - BODY_MIN_ROWS - 1) } : {})}>
            <Box dir="row" shrink={0} wrap gapX={2} onSize={onFoot}>{footer}</Box>
          </Scroll>
        </Box>
      )}
    </Box>
    </DetailStickCtx.Provider>
  );
}) as typeof Web.DetailPage;

// ── SettingsPage ────────────────────────────────────────────────────────────────────────

/** How long a section says "here" on the web; in a terminal the jumped-to section's frame is lit until the next jump. */
export const HERE_MS: typeof Web.HERE_MS = 1200;
/** No DOM mark to clear: the "here" mark is the current section's frame (SettingsPage state). */
export const clearSectionHere: typeof Web.clearSectionHere = () => {};
/** The web scrolls an element; here sections are anchors in the page's scroll owner: an element argument cannot name
 * one, so this does nothing. Terminal code jumps with SettingsPage's menu or `?section=` (which it follows). */
export const scrollSettingsSection: typeof Web.scrollSettingsSection = () => {};

const FAQ_SECTION = 'faq';
/** A row-less mark at the top of the scrolling sections: revealing it brings the page back to its top. Not an
 *  anchorOf() id, so no section id can take it. */
const TOP_ANCHOR = 'hub-settings-top';
const anchorOf = (id: string): string => `hub-set-${id}`;

/** One entry of a section menu: Tab reaches the current one (the web's roving tabindex); j/k and the arrows walk. */
function MenuEntry({ title, current, onPress, onWalk, register }: { title: string; current: boolean; onPress: () => void; onWalk: (step: 1 | -1) => void; register: (f: (() => void) | null) => void }): ReactNode {
  const f = useFocusable({
    // Tab reaches the current entry only (roving tab stop); the others take keys once focused (j/k, a press).
    tabStop: current,
    onKey: (k: Key) => {
      if (k.name === 'return' || k.name === 'space') { onPress(); return true; }
      if (k.ctrl || k.meta) return false;
      if (k.name === 'j' || k.name === 'down' || k.name === 'right') { onWalk(1); return true; }
      if (k.name === 'k' || k.name === 'up' || k.name === 'left') { onWalk(-1); return true; }
      return false;
    },
  });
  register(f.focus);
  const ref = useFocusSem(f, { role: 'button', name: title, ...(current ? { current: true } : {}) });
  const hover = useHoverFill(false, f.focused);
  return (
    <Box dir="row" boxRef={ref} shrink={0} {...hover} onPress={() => { f.focus(); onPress(); }}>
      <Text truncate colour={current ? 'ink' : 'muted'} bold={current} {...focusInk(f.focused)}>{current ? '▌' : ' '}{title} </Text>
    </Box>
  );
}

export const SettingsPage = (<K extends string = string>({ header, views, notice, sections, summary, footer, faq, sectionParam = 'section' }: Web.SettingsPageProps<K>) => {
  const t = useStrings(kitStrings);
  const keep = useKeepKey();
  const gap = useGapRows();
  const [size, onSize] = useBoxSize();
  const width = size?.width ?? 0;
  const [current, setCurrent] = useSearchParam(sectionParam);
  const entries = useMemo<readonly { id: string; title: string }[]>(
    () => (faq ? [...sections, { id: FAQ_SECTION, title: t('faq.title') }] : sections),
    [sections, faq, t],
  );
  const [active, setActive] = useState<string | undefined>(undefined);
  const shown = active ?? (entries.some((x) => x.id === current) ? current : entries[0]?.id);
  const focusers = useRef(new Map<string, () => void>());
  // A jump's own scroll is not reading: the spy waits until it has settled.
  const quietUntil = useRef(0);
  const jump = (id: string, focusEntry: boolean) => {
    quietUntil.current = Date.now() + 250;
    setActive(id);
    revealAnchor(anchorOf(id));
    setCurrent(id === entries[0]?.id ? undefined : id, { replace: true, keepScroll: true });
    if (focusEntry) setTimeout(() => focusers.current.get(id)?.(), 0);
  };
  const walk = (step: 1 | -1) => {
    const i = entries.findIndex((x) => x.id === shown);
    const next = entries[Math.min(entries.length - 1, Math.max(0, i + step))];
    if (next && next.id !== shown) jump(next.id, true);
  };
  // A deep link (or a later ?section= written by the page) brings its section into view once it is laid out.
  const handled = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!current || handled.current === current) { if (!current) handled.current = undefined; return; }
    handled.current = current;
    quietUntil.current = Date.now() + 250;
    setActive(current);
    const id = setTimeout(() => revealAnchor(anchorOf(current)), 0);
    return () => clearTimeout(id);
  }, [current]);
  // A revealed linked section that leaves the page (a loading placeholder whose read fails, so the page draws no
  // sections) sends the page to its top, as a link that names nothing does. The scroll position never depends on
  // whether the reveal or the failure comes first.
  const linkedGone = handled.current !== undefined && !entries.some((x) => x.id === handled.current);
  useEffect(() => {
    if (!linkedGone) return;
    handled.current = undefined;
    setActive(undefined);
    revealAnchor(TOP_ANCHOR);
  }, [linkedGone]);
  // Arriving on an anchor that names a section ('/notifications/learn#browser'; the web scrolls to it, a page's own
  // landing has nothing to scroll here): that section, once, unless ?section= already said which.
  const arrivedOn = useRef(useLocationHash());
  useEffect(() => {
    const at = arrivedOn.current;
    const id = current ? undefined : entries.find((x) => at === x.id || at.endsWith(`#${x.id}`))?.id;
    if (!id) return;
    quietUntil.current = Date.now() + 250;
    setActive(id);
    const timer = setTimeout(() => revealAnchor(anchorOf(id)), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on arrival only
  }, []);
  // Scroll-spy (the web's): reading by wheel or Page keys moves the mark to the last section whose top has reached the
  // top two rows; at the very end, the last section (it may never reach the top).
  // Answered at once, and again once layout settled: the notice can come before the sections are laid out (a kept
  // position restored on mount).
  const spyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (spyTimer.current) clearTimeout(spyTimer.current); }, []);
  const spyNow = useRef<(owner: ScrollOwner) => void>(() => {});
  spyNow.current = (owner) => {
    if (Date.now() < quietUntil.current || entries.length < 2) return;
    const top = owner.top();
    const ys = entries.map((x) => owner.offsetOf(anchorOf(x.id)));
    // Not laid out yet (sections still stacked at one row): the deferred pass answers.
    if (ys.some((y, i) => i > 0 && y !== undefined && ys[i - 1] !== undefined && y <= ys[i - 1]!)) return;
    let at: string | undefined;
    entries.forEach((x, i) => { const y = ys[i]; if (y !== undefined && y <= top + 2) at = x.id; });
    const last = entries[entries.length - 1];
    const lastY = last && owner.offsetOf(anchorOf(last.id));
    if (last && lastY !== undefined && top > 0 && top >= owner.end() && lastY < top + owner.rows()) at = last.id;
    const next = at ?? entries[0]?.id;
    if (next && next !== shown) setActive(next);
  };
  const spy = (_top: number, owner: ScrollOwner) => {
    spyNow.current(owner);
    if (spyTimer.current) clearTimeout(spyTimer.current);
    spyTimer.current = setTimeout(() => { spyTimer.current = null; spyNow.current(owner); }, 30);
  };
  const rail = entries.length > 1;
  const railBeside = rail && width >= SETTINGS_RAIL_COLS;
  const summaryBeside = summary !== undefined && width >= ASIDE_COLS + (railBeside ? SETTINGS_RAIL_W : 0);
  // The strip's room is the page's width inside its one-cell padding; an entry is its mark, its title and a space.
  const stripWin = width > 0
    ? tabWindow(entries.map((x) => cellWidth(x.title) + 2), Math.max(0, entries.findIndex((x) => x.id === shown)), width - 2)
    : { from: 0, to: entries.length };
  const menu = rail && (
    railBeside ? (
      <Box dir="column" width={SETTINGS_RAIL_W} shrink={0} border={['right']} borderColour="line" sem={{ role: 'navigation', name: t('settings.sections') }}>
        <Text colour="faint">{t('settings.sections')}</Text>
        {entries.map((x) => (
          <MenuEntry key={x.id} title={x.title} current={x.id === shown} onPress={() => jump(x.id, false)} onWalk={walk}
            register={(fn) => { if (fn) focusers.current.set(x.id, fn); }} />
        ))}
      </Box>
    ) : (
      // Narrow: the web's phone strip, one row that never wraps (the web scrolls it sideways between edge chevrons).
      // Wider than its room, it folds as kit Tabs do: a window around the shown section, "‹ n" / "n ›" counting the
      // sections out of view (Layouts.strip.term.test.tsx). Before the page is measured, every section.
      <Box dir="row" shrink={0} border={['bottom']} borderColour="line" sem={{ role: 'navigation', name: t('settings.sections') }}>
        {stripWin.from > 0 ? <Text colour="muted">{`‹ ${stripWin.from} `.padEnd(TAB_MORE_CELLS)}</Text> : null}
        {entries.slice(stripWin.from, stripWin.to).map((x) => (
          <MenuEntry key={x.id} title={x.title} current={x.id === shown} onPress={() => jump(x.id, false)} onWalk={walk}
            register={(fn) => { if (fn) focusers.current.set(x.id, fn); }} />
        ))}
        {stripWin.to < entries.length ? <Text colour="muted">{` ${entries.length - stripWin.to} ›`.padStart(TAB_MORE_CELLS)}</Text> : null}
      </Box>
    )
  );
  // Wide split (as on the web): beside a summary, the first `wide` section and every later one move under both
  // columns. The summary then scrolls with the form part above them instead of standing beside the whole page.
  const firstWide = summaryBeside ? sections.findIndex((x) => x.wide) : -1;
  const cards = sections.map((x, i) => {
    return (
      <Box key={x.id} dir="column" shrink={0} pad={gap ? { bottom: 1 } : undefined} maxWidth={firstWide >= 0 && i >= firstWide && !x.wide ? FORM_MAX_COLS : undefined}>
        <TermSection anchor={anchorOf(x.id)} title={x.title} count={x.count} info={x.info} description={x.description} actions={x.actions}
          notices={x.notices} promise={x.promise} state={x.state} empty={x.empty} note={x.note} tone={x.tone} current={rail && x.id === shown} frame>
          {x.content}
        </TermSection>
      </Box>
    );
  });
  const summaryCard = summary !== undefined && <Box dir="column" border borderColour="line" padX={1} shrink={0}>{summary}</Box>;
  const faqPart = faq && <Box key={FAQ_SECTION} raw={{ id: anchorOf(FAQ_SECTION) }} dir="column" shrink={0} maxWidth={FORM_MAX_COLS}><Faq faq={faq} titleLevel={2} /></Box>;
  return (
    <Box dir="column" grow={1} padX={1} minHeight={0} maxWidth={CAPPED_PAGE_COLS} onSize={onSize}>
      <PageHeader {...header} />
      {views && <PageBlock><ViewStrip views={views} /></PageBlock>}
      {notice}
      {menu && !railBeside && menu}
      <Box dir="row" grow={1} minHeight={0} gap={railBeside ? 1 : 0}>
        {menu && railBeside && menu}
        {/* The form column is a measured pane: the rail and the summary take room a container question must not count. */}
        {/* The form column stops at the web's --form-max; from the first wide section on, the part under the form and
            the summary takes both columns (its other sections keep the form width). */}
        <PaneSize minWidth={0} minHeight={0} maxWidth={firstWide >= 0 ? FORM_MAX_COLS + 1 + ASIDE_W : FORM_MAX_COLS}>
        <PageBody keep={keep} onScroll={rail ? spy : undefined}>
          <Box raw={{ id: TOP_ANCHOR }} height={0} shrink={0} />
          {/* Summary: a strip above the form when it cannot sit beside it (the web's M size). */}
          {summary !== undefined && !summaryBeside && <Box pad={gap ? { bottom: 1 } : undefined}>{summaryCard}</Box>}
          {firstWide >= 0 ? (
            <>
              <Box dir="row" gap={1} shrink={0}>
                {/* Plain boxes, not PaneSize: a pane measured inside the scroll re-laid out after the first frame and left
                    the page opened scrolled past its first section (Account at 200x60). */}
                <Box dir="column" grow={1} shrink={1} minWidth={0}>{cards.slice(0, firstWide)}</Box>
                <Box dir="column" width={ASIDE_W} shrink={0}>{summaryCard}</Box>
              </Box>
              {cards.slice(firstWide)}
            </>
          ) : cards}
          {faqPart}
        </PageBody>
        </PaneSize>
        {summaryBeside && firstWide < 0 && <PaneSize width={ASIDE_W} grow={0} shrink={0}>{summaryCard}</PaneSize>}
      </Box>
      {/* The save bar stays in reach under the scrolling sections (the web's sticky bar). */}
      {footer && <Box dir="row" shrink={0} border={['top']} borderColour="line">{footer}</Box>}
    </Box>
  );
}) as typeof Web.SettingsPage;

// ── DashboardPage, Widget, Tile ─────────────────────────────────────────────────────────

const WIDGET_SPAN = { s: 1, m: 2, l: Number.POSITIVE_INFINITY } as const;

/** The dashboard a Widget is laid out in: its column count and the cells a span takes. Read by the Widget itself, not
 *  from the page's children, because a page may put its cards anywhere below DashboardPage (Home draws them from a
 *  component through a `display: contents` wrapper, as the web grid's items). A Widget opens a null scope for its own
 *  body, so a card inside a card is not a grid item. */
interface DashGrid {
  tracks: number;
  cells(span: number): number;
  /** The Widget's box, so the grid can tell its cards from the full-width rows between them. */
  claim(box: unknown): () => void;
}
const DashCtx = createContext<DashGrid | null>(null);

export const DashboardPage: typeof Web.DashboardPage = ({ header, notice, children, faq }) => {
  const keep = useKeepKey();
  const gap = useGapRows();
  const [size, onSize] = useBoxSize();
  const width = size?.width ?? 0;
  const tracks = dashTracks(width);
  // One wrapping row: each card is its span's width and grows into what its line leaves (so a short last line fills, as on
  // the web); a line's cards are as tall as its tallest (stretch), unless one is `fit`. Reading order = Tab order (no
  // 'dense' reordering in a terminal).
  // Anything else in the grid (a strip, a notice, an empty state; the web gives those `grid-column: 1 / -1`) takes a
  // line of its own: after each layout, a grid child that is not a claimed card is set to the full width.
  const grid = useRef<BoxRenderable | null>(null);
  const cards = useRef(new Set<unknown>());
  const fullRows = useCallback(() => {
    const g = grid.current;
    if (!g || g.isDestroyed) return;
    for (const c of g.getChildren() as BoxRenderable[]) {
      if (!cards.current.has(c) && c.width !== g.width) c.width = '100%';
    }
  }, []);
  const ctx = useMemo<DashGrid>(() => {
    const col = Math.max(1, Math.floor((width - (tracks - 1)) / tracks));
    return {
      tracks,
      cells: (span) => span * col + (span - 1),
      claim: (box) => { cards.current.add(box); queueMicrotask(fullRows); return () => { cards.current.delete(box); }; },
    };
  }, [width, tracks, fullRows]);
  const tiles = (
    <Box dir="row" wrap gapX={1} gapY={gap} shrink={0} boxRef={grid} onSize={(w, h) => { onSize(w, h); fullRows(); }}>
      <DashCtx.Provider value={size ? ctx : null}>{size ? children : null}</DashCtx.Provider>
    </Box>
  );
  return (
    <Box dir="column" grow={1} padX={1} minHeight={0}>
      <Capped>
        <PageHeader size="lg" {...header} />
        {notice}
      </Capped>
      <PageBody keep={keep}>
        <Capped>
          {/* A short dashboard's questions sit at the bottom of the scroll area, in flow. */}
          {faq ? <QuestionsLast faq={<Box shrink={0} padY={gap > 0 ? 1 : 0}><Faq faq={faq} titleLevel={2} /></Box>}>{tiles}</QuestionsLast> : tiles}
        </Capped>
      </PageBody>
    </Box>
  );
};

export const Widget: typeof Web.Widget = ({ size = 'm', viewAll, menu, actions, title, description, flush, tone = 'default', notice, fit, level, children }) => {
  const t = useStrings(kitStrings);
  const dash = useContext(DashCtx);
  const box = useRef<BoxRenderable | null>(null);
  useLayoutEffect(() => (dash && box.current ? dash.claim(box.current) : undefined), [dash]);
  // In a dashboard: the span's width, growing into its line's leftover. Elsewhere (a column of cards): its content's
  // height; it fills a row it sits in only if that row asks (align stretch).
  const cell = dash ? { width: dash.cells(Math.min(dash.tracks, WIDGET_SPAN[size])), grow: 1, shrink: 1, minWidth: 0 } : { grow: 0 };
  const hasHead = title !== undefined || actions !== undefined || viewAll !== undefined || (menu !== undefined && menu.length > 0);
  const link = viewAll && <Link href={viewAll.href}>{`${viewAll.label ?? t('widget.viewAll')} ›`}</Link>;
  return (
    // `fit`: as high as its content (no stretching to the row's tallest card); `level`: the body takes the card's height.
    // Only in a dashboard's line: in a column of cards (a form's groups in a drawer) `start` is the WIDTH, and a card
    // as wide as its content is not the web's (there `fit` only drops the least height): a group of setting rows in
    // it flipped between side by side and stacked for ever, and one wider than the drawer was cut at its edge.
    <Box dir="column" boxRef={box} border borderColour={TONE_LINE[tone]} padX={flush ? 0 : 1} {...cell} alignSelf={fit && dash ? 'start' : undefined}>
      {hasHead && (
        <Box dir="row" gap={2} justify="between" padX={flush ? 1 : 0}>
          <Box dir="column" shrink={1}>
            <Box dir="row" gap={1}>
              {tone !== 'default' && <Text colour={TONE_LINE[tone]} bold>{TONE_MARK[tone]}</Text>}
              {say(title, { bold: true, truncate: true })}
            </Box>
            {description !== undefined && description !== null && <Inline>{description}</Inline>}
          </Box>
          <Box dir="row" gap={2} shrink={0}>
            {actions}
            {viewAll && !viewAll.end && link}
            {menu && menu.length > 0 && <ActionMenu items={menu} size="sm" />}
            {viewAll?.end && link}
          </Box>
        </Box>
      )}
      <DashCtx.Provider value={null}>{level ? <Box dir="column" grow={1}>{children}</Box> : children}</DashCtx.Provider>
      {notice && <Box padX={flush ? 1 : 0}><Inline>{notice}</Inline></Box>}
    </Box>
  );
};

/** A tile: a dashed-edge cell on the web; here a plain box with a light frame (the edge alone when `plain`). */
export const Tile: typeof Web.Tile = ({ plain, layout = 'stack', children }) => (
  <Box dir={layout === 'center' ? 'row' : 'column'} justify={layout === 'center' ? 'center' : 'start'} border borderColour={plain ? 'line' : 'lineStrong'} padX={1} grow={1}>
    {children}
  </Box>
);

// ── WizardPage ──────────────────────────────────────────────────────────────────────────

export const useWizardStep: typeof Web.useWizardStep = useStep;

export const WizardFooter: typeof Web.WizardFooter = ({ back, primary, secondary, note, noteId }) => {
  const t = useStrings(kitStrings);
  const row = (
    <Box dir="row" grow={1} justify="between" gap={2}>
      {back ? <Button aria-label={t('wizard.back')} isDisabled={back.isDisabled} onPress={back.onPress}>{t('wizard.back')}</Button> : <Box />}
      <Box dir="row" gap={2}>{secondary}{primary}</Box>
    </Box>
  );
  if (note === undefined || note === null || note === false) return row;
  // The note is one muted line above the row, never inside it; its id lets the page's primary say it as its reason.
  return (
    <Box dir="column" grow={1} shrink={1}>
      <Box dir="row" shrink={0} raw={noteId ? { id: noteId } : undefined}><Inline colour="muted">{note}</Inline></Box>
      {row}
    </Box>
  );
};

/** A done step: pressable when the page lets a person go back to it. */
function StepItem({ n, label, name = label, state, onPress }: { n: number; label: string; name?: string; state: 'done' | 'current' | 'next'; onPress?: () => void }): ReactNode {
  const f = useFocusable({ disabled: !onPress, onKey: (k) => (k.name === 'return' || k.name === 'space' ? (onPress?.(), true) : false) });
  const mark = state === 'done' ? '✓' : String(n);
  const ref = useFocusSem(f, onPress
    ? { role: 'button', name }
    : { role: 'listitem', name: label, ...(state === 'current' ? { current: 'step' } : {}) });
  // Only a step that can be pressed (a done step the page lets a person go back to).
  const hover = useHoverFill(!onPress, f.focused);
  return (
    <Box dir="row" boxRef={ref} shrink={0} {...hover} onPress={onPress ? () => { f.focus(); onPress(); } : undefined}>
      <Text colour={state === 'current' ? 'ink' : state === 'done' ? 'ok' : 'faint'} bold={state === 'current'} {...focusInk(f.focused)}>
        {state === 'current' ? '▸' : ' '}{mark} {label}{' '}
      </Text>
    </Box>
  );
}

export const WizardPage: typeof Web.WizardPage = ({ header, steps, current, onStep, notice, summary, children, faq, footNote, footer, variant = 'default', aside, asideTitle }) => {
  const t = useStrings(kitStrings);
  const keep = useKeepKey();
  const [size, onSize] = useBoxSize();
  const width = size?.width ?? 0;
  const step = steps[current];
  // flow: the steps are a strip over the page at every width, and the step may have a side card (`aside`): beside the
  // step while there is room for it, else folded above the step under its title.
  const flow = variant === 'flow';
  const besideSteps = !flow && width >= WIZARD_STEPS_COLS;
  const hasAside = flow && aside !== undefined && aside !== null && aside !== false;
  const besideAside = hasAside && width >= ASIDE_COLS;
  const besideSummary = summary !== undefined && width >= ASIDE_COLS + (besideSteps ? 22 : 0);
  // The body starts at its top on every step change (the web moves focus into the new step).
  const bodyKey = `${keep}#step-${current}`;
  const list = (
    <Box dir={besideSteps ? 'column' : 'row'} wrap={!besideSteps} shrink={0} width={besideSteps ? 22 : undefined} border={besideSteps ? ['right'] : ['bottom']} borderColour="line" sem={{ role: 'list', name: t('wizard.steps') }}>
      {steps.map((x, i) => (
        <StepItem key={x.id} n={i + 1} label={x.label} {...(flow ? { name: t('wizard.goBack', { n: i + 1, label: x.label }) } : {})} state={i < current ? 'done' : i === current ? 'current' : 'next'} onPress={i < current && onStep ? () => onStep(i) : undefined} />
      ))}
    </Box>
  );
  const pct = Math.round(((current + 1) / Math.max(1, steps.length)) * 100);
  return (
    <Box dir="column" grow={1} padX={1} minHeight={0} onSize={onSize}>
      <PageHeader {...header} />
      {/* The web's compact line: "Step 2 of 4 · Details" and a progress bar (text, so it reads in mono). */}
      <Box dir="row" gap={2} shrink={0}>
        <Text colour="muted" sem={{ role: 'status' }}>{t('wizard.step', { n: current + 1, total: steps.length })}{step ? ` · ${step.label}` : ''}</Text>
        <Text colour="blueText">{'█'.repeat(Math.round(pct / 10))}<Text colour="line">{'░'.repeat(10 - Math.round(pct / 10))}</Text></Text>
      </Box>
      {notice}
      <Box dir={besideSteps ? 'row' : 'column'} grow={1} minHeight={0} gap={besideSteps ? 1 : 0}>
        {list}
        <PageBody key={bodyKey} keep={bodyKey}>
          {hasAside && !besideAside ? <Disclosure title={asideTitle ?? ''}>{aside}</Disclosure> : null}
          {children}
          {summary !== undefined && !besideSummary && <Box dir="column" border borderColour="line" padX={1} shrink={0}>{summary}</Box>}
          {faq && <Faq faq={faq} titleLevel={2} />}
          {footNote}
        </PageBody>
        {/* Sized to its content: a bordered box in a row would otherwise stretch to the row's height (an empty frame). */}
        {besideSummary && <Box dir="column" width={ASIDE_W} alignSelf="start" border borderColour="line" padX={1} shrink={0}>{summary}</Box>}
        {besideAside && <Box dir="column" width={ASIDE_W} alignSelf="start" shrink={0} sem={{ role: 'complementary', ...(asideTitle ? { name: asideTitle } : {}) }}>{aside}</Box>}
      </Box>
      {footer && <Box dir="row" shrink={0} border={['top']} borderColour="line">{footer}</Box>}
    </Box>
  );
};
