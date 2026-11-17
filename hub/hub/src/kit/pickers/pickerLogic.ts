// The pure rules of PickerPanel: what the search shows and in what order. No React, so each rule has a unit
// test (pickerLogic.test.ts). Folding is the kit's one fold (matchesSearch: case and accents ignored, every
// word of the query must appear, any order).
import type { ReactNode } from 'react';
import { matchesSearch } from '../data/DataTableViewLogic';
import type { IconName } from '../icons';

export interface PickerItem {
  /** The value that goes in and out of the panel; also searched, so a short handle can be typed. */
  id: string;
  label: string;
  description?: string;
  /** A short facts line under the label ("3 computers · current"). */
  facts?: string;
  /** A short muted word on the label's line, right after it ("Stopped"). */
  note?: string;
  /** Drawn at the end of the label's line (a place, a realm chip); searched through `keywords`. */
  aside?: ReactNode;
  /** More words the search matches (what `aside` draws). */
  keywords?: readonly string[];
  /** Rows with the same group sit under one heading, in order of first appearance. */
  group?: string;
  /** The group's heading when it is not the group itself (the group is then only its identity: two groups can share
   *  a heading's words and stay apart). Searched in place of the group. */
  groupLabel?: string;
  /** The row cannot be picked. It stays a keyboard stop, so its reason can be read. */
  isDisabled?: boolean;
  /** Shown instead of the description on a disabled row. */
  disabledReason?: string;
  icon?: IconName;
  /** A small mark drawn before the label in place of `icon` (a colour dot for a realm). Decorative: give it aria-hidden, the row's name stays its text. */
  lead?: ReactNode;
}

/** True when a row cannot be picked. */
export const itemOff = (i: PickerItem): boolean => Boolean(i.isDisabled);

/** The rows a query leaves, in their given order. A blank query leaves all. */
export function filterItems(items: readonly PickerItem[], query: string): PickerItem[] {
  if (query.trim() === '') return [...items];
  return items.filter((i) => matchesSearch([i.label, i.description, i.facts, i.note, ...(i.keywords ?? []), i.groupLabel ?? i.group, i.id], query));
}

/** Picked rows first (each half keeps its given order). `first` is fixed when the panel opens, so ticking a row never moves it. */
export function orderItems(items: readonly PickerItem[], first: ReadonlySet<string>): PickerItem[] {
  if (first.size === 0) return [...items];
  return [...items.filter((i) => first.has(i.id)), ...items.filter((i) => !first.has(i.id))];
}

export interface PickerGroup {
  /** The group's identity (its `group`), null for ungrouped rows. */
  title: string | null;
  /** What its heading shows: the first row's `groupLabel`, else the group. */
  label: string | null;
  rows: PickerItem[];
}

/** Rows split under their group headings. Ungrouped rows come first under no heading, then groups by first appearance. */
export function groupItems(items: readonly PickerItem[]): PickerGroup[] {
  const out: PickerGroup[] = [];
  const at = new Map<string | null, PickerGroup>();
  for (const i of items) {
    const key = i.group ?? null;
    let g = at.get(key);
    if (!g) {
      g = { title: key, label: i.groupLabel ?? key, rows: [] };
      at.set(key, g);
      out.push(g);
    }
    g.rows.push(i);
  }
  return out.sort((a, b) => (a.title === null ? -1 : 0) - (b.title === null ? -1 : 0));
}

/**
 * The rows as they are drawn, top to bottom: sections (one per group, ungrouped rows under no heading), picked rows first
 * inside each section, and sections holding a picked row before the rest (ungrouped first, then by first appearance).
 * Keyboard order is this order, so what the arrows do always matches what the eye sees.
 */
export function arrange(items: readonly PickerItem[], first: ReadonlySet<string>): PickerGroup[] {
  const groups = groupItems(items).map((g) => ({ ...g, rows: orderItems(g.rows, first) }));
  const rank = (g: PickerGroup) => (g.rows.some((i) => first.has(i.id)) ? 0 : 1);
  return groups.map((g, at) => ({ g, at })).sort((a, b) => rank(a.g) - rank(b.g) || a.at - b.at).map((x) => x.g);
}

/** The next value after pressing row `id`: single picks it; multi toggles it, and never goes under `minPicked`. */
export function toggled(mode: 'single' | 'multi', value: readonly string[], id: string, minPicked: number): { next: string[]; blocked: boolean } {
  if (mode === 'single') return { next: [id], blocked: false };
  if (value.includes(id)) {
    if (value.length <= minPicked) return { next: [...value], blocked: true };
    return { next: value.filter((x) => x !== id), blocked: false };
  }
  return { next: [...value, id], blocked: false };
}
