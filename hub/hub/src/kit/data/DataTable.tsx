// DataTable: every tabular surface in the Hub. One panel holding a toolbar (`--toolbar-h`), a sticky header (`--th-h`),
// rows (`--table-row-h`; `--row-h-dense` compact), selection with a bulk bar, row actions, group rows, expandable rows,
// keys, sorting kept in the URL, a pager and virtual rows above 200. Columns declare a priority 1-4 and drop by it until
// the rest fit (DataTableLayout.ts); once too few fit, or beside a fill-mode detail, rows become 2-line list rows.
import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  type Row,
  type Cell,
  type CellContext,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual';
import { type CSSProperties, Fragment, type KeyboardEvent, type ReactNode, type MouseEvent, type PointerEvent, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Menu, MenuItem, MenuSection, MenuTrigger, Popover, Header, Separator } from 'react-aria-components';
import { Button, IconButton, cx } from '../controls/Button';
import { Checkbox, SearchField, Switch } from '../forms/fields';
import { useFieldLock } from '../forms/lock';
import { Icon, type IconName } from '../icons';
import { useSearchParam } from '../nav';
import { CardEdge, CardScope, TABLE_CUT, useCardCut } from '../layouts/CardEdge';
import { toolbarSizeProps, type ToolbarSize } from '../layouts/PageHeader';
import { useListPane } from '../layouts/pane';
import { useMedia, useRowFit } from '../media';
import { ExtLink, TextButton, autolink } from '../controls/Link';
import { SR_ONLY } from '../controls/SrOnly';
import { InfoTip } from '../overlays/InfoTip';
import { Tooltip } from '../overlays/Popover';
import { ActionMenu, runMenuAction, type MenuEntry } from '../overlays/Overlays';
import { EmptyPlace, EmptyState, ErrorState, LoadingNote, Skeleton, TableSkeletonBody } from '../states/States';
import { NoMatchState } from '../states/Recipes';
import { motionOff } from '../perf';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import tableStrings from './DataTable.strings.en.json';
import { clearClipTitle, clipTitle, hoverPointer } from './clipTitle';
import { useFontsReady } from './fontsReady';
import { CELL_PAD as FIT_CELL_PAD, CHIP_FACETS_MAX, type ColumnSpec, EDGE_PAD, type Edges, FIT_MAX, type ListRole, NARROW_TOOLBAR_BELOW, type TextMetrics, fitWidth, formatSort, headerWidth, pageSlice, parseSort, planCards, planColumns, planList, tableFits, textWidth, toolbarSteps } from './DataTableLayout';

export { CHIP_FACETS_MAX } from './DataTableLayout';
import { type DataView } from './DataTableView';
import { busyMark } from './busy';
import { flattenItems, groupParents, itemKey, type Item, type TableGroup } from './DataTableItems';

export type { TableGroup } from './DataTableItems';
import { splitActions, type RowAction, type RowActionEntry, type RowActionState } from './DataTableActions';

export { splitActions } from './DataTableActions';
export type { RowAction, RowActionEntry, RowActionState, RowActionSplit } from './DataTableActions';
import { type DropTarget, type RowDrag, useTableDrag } from './drag';
import { FILTER_CONTROL, FilterChips, FiltersButton, isSegmentedFilter, type FilterChip } from './FilterChips';
import { type Presentation, type PresentationItem, PresentationFitContext, PresentationSwitch, useCardsOrList } from './Presentation';
import { CELL_PAD, HOVER_W, MENU_W, inlineWidth } from './rowControlMetrics';
import s from './DataTable.module.css';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** Column alignment; numbers and dates align to the end. */
    align?: 'start' | 'end' | 'center';
    /** Width as a CSS length ('120px', '22%'). Columns without one share the rest. */
    width?: string;
    /** How the column takes width: 'fixed' its px `width`; 'fit' its longest text over the
     * rows (measured from the data, `fitText` or the string value; at most `maxWidth`); 'fill' the room the others
     * leave (by `grow` among several). Unset: 'fixed' with a px width, else a share of the spare by `grow`. */
    size?: 'fixed' | 'fit' | 'fill';
    /** A 'fit' column's text for one row, when the cell is not its plain string value (a pill's words, a formatted
     * date). A 'fit' column needs this or a string/number accessor. */
    fitText?: (row: TData) => string;
    /** Extra px a 'fit' cell needs beside its text (an icon, a dot, a chevron). */
    fitPad?: number;
    /** A 'fit' column whose words are not drawn in the cell font measures them in its own type and box: a StatusPill
     *  column passes `statusPillMetrics(dot)` (kit/data/pillMetrics.ts), the pill's mono caps, tracking, padding and edge.
     *  The cell's own side padding (DataTableLayout.ts CELL_PAD) and `fitPad` still add. */
    fitMetrics?: TextMetrics;
    /** The widest a 'fit' column asks for (default 320); a longer text is cut and gets its tooltip. */
    maxWidth?: number;
    /** How the cell's text gives way when the column is narrower (terminal; the web cuts at the end with CSS):
     *  'end' (default) plain text, one "…" at the end; 'start' keeps the tail (an id, a host); 'path' keeps whole trailing
     *  path segments ("…/backup.tar.gz"); 'never' status words and verbs, never cut: the column takes its widest value
     *  (a StatusPill column with `fitMetrics` is 'never' by default). */
    cut?: 'end' | 'start' | 'path' | 'never';
    /** Monospace, tabular cell text (ids, hosts, counts). */
    mono?: boolean;
    /** Name in the view menu (and for header-width checks) when the header is not a plain string. */
    label?: string;
    /** Off until the user turns it on in the view menu. */
    defaultHidden?: boolean;
    /** Never hidden, by the view menu or by width (the name column). Implies priority 1. */
    pinned?: boolean;
    /** 1 (last to drop) to 4 (first to drop). Default 2. */
    priority?: 1 | 2 | 3 | 4;
    /** The least width this column's content needs (px). The pinned column defaults to 220;
     * others to their `width` in px, else 120. The header label's width is always respected. */
    minWidth?: number;
    /** Share of the spare width a column without `width` takes (default 1; pinned 2). */
    grow?: number;
    /** List presentation role: 'primary' (line 1, left), 'status' (line 1, right), 'lead'
     * (before the primary: an unread dot, a severity icon), 'meta' (line 2, in column order),
     * false (never in list rows). Unmarked columns fill line 2 by priority. */
    list?: ListRole;
    /** false: list rows only, never a table column (the mirror of `list: false`): a line-2 field a table shows elsewhere. */
    table?: false;
    /** A list-row field's label on line 2 ("Ends Oct 30"): true takes the column's string header, a
     * string is used as given. Off by default, so a bare value (a date) reads alone. List rows only. */
    listLabel?: boolean | string;
    /** A list-row field whose content wraps inside it onto the lines it needs, never cut and never past it (a link whose
     * words are its whole visible name): words and links wrap, a run with no break point breaks anywhere, atoms (Tag,
     * StatusPill) wrap whole between each other, and its listLabel wraps within its half of the field. Off by default:
     * a field keeps one line and is cut only when wider than the whole line. On a line that holds controls the field
     * keeps the line's hit height as its minimum. On the list primary (the item name, line 1) the name wraps whole
     * onto the lines it needs the same way, never cut with an ellipsis. List rows and card lines (a card line wraps the
     * same way). */
    listWraps?: boolean;
    /** A list-row field that takes the rest of line 2 and never moves onto a line of its own: it starts from no width,
     * so the fields before it and the row's inline word keep their place beside it, and line 2 stays one line (a row of
     * constant height). Its cell decides what it cuts (a sentence with an ellipsis) and what stays whole. List rows only. */
    listFill?: boolean;
    /** A table cell whose text wraps onto the lines it needs instead of ending in an ellipsis (a name that must show
     * whole): words wrap, a run with no break point breaks anywhere, and the row grows with its tallest cell (virtual
     * rows are measured, so they grow too). A row whose text fits one line keeps the table's row height. Content that
     * keeps its own one line (a Tag, a StatusPill, a truncating Link) stays whole and wraps as a unit. Off by default.
     * Table presentation only: the header, sorting, selection and keys are unchanged, and list rows and cards follow
     * `listWraps`. */
    wraps?: boolean;
    /** One or two plain sentences (an InfoTip, at most 200 characters) that explain the column: an InfoTip after the
     * header text in table presentation, and the list or card label (`listLabel`) as its term, so every presentation
     * carries it. A header tip alone is not the explanation of a number: numeric columns still want `listLabel`. The
     * list and cards title (the primary column) has no label, so its tip shows in table presentation only. */
    tip?: string;
    /** Cards presentation: 'foot' puts the field in the card's full-width footer (a usage block), false keeps it off
     * cards. Unmarked columns take their list role (title line, or one body line each). Cards only. */
    card?: 'foot' | false;
    /** @deprecated use priority. Hide while the table is narrower than this. */
    hideBelow?: number;
    /** Cells render through one stable host component, so a new `cell` function (columns rebuilt for a changed row or
     * handler) keeps the cell mounted: its state, focus and open menus survive a refresh. React compares a cell's hooks
     * from one render to the next, so change this key when the `cell` function really becomes a different component
     * (a different set of hooks); that cell then mounts afresh. */
    cellKey?: string | number;
  }
}

/** A marked row's tone (rowMark): 'acc' the highlight (Sign-in sessions' "This browser"), 'ink' (unread). */
export type DataTableMarkTone = 'acc' | 'ink';

/** A list-wide secondary action or switch (`toolbarActions`): a button or a Switch in the toolbar, an item of the view
 *  menu when the toolbar is tight. */
export interface ToolbarAction {
  id: string;
  /** Words from the page's strings (t('…')), never data: the toolbar draws them in the theme's capitals. */
  label: string;
  icon?: IconName;
  onPress?: () => void;
  /** A switch: on or off. A Switch in the toolbar, a checked item in the menu. */
  selected?: boolean;
  onSelectedChange?: (on: boolean) => void;
  isDisabled?: boolean;
  /** Working: the button shows its busy pulse and refuses presses (the menu item is disabled). */
  busy?: boolean;
  /** In the toolbar, the icon alone (the label is its name and tooltip). Needs `icon`. */
  iconOnly?: boolean;
}

