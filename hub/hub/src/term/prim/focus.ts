// Focus and keys. One FocusRoot per terminal app: focusable things register with it; Tab and Shift-Tab move the focus
// region by region (FocusRegion, in the regions' `order`: the web's DOM order of sidebar, top bar, page) and, inside a
// region, in reading order (top to bottom, then left to right, by where each thing is drawn); F6 and Shift-F6 jump to
// the next and the previous region (the web's skip link); a key goes to the focused thing first and, when it does not
// take it, to the shortcut handlers (useKeys), newest first.
import { createContext, createElement, useContext, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactElement, type ReactNode, type RefObject } from 'react';
import { ScrollBoxClass, useKeyboard, useRenderer, type BoxRenderable, type KeyEvent } from './otui';
import { ClipboardHost } from './clipboard';

export type Key = KeyEvent;
/** Returns true when it took the key. */
export type KeyHandler = (k: Key) => boolean | void;

interface Item {
  id: number;
  node: RefObject<BoxRenderable | null>;
  onKey: RefObject<KeyHandler | undefined>;
  disabled: RefObject<boolean>;
  /** The id the web element carries (a kit Button's `id`): focusDomId finds the control by it. */
  domId?: RefObject<string | undefined>;
  /** false: focusable by a click or focus(), skipped by Tab (the DOM's tabIndex -1). */
  tabStop: RefObject<boolean>;
  /** A text editor (field, compose): "focus is in a field". */
  editor?: boolean;
  /** The order of the FocusRegion it is in; NO_REGION outside any (sorted after every region). */
  region: number;
}
const NO_REGION = Number.POSITIVE_INFINITY;

interface FocusStore {
  /** False under a modal layer (FocusRoot active={false}): no key, and nothing in it is drawn focused. */
  active(): boolean;
  /** How many times the focused thing was asked for again while this root was inactive. */
  reasks(): number;
  setActive(on: boolean): void;
  /** True when the focused item is a text editor. */
  inField(): boolean;
  register(item: Item): () => void;
  /** `auto`: an autoFocus nobody asked for (it never scrolls a following Scroll); default: Tab, a click, focus(). */
  focus(id: number | null, how?: 'auto' | 'asked'): void;
  focused(): number | null;
  /** How the current focus arrived. */
  how(): 'auto' | 'asked';
  subscribe(l: () => void): () => void;
  addKeys(h: RefObject<KeyHandler>): () => void;
  dispatch(k: Key): void;
  /** The drawn node of a registered item (null when it is gone). */
  nodeOf(id: number): BoxRenderable | null;
  /** One Tab / Shift-Tab step (region order, then reading order; enabled tab stops, clipped ones skipped). */
  moveFocus(by: 1 | -1): void;
  /** F6 / Shift-F6: the first tab stop of the next / previous region; false when the scope has fewer than two. */
  moveRegion(by: 1 | -1): boolean;
  /** Focus the first enabled tab stop in reading order; false when there is none. `how` 'auto': an opening layer's
   *  initial focus, which never scrolls a following Scroll (React Aria focuses without scrolling). */
  focusFirst(within?: BoxRenderable | null, how?: 'auto' | 'asked'): boolean;
  /** Focus the registered, enabled, not hidden thing that carries this DOM id; false when there is none. */
  focusDomId(domId: string, how?: 'auto' | 'asked'): boolean;
  /** The web's sequential-focus starting point after a fragment navigation to a target that takes no focus: after the
   *  next frame the focus is dropped (never a control left off screen) and the next Tab goes to the first stop inside or
   *  after `node`, Shift-Tab to the last one before it, in the region the focus was in (a page link keeps Tab in the
   *  page). Anything focused meanwhile cancels it. */
  focusFrom(node: BoxRenderable): void;
  /** The focused thing `id` turned disabled: nothing has the focus afterwards, and the next Tab / Shift-Tab goes on from
   *  its place in the Tab order, to the stop after it / before it, as from the control itself (a browser keeps a focused
   *  element that becomes disabled as the sequential-focus starting point). Nothing happens when `id` is not the
   *  focused thing. */
  dropDisabled(id: number): void;
  /** After a frame (layout final): a focused thing under a hidden ancestor gives the focus to the nearest visible one. */
  sweep(): void;
}

