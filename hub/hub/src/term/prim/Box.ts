import * as React from 'react';
// Box: the layout container (flexbox in cells).
import { cloneElement, createElement, Fragment, isValidElement, useEffect, useMemo, useRef, type ReactElement, type ReactNode, type Ref } from 'react';
import { el, TextAttributes, type BoxRenderable, type MouseEvent } from './otui';
import { colour, plainInk, textColour, type Colour } from './tokens';
import { useDefaultInk } from './DefaultInk';
import { useFocusInkCtx } from './FocusInk';
import { mergeRefs, useSem, type Sem } from './semantics';
import { clippedAbsolute } from './layoutcheck';

type Size = number | 'auto' | `${number}%`;
export interface BoxProps {
  dir?: 'row' | 'column';
  gap?: number;
  padX?: number;
  padY?: number;
  pad?: { top?: number; right?: number; bottom?: number; left?: number };
  grow?: number;
  shrink?: number;
  /** Gap between items along a row (columnGap); with `wrap`, `gapY` is the gap between wrapped lines (rowGap, else 0:
   *  in a wrapping row `gap` spaces items along the line only). */
  gapX?: number;
  gapY?: number;
  basis?: number | 'auto';
  width?: Size;
  height?: Size;
  minWidth?: Size;
  maxWidth?: Size;
  minHeight?: Size;
  maxHeight?: Size;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between';
  alignSelf?: 'start' | 'center' | 'end' | 'stretch';
  wrap?: boolean;
  border?: boolean | Array<'top' | 'right' | 'bottom' | 'left'>;
  borderColour?: Colour;
  bg?: Colour;
  title?: string;
  /** Clip children at the box edge. Default true (no overdraw); false only for a box that must let a child out. */
  clip?: boolean;
  /** The owner declares that this box drops what does not fit (a one-line chip row, a table cell): the layout gate
   *  then does not report its children as cut. Clipping still applies. */
  drops?: boolean;
  /** Out of flow, at these offsets of the nearest Box. */
  absolute?: { top?: number; right?: number; bottom?: number; left?: number };
  z?: number;
  hidden?: boolean;
  /** Activation by the mouse (THE press rule, see `pressHandlers`): primary button pressed AND released on this box.
   *  The press is consumed: no enclosing box sees it (a button inside a clickable row never also fires the row). */
  onPress?: (e: MouseEvent) => void;
  onWheel?: (e: MouseEvent) => void;
  boxRef?: Ref<BoxRenderable>;
  /** Engine layout options as they are, applied last (the CSS translator's table speaks them). */
  raw?: Readonly<Record<string, unknown>>;
  /** Called with the box's size in cells after layout, whenever it changes. */
  onSize?: (width: number, height: number) => void;
  /** Semantics for the agent/test tree (semantics.ts); never reaches the engine. */
  sem?: Sem;
  children?: ReactNode;
}

const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' } as const;
const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' } as const;


/** BoxProps to the engine's layout options (also used by Scroll). */
export function layoutOf(p: BoxProps): Record<string, unknown> {
  const s: Record<string, unknown> = { flexDirection: p.dir ?? 'column' };
  // In a wrapping row `gap` spaces the items along a line; wrapped lines sit together unless `gapY` asks for a gap.
  if (p.gap) { if (p.wrap && p.dir === 'row') s.columnGap = p.gap; else s.gap = p.gap; }
  if (p.gapX !== undefined) s.columnGap = p.gapX;
  if (p.gapY !== undefined) s.rowGap = p.gapY;
  if (p.padX) s.paddingX = p.padX;
  if (p.padY) s.paddingY = p.padY;
  if (p.pad) for (const k of ['top', 'right', 'bottom', 'left'] as const) if (p.pad[k]) s['padding' + k[0]!.toUpperCase() + k.slice(1)] = p.pad[k];
  if (p.grow !== undefined) s.flexGrow = p.grow;
  s.flexShrink = p.shrink ?? (p.grow ? 1 : 0);
  if (p.basis !== undefined) s.flexBasis = p.basis;
  for (const k of ['width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight'] as const) if (p[k] !== undefined) s[k] = p[k];
  if (p.align) s.alignItems = ALIGN[p.align];
  if (p.justify) s.justifyContent = JUSTIFY[p.justify];
  if (p.alignSelf) s.alignSelf = ALIGN[p.alignSelf];
  if (p.wrap) s.flexWrap = 'wrap';
  if (p.border) { s.border = p.border; const c = colour(p.borderColour ?? 'lineStrong'); if (c !== undefined) s.borderColor = c; }
  const bg = colour(p.bg);
  if (bg !== undefined) s.backgroundColor = bg;
  if (p.title) s.title = p.title;
  // Every box clips its own children (no two boxes ever paint the same cells: a child laid out past its box, by a
  // shrink or a fixed size, is cut at the box edge instead of drawn over its neighbours). `raw.overflow` may still
  // say otherwise below; an absolutely placed box clips as well.
  if (p.clip !== false) s.overflow = 'hidden';
  if (p.absolute) Object.assign(s, { position: 'absolute' }, p.absolute);
  if (p.z !== undefined) s.zIndex = p.z;
  if (p.hidden) s.visible = false;
  if (p.onPress) Object.assign(s, pressHandlers(p.onPress));
  if (p.onWheel) s.onMouseScroll = p.onWheel;
  if (p.onSize) { const f = p.onSize; s.onSizeChange = function (this: { width: number; height: number }) { f(this.width, this.height); }; }
  if (p.raw) Object.assign(s, p.raw);
  return s;
}

