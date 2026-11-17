// Shot replay for the terminal page gate (goldens.ts): a shot's web action after load (`click`, `keys`, `act`, written
// for Playwright in src/pages/<id>/shots.ts, run by scripts/shots.spec.ts) is replayed on the terminal's semantics tree
// (src/term/prim/semantics.ts), so the frame stored under the shot's name is the page AFTER the action, never before.
//
// The mapping (what shots.spec.ts does on the web, here):
//   plain name (click/hover)  the first visible button, link, menuitem, tab, switch, checkbox or radio whose name holds
//                             it (case-insensitive), as shots.spec `named()`
//   plain name (fill)         the first visible text field whose name holds it (getByLabel)
//   plain name (waitFor)      visible text holding it (getByText)
//   role=R[name="x"]          role R, name holding x (case-insensitive); "x"s / "x"i: exact / exact ignoring case;
//                             [name=/re/flags]; [checked] [selected] [expanded] [pressed] [disabled] (=true|false), [level=n]
//   text=x / text="x" / text=/re/  text holding x (case-insensitive) / exactly x / matching re
//   nth=n                     the n-th (0-based; -1 the last) of what the chain found so far
//   A >> B                    B inside each A
//   keys (Playwright names)   Enter, Escape, Tab, Shift+Tab, Arrow*, Home, End, PageUp, PageDown, Backspace, Delete,
//                             Space, Control+<letter>, one character
// What the terminal cannot replay is never guessed: `css=`, `xpath=` and other engines, `hover` (no pointer hover in a
// terminal), Meta/Alt keys, a target the terminal does not draw, a disabled target, a `waitFor` that never shows: the
// case is SKIPPED with that reason (goldens.ts PageResult.skipped), never drawn without the action. The reason names the
// part of the chain that found nothing (`role=row[name=/OpenAI/]` matches 1, nothing under it matches ...).
// A target drawn but off screen is scrolled into view first, as Playwright does: mouse wheel in the target's column
// (env.wheel), in passes over a few points, until it is on screen or a whole pass no longer moves it (or 400 notches
// in all); still off screen = skipped, with that reason.

export type ReplayStep =
  | { click: string }
  | { hover: string }
  | { fill: string; text: string }
  | { press: string }
  | { waitFor: string };

/** The fields of a shot that act after load (src/app/shots.types.ts). */
export interface ActingShot { click?: string; keys?: readonly string[]; act?: readonly unknown[] }

/** A shot's steps in the web runner's order: `click`, then each of `keys`, then `act`. Empty: the shot does not act. */
export function shotSteps(s: ActingShot): ReplayStep[] {
  const out: ReplayStep[] = [];
  if (s.click) out.push({ click: s.click });
  for (const k of s.keys ?? []) out.push({ press: k });
  for (const a of s.act ?? []) out.push(a as ReplayStep);
  return out;
}

// ── Selectors ────────────────────────────────────────────────────────────────────────────────────────────────────

type NameMatch = { kind: 'sub'; s: string } | { kind: 'exact'; s: string; ci: boolean } | { kind: 're'; re: RegExp };
export type Part =
  | { kind: 'role'; role: string; name?: NameMatch; states: Record<string, boolean>; level?: number }
  | { kind: 'text'; name: NameMatch }
  | { kind: 'named'; name: NameMatch; roles: readonly string[] }
  | { kind: 'nth'; n: number };

const NAMED_ROLES = ['button', 'link', 'menuitem', 'tab', 'switch', 'checkbox', 'radio'] as const;
const FIELD_ROLES = ['textbox', 'searchbox', 'combobox', 'spinbutton'] as const;
const STATE_ATTRS = new Set(['checked', 'selected', 'expanded', 'pressed', 'disabled']);
/** shots.spec SELECTOR: a value with an engine prefix is a selector, anything else a name. */
const ENGINE = /^[a-z][a-z-]*=/;

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();