type NodeLike = { x: number; y: number; width: number; height: number; /** The styled sizes (engine fields). */ _width?: unknown; _height?: unknown; parent?: NodeLike | null; visible?: boolean; hxFollowFocus?: boolean; /** A sticky box and its paint-only offset (jsx/sticky.ts). */ __hxSticky?: boolean; translateY?: number };
/** The row a node has in the Tab order: where it is drawn, except inside a sticky box (jsx/sticky.ts), which is drawn
 *  inside the viewport while its place in the page is above or below it: there, the row it would be drawn on unstuck
 *  (the box's paint offset taken off). Tab order is the page's, as the DOM's is. By the drawn row, a pinned header's
 *  controls (rows 4 to 7) came after a thread scrolled above the viewport (negative rows), which Tab entered first and
 *  scrolled to: a forward Tab never reached the header (Bots, a Bot open at the end of its thread: [Details] was not
 *  reachable). Nothing else is offset: a row with no sticky box above it keeps its drawn place. */
function flowY(node: NodeLike): number {
  let y = node.y;
  for (let a: NodeLike | null | undefined = node; a; a = a.parent) if (a.__hxSticky === true) y -= a.translateY ?? 0;
  return y;
}
/** The row a tab stop takes in the Tab order, before its own row (flowY) decides. A stop scrolled out of a scroll that
 *  follows focus is still laid out past the scroll's edge, on rows where whatever stands under the scroll is drawn (a
 *  drawer's Cancel and Save): by its own row it came after them, so Tab went Name, Command, Cancel, Add program and only
 *  then "Run as" (New program, 80x24). It takes its scroll's last row when it is below the fold and the first when
 *  above; among stops on that row their own row then decides, so the hidden ones follow the visible ones in their own
 *  order, before anything under the scroll. */
function orderY(node: NodeLike): number {
  let y = flowY(node);
  for (let a = node.parent ?? null; a; a = a.parent ?? null) {
    if (!((a as unknown) instanceof ScrollBoxClass) || a.hxFollowFocus !== true) continue;
    if (y >= a.y + a.height) y = a.y + a.height - 1;
    else if (y < a.y) y = a.y;
  }
  return y;
}
/** True when an ancestor scroll that does NOT follow focus shows none of the node (Tab would land somewhere unseen). */
function clippedAway(node: NodeLike): boolean {
  for (let a = node.parent ?? null; a; a = a.parent ?? null) {
    if (a.visible === false) return true;
    // instanceof, never `constructor.name`: the shipped bundle is minified and renames the class (Tab moved nothing).
    if (!((a as unknown) instanceof ScrollBoxClass) || a.hxFollowFocus === true) continue;
    const out = node.y + node.height <= a.y || node.y >= a.y + a.height || node.x + node.width <= a.x || node.x >= a.x + a.width;
    if (out) return true;
  }
  return false;
}

/**
 * True when the node cannot be seen because of an ancestor (or itself): `visible: false` (display none, visibility
 * hidden, a Box `hidden`), or, once laid out, an ancestor with no width or no height (a collapsed container). A thing
 * there never takes the focus (Tab, autoFocus, focus()) and gives it up when it gets there (the web: an element in a
 * display: none subtree is not focusable).
 */
function hiddenAt(node: NodeLike, laidOut: boolean): boolean {
  for (let a: NodeLike | null = node; a; a = a.parent ?? null) {
    if (a.visible === false) return true;
    if (a === node || !a.parent) continue;
    // A size styled 0 (the web's collapsed `height: 0; overflow: hidden`). Read from the style, not the layout: the
    // engine reports a box laid out at 0 as 1 cell (its next sibling still starts on that cell).
    if (a._width === 0 || a._height === 0) return true;
    if (laidOut && (a.width <= 0 || a.height <= 0)) return true;
  }
  return false;
}

