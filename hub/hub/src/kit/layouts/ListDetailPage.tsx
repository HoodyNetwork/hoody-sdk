// List/detail. Two modes, chosen per page in its LAYOUT file:
//   fill: no selection = the list is a full-width table. A selection narrows the list to a
//         340 px pane in list presentation (resizable 280-560) and the detail fills the rest
//         (min 560). "Hide list" (key \) gives the detail the whole width (kept as ?list=0;
//         "Show list", in Hide list's place at the end of the header actions, brings it back).
//   side: the table stays full width; a selection opens a 440 px inspector on the right
//         (resizable 360-640) that follows the keyboard's active row. Esc closes it.
// There is never an empty detail pane. When the page's own width cannot hold both pane minimums
// (list 280 + separator + detail 560 = 846 px inside its padding) both modes become one pane: the
// list, or the detail with "‹ <page>". Above that, side mode keeps the inspector beside the table, which drops
// columns by priority for the room it has.
// The selection lives in the URL (?sel=<id> by default, or the page passes `selected` when it
// keeps it in the path), so Back and deep links work.
import { Children, type KeyboardEvent, type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { computerColor } from '@core';
import { Button, IconButton, cx } from '../controls/Button';
import { usePageShortcuts } from '../../shell/pageShortcuts';
import { rowContentSig, titledRowNeed, useContainerNarrow, useContentNarrow, useRowFit } from '../media';
import { useLocationHash, useSearchParam } from '../nav';
import { ActionMenu, type MenuEntry } from '../overlays/Overlays';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import { HeadingBelow } from './anatomy/Heading';
import { StateBody } from './anatomy/StateBody';
import type { EmptySpec, SectionState } from './anatomy/types';
import { Faq, type FaqSpec, isFaqHash } from './Faq';
import { PageHeader, type PageHeaderProps } from './PageHeader';
import { PaneSeparator, type PaneRange, useElementWidth, usePaneWidth } from './PaneSeparator';
import { type PageViews, ViewStrip } from './views';
import { DetailPaneContext, type DetailPane, ListPaneContext, type ListPane, useDetailPane } from './pane';
import lay from './Layouts.module.css';
import s from './ListDetailPage.module.css';

/** The selected item id from the URL and its setter (pushes a history entry unless `replace`). */
export function useSelection(param = 'sel'): [string | undefined, (id: string | undefined, opts?: { replace?: boolean }) => void] {
  const [value, set] = useSearchParam(param);
  const select = useCallback((id: string | undefined, opts?: { replace?: boolean }) => set(id, opts), [set]);
  return [value, select];
}

export interface ListDetailPageProps<K extends string = string> {
  /** Page header (title, actions, primary). */
  header?: PageHeaderProps;
  /** 'fill' for a rich object with tabs, 'side' for a light record. Default 'fill'. */
  mode?: 'fill' | 'side';
  /** Above the list: notices. Search and filters belong to the DataTable's own toolbar. */
  toolbar?: ReactNode;
  /** The page's view switch: under the header and above the banner, at the same place as a DetailPage's,
   * so the bar keeps its y when a switch changes the layout. */
  views?: PageViews<K>;
  /** Page-level notices: above both panes, outside the header and the list, so a selection in one-pane mode keeps them
   *. Object notices belong to the detail; the view switch is `views`. */
  banner?: ReactNode;
  list: ReactNode;
  /** The list pane's data state, the strict Section's contract (SectionState): while it is not ready the kit draws it
   * (StateBody) where `list` goes, or with the rows partial and stale kept; absent or ready shows `list`. */
  state?: SectionState;
  /** Required when the state can be empty. */
  empty?: EmptySpec;
  /** The page's questions: the end of the list pane, so the explanation exists with no selection
   * (an empty list too). It goes with the list when a selection or `?list=0` hides it. */
  faq?: FaqSpec;
  /** The detail of the selected item; null when nothing is selected. */
  detail: ReactNode | null;
  /** The selection when the page keeps it itself (path); default reads `selectionParam`. */
  selected?: string;
  /** Clears the selection; default removes `selectionParam` (replace). */
  onClose?: () => void;
  /** Side mode: the inspector follows the active row; default sets `selectionParam` (replace). */
  onFollow?: (id: string) => void;
  /** URL search parameter that holds the selection. */
  selectionParam?: string;
  /** Key under which the pane widths are remembered on this device. */
  storageKey?: string;
  /** Side mode: default inspector width (360-640, default 440; LAYOUT files set theirs). */
  inspectorWidth?: number;
  /** Fill mode: default list width beside the detail (280-560, default 340). */
  listWidth?: number;
  /** Actions pinned to the bottom of the detail or inspector: a sticky, flush footer
   * with a hairline above it. Primary last; the Outcome line goes on its start side. */
  detailFooter?: ReactNode;
  className?: string;
}

const LIST_MIN = 280;
/** Under this page width (list 280 + separator 6 + detail 560 - 1) it is one pane; as `ldpage` in the CSS. */
const STACK_MAX_PX = 845;
/** Under this content width a detail header wraps (ListDetailPage.module.css `.detailNarrow`, the `@container content (width < 600px)` line). */
const XS_PX = 600;
const LIST_MAX = 560;
/** The separator column, as --ld-sep in the CSS. */
const SEP = 6;
/** tokens.css --detail-min: the detail's least width in fill mode. */
const DETAIL_MIN = 560;

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

export function ListDetailPage<K extends string = string>({
  header,
  mode = 'fill',
  toolbar,
  views,
  banner,
  list,
  state,
  empty,
  faq,
  detail,
  selected: selectedProp,
  onClose,
  onFollow,
  selectionParam = 'sel',
  storageKey,
  inspectorWidth = 440,
  listWidth = 340,
  detailFooter,
  className,
}: ListDetailPageProps<K>) {
  const t = useStrings(kitStrings);
  const [selParam, setSel] = useSelection(selectionParam);
  const hasDetail = detail !== null && detail !== undefined;
  const selKey = selectedProp ?? selParam ?? (hasDetail ? '·' : undefined);
  const inspector = useMemo<PaneRange>(() => ({ min: 360, max: 640, def: Math.min(640, Math.max(360, inspectorWidth)) }), [inspectorWidth]);
  const listRange = useMemo<PaneRange>(() => ({ min: LIST_MIN, max: LIST_MAX, def: Math.min(LIST_MAX, Math.max(LIST_MIN, listWidth)) }), [listWidth]);
  const [listW, setListW] = usePaneWidth(storageKey, 'list', listRange);
  const [inspW, setInspW] = usePaneWidth(storageKey, 'inspector', inspector);
  const [listParam, setListParam] = useSearchParam('list');
  const listHidden = mode === 'fill' && hasDetail && listParam === '0';
  const listRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const splitW = useElementWidth(splitRef, hasDetail);
  // The CSS draws the inspector at most at the split's width less the list's least width and the
  // separator. The separator works from that drawn width (keys, drag, ARIA), so a saved width wider
  // than the room never makes it lag; the saved width itself is kept for a wider page.
  const inspRange = useMemo<PaneRange>(() => {
    if (splitW === undefined) return inspector;
    const room = Math.max(inspector.min, Math.min(inspector.max, splitW - LIST_MIN - SEP));
    return { min: inspector.min, max: room, def: Math.min(inspector.def, room) };
  }, [inspector, splitW]);
  const inspShown = Math.min(inspW, inspRange.max);
  // Fill: the list gives way first (the CSS keeps the detail's least width), and its handle works from what is drawn too.
  const listDrawRange = useMemo<PaneRange>(() => {
    if (splitW === undefined) return listRange;
    const room = Math.max(LIST_MIN, Math.min(LIST_MAX, splitW - DETAIL_MIN - SEP));
    return { min: LIST_MIN, max: room, def: Math.min(listRange.def, room) };
  }, [listRange, splitW]);
  const listShown = Math.min(listW, listDrawRange.max);

  const close = useCallback(() => (onClose ? onClose() : setSel(undefined, { replace: true })), [onClose, setSel]);
  const follow = useCallback((id: string) => (onFollow ? onFollow(id) : setSel(id, { replace: true })), [onFollow, setSel]);
  const toggleList = useCallback(() => setListParam(listHidden ? undefined : '0', { replace: true }), [listHidden, setListParam]);
  const focusActiveRow = useCallback(() => {
    const row = listRef.current?.querySelector<HTMLElement>('tr[tabindex="0"]') ?? listRef.current?.querySelector<HTMLElement>('[tabindex="0"]');
    row?.focus();
  }, []);

  // A new selection in fill mode moves focus to the detail title (unless focus is in the
  // detail already); a closed selection returns it to the list's active row.
  const prevKey = useRef(selKey);
  useEffect(() => {
    const before = prevKey.current;
    prevKey.current = selKey;
    if (before === selKey) return;
    if (selKey === undefined) {
      if (detailRef.current === null || !document.activeElement || document.activeElement === document.body) requestAnimationFrame(focusActiveRow);
      return;
    }
    if (mode !== 'fill') return;
    if (detailRef.current?.contains(document.activeElement)) return;
    requestAnimationFrame(() => detailRef.current?.querySelector<HTMLElement>('[data-hub-title]')?.focus({ preventScroll: true }));
  }, [selKey, mode, focusActiveRow]);

  // Phone footer with the on-screen keyboard open: the bottom bar is under the keyboard,
  // so the sticky footer follows the visual viewport's bottom edge instead and Save stays reachable.
  const hasFooter = hasDetail && detailFooter != null;
  useEffect(() => {
    const vv = window.visualViewport;
    const el = detailRef.current;
    if (!hasFooter || !vv || !el) return;
    const follow = () => {
      const covered = window.innerHeight - (vv.height + vv.offsetTop);
      if (covered > KEYBOARD_MIN) el.style.setProperty('--ld-footer-bottom', `${Math.round(covered)}px`);
      else el.style.removeProperty('--ld-footer-bottom');
    };
    follow();
    vv.addEventListener('resize', follow);
    vv.addEventListener('scroll', follow);
    return () => {
      vv.removeEventListener('resize', follow);
      vv.removeEventListener('scroll', follow);
      el.style.removeProperty('--ld-footer-bottom');
    };
  }, [hasFooter]);

  // Closing the detail shows the list again; a stale ?list=0 does not outlive it.
  useEffect(() => {
    if (!hasDetail && listParam !== undefined) setListParam(undefined, { replace: true });
  }, [hasDetail, listParam, setListParam]);

  // `\` hides or shows the list beside a fill-mode detail. A page key (usePageShortcuts): never under
  // an open dialog or in a field, and listed in the `?` sheet.
  usePageShortcuts([{ key: '\\', label: listHidden ? t('listDetail.showList') : t('listDetail.hideList'), run: toggleList, enabled: mode === 'fill' && hasDetail }]);

  // Esc: fill detail → back to the list row (selection kept); list → clear the
  // selection; side inspector → close. Keys from overlays (portals) are not ours.
  const onListKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !hasDetail || isTyping(e.target)) return;
    if (!(e.target instanceof Node) || !e.currentTarget.contains(e.target)) return;
    e.preventDefault();
    close();
  };
  const onDetailKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape' || e.defaultPrevented || isTyping(e.target)) return;
    if (!(e.target instanceof Node) || !e.currentTarget.contains(e.target)) return;
    e.preventDefault();
    // Fill mode goes back to the row only while the list shows beside the detail; with the list
    // hidden (`\`, or one pane when both pane minimums do not fit) there is no row to go to, so Esc closes, as in side mode.
    const list = listRef.current;
    const listShown = mode === 'fill' && !listHidden && list !== null && getComputedStyle(list).display !== 'none';
    if (listShown) focusActiveRow();
    else {
      close();
      requestAnimationFrame(focusActiveRow);
    }
  };

  // One pane under the page width that holds both minimums: the list is then the whole screen, on the same rail grid.
  const stacked = useContainerNarrow(STACK_MAX_PX + 1, splitRef);
  const listPane = useMemo<ListPane>(
    () => ({ list: true, ...(mode === 'fill' ? (hasDetail ? { presentation: 'list', rail: true } : stacked ? { rail: true } : {}) : hasDetail ? { follow } : {}) }),
    [mode, hasDetail, stacked, follow],
  );
  // A rail does not hold the questions: beside a detail the rows get the pane, and a FaqLink in the detail opens its
  // peek. A hash that targets them still draws them, so the link lands.
  const hash = useLocationHash();
  const faqShown = faq && (mode !== 'fill' || !hasDetail || isFaqHash(hash));
  const faqAsked = isFaqHash(hash);
  const detailPane = useMemo<DetailPane>(() => ({ mode, onePane: stacked, listHidden, toggleList, close }), [mode, stacked, listHidden, toggleList, close]);
  const title = typeof header?.title === 'string' ? header.title : undefined;
  const compact = mode === 'fill' && hasDetail;

  return (
    <div
      className={cx(s.page, s[mode], hasDetail && s.hasDetail, listHidden && s.listHidden, className)}
      style={{ ['--ld-list-w' as string]: `${listW}px`, ['--ld-insp-w' as string]: `${inspW}px` }}
    >
      {header && (
        <div className={s.header}>
          <PageHeader {...header} size={compact ? 'sm' : header.size} primaryAsFab={!hasDetail && header.primaryAsFab !== false} primaryQuiet={header.primaryQuiet} tabsFollow={header.tabsFollow ?? views !== undefined} />
        </div>
      )}
      {views && <ViewStrip views={views} className={s.views} />}
      {banner && <div className={cx(lay.noticeStack, s.banner)}>{banner}</div>}
      <div ref={splitRef} className={s.split}>
        <ListPaneContext.Provider value={listPane}>
          {/* Esc inside the list clears the selection; the rows own every other key. */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
          <section ref={listRef} className={s.list} aria-label={title} onKeyDown={onListKey}>
            {toolbar && <div className={cx(lay.noticeStack, s.listToolbar)}>{toolbar}</div>}
            {/* A location naming the questions: the rows give way (faqAsked, the CSS), so the question lands and stays in view
                however long the rows take to arrive. */}
            <div className={cx(s.listBody, faqAsked && s.faqAsked)}>
              <StateBody state={state} empty={empty} primary={undefined}>
                {list}
              </StateBody>
              {faqShown && (
                <div className={s.listFaq}>
                  <Faq faq={faq} titleLevel={3} />
                </div>
              )}
            </div>
          </section>
        </ListPaneContext.Provider>
        {hasDetail && mode === 'fill' && !listHidden && (
          <PaneSeparator className={s.handle} value={listShown} range={listDrawRange} onChange={setListW} dir={1} label={t('listDetail.resize')} />
        )}
        {hasDetail && mode === 'side' && <PaneSeparator className={s.handle} value={inspShown} range={inspRange} onChange={setInspW} dir={-1} label={t('listDetail.resizeInspector')} />}
        {hasDetail && (
          <DetailPaneContext.Provider value={detailPane}>
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
            <section ref={detailRef} className={s.detail} aria-label={t('listDetail.detail')} onKeyDown={onDetailKey}>
              <div className={s.detailScroll}>
                <div className={s.back}>
                  <Button variant="ghost" size="sm" icon="chevron-left" onPress={close}>
                    {title ?? t('listDetail.backToList')}
                  </Button>
                </div>
                {detail}
              </div>
              {detailFooter && <footer className={s.detailFooter}>{detailFooter}</footer>}
            </section>
          </DetailPaneContext.Provider>
        )}
      </div>
    </div>
  );
}

