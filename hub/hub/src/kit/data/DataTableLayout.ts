// Pure layout rules of DataTable.
// Kept free of React so every rule has a unit test: which columns fit the table's own width,
// how wide each one is, which cells make up a list-presentation row, and how the sort order is
// written in the URL.
import { hostEnv } from '../../core/host-env';
import { measuringCanvas } from './browserReads.web';

/** What the width plan needs to know about one column. */
export interface ColumnSpec {
  id: string;
  /** 1 (last to drop) to 4 (first to drop). */
  priority: number;
  /** Never dropped by width (the name column). */
  pinned: boolean;
  /** Declared width: '120px', '22%', or undefined (shares the rest). */
  width?: string;
  /** The least width the column's content needs (px). */
  minWidth?: number;
  /** Share of the spare width a flexible column takes (default 1; the pinned column 2). */
  grow?: number;
  /** Width the header label needs to show whole (px), from headerWidth(). */
  headerMin?: number;
  /** How the column takes width: 'fixed' its px `width`; 'fit' its content's width (`content`) and no more; 'fill' the
   * room the others leave. Unset: 'fixed' with a px width, else a share of the spare by `grow`. */
  size?: ColumnSize;
  /** A 'fit' column's measured content width in px, padding included (fitWidth over its text). */
  content?: number;
}

/** How a column takes width (ColumnSpec.size). */
export type ColumnSize = 'fixed' | 'fit' | 'fill';

/** What a row's first cell starts, and its last cell ends, beyond the 12 px a side the fit measure allows (CELL_PAD):
 * DataTable.module.css gives `td:first-child` / `th:first-child` --sp-4 at the start and `td:last-child` /
 * `th:last-child` --actions-pad-end (--sp-4) at the end. The CSS owns the values; DataTable.edges.test.tsx reads it and
 * fails when they move apart. */
export const EDGE_PAD = 4;

/** What the table's own edges add to the columns drawn at them. `start` goes to the first kept
 * column and `end` to the last (both to a column that is the only one), into its floor and its measured content; `lead`
 * (a stacked group's indent, a row's expand chevron) into the first kept column's content only. Only 'fit' columns take
 * them: their width is their measured text, while other columns' widths are design numbers whose text ellipsizes.
 * A side the checkbox or actions cell holds is 0: that cell owns the edge padding. */
export interface Edges {
  start?: number;
  end?: number;
  lead?: number;
}

/** What planColumns returns: the columns kept, the ones dropped and each kept column's width. */
export interface ColumnPlan {
  /** Columns that fit, in their declared order. */
  visible: string[];
  /** Columns dropped for room, first dropped first. */
  dropped: string[];
  /** Width of every visible column in px; they add up to the room given. */
  widths: Record<string, number>;
}

/** The pinned (name) column's least width. */
export const PINNED_MIN = 220;
/** A column with no declared width or minWidth. */
export const DEFAULT_MIN = 120;

/**
 * The unit the planner works in (the width seam). The web plans in CSS px; a terminal plans in cells. A column's
 * declared `width` ('120px') and `minWidth` are px in the column definitions, so `declared` turns them into the plan's
 * unit; `pinnedMin` and `defaultMin` are the two floors in that unit. Every other number given to the planner (room,
 * `content`, `headerMin`, edges) is already in it. Percentages are shares of the room, whatever the unit.
 */
export interface PlanUnits {
  pinnedMin: number;
  defaultMin: number;
  /** A declared px length in the plan's unit. */
  declared: (px: number) => number;
}

/** The web's unit: CSS px as declared. */
export const PX_UNITS: PlanUnits = { pinnedMin: PINNED_MIN, defaultMin: DEFAULT_MIN, declared: (n) => n };
/** @deprecated The toolbar fits itself (toolbarSteps): it measures its own row, never a width threshold. */
export const NARROW_TOOLBAR_BELOW = 840;

// ── Toolbar fit ───────────────────────────────────────────────────────────────────────