function createFocusStore(): FocusStore {
  const items = new Map<number, Item>();
  const listeners = new Set<() => void>();
  const keys: RefObject<KeyHandler>[] = [];
  let current: number | null = null;
  let on = true;
  let how: 'auto' | 'asked' = 'asked';
  /** Counts the asks for the already focused thing made while inactive (focus() below). */
  let reasks = 0;
  /** Items the last frame laid out under a zero-size ancestor. Judged only at the sweep, after layout: a node mounted
   *  since then has no size yet and is NOT counted collapsed (a focusFirst right after a reveal finds it). */
  let collapsed = new Set<number>();
  /** Where each item was last seen drawn: the place a lost focus is given back near. */
  const lastAt = new Map<number, { x: number; y: number }>();
  const emit = () => { for (const l of listeners) l(); };
  /** `sized` false: only `visible: false` and styled zero sizes count, not the last frame's layout. */
  const hidden = (i: Item, sized = true): boolean => i.node.current !== null && ((sized && collapsed.has(i.id)) || hiddenAt(i.node.current as unknown as NodeLike, false));
  /** The visible tab stop nearest to a place, in reading order: the first at or after it, else the last before it.
   *  One of the lost thing's own region when it has any (a page control never hands the focus to the sidebar). */
  const survivor = (at: { x: number; y: number } | undefined, except: number): number | null => {
    const all = ordered().filter((i) => i.id !== except && i.tabStop.current);
    const own = all.filter((i) => i.region === items.get(except)?.region);
    const list = own.length > 0 ? own : all;
    if (list.length === 0) return null;
    if (!at) return list[0]!.id;
    const after = list.find((i) => i.node.current!.y > at.y || (i.node.current!.y === at.y && i.node.current!.x >= at.x));
    return (after ?? list[list.length - 1]!).id;
  };
  const ordered = (): Item[] =>
    [...items.values()].filter((i) => !i.disabled.current && i.node.current && !hidden(i) && (i.id === current || (i.tabStop.current && !clippedAway(i.node.current as unknown as NodeLike))))
      // Region first (never NaN: equal regions, Infinity included, compare by place), then its row in the order (orderY: a
      // stop scrolled out of a following scroll counts on the scroll's edge), then its own row (flowY: a sticky box's own place).
      .sort((a, b) => (a.region === b.region ? 0 : a.region < b.region ? -1 : 1) || (orderY(a.node.current as unknown as NodeLike) - orderY(b.node.current as unknown as NodeLike)) || (flowY(a.node.current as unknown as NodeLike) - flowY(b.node.current as unknown as NodeLike)) || (a.node.current!.x - b.node.current!.x) || a.id - b.id);
  const move = (by: 1 | -1) => {
    const from = fromStart(by);
    if (from) { current = from.id; how = 'asked'; emit(); return; }
    const list = ordered();
    if (list.length === 0) return;
    const at = list.findIndex((i) => i.id === current);
    current = list[at < 0 ? (by === 1 ? 0 : list.length - 1) : (at + by + list.length) % list.length]!.id;
    how = 'asked';
    emit();
  };
  const moveRegion = (by: 1 | -1): boolean => {
    const stops = ordered().filter((i) => i.tabStop.current);
    const regions = [...new Set(stops.map((i) => i.region))];
    if (regions.length < 2) return false;
    // Nothing focused: F6 enters the last region (in the shell the page, as the web's skip link), Shift-F6 the first.
    const at = current === null ? (by === 1 ? regions.length - 2 : 1) : regions.indexOf(items.get(current)?.region ?? NO_REGION);
    const to = regions[(at + by + regions.length) % regions.length]!;
    start = null;
    current = stops.find((i) => i.region === to)!.id;
    how = 'asked';
    emit();
    return true;
  };
  /** focusFrom's node, applied after the next frame (the scroll that brought it into view laid out). */
  let pendingFrom: NodeLike | null = null;
  /** The web's sequential-focus starting point: set by focusFrom (focus dropped), used by the next Tab / Shift-Tab while
   *  nothing took the focus since, in the region the dropped focus was in (a page link keeps Tab in the page). `at`
   *  instead of a node: the place where the focused thing was drawn when it was removed (a browser keeps the starting
   *  point where a removed focused element was, so Tab goes on from there, not from the top of the document). */
  let start: { node: NodeLike; region: number | undefined; self?: number } | { at: { x: number; y: number }; region: number | undefined } | null = null;
  const applyFrom = (n: NodeLike): void => {
    start = { node: n, region: current !== null ? items.get(current)?.region : undefined };
    if (current !== null) { current = null; how = 'asked'; emit(); }
  };
  /** Tab from the starting point: the first stop inside it or after it; Shift-Tab: the last one before it. */
  const fromStart = (by: 1 | -1): Item | undefined => {
    const s0 = start;
    start = null;
    if (!s0 || current !== null) return undefined;
    const stops = ordered().filter((i) => i.tabStop.current);
    if ('at' in s0) {
      // A removed focused thing: the first stop of its region at or after its place, Shift-Tab the last one before it.
      const own = stops.filter((i) => i.region === s0.region);
      const list = own.length > 0 ? own : stops;
      const at = s0.at;
      const after = (i: Item): boolean => i.node.current!.y > at.y || (i.node.current!.y === at.y && i.node.current!.x >= at.x);
      return by === 1 ? list.find(after) : list.filter((i) => !after(i)).pop();
    }
    if ((s0.node as { isDestroyed?: boolean }).isDestroyed) return undefined;
    const n = s0.node;
    if (s0.self !== undefined) {
      // A control that turned disabled (dropDisabled) keeps its place in the Tab order: Tab goes to the first stop after
      // that place and Shift-Tab to the last one before it, by the order Tab itself uses (region, then where it is
      // drawn), wrapping as Tab does, as if the control still had the focus. Never to the control itself: on again before
      // the Tab, the browser's search starts after it. Only stop on the screen: nothing here (move's own order decides).
      const self = s0.self;
      const r = s0.region ?? NO_REGION;
      const list = stops.filter((i) => i.id !== self);
      if (list.length === 0) return undefined;
      const place = (i: Item): number => (i.region === r ? 0 : i.region < r ? -1 : 1) || (i.node.current!.y - n.y) || (i.node.current!.x - n.x) || (i.id - self);
      return by === 1 ? (list.find((i) => place(i) > 0) ?? list[0]) : (list.filter((i) => place(i) < 0).pop() ?? list[list.length - 1]);
    }
    const inside = (x0: unknown): boolean => { for (let x = x0 as NodeLike | null; x; x = x.parent ?? null) if (x === n) return true; return false; };
    // The region: the dropped focus's, else the one holding the target's own stops (a deep link with nothing focused).
    const region = s0.region ?? stops.find((i) => inside(i.node.current))?.region;
    const own = region === undefined ? stops : stops.filter((i) => i.region === region);
    const list = own.length > 0 ? own : stops;
    const after = (i: Item): boolean => inside(i.node.current) || i.node.current!.y > n.y || (i.node.current!.y === n.y && i.node.current!.x >= n.x);
    return by === 1 ? (list.find((i) => inside(i.node.current)) ?? list.find(after)) : list.filter((i) => !after(i)).pop();
  };

  return {
    register(item) {
      items.set(item.id, item);
      return () => {
        const at = lastAt.get(item.id);
        items.delete(item.id);
        lastAt.delete(item.id);
        // Unmounted while focused: nothing has the focus (as the web's activeElement falls back to the body), so the
        // next autoFocus or a layer's restore takes it. Only a thing that is HIDDEN in place hands it on (sweep). The
        // next Tab starts where it was drawn, in its region (the web's starting point): a row removed by its own confirm
        // or a band that resolved sent Tab to the first stop of the screen, the sidebar.
        if (current === item.id) {
          current = null;
          start = at ? { at, region: item.region } : null;
          emit();
        }
      };
    },
    focus(id, by = 'asked') {
      // A disabled thing (or one gone) never takes the focus, by Tab, click or focus().
      // Nor one under a hidden ancestor (known before layout only by `visible: false`; the sweep catches collapsed
      // sizes). One that draws no box yet (a table still loading) may take it: it shows the focus once drawn.
      if (id !== null) { const it = items.get(id); if (!it || it.disabled.current || hidden(it, false)) return; start = null; }
      if (current !== id) { current = id; how = by; emit(); }
      // Asked again for the thing that already has it, while this root is inactive (a click on the page's focused row
      // under an entered pane): nothing moves, but the person asked for this root, and its watchers hear it.
      else if (!on && by === 'asked' && id !== null) { how = by; reasks++; emit(); }
    },
    reasks: () => reasks,
    how: () => how,
    focused: () => current,
    active: () => on,
    setActive(v) { if (on !== v) { on = v; emit(); } },
    inField: () => (current !== null && items.get(current)?.editor === true),
    moveFocus: (by) => move(by),
    moveRegion,
    focusFirst(within, by = 'asked') {
      const inside = (n: unknown): boolean => { for (let x = n as { parent?: unknown } | null; x; x = (x.parent as { parent?: unknown } | null | undefined) ?? null) if (x === (within as unknown)) return true; return false; };
      const first = ordered().filter((i) => i.tabStop.current && (!within || inside(i.node.current)))[0];
      if (!first) return false;
      start = null;
      if (current !== first.id) { current = first.id; how = by; emit(); }
      return true;
    },
    focusDomId(domId, by = 'asked') {
      let it: Item | undefined;
      for (const i of items.values()) if (i.domId?.current === domId && !i.disabled.current && !hidden(i, false)) { it = i; break; }
      if (!it) return false;
      start = null;
      if (current !== it.id) { current = it.id; how = by; emit(); }
      return true;
    },
    focusFrom(node) { pendingFrom = node as unknown as NodeLike; },
    dropDisabled(id) {
      if (current !== id) return;
      const it = items.get(id);
      const n = it?.node.current as unknown as NodeLike | null | undefined;
      // Still drawn (only disabled): Tab goes on from its place (fromStart); not drawn, no place: Tab starts at the top.
      start = n ? { node: n, region: it!.region, self: id } : null;
      current = null;
      how = 'asked';
      emit();
    },
    sweep() {
      const next0 = new Set<number>();
      for (const i of items.values()) if (i.node.current && hiddenAt(i.node.current as unknown as NodeLike, true)) next0.add(i.id);
      collapsed = next0;
      for (const i of items.values()) {
        const n = i.node.current;
        if (n && !hidden(i)) lastAt.set(i.id, { x: n.x, y: n.y });
      }
      if (pendingFrom) { const n = pendingFrom; pendingFrom = null; if (!(n as { isDestroyed?: boolean }).isDestroyed) applyFrom(n); }
      if (current === null) return;
      const it = items.get(current);
      if (!it || !hidden(it)) return;
      // An auto focus nobody asked for (a list's first row under a detail that replaced it), or one never drawn where a
      // person could see it, is dropped, as the web's autoFocus on a display:none element focuses nothing. Handing it on
      // put the focus in the top bar or the sidebar, and which one depended on frame timing.
      const at = lastAt.get(current);
      if (how === 'auto' || !at) { current = null; emit(); return; }
      const next = survivor(at, current);
      if (next !== current) { current = next; emit(); }
    },
    nodeOf: (id) => items.get(id)?.node.current ?? null,
    subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
    addKeys(h) { keys.push(h); return () => { const i = keys.indexOf(h); if (i >= 0) keys.splice(i, 1); }; },
    dispatch(k) {
      if (k.name === 'tab') { move(k.shift ? -1 : 1); k.preventDefault?.(); return; }
      if (k.name === 'f6' && !k.ctrl && !k.meta && moveRegion(k.shift ? -1 : 1)) { k.preventDefault?.(); return; }
      const item = current === null ? undefined : items.get(current);
      if (item?.disabled.current) { current = null; emit(); }
      // An item decides itself (a field returns true AND lets its engine editor act); a taken shortcut is
      // preventDefault'ed so an engine field still holding engine focus never also edits or submits.
      else if (item && item.onKey.current?.(k) === true) return;
      for (let i = keys.length - 1; i >= 0; i--) if (keys[i]!.current(k) === true) { k.preventDefault?.(); return; }
    },
  };
}

