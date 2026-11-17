// Table faults of a drawn frame, from the engine's own layout (no pixels), for the goldens gate beside layoutcheck.ts.
// The kit DataTable marks its nodes (tableMark below): the table, each header cell, each body cell and the action
// column. A fault is something a person would see as a broken table:
//   table-misaligned       a body cell does not start (or is not as wide) where its column's header does
//   table-actions-clipped  the action column reaches past what its table (or the screen) shows: an action out of reach
//   table-ellipsis         a cell text with "..." (three dots), or words cut with a "…" that is not their last character
//                          (one token with a "…" inside is an id shortened on purpose, Ids: "64f0…0001")
//   table-wrap-cut         a cell text that wraps onto more lines than the cell (or a clipping box around it) shows:
//                          its words are cut at a word break with no mark ("ping-" for "ping-health-check"); a cell
//                          text is one line, cut with "…"
//   table-cut-unmarked     a cell text laid out wider than what its cell (or the screen) shows, so its end is clipped
//                          off with no "…" ("POST hooks.example." for a longer address): cut text ends in one "…"
//   table-no-gap           two cells of one row whose drawn words touch: no blank cell between the end of one cell's
//                          text and the start of the next ("startsNot run yet"); a cell keeps the column gap
// A cut under a box that draws its own "…" over the loss (TableClip ClipRow, `__cutMarked`) is marked, not a fault.
// Pure: reads x/y/width/height/plainText/children and the marks; never touches a renderer.
import { cellWidth } from './TableCells';

export type TableRole = 'table' | 'head' | 'cell' | 'actions';
export interface TableMarkInfo { role: TableRole; col?: string }
export interface TableFault { kind: 'table-misaligned' | 'table-actions-clipped' | 'table-ellipsis' | 'table-wrap-cut' | 'table-cut-unmarked' | 'table-no-gap'; path: string; detail: string }

interface Node {
  x: number; y: number; width: number; height: number;
  parent?: Node | null;
  _overflow?: string;
  /** A box declaring it drops what does not fit has an id ending in "~cut" (Box `drops`). */
  id?: string;
  plainText?: string;
  virtualLineCount?: number;
  wrapMode?: string;
  getChildren?: () => Node[];
  __tableMark?: TableMarkInfo;
  /** Set by TableClip ClipRow while it draws its own "…" over what it clips. */
  __cutMarked?: boolean;
  isDestroyed?: boolean;
}

const marks = new Map<string, (n: unknown) => void>();
/** A ref that marks a box for the table check (one stable function per role and column, so React never re-attaches). */
export function tableMark(role: TableRole, col?: string): (n: unknown) => void {
  const key = `${role}\u0000${col ?? ''}`;
  let f = marks.get(key);
  if (!f) {
    f = (n: unknown) => { if (n && typeof n === 'object') (n as Node).__tableMark = { role, col }; };
    marks.set(key, f);
  }
  return f;
}

const kids = (n: Node): Node[] => (typeof n.getChildren === 'function' ? n.getChildren() : []);
const shown = (n: Node): boolean => n.width > 0 && n.height > 0;

/** The right edge actually visible for a node: the nearest clipping ancestors and the screen. */
function visibleRight(n: Node, cols: number): number {
  let r = cols;
  for (let a = n.parent; a; a = a.parent) if (a._overflow === 'hidden' && a.width > 0) r = Math.min(r, a.x + a.width);
  return r;
}

/** The bottom edge actually visible for a node: the nearest clipping ancestors. */
function visibleBottom(n: Node): number {
  let b = Infinity;
  for (let a = n.parent; a; a = a.parent) if (a._overflow === 'hidden' && a.height > 0) b = Math.min(b, a.y + a.height);
  return b;
}

/** The engine's scroll box, by its own three parts (a class name is minified in the ship bundle; layoutcheck's rule). */
const isScrollBox = (n: Node): boolean => { const sb = n as { wrapper?: unknown; viewport?: unknown; content?: unknown }; return sb.wrapper != null && sb.viewport != null && sb.content != null; };
/** A scroll box or one of its own parts (wrapper, viewport, content). */
function isScrollPart(n: Node): boolean {
  if (isScrollBox(n)) return true;
  for (let a = n.parent, i = 0; a && i < 3; a = a.parent, i++) {
    if (!isScrollBox(a)) continue;
    const sb = a as { wrapper?: unknown; viewport?: unknown; content?: unknown };
    return sb.wrapper === n || sb.viewport === n || sb.content === n;
  }
  return false;
}

