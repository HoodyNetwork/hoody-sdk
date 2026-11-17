// useSizeClass in the terminal: the class of the pane the hook's component draws in (prim PaneSize, the nearest measured
// pane), its columns at 8 px a cell (the width rule of every terminal layout: SplitLayout, ListDetailPage). No element is
// measured (a terminal has no ResizeObserver); the ref is still handed out so a caller can put it on its root.
import { useRef, type RefObject } from 'react';
import type * as Web from './useSizeClass';
import { usePaneSize } from '@term/kit';
import { sizeClassOf } from './useSizeClass.pure';

export { SIZE_BREAKS, isSmall, sizeClassOf, type SizeClass } from './useSizeClass.pure';

const CELL_PX = 8;

export const useSizeClass: typeof Web.useSizeClass = <E extends HTMLElement = HTMLDivElement>(initial: Web.SizeClass = 'l') => {
  const ref = useRef<E | null>(null);
  const { cols } = usePaneSize();
  return [ref, cols > 0 ? sizeClassOf(cols * CELL_PX, initial) : initial] as [RefObject<E | null>, Web.SizeClass];
};