const Ctx = createContext<FocusStore | null>(null);
const RegionCtx = createContext<number>(NO_REGION);
let nextId = 1;

/**
 * A Tab region of the scope around it: Tab goes through the regions in `order` (lowest first) and by drawn position
 * only inside one; F6 jumps between them. Draws nothing and lays nothing out. The shell marks the sidebar, the top bar
 * and the page in the web's DOM order (shell/AppShell.tsx). A FocusRoot inside starts with no region.
 */
export function FocusRegion({ order, children }: { order: number; children?: ReactNode }): ReactElement {
  return createElement(RegionCtx.Provider, { value: order }, children);
}

function Keys({ store }: { store: FocusStore }): null {
  useKeyboard((k) => { if (store.active()) store.dispatch(k); });
  // After every frame, when layout is final: the hidden-ancestor guard (sweep).
  const renderer = useRenderer();
  useEffect(() => {
    const fn = (): void => store.sweep();
    renderer.addPostProcessFn(fn);
    return () => renderer.removePostProcessFn(fn);
  }, [renderer, store]);
  return null;
}

/**
 * The focus scope. `active={false}`: this root takes no key at all (Tab, the focused thing's keys, its shortcuts), as a
 * page under an open modal; its focused thing stays focused for when it is active again (capture/restore for free).
 */
