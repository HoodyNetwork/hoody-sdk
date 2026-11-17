// The account sheet's outcome banner in the terminal: the banner, then one blank row before the form (the web's
// 16 px under it; css-translate units: 12-20 px of vertical spacing is one row).
// A banner that appears is brought into view: it sits at the top of the drawer's body, and a long form (Turn on's
// second step) is scrolled down to the field being typed in, so a refusal shown there would otherwise be off screen.
import { useEffect, useRef, type Ref } from 'react';
import { Box, type BoxProps } from '@term/prim';
import type * as Web from './BannerSlot';

/** The node the Box draws (its `boxRef` target). */
type BoxNode = NonNullable<BoxProps['boxRef']> extends Ref<infer T> ? T : never;
/** What the walk up reads of a node: a scroll box above it has scrollChildIntoView. */
interface Node { parent?: Node | null; isDestroyed?: boolean; scrollChildIntoView?: (n: unknown, o?: { align?: string }) => void }

export const BannerSlot: typeof Web.BannerSlot = ({ children }) => {
  const ref = useRef<BoxNode | null>(null);
  useEffect(() => {
    // After the frame that lays the banner out (its place is not known before).
    const id = setTimeout(() => {
      const n: Node | null = ref.current;
      if (!n || n.isDestroyed) return;
      for (let p = n.parent ?? null; p; p = p.parent ?? null) {
        if (typeof p.scrollChildIntoView === 'function') { try { p.scrollChildIntoView(n, { align: 'nearest' }); } catch { /* gone mid-scroll */ } return; }
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);
  return (
    <Box dir="column" shrink={0} pad={{ bottom: 1 }} boxRef={ref}>
      {children}
    </Box>
  );
};
