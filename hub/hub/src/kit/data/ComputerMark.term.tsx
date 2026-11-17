// Terminal ComputerMark: one cell in the computer's colour, drawn by prim FieldSwatch (its tier rule: the hex in
// truecolor, the nearest xterm hue in 16 colours, nothing in mono). Decorative like the web's: the computer's name always
// sits beside it, so colour is never the only cue. Inline inside a Text, its own text node outside one.
import { computerColor } from '@core';
import { FieldSwatch } from '../../term/prim/FieldSwatch';
import type * as Web from './ComputerMark';

export type { ComputerMarkProps } from './ComputerMark';

export const ComputerMark: typeof Web.ComputerMark = ({ color }) => {
  const c = computerColor({ color: color ?? undefined });
  return c ? <FieldSwatch value={c} cells={1} /> : null;
};
