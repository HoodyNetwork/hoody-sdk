// List/detail in the terminal: the web's two modes and rules (ListDetailPage.tsx), in cells.
//   fill: no selection = the list fills. A selection narrows the list beside the detail (its width the web's px / 8,
//         kept in the same store) and `\` hides or shows it (?list=0). side: the list stays; a selection opens an
//         inspector on the end side that follows the list's active row (ListPane.follow).
//   Under BOTH_PANES_COLS of the page's own width it is one pane: the list, or the detail with "‹ <page>".
// The selection lives in the URL. Esc in the detail: back to the row in fill mode while the list shows beside it,
// else close; Esc in the list closes the detail. Opening a detail (fill, or one pane) moves the focus into it, onto its
// Back line. The pane handle (PaneSeparator) resizes with ←/→, Home/End, Enter.
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import type * as Web from './ListDetailPage';
import { IconButton } from '../controls/Button';
import { usePageShortcuts } from '../../shell/pageShortcuts';
import { useLocationHash, usePathname, useSearchParam } from '../nav';
import { ActionMenu } from '../overlays/Overlays';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import { Box, PaneSize, Scroll, Text, useBoxSize, useFocusControl, useFocusable, useKeys, usePaneSize, useTerminalSize, type FocusId } from '../../term/prim';
import { focusInk, type ScrollBoxRenderable } from '@term/kit';
import type { BoxRenderable } from '../../term/prim/otui';
import { DetailStickCtx, useSticky } from '../../term/jsx/sticky';
import { StateBody } from './anatomy/StateBody';
import { Faq, isFaqHash } from './Faq';
import { PageHeader } from './PageHeader';
import { PaneSeparator, usePaneWidth } from './PaneSeparator';
import { DetailPaneContext, ListPaneContext, useDetailPane, type DetailPane, type ListPane } from './pane';
import type { PaneRange } from './paneWidth';
import { BOTH_PANES_COLS, DETAIL_MIN_COLS, LIST_MIN_COLS, SHORT_ROWS } from './termBreaks';
import { Inline, QuestionsLast, useFocusSem, PageBlock } from './termParts';
import { PageBody, PageOutlet, useOutletClaim } from './termScroll';
import { ViewStrip } from './views';

export type { ListDetailPageProps, DetailHeaderProps, DetailFooterProps } from './ListDetailPage';

const CELL_PX = 8;
const LIST_MIN = 280;
const LIST_MAX = 560;

export const useSelection: typeof Web.useSelection = (param = 'sel') => {
  const [value, set] = useSearchParam(param);
  const select = useCallback((id: string | undefined, opts?: { replace?: boolean }) => set(id, opts), [set]);
  return [value, select];
};

/** The line at the top of a detail pane: "‹ <page>" back to the list. It takes the focus when the detail opens. */
function BackLine({ label, onPress, focusOn, taken }: { label: string; onPress: () => void; focusOn: string | undefined; taken: MutableRefObject<string | undefined> }): ReactNode {
  const f = useFocusable({ onKey: (k) => (k.name === 'return' || k.name === 'space' ? (onPress(), true) : false) });
  const seen = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (focusOn !== undefined && seen.current !== focusOn) { seen.current = focusOn; taken.current = focusOn; f.focus(); }
  }, [focusOn, f, taken]);
  const ref = useFocusSem(f, { role: 'button', name: label });
  return (
    <Box dir="row" boxRef={ref} shrink={0} onPress={() => { f.focus(); onPress(); }}>
      <Text colour="muted" {...focusInk(f.focused)}>‹ {label}</Text>
      <Text colour="faint">  Esc</Text>
    </Box>
  );
}

