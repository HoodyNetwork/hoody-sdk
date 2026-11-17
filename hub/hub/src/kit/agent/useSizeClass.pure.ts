// The page width classes, shared by useSizeClass (web: the element's width) and its terminal sibling
// (the pane's width): one table.
export type SizeClass = 'xs' | 's' | 'm' | 'l' | 'xl' | 'xxl';
/** The lower bound of s, m, l, xl and xxl, in CSS px. */
export const SIZE_BREAKS = [600, 840, 1180, 1560, 2400] as const;
const CLASSES: readonly SizeClass[] = ['xs', 's', 'm', 'l', 'xl', 'xxl'];

/** The class of a page `width` px wide. A width that is not a number (not measured yet) is `fallback`. */
export function sizeClassOf(width: number, fallback: SizeClass = 'l'): SizeClass {
  if (!Number.isFinite(width) || width < 0) return fallback;
  let i = 0;
  while (i < SIZE_BREAKS.length && width >= (SIZE_BREAKS[i] as number)) i++;
  return CLASSES[i] as SizeClass;
}

/** Below 840 the list and the conversation take turns and Details is a sheet. */
export const isSmall = (c: SizeClass): boolean => c === 'xs' || c === 's';