function nameOf(raw: string): NameMatch | string {
  const re = /^\/((?:[^/\\]|\\.)+)\/([a-z]*)$/.exec(raw);
  if (re) { try { return { kind: 're', re: new RegExp(re[1]!, re[2]) }; } catch (e) { return `bad regex ${raw}: ${(e as Error).message}`; } }
  const qd = /^"((?:[^"\\]|\\.)*)"([is]?)$/.exec(raw) ?? /^'((?:[^'\\]|\\.)*)'([is]?)$/.exec(raw);
  if (qd) {
    const s = qd[1]!.replace(/\\(.)/g, '$1');
    return qd[2] === 's' ? { kind: 'exact', s, ci: false } : qd[2] === 'i' ? { kind: 'exact', s, ci: true } : { kind: 'sub', s };
  }
  return { kind: 'sub', s: raw };
}

/** `text=` follows Playwright: quoted = the whole text, exactly (case-sensitive); else a case-insensitive substring. */
function textName(raw: string): NameMatch | string {
  const qd = /^"((?:[^"\\]|\\.)*)"$/.exec(raw) ?? /^'((?:[^'\\]|\\.)*)'$/.exec(raw);
  if (qd) return { kind: 'exact', s: qd[1]!.replace(/\\(.)/g, '$1'), ci: false };
  return nameOf(raw);
}

