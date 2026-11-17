// DefaultInk: the colour for Texts inside it that name none of their own (a list row's dim meta line, whose element
// cells and plain spans carry no colour). A Text's own colour (a link's blue, a tone) wins; the focus ink wins over both.
import { createContext, createElement, useContext, type ReactElement, type ReactNode } from 'react';
import type { Colour } from './tokens';

const Ctx = createContext<Colour | null>(null);
export const useDefaultInk = (): Colour | null => useContext(Ctx);
export function DefaultInk({ colour, children }: { colour: Colour; children?: ReactNode }): ReactElement {
  return createElement(Ctx.Provider, { value: colour }, children);
}