/** Less than this hidden under the visual viewport is browser chrome, not a keyboard. */
const KEYBOARD_MIN = 120;

export interface DetailHeaderProps {
  title: ReactNode;
  /** A mark that belongs WITH the name (a computer's colour mark, an avatar): drawn before the title on its line,
   *  centred on it, and kept beside it when the header stacks. Not a status (that is `status`) and not a control row. */
  leading?: ReactNode;
  /** One status pill next to the title. */
  status?: ReactNode;
  /** 1-3 meta chips (server, realm, project), each a link. */
  meta?: ReactNode;
  /** Primary plus up to 2 buttons, primary last. */
  actions?: ReactNode;
  /** Everything else, in the ⋯ menu: the last control of the header's end, after the pane control, drawn as a ghost
   * IconButton like it. */
  menu?: readonly MenuEntry[];
  /** The ⋯ menu's name ("Actions for atlas"); defaults to "More actions". */
  menuLabel?: string;
  /** The computer's colour: a 4 px band at the header's top edge, inside the header so the measured sticky height
   * includes it. Normalised here (a raw value never reaches a style); a missing or invalid colour draws nothing. Below
   * 600 px the header scrolls away, so the band is hidden and DetailPage's tab bar carries it instead. */
  accent?: string;
  className?: string;
}