/** Where each toolbar control goes at one step of the fit. */
export interface ToolbarStep {
  /** Filter chips in the row, one Filters button with its words, or the Filters button as an icon. */
  filters: 'chips' | 'button' | 'icon';
  /** The result count ("60 computers") at the row's end. */
  count: boolean;
  /** The Cards / List choice: labelled segments, icon segments, or a section of the view menu. */
  present: 'labels' | 'icons' | 'menu';
  /** The page's secondary actions (toolbarActions): in the row, or items of the view menu. */
  actions: 'inline' | 'menu';
  /** The page's own end controls (toolbarEnd) on a second row of their own. */
  endRow: boolean;
}

/** The most chip facets a toolbar draws as chips; a table with more keeps them behind the Filters button. */
export const CHIP_FACETS_MAX = 3;

/** What a toolbar holds; a step that would only move something the toolbar does not have is skipped. */
export interface ToolbarHolds {
  filters: boolean;
  /** List rows always fold the chips into the Filters button. */
  chips: boolean;
  count: boolean;
  present: boolean;
  actions: boolean;
  end: boolean;
}

/**
 * The toolbar's fit, most generous first. DataTable draws step 0, and while its one row is wider than the toolbar it
 * moves to the next step: filters fold into one button before they would wrap; then the count goes; then the
 * Cards / List choice drops its words; then that choice and the secondary actions move into the view menu; then the
 * Filters button keeps only its icon; last, the page's own end controls take a second row. Search keeps its least
 * width throughout, and no label is ever cut: a control either shows whole or moves.
 */
export function toolbarSteps(holds: ToolbarHolds): [ToolbarStep, ...ToolbarStep[]] {
  let cur: ToolbarStep = { filters: holds.filters && holds.chips ? 'chips' : 'button', count: holds.count, present: 'labels', actions: 'inline', endRow: false };
  const steps: [ToolbarStep, ...ToolbarStep[]] = [cur];
  const next = (change: Partial<ToolbarStep>, applies: boolean) => {
    if (!applies) return;
    cur = { ...cur, ...change };
    steps.push(cur);
  };
  next({ filters: 'button' }, holds.filters && holds.chips);
  next({ count: false }, holds.count);
  next({ present: 'icons' }, holds.present);
  next({ present: 'menu', actions: 'menu' }, holds.present || holds.actions);
  next({ filters: 'icon' }, holds.filters);
  next({ endRow: true }, holds.end);
  return steps;
}

function px(width: string | undefined, u: PlanUnits = PX_UNITS): number | undefined {
  const m = /^(\d+(?:\.\d+)?)px$/.exec(width ?? '');
  return m ? u.declared(Number(m[1])) : undefined;
}

function pct(width: string | undefined): number | undefined {
  const m = /^(\d+(?:\.\d+)?)%$/.exec(width ?? '');
  return m ? Number(m[1]) / 100 : undefined;
}

/** The width under which this column's content or header would be cut: what dropping and the list switch (tableFits)
 * read. The same rule whatever the size (a column's `size` moves no drop or list-switch point, and loaded text never
 * moves one): a declared `minWidth` or px `width`, else the pinned column's PINNED_MIN or DEFAULT_MIN, never below
 * the header. */
export function columnFloor(c: ColumnSpec, u: PlanUnits = PX_UNITS): number {
  const own = (c.minWidth === undefined ? undefined : u.declared(c.minWidth)) ?? px(c.width, u) ?? (c.pinned ? u.pinnedMin : u.defaultMin);
  return Math.max(own, c.headerMin ?? 0);
}

/** Where a kept column starts before the spare is shared. Its floor, except a 'fit' column on the default floor whose
 * content (or header) is narrower: it starts at that, and the rest of its floor goes into the spare. Room for its floor
 * was counted when columns were dropped, so this never changes which columns stay. */
function startWidth(c: ColumnSpec, floor: number): number {
  if (sizeOf(c) !== 'fit' || c.content === undefined || c.minWidth !== undefined || px(c.width) !== undefined || c.pinned) return floor;
  return Math.min(floor, Math.max(c.content, c.headerMin ?? 0));
}