function rolePart(body: string): Part | string {
  const m = /^([a-z]+)(.*)$/.exec(body);
  if (!m) return `unreadable role selector role=${body}`;
  const part: Extract<Part, { kind: 'role' }> = { kind: 'role', role: m[1]!, states: {} };
  let rest = m[2]!.trim();
  const attr = /^\[\s*([a-z-]+)\s*(?:=\s*("(?:[^"\\]|\\.)*"[is]?|'(?:[^'\\]|\\.)*'[is]?|\/(?:[^/\\]|\\.)+\/[a-z]*|[^\]\s]+))?\s*\]/;
  while (rest) {
    const a = attr.exec(rest);
    if (!a) return `unreadable role attributes ${rest}`;
    const [, key, val] = a;
    if (key === 'name') {
      if (val === undefined) return 'role [name] without a value';
      const n = nameOf(val);
      if (typeof n === 'string') return n;
      part.name = n;
    } else if (STATE_ATTRS.has(key!)) {
      if (val !== undefined && val !== 'true' && val !== 'false') return `role [${key}=${val}] (only true/false)`;
      part.states[key!] = val !== 'false';
    } else if (key === 'level' && val && /^\d+$/.test(val)) part.level = Number(val);
    else if (key === 'include-hidden') return 'role [include-hidden] (a hidden target is never on screen here)';
    else return `role attribute [${key}] is not mapped`;
    rest = rest.slice(a[0].length).trim();
  }
  return part;
}

/** One selector chain (`A >> B >> nth=0`), or the reason it cannot be replayed. */
export function parseSelector(sel: string, plain: 'named' | 'field' | 'text'): Part[] | string {
  if (!ENGINE.test(sel)) {
    const n = plain === 'text' ? textName(sel) : nameOf(sel);
    if (typeof n === 'string') return n;
    return [plain === 'text' ? { kind: 'text', name: n } : { kind: 'named', name: n, roles: plain === 'field' ? FIELD_ROLES : NAMED_ROLES }];
  }
  const out: Part[] = [];
  for (const raw of sel.split(/\s*>>\s*/)) {
    const p = raw.trim();
    const eng = /^([a-z][a-z-]*)=(.*)$/s.exec(p);
    if (!eng) return `selector part "${p}" has no engine (a CSS selector): not mapped to the terminal`;
    const [, engine, body] = eng;
    if (engine === 'role') { const r = rolePart(body!.trim()); if (typeof r === 'string') return r; out.push(r); }
    else if (engine === 'text') { const n = textName(body!.trim()); if (typeof n === 'string') return n; out.push({ kind: 'text', name: n }); }
    else if (engine === 'nth') { if (!/^-?\d+$/.test(body!.trim())) return `nth=${body}`; out.push({ kind: 'nth', n: Number(body) }); }
    else return `the ${engine}= engine (${engine === 'css' ? 'a CSS selector' : engine === 'xpath' ? 'an XPath' : 'a web-only engine'}) has no terminal mapping`;
  }
  return out;
}

// ── Keys ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface TermKey { name: string; mods?: { shift?: boolean; ctrl?: boolean } }
const KEYS: Readonly<Record<string, string>> = {
  enter: 'enter', escape: 'escape', tab: 'tab', arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right',
  home: 'HOME', end: 'END', backspace: 'BACKSPACE', delete: 'DELETE', pageup: '\x1b[5~', pagedown: '\x1b[6~', space: ' ',
};

/** A Playwright key name as the terminal session presses it, or the reason it cannot be. */
export function termKey(k: string): TermKey | string {
  const parts = k.split('+');
  const key = parts.pop()!;
  const mods: { shift?: boolean; ctrl?: boolean } = {};
  for (const m of parts) {
    if (m === 'Shift') mods.shift = true;
    else if (m === 'Control') mods.ctrl = true;
    else return `key ${k}: the ${m} modifier has no terminal equivalent here`;
  }
  const named = KEYS[key.toLowerCase()];
  const base = named ?? ([...key].length === 1 ? key : null);
  if (base === null) return `key ${k} is not mapped`;
  if (mods.ctrl && !/^[a-zA-Z]$/.test(base)) return `key ${k}: Control only with a letter`;
  return Object.keys(mods).length ? { name: base, mods } : { name: base };
}

/** Why a shot cannot be replayed whatever the page draws (a selector or key with no terminal mapping), else null. */
export function staticSkip(steps: readonly ReplayStep[]): string | null {
  for (const st of steps) {
    if ('hover' in st) return `hover ${JSON.stringify(st.hover)}: a terminal has no pointer hover`;
    if ('press' in st) { const k = termKey(st.press); if (typeof k === 'string') return k; continue; }
    const [sel, plain] = 'click' in st ? [st.click, 'named' as const] : 'fill' in st ? [st.fill, 'field' as const] : 'waitFor' in st ? [st.waitFor, 'text' as const] : [null, 'named' as const];
    if (sel === null) return `step ${JSON.stringify(st)} is not a shot step`;
    const p = parseSelector(sel, plain);
    if (typeof p === 'string') return `${Object.keys(st)[0]} ${JSON.stringify(sel)}: ${p}`;
  }
  return null;
}

// ── Resolution ───────────────────────────────────────────────────────────────────────────────────────────────────

/** The parts of a semantics node this module reads (src/term/prim/semantics.ts SemNode). */
export interface Node { role: string; name: string; states: Record<string, unknown>; level?: number; box: [number, number, number, number]; children: Node[] }

const matches = (name: string, m: NameMatch | undefined): boolean => {
  if (!m) return true;
  const n = clean(name);
  if (m.kind === 're') return m.re.test(n);
  if (m.kind === 'exact') return m.ci ? n.toLowerCase() === clean(m.s).toLowerCase() : n === clean(m.s);
  return n.toLowerCase().includes(clean(m.s).toLowerCase());
};
/** On screen: not hidden, a box with cells, inside the terminal. */
const visible = (n: Node, cols: number, rows: number): boolean => {
  const [x, y, w, h] = n.box;
  return !n.states.hidden && w > 0 && h > 0 && x < cols && y < rows && x + w > 0 && y + h > 0;
};
const TEXT_ROLES = new Set(['text', 'button', 'link', 'checkbox', 'switch', 'radio', 'option', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'heading', 'cell', 'gridcell', 'columnheader', 'rowheader', 'listitem', 'treeitem', 'paragraph', 'code', 'status', 'alert']);

function below(roots: readonly Node[], keep: (n: Node) => boolean): Node[] {
  const out: Node[] = [];
  const seen = new Set<Node>();
  const v = (ns: readonly Node[]) => { for (const n of ns) { if (!seen.has(n) && keep(n)) { seen.add(n); out.push(n); } v(n.children); } };
  v(roots);
  return out;
}

/** Every visible node the chain finds, in document order (`onScreen: false`: drawn anywhere, on screen or not). */
export function resolveAll(tree: readonly Node[], parts: readonly Part[], cols: number, rows: number, onScreen = true): Node[] {
  return chain(tree, parts, cols, rows, onScreen).found;
}

/** Why a selector finds nothing on screen: drawn but off screen, or the first chain part after which nothing matched
 *  (with what the parts before it matched), so a skip says which part of the web selector the terminal lacks. */
export function missWhy(tree: readonly Node[], sel: string, plain: 'named' | 'field' | 'text', cols: number, rows: number): string {
  const parts = parseSelector(sel, plain);
  if (typeof parts === 'string') return parts;
  const off = chain(tree, parts, cols, rows, false);
  if (off.found.length) return `drawn (${off.found.length}) but not on screen`;
  const src = ENGINE.test(sel) ? sel.split(/\s*>>\s*/).map((x) => x.trim()) : [sel];
  const at = Math.max(0, off.emptyAt);
  if (at === 0) return 'nothing in the terminal matches it';
  return `${src.slice(0, at).join(' >> ')} matches ${off.counts[at - 1]}, nothing ${parts[at]!.kind === 'nth' ? 'at' : 'under it matches'} ${src[at]}`;
}

function chain(tree: readonly Node[], parts: readonly Part[], cols: number, rows: number, onScreen: boolean): { found: Node[]; counts: number[]; emptyAt: number } {
  const counts: number[] = [];
  let emptyAt = -1;
  let scope: Node[] | null = null;
  let found: Node[] = [];
  for (const p of parts) {
    if (p.kind === 'nth') {
      const pick = p.n < 0 ? found[found.length + p.n] : found[p.n];
      found = pick ? [pick] : [];
      scope = found;
      counts.push(found.length);
      if (!found.length && emptyAt < 0) emptyAt = counts.length - 1;
      continue;
    }
    const roots: readonly Node[] = scope === null ? tree : scope.flatMap((n) => n.children);
    const keep = (n: Node): boolean => {
      if (onScreen ? !visible(n, cols, rows) : (n.states.hidden || n.box[2] <= 0 || n.box[3] <= 0)) return false;
      if (p.kind === 'text') return TEXT_ROLES.has(n.role) && matches(n.name, p.name);
      if (p.kind === 'named') return p.roles.includes(n.role) && matches(n.name, p.name);
      if (n.role !== p.role || !matches(n.name, p.name)) return false;
      if (p.level !== undefined && n.level !== p.level) return false;
      for (const [k, want] of Object.entries(p.states)) if ((n.states[k] === true) !== want) return false;
      return true;
    };
    found = below(roots, keep);
    scope = found;
    counts.push(found.length);
    if (!found.length && emptyAt < 0) emptyAt = counts.length - 1;
  }
  return { found, counts, emptyAt };
}

// ── Replay ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** What replay needs of a page session (scripts/term/render.ts PageSession). */
export interface ReplaySession {
  keys: { press(name: string, mods?: { shift?: boolean; ctrl?: boolean }): Promise<void>; type(text: string): Promise<void> };
  click(x: number, y: number): Promise<void>;
  settle(): Promise<string>;
  releaseHeld(): Promise<string>;
}
export interface ReplayEnv {
  tree(): readonly Node[];
  cols: number;
  rows: number;
  /** One mouse-wheel notch at a cell ('down' shows what is below), then settle. Absent: nothing is scrolled. */
  wheel?(x: number, y: number, dir: 'up' | 'down'): Promise<void>;
  /** The box of what the screen draws at a cell (the renderer's hit grid; null: nothing). A target whose middle cell
   *  belongs to something else (clipped by its scroll view, under a bar) is not on screen. Absent: boxes only, and
   *  then no wheel: without it a wheel stops while a pinned bar still covers the target and the click lands on the bar
   *  (at 60x20 it stops 1-3 rows short). */
  hitAt?(x: number, y: number): readonly [number, number, number, number] | null;
  /** Whether what the screen draws at a cell is the target's own renderable, inside it or around it with its very box
   *  (rendererOwns). Boxes alone cannot tell: a clipped target can share its box with a piece of another control drawn
   *  over it (bots bot-hosting at 80x24: the "+2" scrolled under the shell's realm button, whose " ▾" run has exactly
   *  the "+2"'s box, and the click opened the realm menu). Absent: the boxes decide. */
  owns?(n: Node, x: number, y: number): boolean;
  /** How long a `waitFor` step waits (default WAIT_FOR_MS, shots.spec.ts's Playwright timeout). */
  waitForMs?: number;
}

/** hitAt for a renderer: its hit grid's renderable at the cell (OpenTUI's numbered renderables, read off the root's class). */
export function rendererHitAt(r: unknown): ReplayEnv['hitAt'] {
  const x = r as { hitTest?(x: number, y: number): number; root?: { constructor?: { renderablesByNumber?: Map<number, { x: number; y: number; width: number; height: number }> } } };
  const map = x.root?.constructor?.renderablesByNumber;
  if (typeof x.hitTest !== 'function' || !map) return undefined;
  return (cx, cy) => { const h = map.get(x.hitTest!(cx, cy)); return h ? [h.x, h.y, h.width, h.height] : null; };
}

/** owns for a renderer: the renderable at the cell (hit grid) is the node's own (renderableOf), one inside it, or one
 *  it is inside of. Unknown either way (no hit test, a node with no renderable): true, the boxes decide. */
export function rendererOwns(r: unknown, renderableOf: (n: Node) => unknown): ReplayEnv['owns'] {
  type R = { parent?: R | null };
  const x = r as { hitTest?(x: number, y: number): number; root?: { constructor?: { renderablesByNumber?: Map<number, R> } } };
  const map = x.root?.constructor?.renderablesByNumber;
  if (typeof x.hitTest !== 'function' || !map) return undefined;
  return (n, cx, cy) => {
    const hit = map.get(x.hitTest!(cx, cy));
    const own = renderableOf(n) as R | undefined;
    if (!hit || !own) return true;
    for (let p: R | null | undefined = hit; p; p = p.parent) if (p === own) return true;
    for (let p: R | null | undefined = own; p; p = p.parent) if (p === hit) return true;
    return false;
  };
}

/** Roles that take a click themselves: a click on one inside a table row is not a click on the row. */
const CONTROL_ROLES = new Set(['button', 'link', 'checkbox', 'switch', 'radio', 'textbox', 'searchbox', 'combobox', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'columnheader', 'option']);
/** Roles of a field a person types in (an empty one draws a placeholder beside a one-cell input). */
const EDIT_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);
/** A row's name without the cursor mark the table draws before it. */
const rowName = (n: Node): string => n.name.replace(/^[▌›│]\s*/, '').trim();
/** How long a `waitFor` step waits for its target, as shots.spec.ts's Playwright waitFor timeout. */
const WAIT_FOR_MS = 10_000;
/** Wheel notches tried per point, in one pass over the points, to bring a target on screen. */
const WHEEL_MAX = 60;
/** Wheel notches in all: passes over the points go on while a pass still moves the target (a page moves one row per
 *  notch at 80x24, and a tab of 90 rows is not rare), so this only ends a target that keeps moving and never arrives. */
