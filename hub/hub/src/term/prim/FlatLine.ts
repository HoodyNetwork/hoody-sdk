// A stack of lines drawn on one line (a card's two-line title where the terminal draws the card as a one-row list
// name): prim only carries the flag; the compat runtime (jsx/dom.ts) lays a column out as a row under it.
import { createContext, createElement, useContext, type ReactElement, type ReactNode } from 'react';

const Ctx = createContext(false);

/** Every compat element under it that would stack its children (a column) lays them on one line, " · " between them.
 *  `off` ends it for a subtree. */
export function FlatLine({ children, off }: { children?: ReactNode; off?: boolean }): ReactElement {
  return createElement(Ctx.Provider, { value: off !== true }, children);
}
/** True under a FlatLine. */
export const useFlatLine = (): boolean => useContext(Ctx);