/** A column's size as the planner reads it (ColumnSpec.size, defaulted). */
function sizeOf(c: ColumnSpec): ColumnSize | undefined {
  return c.size ?? (px(c.width) !== undefined ? 'fixed' : undefined);
}

/** The edge padding the column at `at` of `count` drawn columns takes (Edges): a 'fit' column at either end, else 0. */
function edgePad(c: ColumnSpec, at: number, count: number, edges: Edges): number {
  if (sizeOf(c) !== 'fit') return 0;
  return (at === 0 ? (edges.start ?? 0) : 0) + (at === count - 1 ? (edges.end ?? 0) : 0);
}

/** The column as drawn at `at` of `count`: its header and content widths with its edge padding (and, first, the row's
 * lead in its content), so what grows toward its content and what starts at its content see the cell as drawn. */
function atEdge(c: ColumnSpec, at: number, count: number, edges: Edges): ColumnSpec {
  const pad = edgePad(c, at, count, edges);
  const lead = at === 0 && sizeOf(c) === 'fit' ? (edges.lead ?? 0) : 0;
  if (pad === 0 && lead === 0) return c;
  return {
    ...c,
    ...(c.headerMin !== undefined ? { headerMin: c.headerMin + pad } : {}),
    ...(c.content !== undefined ? { content: c.content + pad + lead } : {}),
  };
}

/**
 * Which columns fit `room` px and how wide each is.
 *
 * Columns drop one at a time, never a whole priority class at once: the highest priority
 * number first, and among equals the one furthest right. The pinned column never drops;
 * priority-1 columns drop only when nothing else is left to give. The kept columns then
 * share the room: each gets at least its floor (content min or header width, so headers never
 * clip); 'fit' columns then grow toward their content (the narrowest gap first, never past it); percentage columns
 * grow toward their share; the rest goes to 'fill' columns by `grow` (without any, to the columns with no size, then to
 * the percentage columns, then the fit ones). `room` excludes the checkbox and actions columns. `edges`: what the row's
 * first and last cells add (Edges), read for the columns at the ends as they are at each step, the drops included.
 */