export const ListDetailPage = (<K extends string = string>({
  header, mode = 'fill', toolbar, views, banner, list, state, empty, faq, detail, selected: selectedProp, onClose, onFollow,
  selectionParam = 'sel', storageKey, inspectorWidth = 440, listWidth = 340, detailFooter,
}: Web.ListDetailPageProps<K>) => {
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
  const [size, onSize] = useBoxSize();
  const cols = size?.width ?? 0;
  // Before its own first layout the page decides from the pane it sits in (never "both" by default: a first frame
  // split in a 93-cell page, Computers detail at 120x40, was what settle() saw).
  const pane = usePaneSize();
  const termRows = useTerminalSize().height;
  const both = (size?.width ?? pane.cols) >= BOTH_PANES_COLS;
  // What sits above the panes (header, views, banner): taller than half the pane (an agent hint opened at 80x24), the
  // panes would keep a row or two. Then the page stands down from its claim and scrolls as one document instead.
  // The list's toolbar sits above the panes' rows too (Memory's realm band with its details open, its settings card): a
  // toolbar left out of this sum filled the list pane at 80x24 and cut the table under it to nothing.
  const [top, onTop] = useBoxSize();
  const [bar, onBar] = useBoxSize();
  const tallTop = top !== null && (top.height + (toolbar ? (bar?.height ?? 0) : 0)) * 2 > pane.rows;
  // The handle works from what is drawn (the web's rule): the room left after the other pane's least width.
  const inspRange = useMemo<PaneRange>(() => {
    if (!size) return inspector;
    const room = Math.max(inspector.min, Math.min(inspector.max, (cols - LIST_MIN_COLS - 1) * CELL_PX));
    return { min: inspector.min, max: room, def: Math.min(inspector.def, room) };
  }, [inspector, cols, size]);
  const listDrawRange = useMemo<PaneRange>(() => {
    if (!size) return listRange;
    const room = Math.max(LIST_MIN, Math.min(LIST_MAX, (cols - DETAIL_MIN_COLS - 1) * CELL_PX));
    return { min: LIST_MIN, max: room, def: Math.min(listRange.def, room) };
  }, [listRange, cols, size]);
  const inspShown = Math.min(inspW, inspRange.max);
  const listShown = Math.min(listW, listDrawRange.max);

  const close = useCallback(() => (onClose ? onClose() : setSel(undefined, { replace: true })), [onClose, setSel]);
  const follow = useCallback((id: string) => (onFollow ? onFollow(id) : setSel(id, { replace: true })), [onFollow, setSel]);
  const toggleList = useCallback(() => setListParam(listHidden ? undefined : '0', { replace: true }), [listHidden, setListParam]);
  // Closing the detail shows the list again; a stale ?list=0 does not outlive it.
  useEffect(() => {
    if (!hasDetail && listParam !== undefined) setListParam(undefined, { replace: true });
  }, [hasDetail, listParam, setListParam]);
  usePageShortcuts([{ key: '\\', label: listHidden ? t('listDetail.showList') : t('listDetail.hideList'), run: toggleList, enabled: mode === 'fill' && hasDetail && both }]);

  // The list pane and the detail pane bound themselves (the web's list-detail is a viewport-height layout): the shell's
  // outlet stands down, so the table fills the pane and scrolls itself, its pager on screen (termScroll useOutletClaim).
  useOutletClaim(!tallTop);
  const listShows = !hasDetail || (both && !listHidden);
  // Esc: a detail open closes, and the focus goes back to the row that opened it (above).
  useKeys((k) => {
    if (k.name !== 'escape' || !hasDetail) return false;
    close();
    return true;
  });
  // The web's useListPane restore: what had the focus when a detail opened (the row) gets it back when the detail
  // closes. Read while rendering the open, before the detail's own effects move the focus.
  const focusCtl = useFocusControl();
  const openedFrom = useRef<FocusId | null>(null);
  const seenOpen = useRef(hasDetail);
  if (hasDetail && !seenOpen.current) openedFrom.current = focusCtl.current();
  seenOpen.current = hasDetail;
  useEffect(() => {
    if (hasDetail || openedFrom.current === null) return;
    const id = openedFrom.current;
    openedFrom.current = null;
    focusCtl.restore(id);
  }, [hasDetail, focusCtl]);
  // By row identity too: one pane draws the list again on close (new focus ids), so the table is told which row.
  const [returnTo, setReturnTo] = useState<{ id: string; n: number } | undefined>(undefined);
  const lastSel = useRef<string | undefined>(selKey);
  useEffect(() => {
    const was = lastSel.current;
    lastSel.current = selKey;
    if (was !== undefined && was !== '·' && selKey === undefined) setReturnTo((r) => ({ id: was, n: (r?.n ?? 0) + 1 }));
  }, [selKey]);
  // Opening a detail in fill mode, or in one pane, moves the focus into it (side mode keeps it on the rows it follows).
  const [focusKey, setFocusKey] = useState<string | undefined>(undefined);
  // The detail whose opening already moved the focus (to the Back line or the title): when a resize swaps one for the
  // other, the one now drawn takes it over without scrolling (DetailHeader).
  const focusTaken = useRef<string | undefined>(undefined);
  const prevKey = useRef(selKey);
  useEffect(() => {
    const before = prevKey.current;
    prevKey.current = selKey;
    if (before === selKey || selKey === undefined) return;
    if (mode === 'fill' || !both) setFocusKey(`${selKey}`);
  }, [selKey, mode, both]);

  const hash = useLocationHash();
  const faqShown = faq && (mode !== 'fill' || !hasDetail || isFaqHash(hash));
  const listPane = useMemo<ListPane>(
    () => ({ list: true, ...(mode === 'fill' ? (hasDetail ? { presentation: 'list', rail: true } : !both ? { rail: true } : {}) : hasDetail ? { follow } : {}), ...(returnTo ? { returnTo } : {}) }),
    [mode, hasDetail, both, follow, returnTo],
  );
  // One pane (too narrow for both): the back line is the way out, so the detail header draws no pane control (as the web).
  const detailPane = useMemo<DetailPane>(() => ({ mode, onePane: !both, listHidden, toggleList, close }), [mode, both, listHidden, toggleList, close]);
  const title = typeof header?.title === 'string' ? header.title : undefined;
  const pathname = usePathname();
  const compact = mode === 'fill' && hasDetail;

  const listBox = (
    <ListPaneContext.Provider value={listPane}>
      {/* Each pane is a measured PaneSize: container questions inside it (useContainerNarrow, a table's columns) get the
          pane's room, not the terminal's. */}
      {/* Beside an inspector the list keeps one cell clear of the rule (its toolbar's end touched it: "View options│"). */}
      <PaneSize dir="column" grow={1} basis={0} minWidth={0} minHeight={0} clip hidden={!listShows} sem={{ role: 'region', ...(title ? { name: title } : {}) }}
        {...(hasDetail && mode === 'side' && both ? { pad: { right: 1 } } : {})}
        {...(hasDetail && mode === 'fill' && both ? { grow: 0, basis: Math.round(listShown / CELL_PX), width: Math.round(listShown / CELL_PX) } : {})}>
        {/* The page's toolbar block (a note, the stats) ends in one blank row before the list, as the page header does
            (none in a short terminal, SHORT_ROWS). */}
        {toolbar && <Box dir="column" shrink={0} onSize={onBar} {...(termRows >= SHORT_ROWS ? { pad: { bottom: 1 } } : {})}>{toolbar}</Box>}
        {/* With questions under it, the list pane scrolls as one document (the web's pane): the table takes the rows it
            has; under a short list the questions sit at the pane's bottom, in flow, and under a long one they follow it
            (the web's `.listFaq`). Without, the list fills the pane: a table that fills it scrolls
            itself (its pager on screen); a list taller than the pane that cannot shrink (Billing's servers: an overview
            over a table area with a minimum height) scrolls in the pane, as the web's pane does, so none of it is cut off. */}
        {tallTop ? (
          <>
            <StateBody state={state} empty={empty} primary={undefined}>{list}</StateBody>
            {faqShown && <Faq faq={faq} titleLevel={3} />}
          </>
        ) : faqShown ? (
          <PageBody keep={`${pathname}#list`}>
            <QuestionsLast faq={<Faq faq={faq} titleLevel={3} />}>
              <StateBody state={state} empty={empty} primary={undefined}>{list}</StateBody>
            </QuestionsLast>
          </PageBody>
        ) : (
          <FitOrScroll><StateBody state={state} empty={empty} primary={undefined}>{list}</StateBody></FitOrScroll>
        )}
      </PaneSize>
    </ListPaneContext.Provider>
  );
  // A plain detail scrolls whole in the outlet: its header and a sticky tab strip stay at the pane's top (the web's
  // sticky .detailHead and Tabs), so a long Bot thread never takes the Bot's name, state and actions off screen.
  // Not in a short terminal (SHORT_ROWS): at 80x24 a Bot's header and strip are 8 of the pane's 20 rows, and pinned
  // they left the thread 12 (the newest turn and an ask's card no longer fitted above the dock); there they scroll
  // away with the page, as before.
  const [headRows, setHeadRows] = useState(0);
  const sticks = termRows >= SHORT_ROWS;
  // The header's rows are kept in a short terminal too: growing the terminal in height alone turns sticking on without
  // a new size for the header, and a strip that then read 0 rows stuck over it.
  const stick = useMemo(() => ({ on: sticks, head: headRows, setHead: setHeadRows }), [sticks, headRows]);
  const detailBox = hasDetail && (
    <DetailPaneContext.Provider value={detailPane}>
      <FocusTitle.Provider value={both && !listHidden ? { key: focusKey, taken: focusTaken } : { key: undefined, taken: focusTaken }}>
      {/* A pane beside the list starts one cell after the rule (the web's --pane-inset): "│boreal-1" read as one word. */}
      <PaneSize dir="column" minHeight={0} minWidth={0} sem={{ role: 'region', name: t('listDetail.detail') }}
        {...(both && !listHidden ? { pad: { left: 1 } } : {})}
        {...(mode === 'side' && both ? { width: Math.round(inspShown / CELL_PX), shrink: 0, grow: 0 } : { grow: 1, basis: 0 })}>
        {/* "‹ <page>" when the detail is the only pane (the web's back row); a pane beside the list has its × / Hide list. */}
        {(!both || listHidden) && <BackLine label={title ?? t('listDetail.backToList')} onPress={close} focusOn={focusKey} taken={focusTaken} />}
        {/* The pane is an outlet, not a PageBody: a plain detail scrolls in it, and a DetailPage (its own header and
            PageBody) claims it, so the pane stands down to its height and the detail's body is the one scroll. A PageBody
            here held the DetailPage in auto-height content: header + a body as tall as the pane overflowed
            (computers and vault with a row open drew an all-thumb bar). */}
        <DetailStickCtx.Provider value={stick}>
          <PageOutlet {...(selKey ? { keep: `detail:${selKey}` } : {})}>{detail}</PageOutlet>
        </DetailStickCtx.Provider>
        {detailFooter && <Box dir="column" shrink={0} border={['top']} borderColour="line">{detailFooter}</Box>}
      </PaneSize>
      </FocusTitle.Provider>
    </DetailPaneContext.Provider>
  );
  return (
    <Box dir="column" grow={1} padX={1} minHeight={0}>
      <Box dir="column" shrink={0} onSize={onTop}>
        {header && <PageHeader {...header} size={compact ? 'sm' : header.size} primaryAsFab={false} />}
        {views && <PageBlock><ViewStrip views={views} /></PageBlock>}
        {banner}
      </Box>
      <Box dir="row" grow={1} minHeight={0} onSize={onSize}>
        {/* A list the detail covers stays mounted, hidden (the web hides its pane, it does not drop it): its rows, scroll and
            focus ids live on, so closing the detail returns the focus to the row it was opened from. */}
        {listBox}
        {hasDetail && both && !listHidden && mode === 'fill' && (
          <PaneSeparator value={listShown} range={listDrawRange} onChange={setListW} dir={1} label={t('listDetail.resize')} />
        )}
        {hasDetail && both && mode === 'side' && (
          <PaneSeparator value={inspShown} range={inspRange} onChange={setInspW} dir={-1} label={t('listDetail.resizeInspector')} />
        )}
        {detailBox}
      </Box>
    </Box>
  );
}) as typeof Web.ListDetailPage;

