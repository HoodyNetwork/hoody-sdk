// The look of a focused control's words, for Text. Not `inverse`: OpenTUI 0.8.4 swaps a cell's colours for inverse,
// and a cell with no background of its own then gets its foreground as both (measured in a termshot: fg = bg =
// #ededed, the words gone). So the colours are given outright (dark words on the focus colour), and on the mono tier,
// where colours are dropped, the words are underlined and bold so focus still reads without colour.
import { createContext, useContext } from 'react';
import { colourTier, type Colour } from './tokens';

export interface FocusInk {
  colour?: Colour;
  bg?: Colour;
  bold?: boolean;
  underline?: boolean;
}

/** Spread after a Text's own props: `<Text colour="muted" {...focusInk(focused)}>`. Nothing when not focused. */
export function focusInk(focused: boolean): FocusInk {
  if (!focused) return {};
  return colourTier() === 'mono' ? { bold: true, underline: true } : { colour: 'bg', bg: 'focus' };
}

/** Only focusInk's mono part, for a control that keeps its own focus colours on the colour tiers (the shell's blue
 *  chips, the sidebar's computer header, the page error's Try again): bold and underlined while focused on the mono
 *  tier, where those colours are dropped; nothing on the colour tiers, so they draw as before. */
export function focusMark(focused: boolean): FocusInk {
  return focused && colourTier() === 'mono' ? { bold: true, underline: true } : {};
}

/** The focus paint a Pressable gives the Texts inside it (its default look while focused); null = none. */
export const FocusInkCtx = createContext<FocusInk | null>(null);
export const useFocusInkCtx = (): FocusInk | null => useContext(FocusInkCtx);
