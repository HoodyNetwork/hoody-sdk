// What a CardGrid row tells the PickCard inside it (the row owns the press and the focus; the card draws its states).
// Plain React: the web PickCard, its terminal sibling and both CardGrids share this one context.
import { createContext } from 'react';

export interface PickCardRowState {
  hovered: boolean;
  pressed: boolean;
  focusVisible: boolean;
}

/** Set by CardGrid around each card; null outside a grid. */
export const PickCardRow = createContext<PickCardRowState | null>(null);
