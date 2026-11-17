// Tag yielding (terminal only). A secondary tag after a name (Schedules' "‹Script›") shows on every row where it fits
// WHOLE and gives way, whole, only on a row where it does not (one long name must not hide the tag of
// every short name in its column, as the web shows each row's tag). Each Tag decides by its OWN room (its place in the
// row and the cell's clip edge), so the decision cannot flip back and forth.
// DataTable wraps each cell in a TagColumn, a plain pass-through: no decision is shared between rows.
import { createContext, createElement, useContext, type ReactElement, type ReactNode } from 'react';

/** The table's per-column wiring; no decision is shared. */
export interface TagGroup {
  readonly column: string;
}

export function createTagGroup(column = ''): TagGroup {
  return { column };
}

const Ctx = createContext<TagGroup | null>(null);

/** One group per table column (pass-through: each tag decides for itself). */
export function TagColumn({ groups, id, children }: { groups: Map<string, TagGroup>; id: string; children: ReactNode }): ReactElement {
  let g = groups.get(id);
  if (!g) { g = createTagGroup(id); groups.set(id, g); }
  return createElement(Ctx.Provider, { value: g }, children);
}

/** For a Tag: `fits` is its own measure (null = not measured yet). Returns whether to draw it. */
export function useTagShown(fits: boolean | null): boolean {
  return fits ?? true;
}

// A card's own marks (PlanCard "Your level this month") are the card's state, not a secondary label after a name: the
// web never hides them (a nowrap tag on its own wrapped line). Inside TagsWrap a tag never yields; when its line is
// narrower than the tag (Referrals' Referrer card at 80 columns, 19 cells for 23), its words wrap on the tint instead.
const Wraps = createContext(false);

/** Tags inside never yield: their words wrap when the line is narrower than the tag. */
export function TagsWrap({ children }: { children: ReactNode }): ReactElement {
  return createElement(Wraps.Provider, { value: true }, children);
}

/** For a Tag: whether it sits inside TagsWrap. */
export const useTagsWrap = (): boolean => useContext(Wraps);