/** The bottom edge that cuts a cell's own lines: as visibleBottom, but what scrolls above the cell does not count: the
 *  table's rows window (a box declaring it drops what does not fit, `<Box drops>`, id ending "~cut"), and a scroll box
 *  with every box above it (they clip the scroll, not its content). A row at a scroll's edge is cut as any scrolled list
 *  is (layoutcheck exempts both the same way); scrolling shows the rest, so its words are not lost (Hoody AI allowance at
 *  80x24: "spare"'s four-line note at the bottom of the settings page's scroll). The cell's own edge, and any other
 *  clipping box below the scroll, still cut. */
function cellCutBottom(n: Node): number {
  let b = Infinity;
  let above = false;
  for (let a = n.parent; a; a = a.parent) {
    // Past a scroll, every box above clips the scroll, not its content: scrolling shows the rest.
    if (above && isScrollPart(a)) break;
    const rowsWindow = above && typeof a.id === 'string' && a.id.endsWith('~cut');
    if (!rowsWindow && a._overflow === 'hidden' && a.height > 0) b = Math.min(b, a.y + a.height);
    if (a.__tableMark?.role === 'cell') above = true;
  }
  return b;
}

/** A clipping box drawing its own "…" over the loss (TableClip ClipRow) marks every cut under it. */
function markedCut(n: Node): boolean {
  for (let a = n.parent; a; a = a.parent) if (a.__cutMarked === true) return true;
  return false;
}

function textsUnder(n: Node, out: Node[]): void {
  if (typeof n.plainText === 'string') { out.push(n); return; }
  for (const k of kids(n)) textsUnder(k, out);
}

