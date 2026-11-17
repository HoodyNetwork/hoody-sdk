// Filter chips, pure: the chip and option shapes, a chip's value text and the count of filters on (shared by the web
// FilterChips and its terminal sibling; FilterChips.tsx re-exports them).
import type { ReactElement } from 'react';
import type { useStrings } from '../strings';
import type chipStrings from './FilterChips.strings.en.json';
import { type FilterKind, type FilterValue, parseFilter } from './DataTableViewLogic';

/** One choice of a single or multi filter. */
export interface FilterOption {
  value: string;
  label: string;
  /** How many rows have it (shown muted at the end of the option). */
  count?: number;
  /** A small decorative picture before the label (a computer's `ComputerMark`), in the option row and in the chip while
   *  the option is its value. A picture only, never text: its place is hidden from assistive technology, so the label
   *  alone stays the option's name and the chip's name. */
  mark?: ReactElement;
  /** One short line under the label in the chip's menu that says what the option keeps (resolved string). With it, the
   *  option's accessible description is this line, then its count. A segmented display shows no line. */
  description?: string;
}

/** One filter of a toolbar: its name, choices, current value in URL form and how to change it. */
export interface FilterChip {
  id: string;
  /** Chip name, e.g. "State" (resolved string). */
  label: string;
  options: readonly FilterOption[];
  /** Current value in URL form; undefined = any. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** Default 'single'. */
  kind?: FilterKind;
  /** Single filters only: a segmented control on wide toolbars. */
  display?: 'chip' | 'segmented';
  /** Always has a value (an Unread | Archive switch): no "Any", no ×, not counted, not cleared. */
  required?: boolean;
  /** Range filters: bounds, step and how a number reads. */
  range?: { min?: number; max?: number; step?: number; format?: (n: number) => string };
  /** Parsed value (useDataView passes it; derived from `value` otherwise). */
  filter?: FilterValue;
}

/** The chip strings' translate function. */
export type ChipT = ReturnType<typeof useStrings<typeof chipStrings>>;

/** The chip's value, parsed. */
export function parsed(f: FilterChip): FilterValue | undefined {
  return f.filter ?? parseFilter(f.kind ?? 'single', f.value);
}

/** The chip's value text: "Running", "Running +1", "2–8 GB", "≥ 2". */
export function chipValueText(f: FilterChip, t: ChipT): string | undefined {
  const v = parsed(f);
  if (!v) return undefined;
  const label = (id: string) => f.options.find((o) => o.value === id)?.label ?? id;
  if (v.kind === 'single') return label(v.value);
  if (v.kind === 'multi') {
    const [first, ...rest] = v.values;
    if (first === undefined) return undefined;
    return rest.length > 0 ? t('chip.more', { first: label(first), count: rest.length }) : label(first);
  }
  const fmt = f.range?.format ?? String;
  if (v.min !== undefined && v.max !== undefined) return t('chip.between', { min: fmt(v.min), max: fmt(v.max) });
  if (v.min !== undefined) return t('chip.atLeast', { min: fmt(v.min) });
  if (v.max !== undefined) return t('chip.atMost', { max: fmt(v.max) });
  return undefined;
}

/** How many filters are set; a required filter always has a value and is not counted. */
export function activeCount(filters: readonly FilterChip[]): number {
  return filters.filter((f) => !f.required && parsed(f) !== undefined).length;
}

/** A single-choice filter drawn as a segmented control on wide toolbars. */
export const isSegmentedFilter = (f: FilterChip): boolean => f.display === 'segmented' && (f.kind ?? 'single') === 'single';

/** The first filter control of a group or toolbar: a chip, a segmented control's radio or the folded Filters button. */
export const FILTER_CONTROL = '[data-chip] button, [role="radio"], [data-filters-trigger]';