export function planColumns(columns: readonly ColumnSpec[], room: number, edges: Edges = {}, units: PlanUnits = PX_UNITS): ColumnPlan {
  if (!Number.isFinite(room)) {
    return { visible: columns.map((c) => c.id), dropped: [], widths: {} };
  }
  let kept = columns.map((c, order) => ({ c, order, floor: columnFloor(c, units) }));
  const dropped: string[] = [];
  // The first and last kept columns change as columns drop, so their edge padding is read afresh each step.
  const total = () => kept.reduce((n, k, i) => n + k.floor + edgePad(k.c, i, kept.length, edges), 0);
  while (total() > room) {
    let pick = -1;
    for (let i = 0; i < kept.length; i++) {
      const k = kept[i];
      if (!k || k.c.pinned) continue;
      const best = pick >= 0 ? kept[pick] : undefined;
      if (!best || k.c.priority > best.c.priority || (k.c.priority === best.c.priority && k.order > best.order)) pick = i;
    }
    if (pick < 0) break;
    const [gone] = kept.splice(pick, 1);
    if (gone) dropped.push(gone.c.id);
    // Never leave the table with nothing: one column always stays.
    if (kept.length === 1) break;
  }
  // The kept columns as drawn: an edge 'fit' column's floor, header and content carry its edge padding from here on.
  kept = kept.map((k, i, all) => ({ c: atEdge(k.c, i, all.length, edges), order: k.order, floor: k.floor + edgePad(k.c, i, all.length, edges) }));

  const widths: Record<string, number> = {};
  for (const k of kept) widths[k.c.id] = startWidth(k.c, k.floor);
  let spare = room - kept.reduce((n, k) => n + (widths[k.c.id] ?? 0), 0);
  if (spare > 0) {
    // Fit columns grow toward their content first, water-filling: the narrowest gap is closed first, and while the
    // spare cannot close every gap the rest split what is left evenly.
    const fits = kept
      .filter((k) => sizeOf(k.c) === 'fit')
      .map((k) => ({ k, gap: Math.max(0, (k.c.content ?? 0) - (widths[k.c.id] ?? 0)) }))
      .sort((a, b) => a.gap - b.gap);
    fits.forEach(({ k, gap }, i) => {
      const add = Math.min(gap, spare / (fits.length - i));
      widths[k.c.id] = (widths[k.c.id] ?? 0) + add;
      spare -= add;
    });
  }
  if (spare > 0) {
    // Percentage columns grow toward their share of the room next.
    for (const k of kept) {
      const share = sizeOf(k.c) === undefined ? pct(k.c.width) : undefined;
      if (share === undefined || spare <= 0) continue;
      const add = Math.min(spare, Math.max(0, share * room - (widths[k.c.id] ?? 0)));
      widths[k.c.id] = (widths[k.c.id] ?? 0) + add;
      spare -= add;
    }
  }
  if (spare > 0) {
    // The rest: 'fill' columns; without any: the unsized columns, then the percentage ones, then the
    // first column (so a table of fit or fixed columns only still fills its room, its first column taking the rest).
    const fill = kept.filter((k) => sizeOf(k.c) === 'fill');
    const flex = kept.filter((k) => sizeOf(k.c) === undefined && k.c.width === undefined);
    const pcts = kept.filter((k) => sizeOf(k.c) === undefined && pct(k.c.width) !== undefined);
    const pool = [fill, flex, pcts].find((g) => g.length > 0) ?? kept.slice(0, 1);
    const given = (k: (typeof kept)[number]) => k.c.grow ?? (k.c.pinned ? 2 : 1);
    const total = pool.reduce((n, k) => n + Math.max(0, given(k)), 0);
    // Weights that add up to nothing (grow: 0 everywhere) share evenly.
    const weight = (k: (typeof kept)[number]) => (total > 0 ? Math.max(0, given(k)) / total : 1 / pool.length);
    for (const k of pool) widths[k.c.id] = (widths[k.c.id] ?? 0) + spare * weight(k);
  } else if (spare < 0 && kept.length > 0) {
    // Even the pinned column alone is wider than the room: it takes what there is.
    const scale = room / (room - spare);
    for (const k of kept) widths[k.c.id] = Math.max(0, (widths[k.c.id] ?? 0) * scale);
  }
  // Whole pixels: the leftover pixels go out ONE at a time, round-robin in column
  // order over the 'fit' columns still at least a pixel below their content, never past it. Only when every fit column
  // has its content does the rest go to one column: the widest 'fill' column, else the widest column that is not 'fit',
  // else the first. So the sum stays exact and no fit column ever passes its content while another
  // is still below it.
  let sum = 0;
  for (const k of kept) {
    const w = Math.floor(widths[k.c.id] ?? 0);
    widths[k.c.id] = w;
    sum += w;
  }
  let left = room > sum && kept.length > 0 ? Math.floor(room - sum) : 0;
  const demand = (k: (typeof kept)[number]) => (k.c.content ?? 0) - (widths[k.c.id] ?? 0);
  let wanting = kept.filter((k) => sizeOf(k.c) === 'fit' && demand(k) >= 1);
  while (left > 0 && wanting.length > 0) {
    for (const k of wanting) {
      if (left === 0) break;
      widths[k.c.id] = (widths[k.c.id] ?? 0) + 1;
      left -= 1;
    }
    wanting = wanting.filter((k) => demand(k) >= 1);
  }
  if (left > 0) {
    const widestOf = (group: typeof kept) => group.reduce<(typeof kept)[number] | undefined>((best, k) => (best === undefined || (widths[k.c.id] ?? 0) > (widths[best.c.id] ?? 0) ? k : best), undefined);
    const to = widestOf(kept.filter((k) => sizeOf(k.c) === 'fill')) ?? widestOf(kept.filter((k) => sizeOf(k.c) !== 'fit')) ?? kept[0];
    if (to) widths[to.c.id] = (widths[to.c.id] ?? 0) + left;
  }
  return { visible: kept.map((k) => k.c.id), dropped, widths };
}

