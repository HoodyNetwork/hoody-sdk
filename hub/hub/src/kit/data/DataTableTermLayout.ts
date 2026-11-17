// DataTable in a terminal, pure: the web's width planner (DataTableLayout.ts) run in cells, and the window and
// scrollbar math of the virtual rows. No React and no engine, so every rule has a unit test.
//
// Units: a column's plan width includes the space that separates it from the next column (a column draws
// width - gap cells of content, then the gap). So the planner's room is the row's whole width less the marks and the
// actions cell, and no separator is ever counted twice or forgotten when columns drop.
// The gap is WIDE_SEP (2 cells) when the row has room for it, SEP (1) only when tight (planTerm).
import { type ColumnSpec, type ColumnPlan, type ColumnSize, type PlanUnits, columnFloor, planColumns, tableFits, textWidth } from './DataTableLayout';

/** Cells per CSS px of a declared width (a cell is about 8 px wide, prim/tokens SPACE.CELL_W_PX). */
export const PX_PER_CELL = 8;
/** The separator after each column (a space: a mouse selection copies clean text, never a box-drawing glyph): the
 *  least gap, used when the row is tight. */
export const SEP = 1;
/** The gap when the row has room: two cells, so columns read apart at a glance. */
export const WIDE_SEP = 2;
/** The pinned (name) column's least content width in cells (the web's 220 px is 27 cells, too much for 80 columns). */
export const TERM_PINNED_MIN = 16;
/** A column with no declared width (the web's 120 px). */
export const TERM_DEFAULT_MIN = 10;
/** The widest a 'fit' column asks for by default (the web's 320 px). */
export const TERM_FIT_MAX = 40;
/** A free-text ('fill' or unsized) column's content width it gets back from 'fit' columns standing above their floor:
 *  the web's default column floor (120 px). The terminal floor is TERM_DEFAULT_MIN so 80 columns keep their columns,
 *  but a text column is never left at a word or two ("Your …") while a fit neighbour has cells above its own floor. */
export const TERM_FILL_WANT = 15;
/** The cells a free-text column may hold above its content's need before the rest is shared with the other columns
 *  (shareSurplus): room to grow into, never a 150-cell gap between a name and its status on a wide screen. */
export const TERM_TEXT_SLACK = 24;

/** The planner's unit in a terminal for a separator of `sep` cells: cells, each column's separator included. */
export const cellUnits = (sep: number): PlanUnits => ({
  pinnedMin: TERM_PINNED_MIN + sep,
  defaultMin: TERM_DEFAULT_MIN + sep,
  declared: (px) => Math.max(3, Math.round(px / PX_PER_CELL)) + sep,
});
/** The planner's unit in a terminal: cells, each column's (one-cell) separator included. */
export const CELL_UNITS: PlanUnits = cellUnits(SEP);

/** What the terminal knows of one column (from its ColumnMeta). */
export interface TermColumn {
  id: string;
  priority: number;
  pinned: boolean;
  width?: string;
  minWidth?: number;
  grow?: number;
  size?: ColumnSize;
  /** The header's words. */
  label: string;
  sortable: boolean;
  /** The header carries an InfoTip "ⓘ" after its words (ColumnMeta.tip; the web's `.thTip`). */
  tip?: boolean;
  /** A 'fit' column's texts (the rows' words), measured in cells. */
  texts?: readonly string[];
  /** A 'fit' column's own cap (px, ColumnMeta.maxWidth). */
  maxWidth?: number;
  /** Extra px beside a 'fit' cell's text (an icon, a dot): one cell per started 8 px. */
  fitPad?: number;
  /** Status words and verbs: never cut. With `texts`, the column is as wide as its widest value, at least. */
  never?: boolean;
  /** The cells its content needs (its widest drawn cell, measured by the table), when known. A fixed-px column grows
   *  to it from slack; any column with it known may give the cells it holds above it (growFixed). */
  want?: number;
}

/** The header needs its words, a space and the sort arrow (when sortable), a space and the "ⓘ" (with a tip), and its
 *  separator. */
export function headerCells(label: string, sortable: boolean, measure: (s: string) => number, sep = SEP, tip = false): number {
  return measure(label) + (sortable ? 2 : 0) + (tip ? TIP_CELLS : 0) + sep;
}
/** A header tip's cells: a space and the "ⓘ". */
export const TIP_CELLS = 2;