export function FocusRoot({ children, active = true }: { children?: ReactNode; active?: boolean }): ReactElement {
  const store = useMemo(createFocusStore, []);
  // Before paint, so a frame never shows the page's focus mark under a layer that just opened.
  useLayoutEffect(() => store.setActive(active), [store, active]);
  return createElement(Ctx.Provider, { value: store }, createElement(RegionCtx.Provider, { value: NO_REGION }, createElement(Keys, { store }), createElement(ClipboardHost), children));
}

export interface Focusable {
  focused: boolean;
  /** Give this to the Box that draws the thing (its place decides the Tab order). */
  ref: RefObject<BoxRenderable | null>;
  focus(): void;
  /** Gives the focus up when this thing has it (nothing has it afterwards). */
  blur(): void;
}

export function useFocusable(o: { onKey?: KeyHandler; disabled?: boolean; auto?: boolean; tabStop?: boolean; /** A text editor (inField). */ editor?: boolean; /** The web element's id, for FocusControl.focusDomId. */ domId?: string } = {}): Focusable {
  const store = useContext(Ctx);
  const region = useContext(RegionCtx);
  const id = useRef(0);
  if (id.current === 0) id.current = nextId++;
  const node = useRef<BoxRenderable | null>(null);
  const onKey = useRef(o.onKey);
  onKey.current = o.onKey;
  const disabled = useRef(o.disabled === true);
  disabled.current = o.disabled === true;
  const tabStop = useRef(o.tabStop !== false);
  tabStop.current = o.tabStop !== false;
  const domId = useRef(o.domId);
  domId.current = o.domId;
  useEffect(() => {
    if (!store) return;
    const off = store.register({ id: id.current, node, onKey, disabled, tabStop, domId, region, ...(o.editor ? { editor: true } : {}) });
    if (o.auto && store.focused() === null) store.focus(id.current, 'auto');
    return off;
  }, [store, o.auto, region]);
  // Becoming disabled while focused gives the focus up (an inert control never keeps editing or pressing); the next Tab
  // goes on from where it is (a Send that turns off after its send: Tab reaches the control after it, not the top bar).
  useEffect(() => { if (store && o.disabled === true && store.focused() === id.current) store.dropDisabled(id.current); }, [store, o.disabled]);
  const focused = useSyncExternalStore(
    store ? store.subscribe : noSub,
    // Drawn focused only while its root is active: under a menu or dialog the page shows no focus (it comes back).
    () => (store ? store.active() && store.focused() === id.current : false),
  );
  return { focused, ref: node, focus: () => store?.focus(id.current), blur: () => { if (store?.focused() === id.current) store.focus(null); } };
}
const noSub = () => () => {};