const WHEEL_ALL = 400;

const centre = (n: Node): [number, number] => [n.box[0] + Math.max(0, Math.floor((n.box[2] - 1) / 2)), n.box[1] + Math.max(0, Math.floor((n.box[3] - 1) / 2))];

/** Replays the steps; null when every step ran, else why the case cannot be drawn as the shot names it. */
export async function replay(s: ReplaySession, steps: readonly ReplayStep[], env: ReplayEnv): Promise<string | null> {
  const stat = staticSkip(steps);
  if (stat) return stat;
  if (env.wheel && !env.hitAt) return 'replay: a wheel needs its hit test (env.hitAt, rendererHitAt): without it the target counts as on screen under a bar';
  // On screen also means drawn there: every row of the target (the middle row only for one taller than the screen) is
  // on the screen and its middle cell belongs to the target or something inside it. The centre alone was not enough: a
  // two-row target whose first row lay under the key bar took the bar's box, which fits inside its own (billing
  // usage-forbidden at 60x20 clicked the bar). Fitting inside is not enough either: the cell is not the target's
  // when another node of the tree, neither inside the target nor around it, has exactly that box (a wide radio row
  // under a Drawer foot whose [Cancel] fits inside the row's box: vms create at 80x24 clicked Cancel).
  const shown = (n: Node | null, tree: readonly Node[]): Node | null => {
    if (!n || !env.hitAt) return n;
    const [x, y, w, hh] = n.box;
    const [cx, cy] = centre(n);
    const ys = hh <= env.rows ? Array.from({ length: hh }, (_, i) => y + i) : [cy];
    // The target, everything inside it and every node around it (its ancestors).
    const mine = new Set<Node>();
    const inside = (m: Node): void => { mine.add(m); m.children.forEach(inside); };
    inside(n);
    const around = (ms: readonly Node[]): boolean => {
      for (const m of ms) if (m === n || around(m.children)) { mine.add(m); return true; }
      return false;
    };
    around(tree);
    const sameBox = (m: Node, h: readonly number[]): boolean => m.box[0] === h[0] && m.box[1] === h[1] && m.box[2] === h[2] && m.box[3] === h[3];
    const other = (h: readonly number[]): boolean => {
      const v = (ms: readonly Node[]): boolean => ms.some((m) => (!mine.has(m) && !m.states.hidden && sameBox(m, h)) || v(m.children));
      return v(tree);
    };
    // An empty one-line field is a one-cell input and, from that same cell on, what the field shows instead of a value
    // (its placeholder, its faint fill, a value cut to its start): one row that starts at the input's cell. That cell is
    // the field's, and a click there focuses it, though the box drawn there is wider than the input's own. The
    // placeholder is a text node beside the input with that very box; any other node with it is another control's.
    // Without this every click or fill of an empty field with a placeholder was skipped as "drawn but not on screen"
    // (computers detail-run-exit-error: the Command field's box is 1x1, its placeholder's 14x1).
    const fieldRow = (h: readonly number[]): boolean => EDIT_ROLES.has(n.role) && hh === 1 && w <= 1 && h[0] === x && h[1] === y && h[3] === 1;
    const otherControl = (h: readonly number[]): boolean => {
      const v = (ms: readonly Node[]): boolean => ms.some((m) => (!mine.has(m) && !m.states.hidden && m.role !== 'text' && sameBox(m, h)) || v(m.children));
      return v(tree);
    };
    for (const ry of ys) {
      if (ry < 0 || ry >= env.rows) return null;
      const h = env.hitAt(cx, ry);
      if (!h) return null;
      if (fieldRow(h)) { if (otherControl(h)) return null; continue; }
      if (h[0] < x || h[1] < y || h[0] + h[2] > x + w || h[1] + h[3] > y + hh) return null;
      if (other(h)) return null;
      if (env.owns && !env.owns(n, cx, ry)) return null;
    }
    return n;
  };
  const on = (parts: Part[]) => { const tree = env.tree(); return shown(resolveAll(tree, parts, env.cols, env.rows)[0] ?? null, tree); };
  const drawn = (parts: Part[]) => resolveAll(env.tree(), parts, env.cols, env.rows, false)[0] ?? null;
  // Playwright scrolls a target into view before acting: wheel in the target's column, at a few rows, while the target
  // moves toward the screen. Stops as soon as it is on screen; a point is left when a notch there no longer moves it,
  // or after its count. A pass over the points that moved the target and still left it off screen is followed by
  // another: one pass left the Computers Access button, 88 rows down at 80x24, at row 28 after its first point and one
  // row short when a notch at the second point fell on a cell nothing draws (a wheel there scrolls nothing).
  const scrollTo = async (parts: Part[]): Promise<Node | null> => {
    if (!env.wheel) return null;
    let left = WHEEL_ALL;
    while (left > 0) {
      const from = drawn(parts)?.box[1];
      for (const y of [Math.floor(env.rows / 2), Math.max(0, env.rows - 3), 2]) {
        for (let i = 0; i < WHEEL_MAX && left > 0; i++, left--) {
          const t = drawn(parts);
          if (!t) return null;
          const hit = on(parts);
          if (hit) return hit;
          // Below the screen, or on it but not drawn in its lower half (cut off above a bar): what is below.
          const dir = t.box[1] >= env.rows / 2 ? 'down' : 'up';
          const x = Math.min(env.cols - 1, Math.max(0, t.box[0] + Math.floor((Math.min(t.box[2], env.cols) - 1) / 2)));
          await env.wheel(x, y, dir);
          const after = drawn(parts);
          if (!after || after.box[1] === t.box[1]) break;
        }
      }
      const hit = on(parts);
      if (hit || drawn(parts)?.box[1] === from) return hit;
    }
    return on(parts);
  };
  const first = async (sel: string, plain: 'named' | 'field' | 'text'): Promise<Node | null> => {
    const parts = parseSelector(sel, plain) as Part[];
    // A waitFor only asks that the text is shown (Playwright visible: drawn, wherever the scroll is).
    const find = plain === 'text' ? drawn : on;
    let hit = find(parts);
    // The web waits for its target (Playwright auto-wait): a held slow answer may be what draws it.
    if (!hit) { await s.releaseHeld(); hit = find(parts); }
    if (!hit && plain !== 'text') hit = await scrollTo(parts);
    return hit;
  };
  const miss = (sel: string, plain: 'named' | 'field' | 'text') => missWhy(env.tree(), sel, plain, env.cols, env.rows);
  // The table row a click at a cell goes to: the row drawn there, unless a control of its own (a row menu, a checkbox,
  // a header's sort button) is drawn at that cell.
  const rowAt = (x: number, y: number): Node | null => {
    let row: Node | null = null;
    let control = false;
    const v = (ns: readonly Node[]) => {
      for (const n of ns) {
        const [bx, by, w, h] = n.box;
        if (!n.states.hidden && x >= bx && x < bx + w && y >= by && y < by + h) { if (n.role === 'row') row = n; else if (CONTROL_ROLES.has(n.role)) control = true; }
        v(n.children);
      }
    };
    v(env.tree());
    return control ? null : row;
  };
  for (const [i, st] of steps.entries()) {
    const at = `step ${i + 1}`;
    if ('press' in st) {
      const k = termKey(st.press) as TermKey;
      await s.keys.press(k.name, k.mods);
      continue;
    }
    if ('waitFor' in st) {
      // Playwright waits up to 10 s for it (shots.spec.ts): an answer the settle does not see (WebCrypto, a worker) may
      // draw it later. Polled in real time (never the fixture clock), settling each round; never shown by then = skipped as before.
      const parts = parseSelector(st.waitFor, 'text') as Part[];
      // The budget runs on performance.now: goldens freeze Date (clock.ts), so Date.now() never reaches a deadline and
      // a text that never shows would wait for ever (computers ni-ask, tunnels stale-detail).
      for (const end = performance.now() + (env.waitForMs ?? WAIT_FOR_MS); !drawn(parts) && performance.now() < end;) {
        await new Promise((r) => setTimeout(r, 50));
        await s.settle();
      }
      if (!(await first(st.waitFor, 'text'))) return `${at} waitFor ${JSON.stringify(st.waitFor)}: never shown in the terminal (${miss(st.waitFor, 'text')})`;
      continue;
    }
    if ('click' in st) {
      const n = await first(st.click, 'named');
      if (!n) return `${at} click ${JSON.stringify(st.click)}: no node on screen in the terminal (${miss(st.click, 'named')})`;
      if (n.states.disabled) return `${at} click ${JSON.stringify(st.click)}: the target is disabled in the terminal`;
      const [x, y] = centre(n);
      const row = rowAt(x, y);
      await s.click(x, y);
      // The web opens a table row on one click; the terminal's first click on a row only puts the cursor there and a
      // click on the cursor row opens it (DataTable.term.tsx). So a row that took the cursor and nothing else is clicked again.
      const now = row && !row.states.focused ? rowAt(x, y) : null;
      if (row && now && now.states.focused === true && now.states.selected === row.states.selected && rowName(now) === rowName(row)) await s.click(x, y);
      continue;
    }
    if ('fill' in st) {
      const n = await first(st.fill, 'field');
      if (!n) return `${at} fill ${JSON.stringify(st.fill)}: no field on screen in the terminal (${miss(st.fill, 'field')})`;
      if (n.states.disabled || n.states.readonly) return `${at} fill ${JSON.stringify(st.fill)}: the field takes no input in the terminal`;
      const [x, y] = centre(n);
      await s.click(x, y);
      // The click's focus move lands on a frame: typed in the same tick, the keys went to the field focused before (Vault
      // new entry at 80x24 typed the value into Name, in plain text).
      await s.settle();
      // Playwright fill replaces the value: clear what is there (to the end of the last line: Down per line, End; then
      // one Backspace per character), then type. A field whose value the tree carries must then hold exactly the text.
      const parts = parseSelector(st.fill, 'field') as Part[];
      const value = () => (resolveAll(env.tree(), parts, env.cols, env.rows, false)[0] as (Node & { value?: string }) | undefined)?.value;
      const old = value() ?? '';
      if (old) {
        for (let j = 0; j < old.split('\n').length - 1; j++) await s.keys.press('down');
        await s.keys.press('END');
        for (let j = 0; j < [...old].length; j++) await s.keys.press('BACKSPACE');
      }
      await s.keys.type(st.text);
      const now = value();
      if (now !== undefined && now !== st.text) return `${at} fill ${JSON.stringify(st.fill)}: the field holds other text after typing in the terminal`;
      continue;
    }
  }
  await s.settle();
  return null;
}
