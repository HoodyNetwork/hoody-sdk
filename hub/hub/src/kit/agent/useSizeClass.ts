// useSizeClass: the page's own width class. The dock, a Board tile and the AI tab all choose their
// layout from the width of the element they are drawn in, never the window: a 1350 window with the sidebar open is a
// page of about 1110 px (class m). One table, here.
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { sizeClassOf, type SizeClass } from './useSizeClass.pure';

export { SIZE_BREAKS, isSmall, sizeClassOf, type SizeClass } from './useSizeClass.pure';

/** Measures the element the ref is put on. `initial` is the class until the first measure (a shot or test with no layout). */
export function useSizeClass<E extends HTMLElement = HTMLDivElement>(initial: SizeClass = 'l'): [RefObject<E | null>, SizeClass] {
  const ref = useRef<E | null>(null);
  const [size, setSize] = useState<SizeClass>(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Width 0 is not laid out (hidden, or no layout engine): keep what it was.
    const measure = () => { if (el.clientWidth > 0) setSize(sizeClassOf(el.clientWidth, initial)); };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [initial]);
  return [ref, size];
}