/** Shortcuts: called for a key the focused thing did not take. Return true to stop it there. */
export function useKeys(handler: KeyHandler): void {
  const store = useContext(Ctx);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => store?.addKeys(ref), [store]);
}

/** Calls `cb` when `focused` flips (not on the first render while unfocused). */
export function useFocusChange(focused: boolean, cb: ((focused: boolean) => void) | undefined): void {
  const was = useRef(false);
  const live = useRef(cb);
  live.current = cb;
  useEffect(() => {
    if (focused === was.current) return;
    was.current = focused;
    live.current?.(focused);
  }, [focused]);
}

/** An opaque name of a focusable thing, for giving the focus back later. */
export type FocusId = number;

/**
 * Read and give back the focus: `current()` before opening something (a detail pane, a dialog), `restore(id)` after it
 * closes, as the web's focus restore does. restore does nothing when that thing is gone or disabled.
 */
export interface FocusControl {
  current(): FocusId | null;
  restore(id: FocusId | null): void;
  /** One Tab (1) or Shift-Tab (-1) step in this scope. */
  moveFocus(by: 1 | -1): void;
  /** F6 (1) or Shift-F6 (-1): the first tab stop of the next or previous FocusRegion; false with fewer than two. */
  moveRegion(by: 1 | -1): boolean;
  /** Focus the first tab stop in reading order, inside `within` when given (the web's focusInto); false when none.
   *  `how` 'auto' never scrolls a following Scroll (a layer's initial focus). */
  focusFirst(within?: BoxRenderable | null, how?: 'auto' | 'asked'): boolean;
  /** Focus the control that carries this DOM id (the web's `document.getElementById(id)?.focus()` for a kit control
   *  that passes its `id` on); false when no enabled, shown control has it. Two mounted controls with one id: the
   *  first registered takes it. A control registers after its commit: ask again a tick later for one just mounted. */
  focusDomId(domId: string, how?: 'auto' | 'asked'): boolean;
  /** After a #hash navigation to a target that takes no focus: the next Tab starts from `box` (store.focusFrom). */
  focusFrom(box: BoxRenderable): void;
  /** True when the focused thing is drawn inside `box` (any descendant renderable). */
  containsFocus(box: BoxRenderable | null): boolean;
  /** Nothing focused afterwards (the web's activeElement.blur()). */
  blur(): void;
  /** True when the focused thing is a text editor (a field, the compose box). */
  inField(): boolean;
}
export function useFocusControl(): FocusControl {
  const store = useContext(Ctx);
  return useMemo(() => ({
    current: () => store?.focused() ?? null,
    restore: (id: FocusId | null) => { if (store && id !== null && store.nodeOf(id)) store.focus(id); },
    moveFocus: (by: 1 | -1) => store?.moveFocus(by),
    moveRegion: (by: 1 | -1) => store?.moveRegion(by) ?? false,
    focusFirst: (within?: BoxRenderable | null, how?: 'auto' | 'asked') => store?.focusFirst(within, how) ?? false,
    focusDomId: (domId: string, how?: 'auto' | 'asked') => store?.focusDomId(domId, how) ?? false,
    focusFrom: (box: BoxRenderable) => store?.focusFrom(box),
    containsFocus: (box: BoxRenderable | null) => containsFocusIn(store, box),
    blur: () => store?.focus(null),
    inField: () => store?.inField() ?? false,
  }), [store]);
}

