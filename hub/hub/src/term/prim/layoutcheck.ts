// Layout faults of a drawn frame, from the engine's own layout (no pixels): what the goldens gate fails on.
//   overdraw  two in-flow siblings laid out on the same cells (each paints over the other)
//   cut       an in-flow child laid out past its parent's box (clipped: content the person never sees)
//   text-cut  a wrapping text with more lines than its box is tall (lines lost; truncation is declared, so exempt)
//   offscreen the root is not exactly the terminal, or the first row is not drawn by the app
// Exempt: absolutely placed nodes (overlays, badges), a scroll box's own parts (its content scrolls; found by the
// engine's ScrollBox class and its wrapper/viewport/content members, never by an id a page could also give a box),
// invisible and zero-size nodes, a sticky box stuck over the content it scrolls over (stuckOver). A box whose owner declares that it drops what does not fit (`<Box drops>`: an id
// ending in `~cut`, a one-line chip row, a table cell) exempts only what ITS edge cuts: a node laid past its parent
// is not reported when it also reaches past the nearest such box around it (a cell's long name). A part squeezed
// inside that box (cut by a smaller box within it), two parts on the same cells, or a cut with no declaring box
// around it are always reported.
// Paths name nodes by id (the compat runtime gives raw tags `tag.class` ids; prim nodes their engine ids).

export interface LayoutFault { kind: 'overdraw' | 'cut' | 'text-cut' | 'offscreen' | 'popup-clipped' | 'explosion' | 'scrolled-open'; path: string; detail: string }

/** An absolutely placed box reaching past an enclosing box: every box clips, so the part outside is never drawn.
 *  Popups belong on the overlay Layer (prim/Overlay `Layer` + `useAnchor`). Null when it fits. */
export function clippedAbsolute(n: Node): string | null {
  if (n._positionType !== 'absolute' || n.width <= 0 || n.height <= 0) return null;
  for (let a = n.parent; a && a.parent; a = a.parent) {
    if (a._overflow === 'visible' || a.width <= 0) continue;
    // A scroll box's content runs past its viewport by design: a mark in content scrolled out of view is not a popup
    // cut by its boxes (Home's Quick actions tile below the fold). Only the scroll's width still clips it (it scrolls
    // up and down), and nothing above the scroll sees its content's rows.
    if (isScroll(a)) {
      if (n.x < a.x || n.x + n.width > a.x + a.width)
        return `${n.width}x${n.height} at ${n.x},${n.y} reaches past ${a.id ?? kindOf(a)} ${a.width}x${a.height} at ${a.x},${a.y}`;
      return null;
    }
    if (n.x < a.x || n.y < a.y || n.x + n.width > a.x + a.width || n.y + n.height > a.y + a.height)
      return `${n.width}x${n.height} at ${n.x},${n.y} reaches past ${a.id ?? kindOf(a)} ${a.width}x${a.height} at ${a.x},${a.y}`;
  }
  return null;
}

interface Node {
  id?: string;
  x: number; y: number; width: number; height: number;
  parent?: Node | null;
  _positionType?: string;
  _overflow?: string;
  _visible?: boolean;
  visible?: boolean;
  constructor: { name: string };
  getChildren?: () => Node[];
  wrapMode?: string;
  truncate?: boolean;
  virtualLineCount?: number;
  plainText?: string;
}

const kids = (n: Node): Node[] => (typeof n.getChildren === 'function' ? n.getChildren() : []);
const shown = (n: Node): boolean => n._visible !== false && n.visible !== false && n.width > 0 && n.height > 0;
/** The engine's scroll box, by its own three parts: a class NAME would stop matching in a minified bundle (Box's
 *  popup check ships this), and no other engine node has all three. */