/**
 * Does the table still read as a table in `room` px? It does while
 * the name column, the status column and one more column fit at their floors; columns shed by
 * priority before that. A table of one or two columns fits while all of them do. Otherwise
 * DataTable switches to the two-line list. With `edges` that can pad a 'fit' column, which columns are drawn at the ends
 * depends on what the planner drops, so the table fits when the planner's own survivors do: as many columns as that
 * needed set, the `statusId` column among them, at their floors with the end columns' padding.
 */
export function tableFits(columns: readonly ColumnSpec[], room: number, statusId?: string, edges: Edges = {}, units: PlanUnits = PX_UNITS): boolean {
  if (!Number.isFinite(room)) return true;
  if (columns.length === 0) return true;
  const name = columns.find((c) => c.pinned) ?? columns[0];
  const status = columns.find((c) => c.id === statusId && c !== name);
  const rest = columns
    .map((c, order) => ({ c, order }))
    .filter(({ c }) => c !== name && c !== status)
    .sort((a, b) => a.c.priority - b.c.priority || a.order - b.order);
  const need = [name, status, rest[0]?.c].filter((c): c is ColumnSpec => c !== undefined);
  // Without edge padding (no 'fit' column, or both edges held by the checkbox and actions cells), the needed columns at
  // their floors.
  const padded = (edges.start ?? 0) + (edges.end ?? 0) > 0 && columns.some((c) => sizeOf(c) === 'fit');
  if (!padded) return need.reduce((n, c) => n + columnFloor(c, units), 0) <= room;
  // With it, which columns are first and last depends on what the planner drops, so the table fits when the planner's own
  // survivors do: as many columns as the needed set, the status column among them, and
  // their floors with the padding of the columns drawn at the ends within the room. The status column is looked up on
  // its own: `status` above leaves it out when it is also the first-column name.
  const kept = planColumns(columns, room, edges, units).visible.map((id) => columns.find((c) => c.id === id)).filter((c): c is ColumnSpec => c !== undefined);
  if (kept.length < need.length) return false;
  const statusCol = statusId === undefined ? undefined : columns.find((c) => c.id === statusId);
  if (statusCol && !kept.includes(statusCol)) return false;
  return kept.reduce((n, c, i) => n + columnFloor(c, units) + edgePad(c, i, kept.length, edges), 0) <= room;
}

// ── Header widths ─────────────────────────────────────────────────────────────────────

/** Header cell padding (12 + 12) plus the 16 px sort icon and its 4 px gap. */
const HEADER_PAD = 24;
const SORT_ICON = 20;
/** Caps label: Geist Mono 400 at 11 px, tracking 0.03em (--t-label, --tracking-caps). */
const LABEL_TRACKING = 0.33;
/** Geist Mono advance at 11 px (0.6em), used when no canvas can measure. */
const LABEL_GLYPH = 6.6;

let canvas: CanvasRenderingContext2D | null | undefined;

const LABEL_FONT = '400 11px "Geist Mono", ui-monospace, monospace';

/** Text advance in px in `font`; without a canvas (SSR, a test without one, the terminal), `glyph` px per character. */
export function measure(text: string, font = LABEL_FONT, glyph = LABEL_GLYPH): number {
  if (canvas === undefined) {
    try {
      // Only a web page has a canvas; the terminal (no browser global may be read there) measures by `glyph`.
      canvas = hostEnv().browserPage !== true ? null : measuringCanvas();
    } catch {
      canvas = null;
    }
  }
  if (!canvas) return text.length * glyph;
  canvas.font = font;
  return canvas.measureText(text).width;
}