/** Test mode only: the owning components (`Toolbar<SchedulesPage`) as the engine id, so layout checks name the code. */
const OWNER_IDS = process.env.NODE_ENV === 'test' && typeof (React as { captureOwnerStack?: unknown }).captureOwnerStack === 'function';
let ownerSeq = 0;
// React (development) records an element's owner stack only for the first 10,000 elements of each second; past that
// an element has none, its box gets no owner id, and a layout fault's path names other ancestors. Which box a busy run
// left unnamed depended on timing, so the same fault had different paths in two runs of one tree. Test mode keeps the
// count at zero: every element has its stack, every box its name.
if (OWNER_IDS) {
  const internals = (React as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: object }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  // A React without this counter would name boxes by timing again, silently: refuse to load instead.
  if (!internals || !('recentlyCreatedOwnerStacks' in internals)) throw new Error('TERM_OWNER_IDS: this React has no recentlyCreatedOwnerStacks counter; box owner ids (prim/Box.ts) need another way to keep every owner stack');
  Object.defineProperty(internals, 'recentlyCreatedOwnerStacks', { get: () => 0, set: () => {}, configurable: true });
}
function ownerId(): string | undefined {
  const st = (React as unknown as { captureOwnerStack(): string | null }).captureOwnerStack() ?? '';
  const names = [...st.matchAll(/at (\w+)/g)].map((m) => m[1]!).filter((n) => !/^(Box|Text|Dom\w*|Fragment|Object|Array|Spacer|el|jsx\w*|wrapped|map|forEach|render\w*)$/.test(n)).slice(0, 3);
  return names.length ? `${names.join('<')}@b${ownerSeq++}` : undefined;
}

const popupWarned = new Set<string>();
/** Dev and test: an absolutely placed child cut by an enclosing box is an error naming its components (once each). */
function usePopupCheck(on: boolean, node: { current: unknown }, who: string | undefined): void {
  useEffect(() => {
    if (!on || process.env.NODE_ENV === 'production') return;
    const t = setTimeout(() => {
      const n = node.current as Parameters<typeof clippedAbsolute>[0] | null;
      const why = n && !(n as { isDestroyed?: boolean }).isDestroyed ? clippedAbsolute(n) : null;
      const key = (who ?? '?').replace(/@b?\d+$/, '');
      if (why && !popupWarned.has(key)) { popupWarned.add(key); console.error(`TERM_POPUP_CLIPPED: an absolutely placed box (${key}) is cut by an enclosing box: ${why}. Popups go on the overlay Layer (prim/Overlay Layer + useAnchor).`); }
    }, 50);
    return () => clearTimeout(t);
  });
}

/** Words React draws as a text of their own: a non-empty string, a number (an empty string draws nothing). */
const isBare = (c: unknown): c is string | number | bigint => (typeof c === 'string' && c !== '') || typeof c === 'number' || typeof c === 'bigint';

/** A string or number handed straight to a box (a shared page's `{none}`, a Row's model name, a fragment's words):
 *  React makes it an engine text of its own, whose colour is the engine's fixed default white (white on the Hub's
 *  light ground). It takes the colour a root Text naming none takes (Text.ts TextBody: a focused Pressable's paint,
 *  else the DefaultInk around it, else ink where the Hub paints the ground); its layout stays the engine text's. */
function BareText({ children }: { children: string }): ReactElement {
  const base = useDefaultInk();
  const ink = useFocusInkCtx();
  const props: Record<string, unknown> = {};
  const fg = textColour(ink?.colour ?? base ?? undefined) ?? plainInk();
  const bg = colour(ink?.bg);
  const attributes = (ink?.bold ? TextAttributes.BOLD : 0) | (ink?.underline ? TextAttributes.UNDERLINE : 0);
  if (fg !== undefined) props.fg = fg;
  if (bg !== undefined) props.bg = bg;
  if (attributes) props.attributes = attributes;
  return el('text', props, children);
}

/** The box's children with every bare string or number drawn by BareText: directly, in an array, or in a fragment
 *  (whose children React lays out as the box's own). Elements keep their place and key; children holding none come
 *  back as they were (the same array or fragment). */
