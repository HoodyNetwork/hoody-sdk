// The pure rules of the kit's choice and time fields (Select.tsx, RadioGroup.tsx and TimeField.tsx on the web,
// more.term.tsx in the terminal): an option, what an open Select lists for a query, and a typed 24-hour time. No DOM.
import type { ReactNode } from 'react';
import type { IconName } from '../icons';
import { filterItems, groupItems, type PickerItem } from '../pickers/pickerLogic';

export interface Option<V extends string = string> {
  value: V;
  label: string;
  description?: string;
  icon?: IconName;
  /** Up to three colours drawn before the label (a theme's palette); later ones are dropped. */
  swatch?: readonly string[];
  /** The label drawn in this font (a font picker's sample). */
  sample?: { fontFamily: string };
  isDisabled?: boolean;
  /** Options with the same group sit under one heading, in order of first appearance (ungrouped ones come first). */
  group?: string;
  /** RadioGroup only: shown right under this option while it is selected, indented with its label (the fields that
   *  choice needs, or a Band about it). Not part of the option's name. Select and Combobox ignore it. */
  reveal?: ReactNode;
}

/** Rows above which a Select shows its search box by itself (the kit picker's rule). */
export const SELECT_SEARCH_ABOVE = 7;
/** Rows a Select draws at once: past it the list says how many more match, and typing narrows it. */
export const SELECT_MAX_ROWS = 100;

/** An empty or blank group name is no group: a heading with no name would be an unnamed group for a screen reader. */
export const groupOf = (o: Option): string | undefined => o.group?.trim() || undefined;
export const asItem = (o: Option): PickerItem => ({ id: o.value, label: o.label, description: o.description, group: groupOf(o), isDisabled: o.isDisabled });

/** The sections a list is drawn in: matches of the query, grouped, at most `cap` rows, the picked one always among them. */
export function selectSections<V extends string>(options: readonly Option<V>[], query: string, picked: V | undefined, cap = SELECT_MAX_ROWS): { sections: { title: string | null; rows: Option<V>[] }[]; shown: number; total: number } {
  const byId = new Map(options.map((o) => [o.value as string, o]));
  const hits = filterItems(options.map(asItem), query);
  // The picked row always shows and takes one of the `cap` slots.
  const pickedHit = picked !== undefined && hits.some((h) => h.id === picked);
  const keep = new Set(hits.filter((h) => !pickedHit || h.id !== picked).slice(0, pickedHit ? cap - 1 : cap).map((h) => h.id));
  if (pickedHit) keep.add(picked as string);
  const rows = hits.filter((h) => keep.has(h.id));
  const sections = groupItems(rows).map((g) => ({ title: g.title, rows: g.rows.map((r) => byId.get(r.id) as Option<V>) }));
  return { sections, shown: rows.length, total: hits.length };
}

export const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** '930' → '09:30', '9:5' → '09:05'; anything else unchanged. */
export function normalizeTime(raw: string): string {
  const v = raw.trim();
  const m = /^(\d{1,2}):?(\d{2})$/.exec(v) ?? /^(\d{1,2}):(\d)$/.exec(v);
  if (!m) return v;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return v;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** The one ↑/↓ rule of the time fields (TimeField, DateTimeField): from `now` (minutes of the day) to the next mark of
 *  the `step` grid in direction `dir`, wrapping at midnight. 23:50 ↓ is 23:45 and ↑ is 00:00 with a 15 minute step.
 *  The marks count from 00:00 every day: past the day's last mark ↑ is 00:00, and ↓ from 00:00 is that last mark, also
 *  for a step that does not divide the day (23:55 with a 7 minute step). */
export function stepClock(now: number, dir: 1 | -1, step: number): number {
  const DAY = 1440;
  if (dir > 0) {
    const next = Math.floor(now / step) * step + step;
    return next >= DAY ? 0 : next;
  }
  const prev = Math.ceil(now / step) * step - step;
  return prev < 0 ? Math.floor((DAY - 1) / step) * step : prev;
}

/** The typed time one mark of the `step` grid up (dir 1) or down (-1) from `value` (stepClock); an unreadable value
 *  counts as 00:00. */
export function stepTime(value: string, step: number, dir: 1 | -1): string {
  const m = TIME.exec(normalizeTime(value));
  const now = m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  const next = stepClock(now, dir, step);
  return `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`;
}