/** Table cell text: --t-body (400 13px, the text face) and --t-mono (400 12px Geist Mono). */
export const CELL_FONT = { sans: '400 13px "Geist", system-ui, sans-serif', mono: '400 12px "Geist Mono", ui-monospace, monospace' } as const;
/** Advance per character when no canvas can measure: about 0.55em of 13 px text, 0.6em of 12 px mono. */
const CELL_GLYPH = { sans: 7.2, mono: 7.2 } as const;
/** A cell's own side padding (--sp-3 each side). */
export const CELL_PAD = 24;
/** The widest a 'fit' column asks for by default (meta.maxWidth): a longer text is cut and gets its tooltip. */
export const FIT_MAX = 320;
/** The most texts fitWidth reads; past it, the rows after are not measured (a few thousand rows stay cheap). */
export const FIT_ROWS = 2000;

/** How a run of text is measured (textWidth): its canvas font (or its own `measure`), the advance per character when no canvas can measure,
 * letter spacing per character, caps (measured upper-cased, as CSS text-transform draws it), the px beside the text
 * (padding, a border, a dot), and the most it may take. */
export interface TextMetrics {
  font: string;
  glyph: number;
  /** The advance of a run in this metric's unit, when it is not canvas px in `font` (the width seam: a terminal
   *  passes its cell width, wide characters 2). Tracking and padding then count in that unit too. */
  measure?: (text: string) => number;
  tracking?: number;
  caps?: boolean;
  pad?: number;
  max?: number;
}

/**
 * The width the widest of `texts` needs in `m` (the first FIT_ROWS; empty ones measure nothing), padding included, at
 * most `m.max`, whole pixels rounded up. From the data, never the DOM. A page's own grid (the Logs list) sizes its tracks
 * with it; DataTable's 'fit' columns use it through fitWidth.
 */
export function textWidth(texts: Iterable<string>, m: TextMetrics): number {
  let widest = 0;
  let n = 0;
  for (const raw of texts) {
    if (n++ >= FIT_ROWS) break;
    if (!raw) continue;
    const t = m.caps ? raw.toUpperCase() : raw;
    widest = Math.max(widest, (m.measure ? m.measure(t) : measure(t, m.font, m.glyph)) + t.length * (m.tracking ?? 0));
  }
  const w = Math.ceil(widest + (m.pad ?? 0));
  return m.max === undefined ? w : Math.min(w, m.max);
}

/**
 * A 'fit' column's content width: the widest of `texts` (the first FIT_ROWS) in the cell font, plus the cell
 * padding and `extra` (an icon or a dot beside the text), at most `max`. Whole pixels, rounded up. Measured from the
 * data, never from the DOM: a virtual table draws only some rows, and a DOM measure would move as it scrolls.
 */
export function fitWidth(texts: Iterable<string>, opts: { mono?: boolean; extra?: number; max?: number } = {}): number {
  const kind = opts.mono ? 'mono' : 'sans';
  return textWidth(texts, { font: CELL_FONT[kind], glyph: CELL_GLYPH[kind], pad: CELL_PAD + (opts.extra ?? 0), max: opts.max ?? FIT_MAX });
}

/** The width a caps header label needs to show whole, padding and sort icon included. */
export function headerWidth(label: string, sortable: boolean): number {
  const text = label.toUpperCase();
  return Math.ceil(measure(text) + text.length * LABEL_TRACKING + HEADER_PAD + (sortable ? SORT_ICON : 0));
}

// ── List presentation ─────────────────────────────────────────────────────────────────

/** A column's role in a list-presentation row. */
export type ListRole = 'primary' | 'status' | 'lead' | 'meta' | false;

/** What planList and planCards need to know about one column. */
export interface ListColumn {
  id: string;
  role: ListRole | undefined;
  priority: number;
  pinned: boolean;
  /** Cards only: 'foot' puts the column in the card's footer, false keeps it off cards. */
  card?: 'foot' | false;
  /** The field wraps onto the lines it needs (column meta `listWraps`): the cap on meta fields never drops it. */
  wraps?: boolean;
}

