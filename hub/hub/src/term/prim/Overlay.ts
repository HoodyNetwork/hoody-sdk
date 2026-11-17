// Overlays: layers drawn above the page (dialogs, drawers, popovers, menus, tips, the toast stack).
//
// A layer is portalled into the renderer's root, so it is laid out against the whole screen and keeps the React context
// of the component that declared it (a drawer's form still sees its router, query client and DrawerContext). Layers
// stack in the order they open; each draws at a z above the one under it.
//
// Keys. Every layer that traps (modal, popover) has its own FocusRoot under its own key source: Tab and Shift-Tab cycle
// inside it, and the page under it gets no key at all (its FocusRoot, its shortcuts, its focused text field). This is
// done by one listener put in FRONT of every other on the renderer's key input (installed once per renderer, by
// OverlayHost or by the first layer): while a trapping layer is open it hands the key to the top one, gives the engine's
// focused field inside that layer its edit, and stops the key there. Esc closes the top layer only. A tip does not trap:
// keys go on to whatever is under it, except Esc, which closes the top tip first, and a key its onKeyFirst takes (an open
// option list: Enter picks there before a dialog under it presses its primary).
//
// Focus return needs no bookkeeping: the page's FocusRoot never sees a key while a layer is open, so its focused thing
// (the opener) is still focused when the layer closes. The engine's own focus (a text field's cursor) is put back too.
//
// Mouse. A modal draws a scrim over the whole screen and a popover an invisible catcher: a press outside the panel lands
// on them (never on the page) and closes per the layer's `onOutside`. A tip has neither: a press passes to the page.
//
// Placement is pure (placeLayer) and re-run on every render, so a resize re-clamps the panel.
//
// Paint. A layer's panel is opaque in every colour tier (opaqueRaw): no scrim cell and no page text ever shows inside
// it. The modal scrim dims what is beneath in colour tiers. In mono it cannot dim, so it HIDES everything beneath with a
// light shade, including a lower layer (a confirm over a drawer covers the drawer). It keeps hiding on purpose: a
// readable confirm matters more than seeing the drawer; the layer's title and Esc returning to the drawer carry
// the context. Pinned by Overlay.opaque.term.test.tsx ('mono scrim hides what is beneath').
//
// A trapping layer may also be entered from outside (the toast stack, which never takes focus by itself): useEnteredKeys.
import { createElement, Fragment, createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode, type RefObject } from 'react';
import { createPortal, AppContext, useAppContext } from '@opentui/react';
import { InputRenderable, KeyEvent, RGBA, type BoxRenderable, type CliRenderer, type Renderable } from '@opentui/core';
import { Box } from './Box';
import { OneLine, Text } from './Text';
import { FocusRoot, useFocusControl, useKeys, type FocusControl, type Key } from './focus';
import { colour, colourTier, type Colour } from './tokens';
import { useTerminalDimensions } from './otui';
import type { Sem } from './semantics';

// ── Geometry ─────────────────────────────────────────────────────────────────────────

/** A rectangle on the screen, in cells. */
export interface Rect { x: number; y: number; width: number; height: number }

/** The screen rectangle a renderable was last drawn at (null before its first layout or once destroyed). */
export function rectOf(node: { x: number; y: number; width: number; height: number; isDestroyed?: boolean } | null | undefined): Rect | null {
  if (!node || node.isDestroyed) return null;
  try {
    return { x: node.x, y: node.y, width: node.width, height: node.height };
  } catch {
    return null;
  }
}

export type Place =
  /** Centred; `top` is how far down the screen the panel starts ('fifth' = 20 %, the web's 20vh; 'tenth' 7.5 %). */
  | { at: 'center'; width: number; top?: 'fifth' | 'tenth' }
  /** A side sheet on the right, full height; full screen when what it leaves of the page is under `minPage` columns.
   *  `keep` + `fullBelow` (the web's side sheet): never wider than the screen less `keep` columns, and the whole screen
   *  only when the screen is narrower than `fullBelow`. `keepFrom`: `keep` holds only from that many columns (where
   *  the shell draws the rail it keeps in view); narrower, nothing is kept and a page strip under `minPage` columns is
   *  not left either (the panel takes the whole width). Without `keepFrom`, `minPage` is not used beside `fullBelow`. */
  | { at: 'right'; width: number; minPage?: number; keep?: number; keepFrom?: number; fullBelow?: number }
  /** The whole screen (a phone sheet). */
  | { at: 'full' }
  /** Against a rectangle: below it (flips above), above it (flips below), or beside it (end: right, start: left). */
  /** `anchor` may be a function: read at each render of the open layer (so a resize re-places it with nothing else
   *  listening). `fallback: 'bottom'`: a beside placement that does not fit after the anchor goes below it instead. */
  | { at: 'anchor'; anchor: Rect | null | (() => Rect | null); side?: 'bottom' | 'top' | 'start' | 'end'; align?: 'start' | 'end' | 'center'; width: number; gap?: number; fallback?: 'bottom' }
  /** A corner of the screen (the toast stack). */
  | { at: 'corner'; corner: 'bottom-end' | 'top-end'; width: number; margin?: number };