/** Below this many px a detail's name is squeezed: the header stacks instead (name on its own line, actions under it). */
const DETAIL_TITLE_FLOOR = 200;
const detailHeadTitle = titledRowNeed(DETAIL_TITLE_FLOOR);
/** A chip wider than the title column runs under the actions without widening the row, which no scroll width sees: the
 * row lacks what the widest chip lacks, so the actions drop below the chips instead of painting over them. */
const detailHeadNeed = (el: HTMLElement): number => {
  const meta = el.querySelector<HTMLElement>(`.${s.detailMeta}`);
  const widest = meta ? Math.max(0, ...[...meta.children].map((c) => c.getBoundingClientRect().width)) : 0;
  return detailHeadTitle(el) + Math.max(0, Math.ceil(widest) - (meta?.clientWidth ?? 0));
};

/**
 * Tells the tab strip under a detail header how far down to stick: the header's height while it sticks, 0 while it
 * scrolls away (a phone pane, or a page that unsticks it). Written as --detail-head-live on the header's parent, the
 * box its tab strip sits in, and followed as the header wraps, stacks or changes height (a fixed
 * offset left a gap or an overlap).
 */
function useStickyHeight(ref: RefObject<HTMLElement | null>): void {
  // The value this header wrote last: cleanup removes only that, and gives back what the parent had before.
  const wrote = useRef<{ host: HTMLElement; value: string; before: string } | null>(null);
  const put = useCallback(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const value = `${getComputedStyle(el).position === 'sticky' ? el.offsetHeight : 0}px`;
    if (wrote.current?.host !== host) wrote.current = { host, value, before: host.style.getPropertyValue('--detail-head-live') };
    wrote.current.value = value;
    if (host.style.getPropertyValue('--detail-head-live') !== value) host.style.setProperty('--detail-head-live', value);
  }, [ref]);
  // After every commit: a header that stacked, or changed position by a class alone (no box resized), is read again.
  useLayoutEffect(() => put());
  useLayoutEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const stops: Array<() => void> = [];
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(put);
      ro.observe(el);
      // The pane crossing a width where the header stops sticking changes its position, not always its size.
      ro.observe(host);
      stops.push(() => ro.disconnect());
    } else {
      window.addEventListener('resize', put);
      stops.push(() => window.removeEventListener('resize', put));
    }
    return () => {
      stops.forEach((stop) => stop());
      const w = wrote.current;
      wrote.current = null;
      // Another header may have written since: its value stays.
      if (!w || w.host.style.getPropertyValue('--detail-head-live') !== w.value) return;
      if (w.before) w.host.style.setProperty('--detail-head-live', w.before);
      else w.host.style.removeProperty('--detail-head-live');
    };
  }, [ref, put]);
}

