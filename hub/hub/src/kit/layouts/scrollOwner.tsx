// The scroll owner's contexts (terminal-only): what a terminal sibling reads to know whether a page scroll owner sits
// above it and how many rows its region shows. Kept apart from termScroll.tsx (which drives the engine's scroll box)
// so a sibling that only reads them depends on React alone: the graph sees no edge into the scroll box code.
import { createContext, useContext, type ReactNode } from 'react';

export interface ScrollOwner {
  /** Bring the descendant with this engine id to the top (or nearest edge); false when it holds none. */
  reveal(id: string, align?: 'start' | 'nearest'): boolean;
  /** Scroll by rows (negative = up). */
  by(rows: number): void;
  top(): number;
  /** Rows from the content's top to the anchor's top; undefined when it holds no such anchor. */
  offsetOf(id: string): number | undefined;
  /** Rows of content that fit (the viewport height). */
  rows(): number;
  /** The highest top row (content height less the viewport); 0 when it all fits. */
  end(): number;
}
/** Provided by termScroll's OwnerScroll only. */
export const OwnerCtx = createContext<ScrollOwner | null>(null);
/** The nearest scroll owner (null outside one). */
export const useScrollOwner = (): ScrollOwner | null => useContext(OwnerCtx);
// The rows the nearest scroll owner shows (its viewport height), as state: a frame as tall as the page region (the web's
// RailPane: `.frame { min-block-size: 100% }`, `.rail { block-size: <region height> }`) reads it. null outside one, or
// before the first layout.
/** Provided by termScroll's OwnerScroll only. */
export const RegionRowsCtx = createContext<number | null>(null);
/** Rows of the region the nearest scroll owner shows; null outside one or before it is laid out. */
export const useRegionRows = (): number | null => useContext(RegionRowsCtx);

/** A bounded box whose content scrolls itself (the web's RailPane body: the list takes the height left and scrolls
 *  itself), though a page scroll owner sits above it: what it holds sees no scroll owner, so a kit list fills it and
 *  windows its own rows instead of growing as tall as its rows for the page to scroll. */
export function OwnScroll({ children }: { children?: ReactNode }): ReactNode {
  return <OwnerCtx.Provider value={null}>{children}</OwnerCtx.Provider>;
}