export interface Placed {
  left: number;
  top: number;
  width: number;
  /** A fixed height (side sheets, full screen) */
  height?: number;
  /** The most the panel may grow to. */
  maxHeight: number;
  /** The most the panel could get at this placement whatever its own height (an anchored panel: the larger side). A list
   *  that windows itself to this never makes the panel flip back and forth. */
  room: number;
  /** Where an anchored panel ended up. */
  side?: 'bottom' | 'top' | 'start' | 'end';
}

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The width a centred panel is placed at: what it asks for, at most the terminal less 2 cells each side. A panel's
 *  contents that size themselves (a Modal's rule, the `?` sheet's columns) take this, not the terminal's width. */
export function centerWidth(width: number, cols: number): number {
  return Math.min(width, Math.max(1, cols - 4));
}

/**
 * Where a layer's panel goes on a `cols` x `rows` screen. `h` is the panel's drawn height when known (an anchored panel
 * flips with it); before the first layout it is taken as small, and the next render corrects it.
 */
export function placeLayer(place: Place, cols: number, rows: number, h: number | null = null): Placed {
  const W = Math.max(1, cols);
  const H = Math.max(1, rows);
  switch (place.at) {
    case 'full':
      return { left: 0, top: 0, width: W, height: H, maxHeight: H, room: H };
    case 'right': {
      if (place.fullBelow !== undefined) {
        if (W < place.fullBelow) return { left: 0, top: 0, width: W, height: H, maxHeight: H, room: H };
        if (place.keepFrom !== undefined && W < place.keepFrom) {
          const width = Math.min(place.width, W);
          const drawn = W - width < (place.minPage ?? 0) ? W : width;
          return { left: W - drawn, top: 0, width: drawn, height: H, maxHeight: H, room: H };
        }
        const kept = Math.max(1, Math.min(place.width, W - (place.keep ?? 0)));
        return { left: W - kept, top: 0, width: kept, height: H, maxHeight: H, room: H };
      }
      const width = Math.min(place.width, W);
      if (W - width < (place.minPage ?? 20)) return { left: 0, top: 0, width: W, height: H, maxHeight: H, room: H };
      return { left: W - width, top: 0, width, height: H, maxHeight: H, room: H };
    }
    case 'center': {
      const width = centerWidth(place.width, W);
      const want = place.top === 'tenth' ? Math.floor(H * 0.075) : Math.floor(H * 0.2);
      const drawn = h ?? 0;
      // Pull the panel up when it would run off the bottom; never above row 0.
      const top = clampN(Math.min(want, H - drawn - 1), 0, Math.max(0, H - 1));
      return { left: Math.floor((W - width) / 2), top, width, maxHeight: Math.max(1, H - top - (top > 0 ? 1 : 0)), room: H };
    }
    case 'corner': {
      const m = place.margin ?? 1;
      const width = Math.min(place.width, Math.max(1, W - 2 * m));
      const drawn = h ?? 0;
      const left = Math.max(0, W - width - m);
      const top = place.corner === 'top-end' ? m : Math.max(0, H - drawn - m);
      return { left, top, width, maxHeight: Math.max(1, H - 2 * m), room: Math.max(1, H - 2 * m) };
    }
    case 'anchor': {
      const width = Math.min(place.width, W);
      const gap = place.gap ?? 0;
      // No rectangle (the anchor was never drawn): centred, a third down.
      const given = typeof place.anchor === 'function' ? place.anchor() : place.anchor;
      const a = given ?? { x: Math.floor((W - width) / 2), y: Math.floor(H / 3) - 1, width, height: 1 };
      let side = place.side ?? 'bottom';
      if (place.fallback === 'bottom' && (side === 'end' || side === 'start')) {
        const room = side === 'end' ? W - (a.x + a.width + gap + 1) : a.x - gap - 1;
        if (width > room) side = 'bottom';
      }
      const align = place.align ?? 'start';
      const drawn = h ?? 1;
      if (side === 'bottom' || side === 'top') {
        const below = H - (a.y + a.height + gap);
        const above = a.y - gap;
        let s: 'bottom' | 'top' = side;
        if (s === 'bottom' && drawn > below && above > below) s = 'top';
        else if (s === 'top' && drawn > above && below > above) s = 'bottom';
        const room = Math.max(1, s === 'bottom' ? below : above);
        const shown = Math.min(drawn, room);
        const top = s === 'bottom' ? a.y + a.height + gap : a.y - gap - shown;
        const x = align === 'start' ? a.x : align === 'end' ? a.x + a.width - width : a.x + Math.floor((a.width - width) / 2);
        return { left: clampN(x, 0, W - width), top: clampN(top, 0, Math.max(0, H - 1)), width, maxHeight: room, room: Math.max(1, below, above), side: s };
      }
      const after = W - (a.x + a.width + gap + 1);
      const before = a.x - gap - 1;
      let s: 'start' | 'end' = side;
      if (s === 'end' && width > after && before > after) s = 'start';
      else if (s === 'start' && width > before && after > before) s = 'end';
      const x = s === 'end' ? a.x + a.width + gap + 1 : a.x - gap - 1 - width;
      const top = clampN(a.y, 0, Math.max(0, H - Math.min(drawn, H)));
      return { left: clampN(x, 0, W - width), top, width, maxHeight: Math.max(1, H - top), room: H, side: s };
    }
  }
}

