// The data table in the terminal: the same column definitions, DataView, row actions and groups as the web table
// (DataTable.tsx), drawn in cells.
//
// - Columns: the web's planner (DataTableLayout.planColumns) run in cells (DataTableTermLayout.ts): 'fit' columns
//   measure their words in cells (wide characters 2), columns drop by priority, the pinned one never. When the name,
//   status and one more column no longer fit (the web's rule), rows become the web's two-line list rows (planList).
//   Cards and icons are drawn as list rows: a card's slanted frame is paint, its fields are the list's fields.
// - Rows are virtual: only the lines in view are drawn (5,000 rows cost what 30 do), with a scrollbar at the end.
// - Values are separated by spaces, never by box-drawing glyphs, and the cursor bar, checkboxes and scrollbar are
//   marks the engine leaves out of a mouse selection, so a selected cell or row copies clean text.
// - Keys on the focused table: j/k or arrows move, Home/End, PageUp/PageDown, Enter (or o) opens, Space or x
//   selects (Shift+arrows extend), Esc clears a selection, . opens the row menu, Left/Right fold an expandable row,
//   a row action's own key runs it. Mouse: a click puts the cursor on a row, a click on the cursor row or a double
//   click opens it, the wheel scrolls.
import { flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable, type Cell, type CellContext, type ColumnDef, type Row, type SortingState, type VisibilityState } from '@tanstack/react-table';
import { Children, Fragment, createContext, isValidElement, cloneElement, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type * as Web from './DataTable';
import { Box, DefaultInk, OneLine, Scroll, Text, TextInput, useBoxSize, useInText, useFocusable, useKeys, useTerminalSize, type Colour, type Focusable, type Key } from '../../term/prim';
import { mergeRefs, useSem, type Sem } from '../../term/prim/semantics';
import { Pressable } from '../../term/prim';
import { useHoverFill } from '@term/kit';
import { TableMark } from '../../term/prim/TableMark';
import { searchFieldMounted } from '../../term/prim/searchPresence';
import { cellWidth, clipCells, cutCells, oneLine, type CellCut } from '../../term/prim/TableCells';
import { ClipRow, ClipText } from '../../term/prim/TableClip';
import { FlatLine } from '../../term/prim/FlatLine';
import { useTableHome } from '../../term/prim/TableHome';
import { useClipboard, type CopyFn } from '../../term/prim';
import { hostEnv } from '../../core/host-env';
import { useSearchParam } from '../nav';
import { useListPane } from '../layouts/pane';
import { SHORT_ROWS } from '../layouts/termBreaks';
import { useRegionRows, useScrollOwner } from '../layouts/termScroll';
import { pieces } from '../layouts/termParts';
import { hubKey } from '../../term/shell/hubKey';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import tableStrings from './DataTable.strings.en.json';
import { CHIP_FACETS_MAX, formatSort, pageSlice, parseSort, planList } from './DataTableLayout';
import { planTerm, keepInView, scrollBy, thumb, lineOffsets, windowOf, TIP_CELLS, PX_PER_CELL, type TermColumn } from './DataTableTermLayout';
import { splitActions, type RowAction, type RowActionEntry } from './DataTableActions';
import { flattenItems, groupParents, itemKey, type Item, type TableGroup } from './DataTableItems';
import { FilterChips, FiltersButton, isSegmentedFilter } from './FilterChips';
import { FilterRefocusCtx } from './filterRefocus';
import { ActionMenu } from '../overlays/Menu';
import { SoftPress } from '../controls/termPress';
import { InfoTip } from '../overlays/InfoTip';
import { Layer, useAnchor, useLayer } from '../../term/prim/Overlay';
import { withIcon } from './termIcons';
import { tableMark } from '../../term/prim/TableCheck';
import { NameStartCtx } from './listRow';
import { FlushHostCtx } from '../states/flushHost';
import { useFieldLock } from '../forms/lock';
import type { BoxRenderable, MouseEvent, ScrollBoxRenderable } from '../../term/prim/otui';

export type { TableGroup, RowAction, RowActionEntry, ToolbarAction, DataTableMarkTone, DataTableProps, RowActionState, RowActionSplit } from './DataTable';
export { splitActions } from './DataTableActions';
export { CHIP_FACETS_MAX } from './DataTableLayout';

type Meta = NonNullable<ColumnDef<unknown, unknown>['meta']>;
/** A column's cut rule (ColumnMeta.cut): a pill column (fitMetrics) is never cut, else as declared, else 'end'. */
const cutOf = (m: Pick<Meta, 'cut' | 'fitMetrics'> | undefined): CellCut => m?.cut ?? (m?.fitMetrics ? 'never' : 'end');
type It<T> = Item<T, Row<T>>;
/** The cells a fit column adds to its words. A pill column (fitMetrics) is drawn as the terminal StatusPill draws it:
 *  its mark and a space before the words (Display.term.tsx), so its words alone would cut its longest state. */
const PILL_LEAD_CELLS = 2;
const fitPadOf = (m: Pick<Meta, 'fitPad' | 'fitMetrics'>): number | undefined =>
  m.fitMetrics ? (m.fitPad ?? 0) + PILL_LEAD_CELLS * PX_PER_CELL : m.fitPad;

// The row menu is the kit ActionMenu (overlays/Menu.term) framed against the row's "⋯", as on the web: "." or a
// press on "⋯" opens it; its own keys (arrows, Enter, Esc) run it; closing hands the keys back to the table.
/** Cells before a row's values: the cursor bar, then the row's mark (rowMark) or a space. */
const LEAD = 2;
/** A marked row's mark (rowMark), in the cell after the cursor bar, so the cursor never hides it. The web's tinted edge
 *  has no cell of its own here; a dot in the tone's colour also reads in mono. Decoration: not in the row's name. */
const MARK = '•';
const MARK_COLOUR: Readonly<Record<Web.DataTableMarkTone, Colour>> = { acc: 'accText', ink: 'ink' };
/** A checkbox column: "[x]" and a space. */
const CHECK_W = 4;
/** Two clicks on one row within this many ms open it. */
const DOUBLE_MS = 400;
/** The group indent, as the web's --group-indent (cells). */
const INDENT = 2;
/** The most lines a table that does not fill its pane (one in a page that scrolls) shows at once; past it, it scrolls. */
const FLOW_ROWS_MAX = 30;
/** The fewest lines a flowing table keeps when it gives up rows so its footer stays on the page's first screen. */
const FLOW_ROWS_MIN = 5;

function colId<T>(c: ColumnDef<T, unknown>): string | undefined {
  return c.id ?? (c as { accessorKey?: string }).accessorKey;
}

function headerLabel<T>(c: ColumnDef<T, unknown>): string {
  return c.meta?.label ?? (typeof c.header === 'string' ? c.header : '');
}

function rowText(row: Row<unknown>): string {
  return row.getAllCells().map((c) => { const v = c.getValue(); return typeof v === 'string' || typeof v === 'number' ? String(v) : ''; }).join(' ').toLowerCase();
}

/** A column without its own `cell`: its value as one clean line. */
function textCell<T>(ctx: CellContext<T, unknown>): ReactNode {
  const v = ctx.renderValue();
  if (v === null || v === undefined) return null;
  return typeof v === 'string' ? oneLine(v) : ((v as { toString?: () => string }).toString?.() ?? null);
}

/** One stable component type for every function cell (the web's CellHost): a new `cell` function keeps the cell's
 *  hooks and focus. */
/** True inside a list-presentation row: a page's `data-lead-dup` mark (its copy of what the list's lead column draws,
 *  hidden there by the web's `.list [data-lead-dup]`) is left out, so a row never shows the lead twice ("█ █ atlas"). */
const InListRow = createContext(false);

/** `node` without its `data-lead-dup` subtrees, looking through raw elements and fragments (a component's own output
 *  is not seen: the attribute sits on the page's markup, as on the web). */
function withoutLeadDup(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(withoutLeadDup);
  if (!isValidElement(node)) return node;
  const props = node.props as { children?: ReactNode; 'data-lead-dup'?: unknown; tag?: unknown };
  // A raw tag: React's own string element, or the compat runtime's (jsx/jsx-runtime.ts: its props carry `tag` and `__ref`).
  const raw = typeof node.type === 'string' || (typeof props.tag === 'string' && '__ref' in props);
  if (raw && props['data-lead-dup'] !== undefined) return null;
  if (!raw && node.type !== Fragment) return node;
  if (props.children === undefined) return node;
  return cloneElement(node, undefined, ...Children.toArray(props.children).map(withoutLeadDup));
}

/** True when a cell's own root element carries the attribute (a page's `data-meta-wraps`, `data-rail-hide`). */
function rootHas(node: unknown, attr: string): boolean {
  return isValidElement(node) && (node.props as Record<string, unknown>)[attr] !== undefined;
}
/** Set around a list row's meta field: what the web's CSS reads off the field's markup there. `rail`: a field marked
 *  data-rail-hide draws nothing (`.rail .listItem:has([data-rail-hide])`). `wraps`: the field wraps, so plain words
 *  wrap too. `onPageWraps`: the cell says whether the page marked it data-meta-wraps. */
const MetaFieldCtx = createContext<{ rail: boolean; wraps: boolean; onPageWraps: (id: string, on: boolean) => void } | null>(null);

function CellHost<T>({ render, ctx }: { render: (ctx: CellContext<T, unknown>) => ReactNode; ctx: CellContext<T, unknown> }) {
  const listRow = useContext(InListRow);
  const field = useContext(MetaFieldCtx);
  const out = listRow ? withoutLeadDup(render(ctx)) : render(ctx);
  const inText = useInText();
  const pageWraps = field !== null && rootHas(out, 'data-meta-wraps');
  const tell = field?.onPageWraps;
  const colId = ctx.column.id;
  useEffect(() => { tell?.(colId, pageWraps); }, [tell, colId, pageWraps]);
  if (field?.rail && rootHas(out, 'data-rail-hide')) return null;
  // A cell function that answers plain words: a Text of its own, so it takes the row's ink (a list row's dim meta line)
  // and, outside running text, is cut at its end with one "…" like any string cell.
  // A fragment of words and parts ("80% " + a Meter, AI allowance): its pieces as ONE row that never wraps or shrinks,
  // adjacent words joined into one Text, so the cell's ClipRow cuts the whole row at its edge with one "…". Left as
  // loose children, each word was its own box: they wrapped in one-cell boxes and drew over the part beside them.
  const ps = typeof out === 'string' || typeof out === 'number' ? [out] : pieces(out);
  if (ps.length > 0 && ps.every((x) => typeof x === 'string' || typeof x === 'number')) {
    const words = oneLine(ps.join(''));
    if (words === '') return null;
    return inText || field?.wraps ? <Text>{words}</Text> : <ClipText text={words} grow={false} />;
  }
  if (!inText && !field?.wraps && ps.length > 1 && ps.some((x) => typeof x === 'string' || typeof x === 'number')) {
    const row: ReactNode[] = [];
    let words = '';
    const flush = () => { if (words !== '') row.push(<Text key={`w${row.length}`} shrink={0}>{oneLine(words)}</Text>); words = ''; };
    for (const x of ps) {
      if (typeof x === 'string' || typeof x === 'number') { words += String(x); continue; }
      flush();
      row.push(isValidElement(x) && x.key === null ? cloneElement(x, { key: `p${row.length}` }) : x);
    }
    flush();
    return <Box dir="row" shrink={0}>{row}</Box>;
  }
  return <>{out}</>;
}
function renderColumnCell<T>(cell: Cell<T, unknown>): ReactNode {
  const def = cell.column.columnDef.cell;
  const ctx = cell.getContext();
  if (typeof def === 'function' && !(def.prototype && 'isReactComponent' in def.prototype)) {
    return <CellHost<T> key={`${cell.column.id}\u0000${cell.column.columnDef.meta?.cellKey ?? ''}`} render={def as (c: CellContext<T, unknown>) => ReactNode} ctx={ctx} />;
  }
  return flexRender(def, ctx);
}

interface Stored { hidden?: string[]; shown?: string[]; collapsed?: string[]; grouped?: boolean; density?: 'normal' | 'compact' }
function readStored(key: string | undefined): Stored {
  if (!key) return {};
  try {
    const v: unknown = JSON.parse(hostEnv().local?.getItem(`hub.v3.table.${key}`) ?? '{}');
    if (!v || typeof v !== 'object') return {};
    const o = v as Record<string, unknown>;
    const ids = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === 'string') : undefined);
    return { hidden: ids(o.hidden), shown: ids(o.shown), collapsed: ids(o.collapsed), grouped: typeof o.grouped === 'boolean' ? o.grouped : undefined, density: o.density === 'compact' || o.density === 'normal' ? o.density : undefined };
  } catch {
    return {};
  }
}
function writeStored(key: string | undefined, v: Stored): void {
  if (!key) return;
  try {
    const store = hostEnv().local;
    if (!store) return;
    // Density is the web's own choice: keep what the web stored there.
    const old = JSON.parse(store.getItem(`hub.v3.table.${key}`) ?? '{}') as Record<string, unknown>;
    store.setItem(`hub.v3.table.${key}`, JSON.stringify({ ...old, ...v }));
  } catch {
    /* not remembered */
  }
}

/** A row action run outside a menu: a copy item copies (OSC 52, the caller's renderer-bound copy) and then acts. */
function runAction(a: RowAction, copy: CopyFn): void {
  if (a.isDisabled) return;
  if (a.copy !== undefined) {
    if (copy(a.copy)) a.onAction();
    return;
  }
  a.onAction();
}

const isSpace = (k: Key) => k.name === 'space' || k.sequence === ' ';
const isPress = (k: Key) => k.name === 'return' || k.name === 'linefeed' || isSpace(k);