/** The 64 px header of a detail: name, status, meta chips, actions, then the
 * pane control: "Hide list" or "Show list" in a fill-mode pane (one place for both, so the name
 * always starts at the pane's inset), × in a side-mode inspector. It fits its own
 * width, not the page's: when the actions leave the name less than DETAIL_TITLE_FLOOR (or the
 * row overflows), the name takes its own line and wraps, and the actions go to the line below. */
export function DetailHeader({ title, leading, status, meta, actions, menu, menuLabel, accent, className }: DetailHeaderProps) {
  const t = useStrings(kitStrings);
  const pane = useDetailPane();
  const ref = useRef<HTMLElement>(null);
  const stacked = useRowFit(ref, 1, typeof title === 'string' ? title : '', true, detailHeadNeed, rowContentSig) === 1;
  const [anchor, narrow] = useContentNarrow(XS_PX);
  useStickyHeight(ref);
  const band = computerColor({ color: accent });
  // The end group (pane control, ⋯): drawn only with a control in it (one pane draws no pane control). On a wrapped
  // header (stacked, or under 600 px) it keeps the name row and the page's buttons go below, so it comes first in the
  // DOM there too and Tab follows what is seen; on one line it ends the header.
  const paneCtl = pane && !pane.onePane;
  const end =
    paneCtl || (menu && menu.length > 0) ? (
      <div className={s.detailEnd} data-detail-end="">
        {paneCtl && pane.mode === 'fill' && (
          <IconButton
            className={s.paneCtl}
            icon="sidebar-left"
            label={pane.listHidden ? t('listDetail.showList') : t('listDetail.hideList')}
            onPress={pane.toggleList}
            shortcut="\"
          />
        )}
        {paneCtl && pane.mode === 'side' && <IconButton className={s.paneCtl} icon="x" label={t('listDetail.close')} onPress={pane.close} shortcut="Esc" />}
        {menu && menu.length > 0 && <ActionMenu items={menu} label={menuLabel} plain />}
      </div>
    ) : null;
  const wrapped = stacked || narrow;
  return (
    <header
      ref={(el) => {
        ref.current = el;
        anchor(el);
      }}
      className={cx(s.detailHeader, stacked && s.detailStacked, narrow && s.detailNarrow, className)}
    >
      {band && <span className={s.detailAccent} aria-hidden="true" data-detail-accent={band} style={{ ['--computer' as string]: band }} />}
      <div className={s.detailTitles}>
        <div className={s.detailTitleLine}>
          {leading && (
            <span className={s.detailLeading} data-detail-leading="">
              {leading}
            </span>
          )}
          <h2 className={s.detailTitle} tabIndex={-1} data-hub-title="">
            {title}
          </h2>
          {status && <span className={s.detailStatus}>{status}</span>}
        </div>
        {meta && <div className={s.detailMeta}>{meta}</div>}
      </div>
      {wrapped && end}
      {actions && <div className={s.detailActions}>{actions}</div>}
      {!wrapped && end}
    </header>
  );
}

/** A detail's body inside a ListDetail pane: starts at the pane's inset, the same as the DetailHeader and tab strip
 * above it, so a page never pads its own. Kit parts inside it start flush. Its headings sit under the pane title (the
 * DetailHeader h2), so a section in it is an h3. */
export function DetailBody({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={cx(s.detailBody, className)}>
      <HeadingBelow level={2}>{children}</HeadingBelow>
    </div>
  );
}

export interface DetailFooterProps {
  /** What to know before acting (a balance short, a limit): a full-width line above the actions, never squeezed beside them. */
  notice?: ReactNode;
  /** The actions, primary last; they wrap, and each takes its own line in a narrow pane. None (a footer that only says
   *  why nothing can be done here) draws no action row. */
  children?: ReactNode;
}

/** The parts of a detail footer: pass it as ListDetailPage's `detailFooter` or DetailPage's `footer`. */
export function DetailFooter({ notice, children }: DetailFooterProps) {
  const hasActions = Children.toArray(children).length > 0;
  return (
    <div className={s.footerParts}>
      {notice && <div className={s.footerNotice}>{notice}</div>}
      {hasActions && <div className={s.footerActions}>{children}</div>}
    </div>
  );
}