/** The planner's specs in cells. `measure` is the cell width of a string (prim TableCells.cellWidth). */
export function termSpecs(columns: readonly TermColumn[], measure: (s: string) => number, sep = SEP): ColumnSpec[] {
  return columns.map((c) => {
    const spec: ColumnSpec = { id: c.id, priority: c.pinned ? 1 : c.priority, pinned: c.pinned, width: c.width, grow: c.grow, size: c.size };
    if (c.minWidth !== undefined) spec.minWidth = c.minWidth;
    if (c.label) spec.headerMin = headerCells(c.label, c.sortable, measure, sep, Boolean(c.tip));
    if (c.size === 'fit' && c.texts) {
      const max = c.maxWidth === undefined ? TERM_FIT_MAX : Math.max(3, Math.round(c.maxWidth / PX_PER_CELL));
      const pad = c.fitPad ? Math.ceil(c.fitPad / PX_PER_CELL) : 0;
      spec.content = textWidth(c.texts, { font: '', glyph: 1, measure, pad, max: max + pad }) + sep;
    }
    if (c.never && c.texts && c.texts.length) {
      // Its widest value whole, however long: the floor the planner never goes under (it drops other columns first).
      const pad = c.fitPad ? Math.ceil(c.fitPad / PX_PER_CELL) : 0;
      const widest = textWidth(c.texts, { font: '', glyph: 1, measure, pad, max: Infinity });
      spec.minWidth = Math.max(c.minWidth ?? 0, widest * PX_PER_CELL);
      if (c.size === undefined && c.width === undefined) { spec.size = 'fit'; spec.content = widest + sep; }
    }
    return spec;
  });
}

export interface TermPlan extends ColumnPlan {
  /** Content cells of each visible column (its plan width less the separator). */
  cells: Record<string, number>;
  /** The separator drawn after each column: WIDE_SEP when the row has room, SEP when tight. */
  sep: number;
  /** The table still reads as a table (else: two-line list rows, as the web below its fit). */
  fits: boolean;
}

/** Which columns fit `room` cells and how wide each is; `statusId` is the list-role status column.
 *  The gap is two cells when the row has room for it: the same columns stay, the table still fits, and no column
 *  that wants its words whole ('fit', never-cut) gets fewer cells than it would with one-cell gaps (or than its words
 *  need), and no text column gets fewer than it would (up to TERM_FILL_WANT). Else (tight) one cell, as before: the wide gap never drops a column or cuts a word. */
export function planTerm(columns: readonly TermColumn[], room: number, measure: (s: string) => number, statusId?: string): TermPlan {
  const narrow = planWith(columns, room, measure, statusId, SEP);
  const wide = planWith(columns, room, measure, statusId, WIDE_SEP);
  const same = wide.fits === narrow.fits && wide.visible.length === narrow.visible.length && wide.visible.every((id, i) => narrow.visible[i] === id);
  const fitIds = new Set(columns.filter((c) => c.size === 'fit' || c.never).map((c) => c.id));
  const specs = termSpecs(columns, measure, SEP);
  const need = (id: string) => { const c = specs.find((x) => x.id === id)?.content; return c === undefined ? Infinity : c - SEP; };
  // A text column (fill or unsized) keeps what one-cell gaps give it, up to TERM_FILL_WANT: the wide gap is spacing, never
  // a message cut to a word ("atlas sto…" in notifications at 120x40).
  const keeps = (id: string) => (wide.cells[id] ?? 0) >= Math.min(narrow.cells[id] ?? 0, fitIds.has(id) ? need(id) : TERM_FILL_WANT);
  const roomy = same && wide.visible.every(keeps);
  return shareSurplus(growFixed(roomy ? wide : narrow, columns, measure), columns);
}

/** Terminal-only: a fixed-px column whose content needs more cells than its px give grows up to
 *  that need, one cell at a time, from the column with the most SLACK (cells above its own need: its measured `want`,
 *  its fit content, its header, its floor, whichever is most). Then a text column (fill or unsized) still cut below its
 *  measured `want` takes slack the same way (support at 120x40: Subject cut to "Computer will not s…" while Category,
 *  Status and Last message held cells their words never use); for it a px column gives down to its measured need and
 *  header (its px are room, not words). Fixed columns are served first. A column with no known
 *  need gives nothing, no column goes under its need, the sum and the visible set never change, and the web's meta is
 *  untouched. */