const isScrollBox = (n: Node): boolean => { const sb = n as unknown as { wrapper?: unknown; viewport?: unknown; content?: unknown }; return sb.wrapper != null && sb.viewport != null && sb.content != null; };
/** A plain box (not a scroll box), by the box's own border member, never by its class name (minified in the bundle). */
const isPlainBox = (n: Node): boolean => '_borderStyle' in (n as object) && !isScrollBox(n);
/** What a renderable is, for a message, from its members (its class name is minified in the ship bundle). */
const kindOf = (n: Node): string => (isScrollBox(n) ? 'ScrollBox' : isPlainBox(n) ? 'Box' : typeof n.plainText === 'string' ? 'Text' : 'Renderable');
/** The scroll box itself or one of its own parts (wrapper, viewport, content), by the engine's class and members. */
const isScroll = (n: Node): boolean => {
  if (isScrollBox(n)) return true;
  for (let a = n.parent, i = 0; a && i < 3; a = a.parent, i++) {
    if (!isScrollBox(a)) continue;
    const sb = a as unknown as { wrapper?: unknown; viewport?: unknown; content?: unknown };
    return sb.wrapper === n || sb.viewport === n || sb.content === n;
  }
  return false;
};
const absolute = (n: Node): boolean => n._positionType === 'absolute';
const declares = (n: Node | null | undefined): boolean => n?.id?.endsWith('~cut') === true;
const past = (c: Node, b: Node): boolean => c.x < b.x || c.y < b.y || c.x + c.width > b.x + b.width || c.y + c.height > b.y + b.height;
/** The nearest box at or above `n` that declares it drops what does not fit, or null. */
const dropper = (n: Node | null | undefined): Node | null => { for (let a = n; a; a = a.parent) if (declares(a)) return a; return null; };
/** `c`, laid past its parent `n`, is cut by a declaring box's own edge (it reaches past that box too). */
const cutByDropper = (c: Node, n: Node): boolean => { const d = dropper(n); return d !== null && past(c, d); };
/** An absolute popup clipped inside a declaring box: the declaring box is the one that clips it. */
const allowed = (n: Node | null | undefined): boolean => dropper(n) !== null;
const label = (n: Node): string => (n.id && !/^(box|text|renderable|scrollbox)-\d+$/.test(n.id) ? n.id.replace(/@b?\d+$/, '') : n.constructor.name.replace(/Renderable\d*$/, ''));
function pathOf(n: Node): string {
  const parts: string[] = [];
  for (let a: Node | null | undefined = n; a && parts.length < 6; a = a.parent) {
    const l = label(a).split('<')[0]!;
    if ((a === n || !/^(Box|Text|ScrollBox)$/.test(l)) && parts[parts.length - 1] !== l) parts.push(l);
  }
  return parts.reverse().join(' > ');
}
/** Whether a node can put anything on a cell: a box only through a background, a border or a child that paints; text
 *  when it has any (a space still overwrites a cell). OpenTUI reports a 0x0 box as 1x1 (an anchor, a measuring box):
 *  it paints nothing, so it can neither overdraw nor be cut. */
const paintMemo = new WeakMap<Node, boolean>();
function paints(n: Node): boolean {
  const m = paintMemo.get(n);
  if (m !== undefined) return m;
  const b = n as unknown as { _backgroundColor?: { a?: number }; _border?: unknown };
  let v: boolean;
  if (typeof n.plainText === 'string') v = n.plainText.length > 0;
  else if (isPlainBox(n)) v = (b._backgroundColor?.a ?? 1) > 0 || (b._border !== undefined && b._border !== false) || kids(n).filter(shown).some(paints);
  else v = true;
  paintMemo.set(n, v);
  return v;
}
const overlap = (a: Node, b: Node): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
/** A sticky box (jsx/sticky.ts marks it `__hxSticky` and offsets it by `translateY`, paint only). */
const sticky = (n: Node): boolean => (n as { __hxSticky?: boolean }).__hxSticky === true;
const offsetOf = (n: Node): number => (n as { translateY?: number }).translateY ?? 0;
const inScrollBox = (n: Node): boolean => { for (let a = n.parent; a; a = a.parent) if (isScroll(a)) return true; return false; };
/** True when an overlap is only a sticky box stuck at its place over content it scrolls over (CSS draws it so: the
 *  Bots chat dock over the log while the reader is up the thread): exactly one of the pair is sticky AND offset, the
 *  other is not sticky, the pair sits in a scroll, and at the sticky box's natural place they do not overlap. Two sticky
 *  boxes on each other, a sticky box over a sticky one at rest, or a natural overlap stay faults. */
function stuckOver(a: Node, b: Node): boolean {
  const s = sticky(a) && offsetOf(a) !== 0 ? a : sticky(b) && offsetOf(b) !== 0 ? b : null;
  if (!s) return false;
  const o = s === a ? b : a;
  if (sticky(o) || !inScrollBox(s)) return false;
  return !overlap({ ...s, y: s.y - offsetOf(s) } as Node, o);
}
const text = (n: Node): string => (n.plainText ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);