// ── The stack and the key gate ───────────────────────────────────────────────────────

/** A paste as the engine hands it out (usePaste's event). */
type PasteLike = { bytes: Uint8Array; defaultPrevented: boolean; preventDefault(): void; stopPropagation(): void };

/** A layer's own key source: what @opentui/react's useKeyboard (and so a FocusRoot) and usePaste (a field drawn outside
 *  the engine's editors: masked, secret, OTP) subscribe to inside the layer. */
class LayerKeys {
  private readonly l = new Set<(k: KeyEvent) => void>();
  private readonly p = new Set<(e: PasteLike) => void>();
  // The listener's argument is the event its name says (as the engine's emitter): a key for 'keypress', a paste for 'paste'.
  on(event: string, fn: (e: never) => void): this {
    if (event === 'keypress') this.l.add(fn as (k: KeyEvent) => void);
    else if (event === 'paste') this.p.add(fn as (e: PasteLike) => void);
    return this;
  }
  off(event: string, fn: (e: never) => void): this { this.l.delete(fn as (k: KeyEvent) => void); this.p.delete(fn as (e: PasteLike) => void); return this; }
  emit(k: KeyEvent): void { for (const fn of [...this.l]) fn(k); }
  paste(e: PasteLike): void { for (const fn of [...this.p]) fn(e); }
}

interface Entry {
  id: number;
  trap: boolean;
  keys: LayerKeys;
  panel: RefObject<BoxRenderable | null>;
  /** Esc reaching a tip (non-trapping) layer: the interceptor closes it. Trapping layers handle Esc inside. */
  escape: RefObject<(() => void) | undefined>;
  /** Sees each key first (`inField`: the focused thing is a one-line text field in this layer). True takes it. */
  pre: RefObject<((k: KeyEvent, inField: boolean) => boolean) | undefined>;
  /** The engine's focused renderable when the layer opened, given back on close. */
  saved: Renderable | null;
}

interface Stack {
  renderer: CliRenderer;
  entries: Entry[];
  listeners: Set<() => void>;
  /** Keys that work whatever layer is open (F6 to the toasts). Return true to take the key. */
  globals: Set<RefObject<(k: KeyEvent) => boolean>>;
}

const stacks = new WeakMap<CliRenderer, Stack>();
let nextEntry = 1;

const inside = (node: Renderable | null, root: Renderable | null): boolean => {
  for (let n: Renderable | null = node; n; n = n.parent as Renderable | null) if (n === root) return true;
  return false;
};

