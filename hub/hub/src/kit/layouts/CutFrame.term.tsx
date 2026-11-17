// CutFrame in the terminal: one bordered box in the panel line (the Card's), the content inside it with one cell of
// padding. A cell grid has no slanted corner, so `cut` is ignored, and nothing is measured: the web's ResizeObserver
// only sized the SVG edge, which the border replaces (the web one crashed Billing under strict globals). The frame is
// a prim box, so the caller's classes (className, innerClassName) and inline style are not drawn; its name and role
// (aria-label, role; an article/section tag as the role when none is given) go to the semantics tree.
import type * as Web from './CutFrame';
import { Box } from '../../term/prim';
import type { Role } from '../../term/prim/semantics';

export type { CutFrameProps, FrameOf } from './CutFrame';

/** The web outline formula, kept for callers that import it (CardEdge); the terminal draws no path. */
export const cutFramePath: typeof Web.cutFramePath = (w, h, cut) => {
  const r = w - 0.5;
  const b = h - 0.5;
  return `M0.5 0.5H${r}V${b - cut}L${r - cut} ${b}H0.5Z`;
};

/** No frame is measured in a terminal: the size only feeds the SVG line of the web's slanted corner, which a cell grid
 *  does not draw. A caller (CardEdge) gets null, its "not measured yet" answer, and draws no path. */
export const useFrameSize: typeof Web.useFrameSize = () => null;

const TAG_ROLE: Partial<Record<string, Role>> = { article: 'article', section: 'region' };

export const CutFrame: typeof Web.CutFrame = (p) => {
  const role = (p.role as Role | undefined) ?? TAG_ROLE[p.as ?? 'div'];
  const name = p['aria-label'];
  return (
    <Box dir="column" border borderColour="line" padX={1} grow={1} shrink={0} sem={role || name ? { ...(role ? { role } : { role: 'group' }), ...(name ? { name } : {}) } : undefined}>
      {p.children}
    </Box>
  );
};