export function layoutFaults(root: Node, term: { cols: number; rows: number }): LayoutFault[] {
  const out: LayoutFault[] = [];
  const seen = new Set<string>();
  const add = (f: LayoutFault): void => { const k = `${f.kind}|${f.path}`; if (!seen.has(k)) { seen.add(k); out.push(f); } };
  const top = kids(root).filter(shown);
  for (const t of top) {
    if (absolute(t)) continue;
    if (t.width > term.cols || t.height > term.rows || t.x < 0 || t.y < 0)
      add({ kind: 'offscreen', path: pathOf(t), detail: `app ${t.width}x${t.height} at ${t.x},${t.y} in a ${term.cols}x${term.rows} terminal` });
  }
  const walk = (n: Node): void => {
    // A layout explosion (a percent of an indefinite size resolved against garbage): any box over 20 screens wide, or
    // over 20 screens tall. Inside a scroll's content a long document is a real page (the Guide is 557 rows in a
    // 49-cell column at 80x24), so its height is judged at 200 screens there. Its descendants are not reported again.
    const tallest = (isScroll(n) || inScrollBox(n) ? 200 : 20) * term.rows;
    if (n.height > tallest || n.width > 20 * term.cols) { add({ kind: 'explosion', path: pathOf(n), detail: `${n.width}x${n.height} in a ${term.cols}x${term.rows} terminal` }); return; }
    const cs = kids(n).filter(shown);
    const flow = cs.filter((c) => !absolute(c) && paints(c));
    if (!isScroll(n)) {
      for (const c of flow) {
        if (past(c, n) && !cutByDropper(c, n)) add({ kind: 'cut', path: pathOf(c), detail: `${c.width}x${c.height} at ${c.x},${c.y} past its box ${n.width}x${n.height} at ${n.x},${n.y}${text(c) ? ` "${text(c)}"` : ''}` });
      }
      for (let i = 0; i < flow.length; i++) for (let j = i + 1; j < flow.length; j++) {
        if (overlap(flow[i]!, flow[j]!) && !stuckOver(flow[i]!, flow[j]!)) add({ kind: 'overdraw', path: `${pathOf(flow[i]!)} ⨯ ${label(flow[j]!)}`, detail: `${text(flow[i]!) || flow[i]!.width + 'x' + flow[i]!.height} / ${text(flow[j]!) || flow[j]!.width + 'x' + flow[j]!.height}` });
      }
    }
    // Lines lost under a declaring box's bottom edge are its declared cut (a one-row cell); lost inside it, they are not.
    const textCutDeclared = (): boolean => { const d = dropper(n.parent); return d !== null && n.y + n.height >= d.y + d.height; };
    if (n.virtualLineCount !== undefined && n.truncate !== true && n.wrapMode !== 'none' && n.virtualLineCount > n.height && n.height > 0 && !textCutDeclared())
      add({ kind: 'text-cut', path: pathOf(n), detail: `${n.virtualLineCount} lines in ${n.height} "${text(n)}"` });
    for (const c of cs) { const why = clippedAbsolute(c); if (why && !allowed(c)) add({ kind: 'popup-clipped', path: pathOf(c), detail: why + ' (popups go on the overlay Layer)' }); }
    for (const c of cs) walk(c);
  };
  walk(root);
  return out;
}

/** The shell's top bar box id (TermShell SHELL_TOPBAR_ID; repeated here so the check needs no shell import). */
export const TOP_BAR_ID = 'hub-shell-topbar';
/** Null when the app's top bar is laid out in flow at row 0, the full terminal width and one row tall; else what is
 *  wrong. Read from the layout, not the frame text: a modal layer (absolutely placed, on the overlay Layer) drawn over
 *  row 0 does not move the bar, so a full-screen drawer passes whatever row 0 shows. */
export function topBarFault(root: Node, term: { cols: number; rows: number }): string | null {
  let bar: Node | null = null;
  const find = (n: Node, underAbsolute: boolean): void => {
    if (bar) return;
    const abs = underAbsolute || absolute(n);
    if (!abs && n.id === TOP_BAR_ID) { bar = n; return; }
    for (const c of kids(n)) find(c, abs);
  };
  find(root, false);
  const b = bar as Node | null;
  if (!b) return 'no top bar in the layout (the shell draws one in flow at row 0)';
  if (!shown(b) || b.x !== 0 || b.y !== 0 || b.width !== term.cols || b.height !== 1) return `the top bar is ${b.width}x${b.height} at ${b.x},${b.y}, not ${term.cols}x1 at 0,0`;
  return null;
}

/** Scroll boxes not at their top (a page must open at the top unless its case says otherwise). */
export function scrolledBoxes(root: Node): { path: string; top: number }[] {
  const out: { path: string; top: number }[] = [];
  const walk = (n: Node): void => {
    const top = (n as unknown as { scrollTop?: number }).scrollTop;
    if (isScrollBox(n) && typeof top === 'number' && top > 0) out.push({ path: pathOf(n), top });
    for (const c of kids(n)) walk(c);
  };
  walk(root);
  return out;
}