function stackOf(renderer: CliRenderer): Stack {
  let s = stacks.get(renderer);
  if (s) return s;
  const stack: Stack = { renderer, entries: [], listeners: new Set(), globals: new Set() };
  s = stack;
  stacks.set(renderer, stack);
  const onKey = (k: KeyEvent) => {
    if (k.eventType === 'release') return;
    for (const g of [...stack.globals]) if (g.current?.(k) === true) { k.stopPropagation(); return; }
    let top = -1;
    for (let i = stack.entries.length - 1; i >= 0; i--) if (stack.entries[i]!.trap) { top = i; break; }
    // Tips above the top trapping layer (or above the page): Esc closes the topmost of them, nothing else is taken.
    if (k.name === 'escape') {
      for (let i = stack.entries.length - 1; i > top; i--) {
        const e = stack.entries[i]!;
        if (e.escape.current) { e.escape.current(); k.stopPropagation(); return; }
      }
    }
    // Tips above it that ask for keys (a field's open option list) see each key before the layer under them.
    for (let i = stack.entries.length - 1; i > top; i--) {
      if (stack.entries[i]!.pre.current?.(k, false) === true) { k.stopPropagation(); return; }
    }
    if (top < 0) return;
    const e = stack.entries[top]!;
    const fr = renderer.currentFocusedRenderable;
    const inField = !!fr && !fr.isDestroyed && fr instanceof InputRenderable && inside(fr, e.panel.current);
    if (e.pre.current?.(k, inField) === true) { k.stopPropagation(); return; }
    e.keys.emit(k);
    // The engine's own field inside the layer still edits (its handler is a renderable one, which the stop below skips).
    if (fr && !fr.isDestroyed && inside(fr, e.panel.current) && !k.defaultPrevented) (fr as { handleKeyPress?: (k: KeyEvent) => boolean }).handleKeyPress?.(k);
    k.stopPropagation();
  };
  const input = renderer.keyInput as unknown as { prependListener(ev: 'keypress', fn: (k: KeyEvent) => void): void; prependListener(ev: 'paste', fn: (e: PasteLike) => void): void };
  input.prependListener('keypress', onKey);
  // A paste goes to the top trapping layer only (never to a page field behind it): first to the fields inside it that
  // read pastes themselves (usePaste on the layer's key source; each acts only while focused), then, untaken, to the
  // engine's focused editor inside it.
  input.prependListener('paste', (ev: PasteLike) => {
    const top = [...stack.entries].reverse().find((e) => e.trap);
    if (!top) return;
    top.keys.paste(ev);
    const fr = renderer.currentFocusedRenderable;
    if (!ev.defaultPrevented && fr && inside(fr, top.panel.current)) (fr as { handlePaste?: (e: unknown) => void }).handlePaste?.(ev);
    ev.stopPropagation();
  });
  return stack;
}

const emitChange = (s: Stack) => { for (const l of [...s.listeners]) l(); };

function useStack(): Stack | null {
  const { renderer } = useAppContext();
  return renderer ? stackOf(renderer) : null;
}

/** Registers a layer in the stack while `open`. */
function useEntry(open: boolean, trap: boolean, onEscape: (() => void) | undefined, pre?: (k: KeyEvent, inField: boolean) => boolean): Entry {
  const stack = useStack();
  const ref = useRef<Entry | null>(null);
  if (!ref.current) ref.current = { id: nextEntry++, trap, keys: new LayerKeys(), panel: { current: null }, escape: { current: undefined }, pre: { current: undefined }, saved: null };
  const e = ref.current;
  e.trap = trap;
  e.escape.current = trap ? undefined : onEscape;
  e.pre.current = pre;
  useLayoutEffect(() => {
    if (!open || !stack) return;
    e.saved = stack.renderer.currentFocusedRenderable;
    stack.entries.push(e);
    emitChange(stack);
    return () => {
      const i = stack.entries.indexOf(e);
      if (i >= 0) stack.entries.splice(i, 1);
      emitChange(stack);
      const saved = e.saved;
      e.saved = null;
      // After the layer's own renderables are gone (their blur leaves nothing focused), the field the page had focused
      // gets the engine's focus back.
      setTimeout(() => {
        const now = stack.renderer.currentFocusedRenderable;
        if (saved && !saved.isDestroyed && (now === null || now.isDestroyed || inside(now, e.panel.current))) saved.focus();
      }, 0);
    };
  }, [open, stack, e]);
  return e;
}