/** The column ids that make up a 2-line list row (planList). */
export interface ListLayout {
  /** Before the primary text on line 1 (an unread dot, a severity icon). */
  lead?: string;
  /** Line 1, left, never cut before the rest. */
  primary?: string;
  /** Line 1, right (a status pill, a time). */
  status?: string;
  /** Line 2, joined by " · ", most important first. */
  meta: string[];
}

/**
 * Which cells make up a 2-line row. Primary: the column marked 'primary', else the pinned one,
 * else the first. Meta: the columns marked 'meta' in their order, else the remaining columns
 * by priority then order, at most `max` (default 3). Columns marked false never show. A list-only column (meta
 * `table: false`, left out of the table's width plan) takes its role here like any other. The cap keeps one line
 * short, so it never drops a field that wraps (`wraps`): past the first `max` fields only the wrapping ones stay (a
 * table of one such field per plan keeps every plan). A wrapping field among the first `max` still takes its place.
 */
export function planList(columns: readonly ListColumn[], max = 3): ListLayout {
  const usable = columns.filter((c) => c.role !== false);
  const primary = usable.find((c) => c.role === 'primary') ?? usable.find((c) => c.pinned && c.role === undefined) ?? usable.find((c) => c.role === undefined);
  const status = usable.find((c) => c.role === 'status');
  const lead = usable.find((c) => c.role === 'lead');
  const taken = new Set([primary?.id, status?.id, lead?.id]);
  const marked = usable.filter((c) => c.role === 'meta');
  const rest = marked.length > 0 ? marked : usable.filter((c) => !taken.has(c.id) && c.role === undefined);
  const meta = rest
    .map((c, order) => ({ c, order }))
    .sort((a, b) => (marked.length > 0 ? a.order - b.order : a.c.priority - b.c.priority || a.order - b.order))
    .filter((x, i) => i < max || x.c.wraps === true)
    .map((x) => x.c.id);
  return { lead: lead?.id, primary: primary?.id, status: status?.id, meta };
}

/** A card: the list roles (title line = lead, primary, status; body = meta, one field per line, at most `max`, default
 *  4), plus `foot`, the columns marked `card: 'foot'` in their order (a full-width footer, such as a usage block).
 *  Columns marked `card: false` and footer columns never show in the body. */
export interface CardLayout extends ListLayout {
  foot: string[];
}

/** Which cells make up a card (CardLayout): planList over the columns with no `card` mark, plus the footer columns. */
export function planCards(columns: readonly ListColumn[], max = 4): CardLayout {
  const body = columns.filter((c) => c.card === undefined);
  return { ...planList(body, max), foot: columns.filter((c) => c.card === 'foot').map((c) => c.id) };
}

// ── Sort order in the URL ─────────────────────────────────────────────────────────────

/** One sorted column and its direction. */
export interface SortEntry {
  id: string;
  desc: boolean;
}

/** `name` → name ascending, `-name` → descending; anything malformed reads as no sort. */
export function parseSort(value: string | undefined, known: ReadonlySet<string>): SortEntry[] {
  if (!value) return [];
  const desc = value.startsWith('-');
  const id = desc ? value.slice(1) : value;
  return known.has(id) ? [{ id, desc }] : [];
}

/** The URL form of the first sort entry (parseSort's inverse); no entry is no parameter. */
export function formatSort(sort: readonly SortEntry[]): string | undefined {
  const first = sort[0];
  if (!first) return undefined;
  return first.desc ? `-${first.id}` : first.id;
}

// ── Paging ────────────────────────────────────────────────────────────────────────────

/** One page of a client-paged table: its number, the page count and the row range [start, end). */
export interface PageSlice {
  /** 1-based page actually shown (clamped). */
  page: number;
  pages: number;
  start: number;
  end: number;
}

/** The rows of one page; a page past the end shows the last one. */
export function pageSlice(count: number, pageSize: number, page: number): PageSlice {
  const size = Math.max(1, Math.floor(pageSize));
  const pages = Math.max(1, Math.ceil(count / size));
  const p = Math.min(pages, Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1));
  const start = (p - 1) * size;
  return { page: p, pages, start, end: Math.min(count, start + size) };
}
