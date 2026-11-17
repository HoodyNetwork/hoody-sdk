// The pure rules of a data view (useDataView): search, filters, sort and paging over rows, plus
// how each piece is written in the URL. No React here, so every rule has a unit test
// (DataTableViewLogic.test.ts). Pages never call these directly; useDataView does.

// ── Text ──────────────────────────────────────────────────────────────────────────────

/** Case- and accent-insensitive form of a text: "Ünïcode Café" → "unicode cafe". */
export function fold(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
}

/** Every word of the query appears somewhere in the row's fields (AND, any order). */
export function matchesSearch(fields: readonly (string | number | null | undefined)[], query: string): boolean {
  const words = fold(query).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fold(fields.filter((f) => f !== null && f !== undefined && f !== '').join(' \u0000 '));
  return words.every((w) => hay.includes(w));
}

// ── Filters ───────────────────────────────────────────────────────────────────────────

/** How a filter chooses: one value, any of several, or a number range. */
export type FilterKind ='single' | 'multi' | 'range';

/** A filter's current value: one id, several ids, or a number range (either end open). */
export type FilterValue = { kind: 'single'; value: string } | { kind: 'multi'; values: readonly string[] } | { kind: 'range'; min?: number; max?: number };

/** URL form: single "running", multi "running,paused", range "2..8", "2..", "..8". */
export function parseFilter(kind: FilterKind, raw: string | undefined): FilterValue | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (kind === 'single') return { kind, value: raw };
  if (kind === 'multi') {
    const values = [...new Set(raw.split(',').map((v) => v.trim()).filter(Boolean))];
    return values.length > 0 ? { kind, values } : undefined;
  }
  const m = /^(-?\d+(?:\.\d+)?)?\.\.(-?\d+(?:\.\d+)?)?$/.exec(raw);
  if (!m || (m[1] === undefined && m[2] === undefined)) return undefined;
  const min = m[1] !== undefined ? Number(m[1]) : undefined;
  const max = m[2] !== undefined ? Number(m[2]) : undefined;
  if (min !== undefined && max !== undefined && min > max) return { kind, min: max, max: min };
  return { kind, min, max };
}

/** A filter value's URL form (parseFilter's inverse); an empty value is no parameter. */
export function formatFilter(v: FilterValue | undefined): string | undefined {
  if (!v) return undefined;
  if (v.kind === 'single') return v.value || undefined;
  if (v.kind === 'multi') return v.values.length > 0 ? v.values.join(',') : undefined;
  if (v.min === undefined && v.max === undefined) return undefined;
  return `${v.min ?? ''}..${v.max ?? ''}`;
}

/** Does a row's value pass the filter? A row value may be one id, several (tags), or a number. */
export function passesFilter(rowValue: string | number | readonly (string | number)[] | null | undefined, f: FilterValue | undefined): boolean {
  if (!f) return true;
  const list = rowValue === null || rowValue === undefined ? [] : Array.isArray(rowValue) ? (rowValue as readonly (string | number)[]) : [rowValue as string | number];
  if (f.kind === 'range') {
    const n = typeof list[0] === 'number' ? list[0] : Number(list[0]);
    if (list.length === 0 || !Number.isFinite(n)) return false;
    return (f.min === undefined || n >= f.min) && (f.max === undefined || n <= f.max);
  }
  const have = list.map(String);
  if (f.kind === 'single') return have.includes(f.value);
  return f.values.some((v) => have.includes(v));
}

// ── Sort ──────────────────────────────────────────────────────────────────────────────

/** A value compareValues can order. */
export type SortValue =string | number | boolean | Date | null | undefined;

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Natural order: numbers by value, text by locale with numeric parts ("web-2" < "web-10"),
 * empty values always last whichever the direction. */
export function compareValues(a: SortValue, b: SortValue): number {
  const empty = (v: SortValue) => v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));
  if (empty(a) || empty(b)) return empty(a) === empty(b) ? 0 : empty(a) ? 1 : -1;
  const na = a instanceof Date ? a.getTime() : typeof a === 'boolean' ? Number(a) : a;
  const nb = b instanceof Date ? b.getTime() : typeof b === 'boolean' ? Number(b) : b;
  if (typeof na === 'number' && typeof nb === 'number') return na - nb;
  return collator.compare(String(na), String(nb));
}