function inkBare(c: ReactNode, at?: number): ReactNode {
  if (isBare(c)) return createElement(BareText, at === undefined ? { children: String(c) } : { key: `bare-${at}`, children: String(c) });
  if (Array.isArray(c)) {
    let out: ReactNode[] | null = null;
    for (let i = 0; i < c.length; i++) {
      const y = inkBare(c[i] as ReactNode, i);
      if (y !== c[i]) (out ??= c.slice())[i] = y;
    }
    return out ?? c;
  }
  if (isValidElement(c) && c.type === Fragment) {
    const kids = (c.props as { children?: ReactNode }).children;
    const next = inkBare(kids);
    if (next === kids) return c;
    // In a list the copy takes a key by place, as BareText does: a new element without one is an unkeyed list child to React.
    const key = at !== undefined && c.key === null ? { key: `frag-${at}` } : undefined;
    return cloneElement(c, key, next);
  }
  return c;
}

export function Box(p: BoxProps): ReactElement {
  const s = layoutOf(p);
  // OWNER_IDS is fixed for the process, so the hook count never changes between renders.
  const oid = OWNER_IDS ? useMemo(ownerId, []) : undefined;
  if (oid && s.id === undefined) s.id = oid;
  const dropId = useMemo(() => `drops@d${ownerSeq++}~cut`, []);
  if (p.drops) s.id = typeof s.id === 'string' ? (s.id.endsWith('~cut') ? s.id : s.id + '~cut') : dropId;
  const semRef = useSem(p.sem, {});
  const self = useRef<unknown>(null);
  s.ref = useMemo(() => mergeRefs(p.boxRef, semRef, self as never), [p.boxRef, semRef]);
  usePopupCheck(!!p.absolute, self, typeof s.id === 'string' ? s.id : undefined);
  return el('box', s, inkBare(p.children));
}
/** Fills the space left in its row or column. */
export const Spacer = (): ReactElement => createElement(Box, { grow: 1 });

/**
 * The one mouse-activation rule of the terminal Hub (the browser's click):
 * - only the primary button; other buttons and the wheel pass through untouched;
 * - mouse-down on a pressable arms it and is consumed (stopPropagation): enclosing pressables never arm;
 * - mouse-up on the SAME armed box fires the press and is consumed; released elsewhere = cancelled (a drag off it);
 * - one pointer, so one armed box at a time.
 * Keys follow the same rule in focus.ts: the focused thing sees a key first; a key it takes goes nowhere else.
 */
let armed: object | null = null;
export function pressHandlers(fire: (e: MouseEvent) => void): { onMouseDown(this: object, e: MouseEvent): void; onMouseUp(this: object, e: MouseEvent): void } {
  return {
    onMouseDown(this: object, e: MouseEvent) {
      if (e.button !== 0) return;
      e.stopPropagation();
      armed = this;
      disarmAtRoot(this as Node);
    },
    onMouseUp(this: object, e: MouseEvent) {
      if (e.button !== 0) return;
      const was = armed;
      // Another box's up bubbles on (to the armed box when it is inside it: the browser's click on the common
      // ancestor; else to the root, which ends the press).
      if (was !== this) return;
      armed = null;
      e.stopPropagation();
      // A drag's up comes to the box its down started on (the engine's pointer capture) wherever it ends: only a
      // release over this box, or over something inside it, is a press.
      if (releasedOn(this, e.x, e.y)) fire(e);
    },
  };
}

type Node = { x: number; y: number; width: number; height: number; num?: number; parent?: Node | null; ctx?: { hitTest?: (x: number, y: number) => number } };
type UpListener = (this: object, e: MouseEvent) => void;
const hookedRoots = new WeakSet<object>();
/** Every up that reaches the screen's root (one no press took: released over plain text, a page, a scrim) ends an
 *  armed press, so a later up on that control with no down on it never presses it. Installed once per root, in front
 *  of whatever up listener the root already had. */
function disarmAtRoot(n: Node): void {
  let root: Node = n;
  while (root.parent) root = root.parent;
  if (hookedRoots.has(root)) return;
  const ls = (root as { _mouseListeners?: Record<string, UpListener | undefined> })._mouseListeners;
  if (!ls) return;
  hookedRoots.add(root);
  const prev = ls.up;
  ls.up = function (this: object, e: MouseEvent) { if (e.button === 0) armed = null; prev?.call(this, e); };
}
/** True when the renderable drawn at (x, y) is `box` or inside it (the renderer's hit test; its rectangle without one). */
function releasedOn(box: object, x: number, y: number): boolean {
  const b = box as Node;
  const hit = b.ctx?.hitTest?.(x, y);
  if (hit === undefined) return x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height;
  return hit !== 0 && hasNum(b, hit);
}
function hasNum(n: Node, num: number): boolean {
  if (n.num === num) return true;
  const kids = (n as { getChildren?: () => Node[] }).getChildren?.() ?? [];
  return kids.some((k) => hasNum(k, num));
}