/**
 * How many layers are open (the shell may dim its own chrome; tests read it). `trapping`: only those that take the keys
 * (modal, popover, an entered surface), not a tip: a tip leaves the page's keys and focus live, so a scope that goes
 * inactive under a layer must count only these (a tip shown on focus would otherwise take that focus away, hide, give it
 * back and show again: an update loop).
 */
export function useLayerCount(o: { trapping?: boolean } = {}): number {
  const stack = useStack();
  const [, bump] = useState(0);
  useEffect(() => {
    if (!stack) return;
    const l = () => bump((n) => n + 1);
    stack.listeners.add(l);
    return () => void stack.listeners.delete(l);
  }, [stack]);
  if (!stack) return 0;
  return o.trapping ? stack.entries.filter((e) => e.trap).length : stack.entries.length;
}

/** A key handler that runs before any layer and the page (F6 into the toasts). Return true to take the key. */
export function useGlobalKey(handler: (k: Key) => boolean): void {
  const stack = useStack();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!stack) return;
    stack.globals.add(ref);
    return () => void stack.globals.delete(ref);
  }, [stack]);
}

// ── Layer ────────────────────────────────────────────────────────────────────────────

export type LayerKind = 'modal' | 'popover' | 'tip';

export interface LayerProps {
  open: boolean;
  /**
   * modal: scrim over the page, keys trapped, a press on the scrim calls onOutside.
   * popover: no scrim (an invisible catcher), keys trapped, a press outside calls onOutside.
   * tip: nothing over the page, keys go on to the page, only Esc (onEscape) is taken.
   */
  kind: LayerKind;
  place: Place;
  /** Esc while this is the top layer. Omit to make Esc do nothing (a busy dialog says why itself). */
  onEscape?: () => void;
  /** A press outside the panel (modal: on the scrim). */
  onOutside?: () => void;
  /** The panel's frame: a border style, or none. Default 'single' for every kind: one box style on a screen (cards,
   *  menus and dialogs alike). A modal reads as one without a second stroke: it stands on the scrim (a dimmed page, ░ in
   *  mono) and is centred. */
  frame?: 'single' | 'double' | 'rounded' | 'heavy' | 'none';
  /** A title set into the top border. */
  frameTitle?: string;
  frameColour?: Colour;
  bg?: Colour;
  /**
   * 'first': once laid out, focus goes to the first focusable in reading order (Tab from nothing), unless a child took
   * it with autoFocus. 'none': only children's autoFocus.
   */
  initialFocus?: 'first' | 'none';
  /** Pad inside the frame. */
  padX?: number;
  /**
   * Sees every key before the layer's focus does; `inField` is true when a one-line text field in this layer has the
   * focus (a dialog's Enter-to-confirm). Return true to take the key. A tip's runs before the layers under it (a
   * Combobox's open list takes Enter before its dialog); its `inField` is always false.
   */
  onKeyFirst?: (k: Key, inField: boolean) => boolean;
  /** What the panel is in the semantics tree (role dialog / menu / tooltip, its name). */
  sem?: Sem;
  children?: ReactNode;
}

interface LayerApi {
  /** False until the layer's initial focus ran: controls that must never take it (a close ×) stay out until then. */
  settled: boolean;
  /** The panel's size as drawn. */
  width: number;
  height: number;
  /** Lines the content can ever be given at this placement (frame left out; Placed.room): a list longer than this
   *  windows itself around its highlighted row, so a row that is not drawn is never the one a key picks. */
  room: number;
  /** Move focus inside the layer as Tab / Shift-Tab would. */
  tab: (back?: boolean) => void;
}
const LayerCtx = createContext<LayerApi | null>(null);
/** Inside a layer: its state and focus moves; null outside one. */
export const useLayer = (): LayerApi | null => useContext(LayerCtx);

const BASE_Z = 1000;

function syntheticTab(back: boolean): KeyEvent {
  return new KeyEvent({ name: 'tab', ctrl: false, meta: false, shift: back, option: false, sequence: '\t', number: false, raw: '\t', eventType: 'press', source: 'raw' } as ConstructorParameters<typeof KeyEvent>[0]);
}

/** Hands the enclosing FocusRoot's control out (the layer sits outside its own root). */
function ScopeCtl({ into }: { into: { current: FocusControl | null } }): null {
  into.current = useFocusControl();
  return null;
}