function containsFocusIn(store: FocusStore | null, box: BoxRenderable | null): boolean {
  if (!store || !box) return false;
  const id = store.focused();
  for (let n = (id === null ? null : store.nodeOf(id)) as { parent?: unknown } | null; n; n = (n.parent as { parent?: unknown } | null | undefined) ?? null) if (n === (box as unknown)) return true;
  return false;
}

/** Calls `cb(inside)` when the focus enters or leaves the box (a move between two inside things does not fire). */
export function useFocusWithin(ref: RefObject<BoxRenderable | null>, cb: (inside: boolean) => void): void {
  const store = useContext(Ctx);
  const live = useRef(cb);
  live.current = cb;
  const was = useRef(false);
  useEffect(() => {
    if (!store) return;
    return store.subscribe(() => {
      const now = containsFocusIn(store, ref.current);
      if (now !== was.current) { was.current = now; live.current(now); }
    });
  }, [store, ref]);
}

/** Calls `cb` with the drawn node of whatever gets the focus (null when nothing has it), and how it got it. */
export function useFocusedNode(cb: (node: BoxRenderable | null, how: 'auto' | 'asked', reasks: number) => void): void {
  const store = useContext(Ctx);
  const live = useRef(cb);
  live.current = cb;
  useEffect(() => {
    if (!store) return;
    return store.subscribe(() => { const id = store.focused(); live.current(id === null ? null : store.nodeOf(id), store.how(), store.reasks()); });
  }, [store]);
}

/** True for the keys that press a button. */
export const isPressKey = (k: Key): boolean => k.name === 'return' || k.name === 'linefeed' || k.name === 'space';