/** The toolbar note, never taller than `cap` lines: past that it scrolls on its own, so a stack of notices cannot push
 *  the rows off the screen (the web's `.toolbarNote:has([data-band-flush])`: max-block-size 30dvh, overflow-y auto).
 *  A note within the cap is drawn as it always was; only one that passes it moves into the scrolling box. */
function NoteCap({ cap, children }: { cap: number; children: ReactNode }): ReactElement {
  const [over, setOver] = useState(false);
  if (!over) return <Box dir="column" shrink={0} onSize={(_w: number, h: number) => { if (h > cap) setOver(true); }}>{children}</Box>;
  return (
    <Scroll dir="column" height={cap} shrink={0} followFocus>
      <Box dir="column" shrink={0} onSize={(_w: number, h: number) => { if (h > 0 && h <= cap) setOver(false); }}>{children}</Box>
    </Scroll>
  );
}

/** A focusable word in the table's chrome (a header, a toolbar button, a pager arrow). */
function Word({ label, onPress, disabled, colour, bold, mark, width, align, sem }: { label: string; onPress: () => void; disabled?: boolean; colour?: Colour; bold?: boolean; mark?: string; width?: number; align?: 'start' | 'end'; sem?: Sem }) {
  const f = useFocusable({ disabled, onKey: (k) => { if (isPress(k)) { onPress(); return true; } return false; } });
  const semRef = useSem({ role: 'button', name: label.replace(/^\[(.*)\]$/, '$1'), disabled, ...sem }, { role: 'button', focus: f, disabled });
  const ref = useMemo(() => mergeRefs(f.ref, semRef), [f.ref, semRef]);
  const hover = useHoverFill(disabled === true, f.focused);
  return (
    <Box dir="row" boxRef={ref} onPress={disabled ? undefined : () => { f.focus(); onPress(); }} shrink={0} {...(width !== undefined ? { width, justify: align === 'end' ? 'end' as const : 'start' as const } : {})} bg={f.focused ? 'selected' : hover.bg} raw={hover.raw} clip>
      <Text colour={disabled ? 'faint' : f.focused ? 'ink' : (colour ?? 'muted')} bold={bold} underline={f.focused} truncate>{label}</Text>
      {mark !== undefined && <TableMark colour="blueText">{mark}</TableMark>}
    </Box>
  );
}

/** A row's inline action, on or off, as ONE control, so it keeps its node (and the focus) when it turns off while its
 *  send is out, and back (a Word when on and another control when off was a new one at each change: the focused
 *  "[Shut down]" lost the focus the moment its press turned it off). On: drawn as a Word (its colour; the selected
 *  ground and ink while focused). Off with a reason (RowAction `disabledReason`): as the web's soft-disabled button it
 *  keeps its place in the Tab order, does nothing on a press, and shows its reason while it has the focus; a reader gets
 *  the reason as its description. A short word's reason starts with the whole name ("Start win11. …"), as the web's tip
 *  does. Off without a reason: faint and skipped by Tab. */
function InlineWord({ label, off, reason, colour, onPress }: { label: string; off: boolean; reason: string | undefined; colour: Colour; onPress: () => void }) {
  const soft = off && reason !== undefined;
  return (
    <SoftPress off={off} soft={soft} reason={soft ? reason : undefined} onPress={onPress} sem={{ role: 'button', name: label.replace(/^\[(.*)\]$/, '$1') }}>
      {({ focused }) => (
        <Box dir="row" shrink={0} bg={!off && focused ? 'selected' : undefined} clip>
          <Text colour={off ? 'faint' : focused ? 'ink' : colour} underline={focused} truncate>{label}</Text>
        </Box>
      )}
    </SoftPress>
  );
}

/** A dropdown panel of focusable lines (the view menu): Up/Down move, Enter or Space picks, Esc closes. */
interface Line { id: string; label: string; on?: boolean; check?: 'box' | 'radio'; head?: boolean; disabled?: boolean; onPick?: () => void }
/** The panel's lines by index: each line writes its own slot on every render (a line re-renders alone when its focus
 *  changes), so a move finds the line it starts from; a head or disabled line leaves its slot empty. */