/**
 * The raw fill that makes a surface opaque in every tier. A colour tier paints the token. Mono has no colour, and a
 * transparent cell lets the scrim's shade (or the page's text) show through every blank, so mono paints the terminal's
 * own background (SGR 49, no colour emitted). Spread into a Box's `raw`.
 */
export function opaqueRaw(bg: Colour = 'card'): { backgroundColor: string | RGBA } {
  const c = colour(bg);
  return { backgroundColor: c ?? RGBA.defaultBackground() };
}

function EscKey({ onEscape }: { onEscape: (() => void) | undefined }): null {
  useKeys((k) => {
    if (k.name !== 'escape') return false;
    onEscape?.();
    return true;
  });
  return null;
}

/** The scrim's look: dimmed in colour; in mono (no dimming) a light shade that hides the page, so the modal reads. */
function scrimFill(cols: number, rows: number): ReactElement | null {
  if (colourTier() !== 'mono') return null;
  const line = '░'.repeat(Math.max(0, cols));
  return createElement(Text, { colour: 'faint' }, Array.from({ length: Math.max(0, rows) }, () => line).join('\n'));
}

export function Layer(p: LayerProps): ReactElement | null {
  // Nothing of a closed layer is mounted: no size listener, no stack entry (a page with many menus stays light).
  return p.open ? createElement(OpenLayer, p) : null;
}