/** The props of DataTable: pass a `view` (useDataView) for a standard list, or the plain data props for a simple table. */
export interface DataTableProps<T> {
  /** Accessible name of the table (resolved string). */
  label: string;
  /** The standard data view (useDataView): rows, search, chips, sort, paging, selection and the
   * open row all come from it, URL-kept. Pass it instead of data/search/filters/selection. */
  view?: DataView<T>;
  data?: readonly T[] | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[];
  getRowId?: (row: T) => string;
  isLoading?: boolean;
  /** A load error: ErrorState with Try again (or a warning band when stale data is kept). */
  error?: unknown;
  onRetry?: () => void;
  /** The error state's sentence, when the page knows better than "couldn't reach the server" (the server answered,
   *  and the answer is what failed). Absent: the kit's sentence. */
  errorBody?: ReactNode;
  /** Nothing exists yet: this EmptyState replaces the toolbar and the table. */
  empty?: ReactNode;
  /** "No <items> match" text for the no-match state (defaults to the kit's). */
  noMatch?: string;
  /** Search box: true, or its placeholder. URL-kept under `searchParam`. With a `view` the box
   * shows unless this is false. */
  search?: boolean | string;
  searchParam?: string;
  /** Text a row matches on (defaults to its visible cell values). */
  searchText?: (row: T) => string;
  filters?: readonly FilterChip[];
  /** The result count at the toolbar's end ("60 computers"); defaults to "60 rows". */
  countLabel?: (count: number) => string;
  /** Row activation (click, Enter): opens the detail or inspector. false: rows open nothing, so they get
   * no open affordance (no pointer, no data-row-opens), not even the view's default open. */
  onRowAction?: ((row: T) => void) | false;
  /** The keyboard-active row moved (side inspectors follow it). */
  onActiveChange?: (row: T) => void;
  /** The open row (list/detail selection): selected look. */
  activeId?: string;
  /** Multi-select with checkboxes; pair with bulkActions. `'pick'`: the table only picks rows (a picker inside a
   * form): rows open nothing, not even the view's default open, so a click anywhere on a row toggles it. Plain `true`
   * does the same when the table has no row action (`onRowAction={false}` or no handler); with one, a click opens.
   * `'pickOne'`: as `'pick'` with one row at most: a radio leads each row (one shared name), and a click, Space or
   * Enter picks the row. */
  selectable?: boolean | 'pick' | 'pickOne';
  selectedIds?: ReadonlySet<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  bulkActions?: (rows: T[]) => ReactNode;
  /** Every action of a row, declared once (⋯ menu, inline button, hover icons, keys). */
  actions?: (row: T) => readonly RowActionEntry[];
  /** Controls at the end of the toolbar (a secondary action; the primary lives in the page header). They take a
   *  second row of their own when the toolbar has no room left; prefer `toolbarActions`, which fold into the view menu. */
  toolbarEnd?: ReactNode;
  /** Secondary actions and switches of the list (Show usage, Explain…): in the toolbar while it has room, items of the
   *  view menu when it is tight. Their results go in `toolbarNote`, never in the toolbar row. */
  toolbarActions?: readonly ToolbarAction[];
  /** A line under the toolbar for what a toolbar action said (an Outcome, a Band, a role=status note). Drawn only
   *  while it holds text. */
  toolbarNote?: ReactNode;
  /** Where the chip filters go. 'row' (default): in the toolbar row, folding into the Filters button when the row is
   *  tight. 'tier': segmented filters stay in the row after the search; every chip filter sits in one flush bar under
   *  it that fills the width and wraps, so each stays reachable at every table width. List rows and a table narrower
   *  than the narrow toolbar keep 'row'. */
  filterBar?: 'row' | 'tier';
  /** The toolbar's control size: '32' makes its search, filters, view choice, view options and Refresh the compact
   *  size (`--ctl-h-compact`; `--touch-min` on a coarse pointer), as the Files page asks. Default: `--tb-ctl-h-default`. */
  toolbarSize?: ToolbarSize;
  /** The shared Cards / List choice (usePresentation). DataTable draws it in the toolbar: with words, as icons, or in
   *  the view menu when tight; it hides beside a detail pane, where the list is forced and the choice changes nothing.
   *  `items` offers other choices with the page's words (Files: List / Icons); default Cards / List. */
  presentChoice?: { value: Presentation; onChange: (p: Presentation) => void; items?: readonly PresentationItem[] };
  /** Reads the list again: a Reload icon at the right end of the toolbar. */
  onRefresh?: () => void;
  /** Remembers density, hidden columns and collapsed groups on this device. */
  storageKey?: string;
  initialSort?: SortingState;
  /** URL parameter that keeps the sort ('name' / '-name'). Default 'sort'; false keeps it in
   * memory (the default for `bare` tables). Two full tables on one page need distinct names. */
  sortParam?: string | false;
  /** Hide the ⚙ view menu. */
  noViewMenu?: boolean;
  /** Force a presentation; default follows the table's width. 'cards' is never chosen automatically: a page asks for
   *  it (the shared Cards/List switch), and it holds at every width, reflowing to one column. 'icons' is the folder
   *  grid: tiles of the row's lead cell drawn large and its primary cell under it; a click selects, a double
   *  click or Enter opens, a right click opens the row menu, arrows move in two dimensions. Never chosen automatically. */
  presentation?: 'auto' | 'table' | 'list' | 'cards' | 'icons';
  /** Cards presentation only: the page draws each card itself (its own frame, greys and layout) inside the kit's row,
   *  which keeps focus, keys, selection, the row menu and paging. `check` is the row's selection checkbox (null when
   *  the table has none) and `menu` its row menu (null when the row has no actions). The grid then takes the wider
   *  cards' track (420 px), a --sp-3 gap and no kit border, background or padding on the row. Without it, the kit's
   *  own card. */
  cardRender?: (row: T, slots: { check: ReactNode | null; menu: ReactNode | null }) => ReactNode;
  /** The kit's own cards only (no `cardRender`): 'stack' (default) is the card grid; 'rail' (the Servers
   *  cards) gives each card the panel's whole width, its title and fields on a 300 px tinted rail at the
   *  start and its footer beside them, from a 940 px table (900 px of cards). Narrower, the stacked card grid, its
   *  own track included. 'band' (the Projects cards) puts the title and the row
   *  menu in one 48 px band at the card's top, the card head's grey over its rule, with the fields under it; foot cells
   *  keep the bottom band, which then holds no menu. */
  cardShape?: 'stack' | 'rail' | 'band';
  /** Groups rows into collapsible sections; rows without a group come first. */
  groupBy?: (row: T) => string | undefined;
  /** A "Group by …" switch in the view menu (remembered with `storageKey`). Off = one flat list. */
  groupToggle?: { label: string; defaultOn?: boolean };
  groups?: readonly TableGroup[];
  /** How a group's header row is laid out. 'inline' (default): the title, count, `text` and `extra` on one line
   *  (`text` under the name on a narrow header). 'stacked': the title and count on the first line, the `extra` across the whole second line (its
   *  own start and end), more room around both. Either way the group's rows are indented under its label.
   *  A stacked table is never virtual: its headers are taller than the fixed row estimate. */
  groupHeader?: 'inline' | 'stacked';
  /** A group's header row sticks under the table header while its rows scroll past it, the next group's
   *  taking its place; with virtual rows the header in force is kept drawn. Off by default (nothing changes without
   *  it); not for cards or icons, which lay rows out as a grid. */
  stickyGroups?: boolean;
  /** Controlled collapse: the ids of the collapsed groups (the page opens a group by leaving it
   * out). With it, a header press calls `onCollapsedGroupsChange` and nothing is remembered. */
  collapsedGroups?: readonly string[];
  onCollapsedGroupsChange?: (ids: string[]) => void;
  /** Sub-parts under a row (indented sub-table); a chevron opens them. */
  renderExpanded?: (row: T) => ReactNode;
  canExpand?: (row: T) => boolean;
  /** A row to open from outside (Schedules' See output opens a run in History): once per `seq`, an expandable row is
   * expanded, brought to the top of the view and its toggle focused. `onRowOpened(seq)` answers once it is handled,
   * also when no such row is shown (the caller then drops the ask). */
  openRow?: { id: string; seq: number };
  onRowOpened?: (seq: number) => void;
  /** Client paging: rows per page, with the page number kept in the URL (`pageParam`). */
  pageSize?: number;
  pageParam?: string;
  /** Server paging or a capped read: how many exist. Shows "Showing 50 of 312". */
  total?: number;
  /** 'newest' words the note "Showing newest 50 of 312" (logs, notifications). */
  totalOrder?: 'newest' | 'first';
  onLoadMore?: () => void;
  loadingMore?: boolean;
  /** Virtual rows; defaults to on above 200 rows. */
  virtual?: boolean;
  /** Fill the parent's height and scroll inside (default), or grow with the content. */
  fill?: boolean;
  /** The most height of the scroll box in px; past it the rows scroll inside the frame, the column header stays pinned
   * and the footer (Show more) stays below. Rows keep their own focus, so arrow keys reach every row and scroll to it. */
  maxHeight?: number;
  /** Marks a row with a bar on its first cell and a wash (tokens --dt-mark-bar-<tone>/--dt-mark-wash-<tone>).
   * The mark is decorative: the row's own words must say why it is marked (a Tag such as "This browser"). */
  rowMark?: (row: T) => DataTableMarkTone | false | undefined;
  /** In a rail, a row's inline word is a text action on its line (no plate, no corner, never taller than the line), for
   * a rail whose rows end in words or marks at one x. Off: the word keeps its button. */
  railTextWord?: boolean;
  /** The pager names what it counts with `countLabel` ("1–20 of 23 Bots"), where a group's own count sits beside it. */
  pagerNamed?: boolean;
  /** 'dashed': dashed row lines, a shaded header over a dashed line, tabular
   * figures. Default 'solid'. */
  lines?: 'solid' | 'dashed';
  /** No toolbar, footer or panel border (small embedded tables). */
  bare?: boolean;
  /** The density the table starts in. The person's own choice in the view menu, remembered under `storageKey`, wins. */
  density?: 'normal' | 'compact';
  className?: string;
  /** Rows can be dragged (table, list and icons; not cards): the page's type and payload (drag.tsx). */
  rowDrag?: RowDrag<T>;
  /** The table takes drops on its rows and its body, the empty state included (drag.tsx). */
  drop?: DropTarget<T>;
}

/** DataTable.module.css --group-indent (--rail-lead + --rail-gap): how much further in a row under a group starts. */
const GROUP_INDENT = 24;

function rowText(row: Row<unknown>): string {
  return row
    .getAllCells()
    .map((c) => {
      const v = c.getValue();
      return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
    })
    .join(' ')
    .toLowerCase();
}

function colId<T>(c: ColumnDef<T, unknown>): string | undefined {
  return c.id ?? (c as { accessorKey?: string }).accessorKey;
}

/** The ids of the `table: false` leaf columns, inside groups too, resolved as TanStack does (id, else the accessor key
 *  with dots as underscores, else a string header), so a sort by one is always found. */
function listOnlyIds<T>(columns: ColumnDef<T, unknown>[], out = new Set<string>()): Set<string> {
  for (const c of columns) {
    const sub = (c as { columns?: ColumnDef<T, unknown>[] }).columns;
    if (sub?.length) {
      listOnlyIds(sub, out);
      continue;
    }
    if (c.meta?.table !== false) continue;
    const key = (c as { accessorKey?: string }).accessorKey;
    const id = c.id ?? (key ? key.replace(/\./g, '_') : typeof c.header === 'string' ? c.header : undefined);
    if (id !== undefined) out.add(id);
  }
  return out;
}

interface Stored {
  density?: 'normal' | 'compact';
  hidden?: string[];
  shown?: string[];
  collapsed?: string[];
  grouped?: boolean;
}

function readStored(key: string | undefined): Stored {
  if (!key) return {};
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(`hub.v3.table.${key}`) ?? '{}');
    if (!v || typeof v !== 'object') return {};
    // Fails closed: anything malformed reads as not stored.
    const o = v as Record<string, unknown>;
    const ids = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === 'string') : undefined);
    return {
      density: o.density === 'compact' || o.density === 'normal' ? o.density : undefined,
      hidden: ids(o.hidden),
      shown: ids(o.shown),
      collapsed: ids(o.collapsed),
      grouped: typeof o.grouped === 'boolean' ? o.grouped : undefined,
    };
  } catch {
    return {};
  }
}

function writeStored(key: string | undefined, v: Stored): void {
  if (!key) return;
  try {
    window.localStorage.setItem(`hub.v3.table.${key}`, JSON.stringify(v));
  } catch {
    /* storage refused: the view just isn't remembered */
  }
}

// A header's InfoTip: its 24 px box (44 px on a coarse pointer, --touch-min) and the gap before it.
const TIP_W = 28;
const TIP_W_COARSE = 48;
/** The selection column (.colCheck): 40 with a mouse, --touch-min (44) on a coarse pointer. The plan reserves what is drawn,
 *  so a planned table (overflow-x hidden) never ends 4 px past its scroller on touch. */
const CHECK_W = 40;
/** A cut frame's actions cell ends --table-cut-clear (the 18 px slant plus the focus ring's 4 px) from the frame, not
 *  --sp-2 (8): 14 px more, so the last row's ⋯, its hover square and focus ring sit clear of the slant.
 *  Every row, so the ⋯ stay in one line. */
const CUT_END = 18 + 4 - 8;
const CHECK_W_COARSE = 44;
function menuOf(entries: readonly RowActionEntry[]): MenuEntry[] {
  return entries.map((e) => (e === '-' ? e : { ...e, shortcut: e.shortcut ?? e.key?.toUpperCase() }));
}

function headerLabel<T>(c: ColumnDef<T, unknown>): string {
  return c.meta?.label ?? (typeof c.header === 'string' ? c.header : '');
}

/** The one component type every function cell renders as. TanStack's flexRender makes a cell function the component
 * type itself, so columns rebuilt for changed props (a new row, a new handler) would give every cell a new type and
 * remount it: a keyboard user's focus on a row's Stop button would be lost at each refetch. Here the type never changes
 * and `render` is just called, so the cell's hooks live in this host and a new function keeps them. The host is keyed
 * by its column (a list, card or tile slot that a different column takes over mounts afresh) and by ColumnMeta.cellKey
 * (the way a column asks for a fresh mount itself). */
function CellHost<T>({ render, ctx }: { render: (ctx: CellContext<T, unknown>) => ReactNode; ctx: CellContext<T, unknown> }) {
  return <>{render(ctx)}</>;
}

/** A column's cell: a plain function through the stable host; anything else flexRender knows (an element, a string, a
 * memo or class component) through flexRender. */
function renderColumnCell<T>(cell: Cell<T, unknown>): ReactNode {
  const def = cell.column.columnDef.cell;
  const ctx = cell.getContext();
  if (typeof def === 'function' && !(def.prototype && 'isReactComponent' in def.prototype)) {
    return <CellHost<T> key={`${cell.column.id}\u0000${cell.column.columnDef.meta?.cellKey ?? ''}`} render={def as (c: CellContext<T, unknown>) => ReactNode} ctx={ctx} />;
  }
  return flexRender(def, ctx);
}

/** The cell of a column without its own `cell` (TanStack's default shows the value as text): a string's web addresses
 * become links (`autolink`, a secret-shaped address masked), and a value that is one address whole is cut at the end in
 * its one-line cell with the full shown text in a tooltip. Any other value shows as text. */
function textCell<T>(ctx: CellContext<T, unknown>): ReactNode {
  const v = ctx.renderValue();
  if (typeof v !== 'string') return (v as { toString?: () => string } | null | undefined)?.toString?.() ?? null;
  const parts = autolink(v, { look: 'nav' });
  return Array.isArray(parts) && parts.length === 1 ? <ExtLink url={v} look="nav" truncate /> : parts;
}

/** One `toolbarActions` entry drawn in the toolbar: a Switch, an icon button, or a button with its words, each a toolbar
 *  control (as tall as the search field beside it). */
function ToolbarActionControl({ a }: { a: ToolbarAction }) {
  if (a.onSelectedChange) return <Switch label={a.label} isSelected={Boolean(a.selected)} onChange={a.onSelectedChange} isDisabled={a.isDisabled} />;
  if (a.iconOnly && a.icon) return <IconButton icon={a.icon} size="toolbar" label={a.label} isDisabled={a.isDisabled || a.busy} onPress={a.onPress} />;
  return (
    <Button size="toolbar" variant="ghost" icon={a.icon} busy={a.busy} isDisabled={a.isDisabled} onPress={a.onPress} className={s.tbWords}>
      {a.label}
    </Button>
  );
}

/** The Hub's table: one set of columns drawn as a table, 2-line list rows, cards or icon tiles, with search, filters,
 *  sort, selection, row actions, groups and paging. */