/** The list pane's body without questions. Bounded to the pane while its content fits (a table fills it and windows its
 *  rows, its pager on screen); once something in it reaches below the pane and cannot shrink (a no-shrink column, a
 *  minimum height: Billing's servers), the content takes its own height and the pane scrolls it, as the web's
 *  `overflow: auto` pane does. One Scroll either way (no remount when it switches): only its content's height and its
 *  scrolling change. Judged after each layout pass; a scroll box inside (a table that scrolls itself) is its own. */
function FitOrScroll({ children }: { children: ReactNode }): ReactNode {
  const ref = useRef<ScrollBoxRenderable | null>(null);
  // The pane height at which the content was found taller than the pane (null: bounded). It is judged again only when
  // the pane grows past it: a content height read in the frame of a switch still has the other mode's size.
  const [tallAt, setTallAt] = useState<number | null>(null);
  const tall = tallAt !== null;
  useLayoutEffect(() => {
    const r = ref.current;
    if (!r || r.isDestroyed) return;
    if (!tall) r.scrollTo(0);
    r.scrollY = tall;
    r.contentOptions = { flexDirection: 'column', height: tall ? 'auto' : '100%' };
  }, [tall]);
  useEffect(() => {
    const r = ref.current as (ScrollBoxRenderable & { onLifecyclePass?: (() => void) | null }) | null;
    if (!r) return;
    const pass = (): void => {
      if (r.isDestroyed) return;
      const view = r.viewport.height;
      if (view <= 0) return;
      // Tall: judged again (bounded) once the pane is taller than when it went tall (a bigger terminal).
      if (tallAt !== null) { if (view > tallAt) setTallAt(null); return; }
      // One pass decides: a resize may lay out only once or twice (counting passes in a row left a shrunk pane cut),
      // and a table's unwindowed first pass overflows only inside a fitting parent, never at this level.
      if (reachesBelow(r.content, r.content.y + view)) setTallAt(view);
    };
    const before = r.onLifecyclePass ?? null;
    r.onLifecyclePass = before ? () => { before(); pass(); } : pass;
    return () => { if (!r.isDestroyed) r.onLifecyclePass = before; };
  }, [tallAt]);
  return <Scroll dir="column" grow={1} minHeight={0} followFocus scrollRef={ref}>{children}</Scroll>;
}
/** Whether the list itself ends below `bottom`: a direct child of the pane's content reaches below it. Only the top
 *  level counts: a box that fits and holds something taller cuts it itself, and a table's first pass (before it windows
 *  its rows) overflows only inside parents that fit. An absolute box is an overlay. */
