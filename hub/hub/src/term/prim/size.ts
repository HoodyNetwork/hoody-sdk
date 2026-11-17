// Sizes. useBoxSize: the size a box was laid out at, for a component that chooses what to show by the room it really
// has. useTerminalSize: the terminal's size, from ONE resize listener per renderer however many components ask (the
// engine's own hook adds a listener per caller, and past 10 Node prints MaxListenersExceededWarning into the screen).
import { createContext, createElement, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import { Box, type BoxProps } from './Box';
import { useRenderer, type CliRenderer } from './otui';
import { oweMeasurement, paidMeasurement } from './measuring';

/** `[size, onSize]`: pass onSize to the Box; size is null until the first layout. A reported size that differs from the
 *  drawn one is owed (measuring.ts) until this component's next commit, so settling never takes the frame drawn at the
 *  old size. Any commit pays (never a debt nothing can pay); so does going back to the drawn size, and unmounting. */
export function useBoxSize(): [{ width: number; height: number } | null, (width: number, height: number) => void] {
  const [size, set] = useState<{ width: number; height: number } | null>(null);
  const drawn = useRef<{ width: number; height: number } | null>(null);
  const debt = useRef(0);
  const pay = (): void => { if (debt.current) { paidMeasurement(debt.current); debt.current = 0; } };
  const onSize = useCallback((width: number, height: number) => {
    const d = drawn.current;
    if (d !== null && d.width === width && d.height === height) pay();
    else if (!debt.current) debt.current = oweMeasurement();
    set((s) => (s && s.width === width && s.height === height ? s : { width, height }));
  }, []);
  useLayoutEffect(() => { drawn.current = size; pay(); });
  useLayoutEffect(() => () => pay(), []);
  return [size, onSize];
}

export interface TermSize { width: number; height: number }
interface SizeStore { get(): TermSize; subscribe(l: () => void): () => void }
const stores = new WeakMap<object, SizeStore>();

function storeOf(r: CliRenderer): SizeStore {
  let s = stores.get(r);
  if (s) return s;
  let size: TermSize = { width: r.width, height: r.height };
  const listeners = new Set<() => void>();
  let on = false;
  const onResize = (width: number, height: number): void => {
    if (width === size.width && height === size.height) return;
    size = { width, height };
    for (const l of listeners) l();
  };
  s = {
    // The renderer's own size, read on every get: a resize while nobody listened (between a first render and its
    // subscribe, or after the last reader left) is never kept stale; the same object while the size is unchanged.
    get: () => {
      if (r.width !== size.width || r.height !== size.height) size = { width: r.width, height: r.height };
      return size;
    },
    subscribe(l) {
      listeners.add(l);
      if (!on) { on = true; r.on('resize', onResize); }
      return () => {
        listeners.delete(l);
        if (listeners.size === 0 && on) { on = false; r.off('resize', onResize); }
      };
    },
  };
  stores.set(r, s);
  return s;
}

/** From this many columns the shell draws its sidebar; below, `[` opens the page list (a drawer then keeps no rail
 *  strip beside it). One value for the shell and the kit. */
export const SIDEBAR_MIN_COLS = 100;

/** The terminal's columns and rows; re-renders the caller on resize. */
export function useTerminalSize(): TermSize {
  const s = storeOf(useRenderer());
  return useSyncExternalStore(s.subscribe, s.get);
}

// ---- Pane size: ONE measured container-size context -----------------------------------------------------------------
// A pane box (the shell's content pane, a drawer body, a split side) wraps its content in <PaneSize>: it lays out as a
// growing column box, measures itself, and publishes its size. usePaneSize() reads the nearest one, else the terminal.
// Container queries in the compat runtime and the size hooks (kit/media.term.ts) read ONLY this, so a page lays out by
// the room it really has. Units: cells. Resize: the box re-measures on every layout; readers re-render only when the
// size changed. Before the first layout a pane answers its parent's size (no flash of a narrower layout).

/** Columns and rows of the nearest pane (or the terminal), in cells. */
export interface PaneDims { cols: number; rows: number; source: 'pane' | 'terminal' }
const PaneCtx = createContext<PaneDims | null>(null);

/** The nearest pane's size; outside every pane, the terminal's. Re-renders the caller when it changes. */
export function usePaneSize(): PaneDims {
  const pane = useContext(PaneCtx);
  const term = useTerminalSize();
  return pane ?? { cols: term.width, rows: term.height, source: 'terminal' };
}

export interface PaneSizeProps extends Omit<BoxProps, 'onSize'> {
  children?: ReactNode;
  /** Publish this box's width only; the rows stay the enclosing pane's. For a box as tall as its content (a page's
   *  content region): its own height is no screen measure, and a child sized to it (a `100dvh` frame) would hold the
   *  box at its old height when the terminal gets shorter. */
  widthOnly?: boolean;
}
/** A pane: a box (grow 1, column by default) that measures itself and provides usePaneSize() to its content. */
export function PaneSize({ children, widthOnly, ...box }: PaneSizeProps): ReactElement {
  const outer = usePaneSize();
  const [size, onSize] = useBoxSize();
  const dims = useMemo<PaneDims>(() => (size ? { cols: size.width, rows: widthOnly ? outer.rows : size.height, source: 'pane' } : outer), [size, outer, widthOnly]);
  return createElement(Box, { grow: 1, dir: 'column', ...box, onSize } as BoxProps, createElement(PaneCtx.Provider, { value: dims }, children));
}