function OpenLayer(p: LayerProps): ReactElement | null {
  const { renderer } = useAppContext();
  const trap = p.kind !== 'tip';
  const entry = useEntry(p.open, trap, p.onEscape, p.onKeyFirst);
  const { width: cols, height: rows } = useTerminalDimensions();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // The content's own height (never clipped by the panel's room): an anchored panel flips by what it would need.
  const [natural, setNatural] = useState<number | null>(null);
  const [settled, setSettled] = useState(false);
  const depth = useLayerIndex(entry, p.open);
  const ctl = useRef<FocusControl | null>(null);
  useEffect(() => {
    if (!p.open) { setSettled(false); setSize(null); setNatural(null); return; }
    if (p.initialFocus !== 'first') { setSettled(true); return; }
    // After the first layout (positions decide the reading order): the first Tab stop of the layer's own root.
    const id = setTimeout(() => {
      // A control that took focus itself (autoFocus) keeps it, as React Aria's FocusScope autoFocus does. The first
      // stop is focused without scrolling the body (React Aria's focusWithoutScrolling): the panel opens at its top.
      if (ctl.current) { if (ctl.current.current() === null) ctl.current.focusFirst(null, 'auto'); } else entry.keys.emit(syntheticTab(false));
      setSettled(true);
    }, 0);
    return () => clearTimeout(id);
  }, [p.open, p.initialFocus, entry]);
  // A panel whose content is laid out in two steps (a scrolling body first measures its content: Popover's PopBody)
  // can lose that first focus: it is given before the layout, and the sweep drops an auto focus whose target stood
  // under a box with no size yet (computers' realm list opened with the focus nowhere, its search field unfocused).
  // Given again when the measured height changes while nothing in the layer has the focus; a focus a person moved
  // is never touched.
  useEffect(() => {
    if (!p.open || p.initialFocus !== 'first' || !settled || natural === null) return;
    if (ctl.current && ctl.current.current() === null) ctl.current.focusFirst(null, 'auto');
  }, [natural]); // eslint-disable-line react-hooks/exhaustive-deps
  const keySource = useMemo(() => ({ keyHandler: entry.keys as unknown as never, renderer }), [entry, renderer]);
  // Anchored panels measure their content unclipped; other placements fill or centre and need no natural height.
  // A layer is drawn over the page, not in its flow: the OneLine of where it is declared (a table cell) ends at the
  // panel, so its words wrap at the panel's width. An InfoTip in an AI Agents cell drew "Hoody owns this agent. Only
  // its" and dropped the rest.
  const own = (children: ReactNode): ReactNode => createElement(OneLine, { off: true }, children);
  const measured = (children: ReactNode): ReactNode => own(p.place.at !== 'anchor' ? children : createElement(Box, {
    shrink: 0, onSize: (_w: number, h: number) => setNatural((n) => (n === h ? n : h)),
  }, children));
  const frame = p.frame ?? 'single';
  const needed = natural === null ? (size?.h ?? null) : natural + (frame !== 'none' ? 2 : 0);
  const placed = placeLayer(p.place, cols, rows, needed);
  const room = Math.max(1, placed.room - (frame !== 'none' ? 2 : 0));
  const api = useMemo<LayerApi>(() => ({ settled, width: size?.w ?? 0, height: size?.h ?? 0, room, tab: (back = false) => { if (ctl.current) ctl.current.moveFocus(back ? -1 : 1); else entry.keys.emit(syntheticTab(back)); } }), [settled, size, room, entry]);
  if (!p.open || !renderer) return null;
  const z = BASE_Z + depth * 10;
  const under: ReactElement[] = [];
  if (p.kind !== 'tip') {
    const scrim = p.kind === 'modal' && colourTier() !== 'mono' ? colour('bg') : undefined;
    under.push(createElement(Box, {
      key: 'under', absolute: { top: 0, left: 0 }, width: cols, height: rows, z,
      raw: scrim ? { backgroundColor: scrim + 'b3' } : { backgroundColor: 'transparent' },
      onPress: (e: { stopPropagation?: () => void }) => { e.stopPropagation?.(); p.onOutside?.(); },
      onWheel: (e: { stopPropagation?: () => void }) => { e.stopPropagation?.(); },
    }, p.kind === 'modal' ? scrimFill(cols, rows) : null));
  }
  // Inside a frame: the opaque body (the panel's colour, its padding).
  const body = (c: ReactNode): ReactNode => frame === 'none' ? c : createElement(Box, {
    grow: 1, shrink: 1, bg: p.bg ?? 'card', raw: opaqueRaw(p.bg ?? 'card'), ...(p.padX ? { padX: p.padX } : {}),
  }, c);
  // An anchored panel's first frame is laid out off screen: it flips by its measured height, so it never shows (or
  // covers its trigger, which would end a hover) at a guessed place.
  const panelTop = p.place.at === 'anchor' && natural === null ? rows + 1 : placed.top;
  // The frame title over the top edge, on the panel's colour. The engine draws a border title with the frame's
  // background, and a space on a transparent cell keeps the cell under it (the page's text showed between the words).
  const titleStrip = frame !== 'none' && p.frameTitle ? createElement(Box, {
    key: 'title', absolute: { top: panelTop, left: placed.left + 2 }, maxWidth: Math.max(1, placed.width - 4), z: z + 2, bg: p.bg ?? 'card', raw: opaqueRaw(p.bg ?? 'card'),
  }, createElement(Text, { colour: p.frameColour ?? 'lineStrong', truncate: true }, ` ${p.frameTitle} `)) : null;
  const panel = createElement(Box, {
    key: 'panel',
    absolute: { top: panelTop, left: placed.left },
    width: placed.width,
    ...(placed.height !== undefined ? { height: placed.height } : { maxHeight: placed.maxHeight }),
    z: z + 1,
    clip: true,
    // Opaque in every tier (raw beats the bg prop): no scrim cell or page text ever shows inside a layer. A framed
    // panel fills only INSIDE its frame (the body box below): the frame's cells keep the ground under them. A line
    // glyph sits mid-cell, so a filled frame cell showed a band of panel colour outside the line, which read as a
    // second frame around the first (seen on the Computer menu and the Bots row menu). The web's border is the edge.
    ...(frame !== 'none'
      ? { raw: { backgroundColor: 'transparent', borderStyle: frame }, border: true, borderColour: p.frameColour ?? 'lineStrong' }
      : { bg: p.bg ?? 'card', raw: opaqueRaw(p.bg ?? 'card'), ...(p.padX ? { padX: p.padX } : {}) }),
    ...(p.frameTitle && frame === 'none' ? { title: ` ${p.frameTitle} ` } : {}),
    boxRef: entry.panel,
    ...(p.sem ? { sem: { modal: p.kind === 'modal', ...p.sem } } : {}),
    onSize: (w: number, h: number) => setSize((s) => (s && s.w === w && s.h === h ? s : { w, h })),
    // A press on the panel never reaches the scrim or the page.
    onPress: (e: { stopPropagation?: () => void }) => e.stopPropagation?.(),
  }, body(createElement(AppContext.Provider, { value: keySource },
    createElement(LayerCtx.Provider, { value: api },
      trap
        ? createElement(FocusRoot, null, createElement(ScopeCtl, { into: ctl }), measured(p.children), createElement(EscKey, { onEscape: p.onEscape }))
        : measured(p.children)))));
  return portalToRoot(createElement(Fragment, null, ...under, panel, titleStrip), renderer.root);
}