function growFixed(plan: TermPlan, columns: readonly TermColumn[], measure: (s: string) => number): TermPlan {
  if (!plan.fits) return plan;
  const byId = new Map(columns.map((c) => [c.id, c] as const));
  const specOf = new Map(termSpecs(columns, measure, plan.sep).map((c) => [c.id, c] as const));
  const units = cellUnits(plan.sep);
  const fixed = (c: TermColumn) => c.width !== undefined && c.size !== 'fit' && c.size !== 'fill' && !c.never;
  const fit = (c: TermColumn) => c.size === 'fit' && !c.never;
  const text = (c: TermColumn) => !c.never && (c.size === 'fill' || (c.size === undefined && c.width === undefined));
  const cut = (c: TermColumn) => c.want !== undefined && c.want > (plan.cells[c.id] ?? 0);
  // A 'fit' column stopped at its cap (the web's 320 px, TERM_FIT_MAX) or by the room, its words still cut: it grows
  // like a cut text column, from slack only (Notifications at 320: titles cut at 43 cells beside 200 spare in Message).
  const takers = [
    ...plan.visible.filter((id) => { const c = byId.get(id); return c !== undefined && fixed(c) && cut(c); }),
    ...plan.visible.filter((id) => { const c = byId.get(id); return c !== undefined && text(c) && cut(c); }),
    ...plan.visible.filter((id) => { const c = byId.get(id); return c !== undefined && fit(c) && cut(c); }),
  ];
  if (!takers.length) return plan;
  const needOf = (id: string): number => {
    const c = byId.get(id);
    const sp = specOf.get(id);
    if (!c || !sp) return Infinity;
    const content = sp.content === undefined ? c.want : Math.max(c.want ?? 0, sp.content - plan.sep);
    if (content === undefined) return Infinity;
    return Math.max(content, (sp.headerMin ?? 0) - plan.sep, columnFloor(sp, units) - plan.sep);
  };
  // For a cut TEXT column, a px column (its content need known) gives down to that need and its header: its px width is
  // room the web gives it, never words it shows. An explicit minWidth still holds.
  const needForText = (id: string): number => {
    const c = byId.get(id);
    const sp = specOf.get(id);
    if (!c || !sp) return needOf(id);
    const min = c.minWidth === undefined ? 0 : Math.ceil(c.minWidth / PX_PER_CELL);
    // A 'fit' column with a declared px width (the web's floor for it: When, 112 px for "19 days ago") gives the cells
    // that px floor holds above its words, as a px column does (Notifications at 120: Message at 15 cells).
    if (fit(c) && c.width !== undefined && sp.content !== undefined) return Math.max(sp.content - plan.sep, c.want ?? 0, (sp.headerMin ?? 0) - plan.sep, min, 1);
    if (!fixed(c) || c.want === undefined) return needOf(id);
    return Math.max(c.want, (sp.headerMin ?? 0) - plan.sep, min, 1);
  };
  const fixedTakers = new Set(plan.visible.filter((id) => { const c = byId.get(id); return c !== undefined && fixed(c) && cut(c); }));
  const widths = { ...plan.widths };
  const cells = { ...plan.cells };
  for (const id of takers) {
    const want = byId.get(id)!.want!;
    while ((cells[id] ?? 0) < want) {
      let best: string | undefined;
      let spare = 0;
      for (const d of plan.visible) {
        if (d === id) continue;
        const s = (cells[d] ?? 0) - (fixedTakers.has(id) ? needOf(d) : needForText(d));
        if (s > spare) { spare = s; best = d; }
      }
      if (best === undefined) break;
      widths[best] = (widths[best] ?? 0) - 1;
      cells[best] = (cells[best] ?? 0) - 1;
      widths[id] = (widths[id] ?? 0) + 1;
      cells[id] = (cells[id] ?? 0) + 1;
    }
  }
  return { ...plan, widths, cells };
}

/** Terminal-only: a free-text column (fill or unsized) holding more than its content's need plus TERM_TEXT_SLACK gives
 *  the cells above that to every visible column, itself included, in proportion to what each holds for its content
 *  (the text column: its need; the others: their cells), as a browser's auto table layout spreads a wide table. The web
 *  planner gives a table's whole spare width to that one column: right at 1280 px, but at 240 columns Apps drew its
 *  names, 150 empty cells, then State, Opens in and Action at the far edge. Only cells above need + slack move, so a
 *  table at 80 or 120 columns is as before; a column with no known need keeps everything; the sum and the visible set
 *  never change. */