type Slots = (Focusable | undefined)[];
function MenuLine({ line, at, first, list, onClose }: { line: Line; at: number; first: boolean; list: Slots; onClose: () => void }) {
  const f = useFocusable({
    disabled: line.disabled,
    onKey: (k) => {
      if (isPress(k)) { line.onPick?.(); return true; }
      if (k.name === 'escape') { onClose(); return true; }
      if (k.name === 'down' || k.name === 'up' || k.name === 'j' || k.name === 'k') {
        const step = k.name === 'down' || k.name === 'j' ? 1 : -1;
        for (let n = 1; n < list.length; n++) {
          const next = list[(at + step * n + list.length * n) % list.length];
          if (next) { next.focus(); break; }
        }
        return true;
      }
      return false;
    },
  });
  list[at] = line.disabled ? undefined : f;
  useEffect(() => { if (first) f.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const mark = line.check === 'box' ? (line.on ? '[x] ' : '[ ] ') : line.check === 'radio' ? (line.on ? '(•) ' : '( ) ') : '    ';
  return (
    <Box dir="row" boxRef={f.ref} onPress={line.disabled ? undefined : () => { f.focus(); line.onPick?.(); }} bg={f.focused ? 'selected' : undefined}>
      <TableMark colour="blueText" width={2}>{f.focused ? '▸' : ' '}</TableMark>
      <TableMark colour="ok">{mark}</TableMark>
      <Text colour={line.disabled ? 'faint' : f.focused ? 'ink' : 'muted'}>{line.label}</Text>
    </Box>
  );
}
function MenuPanel({ lines, onClose }: { lines: readonly Line[]; onClose: () => void }) {
  const list = useRef<Slots>([]).current;
  list.length = lines.length;
  const firstPick = lines.findIndex((l) => !l.head && !l.disabled);
  // A panel taller than the screen's room scrolls, and the focused line is always scrolled into view: a line the
  // screen cuts off is never focused unseen, so it can never be picked unseen.
  // A pick that adds or moves lines (a shown column joins "Sort by") keeps the focused line in view too.
  const room = useLayer()?.room;
  const scroll = useRef<ScrollBoxRenderable | null>(null);
  useEffect(() => {
    const node = list.find((x) => x?.focused)?.ref.current;
    if (node && scroll.current) { try { scroll.current.scrollChildIntoView(node, { align: 'nearest' }); } catch { /* gone mid-scroll */ } }
  });
  return (
    <Scroll dir="column" followFocus scrollRef={scroll} {...(room !== undefined ? { maxHeight: room } : {})}>
      {lines.map((l, i) => {
        if (!l.head) return <MenuLine key={l.id} line={l} at={i} first={i === firstPick} list={list} onClose={onClose} />;
        list[i] = undefined;
        return <Text key={l.id} colour="faint" bold>{l.label}</Text>;
      })}
    </Scroll>
  );
}

function DataTableTerm<T>(props: Web.DataTableProps<T>): ReactElement {
  const view = props.view;
  const {
    label, columns, onRetry, errorBody, empty, noMatch, searchParam = 'q', searchText, countLabel, onActiveChange, selectable, bulkActions,
    actions, toolbarEnd, toolbarActions, toolbarNote, presentChoice, onRefresh, storageKey, initialSort, noViewMenu,
    presentation = 'auto', groupBy: ownGroupBy, groupToggle, groups: ownGroups, collapsedGroups, onCollapsedGroupsChange,
    renderExpanded, canExpand, pageParam = 'page', totalOrder = 'first', loadingMore, fill: fillProp, bare, openRow: openAsk, onRowOpened, rowMark,
  } = props;
  const pane = useListPane();
  const home = useTableHome();
  const clip = useClipboard();
  // Inside a scrolling page body (a list pane with a FAQ under it) the table is as tall as its rows, never the viewport:
  // the page scrolls, as on the web. Elsewhere it fills its pane.
  const scrollOwner = useScrollOwner();
  const fill = fillProp ?? scrollOwner === null;
  const t = useStrings(kitStrings);
  const tt = useStrings(tableStrings);
  // A view supplies the data and every piece of state; the plain props stay for simple tables (as the web).
  const data = view ? (view.hasData && (view.rows.length > 0 || !view.isLoading) ? view.rows : undefined) : props.data;
  const getRowId = props.getRowId ?? view?.getRowId ?? ((r: T) => String((r as { id?: unknown }).id));
  const isLoading = view ? view.isLoading : props.isLoading;
  const error = view ? view.error : props.error;
  const search = view ? (props.search === false || !view.searchable ? false : (props.search ?? true)) : props.search;
  const filters = view ? view.chips : props.filters;
  const activeId = props.activeId ?? view?.activeId;
  const pickOne = selectable === 'pickOne';
  const onRowAction = props.onRowAction === false || selectable === 'pick' || pickOne ? undefined : (props.onRowAction ?? (view ? (r: T) => view.open(getRowId(r)) : undefined));
  const pick = Boolean(selectable) && !onRowAction;
  const selectedIds = props.selectedIds ?? (selectable ? view?.selected : undefined);
  const onSelectionChange = props.onSelectionChange ?? view?.setSelected;
  const pageSize = view ? undefined : props.pageSize;
  const viewGroups = ownGroupBy || ownGroups ? undefined : view?.groups;
  const groupBy = ownGroupBy ?? (viewGroups ? view?.groupOf : undefined);
  const groups = useMemo<readonly TableGroup[] | undefined>(() => ownGroups ?? viewGroups?.map((g) => ({ id: g.id, label: g.label, count: g.count })), [ownGroups, viewGroups]);
  const parents = useMemo(() => (viewGroups ? undefined : groupParents(groups)), [groups, viewGroups]);
  const total = view ? (props.total ?? (view.matched > view.rows.length ? view.matched : undefined)) : props.total;
  const serverMore = view ? !view.canShowMore && props.onLoadMore !== undefined && total !== undefined && view.total < total : false;
  const onLoadMore = view ? (view.canShowMore ? view.showMore : serverMore ? props.onLoadMore : undefined) : props.onLoadMore;
  const stored = useMemo(() => readStored(storageKey), [storageKey]);

  const [urlQuery, setUrlQuery] = useSearchParam(view ? '__noq' : searchParam);
  const query = view ? view.q : urlQuery;
  const setQuery = useCallback((v: string | undefined) => (view ? view.setQ(v ?? '') : setUrlQuery(v === '' ? undefined : v, { replace: true })), [view, setUrlQuery]);
  // What the search field shows: the person's own text at once, while the URL (or the data view) catches up a render
  // later. Keys arrive faster than a navigation lands; a field bound to the URL alone would be reset to the old value
  // between two keys (a paste, fast typing). A query changed from elsewhere (Back, a link, Clear all) replaces it.
  const [draft, setDraft] = useState(query ?? '');
  const pushed = useRef(query ?? '');
  if ((query ?? '') !== pushed.current) { pushed.current = query ?? ''; if (draft !== pushed.current) setDraft(pushed.current); }
  const typeQuery = (q: string) => { setDraft(q); pushed.current = q; setQuery(q); };
  const sortParam = view ? false : (props.sortParam ?? (bare ? false : 'sort'));
  const [sortUrl, setSortUrl] = useSearchParam(sortParam || '__nosort');
  const [pageUrl, setPageUrl] = useSearchParam(pageSize ? pageParam : '__nopage');
  const listOnly = useMemo(() => new Set(columns.filter((c) => c.meta?.table === false).map((c) => colId(c as ColumnDef<T, unknown>)).filter((x): x is string => x !== undefined)), [columns]);
  const knownIds = useMemo(() => new Set(columns.map((c) => colId(c as ColumnDef<T, unknown>)).filter((x): x is string => x !== undefined && !listOnly.has(x))), [columns, listOnly]);
  const [sortLocal, setSortLocal] = useState<SortingState>(initialSort ?? []);
  const viewSort = view?.sort;
  const sorting = useMemo<SortingState>(() => {
    const known = (s: SortingState): SortingState => (listOnly.size ? s.filter((x) => !listOnly.has(x.id)) : s);
    if (view) return viewSort ? known([viewSort]) : [];
    if (!sortParam) return known(sortLocal);
    return sortUrl === undefined ? known(initialSort ?? []) : parseSort(sortUrl, knownIds);
  }, [view, viewSort, sortParam, sortLocal, sortUrl, initialSort, knownIds, listOnly]);
  const setSorting = useCallback((updater: SortingState | ((old: SortingState) => SortingState)) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater;
    if (view) view.setSort(next[0] ? { id: next[0].id, desc: next[0].desc } : undefined);
    else if (sortParam) setSortUrl(formatSort(next), { replace: true });
    else setSortLocal(next);
  }, [view, sorting, sortParam, setSortUrl]);
  const [visibility, setVisibility] = useState<VisibilityState>(() => {
    const v: VisibilityState = {};
    for (const c of columns) { const id = colId(c as ColumnDef<T, unknown>); if (id && c.meta?.defaultHidden) v[id] = false; }
    const pinned = new Set(columns.filter((c) => c.meta?.pinned).map((c) => colId(c as ColumnDef<T, unknown>)));
    for (const id of stored.hidden ?? []) if (!pinned.has(id)) v[id] = false;
    for (const id of stored.shown ?? []) v[id] = true;
    return v;
  });
  const [ownCollapsed, setOwnCollapsed] = useState<Set<string>>(() => new Set(stored.collapsed ?? (groups ?? []).filter((g) => g.defaultCollapsed).map((g) => g.id)));
  const collapsed = useMemo(() => (collapsedGroups ? new Set(collapsedGroups) : ownCollapsed), [collapsedGroups, ownCollapsed]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [listSelecting, setListSelecting] = useState(false);
  const [groupedPref, setGroupedPref] = useState<boolean>(stored.grouped ?? groupToggle?.defaultOn ?? true);
  const grouped = groupToggle ? groupedPref : true;
  useEffect(() => {
    const hidden = Object.entries(visibility).filter(([, v]) => !v).map(([k]) => k);
    const shown = Object.entries(visibility).filter(([, v]) => v).map(([k]) => k);
    writeStored(storageKey, { hidden, shown, collapsed: [...ownCollapsed], grouped: groupToggle ? groupedPref : undefined });
  }, [storageKey, visibility, ownCollapsed, groupToggle, groupedPref]);

  const rows = useMemo(() => (data ?? []) as T[], [data]);
  const table = useReactTable<T>({
    data: rows,
    columns,
    getRowId: (r) => getRowId(r),
    defaultColumn: { cell: textCell },
    state: { sorting, globalFilter: view ? '' : (query ?? ''), columnVisibility: visibility },
    manualSorting: Boolean(view),
    manualFiltering: Boolean(view),
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    globalFilterFn: (row, _col, value: string) => {
      const needle = value.trim().toLowerCase();
      if (!needle) return true;
      const hay = searchText ? searchText(row.original).toLowerCase() : rowText(row as Row<unknown>);
      return needle.split(/\s+/).every((w) => hay.includes(w));
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });
  const filteredRows = table.getRowModel().rows;
  const slice = useMemo(() => (pageSize ? pageSlice(filteredRows.length, pageSize, Number(pageUrl ?? '1')) : null), [filteredRows.length, pageSize, pageUrl]);
  const visibleRows = useMemo(() => (slice ? filteredRows.slice(slice.start, slice.end) : filteredRows), [filteredRows, slice]);
  const filterKey = `${query ?? ''}|${(filters ?? []).map((f) => f.value ?? '').join('|')}`;
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    if (pageSize && pageUrl !== undefined) setPageUrl(undefined, { replace: true });
  }, [filterKey, pageSize, pageUrl, setPageUrl]);

  // Row actions, split once (DataTableActions.splitActions). A terminal has no hover: hover icons stay in the menu, the
  // inline action shows, the row's own open is the row (Enter, a click).
  const actionMap = useMemo(() => {
    const m = new Map<string, readonly RowActionEntry[]>();
    if (actions) for (const r of visibleRows) m.set(r.id, actions(r.original));
    return m;
  }, [actions, visibleRows]);
  const splitOf = useCallback((id: string, presentation: 'table' | 'list') => splitActions(actionMap.get(id) ?? [], { presentation, pointer: 'fine', rowFocused: false, hovered: false }), [actionMap]);
  const rowOpenOf = (row: Row<T>): RowAction | undefined => (actions ? (actionMap.get(row.id) ?? []).find((a): a is RowAction => a !== '-' && a.rowOpen === true) : undefined);
  const openRow = (row: Row<T>) => {
    const own = rowOpenOf(row);
    if (own) { runAction(own, clip.copy); return; }
    if (onRowAction) onRowAction(row.original);
  };
  /** A row's menu entries: the split's menu. */
  // The row menu with its group separators ('-'), as the web draws them: none first, last or doubled.
  const menuListOf = useCallback((row: Row<T>): (RowAction | '-')[] => {
    const raw = (actions ? splitOf(row.id, 'table').menu : []) as (RowAction | '-')[];
    const out: (RowAction | '-')[] = [];
    for (const e of raw) if (e !== '-' || (out.length > 0 && out[out.length - 1] !== '-')) out.push(e);
    while (out[out.length - 1] === '-') out.pop();
    return out;
  }, [actions, splitOf]);
  const menuOf = useCallback((row: Row<T>): RowAction[] => menuListOf(row).filter((e): e is RowAction => e !== '-'), [menuListOf]);
  const inlineOf = useCallback((row: Row<T>): RowAction | undefined => (actions ? splitOf(row.id, 'table').shown.find((a) => a.inline) : undefined), [actions, splitOf]);
  // The actions cell: the widest inline word ("[Start] ") plus the ⋯.
  const actionsWidth = useMemo(() => {
    if (!actions) return 0;
    let inline = 0;
    let menu = false;
    for (const id of actionMap.keys()) {
      const s = splitOf(id, 'table');
      const first = s.shown.find((a) => a.inline);
      if (first) inline = Math.max(inline, cellWidth(first.short ?? first.label) + 3);
      menu ||= s.menu.length > 0;
    }
    return inline + (menu ? 2 : 0);
  }, [actions, actionMap, splitOf]);

  // The room the table has (its own laid-out width), its body's height.
  const [size, onSize] = useBoxSize();
  const [bodySize, onBodySize] = useBoxSize();
  // A table that flows in a page scroll keeps its footer (the pager, Show more) on the page's first screen: its rows
  // window gives up the rows that would push the footer below the region's bottom (Bots at 120x40: "1–20 of 23 ‹ ›"
  // sat under the fold). `above`: the rows window's offset from the top of the scrolled content, measured after layout.
  const regionRows = useRegionRows();
  const bodyNode = useRef<BoxRenderable>(null);
  const [above, setAbove] = useState<number | null>(null);
  const measureAbove = useCallback(() => {
    const n = bodyNode.current;
    if (!n) return;
    type Up = { viewport?: unknown; content?: { y: number }; parent?: Up | null };
    let p = n.parent as Up | null;
    while (p && !p.viewport) p = p.parent ?? null;
    const top = p?.content ? n.y - p.content.y : null;
    setAbove((a) => (a === top ? a : top));
  }, []);
  const onBody = useCallback((w: number, h: number) => { onBodySize(w, h); measureAbove(); }, [onBodySize, measureAbove]);
  const width = size?.width ?? 100;
  const leafs = table.getAllLeafColumns();
  const statusId = leafs.find((c) => c.columnDef.meta?.list === 'status')?.id;
  const fitRows = table.getFilteredRowModel().rows;
  const indent = groupBy && groups?.length && grouped ? (parents ? 2 * INDENT : INDENT) : 0;
  // Each element column's widest drawn cell (ClipRow's natural width), for this row set: a fixed-px column grows to it
  // from slack (DataTableTermLayout growFixed). Only ever raised for one row set; a new row set starts over, and every
  // drawn cell measures again for it (ClipRow `remeasure` is this callback, which changes with the row set). The row
  // set is its row ids, not the rows array: a page that rebuilds its rows on every render (ai's connect flow, polling)
  // gave a new array each time, so each report cleared the wants, re-rendered and re-armed every cell's measure (an
  // endless 0 ms timer: the page never settled); a refetch with the same rows keeps what was measured.
  // Before a filling table knows its height it draws rows for a guessed one (20 lines); the rows past its real height
  // are dropped at the first measure. Whether such a row reported its width before it went was a matter of timing (one
  // tree drew Notifications' Level column 9 or 11 cells wide). What is heard before the height is known is filed
  // apart and dropped with the guess: the rows that stay measure again (the callback changes).
  const guessed = fill && bodySize === null;
  const rowSet = useMemo(() => (guessed ? '\u0001' : '') + fitRows.map((r) => r.id).join('\u0000'), [fitRows, guessed]);
  const [wants, setWants] = useState<{ rows: string | null; m: ReadonlyMap<string, number> }>({ rows: null, m: new Map() });
  const reportWant = useCallback((id: string, n: number) => setWants((w) => {
    const m = w.rows === rowSet ? w.m : new Map<string, number>();
    if ((m.get(id) ?? -1) >= n && w.rows === rowSet) return w;
    return { rows: rowSet, m: new Map(m).set(id, Math.max(n, m.get(id) ?? 0)) };
  }), [rowSet]);
  const plan = useMemo(() => {
    const cols: TermColumn[] = [];
    for (const c of leafs) {
      const meta = (c.columnDef.meta ?? {}) as Meta;
      if (visibility[c.id] === false || meta.table === false) continue;
      const tc: TermColumn = { id: c.id, priority: meta.priority ?? 2, pinned: Boolean(meta.pinned), width: meta.width, minWidth: meta.minWidth, grow: meta.grow, size: meta.size, label: headerLabel(c.columnDef as ColumnDef<T, unknown>), sortable: c.getCanSort(), maxWidth: meta.maxWidth, fitPad: fitPadOf(meta) };
      if (meta.tip) tc.tip = true;
      if (cutOf(meta) === 'never') tc.never = true;
      // Its content's need: the widest drawn element cell, or (a column drawing its plain value) the widest value.
      const seen = wants.rows === rowSet ? wants.m.get(c.id) : undefined;
      const plainVals = c.columnDef.cell === undefined ? Math.max(0, ...fitRows.slice(0, 2000).map((r) => { const v = r.getValue(c.id); return typeof v === 'string' || typeof v === 'number' ? cellWidth(String(v)) : 0; })) : undefined;
      // A free-text column drawn by its own cell (Notifications' Message: a one-line span that cuts its own words, so
      // the drawn cell never reports more than the cells it has): its string values say what its words need.
      const freeText = !tc.never && (meta.size === 'fill' || (meta.size === undefined && meta.width === undefined));
      const textVals = c.columnDef.cell !== undefined && freeText ? Math.max(0, ...fitRows.slice(0, 2000).map((r) => { const v = r.getValue(c.id); return typeof v === 'string' ? cellWidth(oneLine(v)) : 0; })) : 0;
      if (seen !== undefined || plainVals !== undefined || textVals > 0) tc.want = Math.max(seen ?? 0, plainVals ?? 0, textVals);
      if (meta.size === 'fit' || tc.never) {
        const fitText = meta.fitText as ((r: T) => string) | undefined;
        tc.texts = fitRows.slice(0, 2000).map((r) => { if (fitText) return fitText(r.original) ?? ''; const v = r.getValue(c.id); return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''; });
      }
      cols.push(tc);
    }
    const reserved = LEAD + (selectable ? CHECK_W : 0) + actionsWidth + 1 + indent + (renderExpanded ? 2 : 0);
    return planTerm(cols, width - reserved, cellWidth, statusId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafs, columns, visibility, fitRows, width, selectable, actionsWidth, indent, renderExpanded, statusId, wants]);
  const asList = presentation === 'list' || presentation === 'cards' || presentation === 'icons' || (presentation === 'auto' && (pane.presentation === 'list' || !plan.fits));
  const shown = useMemo(() => leafs.filter((c) => plan.cells[c.id] !== undefined), [leafs, plan]);

  // Groups and the search: while a search is on, every group with a match is open (the web's rule).
  const filtered = view ? view.isFiltered : (query ?? '').trim() !== '' || (filters?.some((f) => !f.required && f.value !== undefined && f.value !== '') ?? false);
  const filterSig = filtered ? `${(query ?? '').trim()}\u0000${(filters ?? []).map((f) => `${f.id}=${f.value ?? ''}`).join('\u0001')}` : '';
  const [searchClosed, setSearchClosed] = useState<{ sig: string; ids: Set<string> }>({ sig: '', ids: new Set() });
  if (searchClosed.sig !== filterSig) setSearchClosed({ sig: filterSig, ids: new Set() });
  const isCollapsed = useCallback((id: string) => (filtered ? searchClosed.sig === filterSig && searchClosed.ids.has(id) : collapsed.has(id)), [filtered, filterSig, searchClosed, collapsed]);
  const toggleGroup = (id: string) => {
    if (filtered) {
      const ids = new Set(searchClosed.sig === filterSig ? searchClosed.ids : []);
      if (ids.has(id)) ids.delete(id); else ids.add(id);
      setSearchClosed({ sig: filterSig, ids });
      return;
    }
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id); else next.add(id);
    if (collapsedGroups) onCollapsedGroupsChange?.([...next]); else setOwnCollapsed(next);
  };
  const items = useMemo<It<T>[]>(
    () => flattenItems<T, Row<T>>({ rows: visibleRows, groupBy, groups, grouped, isCollapsed, expanded, renderExpanded: Boolean(renderExpanded), viewGroups: Boolean(viewGroups), parents }),
    [visibleRows, groupBy, groups, grouped, isCollapsed, expanded, renderExpanded, viewGroups, parents],
  );
  const rowItems = useMemo(() => items.flatMap((x, i) => (x.kind === 'row' ? [{ item: x, at: i }] : [])), [items]);

  // Cursor (a row index among rows), selection, the row menu.
  const [cursor, setCursor] = useState(0);
  const cursorId = useRef<string | undefined>(undefined);
  useEffect(() => { if (activeId === undefined) return; const i = rowItems.findIndex((x) => x.item.row.id === activeId); if (i >= 0) setCursor(i); }, [activeId, rowItems]);
  // Row identity: the cursor is a row id. When the rows change (a streamed update, a sort, a filter), the cursor stays
  // on the same row wherever it went; only when that row is gone does it keep its index (clamped).
  let at = Math.min(cursor, Math.max(0, rowItems.length - 1));
  const seenItems = useRef(rowItems);
  if (seenItems.current !== rowItems) {
    seenItems.current = rowItems;
    const id = cursorId.current;
    const i = id === undefined ? -1 : rowItems.findIndex((x) => x.item.row.id === id);
    if (i >= 0) at = i;
    if (at !== cursor) setCursor(at);
  }
  cursorId.current = rowItems[at]?.item.row.id;
  const live = useRef(at);
  live.current = at;
  const [menu, setMenuState] = useState<{ id: string; at: number } | null>(null);
  const searchHandle = useRef<Focusable | null>(null);
  const setMenu = (m: { id: string; at: number } | null) => setMenuState(m);
  const contextKey = view?.contextKey;
  const lastContext = useRef(contextKey);
  useEffect(() => {
    if (lastContext.current === contextKey) return;
    lastContext.current = contextKey;
    setExpanded(new Set()); setListSelecting(false); setCursor(0); setMenu(null);
  }, [contextKey]);
  const selected = selectedIds ?? new Set<string>();
  // Keys can arrive faster than renders: the next selection is counted from the latest one, not from this render's.
  const selLive = useRef<ReadonlySet<string>>(selected);
  selLive.current = selected;
  // Inside a locked Form no path changes the selection (the web's one guard): keys, the header box, Clear, the menu.
  const locked = useFieldLock(false);
  const setSelected = (next: Set<string>) => { if (locked) return; selLive.current = next; onSelectionChange?.(next); };
  const toggle = (id: string) => {
    if (pickOne) { setSelected(new Set([id])); return; }
    const next = new Set(selLive.current);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const allIds = visibleRows.map((r) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = !allSelected && allIds.some((id) => selected.has(id));
  const listChecks = Boolean(selectable) && asList && (listSelecting || selected.size > 0 || pick);
  const showChecks = Boolean(selectable) && (!asList || listChecks);
  const toggleExpanded = (id: string) => setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Lines: a table row is 1, a list row 2, a group header 1, an open row menu 1 more; a note or an expanded part as
  // tall as it was laid out (measured, its estimate until then).
  // Cards are drawn as list rows here; a card leaves out its `card: false` columns (the web's cards do): a page's card
  // markup already holds what they show (Computers' name cell draws the dot its list-only lead column draws).
  const cardsAsRows = presentation === 'cards';
  const listLayout = useMemo(() => planList(leafs.filter((c) => visibility[c.id] !== false && !(cardsAsRows && c.columnDef.meta?.card === false)).map((c) => ({ id: c.id, role: c.columnDef.meta?.list, priority: c.columnDef.meta?.priority ?? 2, pinned: Boolean(c.columnDef.meta?.pinned), wraps: c.columnDef.meta?.listWraps === true }))), [leafs, visibility, cardsAsRows]);
  // A list row is its name line, plus its meta line only when it has one (a row with nothing to say there is one line
  // tall), plus one blank line only in normal density on a tall terminal (more than 30 rows; never at 80x24).
  const termRows = useTerminalSize().height;
  // A blank line between list rows only on a full-width list on a tall screen. A rail (a narrow list beside the page,
  // or the whole stacked screen as RailPane) is always compact: the selection and focus marks carry the separation.
  const listGap = asList && !pane.rail && !pane.flush && (stored.density ?? props.density ?? 'normal') === 'normal' && termRows >= SHORT_ROWS ? 1 : 0;
  const [metaRows, setMetaRows] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const reportMeta = useCallback((id: string, has: boolean) => setMetaRows((m) => (m.get(id) === has ? m : new Map(m).set(id, has))), []);
  // A row not drawn yet: as the rows already drawn mostly are (two lines until any is known).
  const metaGuess = useMemo(() => { let y = 0, n = 0; for (const v of metaRows.values()) { if (v) y++; else n++; } return y + n === 0 ? true : y >= n; }, [metaRows]);
  const hasMetaLine = listLayout.meta.length > 0;
  // A row whose meta line wraps (a field with column meta listWraps, or the page's own data-meta-wraps) says how many
  // lines it took; every other row's meta line is one.
  const [metaLines, setMetaLines] = useState<ReadonlyMap<string, number>>(() => new Map());
  const reportMetaLines = useCallback((id: string, lines: number) => setMetaLines((m) => ((m.get(id) ?? 1) === lines ? m : new Map(m).set(id, lines))), []);
  // Cards drawn as rows keep their footer cells (columns marked card: 'foot', such as a usage block): full-width lines
  // under the row's meta line, as tall as they draw (each row says how many lines its footer took; none until then).
  const footCols = useMemo(() => (cardsAsRows ? leafs.filter((c) => visibility[c.id] !== false && c.columnDef.meta?.card === 'foot').map((c) => c.id) : []), [cardsAsRows, leafs, visibility]);
  const [footLines, setFootLines] = useState<ReadonlyMap<string, number>>(() => new Map());
  const reportFootLines = useCallback((id: string, lines: number) => setFootLines((m) => ((m.get(id) ?? 0) === lines ? m : new Map(m).set(id, lines))), []);
  const listRowH = (id: string) => 1 + (hasMetaLine && (metaRows.get(id) ?? metaGuess) ? (metaLines.get(id) ?? 1) : 0) + (footCols.length ? (footLines.get(id) ?? 0) : 0) + listGap;
  const rowH = asList ? 2 : 1;
  // A table row is as tall as its tallest cell (a name over its note, a note that wraps: ClipRow `onLines`), one line
  // otherwise; each cell's lines are kept by row and column, so a cell that shrinks back lowers its row again.
  const [cellLines, setCellLines] = useState<ReadonlyMap<string, ReadonlyMap<string, number>>>(() => new Map());
  const reportLines = useCallback((id: string, col: string, lines: number) => setCellLines((m) => {
    const cur = m.get(id);
    if ((cur?.get(col) ?? 1) === lines) return m;
    const next = new Map(cur ?? []);
    if (lines <= 1) next.delete(col); else next.set(col, lines);
    const out = new Map(m);
    if (next.size) out.set(id, next); else out.delete(id);
    return out;
  }), []);
  // Only the columns drawn count: a column the plan has dropped (no room) unmounts its cells without a last report, so
  // what a cell said while it was drawn for a pass would keep its row tall for ever (bots at 80 columns: two blank
  // lines under the first row in some runs, by whether the dropped column was laid out once before the plan).
  const tableRowH = (id: string): number => { let h = 1; for (const [col, v] of cellLines.get(id) ?? []) if (plan.cells[col] !== undefined) h = Math.max(h, v); return h; };
  const [measured, setMeasured] = useState<ReadonlyMap<string, number>>(() => new Map());
  // A top-level group header after the first gets one blank row above it (the web's gap between groups), so every
  // group reads as its own block and not only the first (whose blank is the toolbar's). None in a short terminal
  // (SHORT_ROWS), and none where the rows above already end with the list's own gap.
  const groupPad = (x: It<T>, i: number): number => (x.kind === 'group' && i > 0 && (x.depth ?? 0) === 0 && listGap === 0 && termRows >= SHORT_ROWS ? 1 : 0);
  const heightOf = (x: It<T>, i = -1): number => {
    if (x.kind === 'row') return asList ? listRowH(x.row.id) : tableRowH(x.row.id);
    if (x.kind === 'group') return 1 + groupPad(x, i);
    return measured.get(itemKey(x)) ?? (x.kind === 'note' ? 2 : 4);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const offsets = useMemo(() => lineOffsets(items.map((x, i) => heightOf(x, i))), [items, rowH, measured, metaRows, metaGuess, listGap, metaLines, cellLines, plan, termRows, footCols, footLines]);
  const rowIndexOfItem = useMemo(() => new Map(rowItems.map((r, i) => [r.at, i] as const)), [rowItems]);
  const totalLines = offsets[items.length] ?? 0;
  // A table that does not fill its pane is as tall as its lines (up to FLOW_ROWS_MAX), known while drawing: its last
  // measure is a frame old. A folded group opened under the focus (one line before) would otherwise keep the cursor
  // row in a one-line window, draw the group header out of it and take the focus with the header.
  // Only the page's main list: one whose rows start in the top half of that screen, with room for FLOW_ROWS_MIN rows
  // and its footer. A list further down (VMs, under a tall card) keeps its full height and is read by scrolling the
  // page as before: capped to the first screen it would stay a few rows tall after the page scrolled to it.
  // Footer: the "Showing n of m" note, Show more / Load more, the pager.
  const shownCount = serverMore && view ? view.total : view ? view.rows.length : rows.length;
  const footerNote = total !== undefined && total > shownCount && !(view && view.pages > 1) ? tt(totalOrder === 'newest' ? 'showing.newest' : 'showing.first', { shown: shownCount, total }) : undefined;
  const viewPager = view && view.pages > 1 && view.pageSize ? { page: view.page, pages: view.pages, start: (view.page - 1) * view.pageSize, end: (view.page - 1) * view.pageSize + view.rows.length } : null;
  const pager = viewPager ?? (slice && slice.pages > 1 ? slice : null);
  const pagerTotal = view ? view.matched : filteredRows.length;
  const goPage = (n: number) => (view ? view.setPage(n) : setPageUrl(n <= 1 ? undefined : String(n)));
  const canLoadMore = Boolean(onLoadMore) && (view ? view.canShowMore || serverMore : total !== undefined && rows.length < total);
  // A footer row is coming (loading, error and empty states draw no list tall enough to cap): leave it room.
  const footerWanted = !bare && (footerNote !== undefined || pager !== null || canLoadMore);
  // A tall terminal puts one blank row between a list that flows with the page and its footer (the pager).
  const footGap = !fill && footerWanted && termRows >= SHORT_ROWS && listGap === 0 ? 1 : 0;
  const flowRoom = regionRows !== null && above !== null && above * 2 <= regionRows ? regionRows - above - 1 - footGap : null;
  // The cap ends on a whole item: the last shown row keeps its second line rather than lose it to the footer.
  const wholeItems = (cap: number): number => {
    let k = 0;
    while (k < items.length && (offsets[k + 1] ?? Infinity) <= cap) k++;
    return k > 0 ? (offsets[k] ?? cap) : cap;
  };
  const flowMax = !fill && footerWanted && flowRoom !== null && flowRoom >= FLOW_ROWS_MIN ? Math.min(FLOW_ROWS_MAX, wholeItems(flowRoom)) : FLOW_ROWS_MAX;
  const viewH = Math.max(1, fill ? (bodySize?.height ?? 20) : Math.min(totalLines, flowMax));
  const [top, setTop] = useState(0);
  const cursorLine = (i: number) => offsets[rowItems[i]?.at ?? 0] ?? 0;
  // The lines of the cursor row the window keeps in view. A list row whose meta line wraps is taller than name + one
  // line: all of it is kept (as much as the window holds), or the last row's wrapped lines could never be scrolled to.
  const cursorH = (i: number): number => { const x = asList ? items[rowItems[i]?.at ?? -1] : undefined; return x ? Math.max(rowH, Math.min(viewH, heightOf(x) - listGap)) : rowH; };
  // The window follows the cursor row, except while a group header that was just folded or opened holds the focus: then
  // it keeps that header's line. A group opened above the cursor row pushes the row far down, and following it would
  // draw the header out and take the focus with it. A cursor move, a wheel step or the header losing the focus ends it.
  const held = useRef<string | null>(null);
  const heldAt = held.current === null ? -1 : items.findIndex((x) => itemKey(x) === held.current);
  const topNow = heldAt >= 0 ? keepInView(top, (offsets[heldAt] ?? 0) + groupPad(items[heldAt]!, heldAt), 1, viewH, totalLines) : keepInView(top, cursorLine(at), cursorH(at), viewH, totalLines);
  const topRef = useRef(topNow);
  topRef.current = topNow;
  useEffect(() => { if (topNow !== top) setTop(topNow); }, [topNow, top]);

  const followTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(followTimer.current), []);
  // A follow pending when the detail closes is dropped: the timer reads the pane's follow and the open row as they are
  // when it fires, so a closed detail is never opened again by the cursor's last move.
  const followLive = useRef(pane.follow);
  followLive.current = pane.follow;
  const activeLive = useRef(view?.activeId);
  activeLive.current = view?.activeId;
  const moveTo = (i: number, extend = false) => {
    held.current = null;
    const n = Math.max(0, Math.min(rowItems.length - 1, i));
    const from = rowItems[live.current]?.item.row;
    live.current = n;
    setCursor(n);
    setMenu(null);
    const target = rowItems[n]?.item.row;
    if (!target) return;
    if (extend && selectable && !pickOne && from) setSelected(new Set([...selLive.current, from.id, target.id]));
    setTop((tp) => keepInView(tp, cursorLine(n), cursorH(n), viewH, totalLines));
    // An open detail follows the cursor (the web inspector does, after a short pause).
    if (onActiveChange) { clearTimeout(followTimer.current); followTimer.current = setTimeout(() => onActiveChange(target.original), 150); }
    else if (pane.follow) { clearTimeout(followTimer.current); followTimer.current = setTimeout(() => followLive.current?.(target.id), 150); }
    else if (view?.activeId !== undefined && onRowAction) { clearTimeout(followTimer.current); followTimer.current = setTimeout(() => { if (activeLive.current !== undefined) onRowAction(target.original); }, 150); }
  };
  const pageStep = Math.max(1, Math.floor(viewH / rowH) - 1);
  const focus = useFocusable({
    // Only the page's own list takes the first focus (a ListDetailPage list pane, a table filling its pane, or the
    // table of a page-wide table area: TableHome, a TablePage with a FAQ under it). A table inside a section
    // (Account's sign-in sessions) never does: ↓ would move rows the reader cannot see. A rail's list fills its body
    // (RailPane) but is not the page's own: the web lands the route focus on the title, never on the rail.
    auto: (fill && pane.rail !== true) || pane.list === true || home,
    onKey: (k) => {
      const row = rowItems[live.current]?.item.row;
      if (k.ctrl || k.meta) return false;
      switch (isSpace(k) ? 'space' : k.name) {
        case 'down': case 'j': moveTo(live.current + 1, k.shift); return true;
        case 'up': case 'k': moveTo(live.current - 1, k.shift); return true;
        case 'home': moveTo(0); return true;
        case 'end': moveTo(rowItems.length - 1); return true;
        case 'pagedown': moveTo(live.current + pageStep); return true;
        case 'pageup': moveTo(live.current - pageStep); return true;
        case 'return': case 'linefeed': if (!row) return false; if (pick) toggle(row.id); else openRow(row); return true;
        case 'o': if (!row || pick) return false; openRow(row); return true;
        case '/': if (!searchHandle.current) return false; searchHandle.current.focus(); return true;
        case 'space': case 'x': if (!row || !selectable) return false; toggle(row.id); return true;
        case 'escape': if (selLive.current.size === 0) return false; setSelected(new Set()); setListSelecting(false); return true;
        case '.': if (!row || menuOf(row).length === 0) return false; setMenu({ id: row.id, at: 0 }); return true;
        case 'right': case 'left':
          if (!row || !renderExpanded || (canExpand && !canExpand(row.original))) return false;
          if ((k.name === 'right') !== expanded.has(row.id)) toggleExpanded(row.id);
          return true;
        default: {
          if (!row) return false;
          // A row action's `key` is the web's KeyboardEvent.key ('p', 'F2', 'Delete'), matched as the web matches it: the
          // engine's own name ('f2', 'delete') is not that, so it goes through the shell's web view of the key.
          const webKey = hubKey(k).key;
          const hit = (actionMap.get(row.id) ?? []).find((a): a is RowAction => a !== '-' && a.key === webKey && !a.isDisabled);
          if (!hit) return false;
          runAction(hit, clip.copy);
          return true;
        }
      }
    },
  });
  // A detail closed (ListPane.returnTo, n grows on each close): the row that was open gets the cursor and the focus,
  // also when this table was drawn again new (one pane). Nothing when the table already has the focus.
  const returnTo = pane.returnTo;
  const returned = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!returnTo || returned.current === returnTo.n) return;
    const i = rowItems.findIndex((r) => r.item.row.id === returnTo.id);
    if (i < 0) return; // not drawn yet (rows still loading): try again when they come
    returned.current = returnTo.n;
    if (focus.focused) return;
    live.current = i;
    setCursor(i);
    setTop((tp) => keepInView(tp, cursorLine(i), cursorH(i), viewH, totalLines));
    focus.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnTo?.id, returnTo?.n, rowItems]);
  // openRow (as the web): once per seq the row is expanded (when it can be), gets the cursor and the focus, and is kept
  // in view; `onRowOpened` answers, also for a row that is not shown.
  const openedSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!openAsk || openedSeq.current === openAsk.seq) return;
    openedSeq.current = openAsk.seq;
    const i = rowItems.findIndex((r) => r.item.row.id === openAsk.id);
    const row = rowItems[i]?.item.row;
    if (row) {
      if (renderExpanded && (!canExpand || canExpand(row.original))) setExpanded((prev) => (prev.has(row.id) ? prev : new Set(prev).add(row.id)));
      live.current = i;
      setCursor(i);
      setTop((tp) => keepInView(tp, cursorLine(i), cursorH(i), viewH, totalLines));
      focus.focus();
    }
    onRowOpened?.(openAsk.seq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAsk, rowItems]);
  // Esc with a selection clears it even when the table does not hold the focus (the bulk bar's Clear says "Esc").
  useKeys((k) => { if (k.name === 'escape' && selected.size > 0 && !focus.focused) { setSelected(new Set()); setListSelecting(false); return true; } return false; });

  const lastClick = useRef<{ id: string; time: number } | null>(null);
  const clickRow = (i: number, row: Row<T>) => {
    const now = Date.now();
    const again = lastClick.current && lastClick.current.id === row.id && now - lastClick.current.time < DOUBLE_MS;
    lastClick.current = { id: row.id, time: now };
    const wasCursor = focus.focused && live.current === i;
    focus.focus();
    if (listChecks || pick) { moveTo(i); toggle(row.id); return; }
    if (wasCursor || again) { live.current = i; setCursor(i); openRow(row); return; }
    moveTo(i);
  };

  // States (the web's order).
  const matchedCount = view ? view.matched : filteredRows.length;
  const allCount = view ? view.total : rows.length;
  const switched = filters?.some((f) => f.required) ?? false;
  const staleKept = data !== undefined && data.length > 0;
  const clearAll = () => { if (view) view.clearAll(); else { setQuery(undefined); filters?.forEach((f) => !f.required && f.onChange(undefined)); } };
  const nothingYet = !error && !(isLoading && !data) && allCount === 0;
  let state: ReactNode = null;
  if (error && !staleKept) {
    state = (
      <Box dir="column" padY={1}>
        <Text colour="danger">{'✗ '}{label}: {errorBody ?? t('state.errorTitle')}</Text>
        {onRetry && <Box dir="row"><Word label={t('action.retry')} onPress={onRetry} colour="blueText" /></Box>}
      </Box>
    );
  } else if (isLoading && !data) {
    state = <Box dir="column">{Array.from({ length: 4 }, (_, i) => <TableMark key={i} colour="line">{'░'.repeat(Math.max(4, Math.min(48, width - 4 - i * 6)))}</TableMark>)}</Box>;
  } else if (matchedCount === 0 && (filtered || (allCount > 0 && !switched))) {
    state = (
      <Box dir="column" padY={1}>
        <Text colour="muted">{noMatch ?? t('table.noMatch')}</Text>
        <Box dir="row"><Word label={t('table.clearFilters')} onPress={clearAll} colour="blueText" /></Box>
      </Box>
    );
  } else if (matchedCount === 0 && switched) {
    state = empty ?? <Text colour="muted">{t('state.emptyTitle')}</Text>;
  }

  // The toolbar's view menu and its panels.
  const [viewOpen, setViewOpen] = useState(false);
  const showViewMenu = !noViewMenu;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const selectedRows = useMemo(() => (selected.size === 0 ? [] : rows.filter((r) => selected.has(getRowId(r)))), [rows, selected]);
  const showBulk = Boolean(selectable && selectedRows.length > 0 && bulkActions);
  const showSearch = Boolean(search);
  // The `?` sheet lists `/` only while a search field is on screen (term/prim/searchPresence); the bulk bar takes its place.
  const searchShown = showSearch && !showBulk;
  useEffect(() => (searchShown ? searchFieldMounted() : undefined), [searchShown]);
  const hasFilters = Boolean(filters && filters.length > 0);
  const tbActions = toolbarActions ?? [];
  const countShown = !isLoading && !(error && !staleKept);
  const countText = countLabel ? countLabel(matchedCount) : t('table.rows', { count: matchedCount });
  const viewLines: Line[] = [];
  if (showViewMenu || presentChoice || tbActions.length > 0) {
    if (presentChoice) {
      viewLines.push({ id: 'h:present', label: t('table.present'), head: true });
      for (const p of presentChoice.items ?? [{ id: 'cards', label: t('table.present.cards') }, { id: 'list', label: t('table.present.list') }] as const) {
        viewLines.push({ id: `present:${p.id}`, label: p.label, check: 'radio', on: presentChoice.value === p.id, onPick: () => presentChoice.onChange(p.id) });
      }
    }
    if (showViewMenu) {
      const sortable = leafs.filter((c) => c.getCanSort() && visibility[c.id] !== false && !listOnly.has(c.id));
      if (sortable.length > 0) {
        viewLines.push({ id: 'h:sort', label: t('table.sortBy'), head: true });
        for (const c of sortable) {
          const dir = c.getIsSorted();
          viewLines.push({ id: `sort:${c.id}`, label: `${headerLabel(c.columnDef as ColumnDef<T, unknown>) || c.id}${dir === 'asc' ? ' ↑' : dir === 'desc' ? ' ↓' : ''}`, onPick: () => c.toggleSorting(dir === 'asc') });
        }
      }
      const hideable = leafs.filter((c) => c.getCanHide() && !c.columnDef.meta?.pinned && c.columnDef.meta?.table !== false);
      if (hideable.length > 0) {
        viewLines.push({ id: 'h:cols', label: t('table.columns'), head: true });
        for (const c of hideable) viewLines.push({ id: `col:${c.id}`, label: headerLabel(c.columnDef as ColumnDef<T, unknown>) || c.id, check: 'box', on: visibility[c.id] !== false, onPick: () => setVisibility((v) => ({ ...v, [c.id]: v[c.id] === false })) });
      }
      if (groupToggle) viewLines.push({ id: 'group', label: groupToggle.label, check: 'box', on: groupedPref, onPick: () => setGroupedPref((v) => !v) });
      if (selectable && asList && !pick) viewLines.push({ id: 'select', label: listChecks ? tt('select.stop') : tt('select.start'), onPick: () => { setListSelecting((v) => !v); if (listSelecting) setSelected(new Set()); } });
    }
  }
  const viewAnchor = useAnchor();
  // The view menu's width: its longest line, its frame and marks; at least 26 cells.
  const viewMenuWidth = Math.max(26, Math.min(48, ...viewLines.map((l) => cellWidth(l.label) + 8)));
  // The filter bar folds into one "Filters" button below 90 columns, as a list, or with more than CHIP_FACETS_MAX chip
  // facets (as the web). A bar that held the focus hands it to its new form (FilterRefocusCtx).
  const manyFacets = (filters ?? []).filter((f) => !isSegmentedFilter(f)).length > CHIP_FACETS_MAX;
  const chipsWide = width >= 90 && !asList && !manyFacets;
  const filterHeld = useRef(false);
  const showToolbar = !bare && (showBulk || showSearch || hasFilters || viewLines.length > 0 || Boolean(toolbarEnd) || Boolean(onRefresh) || tbActions.length > 0 || countShown);

  const toolbar = showToolbar && (
    // Wraps: on a narrow table (a 24-cell rail) the count and buttons, and a filter after the search, go to the next
    // line instead of past the toolbar's box.
    <Box dir="row" gap={2} gapY={0} wrap shrink={0} align="start" raw={{ alignContent: 'flex-start' }}>
      {showBulk && bulkActions ? (
        // The count is never the part that gives way (it wrapped a letter at a time beside three buttons): the row wraps.
        <Box dir="row" gap={2} gapY={0} wrap grow={1} shrink={1} raw={{ alignContent: 'flex-start', minWidth: 0 }}>
          <Text colour="ink" bold shrink={0}>{t('table.selected', { count: selectedRows.length })}</Text>
          {bulkActions(selectedRows)}
          <Word label={`${t('action.clear')} (Esc)`} onPress={() => { setSelected(new Set()); setListSelecting(false); }} />
        </Box>
      ) : (
        <Box dir="row" gap={2} gapY={0} wrap grow={1} shrink={1} raw={{ alignContent: 'flex-start', minWidth: 0 }}>
          {showSearch && (
            <Box dir="row" gap={1} shrink={0}>
              <TableMark colour="faint">/</TableMark>
              <TextInput handle={searchHandle} sem={{ role: 'searchbox', name: t('search.label') }} onKey={(k) => { if (k.name === 'escape' || k.name === 'down') { focus.focus(); return true; } return false; }} onSubmit={() => focus.focus()} value={draft} onChange={typeQuery} placeholder={cutCells(typeof search === 'string' ? search : 'Search', Math.max(12, Math.min(28, Math.floor(width / 4))) - 1, 'end')} width={Math.max(12, Math.min(28, Math.floor(width / 4)))} />
            </Box>
          )}
          {hasFilters && filters && <FilterRefocusCtx.Provider value={filterHeld}>{chipsWide ? <FilterChips filters={filters} onClearAll={clearAll} /> : <FiltersButton filters={filters} onClearAll={clearAll} />}</FilterRefocusCtx.Provider>}
        </Box>
      )}
      <Box dir="row" gap={2} gapY={0} wrap shrink={1} raw={{ alignContent: 'flex-start', minWidth: 0 }}>
        {countShown && <ClipText text={countText} colour="muted" grow={false} />}
        {tbActions.map((a) => (a.onSelectedChange
          ? <Word key={a.id} label={`${a.selected ? '[x]' : '[ ]'} ${a.label}`} disabled={a.isDisabled} onPress={() => a.onSelectedChange?.(!a.selected)} />
          : <Word key={a.id} label={a.busy ? `${a.label}…` : a.label} disabled={a.isDisabled || a.busy} onPress={() => a.onPress?.()} colour="blueText" />))}
        {toolbarEnd}
        {onRefresh && <Word label={withIcon('reload', tt('refresh'))} onPress={onRefresh} />}
        {viewLines.length > 0 && (
          <Box dir="column" shrink={0} boxRef={viewAnchor.ref}>
            <Word label={showViewMenu ? withIcon('sliders', t('table.view')) : withIcon('dots', t('action.more'))} onPress={() => setViewOpen((o) => !o)} />
            {/* On the overlay layer, under the button and ending at its edge (the toolbar box clips what it holds). */}
            <Layer open={viewOpen} kind="popover" place={{ at: 'anchor', anchor: viewAnchor.rect, side: 'bottom', align: 'end', width: viewMenuWidth }} initialFocus="none" padX={1} onEscape={() => setViewOpen(false)} onOutside={() => setViewOpen(false)}>
              <MenuPanel lines={viewLines} onClose={() => setViewOpen(false)} />
            </Layer>
          </Box>
        )}
      </Box>
    </Box>
  );


  const showFooter = !bare && (state === null || serverMore) && (footerNote !== undefined || pager !== null || canLoadMore);

  // ── Drawing ──
  const sortDir = (id: string) => sorting.find((s) => s.id === id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const header = useMemo(() => !asList && (
    <Box dir="row" height={1} shrink={0} sem={{ role: 'row', name: shown.map((c) => headerLabel(c.columnDef as ColumnDef<T, unknown>)).join(' ') }}>
      <TableMark width={LEAD}>{' '}</TableMark>
      {showChecks && (pickOne ? <TableMark width={CHECK_W}>{' '}</TableMark> : (
        <Word label={allSelected ? '[x]' : someSelected ? '[-]' : '[ ]'} sem={{ role: 'checkbox', name: t('table.selectAll'), checked: allSelected ? true : someSelected ? 'mixed' : false }} width={CHECK_W} onPress={() => setSelected(allSelected ? new Set([...selected].filter((id) => !allIds.includes(id))) : new Set([...selected, ...allIds]))} />
      ))}
      {indent > 0 && <TableMark width={indent}>{' '}</TableMark>}
      {renderExpanded && <TableMark width={2}>{' '}</TableMark>}
      {shown.map((c) => {
        const w = plan.cells[c.id] ?? 1;
        const lbl = headerLabel(c.columnDef as ColumnDef<T, unknown>);
        const dir = sortDir(c.id);
        const arrow = dir ? (dir.desc ? ' ↓' : ' ↑') : '';
        const align = c.columnDef.meta?.align === 'end' ? 'end' as const : 'start' as const;
        // A column tip: the words, then " ⓘ" (the web's `.thTip`: the header label and an InfoTip after it), while
        // the words keep at least one cell.
        const tipText = c.columnDef.meta?.tip;
        const tip = tipText && w > TIP_CELLS + 1 ? <><Text>{' '}</Text><InfoTip text={tipText} subject={lbl} /></> : null;
        const tw = tip ? TIP_CELLS : 0;
        return [
          c.getCanSort()
            ? <Box key={c.id} dir="row" width={w} shrink={0} clip boxRef={tableMark('head', c.id)} justify={tip && align === 'end' ? 'end' : 'start'}><Word label={clipCells(lbl, w - tw - arrow.length)} sem={{ name: lbl }} {...(arrow ? { mark: arrow } : {})} {...(tip ? {} : { width: w })} align={align} bold onPress={() => c.toggleSorting(dir ? !dir.desc : false)} />{tip}</Box>
            : <Box key={c.id} dir="row" width={w} shrink={0} clip boxRef={tableMark('head', c.id)} justify={align === 'end' ? 'end' : 'start'}><Text colour="muted" bold>{clipCells(lbl, w - tw)}</Text>{tip}</Box>,
          sep(`s:${c.id}`, plan.sep),
        ];
      })}
    </Box>
  ), [asList, showChecks, pickOne, allSelected, someSelected, visibleRows, indent, renderExpanded, shown, plan, sorting]);

  // What every drawn row reads, in one object that changes only when the layout does: a row is redrawn when this,
  // its item, or its own state (cursor, picked, open, menu) changes, never because the cursor moved elsewhere.
  const api = useRef({ clickRow, moveTo: (i: number) => {}, toggle, toggleExpanded, openMenu: (id: string) => {}, closeMenu: () => {}, focusTable: () => {}, fromGroup: (_key: string, _dir: 1 | -1): boolean => false });
  api.current = {
    clickRow, moveTo, toggle, toggleExpanded,
    // ↓ on a group header: the cursor goes to the first row drawn under it (an open group's own rows), ↑ to the last
    // row above it, and the table takes the focus; no such row = not handled (the focus stays on the header). The header
    // is found by its item key: a grouped view draws a group's header again for each later run of its rows.
    fromGroup: (key, dir) => {
      const g = items.findIndex((x) => x.kind === 'group' && itemKey(x) === key);
      if (g < 0) return false;
      let ri = -1;
      if (dir === 1) ri = rowItems.findIndex((r) => r.at > g);
      else for (let i = rowItems.length - 1; i >= 0 && ri < 0; i--) if (rowItems[i]!.at < g) ri = i;
      if (ri < 0) return false;
      focus.focus();
      moveTo(ri);
      return true;
    },
    openMenu: (id: string) => { focus.focus(); const i = rowItems.findIndex((x) => x.item.row.id === id); if (i >= 0) { live.current = i; setCursor(i); } setMenu({ id, at: 0 }); },
    closeMenu: () => { setMenu(null); focus.focus(); },
    focusTable: () => focus.focus(),
  };
  const rowCtx = useMemo<RowCtx<T>>(() => ({
    asList, shown, cells: plan.cells, sep: plan.sep, showChecks, pickOne, indent, renderExpanded: Boolean(renderExpanded), canExpand, expanded, listLayout, actionsWidth,
    inlineOf, menuOf, menuListOf, onMeta: reportMeta, onMetaLines: reportMetaLines, onFootLines: reportFootLines, footCols, onLines: reportLines, rail: Boolean(pane.rail), onWant: reportWant, listGap, cardsAsRows,
    onClick: (ri, row) => api.current.clickRow(ri, row),
    onFocusRow: (ri) => { api.current.focusTable(); api.current.moveTo(ri); },
    onToggle: (id, refocus) => { api.current.toggle(id); if (refocus) api.current.focusTable(); },
    onExpand: (id) => api.current.toggleExpanded(id),
    onMenu: (id) => api.current.openMenu(id),
    onCloseMenu: () => api.current.closeMenu(),
    selectRowName: t('table.selectRow'),
    rowActionsName: t('table.rowActions'),
    selectable: Boolean(selectable),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [asList, shown, plan, showChecks, pickOne, indent, renderExpanded, canExpand, expanded, listLayout, actionsWidth, actionMap, selectable, t, reportMeta, reportMetaLines, reportLines, pane.rail, listGap, cardsAsRows, reportWant, footCols, reportFootLines]);
  const drawGroup = (x: Extract<It<T>, { kind: 'group' }>, i: number) => (
    <GroupLine key={itemKey(x)} padTop={groupPad(x, i)} group={x.group} count={x.count} closed={isCollapsed(x.group.id)} depth={x.depth ?? 0} onToggle={() => { held.current = itemKey(x); toggleGroup(x.group.id); }} onLeave={() => { if (held.current === itemKey(x)) held.current = null; }} onStep={(dir) => api.current.fromGroup(itemKey(x), dir)} />
  );
  const remember = (key: string) => (_w: number, h: number) => setMeasured((m) => (m.get(key) === h ? m : new Map(m).set(key, h)));

  // The window: only the items touching the lines in view are drawn.
  const { from, to } = windowOf(offsets, topNow, viewH);
  const firstOffset = (offsets[from] ?? 0) - topNow;
  const drawn: ReactNode[] = [];
  for (let i = from; i < to; i++) {
    const x = items[i]!;
    if (x.kind === 'row') {
      const ri = rowIndexOfItem.get(i) ?? 0;
      const id = x.row.id;
      drawn.push(<RowView<T> key={`r:${id}`} x={x} ri={ri} cursor={ri === at ? (focus.focused ? 'focused' : 'idle') : 'none'} picked={selected.has(id)} active={activeId !== undefined && id === activeId} mark={rowMark?.(x.row.original) || undefined} menuAt={menu && menu.id === id ? menu.at : -1} lines={asList ? 1 : tableRowH(id)} ctx={rowCtx} />);
    }
    else if (x.kind === 'group') drawn.push(drawGroup(x, i));
    else if (x.kind === 'note') drawn.push(<GroupNoteBox key={itemKey(x)} pad={LEAD + INDENT} onSize={remember(itemKey(x))}>{x.group.note}</GroupNoteBox>);
    else drawn.push(<Box key={itemKey(x)} dir="column" shrink={0} pad={{ left: LEAD + INDENT + 2 }} onSize={remember(itemKey(x))}>{renderExpanded?.(x.row.original)}</Box>);
  }
  // A filling table asks for the lines it still has below the window (at most a screen), not only the ones drawn: in a
  // parent sized by its content the drawn window would otherwise fix its own height (its first measure, rows hidden
  // under a scrollbar beside empty space). A sized parent shrinks it as before (grow implies shrink).
  const tailRoom = fill ? Math.max(0, Math.min(totalLines - topNow, termRows) - ((offsets[to] ?? totalLines) - topNow)) : 0;
  // The scrollbar is read off the items in view alone. An item not drawn yet has no known height (in the offsets it
  // counts as a short one), so a total made of the offsets depended on how many rows had ever been drawn, and one list
  // drew thumbs of different lengths by the order its rows and its own height arrived in (Bots, Servers). The items
  // in view are all laid out: the list is taken to go on as they do (their mean height for every item). That is the
  // true total when every item is in view, and it puts the thumb on the end of its track with the last item in view.
  // Whether there is a scrollbar at all stays with the offsets: a list they say fits has drawn all its items.
  const shownLines = (offsets[to] ?? totalLines) - (offsets[from] ?? 0);
  const perItem = to > from ? shownLines / (to - from) : 0;
  const bar = totalLines > viewH ? thumb(perItem * from + (topNow - (offsets[from] ?? 0)), viewH, Math.max(viewH + 1, perItem * items.length)) : null;
  const scrollbar = bar && (
    <Box dir="column" width={1} shrink={0}>
      {Array.from({ length: viewH }, (_, i) => <TableMark key={i} colour={i >= bar.start && i < bar.start + bar.size ? 'muted' : 'line'}>{i >= bar.start && i < bar.start + bar.size ? '█' : '░'}</TableMark>)}
    </Box>
  );
  /** The scroll position the last wheel step asked for: the effect below acts only on that one. */
  const wheelTop = useRef<number | null>(null);
  const wheel = (e: MouseEvent) => {
    const dir = e.scroll?.direction;
    const by = (dir === 'up' ? -1 : dir === 'down' ? 1 : 0) * 3;
    if (by) held.current = null;
    if (by) setTop((tp) => (wheelTop.current = scrollBy(keepInView(tp, cursorLine(live.current), cursorH(live.current), viewH, totalLines), by, viewH, totalLines)));
  };
  // The wheel moved the view off the cursor: keepInView would pull it back, so the cursor follows into the view.
  // Only the wheel: a cursor that moved alone (a row made active from outside, far down) leaves the same gap for one
  // commit, and taking that for a wheel sent the cursor to the old view while the view went to the new cursor, again
  // and again (the api page with ?op= far down: dozens of swaps, React's "Maximum update depth exceeded", and the
  // list left at its top with the active row out of view).
  useEffect(() => {
    const wheeled = wheelTop.current === top;
    wheelTop.current = null;
    if (!wheeled || top === topNow) return;
    const line = cursorLine(at);
    // A row taller than name + one line is held whole by keepInView, so it has left the view once any of its lines
    // has; a row of one or two lines only once its first line has.
    const tall = cursorH(at) > rowH ? cursorH(at) : 1;
    if (line < top || line + tall > top + viewH) {
      const want = rowItems.findIndex((r) => (offsets[r.at] ?? 0) >= top);
      if (want >= 0 && want !== at) { live.current = want; setCursor(want); }
    }
  });

  // Every hook is above this line: a table that goes empty, loading or failing keeps the same hooks (no early return
  // before a hook, tested in DataTable.term.test.tsx).
  // Nothing exists yet: the page's empty state alone, no toolbar.
  if (nothingYet && !filtered && !switched) {
    return <Box dir="column" grow={fill ? 1 : 0} onSize={onSize}>{empty ?? <Text colour="muted">{t('state.emptyTitle')}</Text>}</Box>;
  }

  return (
    <Box dir="column" grow={fill ? 1 : 0} clip onSize={onSize} boxRef={tableMark('table', label)} sem={{ role: 'table', name: label }}>
      {view?.isRefreshing && <TableMark colour="blueText">{'━'.repeat(Math.max(1, Math.min(width, 12)))}</TableMark>}
      {toolbar}
      {toolbarNote !== undefined && toolbarNote !== null && toolbarNote !== false && <NoteCap cap={Math.max(3, Math.floor(termRows * 0.3))}>{toolbarNote}</NoteCap>}
      {/* The toolbar is a block of its own: one blank row parts it from the rows (the web's toolbar margin). A short
          terminal keeps the row for the list (SHORT_ROWS, as the page header's blank row). */}
      {toolbar && termRows >= SHORT_ROWS && <Box height={1} shrink={0} />}
      {error !== undefined && error !== null && staleKept && (
        <Box dir="row" gap={2} shrink={0}>
          <Text colour="warn">{'! '}{t('table.staleData')}</Text>
          {onRetry && <Word label={t('action.retry')} onPress={onRetry} colour="blueText" />}
        </Box>
      )}
      {state ?? (
        <Box dir="column" grow={fill ? 1 : 0} boxRef={focus.ref}>
          {header}
          <Box dir="row" grow={fill ? 1 : 0} {...(fill ? {} : { height: Math.min(totalLines, flowMax) })}>
            {/* The rows window scrolls: its edge may cut the last row in view (a two-line list row in an odd window),
                so it declares the cut (`drops`). */}
            <Box dir="column" grow={1} clip drops boxRef={bodyNode} onSize={onBody} onWheel={wheel}>
              <Box dir="column" shrink={0} raw={{ marginTop: firstOffset }}>{drawn}</Box>
              {/* The lines still below the window, as a box of its own that gives way whole in a sized parent. As a
                  bottom margin of the rows it was taken out of THEIR height once it passed the pane's (Notifications at
                  60x20: 8 lines in view, 12 asked below, every row drawn 0 tall, a blank list). */}
              {tailRoom > 0 && <Box height={tailRoom} shrink={1} raw={{ minHeight: 0 }} />}
            </Box>
            {scrollbar}
          </Box>
        </Box>
      )}
      {showFooter && (
        <Box dir="row" gap={2} shrink={0} {...(footGap ? { pad: { top: 1 } } : {})}>
          {footerNote && <Text colour="muted">{footerNote}</Text>}
          {canLoadMore && <Word label={loadingMore ? `${view && !serverMore ? tt('more') : t('table.loadMore')}…` : view && !serverMore ? tt('more') : t('table.loadMore')} disabled={loadingMore} onPress={() => onLoadMore?.()} colour="blueText" />}
          {pager && (
            <Box dir="row" gap={1}>
              <Text colour="muted">{tt('pager.range', { start: pager.start + 1, end: pager.end, total: pagerTotal })}</Text>
              <Word label="‹" disabled={pager.page <= 1} onPress={() => goPage(pager.page - 1)} />
              <Word label="›" disabled={pager.page >= pager.pages} onPress={() => goPage(pager.page + 1)} />
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

interface RowCtx<T> {
  asList: boolean;
  shown: readonly { id: string; columnDef: ColumnDef<T, unknown> }[];
  cells: Readonly<Record<string, number>>;
  /** The gap after each column (TermPlan.sep). */
  sep: number;
  showChecks: boolean;
  pickOne: boolean;
  indent: number;
  renderExpanded: boolean;
  canExpand?: (row: T) => boolean;
  expanded: ReadonlySet<string>;
  listLayout: ReturnType<typeof planList>;
  /** Card presentation drawn as list rows: `.list [data-lead-dup]` does not apply (the web's cards keep the mark). */
  cardsAsRows: boolean;
  /** The list is a rail (a narrow list beside the page): a meta field marked data-rail-hide is left out, as the web's
   *  `.rail .listItem:has([data-rail-hide])`. */
  rail: boolean;
  /** A wrapping meta line reports the lines it took. */
  onMetaLines: (id: string, lines: number) => void;
  /** Footer columns (card: 'foot') drawn under a card shown as a row, and the lines they took. */
  footCols: readonly string[];
  onFootLines: (id: string, lines: number) => void;
  /** A table cell's lines (ClipRow onLines): its row grows to the tallest. */
  onLines: (id: string, col: string, lines: number) => void;
  actionsWidth: number;
  inlineOf: (row: Row<T>) => RowAction | undefined;
  menuOf: (row: Row<T>) => RowAction[];
  menuListOf: (row: Row<T>) => (RowAction | '-')[];
  /** List rows: whether a row's meta line drew anything (its height follows), and the blank line after each row. */
  onMeta: (id: string, has: boolean) => void;
  /** A value cell's drawn content width (cells), per column. */
  onWant: (id: string, cells: number) => void;
  listGap: number;
  onClick: (ri: number, row: Row<T>) => void;
  onFocusRow: (ri: number) => void;
  onToggle: (id: string, refocus?: boolean) => void;
  onExpand: (id: string) => void;
  onMenu: (id: string) => void;
  onCloseMenu: () => void;
  /** The row checkbox's name (the web's table.selectRow) and whether a row's selected state is its selection. */
  selectRowName: string;
  /** The row menu's trigger name, the web's IconButton label (kit table.rowActions: "Row actions"). */
  rowActionsName: string;
  selectable: boolean;
}
interface RowViewProps<T> {
  x: Extract<It<T>, { kind: 'row' }>;
  ri: number;
  cursor: 'none' | 'idle' | 'focused';
  picked: boolean;
  active: boolean;
  /** The row's mark tone (rowMark), or none. */
  mark: Web.DataTableMarkTone | undefined;
  menuAt: number;
  /** A table row's lines (its tallest cell's). */
  lines: number;
  ctx: RowCtx<T>;
}

// A separator cell never shrinks away: a tight row cuts its name, never the space between its parts. `w`: the table
// plan's gap (two cells when the row has room, one when tight).
const sep = (k: string, w = 1) => <Text key={k} shrink={0}>{' '.repeat(w)}</Text>;

/** One value cell: a string cut to its cells (wide characters counted), anything else drawn as it is, clipped. */
function valueCell<T>(c: Cell<T, unknown>, w: number, align: 'start' | 'end' | 'center' | undefined, colour: Colour = 'ink', cut: CellCut = cutOf(c.column.columnDef.meta), onWant?: (id: string, cells: number) => void, onLines?: (col: string, lines: number) => void) {
  const node = renderColumnCell(c);
  // An element cell that is wider than its column is cut on its right like text, with one "…" (ClipRow): it shrinks
  // inside the cell, so an end-aligned cell never pushes its first cells out on the left.
  // A cut value keeps its whole text in the semantics (row names, agents); the screen shows the cut one.
  const whole = typeof node === 'string' || typeof node === 'number' ? String(node) : null;
  const cutTo = whole === null ? null : cutCells(whole, w, cut);
  const content = whole !== null && cutTo !== null
    ? (cutTo === whole ? <Text colour={colour}>{whole}</Text> : <Box dir="row" sem={{ name: whole }}><Text colour={colour} sem={{ hidden: true }}>{cutTo}</Text></Box>)
    : <ClipRow onNatural={onWant ? (n) => onWant(c.column.id, n) : undefined} remeasure={onWant} onLines={onLines ? (n) => onLines(c.column.id, n) : undefined}>{node}</ClipRow>;
  return (
    <Box key={c.id} dir="row" width={w} shrink={0} clip drops boxRef={tableMark('cell', c.column.id)} justify={align === 'end' ? 'end' : align === 'center' ? 'center' : 'start'}>
      {content}
    </Box>
  );
}

/** A group's note, inset from its rows. Plain content is one calm notice: a grey bar on its start side (the web's
 *  `.groupNote:not(:has(> [data-band-flush]))`: notice border, calm bar #9c9c9c / #7a7a7a). Flush Bands (GroupNotes)
 *  frame themselves, so a note holding one draws no second frame (they say so through FlushHostCtx). */
function GroupNoteBox({ pad, onSize, children }: { pad: number; onSize: (w: number, h: number) => void; children: ReactNode }): ReactElement {
  const [flushes, setFlushes] = useState(0);
  const host = useCallback((d: number) => setFlushes((n) => n + d), []);
  const frame: { border?: Array<'left'>; borderColour?: Colour; padX?: number } = flushes > 0 ? {} : { border: ['left'], borderColour: 'muted', padX: 1 };
  return (
    <Box dir="column" shrink={0} pad={{ left: pad }} onSize={onSize}>
      <FlushHostCtx.Provider value={host}>
        <Box dir="column" shrink={0} {...frame}>{children}</Box>
      </FlushHostCtx.Provider>
    </Box>
  );
}

/** Whether a drawn subtree holds any visible text (a component that rendered nothing holds none). `skip`: a subtree
 *  that does not count (a field's label: the value alone says whether the field draws). */
function drawsText(n: unknown, skip?: unknown): boolean {
  if (!n || typeof n !== 'object' || n === skip) return false;
  const t = (n as { plainText?: unknown }).plainText;
  if (typeof t === 'string' && t.trim() !== '') return true;
  const kids = (n as { getChildren?: () => unknown[] }).getChildren?.() ?? [];
  return kids.some((k) => drawsText(k, skip));
}

/** A list row's meta line: parts joined by " · ", where a part that draws nothing (a component rendering null) takes
 *  no joiner either. After each commit every part is checked for drawn text; a joiner sits between two drawn parts.
 *  A part's `label` is not its text: a field whose value draws nothing hides its label too (the web's
 *  `.listItem:has(> .listValue:empty)`). */
function MetaLine({ parts, onAny }: { parts: { key: string; wraps?: boolean; label?: ReactNode; node: ReactNode }[]; onAny: (has: boolean) => void }): ReactElement {
  const [drawn, setDrawn] = useState<Record<string, boolean>>({});
  const set = (k: string, on: boolean) => setDrawn((d) => (d[k] === on ? d : { ...d, [k]: on }));
  const refs = useRef<Record<string, BoxRenderable | null>>({});
  const labels = useRef<Record<string, BoxRenderable | null>>({});
  // After every commit: the parts' text is in the engine nodes by then (no layout needed).
  useEffect(() => {
    let any = false;
    for (const p of parts) { const on = drawsText(refs.current[p.key], labels.current[p.key]); set(p.key, on); any ||= on; }
    // "Nothing drawn" is believed only after the second look below: said at once it hides the line, and a hidden line
    // stays empty for good.
    if (any || !fresh.current) onAny(any);
  });
  // A second look shortly after mounting: a line mounted late (a row whose meta line turns into the wrapping one once
  // its cell says so) is read before its words are in the engine.
  const fresh = useRef(true);
  const [, again] = useState(0);
  useEffect(() => { const h = setTimeout(() => { fresh.current = false; again(1); }, 60); return () => clearTimeout(h); }, []);
  // A part drawn by its own component (a note that reads its own store) starts or stops drawing without this line
  // rendering: its box changes size then. A part that no longer is what the last look said is looked at again, so
  // its joiner and its label follow what it draws now (one row drew "3 days · Unsure" or "3 daysUnsure" by timing).
  const known = useRef(drawn);
  known.current = drawn;
  const [, look] = useState(0);
  const resized = (k: string): void => { if (drawsText(refs.current[k], labels.current[k]) !== (known.current[k] !== false)) look((n) => n + 1); };
  let seen = false;
  return (
    <>
      {parts.map((p) => {
        const on = drawn[p.key] !== false;
        const joiner = on && seen;
        if (on) seen = true;
        return (
          // The joiner is in one box with the part it leads, so a part that moves to the next line takes it along: a
          // line never ends with " ·".
          <Box key={p.key} dir="row" shrink={p.wraps ? 1 : 0} {...(p.wraps ? { raw: { minWidth: 0, maxWidth: '100%' } } : {})}>
            {joiner ? <Text colour="faint">{' · '}</Text> : null}
            <Box dir="row" shrink={p.wraps ? 1 : 0} {...(p.wraps ? { wrap: true, gapY: 0, raw: { minWidth: 0, maxWidth: '100%' } } : {})} boxRef={(n: BoxRenderable | null) => { refs.current[p.key] = n; }} onSize={() => resized(p.key)}>{p.label ? <Box dir="row" shrink={0} hidden={!on} boxRef={(n: BoxRenderable | null) => { labels.current[p.key] = n; }}>{p.label}</Box> : null}{p.node}</Box>
          </Box>
        );
      })}
    </>
  );
}

function RowViewOf<T>({ x, ri, cursor, picked, active, mark, menuAt, lines, ctx }: RowViewProps<T>): ReactElement {
  const row = x.row;
  const clip = useClipboard();
  const on = cursor !== 'none';
  // The row under the pointer stands on the hover ground; the cursor's, the open and a picked row keep `selected`.
  const hover = useHoverFill(false, cursor === 'focused' || active || picked);
  const bg: Colour | undefined = cursor === 'focused' || active || picked ? 'selected' : hover.bg;
  // As the web's <tr aria-selected>: the selection when rows can be picked, else the open (active) row.
  const rowSem: Sem = { role: 'row', selected: ctx.selectable ? picked : active || undefined };
  // A reader's (and a scenario's) way to a row: focusing it puts the table's cursor there, so Enter opens it.
  const rowFocus = useRef<Focusable & { ri: number }>({ focused: false, ref: { current: null }, focus: () => ctx.onFocusRow(rowFocus.current.ri), blur: () => {}, ri });
  rowFocus.current.ri = ri;
  rowFocus.current.focused = cursor === 'focused';
  const semRef = useSem(rowSem, { role: 'row', focus: rowFocus.current });
  const bar = (
    <>
      <TableMark colour={on ? 'focus' : 'blueText'} width={1}>{cursor === 'focused' ? '▌' : on ? '›' : active ? '│' : ' '}</TableMark>
      {/* Out of the tree, as the web's mark (CSS only): the row's words name what it marks. */}
      <Box shrink={0} sem={{ hidden: true }}><TableMark colour={mark ? MARK_COLOUR[mark] : undefined} width={LEAD - 1}>{mark ? MARK : ' '}</TableMark></Box>
    </>
  );
  // The row's checkbox: pressable on its own (a click, or a reader's press), out of the Tab order; the keys stay the
  // table's (the press hands the focus back to it).
  const check = ctx.showChecks && <Pressable dir="row" tabStop={false} sem={{ role: ctx.pickOne ? 'radio' : 'checkbox', name: ctx.selectRowName, checked: picked }} onPress={() => ctx.onToggle(row.id, true)}><TableMark colour={picked ? 'ok' : 'muted'} width={CHECK_W}>{ctx.pickOne ? (picked ? '(•) ' : '( ) ') : picked ? '[x] ' : '[ ] '}</TableMark></Pressable>;
  const lead = ctx.indent > 0 && <TableMark width={ctx.indent}>{' '.repeat(x.inGroup ? (x.deep ? ctx.indent : INDENT) : 0)}</TableMark>;
  const expandable = ctx.renderExpanded && (!ctx.canExpand || ctx.canExpand(row.original));
  const chevron = ctx.renderExpanded && <Box dir="row" onPress={expandable ? () => ctx.onExpand(row.id) : undefined}><TableMark colour="muted" width={2}>{expandable ? (ctx.expanded.has(row.id) ? '▾ ' : '▸ ') : '  '}</TableMark></Box>;
  const entries = menuAt >= 0 || ctx.actionsWidth > 0 ? ctx.menuOf(row) : [];
  const inline = ctx.actionsWidth > 0 ? ctx.inlineOf(row) : undefined;
  const actionsCell = ctx.actionsWidth > 0 && (
    <Box dir="row" width={ctx.actionsWidth} shrink={0} justify="end" boxRef={tableMark('actions')}>
      {inline && (
        <InlineWord label={`[${inline.short ?? inline.label}]`} off={inline.isDisabled === true}
          reason={inline.disabledReason ? (inline.short !== undefined && inline.short !== inline.label ? `${inline.label}. ${inline.disabledReason}` : inline.disabledReason) : undefined}
          colour={inline.tone === 'danger' ? 'danger' : 'blueText'} onPress={() => runAction(inline, clip.copy)} />
      )}
      {entries.length > 0 && (
        <ActionMenu label={row.id} isOpen={menuAt >= 0} onOpenChange={(o) => (o ? ctx.onMenu(row.id) : ctx.onCloseMenu())}
          // A button named as the web's ("Row actions"), out of the Tab order (the table's "." opens it), so a reader and a
          // replayed shot find it under its row; before, the ⋯ was text with no node.
          trigger={<Pressable dir="row" tabStop={false} sem={{ role: 'button', name: ctx.rowActionsName, expanded: menuAt >= 0, popup: 'menu' }}><TableMark colour="muted">{' ⋯'}</TableMark></Pressable>}
          items={ctx.menuListOf(row)} />
      )}
    </Box>
  );
  if (!ctx.asList) {
    const cells = new Map(row.getVisibleCells().map((c) => [c.column.id, c] as const));
    return (
      <Box dir="column" shrink={0}>
        <Box dir="row" height={lines} bg={bg} raw={hover.raw} boxRef={semRef} onPress={() => ctx.onClick(ri, row)}>
          {bar}{check}{lead}{chevron}
          {ctx.shown.map((c) => {
            const cell = cells.get(c.id);
            const w = ctx.cells[c.id] ?? 1;
            return cell ? [valueCell(cell, w, c.columnDef.meta?.align, 'ink', cutOf(c.columnDef.meta), ctx.onWant, (col, n) => ctx.onLines(row.id, col, n)), sep(`s:${c.id}`, ctx.sep)] : [<Box key={c.id} width={w} shrink={0} />, sep(`s:${c.id}`, ctx.sep)];
          })}
          <Box grow={1} />
          {actionsCell}
        </Box>
      </Box>
    );
  }
  return <ListRow<T> x={x} ri={ri} ctx={ctx} bg={bg} hoverRaw={hover.raw} semRef={semRef} bar={bar} check={check} lead={lead} chevron={chevron} actionsCell={actionsCell} />;
}

/** A list row (the web's list presentation, also cards and icons): its own component, so its hooks never follow the
 *  table/list switch in RowViewOf. */
function ListRow<T>({ x, ri, ctx, bg, hoverRaw, semRef, bar, check, lead, chevron, actionsCell }: { x: Extract<It<T>, { kind: 'row' }>; ri: number; ctx: RowCtx<T>; bg: Colour | undefined; hoverRaw: Readonly<Record<string, unknown>>; semRef: ReturnType<typeof useSem>; bar: ReactNode; check: ReactNode; lead: ReactNode; chevron: ReactNode; actionsCell: ReactNode }): ReactElement {
  const row = x.row;
  // Two-line list row (the web's list presentation, also cards and icons).
  const L = ctx.listLayout;
  const byId = new Map(row.getAllCells().map((c) => [c.column.id, c] as const));
  const primary = L.primary ? byId.get(L.primary) : undefined;
  const status = L.status ? byId.get(L.status) : undefined;
  const leadCell = L.lead ? byId.get(L.lead) : undefined;
  const meta = L.meta.map((id) => byId.get(id)).filter((c): c is Cell<T, unknown> => c !== undefined);
  const foot = ctx.footCols.map((id) => byId.get(id)).filter((c): c is Cell<T, unknown> => c !== undefined);
  const part = (c: Cell<T, unknown>, colour: Colour, bold = false) => {
    const node = renderColumnCell(c);
    return typeof node === 'string' || typeof node === 'number' ? <ClipText key={c.id} text={oneLine(String(node))} colour={colour} bold={bold} cut={cutOf(c.column.columnDef.meta)} /> : <ClipRow key={c.id}>{node}</ClipRow>;
  };
  const labelOf = (c: Cell<T, unknown>): string | null => {
    const opt = c.column.columnDef.meta?.listLabel;
    if (typeof opt === 'string') return opt;
    return opt === true && typeof c.column.columnDef.header === 'string' ? c.column.columnDef.header : null;
  };
  // Which fields the page itself marked data-meta-wraps (said by their cells once drawn).
  const [pageWraps, setPageWraps] = useState<Readonly<Record<string, boolean>>>({});
  const onPageWraps = useCallback((id: string, on: boolean) => setPageWraps((m) => ((m[id] ?? false) === on ? m : { ...m, [id]: on })), []);
  const rail = ctx.rail;
  const fieldPlain = useMemo(() => ({ rail, wraps: false, onPageWraps }), [rail, onPageWraps]);
  const fieldWraps = useMemo(() => ({ rail, wraps: true, onPageWraps }), [rail, onPageWraps]);
  const metaParts = meta.flatMap((c) => {
    const node = renderColumnCell(c);
    // Nothing to say (null, '', false): no part, so no " · " joins it.
    if (node === null || node === undefined || node === false || node === '') return [];
    // A field that wraps (column meta listWraps, or the page's data-meta-wraps on its cell): never cut, it takes the
    // lines it needs (the web's `.listItem[data-meta-wraps]`). In a rail a field the page marks data-rail-hide (Bots'
    // "no chat apps" dash) draws nothing, so it gets no joiner either (CellHost reads both marks off the cell).
    const wraps = c.column.columnDef.meta?.listWraps === true || pageWraps[c.column.id] === true;
    const l = labelOf(c);
    // With the column's tip, the label is the InfoTip's term (the web's listLabelNode: "Size", dotted).
    const tipText = c.column.columnDef.meta?.tip;
    const label = !l ? null : tipText ? <><InfoTip text={tipText} subject={l}>{l}</InfoTip><Text>{' '}</Text></> : <Text colour="faint">{`${l} `}</Text>;
    const body = !wraps ? part(c, 'muted') : typeof node === 'string' || typeof node === 'number' ? <Text colour="muted">{oneLine(String(node))}</Text> : <OneLine off>{node}</OneLine>;
    return [{ key: c.id, wraps, label, node: <MetaFieldCtx.Provider value={wraps ? fieldWraps : fieldPlain}>{body}</MetaFieldCtx.Provider> }];
  });
  const wrapsAny = metaParts.some((p) => p.wraps);
  const onLines = ctx.onMetaLines;
  useEffect(() => { if (!wrapsAny) onLines(row.id, 1); }, [wrapsAny, onLines, row.id]);
  // The meta line keeps its parts mounted (to learn whether they draw anything) and takes a line only when they do.
  const [hasMeta, setHasMeta] = useState(metaParts.length > 0);
  const onAny = (has: boolean) => { setHasMeta((h) => (h === has ? h : has)); ctx.onMeta(row.id, has); };
  // Where the name text starts in the row (a MarkCell's text box, else the primary cell): the meta line starts there.
  const rowBox = useRef<BoxRenderable | null>(null);
  const nameBox = useRef<BoxRenderable | null>(null);
  const primaryBox = useRef<BoxRenderable | null>(null);
  const [metaAt, setMetaAt] = useState<number | null>(null);
  const measure = useRef<() => void>(() => {});
  measure.current = () => {
    const r = rowBox.current, n = nameBox.current ?? primaryBox.current;
    if (!r || !n || r.isDestroyed || n.isDestroyed) return;
    const at = Math.max(0, n.screenX - r.screenX);
    setMetaAt((m) => (m === at ? m : at));
  };
  const rowRef = useCallback((n: BoxRenderable | null) => { rowBox.current = n; if (n) n.renderBefore = function () { measure.current(); }; }, []);
  const nameRef = useCallback((n: BoxRenderable | null) => { nameBox.current = n; }, []);
  const leadW = LEAD + (ctx.showChecks ? CHECK_W : 0) + (ctx.indent > 0 ? ctx.indent : 0) + (ctx.renderExpanded ? 2 : 0);
  return (
    <InListRow.Provider value={!ctx.cardsAsRows}>
    <Box dir="column" shrink={0} boxRef={rowRef}>
      <Box dir="column" bg={bg} raw={hoverRaw} boxRef={semRef} onPress={() => ctx.onClick(ri, row)}>
        <Box dir="row" height={1}>
          {bar}{check}{lead}{chevron}
          {/* The lead (a state mark) never gives up a cell to a long status: every row's name starts at the same column. */}
          {leadCell && [<Box key="lead" dir="row" shrink={0}><DefaultInk colour="muted">{renderColumnCell(leadCell)}</DefaultInk></Box>, sep('l')]}
          <Box dir="row" grow={1} shrink={1} clip drops boxRef={primaryBox}>
            {/* A card's title may stack lines (name; project); drawn as a one-row list name they lie on that row. */}
            <NameStartCtx.Provider value={nameRef}><FlatLine off={!ctx.cardsAsRows}>{primary && part(primary, 'ink', true)}</FlatLine></NameStartCtx.Provider>
          </Box>
          {status && [sep('st'), <Box key="status" dir="row" shrink={0} clip drops>{part(status, 'muted')}</Box>]}
          {actionsCell}
        </Box>
        {/* Under the name text, in the dim tone; no line at all when nothing in it draws (the parts stay mounted but
            hidden, so they can say when they have something). Hidden, not height 0: the engine lays a 0-tall row with
            content out one line tall, past the row's box. */}
        {wrapsAny ? (
          // A wrapping meta line: as tall as its words need; the table reads its height for the rows below.
          <Box dir="row" hidden={!hasMeta}>
            <TableMark width={metaAt ?? leadW}>{' '}</TableMark>
            <Box dir="row" wrap gapY={0} grow={1} shrink={1} raw={{ minWidth: 0 }} onSize={(_w: number, h: number) => { if (h > 0) onLines(row.id, h); }}>
              <DefaultInk colour="muted"><MetaLine parts={metaParts} onAny={onAny} /></DefaultInk>
            </Box>
          </Box>
        ) : (
        <Box dir="row" height={1} hidden={!hasMeta} clip drops>
          <TableMark width={metaAt ?? leadW}>{' '}</TableMark>
          <Box dir="row" grow={1} shrink={1} clip drops>
            {/* The dim tone for every part that has no colour of its own (a page's span); links and tones keep theirs. */}
            <ClipRow><DefaultInk colour="muted"><MetaLine parts={metaParts} onAny={onAny} /></DefaultInk></ClipRow>
          </Box>
        </Box>
        )}
        {foot.length > 0 && (
          <Box dir="row" shrink={0}>
            <TableMark width={metaAt ?? leadW}>{' '}</TableMark>
            <Box dir="column" grow={1} shrink={1} raw={{ minWidth: 0 }} onSize={(_w: number, h: number) => ctx.onFootLines(row.id, h)}>
              {foot.map((c) => <Box key={c.id} dir="column" shrink={0}>{renderColumnCell(c)}</Box>)}
            </Box>
          </Box>
        )}
      </Box>
      {ctx.listGap > 0 && <Box height={ctx.listGap} shrink={0} />}
    </Box>
    </InListRow.Provider>
  );
}

const RowView = memo(RowViewOf) as typeof RowViewOf;

/** How much faster a group header's words give way than its name (flex shrink is weighted by it). */
const GROUP_TEXT_SHRINK = 10_000;

/** A group header: a press (Enter, Space, a click) folds or opens it; ↓/j goes to the first row under it, ↑/k to the
 *  last row above it (`onStep`). A button named by its label and count, with its open state (the web's
 *  `<button aria-expanded>`); focused, it shows the kit's focus mark "▌" before its chevron. */
function GroupLine({ group, count, closed, depth, padTop = 0, onToggle, onLeave, onStep }: { group: TableGroup; padTop?: number; count: number; closed: boolean; depth: number; onToggle: () => void; onLeave: () => void; onStep: (dir: 1 | -1) => boolean }) {
  // A group drawn only because of showEmpty (no rows, no note, no count words of its own) has nothing to open: no fold
  // mark, no "0" (notes: "▾ cedar 0 This computer is stopped." read as a closed list of zero) and no open state; a
  // press does nothing.
  const hollow = count === 0 && Boolean(group.showEmpty) && !group.note && group.countLabel === undefined;
  const f = useFocusable({
    onKey: (k) => {
      if (!hollow && (isPress(k) || (k.name === 'left' && !closed) || (k.name === 'right' && closed))) { onToggle(); return true; }
      if (k.ctrl || k.meta) return false;
      if (k.name === 'down' || k.name === 'j') return onStep(1);
      if (k.name === 'up' || k.name === 'k') return onStep(-1);
      return false;
    },
  });
  // Leaving the header ends the table's hold on its line (the window follows the cursor row again).
  const had = useRef(false);
  useEffect(() => { if (had.current && !f.focused) onLeave(); had.current = f.focused; }, [f.focused, onLeave]);
  const countText = hollow ? '' : group.countLabel !== undefined ? group.countLabel : String(count);
  const semRef = useSem({ role: 'button', name: countText ? `${oneLine(group.label)} ${countText}` : oneLine(group.label), expanded: hollow ? undefined : !closed }, { role: 'button', focus: f });
  const ref = useMemo(() => mergeRefs(f.ref, semRef), [f.ref, semRef]);
  const line = (
    <Box dir="row" height={1} gap={1} shrink={0} boxRef={ref} onPress={() => { f.focus(); if (!hollow) onToggle(); }} bg={f.focused ? 'selected' : undefined}>
      <TableMark colour={f.focused ? 'focus' : 'muted'} width={1 + depth * INDENT + (f.focused ? 1 : 0)}>{`${' '.repeat(depth * INDENT)}${f.focused ? '▌' : ''}${hollow ? ' ' : closed ? '▸' : '▾'}`}</TableMark>
      {/* The count keeps its width. The words after it give way first (weighted shrink: the name loses no cell while
          they have any), then the name, cut at its end with one "…" (as the web's label), never past the row edge. ClipText, not Text
          truncate: a fixed-width shrinking box, which Yoga cuts correctly in a sized row. */}
      <ClipText text={oneLine(group.label)} colour="ink" bold underline={f.focused} grow={false} />
      {/* "· " sets the count apart from the name without colour (mono, a plain-text frame): "atlas 7" and
          "… 12 streams of 1024 50" read as one phrase. The button's name keeps the bare count. */}
      {countText ? <Text colour="muted" shrink={0}>{`· ${countText}`}</Text> : null}
      {group.text !== undefined && <Box dir="row" shrink={GROUP_TEXT_SHRINK} minWidth={0} clip>{typeof group.text === 'string' ? <ClipText text={oneLine(group.text)} colour="muted" grow={false} /> : <ClipRow>{group.text}</ClipRow>}</Box>}
      {group.extra !== undefined && <Box dir="row" shrink={0}>{group.extra}</Box>}
    </Box>
  );
  // The blank row above sits outside the pressable line (a click on it folds nothing).
  return padTop > 0 ? <Box dir="column" shrink={0} pad={{ top: padTop }}>{line}</Box> : line;
}

export const DataTable: typeof Web.DataTable = DataTableTerm;
