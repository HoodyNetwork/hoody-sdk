// A named scroll region in the terminal: one Tab stop (the web's tabIndex=0 region); while it has the focus the arrows
// scroll it a row (its start edge takes the focus colour and turns heavy, ┃, so focus shows with colour off too), PageUp/PageDown a screen, Home/End to an end. The wheel scrolls it any time. `axis` inline/both:
// the content keeps its own width and the region scrolls sideways too (←/→).
import { useRef } from 'react';
import type * as Web from './ScrollRegion';
import type { ScrollBoxRenderable } from '../../term/prim/otui';
import { Box, Scroll, Text, useFocusable } from '../../term/prim';
import { useFocusSem } from './termParts';
import { scrollStep } from './termScroll';

export type { ScrollRegionProps } from './ScrollRegion';

export const ScrollRegion: typeof Web.ScrollRegion = ({ label, children, axis = 'block', framed = false }) => {
  const ref = useRef<ScrollBoxRenderable | null>(null);
  const f = useFocusable({
    onKey: (k) => {
      const r = ref.current;
      if (!r || r.isDestroyed) return false;
      const side = axis !== 'block';
      if (k.name === 'down' || k.name === 'j') { r.scrollBy(1); return true; }
      if (k.name === 'up' || k.name === 'k') { r.scrollBy(-1); return true; }
      if (side && (k.name === 'right' || k.name === 'l')) { r.scrollBy({ x: 2, y: 0 }); return true; }
      if (side && (k.name === 'left' || k.name === 'h')) { r.scrollBy({ x: -2, y: 0 }); return true; }
      const s = scrollStep(k);
      if (!s) return false;
      if (s.unit === 'end') r.scrollTo(s.by < 0 ? 0 : Number.MAX_SAFE_INTEGER);
      else r.scrollBy(s.by, 'viewport');
      return true;
    },
  });
  const sref = useFocusSem(f, { role: 'region', name: label });
  return (
    <Box dir="column" boxRef={sref} grow={1} minHeight={3} border={framed ? true : ['left']}
      borderColour={f.focused ? 'focus' : 'line'} title={framed && f.focused ? ` ${label} ` : undefined} onPress={() => f.focus()}
      {...(!framed && f.focused ? { raw: { borderStyle: 'heavy' } } : {})}>
      <Scroll dir="column" grow={1} followFocus scrollRef={ref} raw={axis === 'block' ? undefined : { scrollX: true }}>
        {typeof children === 'string' ? <Text>{children}</Text> : children}
      </Scroll>
    </Box>
  );
};