/** Stable sort by one key; descending flips the order but keeps empty values last. */
export function sortRows<T>(rows: readonly T[], value: ((row: T) => SortValue) | undefined, desc: boolean): T[] {
  if (!value) return [...rows];
  return rows
    .map((row, i) => ({ row, i, v: value(row) }))
    .sort((x, y) => {
      const emptyX = x.v === null || x.v === undefined || x.v === '';
      const emptyY = y.v === null || y.v === undefined || y.v === '';
      if (emptyX !== emptyY) return emptyX ? 1 : -1;
      const c = compareValues(x.v, y.v);
      return (desc ? -c : c) || x.i - y.i;
    })
    .map((x) => x.row);
}

// ── The whole pipeline ────────────────────────────────────────────────────────────────

/** How the pipeline reads a row: its searched texts, its value per filter and its sort key or comparator per column. */
export interface PipelineSpec<T> {
  search?: (row: T) => readonly (string | number | null | undefined)[];
  filters?: readonly { id: string; value: (row: T) => string | number | readonly (string | number)[] | null | undefined }[];
  sortValue?: (id: string) => ((row: T) => SortValue) | undefined;
  /** A column's own comparator (TanStack sortingFn); wins over sortValue. */
  sortCompare?: (id: string) => ((a: T, b: T) => number) | undefined;
}

/** What the pipeline applies: the search text, each filter's value and the sort. */
export interface PipelineState {
  q?: string;
  filters: Readonly<Record<string, FilterValue | undefined>>;
  sort?: { id: string; desc: boolean };
}

/** Search → filters → sort. Returns the matching rows in display order. */
export function runPipeline<T>(rows: readonly T[], spec: PipelineSpec<T>, state: PipelineState): T[] {
  const q = state.q?.trim() ?? '';
  const out = rows.filter(
    (r) => (q === '' || !spec.search || matchesSearch(spec.search(r), q)) && (spec.filters ?? []).every((f) => passesFilter(f.value(r), state.filters[f.id])),
  );
  if (!state.sort) return out;
  const cmp = spec.sortCompare?.(state.sort.id);
  if (cmp) {
    const desc = state.sort.desc;
    return out
      .map((row, i) => ({ row, i }))
      .sort((x, y) => (desc ? -cmp(x.row, y.row) : cmp(x.row, y.row)) || x.i - y.i)
      .map((x) => x.row);
  }
  return sortRows(out, spec.sortValue?.(state.sort.id), state.sort.desc);
}

/** Options for a filter, from the rows themselves (value + count), sorted naturally. */
export function optionsFromRows<T>(rows: readonly T[], value: (row: T) => string | number | readonly (string | number)[] | null | undefined): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = value(r);
    const list = v === null || v === undefined ? [] : Array.isArray(v) ? (v as readonly (string | number)[]) : [v as string | number];
    for (const x of new Set(list.map(String))) counts.set(x, (counts.get(x) ?? 0) + 1);
  }
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => compareValues(a.value, b.value));
}

/** Per-option counts for one filter: the rows that match the search and every other filter, so a
 * count says what picking that option would show (a filter never narrows its own counts). */
export function facetCounts<T>(rows: readonly T[], spec: PipelineSpec<T>, state: PipelineState, id: string): Map<string, number> {
  const counts = new Map<string, number>();
  const self = spec.filters?.find((f) => f.id === id);
  if (!self) return counts;
  const q = state.q?.trim() ?? '';
  const others = (spec.filters ?? []).filter((f) => f.id !== id);
  for (const r of rows) {
    if (q !== '' && spec.search && !matchesSearch(spec.search(r), q)) continue;
    if (!others.every((f) => passesFilter(f.value(r), state.filters[f.id]))) continue;
    const v = self.value(r);
    const list = v === null || v === undefined ? [] : Array.isArray(v) ? (v as readonly (string | number)[]) : [v as string | number];
    for (const x of new Set(list.map(String))) counts.set(x, (counts.get(x) ?? 0) + 1);
  }
  return counts;
}