function checkTable(t: Node, cols: number, faults: TableFault[], at: string): void {
  const heads = new Map<string, Node>();
  const cells: Node[] = [];
  let actions: Node[] = [];
  const walk = (n: Node): void => {
    const m = n.__tableMark;
    if (m && n !== t) {
      if (m.role === 'table') return; // a nested table checks itself
      if (m.role === 'head' && m.col && shown(n)) heads.set(m.col, n);
      if (m.role === 'cell' && m.col && shown(n)) cells.push(n);
      if (m.role === 'actions' && shown(n)) actions.push(n);
    }
    for (const k of kids(n)) walk(k);
  };
  walk(t);
  for (const c of cells) {
    const h = heads.get(c.__tableMark!.col!);
    if (h && (h.x !== c.x || h.width !== c.width)) {
      faults.push({ kind: 'table-misaligned', path: `${at} > column ${c.__tableMark!.col}`, detail: `cell at x ${c.x} width ${c.width}, header at x ${h.x} width ${h.width} (row y ${c.y})` });
      break; // one per column set is enough to read
    }
  }
  // Drawn words of neighbouring cells on one row: at least one blank cell between them.
  const ink = (c: Node): { from: number; to: number } | null => {
    const ts: Node[] = [];
    textsUnder(c, ts);
    const right = Math.min(c.x + c.width, visibleRight(c, cols));
    let from = Infinity;
    let to = -Infinity;
    for (const x of ts) {
      const line = (x.plainText ?? '').split('\n')[0] ?? '';
      const lead = line.length - line.trimStart().length;
      const body = line.trim();
      if (!body || x.y !== c.y || x.x >= right) continue;
      const start = x.x + cellWidth(line.slice(0, lead));
      from = Math.min(from, start);
      to = Math.max(to, Math.min(start + cellWidth(body), right));
    }
    return from === Infinity ? null : { from, to };
  };
  const byRow = new Map<number, Node[]>();
  for (const c of cells) { const r = byRow.get(c.y) ?? []; r.push(c); byRow.set(c.y, r); }
  touch: for (const [y, row] of byRow) {
    row.sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) {
      const a = ink(row[i - 1]!);
      const b = ink(row[i]!);
      if (a && b && b.from <= a.to) {
        faults.push({ kind: 'table-no-gap', path: `${at} > column ${row[i]!.__tableMark!.col}`, detail: `column ${row[i - 1]!.__tableMark!.col}'s words end at x ${a.to}, column ${row[i]!.__tableMark!.col}'s start at x ${b.from} (row y ${y}): no blank cell between` });
        break touch;
      }
    }
  }
  actions = actions.slice(0, 50);
  for (const a of actions) {
    const right = visibleRight(a, cols);
    if (a.x + a.width > right) {
      faults.push({ kind: 'table-actions-clipped', path: `${at} > actions`, detail: `actions end at x ${a.x + a.width}, visible to x ${right} (row y ${a.y})` });
      break;
    }
  }
  const texts: Node[] = [];
  for (const c of cells) textsUnder(c, texts);
  for (const x of texts) {
    // A control's own "…" (a button opening a dialog: "[Stop sharing…]") ends its words: closing marks after it are not text.
    const s = (x.plainText ?? '').trimEnd().replace(/…[\])›>]+$/, '…');
    // A "…" inside ONE token is a deliberate id shortening (Ids: "64f0…0001", a key's tail "…AcctKey1"); inside words
    // with spaces it is text cut in the middle.
    const mid = s.indexOf('…') >= 0 && s.indexOf('…') !== s.length - 1 && /\s/.test(s);
    const bad = s.includes('...') ? 'three dots "..."' : mid ? 'a "…" before the end' : null;
    if (bad) { faults.push({ kind: 'table-ellipsis', path: `${at} > text`, detail: `${bad} in "${s.slice(0, 60)}" (y ${x.y})` }); break; }
  }
  // A line of a cell below the cell's bottom (a stacked block in a one-line row): lost whole, whatever its width, unless
  // a box marks the loss ("Draft reply to a reader…" for a title over its "Waiting to: …" note).
  drop: for (const c of cells) {
    if (c.y >= visibleBottom(c) || c.x >= visibleRight(c, cols)) continue; // the cell itself is not on screen
    const own: Node[] = [];
    textsUnder(c, own);
    for (const x of own) {
      if (!(x.plainText ?? '').trim() || markedCut(x)) continue;
      if (x.y >= c.y + c.height && x.x < Math.min(visibleRight(x, cols), c.x + c.width)) {
        faults.push({ kind: 'table-wrap-cut', path: `${at} > column ${c.__tableMark?.col ?? '?'}`, detail: `"${(x.plainText ?? '').slice(0, 60)}" is a line of its cell below the row (cell y ${c.y}, line y ${x.y}): lost with no "…"` });
        break drop;
      }
    }
  }
  for (const x of texts) {
    const first = (x.plainText ?? '').split('\n')[0]!.trimEnd();
    if (!first || first.endsWith('…') || markedCut(x)) continue;
    if (x.y >= visibleBottom(x)) continue; // not on screen at all: a dropped line (above), not a sideways cut
    if (x.wrapMode !== 'none' && (x.virtualLineCount ?? 1) > 1) continue; // wrapped: table-wrap-cut's case
    const right = visibleRight(x, cols);
    if (x.x >= right) continue; // nothing of it shows: dropped whole (a tag giving way), not cut
    if (x.x + cellWidth(first) > right) {
      faults.push({ kind: 'table-cut-unmarked', path: `${at} > text`, detail: `"${first.slice(0, 60)}" needs ${cellWidth(first)} cells from x ${x.x}, shown to x ${right} (y ${x.y}): its end is clipped with no "…"` });
      break;
    }
  }
  for (const x of texts) {
    if (!(x.plainText ?? '').trim()) continue; // a spacer: nothing to lose
    if (x.x >= visibleRight(x, cols) || x.y >= visibleBottom(x)) continue; // dropped whole, not cut
    const lines = x.virtualLineCount ?? 1;
    // Lines past the text's own height, or below what its clipping boxes show (a two-line text in a one-line row).
    const shownLines = Math.max(1, Math.min(x.height, cellCutBottom(x) - x.y));
    if (x.wrapMode !== 'none' && lines > shownLines && !markedCut(x)) {
      faults.push({ kind: 'table-wrap-cut', path: `${at} > text`, detail: `"${(x.plainText ?? '').slice(0, 60)}" wraps to ${lines} lines, ${shownLines} shown (y ${x.y}): only "${(x.plainText ?? '').slice(0, 20)}…" up to the first break shows, unmarked` });
      break;
    }
  }
}

/** Every marked table under `root`. `cols`: the terminal's width. */
export function tableFaults(root: unknown, term: { cols: number; rows: number }): TableFault[] {
  const faults: TableFault[] = [];
  let i = 0;
  const walk = (n: Node): void => {
    if (n.isDestroyed) return;
    if (n.__tableMark?.role === 'table' && shown(n)) checkTable(n, term.cols, faults, `table #${++i} at ${n.x},${n.y}`);
    for (const k of kids(n)) walk(k);
  };
  walk(root as Node);
  return faults;
}