function reachesBelow(n: ScrollBoxRenderable['content'], bottom: number): boolean {
  for (const c of n.getChildren()) {
    // OpenTUI keeps a renderable's position type protected, with no getter: read as a value and only compared.
    if (Reflect.get(c, '_positionType') === 'absolute' || c.height <= 0 || c.y + c.height <= bottom) continue;
    return true;
  }
  return false;
}

/** Beside the list there is no Back line: the focus lands on the detail's title (DetailHeader), as on the web. */
const FocusTitle = createContext<{ key: string | undefined; taken: MutableRefObject<string | undefined> } | null>(null);

export const DetailHeader: typeof Web.DetailHeader = ({ title, status, meta, actions, menu }) => {
  const t = useStrings(kitStrings);
  const pane = useDetailPane();
  const handOff = useContext(FocusTitle);
  const focusOn = handOff?.key;
  // In a pane the title is the detail's first stop: opening a detail beside the list lands here (the web's h2 focus).
  const domId = useId();
  const f = useFocusable({ disabled: pane === null, domId });
  const fc = useFocusControl();
  const seen = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (focusOn === undefined || seen.current === focusOn || !handOff) return;
    seen.current = focusOn;
    // A resize that drops the Back line (the list comes back beside the detail) hands its focus here: the reader did not
    // move, so the detail's scroll stays where it was ('auto' never scrolls a following Scroll). An asked focus scrolled
    // the detail to its title: a Bot's Activity lost its end on 120x40 → 200x50.
    const handed = handOff.taken.current === focusOn;
    handOff.taken.current = focusOn;
    if (!handed || !fc.focusDomId(domId, 'auto')) f.focus();
  }, [focusOn, f, fc, domId, handOff]);
  const ref = useFocusSem(f, { role: 'heading', level: 2, ...(typeof title === 'string' || typeof title === 'number' ? { name: String(title) } : {}) });
  const stick = useContext(DetailStickCtx);
  const self = useRef<BoxRenderable | null>(null);
  useSticky(self, stick?.on ? { top: 0 } : undefined);
  return (
    <Box boxRef={self} dir="column" shrink={0} pad={{ bottom: 1 }}
      {...(stick ? { onSize: (_w: number, h: number) => stick.setHead(h) } : {})} {...(stick?.on ? { bg: 'bg' as const } : {})}>
      <Box dir="row" wrap gapX={2} justify="between">
        <Box dir="row" gap={2} shrink={1} boxRef={ref}>
          {typeof title === 'string' || typeof title === 'number' ? <Text bold colour="ink" {...focusInk(f.focused)}>{title}</Text> : title}
          {status}
        </Box>
        <Box dir="row" gap={1} shrink={0} align="center">
          {actions}
          {menu && menu.length > 0 && <ActionMenu items={menu} />}
          {pane && !pane.onePane && pane.mode === 'fill' && <IconButton icon="sidebar-left" label={pane.listHidden ? t('listDetail.showList') : t('listDetail.hideList')} onPress={pane.toggleList} shortcut="\" />}
          {pane && !pane.onePane && pane.mode === 'side' && <IconButton icon="x" label={t('listDetail.close')} onPress={pane.close} shortcut="Esc" />}
        </Box>
      </Box>
      {meta !== undefined && meta !== null && meta !== false && <Inline gap={1}>{meta}</Inline>}
    </Box>
  );
};

export const DetailBody: typeof Web.DetailBody = ({ children }) => <Box dir="column" gap={1}>{children}</Box>;

export const DetailFooter: typeof Web.DetailFooter = ({ notice, children }) => (
  <Box dir="column" shrink={0}>
    {notice && <Inline>{notice}</Inline>}
    <Box dir="row" gapX={2} wrap justify="end">{children}</Box>
  </Box>
);
