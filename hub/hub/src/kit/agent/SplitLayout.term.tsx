// SplitLayout.term: the AI tab's frame rule in cells (the web's SplitLayout.tsx + SplitLayout.module.css). Same rule, from the
// same splitState(): below 840 px one slot fills the frame (list, conversation or Details as a whole sheet); at m and l Details
// takes the pane's place; at xl and xxl pane, conversation and Details sit side by side. A hidden slot stays mounted (not
// drawn), so a draft, a scroll position and a focus survive, as on the web.
// Drawn with prim boxes, not through the CSS translation: the conversation's column must be bounded by the frame (the
// transcript scrolls, the approval area and the composer stay on screen); a content-sized frame pushes them off the bottom.
// Widths: the web's px at 8 px a cell (rail 288 / 304 px = 36 / 38 cells, Details 400 / 460 px = 50 / 57 cells, xxl
// clamp(560 px, 34%, 1040 px) = clamp(70, 34%, 130) cells).
import type { ReactNode } from 'react';
import type * as Web from './SplitLayout';
import type { SplitLayoutProps, SplitState } from './SplitLayout';
import type { SizeClass } from './useSizeClass';
import { Box, useBoxSize } from '@term/prim';

export type { DetailsMode, SplitState, SplitLayoutProps } from './SplitLayout';

/** The web's rule, repeated here (a sibling never value-imports its base); SplitLayout.term.test.ts pins the two equal for
 *  every size, screen and Details state. */
export const splitState: typeof Web.splitState = (size: SizeClass, o: { detailsOpen: boolean; screen?: 'list' | 'conversation' }): SplitState => {
  if (isSmall(size)) {
    if (o.detailsOpen) return { pane: false, main: false, details: 'sheet' };
    return o.screen === 'list' ? { pane: true, main: false, details: 'none' } : { pane: false, main: true, details: 'none' };
  }
  if (!o.detailsOpen) return { pane: true, main: true, details: 'none' };
  return { pane: size === 'xl' || size === 'xxl', main: true, details: 'column' };
};

/** useSizeClass.isSmall, repeated (useSizeClass.ts measures DOM elements and is web-only). */
const isSmall = (c: SizeClass): boolean => c === 'xs' || c === 's';

const CELL_PX = 8;
const cells = (px: number): number => Math.round(px / CELL_PX);

export const SplitLayout: typeof Web.SplitLayout = ({ size, detailsOpen, screen, pane, main, details }: SplitLayoutProps) => {
  const st = splitState(size, { detailsOpen: detailsOpen && details !== undefined, screen });
  const [box, onSize] = useBoxSize();
  const small = isSmall(size);
  const wide = size === 'xl' || size === 'xxl';
  const paneW = cells(wide ? 304 : 288);
  const detailsW = size === 'xxl'
    ? Math.min(cells(1040), Math.max(cells(560), Math.round((box?.width ?? 200) * 0.34)))
    : cells(size === 'xl' ? 460 : 400);
  const slot = (show: boolean, node: ReactNode, w: number | null, edge: 'right' | 'left' | null): ReactNode => (
    <Box
      dir="column"
      hidden={!show}
      minHeight={0}
      {...(w === null ? { grow: 1, shrink: 1, minWidth: 0 } : { width: w, shrink: 0 })}
      {...(edge ? { border: [edge], borderColour: 'line' as const } : {})}
    >
      {node}
    </Box>
  );
  return (
    <Box dir="row" grow={1} shrink={1} minHeight={0} onSize={onSize}>
      {slot(st.pane, pane, small ? null : paneW, small ? null : 'right')}
      {slot(st.main, main, null, null)}
      {details !== undefined ? slot(st.details !== 'none', details, small ? null : detailsW, small ? null : 'left') : null}
    </Box>
  );
};
