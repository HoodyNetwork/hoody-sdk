// A project's colour in the terminal: a one-cell swatch of the project's own hex (prim FieldSwatch: the hex in
// truecolor, the nearest hue in 16 colours, nothing in mono); the row's own gap separates it from the project's name.
// A project with no valid colour draws nothing, as on the web.
import { FieldSwatch } from '@term/prim';
import { computerColor } from '../logic';
import type * as Web from './ProjectDot';

export const ProjectDot: typeof Web.ProjectDot = ({ color }) => {
  const c = computerColor({ color });
  return c ? <FieldSwatch value={c} cells={1} /> : null;
};