export function DataTable<T>(props: DataTableProps<T>) {
  const view = props.view;
  // The slanted close: a framed table that is no rail and sits in no card gets the cut corner (CardEdge.module.css).
  const outermost = useCardCut()['data-card-cut'] !== undefined;
  const {
    label,
    columns,
    onRetry,
    errorBody,
    empty,
    noMatch,
    searchParam = 'q',
    searchText,
    countLabel,
    onActiveChange,
    selectable,
    bulkActions,
    actions,
    toolbarEnd,
    toolbarActions,
    toolbarNote,
    toolbarSize,
    filterBar = 'row',
    presentChoice,
    onRefresh,
    storageKey,
    initialSort,
    noViewMenu,
    presentation = 'auto',
    cardRender,
    cardShape = 'stack',
    groupBy: ownGroupBy,
    groupToggle,
    groups: ownGroups,
    groupHeader = 'inline',
    stickyGroups = false,
    collapsedGroups,
    onCollapsedGroupsChange,
    renderExpanded,
    canExpand,
    openRow: openAsk,
    onRowOpened,
    pageParam = 'page',
    totalOrder = 'first',
    loadingMore,
    virtual,
    fill = true,
    maxHeight,
    rowMark,
    railTextWord,
    pagerNamed,
    lines = 'solid',
    bare,
    className,
    rowDrag,
    drop,
  } = props;
  // A view supplies the data and every piece of state; the plain props stay for simple tables.
  // hasData: rows of this context exist; after a context switch there are none (loading or error).
  const data = view ? (view.hasData && (view.rows.length > 0 || !view.isLoading) ? view.rows : undefined) : props.data;
  const getRowId = props.getRowId ?? view?.getRowId ?? ((r: T) => String((r as { id?: unknown }).id));
  const isLoading = view ? view.isLoading : props.isLoading;
  const error = view ? view.error : props.error;
  const search = view ? (props.search === false || !view.searchable ? false : (props.search ?? true)) : props.search;
  const filters = view ? view.chips : props.filters;
  const activeId = props.activeId ?? view?.activeId;
  const pickOne = selectable === 'pickOne';
  const onRowAction = props.onRowAction === false || selectable === 'pick' || pickOne ? undefined : (props.onRowAction ?? (view ? (r: T) => view.open(getRowId(r)) : undefined));
  // A selectable table with nothing to open is a picker: a click on the row picks it.
  const pick = Boolean(selectable) && !onRowAction;
  const selectedIds = props.selectedIds ?? (selectable ? view?.selected : undefined);
  const onSelectionChange = props.onSelectionChange ?? view?.setSelected;
  const pageSize = view ? undefined : props.pageSize;
  // A grouped view (useDataView `group`) draws its groups when the page passes neither groupBy nor groups of its
  // own; a group's count is its whole match, not only the rows on this page.
  const viewGroups = ownGroupBy || ownGroups ? undefined : view?.groups;
  const groupBy = ownGroupBy ?? (viewGroups ? view?.groupOf : undefined);
  const groups = useMemo<readonly TableGroup[] | undefined>(
    () => ownGroups ?? viewGroups?.map((g) => ({ id: g.id, label: g.label, count: g.count })),
    [ownGroups, viewGroups],
  );
  // Nested groups (TableGroup.parent): the table's own groups only.
  const parents = useMemo(() => (viewGroups ? undefined : groupParents(groups)), [groups, viewGroups]);
  const total = view ? (props.total ?? (view.matched > view.rows.length ? view.matched : undefined)) : props.total;
  // With a view, its own "Show more" comes first; past the rows the page has read (`total` above them), the
  // page's server Load more.
  const serverMore = view ? !view.canShowMore && props.onLoadMore !== undefined && total !== undefined && view.total < total : false;
  const onLoadMore = view ? (view.canShowMore ? view.showMore : serverMore ? props.onLoadMore : undefined) : props.onLoadMore;
  const t = useStrings(kitStrings);
  const tt = useStrings(tableStrings);
  const pane = useListPane();
  const stored = useMemo(() => readStored(storageKey), [storageKey]);
  const [urlQuery, setUrlQuery] = useSearchParam(view ? '__noq' : searchParam);
  const query = view ? view.q : urlQuery;
  const setQuery = useCallback(
    (v: string | undefined, opts?: { replace?: boolean }) => (view ? view.setQ(v ?? '') : setUrlQuery(v, opts)),
    [view, setUrlQuery],
  );
  const sortParam = view ? false : (props.sortParam ?? (bare ? false : 'sort'));
  const [sortUrl, setSortUrl] = useSearchParam(sortParam || '__nosort');
  const [pageUrl, setPageUrl] = useSearchParam(pageSize ? pageParam : '__nopage');
  // A column with `table: false` has no header to sort by: it is never a sort, from the URL, the view or initialSort.
  // Only flagged ids are dropped (listOnlyIds); every other sort is left as it was.
  const listOnly = useMemo(() => listOnlyIds(columns), [columns]);
  const knownIds = useMemo(() => new Set(columns.map((c) => colId(c)).filter((x): x is string => x !== undefined && !listOnly.has(x))), [columns, listOnly]);
  const [sortLocal, setSortLocal] = useState<SortingState>(initialSort ?? []);
  const viewSort = view?.sort;
  const sorting = useMemo<SortingState>(() => {
    const known = (s: SortingState): SortingState => (listOnly.size ? s.filter((x) => !listOnly.has(x.id)) : s);
    if (view) return viewSort ? known([viewSort]) : [];
    if (!sortParam) return known(sortLocal);
    return sortUrl === undefined ? known(initialSort ?? []) : parseSort(sortUrl, knownIds);
  }, [view, viewSort, sortParam, sortLocal, sortUrl, initialSort, knownIds, listOnly]);
  const setSorting = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      if (view) view.setSort(next[0] ? { id: next[0].id, desc: next[0].desc } : undefined);
      else if (sortParam) setSortUrl(formatSort(next), { replace: true });
      else setSortLocal(next);
    },
    [view, sorting, sortParam, setSortUrl],
  );
  const [density, setDensity] = useState<'normal' | 'compact'>(stored.density ?? props.density ?? 'normal');
  const [visibility, setVisibility] = useState<VisibilityState>(() => {
    const v: VisibilityState = {};
    for (const c of columns) {
      const id = colId(c);
      if (id && c.meta?.defaultHidden) v[id] = false;
    }
    // A pinned column is never hidden, whatever the stored list says.
    const pinned = new Set(columns.filter((c) => c.meta?.pinned).map((c) => colId(c)));
    for (const id of stored.hidden ?? []) if (!pinned.has(id)) v[id] = false;
    for (const id of stored.shown ?? []) v[id] = true;
    return v;
  });
  const [ownCollapsed, setOwnCollapsed] = useState<Set<string>>(
    () => new Set(stored.collapsed ?? (groups ?? []).filter((g) => g.defaultCollapsed).map((g) => g.id)),
  );
  const collapsed = useMemo(() => (collapsedGroups ? new Set(collapsedGroups) : ownCollapsed), [collapsedGroups, ownCollapsed]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [listSelecting, setListSelecting] = useState(false);
  const [groupedPref, setGroupedPref] = useState<boolean>(stored.grouped ?? groupToggle?.defaultOn ?? true);
  const grouped = groupToggle ? groupedPref : true;
  useEffect(() => {
    const hidden = Object.entries(visibility).filter(([, v]) => !v).map(([k]) => k);
    const shown = Object.entries(visibility).filter(([, v]) => v).map(([k]) => k);
    writeStored(storageKey, { density, hidden, shown, collapsed: [...ownCollapsed], grouped: groupToggle ? groupedPref : undefined });
  }, [storageKey, density, visibility, ownCollapsed, groupToggle, groupedPref]);

  const rows = useMemo(() => (data ?? []) as T[], [data]);

  // The table's own width (its scroll box, scrollbar excluded) picks columns and presentation.
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const scrollCallback = useCallback((el: HTMLDivElement | null) => {
    scrollRef.current = el;
    setScrollEl(el);
  }, []);
  const [width, setWidth] = useState(Number.POSITIVE_INFINITY);
  useEffect(() => {
    if (!scrollEl || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    ro.observe(scrollEl);
    return () => ro.disconnect();
  }, [scrollEl]);

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

  // A new search or filter starts again at page 1.
  const filterKey = `${query ?? ''}|${(filters ?? []).map((f) => f.value ?? '').join('|')}`;
  // With a view, "matched" is the view's (search + filters over every row, or the server's).
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    if (pageSize && pageUrl !== undefined) setPageUrl(undefined, { replace: true });
  }, [filterKey, pageSize, pageUrl, setPageUrl]);

  // Row actions: declared once, split once (splitActions) for the ⋯ menu, the inline button, hover icons, the row's
  // open and keys.
  // A device that cannot hover (a phone, or a fine pointer without hover) never sees the hover icons, so it splits as a
  // touch screen: they stay in ⋯ and the row open shows as a chevron.
  const coarsePointer = useMedia('(pointer: coarse)');
  const noHover = useMedia('(hover: none)');
  const coarse = coarsePointer || noHover;
  const explicitOpen = typeof props.onRowAction === 'function';
  const actionMap = useMemo(() => {
    const m = new Map<string, readonly RowActionEntry[]>();
    if (actions) for (const r of visibleRows) m.set(r.id, actions(r.original));
    if (import.meta.env.DEV) {
      for (const [id, list] of m) {
        const opens = list.filter((a) => a !== '-' && a.rowOpen).length;
        if (opens > 1) throw new Error(`hub DataTable: row ${id} has ${opens} rowOpen actions; a row has one open at most`);
        if (opens === 1 && explicitOpen) throw new Error(`hub DataTable: row ${id} has a rowOpen action and the table an onRowAction; drop onRowAction`);
        if (opens === 1 && pick) throw new Error(`hub DataTable: row ${id} has a rowOpen action in a table whose row click picks; nothing could open it`);
      }
    }
    return m;
  }, [actions, visibleRows, explicitOpen, pick]);
  const pointer = coarse ? 'coarse' : 'fine';
  // A hover-capable pointer reaches the ⋯ only through its row, and the row keeps its icons revealed while that menu is
  // open (DataTable.module.css), so the cell and the menu both split as a hovered or focused row.
  const splitOf = useCallback(
    (id: string, presentation: RowActionState['presentation']) => splitActions(actionMap.get(id) ?? [], { presentation, pointer, rowFocused: true, hovered: false }),
    [actionMap, pointer],
  );
  /** A card or tile draws an actions slot only for something in it: a drawn action, a menu, or the coarse chevron. */
  const drawsActions = (id: string) => {
    const split = splitOf(id, 'cards');
    return split.shown.length > 0 || split.menu.length > 0 || (coarse && split.rowOpen !== undefined);
  };
  const rowOpenOf = (row: Row<T>): RowAction | undefined => (actions ? (actionMap.get(row.id) ?? []).find((a): a is RowAction => a !== '-' && a.rowOpen === true) : undefined);
  /** The row looks and acts openable only when something opens it: an enabled rowOpen, else onRowAction. A disabled
   * rowOpen opens nothing and never falls back to onRowAction. */
  const opens = (row: Row<T>) => {
    const own = rowOpenOf(row);
    return own ? !own.isDisabled : Boolean(onRowAction);
  };
  // A fine pointer draws no control for a rowOpen (the row itself opens): its label becomes the row's accessible
  // description, so a screen reader on the focused row hears what Enter does. A coarse pointer
  // names it on the chevron instead.
  const openDescId = useId();
  const openDescOf = (row: Row<T>): string | undefined => {
    if (coarse) return undefined;
    const own = rowOpenOf(row);
    return own && !own.isDisabled ? own.label : undefined;
  };
  const openRow = (row: Row<T>) => {
    const own = rowOpenOf(row);
    if (own) {
      if (!own.isDisabled) void runMenuAction(own);
      return;
    }
    onRowAction?.(row.original);
  };
  const actionsWidth = useMemo(() => {
    if (actions) {
      let hover = 0;
      let inline = 0;
      let menu = false;
      let chevron = false;
      for (const id of actionMap.keys()) {
        const split = splitOf(id, 'table');
        hover = Math.max(hover, split.shown.filter((a) => !a.inline).length);
        const first = split.shown.find((a) => a.inline);
        if (first) inline = Math.max(inline, inlineWidth(first.short ?? first.label, first.icon !== undefined));
        menu ||= split.menu.length > 0;
        chevron ||= coarse && split.rowOpen !== undefined;
      }
      const w = hover * HOVER_W + inline + (menu ? MENU_W : 0) + (chevron ? MENU_W : 0);
      return w > 0 && !menu && !chevron ? w + CELL_PAD : w;
    }
    return 0;
  }, [actions, actionMap, splitOf, coarse]);
  const hasActions = actionsWidth > 0;
  // A frame that may be cut (`cut` below adds the rail test): its actions column carries the slant's clearance.
  const endWidth = actionsWidth + (hasActions && !bare && !pane.flush && outermost ? CUT_END : 0);

  // A 'fit' column's content width: measured from the data over the loaded filtered rows in data order (the
  // first FIT_ROWS, so a new sort never moves the widths), never from the DOM (virtual rows would move it while
  // scrolling). A column with its own `cell` measures `fitText` (its displayed words); a plain column, its string or
  // number value. Scrolling and resizing never measure again; new rows, new columns (a new locale) and loaded web fonts do.
  const fontsReady = useFontsReady();
  // TanStack keeps the filtered model's rows until the data or a filter changes.
  const fitSample = table.getFilteredRowModel().rows;
  const contentWidths = useMemo(() => {
    const out: Record<string, number> = {};
    const leaves = table.getAllLeafColumns();
    const sample = fitSample;
    leaves.forEach((c) => {
      const meta = c.columnDef.meta;
      if (meta?.size !== 'fit') return;
      const fitText = meta.fitText;
      const custom = c.columnDef.cell !== undefined && c.columnDef.cell !== textCell;
      if (import.meta.env.DEV && !fitText && (custom || !c.accessorFn)) {
        throw new Error(`hub DataTable: column ${c.id} is size 'fit' and draws its own cell (or has no value); give it fitText, the words its cell shows`);
      }
      const texts = sample.map((r) => {
        if (fitText) return fitText(r.original) ?? '';
        const v = r.getValue(c.id);
        return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
      });
      // The first drawn column's lead (a stacked group's indent, a row's expand chevron) and the edge cells' padding are
      // the planner's (Edges): which column is first is known only once hidden and dropped columns are gone.
      const m = meta.fitMetrics;
      out[c.id] = m
        ? textWidth(texts, { ...m, pad: (m.pad ?? 0) + FIT_CELL_PAD + (meta.fitPad ?? 0), max: meta.maxWidth ?? FIT_MAX })
        : fitWidth(texts, { mono: meta.mono, extra: meta.fitPad ?? 0, max: meta.maxWidth });
    });
    return out;
    // `columns` re-measures when the page swaps its column set (the table instance stays the same).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, columns, fitSample, fontsReady]);

  // The body cell under a hovering pointer owns a native tooltip while its text is cut. It is checked when the
  // pointer comes in and again after every render while it stays (a resize re-plans the widths, a refetch changes the
  // text, a virtual row hands the slot to another row), and cleared when the pointer leaves.
  const clipCell = useRef<HTMLElement | null>(null);
  const clipEnter = useCallback((e: PointerEvent<HTMLElement>) => {
    if (!hoverPointer(e.pointerType)) return;
    if (clipCell.current && clipCell.current !== e.currentTarget) clearClipTitle(clipCell.current);
    clipCell.current = e.currentTarget;
    clipTitle(e.currentTarget);
  }, []);
  const clipLeave = useCallback((e: PointerEvent<HTMLElement>) => {
    clearClipTitle(e.currentTarget);
    if (clipCell.current === e.currentTarget) clipCell.current = null;
  }, []);
  useLayoutEffect(() => {
    const el = clipCell.current;
    if (!el) return;
    if (el.isConnected) clipTitle(el);
    else {
      clearClipTitle(el);
      clipCell.current = null;
    }
  });
  // Unmount: stop watching the hovered cell now, never waiting on an observer callback.
  useEffect(
    () => () => {
      if (clipCell.current) clearClipTitle(clipCell.current);
      clipCell.current = null;
    },
    [],
  );

  // Which columns fit, and how wide each is.
  const plan = useMemo(() => {
    const specs: ColumnSpec[] = [];
    const legacyHidden: string[] = [];
    for (const c of table.getAllLeafColumns()) {
      if (visibility[c.id] === false) continue;
      const meta = c.columnDef.meta;
      if (meta?.table === false) {
        legacyHidden.push(c.id);
        continue;
      }
      if (!meta?.pinned && meta?.hideBelow && width < meta.hideBelow) {
        legacyHidden.push(c.id);
        continue;
      }
      const lbl = headerLabel(c.columnDef as ColumnDef<T, unknown>);
      specs.push({
        id: c.id,
        priority: meta?.pinned ? 1 : (meta?.priority ?? 2),
        pinned: Boolean(meta?.pinned),
        width: meta?.width,
        minWidth: meta?.minWidth,
        grow: meta?.grow,
        size: meta?.size,
        content: contentWidths[c.id],
        headerMin: lbl ? headerWidth(lbl, c.getCanSort()) + (meta?.tip ? (coarse ? TIP_W_COARSE : TIP_W) : 0) : undefined,
      });
    }
    const reserved = (selectable ? (coarsePointer ? CHECK_W_COARSE : CHECK_W) : 0) + endWidth;
    // The row's first cell starts, and its last ends, 4 px further in than the fit measure allows, unless the checkbox
    // or actions cell is there. The first content cell of a row under a group also holds the group indent: .groupIndent
    // pads it --group-indent (24 px, the chevron's lead column and gap) more than its own start (every
    // grouped table, stacked or not). And an expandable table's row chevron: a 20 px button (or its 20 px gap) and
    // .firstCell's --sp-1 gap, 24 px. The planner gives them to the columns at the ends.
    const indent = groupBy && groups?.length && grouped ? (parents ? 2 * GROUP_INDENT : GROUP_INDENT) : 0;
    const edges: Edges = { start: selectable ? 0 : EDGE_PAD, end: hasActions ? 0 : EDGE_PAD, lead: indent + (renderExpanded ? 24 : 0) };
    const p = planColumns(specs, width - reserved, edges);
    const statusId = table.getAllLeafColumns().find((c) => c.columnDef.meta?.list === 'status')?.id;
    return { ...p, dropped: [...legacyHidden, ...p.dropped], fits: tableFits(specs, width - reserved, statusId, edges) };
    // `columns` re-plans when the page swaps its column set (the table instance stays the same).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, columns, visibility, width, selectable, actionsWidth, hasActions, groupBy, groups, grouped, renderExpanded, coarse, coarsePointer, contentWidths, parents, endWidth]);
  const dropped = useMemo(() => new Set(plan.dropped), [plan.dropped]);
  // Two-line list beside a detail, or once the name, status and one more column no longer fit.
  // Cards share the list's toolbar, view menu and selection rules; only the rows are drawn as cards. Beside a fill-mode
  // detail (the pane asks for list rows) cards give way to list rows.
  const asCards = presentation === 'cards' && pane.presentation !== 'list';
  // Icons take the cards' path: the list's toolbar and rules, tiles instead of cards.
  const asIcons = presentation === 'icons' && pane.presentation !== 'list';
  const asTiles = asCards || asIcons;
  // Cards beside a detail pane give way to list rows (never to the wide table).
  const asList = presentation === 'cards' || presentation === 'icons' || presentation === 'list' || (presentation === 'auto' && (pane.presentation === 'list' || !plan.fits));
  // A row's own controls take the size its table asks for, set here and never by a token: the kit Button's `sm` at the
  // default density (the ⋯ is as tall as the inline button beside it); `xs` (the touch hit built in) in a compact table
  // and in a left rail, whose ⋯ column is as wide as the ⋯.
  const rowSize = density === 'compact' || (pane.rail && asList && !asCards && !asIcons) ? 'xs' : 'sm';
  // A table row's ⋯ is the small grey plate. A list row's is one look at every width, rail or not, selected
  // or not: the plain ghost dots of a page header's ⋯ (ActionMenu `plain`); on a coarse pointer its box is --icon-hit.
  const listRowMenu = asList && !asTiles;
  const menuTrigger = listRowMenu ? (
    <IconButton icon="dots" label={t('table.rowActions')} size={rowSize} className={s.rowMore} />
  ) : (
    <IconButton icon="dots" label={t('table.rowActions')} size={rowSize} variant="secondary" more className={s.rowMore} />
  );
  const leafColumns = table.getVisibleLeafColumns().filter((c) => !dropped.has(c.id));

  // Flatten rows, group headers and expanded parts into one list (the virtualizer counts it).
  const filtered = view ? view.isFiltered : (query ?? '').trim() !== '' || (filters?.some((f) => !f.required && f.value !== undefined && f.value !== '') ?? false);
  // While a search or filter is on, every group with a match is open, so a match is never hidden
  // in a collapsed group; a header press then closes it for this search only. Clearing the search
  // brings the page's or the person's collapse back.
  const filterSig = filtered ? `${(query ?? '').trim()}\u0000${(filters ?? []).map((f) => `${f.id}=${f.value ?? ''}`).join('\u0001')}` : '';
  const [searchClosed, setSearchClosed] = useState<{ sig: string; ids: Set<string> }>({ sig: '', ids: new Set() });
  // A new or cleared search forgets the groups closed during the last one (the same search typed
  // again opens them again).
  if (searchClosed.sig !== filterSig) setSearchClosed({ sig: filterSig, ids: new Set() });
  const isCollapsed = useCallback(
    (id: string) => (filtered ? searchClosed.sig === filterSig && searchClosed.ids.has(id) : collapsed.has(id)),
    [filtered, filterSig, searchClosed, collapsed],
  );
  const toggleGroup = (id: string) => {
    if (filtered) {
      const ids = new Set(searchClosed.sig === filterSig ? searchClosed.ids : []);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      setSearchClosed({ sig: filterSig, ids });
      return;
    }
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (collapsedGroups) onCollapsedGroupsChange?.([...next]);
    else setOwnCollapsed(next);
  };

  const items = useMemo<Item<T, Row<T>>[]>(
    () => flattenItems<T, Row<T>>({ rows: visibleRows, groupBy, groups, grouped, isCollapsed, expanded, renderExpanded: Boolean(renderExpanded), viewGroups: Boolean(viewGroups), parents }),
    [visibleRows, groupBy, groups, grouped, isCollapsed, expanded, renderExpanded, viewGroups, parents],
  );
  const rowItems = useMemo(() => items.filter((x): x is Extract<Item<T, Row<T>>, { kind: 'row' }> => x.kind === 'row'), [items]);

  // Cards and icons wrap into a grid: never virtual (pages page or load more instead). Stacked group headers are taller
  // than the fixed 40 px estimate and grow with their extra, so a stacked table is never virtual either.
  const stacked = groupHeader === 'stacked';
  const useVirtual = !asTiles && !stacked && (virtual ?? items.length > 200);
  // Estimates only: a table row 44 (kit/tokens.css --table-row-h), a list row 52/56, a group row 40 as drawn. Every
  // drawn row is measured (vRow below), so a row taller than its estimate (a list row whose line 2 wraps)
  // moves the rows after it by its real height. Its own index attribute: data-index is the row's index among rows
  // (focus finds a row by it), the virtualizer counts items (group and expanded rows too). A row's size is its laid-out
  // height unrounded (the library's own measure rounds, so a 44.5 px row would move every row after it by half a pixel
  // each), and its estimate where nothing is laid out (a 0 height: jsdom, a detached row). Sizes are cached by item
  // identity (itemKey), not position: after a row above collapses, the row that moves up keeps its own size.
  const rowH = asList ? (density === 'compact' ? 52 : 56) : density === 'compact' ? 32 : 44;
  const getItemKey = useCallback((i: number) => { const item = items[i]; return item ? itemKey(item) : i; }, [items]);
  // stickyGroups: the drawn range always holds the header of the group its first item is in, so the header in force
  // stays drawn (and stuck) while that group's rows scroll by far below it.
  const sticksGroups = stickyGroups && !asTiles && items.some((x) => x.kind === 'group');
  const groupStarts = useMemo(() => (sticksGroups ? items.flatMap((x, i) => (x.kind === 'group' ? [i] : [])) : []), [items, sticksGroups]);
  const stickyRange = useCallback(
    (range: Range) => {
      const base = defaultRangeExtractor(range);
      // The header in force, and under nested groups the child in force under it (a child header resets with each
      // top-level one).
      let head = -1;
      let child = -1;
      for (const i of groupStarts) {
        if (i > range.startIndex) break;
        const it = items[i];
        if (it?.kind === 'group' && it.depth === 1) child = i;
        else [head, child] = [i, -1];
      }
      const kept = [head, child].filter((i) => i >= 0 && !base.includes(i));
      return kept.length > 0 ? [...kept, ...base] : base;
    },
    [groupStarts, items],
  );
  // Nested groups under stickyGroups: a sticky cell sticks within the whole table, so only the children of the parent
  // in force (the last top-level header at or above the sticky edge) are sticky; an earlier parent's child would
  // otherwise stay stuck under a later parent. The child sticks under that parent's drawn height (a header whose text
  // wraps, a coarse pointer), set on the table as --group-head-h. Picked on scroll, on a resize of the scroller or the
  // table, and after every render (a virtual window that moved, rows measured anew).
  const nestedSticky = sticksGroups && parents !== undefined;
  const [parentInForce, setParentInForce] = useState<string | undefined>(undefined);
  const pickParent = useCallback(() => {
    const box = scrollRef.current;
    if (!nestedSticky || !box) return;
    const th = asList ? undefined : box.querySelector<HTMLElement>(':scope > table > thead th');
    const edge = (th ? th.getBoundingClientRect().bottom : box.getBoundingClientRect().top) + 1;
    let head: HTMLElement | undefined;
    for (const tr of box.querySelectorAll<HTMLElement>('tr[data-group-top]')) if (tr.getBoundingClientRect().top <= edge) head = tr;
    const h = head?.getBoundingClientRect().height ?? 0;
    const tableEl = box.querySelector<HTMLElement>(':scope > table');
    if (tableEl && h > 0 && tableEl.style.getPropertyValue('--group-head-h') !== `${h}px`) tableEl.style.setProperty('--group-head-h', `${h}px`);
    const id = head?.dataset.groupTop;
    setParentInForce((cur) => (cur === id ? cur : id));
  }, [nestedSticky, asList]);
  useEffect(() => {
    const box = scrollRef.current;
    if (!nestedSticky || !box) return;
    box.addEventListener('scroll', pickParent, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => pickParent());
    ro?.observe(box);
    const tableEl = box.querySelector(':scope > table');
    if (tableEl) ro?.observe(tableEl);
    return () => {
      box.removeEventListener('scroll', pickParent);
      ro?.disconnect();
    };
  }, [nestedSticky, pickParent]);
  // After every render: the drawn headers may have moved without a scroll.
  useEffect(() => {
    if (nestedSticky) pickParent();
  });
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (items[i]?.kind === 'group' ? 40 : rowH),
    getItemKey,
    overscan: 12,
    enabled: useVirtual,
    indexAttribute: 'data-vindex',
    ...(sticksGroups ? { rangeExtractor: stickyRange } : {}),
    measureElement: (el, entry, inst) => {
      const h = entry?.borderBoxSize?.[0]?.blockSize ?? el.getBoundingClientRect().height;
      return h > 0 ? h : inst.options.estimateSize(inst.indexFromElement(el));
    },
  });

  // One row is in the tab order; j/k and arrows move it (roving tabindex).
  const [focusIndex, setFocusIndex] = useState(0);
  // The tab stop belongs to a row, not a position: when rows move (a group above opens or closes,
  // a sort), it follows the same row id.
  const focusId = useRef<string | undefined>(undefined);
  useEffect(() => {
    const id = focusId.current;
    const i = id === undefined ? -1 : rowItems.findIndex((x) => x.row.id === id);
    if (i >= 0) setFocusIndex(i);
  }, [rowItems]);
  useEffect(() => {
    focusId.current = rowItems[focusIndex]?.row.id;
  }, [focusIndex, rowItems]);
  useEffect(() => {
    if (focusIndex >= rowItems.length) setFocusIndex(Math.max(0, rowItems.length - 1));
  }, [focusIndex, rowItems.length]);
  useEffect(() => {
    if (activeId === undefined) return;
    const i = rowItems.findIndex((x) => x.row.id === activeId);
    if (i >= 0) setFocusIndex(i);
  }, [activeId, rowItems]);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const activeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(activeTimer.current), []);
  // What a pending follow calls, kept current every render.
  const activeTargets = useRef({ onActiveChange, follow: pane.follow });
  useLayoutEffect(() => {
    activeTargets.current = { onActiveChange, follow: pane.follow };
  });
  // A context switch (account, realm, computer) drops the old context's per-row state: expanded
  // rows, list checkboxes, and a pending follow of an old row.
  const contextKey = view?.contextKey;
  const lastContext = useRef(contextKey);
  useEffect(() => {
    if (lastContext.current === contextKey) return;
    lastContext.current = contextKey;
    window.clearTimeout(activeTimer.current);
    setExpanded(new Set());
    setListSelecting(false);
    setFocusIndex(0);
  }, [contextKey]);
  const focusRow = useCallback(
    (i: number) => {
      const n = Math.max(0, Math.min(rowItems.length - 1, i));
      setFocusIndex(n);
      const target = rowItems[n];
      if (!target) return;
      if (useVirtual) virtualizer.scrollToIndex(items.indexOf(target), { align: 'auto' });
      requestAnimationFrame(() => {
        bodyRef.current?.querySelector<HTMLElement>(`:scope > tr[data-index="${n}"]`)?.focus();
      });
      if (onActiveChange || pane.follow) {
        window.clearTimeout(activeTimer.current);
        // The wait reads the handlers as they are when it ends: a detail closed inside it (Down then Esc) stays closed.
        activeTimer.current = window.setTimeout(() => {
          const live = activeTargets.current;
          if (live.onActiveChange) live.onActiveChange(target.row.original);
          else live.follow?.(target.row.id);
        }, 150);
      }
    },
    [rowItems, items, useVirtual, virtualizer, onActiveChange, pane.follow],
  );

  const selected = selectedIds ?? new Set<string>();
  // Inside a locked Form the row checkboxes are disabled, so no path may change the selection: every click, key,
  // select-all, Clear and menu command ends here, and this one guard holds them all.
  const locked = useFieldLock(false);
  const setSelected = (next: Set<string>) => {
    if (locked) return;
    onSelectionChange?.(next);
  };
  const toggle = (id: string) => {
    if (pickOne) {
      setSelected(new Set([id]));
      return;
    }
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  // pickOne: one native radio per row, all of one name, so a reader hears "1 of N" and only one can be on.
  const radioName = useId();
  const pickControl = (id: string, on: boolean) =>
    pickOne ? (
      <input type="radio" className={s.pickRadio} name={radioName} checked={on} disabled={locked} aria-label={t('table.selectRow')} onChange={() => toggle(id)} />
    ) : (
      <Checkbox aria-label={t('table.selectRow')} isSelected={on} onChange={() => toggle(id)} />
    );
  const allIds = visibleRows.map((r) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = !allSelected && allIds.some((id) => selected.has(id));
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // openRow: handled once per seq. The row is expanded now; once that render is in, its row comes to the top and its
  // toggle takes the focus (one frame later: the expanded part is drawn by then). The frame is cancelled only when the
  // table goes, never by the render the expansion itself causes.
  const openedSeq = useRef<number | null>(null);
  const openFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(openFrame.current), []);
  useEffect(() => {
    if (!openAsk || openedSeq.current === openAsk.seq) return;
    openedSeq.current = openAsk.seq;
    const at = rowItems.findIndex((it) => it.row.id === openAsk.id);
    const target = rowItems[at];
    if (!target) {
      onRowOpened?.(openAsk.seq);
      return;
    }
    if (renderExpanded && (!canExpand || canExpand(target.row.original))) setExpanded((prev) => (prev.has(openAsk.id) ? prev : new Set(prev).add(openAsk.id)));
    if (useVirtual) virtualizer.scrollToIndex(items.indexOf(target), { align: 'start' });
    const id = openAsk.id;
    cancelAnimationFrame(openFrame.current);
    openFrame.current = requestAnimationFrame(() => {
      const tr = bodyRef.current?.querySelector<HTMLElement>(`:scope > tr[data-row-id="${CSS.escape(id)}"]`);
      tr?.scrollIntoView({ block: 'start', behavior: motionOff() ? 'auto' : 'smooth' });
      tr?.querySelector<HTMLElement>('button[aria-expanded]')?.focus({ preventScroll: true });
    });
    onRowOpened?.(openAsk.seq);
  }, [openAsk, rowItems, items, renderExpanded, canExpand, useVirtual, virtualizer, onRowOpened]);
  // List rows show checkboxes only while selecting (from the view menu or with picks made).
  const listChecks = Boolean(selectable) && asList && (listSelecting || selected.size > 0 || pick);
  const showChecks = Boolean(selectable) && (!asList || listChecks);

  // Icons wrap into lines: up and down move by the tiles of one line, measured from the drawn tiles (the grid reflows
  // with the width, so it is read at the key press).
  const tilesPerLine = () => {
    const tiles = bodyRef.current?.querySelectorAll<HTMLElement>(':scope > tr[data-row-id]') ?? [];
    let n = 0;
    while (n < tiles.length && tiles[n]!.offsetTop === tiles[0]!.offsetTop) n++;
    return Math.max(1, n);
  };
  // One line up or down in the grid. Off the grid, down goes to the last tile only when a lower line exists (a column
  // past the end of a shorter last line); otherwise focus stays: it never slides sideways along its own line.
  const tileStep = (i: number, dir: 1 | -1) => {
    const d = tilesPerLine();
    const to = i + dir * d;
    if (to >= 0 && to < rowItems.length) return to;
    if (dir > 0 && Math.floor(i / d) < Math.floor((rowItems.length - 1) / d)) return rowItems.length - 1;
    return i;
  };
  const page = () => {
    if (!asIcons) {
      // This table's own rows (not a nested table's) drawn wholly in sight, less one: inside the scroller, below its
      // sticky header cells (the th stick, the thead scrolls away; a list's header is screen-reader only, no cover) and
      // inside the window. Rows grow (a wrapped list line 2), so a count from the
      // estimate would step past the rows in sight; a row taller than the view leaves none wholly in sight, a step of 1.
      // The estimate only where nothing is laid out (jsdom).
      const box = scrollRef.current?.getBoundingClientRect();
      const head = asList ? undefined : scrollRef.current?.querySelector<HTMLElement>(':scope > table > thead th')?.getBoundingClientRect();
      const top = Math.max(box?.top ?? 0, head && head.height > 0 ? head.bottom : 0, 0);
      const bottom = Math.min(box?.bottom ?? 0, window.innerHeight);
      const drawn = [...(bodyRef.current?.querySelectorAll<HTMLElement>(':scope > tr[data-row-id]') ?? [])].map((r) => r.getBoundingClientRect()).filter((b) => b.height > 0);
      if (box && box.height > 0 && drawn.length > 0) return Math.max(1, drawn.filter((b) => b.top >= top - 0.5 && b.bottom <= bottom + 0.5).length - 1);
      return Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 400) / rowH) - 1);
    }
    const tileH = bodyRef.current?.querySelector<HTMLElement>(':scope > tr[data-row-id]')?.offsetHeight || 120;
    return tilesPerLine() * Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 400) / tileH) - 1);
  };
  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, row: Row<T>, i: number) => {
    if (e.target !== e.currentTarget || e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case 'j':
      case 'J':
      case 'ArrowDown': {
        const to = asIcons ? tileStep(i, 1) : i + 1;
        if (e.shiftKey && selectable && !pickOne) setSelected(new Set([...selected, row.id, rowItems[to]?.row.id ?? row.id]));
        focusRow(to);
        break;
      }
      case 'k':
      case 'K':
      case 'ArrowUp': {
        const to = asIcons ? tileStep(i, -1) : i - 1;
        if (e.shiftKey && selectable && !pickOne) setSelected(new Set([...selected, row.id, rowItems[to]?.row.id ?? row.id]));
        focusRow(to);
        break;
      }
      case 'Home':
        focusRow(0);
        break;
      case 'End':
        focusRow(rowItems.length - 1);
        break;
      case 'PageDown':
        focusRow(i + page());
        break;
      case 'PageUp':
        focusRow(i - page());
        break;
      case 'Enter':
        if (pick) toggle(row.id);
        else openRow(row);
        break;
      case 'o':
        if (!pick) openRow(row);
        break;
      case 'ArrowRight':
      case 'ArrowLeft':
        // Cards and tiles sit side by side: left and right move between them (a card opens its parts with its chevron).
        if (asTiles) {
          focusRow(i + (e.key === 'ArrowRight' ? 1 : -1));
          break;
        }
        if (!renderExpanded || (canExpand && !canExpand(row.original))) return;
        if ((e.key === 'ArrowRight') !== expanded.has(row.id)) toggleExpanded(row.id);
        break;
      case ' ':
      case 'x':
        if (!selectable) return;
        toggle(row.id);
        break;
      case 'Escape':
        // A selection clears first; the next Esc belongs to the page (closes the detail).
        if (selected.size === 0) return;
        setSelected(new Set());
        setListSelecting(false);
        break;
      case '.':
      case 'ContextMenu':
        e.currentTarget.querySelector<HTMLElement>('[data-row-menu] button')?.click();
        break;
      default: {
        const hit = (actionMap.get(row.id) ?? []).find((a): a is RowAction => a !== '-' && a.key === e.key && !a.isDisabled);
        if (!hit) return;
        void runMenuAction(hit);
      }
    }
    e.preventDefault();
  };
  const onRowClick = (e: MouseEvent<HTMLTableRowElement>, row: Row<T>, i: number) => {
    setFocusIndex(i);
    const el = e.target as HTMLElement;
    if (el.closest('button, a, input, label, [role="checkbox"], [data-row-actions]')) return;
    // A tile is picked by a click (Ctrl or Cmd adds it, as do clicks while selecting) and opened by a double click.
    if (asIcons && selectable !== 'pick') {
      if (!selectable) return;
      if (listSelecting || e.ctrlKey || e.metaKey) toggle(row.id);
      else setSelected(new Set([row.id]));
      return;
    }
    if (listChecks || pick) {
      toggle(row.id);
      return;
    }
    openRow(row);
  };

  // Clearing the filters of a table with no rows at all takes the toolbar away (the empty state has none), and the
  // pressed button with it: focus then goes to the empty state's first control, else to the empty state itself, so a
  // keyboard user is never dropped on the page.
  const clearedFromInside = useRef(false);
  useEffect(() => {
    if (!clearedFromInside.current) return;
    clearedFromInside.current = false;
    const at = document.activeElement;
    if (at && at !== document.body && at.isConnected) return;
    const wrap = wrapRef.current;
    if (!wrap?.hasAttribute('data-dataview-empty')) return;
    (wrap.querySelector<HTMLElement>('button:not([disabled]), a[href]') ?? wrap).focus({ preventScroll: true });
  });
  const clearAll = () => {
    clearedFromInside.current = wrapRef.current?.contains(document.activeElement) ?? false;
    if (view) {
      view.clearAll();
      return;
    }
    setQuery(undefined, { replace: true });
    filters?.forEach((f) => !f.required && f.onChange(undefined));
  };
  const matchedCount = view ? view.matched : filteredRows.length;
  const allCount = view ? view.total : rows.length;
  const selectedRows = rows.filter((r) => selected.has(getRowId(r)));
  const dnd = useTableDrag(
    rowDrag,
    drop,
    (id) => table.getCoreRowModel().rowsById[id]?.original,
    (id) => {
      const one = table.getCoreRowModel().rowsById[id]?.original;
      return selected.has(id) ? selectedRows : one === undefined ? [] : [one];
    },
    // Cards take no drag or drop (their tiles are no rows to aim at).
    asCards,
    getRowId,
  );
  const colCount = asList ? 1 : leafColumns.length + (showChecks ? 1 : 0) + (hasActions ? 1 : 0);
  const nothingYet = !error && !(isLoading && !data) && allCount === 0;
  // A required filter (Active | Ended) picks which rows exist: "none" is that box, not the page.
  const switched = filters?.some((f) => f.required) ?? false;
  // The cross-page data-view spec (dataview-pages.spec.ts) finds every kit data view by these.
  const dataViewMarks = view ? { 'data-dataview': view.keys.q, 'data-dataview-sort': view.keys.sort, 'data-dataview-page': view.keys.page } : {};
  // Test hook (e2e-search, busy.ts): present only while the table loads, kept rows on screen included.
  const busy = busyMark(Boolean(isLoading));

  const virtualItems = useVirtual ? virtualizer.getVirtualItems() : null;
  const padTop = virtualItems && virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) : 0;
  const padBottom = virtualItems && virtualItems.length > 0 ? virtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end ?? 0) : 0;
  // Each drawn item with its index in `items` (the virtualizer's index).
  // A kept sticky header drawn ahead of the range leaves a gap before the range's first item: `gap` is its height.
  const renderItems: Array<{ item: Item<T, Row<T>>; vi: number; gap?: number }> = virtualItems
    ? virtualItems.flatMap((v, k) => {
        const item = items[v.index];
        const prev = k > 0 ? virtualItems[k - 1] : undefined;
        const gap = prev && v.start > prev.end ? v.start - prev.end : 0;
        return item ? [{ item, vi: v.index, ...(gap > 0 ? { gap } : {}) }] : [];
      })
    : items.map((item, vi) => ({ item, vi }));
  // stickyGroups: a spacer of the gap's height before the item it precedes. Every item is wrapped the same way, gap or
  // not, under its own key, so a row never remounts when a gap comes or goes (focus stays). Without the prop, as drawn.
  const withGap = (gap: number | undefined, key: string | number, node: ReactNode): ReactNode =>
    sticksGroups ? (
      <Fragment key={key}>
        {gap ? (
          <tr aria-hidden="true">
            <td colSpan={colCount} style={{ height: gap }} className={s.pad} />
          </tr>
        ) : null}
        {node}
      </Fragment>
    ) : (
      node
    );
  // What a drawn row spreads while virtual: its item index and the virtualizer's measuring ref.
  const vRow = (vi: number) => (useVirtual ? { 'data-vindex': vi, ref: virtualizer.measureElement } : {});

  // Kept rows under a failed refresh get the warning band; with none to keep it is the error state.
  const staleKept = data !== undefined && data.length > 0;
  let state: ReactNode = null;
  if (error && !staleKept) {
    state = <ErrorState onRetry={onRetry} size="sm" body={errorBody} />;
  } else if (isLoading && !data) {
    // A column table draws its loading lines in its own body, one per column (columnSkeleton); list rows keep the block.
    state = asList ? <Skeleton variant="table" rows={8} /> : <LoadingNote />;
  } else if (matchedCount === 0 && (filtered || (allCount > 0 && !switched))) {
    // Pages that pre-filter `data` have allCount 0 under a chip; still the no-match state.
    state = <NoMatchState onClear={clearAll} title={noMatch} size="sm" />;
  } else if (matchedCount === 0 && switched) {
    // An empty box of a required switch (Active | Ended), whether or not the other box has rows: Clear filters keeps
    // the switch, so it could not help; the table's empty state shows, and its toolbar stays so the switch does too.
    state = empty ?? <EmptyState title={t('state.emptyTitle')} size="sm" />;
  }

  // The toolbar fits itself (toolbarSteps): it measures its own row and moves controls only as far as it must. The
  // Cards / List choice changes nothing beside a detail (the pane forces list rows), so it is not offered there.
  const tbActions = toolbarActions ?? [];
  const presentShown = presentChoice !== undefined && pane.presentation !== 'list';
  const cardsOrList = useCardsOrList();
  const presentItems = presentChoice?.items ?? cardsOrList;
  const countShown = !isLoading && !(error && !staleKept);
  // The first read of a column table: one loading line per column, in that column's cell, under the real header.
  const columnSkeleton = !(error && !staleKept) && Boolean(isLoading) && !data && !asList;
  // The second filter tier: the row keeps the segmented filters, the bar under it every chip. Never for list rows (they
  // fold the chips) or below the narrow toolbar, where the bar would take more than two lines.
  const allFilters = filters ?? [];
  const tier = filterBar === 'tier' && !bare && !(asList && !asTiles) && !(width < NARROW_TOOLBAR_BELOW) && allFilters.some((f) => !isSegmentedFilter(f));
  const rowFilters = tier ? allFilters.filter(isSegmentedFilter) : allFilters;
  const barFilters = tier ? allFilters.filter((f) => !isSegmentedFilter(f)) : [];
  // More than CHIP_FACETS_MAX chip facets stay behind the Filters button at every width: decided by their count, never
  // by the room left in the row. A segmented filter is not a chip facet (it is the row's state switch).
  const manyFacets = rowFilters.filter((f) => !isSegmentedFilter(f)).length > CHIP_FACETS_MAX;
  const steps = toolbarSteps({
    filters: rowFilters.length > 0,
    chips: !(asList && !asTiles) && !manyFacets,
    count: countShown,
    present: presentShown,
    actions: tbActions.length > 0,
    end: Boolean(toolbarEnd),
  });
  const toolbarRef = useRef<HTMLDivElement>(null);
  // Clear all alone in row 1 leaves with the filters it clears: focus goes to the first filter control still drawn, in
  // row 1 (a segmented filter, the folded Filters button), else the first chip of the second tier.
  const tierClearFocus = () =>
    toolbarRef.current?.querySelector<HTMLElement>(FILTER_CONTROL) ?? wrapRef.current?.querySelector<HTMLElement>('[data-toolbar-tier="2"]')?.querySelector<HTMLElement>(FILTER_CONTROL);
  // What the row holds, never the values in it: a filter changed in an open popover never resets the fit.
  const fitKey = [
    steps.map((x) => `${x.filters}${x.count ? 1 : 0}${x.present}${x.actions}${x.endRow ? 1 : 0}`).join(','),
    rowFilters.map((f) => `${f.id}:${f.label}:${f.display ?? ''}`).join('|'),
    tbActions.map((a) => `${a.id}:${a.label}`).join('|'),
    countLabel ? 'c' : '',
  ].join('\n');
  const stepIndex = useRowFit(toolbarRef, steps.length - 1, fitKey, !bare && !(selectable && selectedRows.length > 0 && bulkActions));
  const fit = steps[stepIndex] ?? steps[0];

  // Nothing exists yet: the page-area EmptyState, no toolbar. A page's own list (a ListDetailPage list pane, never a
  // bare or embedded table) gives its empty card the table frame's place.
  if (nothingYet && !filtered && !switched) {
    const nothing = empty ?? <EmptyState title={t('state.emptyTitle')} />;
    return (
      <div className={cx(s.nothing, className)} ref={wrapRef} tabIndex={-1} {...dataViewMarks} {...busy} data-dataview-empty="" {...dnd.frameProps}>
        {pane.list && !bare ? <EmptyPlace place="frame">{nothing}</EmptyPlace> : nothing}
        {dnd.hint}
      </div>
    );
  }

  const hideable = table.getAllLeafColumns().filter((c) => c.getCanHide() && !c.columnDef.meta?.pinned && c.columnDef.meta?.table !== false);
  const countText = countLabel ? countLabel(matchedCount) : t('table.rows', { count: matchedCount });
  const showViewMenu = !noViewMenu;
  // "Select rows" / "Stop selecting": a list with a row action only; a picker is always selecting.
  const selectCommand = showViewMenu && Boolean(selectable) && asList && !pick;
  // Cards have no header row to sort by: the toolbar's Sort menu offers the same columns, through the header's own
  // toggle (same order of asc, desc, off, and the same ?sort in the URL).
  // Never a table: false column: its sort is dropped (listOnly), so picking it would do nothing.
  const sortable = asTiles ? table.getAllLeafColumns().filter((c) => c.getCanSort() && visibility[c.id] !== false && !listOnly.has(c.id)) : [];
  // Ids carry a prefix so they never meet the view menu's own (density:, group, select, column ids).
  const sortItems = sortable.map((c) => {
    const dir = c.getIsSorted();
    return (
      <MenuItem key={`sort:${c.id}`} id={`sort:${c.id}`} className={s.menuItem}>
        <span className={s.menuCheck}>{dir && <Icon name={dir === 'asc' ? 'arrow-up' : 'arrow-down'} size="sm" />}</span>
        {c.columnDef.meta?.label ?? (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id)}
        {dir && <span className={SR_ONLY}>{t(dir === 'asc' ? 'table.sortedAsc' : 'table.sortedDesc')}</span>}
      </MenuItem>
    );
  });
  const sortBy = (key: string) => {
    if (key.startsWith('sort:')) table.getColumn(key.slice(5))?.getToggleSortingHandler()?.({});
  };

  const listLayout = planList(
    table
      .getAllLeafColumns()
      .filter((c) => visibility[c.id] !== false)
      .map((c) => ({ id: c.id, role: c.columnDef.meta?.list, priority: c.columnDef.meta?.priority ?? 2, pinned: Boolean(c.columnDef.meta?.pinned), wraps: c.columnDef.meta?.listWraps === true })),
  );
  const listCells = (row: Row<T>) => {
    const byId = new Map(row.getAllCells().map((c) => [c.column.id, c] as const));
    return {
      lead: listLayout.lead ? byId.get(listLayout.lead) : undefined,
      primary: listLayout.primary ? byId.get(listLayout.primary) : undefined,
      status: listLayout.status ? byId.get(listLayout.status) : undefined,
      meta: listLayout.meta.map((id) => byId.get(id)).filter((c): c is Cell<T, unknown> => c !== undefined),
    };
  };
  const cardLayout = planCards(
    table
      .getAllLeafColumns()
      .filter((c) => visibility[c.id] !== false)
      .map((c) => ({ id: c.id, role: c.columnDef.meta?.list, priority: c.columnDef.meta?.priority ?? 2, pinned: Boolean(c.columnDef.meta?.pinned), card: c.columnDef.meta?.card, wraps: c.columnDef.meta?.listWraps === true })),
  );
  const cardCells = (row: Row<T>) => {
    const byId = new Map(row.getAllCells().map((c) => [c.column.id, c] as const));
    const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((c): c is Cell<T, unknown> => c !== undefined);
    return {
      lead: cardLayout.lead ? byId.get(cardLayout.lead) : undefined,
      primary: cardLayout.primary ? byId.get(cardLayout.primary) : undefined,
      status: cardLayout.status ? byId.get(cardLayout.status) : undefined,
      meta: pick(cardLayout.meta),
      foot: pick(cardLayout.foot),
    };
  };
  // A grid of cards is not laid out as a table, so its elements name their table roles (role=table/row/cell).
  const role = (r: string) => (asTiles ? { role: r } : {});
  const renderCell = (c: Cell<T, unknown> | undefined) => (c ? renderColumnCell(c) : null);
  const listLabelOf = (c: Cell<T, unknown>): string | null => {
    const opt = c.column.columnDef.meta?.listLabel;
    if (typeof opt === 'string') return opt;
    return opt === true && typeof c.column.columnDef.header === 'string' ? c.column.columnDef.header : null;
  };
  // A list or card field's label; with the column's tip, the label is the InfoTip's term ("Size", dotted).
  const listLabelNode = (c: Cell<T, unknown>) => {
    const label = listLabelOf(c);
    if (label === null) return null;
    const tip = c.column.columnDef.meta?.tip;
    return (
      <span className={s.listLabel}>
        {tip ? (
          <InfoTip text={tip} subject={label}>
            {label}
          </InfoTip>
        ) : (
          label
        )}
      </span>
    );
  };

  // `part` splits a list row's actions for a rail: the inline word stays on line 2, the ⋯ has its own column.
  const rowActionCell = (row: Row<T>, inList: boolean, part?: 'word' | 'end') => {
    if (!hasActions) return null;
    if (actions) {
      const { rowOpen, shown, menu } = splitOf(row.id, !inList ? 'table' : asCards || asIcons ? 'cards' : 'list');
      const inline = shown.find((a) => a.inline);
      const hover = shown.filter((a) => a !== inline);
      if (part === 'word' && !inline) return null;
      if (part === 'end' && menu.length === 0 && !(coarse && rowOpen)) return null;
      return (
        <div className={s.rowActionsWrap} data-row-size={rowSize}>
          {part !== 'end' && inline && (
            <span data-row-actions="">
              {(() => {
                // A short word shows its whole name as the tooltip, as an icon button does. Disabled with a reason, the
                // soft-disabled Button's own tip says why; a short word's tip then starts with the whole name (as an
                // icon button's "Name. Reason"), so the full label stays in view.
                const named = inline.short !== undefined && inline.short !== inline.label;
                const why = inline.isDisabled && inline.disabledReason ? (named ? `${inline.label}. ${inline.disabledReason}` : inline.disabledReason) : undefined;
                // In a rail list row the word is a text action on its line (no plate, no corner, never taller than the line), so the
                // row ends in words like its neighbours; a danger word keeps its tone. Cards and tiles keep the plate.
                const b = railTextWord && pane.rail && inList && !asCards && !asIcons ? (
                  <TextButton
                    icon={inline.icon}
                    tone={inline.tone === 'danger' ? 'danger' : 'default'}
                    isDisabled={inline.isDisabled}
                    disabledReason={why}
                    onPress={() => void runMenuAction(inline)}
                    aria-label={inline.short !== undefined ? inline.label : undefined}
                  >
                    {inline.short ?? inline.label}
                  </TextButton>
                ) : (
                  <Button
                    size={rowSize}
                    // A tile is narrow: its word gives way (ellipsis) rather than run past the tile.
                    shrink={asIcons}
                    icon={inline.icon}
                    isDisabled={inline.isDisabled}
                    disabledReason={why}
                    onPress={() => void runMenuAction(inline)}
                    {...(inline.tone === 'danger' ? { tone: 'danger' as const } : { variant: 'secondary' as const, chip: false })}
                    aria-label={inline.short !== undefined ? inline.label : undefined}
                  >
                    {inline.short ?? inline.label}
                  </Button>
                );
                // The wrapper stays while the reason comes and goes (its tip only turns off), so the button is the same
                // element and a keyboard user keeps focus on it.
                return named ? (
                  <Tooltip content={inline.label} isDisabled={!!why}>
                    {b}
                  </Tooltip>
                ) : (
                  b
                );
              })()}
            </span>
          )}
          {part === undefined && hover.length > 0 && (
            <div className={s.rowActions} data-row-actions="">
              {hover.map((a) => (
                <IconButton
                  key={a.id}
                  icon={a.icon as IconName}
                  label={a.label}
                  shortcut={a.shortcut ?? a.key?.toUpperCase()}
                  size={rowSize}
                  isDisabled={a.isDisabled}
                  disabledReason={a.disabledReason}
                  onPress={() => void runMenuAction(a)}
                  variant="ghost"
                  tone={a.tone === 'danger' ? 'danger' : undefined}
                />
              ))}
            </div>
          )}
          {part !== 'word' && menu.length > 0 && (
            <div data-row-menu="" data-row-actions="">
              <ActionMenu items={menuOf(menu)} label={t('table.rowActions')} size="sm" trigger={menuTrigger} />
            </div>
          )}
          {part !== 'word' && coarse && rowOpen && (
            <span data-row-open="" data-row-actions="">
              <IconButton icon="chevron-right" label={rowOpen.label} size={rowSize} variant="ghost" isDisabled={rowOpen.isDisabled} disabledReason={rowOpen.disabledReason} onPress={() => void runMenuAction(rowOpen)} />
            </span>
          )}
        </div>
      );
    }
    return null;
  };

  // With the page's server Load more, the note counts the rows read against the server's total (the toolbar
  // count is what matches the search and filters).
  const shownCount = serverMore && view ? view.total : view ? view.rows.length : rows.length;
  const footerNote =
    total !== undefined && total > shownCount && !(view && view.pages > 1)
      ? tt(totalOrder === 'newest' ? 'showing.newest' : 'showing.first', { shown: shownCount, total })
      : undefined;
  const viewPager =
    view && view.pages > 1 && view.pageSize
      ? { page: view.page, pages: view.pages, start: (view.page - 1) * view.pageSize, end: (view.page - 1) * view.pageSize + view.rows.length }
      : null;
  const pager = viewPager ?? (slice && slice.pages > 1 ? slice : null);
  const pagerTotal = view ? view.matched : filteredRows.length;
  const goPage = (n: number) => (view ? view.setPage(n) : setPageUrl(n <= 1 ? undefined : String(n)));
  const canLoadMore = Boolean(onLoadMore) && (view ? view.canShowMore || serverMore : total !== undefined && rows.length < total);
  // Rows still unread on the server keep Load more under a no-match state: matches may be among them.
  const showFooter = !bare && (state === null || serverMore) && (footerNote !== undefined || pager !== null || canLoadMore);
  const showSearch = Boolean(search);
  const hasFilters = Boolean(filters && filters.length > 0);
  const showBulk = Boolean(selectable && selectedRows.length > 0 && bulkActions);
  // A toolbar with nothing in it is not drawn.
  // A table this narrow with only a count has nothing worth a row.
  const showToolbar = !bare && (showBulk || showSearch || hasFilters || showViewMenu || Boolean(toolbarEnd) || Boolean(onRefresh) || tbActions.length > 0 || presentShown || width >= NARROW_TOOLBAR_BELOW);
  // The row does not fit itself while the bulk bar shows (useRowFit is off and gives step 0), so a switch left in it
  // would sit over the bulk actions on a narrow page: it waits in the view menu until the selection clears.
  const presentInMenu = presentShown && (fit.present === 'menu' || showBulk);
  const actionsInMenu = tbActions.length > 0 && fit.actions === 'menu';
  // In the menu a switch is a checkbox item and a plain action a menu item: two sections, so each keeps its role.
  const menuToggles = tbActions.filter((a) => a.onSelectedChange);
  const menuPresses = tbActions.filter((a) => !a.onSelectedChange);
  const showMenu = showViewMenu || presentInMenu || actionsInMenu;
  // Rail (pane.rail): only list rows, and only here do a single-step toolbar's search and the last step's get the tight min.
  const rail = Boolean(pane.rail) && asList && !asCards && !asIcons;
  // No lead cell and no group: the lead column goes, so the text starts at the inset instead of beside an empty strip.
  const railLead = rail && (listLayout.lead !== undefined || (groups?.length ?? 0) > 0 || listChecks);
  const lastFit = (stepIndex > 0 || rail) && stepIndex === steps.length - 1;
  const hasWidths = Object.keys(plan.widths).length > 0 && !asList;
  // A table drawn from a width plan never scrolls sideways. planColumns drops columns until the floors fit and, when
  // even the pinned ones do not, scales them to the room, so the widths always add up to it: the scroller hides its
  // horizontal bar (data-x 'fit'). No flag before the first measure or as a list, where the browser lays out the rows.
  const xFit = hasWidths && Number.isFinite(width) ? 'fit' : undefined;
  // The corner's 18 px slant reaches into the frame's last 18 px. A footer keeps --table-cut clear at its end
  // (DataTable.module.css), so the pager's last button and its focus ring stay whole.
  const cut = !bare && !pane.flush && !rail && outermost;

  return (
    <div className={cx(s.wrap, !bare && !pane.flush && s.framed, fill && s.fill, rail && s.rail, railLead && s.railLead, className)} data-rail={rail ? '' : undefined} data-fill={fill ? '' : undefined} data-density={density} data-table-frame={bare ? undefined : ''} data-table-cut={cut ? '' : undefined} ref={wrapRef} {...dataViewMarks} {...busy} {...dnd.frameProps}>
      {cut && <CardEdge cut={TABLE_CUT} mark="table" />}
      {dnd.hint}
      {view?.isRefreshing && <div className={s.refreshBar} role="progressbar" aria-label={tt('refreshing')} />}
      {showToolbar && (
        <div className={cx(s.toolbar, stacked && s.toolbarStacked, tier && !showBulk && s.toolbarTiered)} ref={toolbarRef} data-fit={lastFit ? 'last' : undefined} {...toolbarSizeProps(toolbarSize)}>
          {showBulk && bulkActions ? (
            <div className={s.bulk}>
              <span className={s.bulkCount}>{t('table.selected', { count: selectedRows.length })}</span>
              {bulkActions(selectedRows)}
              <Button
                variant="ghost"
                size="sm"
                shortcut="Esc"
                // Escape clears from a focused row, not from this button: the badge shows it, nothing announces it here.
                aria-keyshortcuts=""
                onPress={() => {
                  setSelected(new Set());
                  setListSelecting(false);
                }}
              >
                {t('action.clear')}
              </Button>
            </div>
          ) : (
            <>
              {search && (
                <SearchField
                  size="toolbar"
                  value={query ?? ''}
                  onChange={(v) => setQuery(v, { replace: true })}
                  // A rail is too narrow for a page's longer words: the field's plain Search there.
                  placeholder={typeof search === 'string' && !rail ? search : undefined}
                  className={s.search}
                  data-hub-search=""
                />
              )}
              {/* Cards keep the chips while the toolbar has room (they stand in for the wide table, not for list rows). */}
              {rowFilters.length > 0 && (fit.filters === 'chips' ? <FilterChips filters={rowFilters} onClearAll={clearAll} clearOf={tier ? allFilters : undefined} /> : <FiltersButton filters={rowFilters} onClearAll={clearAll} iconOnly={fit.filters === 'icon'} />)}
              {/* With a second tier, Clear all (two or more set) ends this row, not the bar. */}
              {tier && (rowFilters.length === 0 || fit.filters !== 'chips') && <FilterChips filters={[]} onClearAll={clearAll} clearOf={allFilters} focusAfterClear={tierClearFocus} />}
            </>
          )}
          <div className={s.toolbarEnd}>
            {/* A failed read has no count: "0 rows" would claim an answer that never came. */}
            {fit.count && countShown && <span className={s.count}>{countText}</span>}
            {presentShown && presentChoice && !presentInMenu && (
              <PresentationFitContext.Provider value={fit.present === 'icons' ? 'icons' : 'labels'}>
                <PresentationSwitch value={presentChoice.value} onChange={presentChoice.onChange} items={presentChoice.items} />
              </PresentationFitContext.Provider>
            )}
            {!actionsInMenu && tbActions.map((a) => <ToolbarActionControl key={a.id} a={a} />)}
            {showMenu && (
              <MenuTrigger>
                <IconButton icon={showViewMenu ? 'sliders' : 'dots'} label={showViewMenu ? t('table.view') : t('action.more')} size="toolbar" />
                <Popover className={s.popover} placement="bottom end">
                  <Menu
                    className={s.menu}
                    aria-label={showViewMenu ? t('table.view') : t('action.more')}
                    disabledKeys={actionsInMenu ? tbActions.filter((a) => a.isDisabled || a.busy).map((a) => (a.onSelectedChange ? `toggle:${a.id}` : `act:${a.id}`)) : undefined}
                    onAction={(key) => {
                      const k = String(key);
                      // Cards/List and the switches are chosen through their sections' selection (below), not here.
                      if (k.startsWith('present:') || k.startsWith('toggle:')) return;
                      if (k.startsWith('act:')) {
                        tbActions.find((x) => `act:${x.id}` === k)?.onPress?.();
                        return;
                      }
                      sortBy(k);
                      if (k === 'density:normal' || k === 'density:compact') setDensity(k === 'density:compact' ? 'compact' : 'normal');
                      if (k === 'group') setGroupedPref((v) => !v);
                      if (k === 'select') {
                        setListSelecting((v) => !v);
                        if (listSelecting) setSelected(new Set());
                      }
                    }}
                  >
                    {presentInMenu && presentChoice && (
                      <>
                        <MenuSection
                          selectionMode="single"
                          disallowEmptySelection
                          selectedKeys={[`present:${presentChoice.value}`]}
                          onSelectionChange={(keys) => {
                            const k = keys === 'all' ? undefined : [...keys][0];
                            const hit = presentItems.find((p) => `present:${p.id}` === k);
                            if (hit) presentChoice.onChange(hit.id);
                          }}
                        >
                          <Header className={s.menuHead}>{t('table.present')}</Header>
                          {presentItems.map((p) => (
                            <MenuItem key={p.id} id={`present:${p.id}`} className={s.menuItem}>
                              <span className={s.menuCheck}>{presentChoice.value === p.id && <Icon name="check" size="sm" />}</span>
                              {p.label}
                            </MenuItem>
                          ))}
                        </MenuSection>
                        {(actionsInMenu || showViewMenu) && <Separator className={s.menuSep} />}
                      </>
                    )}
                    {actionsInMenu && (
                      <>
                        {menuToggles.length > 0 && (
                          <MenuSection
                            selectionMode="multiple"
                            selectedKeys={menuToggles.filter((a) => a.selected).map((a) => `toggle:${a.id}`)}
                            onSelectionChange={(keys) => {
                              for (const a of menuToggles) {
                                const on = keys === 'all' || keys.has(`toggle:${a.id}`);
                                if (on !== Boolean(a.selected)) a.onSelectedChange?.(on);
                              }
                            }}
                          >
                            {menuToggles.map((a) => (
                              <MenuItem key={a.id} id={`toggle:${a.id}`} className={s.menuItem} textValue={a.label}>
                                <span className={s.menuCheck}>{a.selected && <Icon name="check" size="sm" />}</span>
                                {a.label}
                              </MenuItem>
                            ))}
                          </MenuSection>
                        )}
                        {menuPresses.length > 0 && (
                          <MenuSection>
                            {menuPresses.map((a) => (
                              <MenuItem key={a.id} id={`act:${a.id}`} className={s.menuItem} textValue={a.label}>
                                <span className={s.menuCheck}>{a.icon && <Icon name={a.icon} size="sm" />}</span>
                                {a.label}
                              </MenuItem>
                            ))}
                          </MenuSection>
                        )}
                        {showViewMenu && <Separator className={s.menuSep} />}
                      </>
                    )}
                    {showViewMenu && sortItems.length > 0 && (
                      <>
                        <MenuSection>
                          <Header className={s.menuHead}>{t('table.sortBy')}</Header>
                          {sortItems}
                        </MenuSection>
                        <Separator className={s.menuSep} />
                      </>
                    )}
                    {selectCommand && (
                      <MenuSection>
                        <MenuItem id="select" className={s.menuItem}>
                          <span className={s.menuCheck}>
                            <Icon name={listChecks ? 'x' : 'check'} size="sm" />
                          </span>
                          {listChecks ? tt('select.stop') : tt('select.start')}
                        </MenuItem>
                      </MenuSection>
                    )}
                    {selectCommand && <Separator className={s.menuSep} />}
                    {showViewMenu && groupToggle && groupBy && groups?.length ? (
                      <>
                        <MenuSection>
                          <MenuItem id="group" className={s.menuItem}>
                            <span className={s.menuCheck}>{grouped && <Icon name="check" size="sm" />}</span>
                            {groupToggle.label}
                          </MenuItem>
                        </MenuSection>
                        <Separator className={s.menuSep} />
                      </>
                    ) : null}
                    {showViewMenu && (
                    <MenuSection>
                      <Header className={s.menuHead}>{t('table.density')}</Header>
                      {(['normal', 'compact'] as const).map((d) => (
                        <MenuItem key={d} id={`density:${d}`} className={s.menuItem}>
                          <span className={s.menuCheck}>{density === d && <Icon name="check" size="sm" />}</span>
                          {t(d === 'normal' ? 'table.densityNormal' : 'table.densityCompact')}
                        </MenuItem>
                      ))}
                    </MenuSection>
                    )}
                    {showViewMenu && hideable.length > 0 && !asList && (
                      <>
                        <Separator className={s.menuSep} />
                        <MenuSection
                          selectionMode="multiple"
                          selectedKeys={new Set(hideable.filter((c) => visibility[c.id] !== false).map((c) => c.id))}
                          onSelectionChange={(keys) => {
                            if (keys === 'all') return;
                            setVisibility((prev) => {
                              const next = { ...prev };
                              for (const c of hideable) next[c.id] = keys.has(c.id);
                              return next;
                            });
                          }}
                        >
                          <Header className={s.menuHead}>{t('table.columns')}</Header>
                          {hideable.map((c) => (
                            <MenuItem key={c.id} id={c.id} className={s.menuItem}>
                              {({ isSelected }) => (
                                <>
                                  <span className={s.menuCheck}>{isSelected && <Icon name="check" size="sm" />}</span>
                                  <span className={cx(s.menuLabel, isSelected && dropped.has(c.id) && s.menuMuted)}>
                                    {c.columnDef.meta?.label ?? (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id)}
                                  </span>
                                </>
                              )}
                            </MenuItem>
                          ))}
                        </MenuSection>
                      </>
                    )}
                  </Menu>
                </Popover>
              </MenuTrigger>
            )}
            {/* Without a view menu, Sort by is its own menu (a narrow toolbar has no room for both). */}
            {sortable.length > 0 && !showViewMenu && (
              <MenuTrigger>
                <IconButton icon="chevrons-up-down" label={t('table.sortBy')} size="toolbar" />
                <Popover className={s.popover} placement="bottom end">
                  <Menu className={s.menu} aria-label={t('table.sortBy')} onAction={(key) => sortBy(String(key))}>
                    {sortItems}
                  </Menu>
                </Popover>
              </MenuTrigger>
            )}
            {!fit.endRow && toolbarEnd}
            {onRefresh && <IconButton icon="reload" size="toolbar" label={tt('refresh')} onPress={onRefresh} />}
          </div>
          {fit.endRow && toolbarEnd && <div className={s.toolbarRow2}>{toolbarEnd}</div>}
        </div>
      )}
      {showToolbar && tier && !showBulk && (
        <div className={s.tierBar} data-toolbar-tier="2" {...toolbarSizeProps(toolbarSize)}>
          <FilterChips filters={barFilters} bar />
        </div>
      )}
      {!bare && toolbarNote !== undefined && toolbarNote !== null && toolbarNote !== false && <div className={s.toolbarNote}>{toolbarNote}</div>}
      {Boolean(error) && staleKept && (
        <div className={s.staleBand} role="alert">
          <Icon name="warn" size="sm" />
          <span>{t('table.staleData')}</span>
          {onRetry && (
            <Button variant="ghost" size="sm" onPress={onRetry}>
              {t('action.retry')}
            </Button>
          )}
        </div>
      )}
      {/* data-plan-width: the scroll box width (whole px) this render's plan was made for, written in the same commit as the
          plan, so a test can tell the drawn columns and presentation are the ones for the box's current width. */}
      <div className={cx(s.scroll, maxHeight !== undefined && s.capped)} style={maxHeight !== undefined ? ({ '--dt-cap': `${maxHeight}px` } as CSSProperties) : undefined} ref={scrollCallback} data-plan-width={Number.isFinite(width) ? Math.round(width) : undefined} data-x={xFit}>
        <table className={cx(s.table, lines === 'dashed' && s.ledger, sticksGroups && s.stickyGroups, asList && s.list, asCards && s.cards, asCards && cardRender && s.cardsCustom, asCards && !cardRender && cardShape === 'rail' && s.cardsRail, asIcons && s.icons)} data-group-header={stacked ? 'stacked' : undefined} {...role('table')} aria-label={label} aria-rowcount={(view ? view.matched : filteredRows.length) + 1}>
          {!asList && (
            <colgroup>
              {showChecks && <col className={s.colCheck} />}
              {leafColumns.map((c) => {
                const w = hasWidths ? plan.widths[c.id] : undefined;
                const style = w !== undefined ? { width: `${w}px` } : c.columnDef.meta?.width ? { width: c.columnDef.meta.width } : undefined;
                return <col key={c.id} style={style} />;
              })}
              {hasActions && <col style={{ width: `${endWidth}px` }} />}
            </colgroup>
          )}
          <thead className={cx(s.thead, asList && s.srOnlyHead)} {...role('rowgroup')}>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} {...role('row')}>
                {showChecks && !asList && pickOne && (
                  <th className={s.thCheck} scope="col">
                    <span className={SR_ONLY}>{t('table.selectRow')}</span>
                  </th>
                )}
                {showChecks && !asList && !pickOne && (
                  <th className={s.thCheck} scope="col">
                    <Checkbox
                      aria-label={t('table.selectAll')}
                      isSelected={allSelected}
                      isIndeterminate={someSelected}
                      onChange={(v) => setSelected(v ? new Set([...selected, ...allIds]) : new Set([...selected].filter((id) => !allIds.includes(id))))}
                    />
                  </th>
                )}
                {(asList ? hg.headers.filter((h) => h.column.id === listLayout.primary).slice(0, 1) : hg.headers.filter((h) => !dropped.has(h.column.id))).map((h, hi) => {
                  const meta = h.column.columnDef.meta;
                  const canSort = h.column.getCanSort() && !asList;
                  const dir = h.column.getIsSorted();
                  const label = h.isPlaceholder ? null : canSort ? (
                    <button type="button" className={s.sortBtn} onClick={h.column.getToggleSortingHandler()}>
                      <span className={s.thLabel}>{flexRender(h.column.columnDef.header, h.getContext())}</span>
                      <Icon
                        name={dir === 'asc' ? 'arrow-up' : dir === 'desc' ? 'arrow-down' : 'chevrons-up-down'}
                        size="sm"
                        className={cx(s.sortIcon, dir && s.sortActive)}
                      />
                    </button>
                  ) : (
                    <span className={s.thLabel}>{flexRender(h.column.columnDef.header, h.getContext())}</span>
                  );
                  // The tip sits after the label, outside the sort button: one control never holds another.
                  // The list and cards header is visually hidden: a tip there would be a control no one sees.
                  const head =
                    label && meta?.tip && !asList ? (
                      <span className={s.thTip}>
                        {label}
                        <InfoTip text={meta.tip} subject={headerLabel(h.column.columnDef)} />
                      </span>
                    ) : (
                      label
                    );
                  return (
                    <th
                      key={h.id}
                      {...role('columnheader')}
                      scope="col"
                      className={cx(s.th, meta?.align === 'end' && s.end, meta?.align === 'center' && s.center)}
                      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : canSort ? 'none' : undefined}
                    >
                      {/* Rows keep a chevron slot before their first cell when rows can expand: the header keeps it too,
                          so the first column lines up with its header. */}
                      {hi === 0 && renderExpanded && !asList ? (
                        <span className={s.firstCell}>
                          <span className={s.expanderGap} />
                          {head}
                        </span>
                      ) : (
                        head
                      )}
                    </th>
                  );
                })}
                {hasActions && !asList && (
                  // Named by text for readers (visually hidden), never an aria-label on an empty cell (axe empty-table-header).
                  <th className={s.thActions} scope="col">
                    <span className={SR_ONLY}>{t('table.rowActions')}</span>
                  </th>
                )}
              </tr>
            ))}
          </thead>
          {columnSkeleton && (
            <TableSkeletonBody
              rowClassName={cx(s.tr, s.skelRow)}
              cells={[
                ...(showChecks ? [{ className: s.tdCheck, bar: false }] : []),
                ...leafColumns.map((c) => {
                  const align = c.columnDef.meta?.align;
                  return { className: cx(s.td, align === 'end' && s.end, align === 'center' && s.center), align };
                }),
                ...(hasActions ? [{ className: s.tdActions, bar: false }] : []),
              ]}
            />
          )}
          {state === null && (
            <tbody ref={bodyRef} {...role('rowgroup')}>
              {padTop > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={colCount} style={{ height: padTop }} className={s.pad} />
                </tr>
              )}
              {renderItems.map(({ item, vi, gap }) => withGap(gap, itemKey(item), (() => {
                if (item.kind === 'group') {
                  const open = !isCollapsed(item.group.id);
                  return (
                    <tr
                      key={itemKey(item)}
                      className={cx(
                        s.groupRow,
                        stacked && s.groupRowStacked,
                        !stacked && item.group.extraEnd && s.groupRowEnd,
                        item.depth === 1 && s.groupRowChild,
                        item.depth === 1 && nestedSticky && parents?.get(item.group.id) === parentInForce && s.groupChildInForce,
                      )}
                      {...(parents ? (item.depth === 1 ? { 'data-group-depth': '1' } : { 'data-group-top': item.group.id }) : {})}
                      {...role('row')}
                      {...vRow(vi)}
                    >
                      <td colSpan={colCount} {...role('cell')}>
                        <span className={cx(s.groupInner, stacked && s.groupInnerStacked)}>
                          <button
                            type="button"
                            className={cx(s.groupBtn, stacked && s.groupBtnStacked)}
                            aria-expanded={open}
                            onClick={() => toggleGroup(item.group.id)}
                          >
                            <Icon name={open ? 'chevron-down' : 'chevron-right'} size="sm" />
                            <span className={s.groupLabel}>{item.group.label}</span>
                            <span className={s.groupCount}>{item.group.countLabel ?? item.count}</span>
                          </button>
                          {item.group.text ? (
                            <span className={s.groupText} data-group-text="">{item.group.text}</span>
                          ) : null}
                          {stacked && item.group.extra ? (
                            <span className={s.groupExtra} data-group-extra="">{item.group.extra}</span>
                          ) : item.group.extraEnd && item.group.extra ? (
                            <span className={s.groupExtraEnd} data-group-extra-end="">{item.group.extra}</span>
                          ) : item.group.extra ? (
                            <span className={s.groupExtraInline} data-group-extra-inline="">{item.group.extra}</span>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  );
                }
                if (item.kind === 'note') {
                  // The group's own note: one cell across the row, its action in the tab order between the header and
                  // the group's rows (the rows' roving focus never lands on it).
                  return (
                    <tr key={itemKey(item)} className={s.groupNoteRow} {...role('row')} {...vRow(vi)}>
                      <td colSpan={colCount} {...role('cell')}>
                        <div className={s.groupNote} data-group-note="">
                          {item.group.note}
                        </div>
                      </td>
                    </tr>
                  );
                }
                if (item.kind === 'expanded') {
                  return (
                    <tr key={itemKey(item)} className={s.expandedRow} {...role('row')} {...vRow(vi)}>
                      <td colSpan={colCount} {...role('cell')}>
                        <div className={s.expandedBody}>{renderExpanded?.(item.row.original)}</div>
                      </td>
                    </tr>
                  );
                }
                const { row, index } = item;
                // A row under a group header is indented under its label (its first content cell, never a checkbox or a
                // tile): the group's child.
                const indent = item.inGroup === true;
                // Under a child group (TableGroup.parent): two indents in.
                const deep = item.deep === true;
                const isActive = activeId !== undefined && row.id === activeId;
                const isSelected = selected.has(row.id);
                const expandable = renderExpanded && (!canExpand || canExpand(row.original));
                const chevron = expandable ? (
                  <button
                    type="button"
                    className={s.expander}
                    aria-expanded={expanded.has(row.id)}
                    aria-label={t(expanded.has(row.id) ? 'table.collapseRow' : 'table.expandRow')}
                    onClick={() => toggleExpanded(row.id)}
                  >
                    <Icon name={expanded.has(row.id) ? 'chevron-down' : 'chevron-right'} size="sm" />
                  </button>
                ) : renderExpanded ? (
                  <span className={s.expanderGap} />
                ) : null;
                const rowProps = {
                  'data-index': index,
                  'data-row-id': row.id,
                  'data-mark': rowMark?.(row.original) || undefined,
                  // Enter/click opens the row (dataview-pages.spec.ts expects an effect only then).
                  'data-row-opens': opens(row) && !pick ? '' : undefined,
                  'aria-describedby': !pick && openDescOf(row) !== undefined ? `${openDescId}-${row.index}` : undefined,
                  'aria-rowindex': (slice?.start ?? 0) + index + 2,
                  'aria-selected': selectable ? isSelected : isActive || undefined,
                  tabIndex: index === focusIndex ? 0 : -1,
                  className: cx(s.tr, (opens(row) || listChecks || pick) && s.clickable, isActive && s.active, isSelected && s.selected),
                  onClick: (e: MouseEvent<HTMLTableRowElement>) => onRowClick(e, row, index),
                  onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => onRowKey(e, row, index),
                  onFocus: () => setFocusIndex(index),
                  // Drag and drop (drag.tsx): every presentation but cards.
                  ...dnd.rowProps(row.id, row.original),
                  ...vRow(vi),
                };
                if (asIcons) {
                  const { lead, primary } = cardCells(row);
                  const hasMenu = splitOf(row.id, 'cards').menu.length > 0;
                  return (
                    // A tile, like a card, names its row and cell roles. A double click opens it; a right click opens
                    // the same row menu as its ⋯ button (and `.`).
                    <tr
                      key={itemKey(item)}
                      {...rowProps}
                      className={cx(rowProps.className, (selectable || opens(row)) && s.clickable)}
                      role="row"
                      onDoubleClick={(e: MouseEvent<HTMLTableRowElement>) => {
                        if ((e.target as HTMLElement).closest('button, a, input, label, [role="checkbox"], [data-row-actions]')) return;
                        if (!pick) openRow(row);
                      }}
                      onContextMenu={(e: MouseEvent<HTMLTableRowElement>) => {
                        if (!hasMenu) return;
                        e.preventDefault();
                        setFocusIndex(index);
                        e.currentTarget.querySelector<HTMLElement>('[data-row-menu] button')?.click();
                      }}
                    >
                      {/* eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role */}
                      <td className={s.tileCell} role="cell">
                        {listChecks && (
                          <span className={s.tileCheck}>
                            {pickControl(row.id, isSelected)}
                          </span>
                        )}
                        {lead && <span className={s.tileArt}>{renderCell(lead)}</span>}
                        <span className={s.tileName}>{renderCell(primary)}</span>
                        {hasActions && <div className={s.tileActions}>{rowActionCell(row, true)}</div>}
                      </td>
                    </tr>
                  );
                }
                if (asCards && cardRender) {
                  const menu = (actions ? drawsActions(row.id) : hasActions) ? rowActionCell(row, true) : null;
                  const check = listChecks ? pickControl(row.id, isSelected) : null;
                  return (
                    <tr key={itemKey(item)} {...rowProps} role="row">
                      {/* eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role */}
                      <td className={s.customCardCell} role="cell">
                        {cardRender(row.original, { check, menu })}
                      </td>
                    </tr>
                  );
                }
                if (asCards) {
                  const { lead, primary, status, meta, foot } = cardCells(row);
                  // This row's own menu: an actions callback may give a row nothing (a read-only project), and then
                  // the card draws no menu slot, so no empty band.
                  const cardMenu = actions ? drawsActions(row.id) : hasActions;
                  // A header band (cardShape 'band') holds the row menu at the title's end, so the bottom band has none.
                  const headBand = cardShape === 'band';
                  const bottomMenu = cardMenu && !headBand;
                  return (
                    // A card is laid out as a block, which drops the implicit row and cell roles: it names them (the
                    // row stays the focusable, pressable row it is in table and list). It has the card corner.
                    <tr key={itemKey(item)} {...rowProps} role="row" data-card-cut="">
                      {/* eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role */}
                      <td className={cx(s.cardCell, headBand && s.cardCellBand)} role="cell">
                        <CardEdge row />
                        <div className={cx(s.cardTop, headBand && s.cardHeadBand)}>
                          {listChecks && (
                            <span className={s.listCheck}>
                              {pickControl(row.id, isSelected)}
                            </span>
                          )}
                          {chevron}
                          {lead && <span className={s.listLead}>{renderCell(lead)}</span>}
                          <span className={s.cardTitle}>{renderCell(primary)}</span>
                          {status && <span className={s.listStatus}>{renderCell(status)}</span>}
                          {headBand && cardMenu && <div className={s.cardActions}>{rowActionCell(row, true)}</div>}
                        </div>
                        {meta.length > 0 && (
                          <div className={s.cardBody}>
                            {/* One field per line; an empty cell takes no line. */}
                            {meta.map((c) => (
                              <div key={c.id} className={s.cardItem} data-meta-wraps={c.column.columnDef.meta?.listWraps ? '' : undefined}>
                                {listLabelNode(c)}
                                <span className={s.cardValue}>{renderCell(c)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* One band at the card's bottom: the foot cells (a computer's Restart) at its start,
                            the row menu at its end, on the same line in every card of a row. */}
                        {(foot.length > 0 || bottomMenu) && (
                          <div className={s.cardBottom}>
                            {foot.length > 0 && (
                              <div className={s.cardFoot}>
                                {foot.map((c) => (
                                  <div key={c.id} className={s.cardFootItem}>
                                    {renderCell(c)}
                                  </div>
                                ))}
                              </div>
                            )}
                            {bottomMenu && <div className={s.cardActions}>{rowActionCell(row, true)}</div>}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                }
                if (asList) {
                  const { lead, primary, status, meta } = listCells(row);
                  if (rail) {
                    const fields = status ? [status, ...meta] : meta;
                    return (
                      <tr key={itemKey(item)} {...rowProps}>
                        <td className={cx(s.listCell, indent && s.groupIndent, deep && s.groupIndent2)} data-group-indent={indent ? (deep ? '2' : '') : undefined}>
                          <div className={s.listGrid}>
                            {railLead && (
                              <span className={s.listLead} data-rail-lead="">
                                {listChecks ? pickControl(row.id, isSelected) : lead && renderCell(lead)}
                              </span>
                            )}
                            <div className={s.listLines}>
                              <div className={s.listLine1}>
                                {chevron}
                                <span className={s.listPrimary} data-meta-wraps={primary?.column.columnDef.meta?.listWraps ? '' : undefined}>{renderCell(primary)}</span>
                              </div>
                              <div className={s.listLine2}>
                                <span className={s.listMeta}>
                                  {fields.map((c) => (
                                    <span key={c.id} className={s.listItem} data-meta-wraps={c.column.columnDef.meta?.listWraps ? '' : undefined} data-list-fill={c.column.columnDef.meta?.listFill ? '' : undefined} onPointerEnter={clipEnter} onPointerLeave={clipLeave} onPointerCancel={clipLeave}>
                                      {listLabelNode(c)}
                                      <span className={s.listValue}>{renderCell(c)}</span>
                                    </span>
                                  ))}
                                </span>
                                {rowActionCell(row, true, 'word')}
                              </div>
                            </div>
                            {rowActionCell(row, true, 'end')}
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={itemKey(item)} {...rowProps}>
                      <td className={cx(s.listCell, indent && s.groupIndent, deep && s.groupIndent2)} data-group-indent={indent ? (deep ? '2' : '') : undefined}>
                        <div className={s.listGrid}>
                          {listChecks && (
                            <span className={s.listCheck}>
                              {pickControl(row.id, isSelected)}
                            </span>
                          )}
                          <div className={s.listLines}>
                            <div className={s.listLine1}>
                              {chevron}
                              {lead && <span className={s.listLead}>{renderCell(lead)}</span>}
                              <span className={s.listPrimary} data-meta-wraps={primary?.column.columnDef.meta?.listWraps ? '' : undefined}>{renderCell(primary)}</span>
                              {status && <span className={s.listStatus}>{renderCell(status)}</span>}
                            </div>
                            <div className={s.listLine2}>
                              <span className={s.listMeta}>
                                {/* Whole fields by priority, wrapping whole onto more lines: every field stays in
                                    sight, nothing scrolls. A field wider than the whole line is cut
                                    and, under a hovering pointer, gets its words as a tooltip (clipTitle). */}
                                {/* An empty cell (a cell that renders nothing) takes no place and no separator. */}
                                {/* An opted-in label sits beside the value, so an empty value still hides the field. */}
                                {meta.map((c) => (
                                  <span key={c.id} className={s.listItem} data-meta-wraps={c.column.columnDef.meta?.listWraps ? '' : undefined} data-list-fill={c.column.columnDef.meta?.listFill ? '' : undefined} onPointerEnter={clipEnter} onPointerLeave={clipLeave} onPointerCancel={clipLeave}>
                                    {listLabelNode(c)}
                                    <span className={s.listValue}>{renderCell(c)}</span>
                                  </span>
                                ))}
                              </span>
                              {rowActionCell(row, true)}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={itemKey(item)} {...rowProps}>
                    {showChecks && (
                      <td className={s.tdCheck}>
                        {pickControl(row.id, isSelected)}
                      </td>
                    )}
                    {row
                      .getVisibleCells()
                      .filter((cell) => !dropped.has(cell.column.id))
                      .map((cell, ci) => {
                        const meta = cell.column.columnDef.meta;
                        return (
                          <td
                            key={cell.id}
                            className={cx(s.td, meta?.align === 'end' && s.end, meta?.align === 'center' && s.center, meta?.mono && s.mono, ci === 0 && indent && s.groupIndent, ci === 0 && deep && s.groupIndent2)}
                            data-group-indent={ci === 0 && indent ? (deep ? '2' : '') : undefined}
                            data-cell-wraps={meta?.wraps ? '' : undefined}
                            onPointerEnter={clipEnter}
                            onPointerLeave={clipLeave}
                            onPointerCancel={clipLeave}
                          >
                            {ci === 0 && chevron ? (
                              <span className={s.firstCell}>
                                {chevron}
                                <span className={s.cellText}>{renderCell(cell)}</span>
                              </span>
                            ) : (
                              renderCell(cell)
                            )}
                          </td>
                        );
                      })}
                    {hasActions && <td className={s.tdActions}>{rowActionCell(row, false)}</td>}
                  </tr>
                );
              })()))}
              {padBottom > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={colCount} style={{ height: padBottom }} className={s.pad} />
                </tr>
              )}
            </tbody>
          )}
        </table>
        {/* The rendered rows' open descriptions (openDescOf), read by aria-describedby; never shown. */}
        {!coarse && !pick && actions && (
          <div hidden>
            {renderItems.map(({ item }) => {
              if (item.kind !== 'row') return null;
              const d = openDescOf(item.row);
              return d === undefined ? null : <span key={itemKey(item)} id={`${openDescId}-${item.row.index}`}>{d}</span>;
            })}
          </div>
        )}
        {/* Inside the table's own frame: a page-size empty state there draws no card of its own. */}
        {state && <CardScope>{state}</CardScope>}
      </div>
      {showFooter && (
        <div className={s.footer}>
          {footerNote && <span className={s.count}>{footerNote}</span>}
          {canLoadMore && onLoadMore && (
            <Button size="sm" busy={loadingMore ?? (view?.isRefreshing && view.isLoading)} onPress={onLoadMore}>
              {view && !serverMore ? tt('more') : t('table.loadMore')}
            </Button>
          )}
          {pager && (
            <nav className={s.pager} aria-label={tt('pager.label')}>
              <span className={s.count}>
                {pagerNamed && countLabel
                  ? tt('pager.rangeNamed', { start: pager.start + 1, end: pager.end, count: countLabel(pagerTotal) })
                  : tt('pager.range', { start: pager.start + 1, end: pager.end, total: pagerTotal })}
              </span>
              <IconButton
                icon="chevron-left"
                label={tt('pager.prev')}
                size="sm"
                isDisabled={pager.page <= 1}
                onPress={() => goPage(pager.page - 1)}
              />
              <IconButton icon="chevron-right" label={tt('pager.next')} size="sm" isDisabled={pager.page >= pager.pages} onPress={() => goPage(pager.page + 1)} />
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