function shareSurplus(plan: TermPlan, columns: readonly TermColumn[]): TermPlan {
  if (!plan.fits || plan.visible.length < 2) return plan;
  const byId = new Map(columns.map((c) => [c.id, c] as const));
  const text = (c: TermColumn | undefined): c is TermColumn => c !== undefined && !c.never && c.want !== undefined && (c.size === 'fill' || (c.size === undefined && c.width === undefined));
  const over = (id: string): number => { const c = byId.get(id); return text(c) ? Math.max(0, (plan.cells[id] ?? 0) - Math.max(c.want!, 1) - TERM_TEXT_SLACK) : 0; };
  const surplus = plan.visible.reduce((n, id) => n + over(id), 0);
  if (surplus <= 0) return plan;
  const widths = { ...plan.widths };
  const cells = { ...plan.cells };
  // Each column's share: what its content needs (a giving text column: its need, its slack is room it keeps anyway; any
  // other column: the cells it holds).
  const hold: Record<string, number> = {};
  for (const id of plan.visible) hold[id] = Math.max(1, over(id) > 0 ? byId.get(id)!.want! : (cells[id] ?? 0));
  const total = plan.visible.reduce((n, id) => n + (hold[id] ?? 0), 0);
  let left = surplus;
  for (const id of plan.visible) {
    const take = over(id);
    const add = Math.floor((surplus * (hold[id] ?? 0)) / total);
    widths[id] = (widths[id] ?? 0) - take + add;
    cells[id] = (cells[id] ?? 0) - take + add;
    left -= add;
  }
  // Whole cells: what the flooring left goes back to the first column that gave.
  const first = plan.visible.find((id) => over(id) > 0)!;
  widths[first] = (widths[first] ?? 0) + left;
  cells[first] = (cells[first] ?? 0) + left;
  return { ...plan, widths, cells };
}

function planWith(columns: readonly TermColumn[], room: number, measure: (s: string) => number, statusId: string | undefined, sep: number): TermPlan {
  const specs = termSpecs(columns, measure, sep);
  const units = cellUnits(sep);
  const plan = planColumns(specs, Math.max(0, room), {}, units);
  const cells: Record<string, number> = {};
  shareWithText(plan, specs, columns, units, sep);
  for (const id of plan.visible) cells[id] = Math.max(1, (plan.widths[id] ?? 0) - sep);
  return { ...plan, cells, sep, fits: tableFits(specs, Math.max(0, room), statusId, {}, units) };
}

/** Moves cells to each free-text column below TERM_FILL_WANT from the 'fit' columns above their floor (never a
 *  never-cut column, never under a floor), one cell at a time from the one with the most to spare. Widths stay whole
 *  and their sum unchanged, so no column drops and the room is never exceeded. */
function shareWithText(plan: ColumnPlan, specs: readonly ColumnSpec[], columns: readonly TermColumn[], units: PlanUnits, sep: number): void {
  const byId = new Map(columns.map((c) => [c.id, c] as const));
  const specOf = new Map(specs.map((c) => [c.id, c] as const));
  const text = plan.visible.filter((id) => { const c = byId.get(id); return c !== undefined && !c.never && (c.size === 'fill' || (c.size === undefined && c.width === undefined)); });
  const donors = plan.visible.filter((id) => { const c = byId.get(id); return c !== undefined && c.size === 'fit' && !c.never; });
  if (!text.length || !donors.length) return;
  const floor = (id: string) => { const sp = specOf.get(id); return sp ? columnFloor(sp, units) : Infinity; };
  for (const id of text) {
    while ((plan.widths[id] ?? 0) - sep < TERM_FILL_WANT) {
      let best: string | undefined;
      for (const d of donors) if ((plan.widths[d] ?? 0) > floor(d) && (best === undefined || (plan.widths[d] ?? 0) - floor(d) > (plan.widths[best] ?? 0) - floor(best))) best = d;
      if (best === undefined) break;
      plan.widths[best] = (plan.widths[best] ?? 0) - 1;
      plan.widths[id] = (plan.widths[id] ?? 0) + 1;
    }
  }
}

// ── Virtual rows: the window math lives in prim/ListWindow.ts (shared with any long list, Logs' own rows too).
export { keepInView, scrollBy, thumb, lineOffsets, windowOf } from '../../term/prim/ListWindow';
