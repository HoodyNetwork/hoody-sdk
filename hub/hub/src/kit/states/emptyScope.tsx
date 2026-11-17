// Where the empty states inside a subtree sit, kept apart from States.tsx so the overlays' surface reset (CardScopeReset,
// kit/layouts/CardEdge.tsx) can end it without an import cycle (States imports CardEdge and the Dialog).
import { createContext, useContext, type ReactNode } from 'react';

/**
 * Where an `md` empty card sits. `center`: a card of at most 560 px in the middle of its area (Board,
 * a pane). `frame`: the card takes the place of a list's table frame, full width directly under the page header, so
 * nothing jumps when the first row arrives. A list's empty slot (DataTable) gives `frame`.
 */
export type EmptyPlaceKind = 'center' | 'frame';

const PlaceOf = createContext<EmptyPlaceKind>('center');

/** Inside a rail (RailPane, a 200-360 px side list) an empty state with no size of its own is the `sm` look and plain,
 *  never the page's 560 px card, not even in a list's frame. An explicit size wins. */
const InRail = createContext(false);

/** Sets where the empty cards inside sit. */
export function EmptyPlace({ place, children }: { place: EmptyPlaceKind; children: ReactNode }) {
  return <PlaceOf.Provider value={place}>{children}</PlaceOf.Provider>;
}

/** Marks its children as a rail's (RailPane wraps its body in it). */
export function EmptyRail({ children }: { children: ReactNode }) {
  return <InRail.Provider value>{children}</InRail.Provider>;
}

/** Ends both for an overlay's content: a Dialog, Drawer or Popover is a new surface, so its empty states sit at the
 *  centre and are page-size again, whatever list frame or rail opened it. */
export function EmptyScopeReset({ children }: { children: ReactNode }) {
  return (
    <PlaceOf.Provider value="center">
      <InRail.Provider value={false}>{children}</InRail.Provider>
    </PlaceOf.Provider>
  );
}

export const useEmptyPlace = (): EmptyPlaceKind => useContext(PlaceOf);
export const useInRail = (): boolean => useContext(InRail);