/** A portal into the renderer's root, typed as the element it renders as. @opentui/react declares createPortal's result as
 *  react-reconciler's own ReactPortal (no `type` or `props`), which does not overlap React's ReactElement, so a direct
 *  cast is a type error; React draws the portal like any element. The one cast, here. */
function portalToRoot(children: ReactNode, root: unknown): ReactElement {
  return createPortal(children, root, null) as unknown as ReactElement;
}

/** The layer's place in the stack (its z). */
function useLayerIndex(entry: Entry, open: boolean): number {
  const stack = useStack();
  const [, bump] = useState(0);
  useEffect(() => {
    if (!stack || !open) return;
    const l = () => bump((n) => n + 1);
    stack.listeners.add(l);
    return () => void stack.listeners.delete(l);
  }, [stack, open]);
  const i = stack ? stack.entries.indexOf(entry) : -1;
  return i < 0 ? (stack?.entries.length ?? 0) : i;
}

/**
 * The layer host the shell mounts once at the app root (inside the app's FocusRoot): it installs the key gate before
 * anything else listens, so even a page's own key listeners registered before the first overlay opens are behind it.
 * Layers work without it (the first one installs the gate), but then a listener prepended later could run first.
 */
export function OverlayHost({ children }: { children?: ReactNode }): ReactElement {
  useStack();
  return createElement(Fragment, null, children);
}

/**
 * Keys for a surface that is drawn all the time but takes keys only while entered (the toast stack): a trapping entry
 * pushed while `active`, with its own FocusRoot; entering puts the focus on its first control (as a layer's 'first').
 * Returns the provider to wrap the surface's controls in.
 */
export function useEnteredKeys(active: boolean, onEscape: () => void): { wrap: (children: ReactNode) => ReactElement; panel: RefObject<BoxRenderable | null> } {
  const { renderer } = useAppContext();
  const entry = useEntry(active, true, undefined);
  const keySource = useMemo(() => ({ keyHandler: entry.keys as unknown as never, renderer }), [entry, renderer]);
  const esc = useRef(onEscape);
  esc.current = onEscape;
  const ctl = useRef<FocusControl | null>(null);
  useEffect(() => {
    if (!active) return;
    // Entering (F6) is asked for: it always lands on the first stop, whatever the scope held before (no autoFocus here).
    const id = setTimeout(() => { if (ctl.current) ctl.current.focusFirst(); else entry.keys.emit(syntheticTab(false)); }, 0);
    return () => clearTimeout(id);
  }, [active, entry]);
  return {
    panel: entry.panel,
    wrap: (children) => createElement(AppContext.Provider, { value: keySource }, createElement(FocusRoot, null, createElement(ScopeCtl, { into: ctl }), children, createElement(EscKey, { onEscape: () => esc.current() }))),
  };
}

/** Kept for a component that draws above the page without being a layer (a toast stack): a portal into the root. */
export function Above({ children }: { children?: ReactNode }): ReactElement | null {
  const { renderer } = useAppContext();
  if (!renderer) return null;
  return portalToRoot(createElement(Fragment, null, children), renderer.root);
}

/** The z of things above every layer (the toast stack). */
export const TOP_Z = 9000;

/** True when `node` is `box` or drawn inside it. */
export function isInside(node: Renderable | null | undefined, box: Renderable | null | undefined): boolean {
  if (!box) return false;
  for (let n: Renderable | null | undefined = node; n; n = n.parent as Renderable | null) if (n === box) return true;
  return false;
}

/** Focus-within is prim's (focus.ts); re-exported for the overlay siblings. */
export { useFocusWithin } from './focus';

/**
 * An anchor for a layer: wraps its child in a Box whose screen rectangle a popover is placed against. `rect()` reads it
 * at the time of the call (after layout).
 */
export function useAnchor(): { ref: RefObject<BoxRenderable | null>; rect: () => Rect | null } {
  const ref = useRef<BoxRenderable | null>(null);
  return { ref, rect: () => {
    const n = ref.current;
    // The wrapper may be stretched by its parent: the first child is the trigger as drawn.
    const child = n && !n.isDestroyed ? (n.getChildren?.()[0] as Renderable | undefined) : undefined;
    return rectOf(child ?? n);
  } };
}
